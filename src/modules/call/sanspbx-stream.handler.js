'use strict';
/**
 * SansPBX Media Stream Handler
 *
 * WebSocket endpoint: /sanspbx-stream
 * SansPBX connects here after a call is answered to stream bidirectional audio.
 *
 * Protocol:
 *   SansPBX → Backend: { event: 'answer', streamId, channelId }
 *                       { event: 'media', payload: <base64 PCM16LE 8kHz>, streamId, channelId }
 *                       { event: 'stop' }
 *   Backend → SansPBX: { event: 'reverse-media', streamId, channelId, payload: <base64 PCM16LE 8kHz>, mediaFormat: 'pcm16le-8000' }
 *                       { event: 'stop_media', streamId, channelId }
 *
 * Audio pipeline (mirrors /twilio-stream):
 *   Caller PCM16LE 8kHz → upsample 16kHz → Gemini Live
 *   Gemini PCM 24kHz → downsample 8kHz → PCM16LE → reverse-media → SansPBX → Caller
 */

const WebSocket      = require('ws');
const AgentService   = require('../voice/agent.service');
const BillingService = require('../billing/billing.service');
const { AudioCacheService } = require('../voice/audio-cache.service');
const streamMeta     = require('../../shared/stream-meta');
const logger         = require('../../utils/logger') || console;
const { buildMasterSystemInstruction } = require('../../utils/system-instruction');
const { SttService } = require('../../utils/stt.service');
const ContextCacheService = require('../../utils/context-cache.service'); // Context Caching Layer 2

// ── Audio conversion helpers ──────────────────────────────────────────────────

// PCM16LE 8kHz → PCM16LE 16kHz (duplicate each sample)
function upsample8to16(buf) {
  const samples = buf.length / 2;
  const out     = Buffer.alloc(samples * 4);
  for (let i = 0; i < samples; i++) {
    const s = buf.readInt16LE(i * 2);
    out.writeInt16LE(s, i * 4);
    out.writeInt16LE(s, i * 4 + 2);
  }
  return out;
}

// PCM16LE 24kHz → PCM16LE 8kHz (average every 3 samples)
function downsample24to8(buf) {
  const n24 = buf.length / 2;
  const n8  = Math.floor(n24 / 3);
  const out = Buffer.alloc(n8 * 2);
  for (let i = 0; i < n8; i++) {
    const s0 = buf.readInt16LE(i * 6);
    const s1 = buf.readInt16LE(i * 6 + 2);
    const s2 = buf.readInt16LE(i * 6 + 4);
    out.writeInt16LE(Math.round((s0 + s1 + s2) / 3), i * 2);
  }
  return out;
}

// ── Main handler — called per WebSocket connection ────────────────────────────
async function handleSansPBXStream(sansPbxWs, req) {
  logger.info('[SANSPBX-STREAM] New connection from SansPBX');

  // State
  let streamId       = null;
  let channelId      = null;
  let callId         = null;   // SansPBX callId
  let agentId        = null;
  let campaignId     = null;
  let geminiWs       = null;
  let liveCallDocId  = null;
  let welcomeSent    = false;
  let endCallScheduled = false;
  let billingDeducted  = false;
  let humanHasSpoken   = false;
  let silenceTimer   = null;
  let durationTimer  = null;
  const callStartTime  = Date.now();
  const transcriptParts = [];

  // Cache state
  let cacheUserId       = null;
  let cacheAgentId      = null;
  let lastCallerText     = '';
  let pendingAudioChunks = [];
  let cacheSecondsUsed   = 0;
  let geminiSecondsUsed  = 0;
  let turnStartTime      = 0;
  let sttService         = null; // initialized after agentLanguage is known

  function cleanup() {
    if (silenceTimer)  { clearTimeout(silenceTimer);  silenceTimer  = null; }
    if (durationTimer) { clearTimeout(durationTimer); durationTimer = null; }
    if (sttService)    { sttService.destroy(); sttService = null; }
  }

  // Send audio back to caller via SansPBX reverse-media
  function sendAudioToCaller(pcm24Base64) {
    if (!sansPbxWs || sansPbxWs.readyState !== WebSocket.OPEN) return;
    if (!streamId || !channelId) return;
    try {
      // Gemini sends PCM 24kHz → downsample to 8kHz for SansPBX
      const pcm24  = Buffer.from(pcm24Base64, 'base64');
      const pcm8   = downsample24to8(pcm24);
      sansPbxWs.send(JSON.stringify({
        event:       'reverse-media',
        streamId,
        channelId,
        payload:     pcm8.toString('base64'),
        mediaFormat: 'pcm16le-8000',
      }));
    } catch (e) {
      logger.error('[SANSPBX-STREAM] sendAudioToCaller error:', e.message);
    }
  }

  function resetSilenceTimer(thresholdMs) {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (endCallScheduled) return;
      logger.info('[SANSPBX-STREAM] Silence timeout — disconnecting');
      endCallScheduled = true;
      if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
      if (sansPbxWs.readyState === WebSocket.OPEN) sansPbxWs.close();
      cleanup();
    }, thresholdMs);
  }

  async function saveCallToDb(sentiment, summary, durationSec) {
    if (!liveCallDocId) return;
    try {
      const Call = require('../call/call.model');
      const transcriptText = transcriptParts.map(p => `${p.speaker}: ${p.text}`).join('\n');
      await Call.findByIdAndUpdate(liveCallDocId, {
        status:          'COMPLETED',
        endedAt:         new Date(),
        durationSeconds: durationSec,
        transcript:      transcriptText || '',
        transcriptStatus:'completed',
        callSentiment:   sentiment || 'neutral',
        callSummary:     summary   || '',
      });

      if (!billingDeducted) {
        billingDeducted = true;
        const agent = agentId ? await AgentService.getAgentById(agentId).catch(() => null) : null;
        const userId = agent?.userId?.toString();
        if (userId && durationSec > 0) {
          const billingResult = await BillingService.deductMinutes(userId, {
            durationSeconds: durationSec,
            source:          'campaign',
            callId:          liveCallDocId,
            agentId,
            campaignId:      campaignId || undefined,
            cacheSeconds:    cacheSecondsUsed,
            geminiSeconds:   geminiSecondsUsed,
          });
          logger.info('[SANSPBX-STREAM] [BILLING] Deducted for userId:', userId, 'durationSec:', durationSec);
          // Write usageCost back to Call document for display in UI
          if (billingResult?.weightedDeduction != null) {
            await Call.findByIdAndUpdate(liveCallDocId, {
              usageCost: billingResult.weightedDeduction.toFixed(4) + ' min',
            }).catch(() => {});
          }
        }
      }
    } catch (e) {
      logger.error('[SANSPBX-STREAM] saveCallToDb error:', e.message);
    }
  }

  // ── Handle SansPBX messages ───────────────────────────────────────────────
  sansPbxWs.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // ── Answer event — get routing metadata ──────────────────────────────
      if (msg.event === 'answer') {
        streamId  = msg.streamId  || msg.stream_id  || null;
        channelId = msg.channelId || msg.channel_id || null;
        callId    = msg.callId    || msg.call_id    || msg.callid || null;
        logger.info('[SANSPBX-STREAM] Answer received — streamId:', streamId, 'channelId:', channelId, 'callId:', callId);

        // Resolve agentId from streamMeta (set by call.controller.js when call was initiated)
        if (callId && streamMeta.has(callId)) {
          const meta = streamMeta.get(callId);
          agentId    = meta.agentId;
          campaignId = meta.campaignId || null;
          streamMeta.delete(callId);
          logger.info('[SANSPBX-STREAM] Resolved agentId:', agentId, 'from streamMeta');
        } else {
          logger.warn('[SANSPBX-STREAM] No streamMeta for callId:', callId, '— checking inbound routing');
        }

        // Inbound call routing — if no agentId from streamMeta, look up by called DID number
        if (!agentId) {
          try {
            const calledNum = msg.calledNumber || msg.to || msg.called || msg.did || msg.callee || null;
            if (calledNum) {
              const { VoipNumber } = require('../voip/voip.model.js');
              const norm = calledNum.replace(/[^\d+]/g, '');
              const voipNum = await VoipNumber.findOne({
                $or: [{ phoneNumber: calledNum }, { phoneNumber: norm }],
                status: 'active',
              }).lean();
              if (voipNum?.assignedAgentId) {
                agentId = voipNum.assignedAgentId.toString();
                logger.info('[SANSPBX-STREAM] Inbound routing — resolved agentId:', agentId, 'for called number:', calledNum);

                // ── Plan check — Incoming calls: Pro and Enterprise only ──────
                try {
                  const AgentModelForPlan = require('../voice/agent.mongo.model');
                  const agentDoc = await AgentModelForPlan.findOne({ agentId }).select('userId').lean();
                  if (agentDoc?.userId) {
                    const { Subscription } = require('../billing/subscription.model.js');
                    const sub  = await Subscription.findOne({ userId: agentDoc.userId }).select('plan').lean();
                    const plan = sub?.plan || 'Starter';
                    if (plan === 'Starter') {
                      logger.warn('[SANSPBX-STREAM] Inbound blocked — Starter plan userId:', agentDoc.userId);
                      agentId = null; // clear agentId → initGemini will be skipped → call drops cleanly
                    }
                  }
                } catch (planErr) {
                  logger.error('[SANSPBX-STREAM] Plan check error (allowing call):', planErr.message);
                  // Fail open — allow call through if plan check errors
                }
              }
            }
          } catch (e) {
            logger.warn('[SANSPBX-STREAM] Inbound routing lookup failed:', e.message);
          }
        }

        // Link to Call DB record
        if (callId) {
          try {
            const Call = require('../call/call.model');
            const doc  = await Call.findOne({ providerCallId: callId }).lean();
            if (doc) {
              liveCallDocId = doc._id.toString();
              logger.info('[SANSPBX-STREAM] Linked to call doc:', liveCallDocId);
            }
          } catch (e) { logger.error('[SANSPBX-STREAM] DB link error:', e.message); }
        }

        // Now connect to Gemini
        await initGemini();
        return;
      }

      // ── Media event — caller audio ───────────────────────────────────────
      if (msg.event === 'media') {
        if (!welcomeSent) return;  // audio gate
        if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) return;
        const pcm8Base64 = msg.payload;
        if (!pcm8Base64) return;

        // PCM16LE 8kHz → 16kHz → Gemini
        const pcm8  = Buffer.from(pcm8Base64, 'base64');
        const pcm16 = upsample8to16(pcm8);

        geminiWs.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: pcm16.toString('base64') }]
          }
        }));

        // STT side-channel — same PCM16 to Google STT for transcript + cache fingerprint
        if (sttService) sttService.write(pcm16);

        resetSilenceTimer(silenceThresholdMs);
        return;
      }

      // ── Stop event ───────────────────────────────────────────────────────
      if (msg.event === 'stop') {
        logger.info('[SANSPBX-STREAM] Stop received — closing');
        cleanup();
        if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
      }

    } catch (e) {
      logger.error('[SANSPBX-STREAM] Message parse error:', e.message);
    }
  });

  sansPbxWs.on('close', () => {
    logger.info('[SANSPBX-STREAM] SansPBX WS closed');
    cleanup();
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
    if (!billingDeducted) {
      const durationSec = Math.round((Date.now() - callStartTime) / 1000);
      saveCallToDb('neutral', '', durationSec).catch(e =>
        logger.error('[SANSPBX-STREAM] Hangup billing error:', e.message)
      );
    }
  });

  sansPbxWs.on('error', (err) => logger.error('[SANSPBX-STREAM] WS error:', err.message));

  // silence threshold — will be set after agent is loaded
  let silenceThresholdMs = 30000;

  // ── Connect to Gemini Live ────────────────────────────────────────────────
  async function initGemini() {
    if (!agentId) {
      logger.error('[SANSPBX-STREAM] Cannot init Gemini — no agentId');
      return;
    }

    const agent = await AgentService.getAgentById(agentId).catch(() => null);
    if (!agent) {
      logger.error('[SANSPBX-STREAM] Agent not found:', agentId);
      return;
    }

    cacheUserId   = agent.userId?.toString() || null;
    cacheAgentId  = agentId;
    const agentLanguage  = agent.language || agent.primaryLanguage || 'hi-IN';
    const rawSilence     = agent.silenceDetectionMs || 30;
    silenceThresholdMs   = rawSilence < 1000 ? rawSilence * 1000 : rawSilence;

    // ── STT side-channel — start after agentLanguage is known ─────────────────
    sttService = new SttService({ languageCode: agentLanguage });
    sttService.on('transcript', ({ text }) => {
      if (!text) return;
      lastCallerText = text;
      transcriptParts.push({ speaker: 'Human', text });
      logger.info('[SANSPBX-STREAM] [STT] Human:', text.substring(0, 80));

      // Cache lookup
      if (cacheUserId && cacheAgentId) {
        AudioCacheService.lookup(text, { agentId: cacheAgentId, userId: cacheUserId })
          .then(result => {
            if (result.hit && result.audioBuffer) {
              logger.info(`[AUDIO-CACHE] HIT — serving from cache:`, text.substring(0, 50));
              const durationMs = result.audioLengthMs || Math.round((result.audioBuffer.length / 48000) * 1000);
              cacheSecondsUsed += Math.ceil(durationMs / 1000);
              sendAudioToCaller(result.audioBuffer.toString('base64'));
            }
          })
          .catch(err => logger.error('[AUDIO-CACHE] lookup error:', err.message));
      }
      pendingAudioChunks = [];
      turnStartTime = Date.now();
    });
    sttService.start();

    // Pre-load contact call history for Client Intelligence Layer
    let agentForInstruction = agent.toObject ? agent.toObject() : { ...agent };
    try {
      if (liveCallDocId) {
        const Call = require('../call/call.model');
        const callDoc = await Call.findById(liveCallDocId).lean();
        const contactPhone = callDoc?.phoneNumber;
        if (contactPhone) {
          const history = await Call.find({
            phoneNumber: contactPhone,
            status: 'COMPLETED',
            _id: { $ne: liveCallDocId },
          }).sort({ createdAt: -1 }).limit(5)
            .select('durationSeconds sentiment summary createdAt usageCost').lean();
          if (history.length > 0) {
            agentForInstruction.clientData = {
              phoneNumber:   contactPhone,
              previousCalls: history.map(c => ({
                date:            c.createdAt,
                durationSeconds: c.durationSeconds,
                sentiment:       c.sentiment,
                summary:         c.summary,
                usageCost:       c.usageCost,
              })),
            };
            logger.info('[SANSPBX-STREAM] Client intelligence: loaded', history.length, 'previous calls for', contactPhone);
          }
        }
      }
    } catch (e) {
      logger.warn('[SANSPBX-STREAM] Client history lookup failed (non-critical):', e.message);
    }

    // Load master system instruction from shared module (imported at top)
    const masterInstruction = buildMasterSystemInstruction(agentForInstruction);

    // Context Caching Layer 2 — attempt to use cached system instruction
    const modelNameForCache  = (process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio').replace(/-latest$/, '');
    const cachedContentName  = await ContextCacheService.getOrCreate(agent, masterInstruction, modelNameForCache);

    // Gemini Live connection
    const projectId  = process.env.GOOGLE_CLOUD_PROJECT_ID || 'gen-lang-client-0348687456';
    const modelName  = process.env.GEMINI_LIVE_MODEL       || 'gemini-live-2.5-flash-native-audio';
    const geminiUrl  = `wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;

    const { GoogleAuth } = require('google-auth-library');
    const auth  = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const token = await auth.getAccessToken();

    geminiWs = new WebSocket(geminiUrl, { headers: { Authorization: `Bearer ${token}` } });

    geminiWs.on('open', () => {
      logger.info('[SANSPBX-STREAM] Gemini connected');

      geminiWs.send(JSON.stringify({
        setup: {
          model: `projects/${projectId}/locations/us-central1/publishers/google/models/${modelName}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            // NOTE: inputAudioTranscription / outputAudioTranscription removed —
            // not supported on Vertex AI v1beta1, causes setup rejection.
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: agent.voiceId || 'Aoede' } },
              languageCode: agentLanguage,
            },
          },
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
              endOfSpeechSensitivity:   'END_SENSITIVITY_LOW',
            },
          },
          // Context Caching Layer 2: use cachedContent ID if available (75% token cost reduction)
          // Falls back to inline systemInstruction if cache unsupported or unavailable
          ...(cachedContentName
            ? { cachedContent: cachedContentName }
            : { systemInstruction: { parts: [{ text: masterInstruction }] } }
          ),
          tools: [{
            functionDeclarations: [
              {
                name: 'end_call',
                description: 'Call this when the conversation has naturally concluded.',
                parameters: {
                  type: 'object',
                  properties: {
                    sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
                    summary:   { type: 'string' },
                  },
                  required: ['sentiment'],
                },
              },
              {
                name: 'voicemail_detected',
                description: 'Call this only when a voicemail system is confirmed.',
                parameters: { type: 'object', properties: {}, required: [] },
              },
            ],
          }],
        },
      }));
    });

    geminiWs.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());

        // Setup complete — send welcome
        if (msg.setupComplete !== undefined) {
          logger.info('[SANSPBX-STREAM] Setup complete');
          resetSilenceTimer(silenceThresholdMs);

          const welcomeMsg = agent.welcomeMessage;
          // Always open audio gate immediately — caller's "Hello?" must reach Gemini first
          welcomeSent = true;

          if (welcomeMsg && agent.callStartBehavior !== 'waitForHuman') {
            if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
              geminiWs.send(JSON.stringify({
                clientContent: {
                  turns: [{ role: 'user', parts: [{ text: `SYSTEM: An outbound call just connected. The recipient has answered. Do NOT speak yet — wait silently for the caller to say something first (they will say "Hello?" or "Haan?" or similar). Once they speak, respond immediately with this exact greeting: "${welcomeMsg}". After the greeting, wait for them to respond.` }] }],
                  turnComplete: true,
                },
              }));
              logger.info('[SANSPBX-STREAM] Wait-for-caller instruction sent');
            }
          }

          // Graceful conclusion at exactly 4:00 minutes (Vertex AI hard-cuts at 5:00)
          // Inject conclusion instruction with 60 seconds of runway before infrastructure cut.
          const CONCLUSION_TIMER_MS = 4 * 60 * 1000; // 240,000ms — fixed, not % of maxDuration
          durationTimer = setTimeout(() => {
            if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
              geminiWs.send(JSON.stringify({
                clientContent: {
                  turns: [{ role: 'user', parts: [{ text: 'SYSTEM: The call has been running for 4 minutes. You must now conclude this conversation gracefully within the next 60 seconds. Summarise what was discussed, confirm any next steps, deliver a warm and complete closing, then call end_call. Do not start any new topics. Do not ask new questions. Bring the conversation to a natural and respectful close now.' }] }],
                  turnComplete: true,
                },
              }));
              logger.info('[SANSPBX-STREAM] 4-minute conclusion instruction sent to Gemini');
            }
          }, CONCLUSION_TIMER_MS);
          return;
        }

        // Tool calls
        if (msg.toolCall && msg.toolCall.functionCalls) {
          for (const fc of msg.toolCall.functionCalls) {
            const callDurationSec = Math.round((Date.now() - callStartTime) / 1000);

            if (fc.name === 'end_call' && !endCallScheduled) {
              if (callDurationSec < 45) {
                // Too early — reject
                geminiWs.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: fc.id, name: 'end_call', response: { output: 'Too early to end. Continue the conversation.' } }] } }));
                continue;
              }
              endCallScheduled = true;
              const sentiment = fc.args?.sentiment || 'neutral';
              const summary   = fc.args?.summary   || '';

              // Acknowledge without telling Gemini to speak again — it already spoke
              // the closing before calling end_call. Saying "speak summary now" causes repeat.
              geminiWs.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: fc.id, name: 'end_call', response: { output: 'Acknowledged. Call ending.' } }] } }));

              const hangupDelay = (sentiment === 'positive' || sentiment === 'neutral') ? 10000 : 5000;
              setTimeout(async () => {
                await saveCallToDb(sentiment, summary, callDurationSec);
                cleanup();
                if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
                if (sansPbxWs.readyState === WebSocket.OPEN) {
                  sansPbxWs.send(JSON.stringify({ event: 'stop_media', streamId, channelId }));
                  sansPbxWs.close();
                }
              }, hangupDelay);
            }

            if (fc.name === 'voicemail_detected') {
              logger.info('[SANSPBX-STREAM] Voicemail detected — hanging up');
              endCallScheduled = true;
              cleanup();
              if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
              if (sansPbxWs.readyState === WebSocket.OPEN) sansPbxWs.close();
            }
          }
          return;
        }

        // NOTE: inputTranscription / outputTranscription not used — not supported on Vertex AI v1.
        // Caller transcript is handled by sttService (Google STT side-channel, wired above).

        // Gemini audio → send to caller + capture any text parts as Agent transcript
        if (msg.serverContent?.modelTurn?.parts) {
          for (const part of msg.serverContent.modelTurn.parts) {
            if (part.inlineData?.data) {
              sendAudioToCaller(part.inlineData.data);
              pendingAudioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
            }
            // Capture Gemini text output as Agent transcript (sent alongside audio in v1beta1)
            if (part.text && part.text.trim()) {
              transcriptParts.push({ speaker: 'Agent', text: part.text.trim() });
            }
          }
        }

        // Turn complete — save to cache
        if (msg.serverContent?.turnComplete && lastCallerText && pendingAudioChunks.length > 0) {
          const combinedAudio = Buffer.concat(pendingAudioChunks);
          const turnMs = Date.now() - turnStartTime;
          geminiSecondsUsed += Math.ceil(turnMs / 1000);

          if (cacheUserId && cacheAgentId && lastCallerText) {
            AudioCacheService.recordHit(lastCallerText, {
              agentId: cacheAgentId, userId: cacheUserId, language: agentLanguage,
            }).then(({ fingerprint, hitCount, shouldCache }) => {
              if (shouldCache && fingerprint && combinedAudio.length > 0) {
                const audioLengthMs = Math.round((combinedAudio.length / 48000) * 1000);
                AudioCacheService.saveAudioToCache(fingerprint, combinedAudio, {
                  userId: cacheUserId, agentId: cacheAgentId, audioLengthMs,
                });
              }
            }).catch(err => logger.error('[AUDIO-CACHE] recordHit error:', err.message));
          }

          pendingAudioChunks = [];
          lastCallerText = '';
        }

      } catch (e) {
        logger.error('[SANSPBX-STREAM] Gemini message error:', e.message);
      }
    });

    geminiWs.on('error', (err) => logger.error('[SANSPBX-STREAM] Gemini error:', err.message));
    geminiWs.on('close', () => {
      logger.info('[SANSPBX-STREAM] Gemini closed');
      cleanup();
      if (sansPbxWs.readyState === WebSocket.OPEN) sansPbxWs.close();
    });
  }
}

module.exports = { handleSansPBXStream };
