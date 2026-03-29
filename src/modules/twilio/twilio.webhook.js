'use strict';

/**
 * Twilio Webhook Handlers
 * 2026-03-22
 *
 * POST /twilio/voice         — TwiML response when outbound call is answered
 * POST /twilio/status        — StatusCallback → processCampaignNextCall (slot refill)
 * POST /twilio/recording-status — Recording URL persistence
 *
 * Note: These endpoints are intentionally unauthenticated.
 *       Twilio cannot send JWT tokens. For production, add Twilio
 *       signature validation using twilio.validateExpressRequest().
 */

const express    = require('express');
const router     = express.Router();
const twilio     = require('twilio');
const streamMeta = require('../../shared/stream-meta.js');
const { processCampaignNextCall } = require('../campaign/campaign-worker.service.js');

// Lazy-load io to avoid circular dependency (server.js exports io after routes are mounted)
function getIo() {
  try { return require('../../server.js').io; } catch (_) { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /twilio/voice
// Called by Twilio when our outbound call is answered.
// Returns TwiML that either:
//   a) Connects to Twilio Media Streams → our /twilio-stream WebSocket (full AI audio)
//   b) Falls back to <Say> + <Record> if PUBLIC_BASE_URL not configured
// ─────────────────────────────────────────────────────────────────────────────
// ── Build personalised greeting using lead first name + language rule ─────────
// Rules:
//   Hindi  → "<FirstName> ji, ..."
//   English → "Mr./Ms. <FirstName>, ..."
//   Fallback → "<FirstName>, ..." or original welcomeMsg if no name
function buildGreeting(welcomeMsg, leadFirstName, agentLanguage) {
  if (!leadFirstName) return welcomeMsg;

  const lang = (agentLanguage || '').toLowerCase();
  let nameGreeting;

  if (lang.includes('hindi')) {
    nameGreeting = `${leadFirstName} ji`;
  } else if (lang.includes('english')) {
    nameGreeting = `Mr. ${leadFirstName}`;
  } else {
    nameGreeting = leadFirstName;
  }

  // Replace first occurrence of generic greetings with personalised version
  // Pattern: "Hello," / "Hi," / "Namaste," at the start → inject name after it
  const personalised = welcomeMsg.replace(
    /^(Hello|Hi|Namaste|Hey)[,.]?\s*/i,
    (match) => `${match}${nameGreeting}, `
  );

  // If the replacement didn't fire (no standard opener), prepend the name
  if (personalised === welcomeMsg) {
    return `${nameGreeting}, ${welcomeMsg}`;
  }

  return personalised;
}

router.post('/voice', async (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response      = new VoiceResponse();

  let { agentId, campaignId, leadName } = req.query;
  const leadFirstName = leadName ? decodeURIComponent(leadName) : '';
  const baseUrl = process.env.PUBLIC_BASE_URL || '';
  const twilioCallSid = req.body && req.body.CallSid;
  const callDirection = req.body && req.body.Direction; // 'inbound' or 'outbound-api'

  // ── Inbound call routing ───────────────────────────────────────────────────
  // For inbound calls, agentId is not in query string — look up from 'To' number
  if (!agentId && callDirection === 'inbound' && req.body.To) {
    try {
      const { VoipNumber } = require('../voip/voip.model.js');
      // Normalize: strip non-digits except leading +
      const toNorm = req.body.To.replace(/[^\d+]/g, '');
      const voipNum = await VoipNumber.findOne({
        $or: [
          { phoneNumber: req.body.To },
          { phoneNumber: toNorm },
        ],
        status: 'active',
      }).lean();
      if (voipNum?.assignedAgentId) {
        agentId = voipNum.assignedAgentId.toString();
        console.log('[TWILIO/VOICE] Inbound call → resolved agentId:', agentId, 'from To:', req.body.To);

        // ── Plan check — Incoming calls: Pro and Enterprise only ──────────────
        // Starter plan users cannot receive inbound calls — reject with polite message
        try {
          const AgentModelForPlan = require('../voice/agent.mongo.model');
          const agentDoc = await AgentModelForPlan.findOne({ agentId }).select('userId').lean();
          if (agentDoc?.userId) {
            const { Subscription } = require('../billing/subscription.model.js');
            const sub = await Subscription.findOne({ userId: agentDoc.userId }).select('plan').lean();
            const plan = sub?.plan || 'Starter';
            if (plan === 'Starter') {
              console.warn('[TWILIO/VOICE] Inbound blocked — Starter plan userId:', agentDoc.userId);
              // Return TwiML that politely rejects the call
              const rejectResponse = new (require('twilio').twiml.VoiceResponse)();
              rejectResponse.say(
                { voice: 'Polly.Aditi', language: 'hi-IN' },
                'Sorry, incoming calls are not available on your current plan. Please upgrade to Pro or Enterprise to enable this feature.'
              );
              rejectResponse.hangup();
              res.type('text/xml');
              return res.send(rejectResponse.toString());
            }
          }
        } catch (planErr) {
          console.error('[TWILIO/VOICE] Plan check error (allowing call):', planErr.message);
          // On plan check error — allow the call through (fail open, not fail closed)
        }

      } else {
        console.warn('[TWILIO/VOICE] Inbound call — no agent assigned to number:', req.body.To);
      }
    } catch (e) {
      console.error('[TWILIO/VOICE] Inbound agent lookup error:', e.message);
    }
  }

  // Store agentId+campaignId keyed by Twilio CallSid.
  // Cloud Run strips query-string from WS upgrade requests, so the wssTwilio handler
  // cannot read agentId from req.url. It looks up this Map from the 'start' message instead.
  if (twilioCallSid && agentId) {
    streamMeta.set(twilioCallSid, { agentId, campaignId: campaignId || '', leadName: leadFirstName || '' });
    console.log('[TWILIO/VOICE] Stored meta for CallSid:', twilioCallSid, '→ agentId:', agentId, '| leadName:', leadFirstName || '(none)', '| direction:', callDirection || 'outbound');
    // Auto-expire after 5 minutes to prevent memory leak
    setTimeout(() => streamMeta.delete(twilioCallSid), 5 * 60 * 1000);
  }

  try {
    let welcomeMsg   = 'Hello, this is an AI voice assistant. How can I help you today?';
    let agentLanguage = 'English (US)';

    // Try to get agent-specific welcome message + language
    if (agentId) {
      try {
        const AgentService = require('../voice/agent.service.js');
        const agent        = await AgentService.getAgentById(agentId);
        if (agent) {
          if (agent.welcomeMessage) welcomeMsg   = agent.welcomeMessage;
          if (agent.language)       agentLanguage = agent.language;
        }
      } catch (_) { /* non-critical */ }
    }

    // Apply lead name + language rule to greeting
    welcomeMsg = buildGreeting(welcomeMsg, leadFirstName, agentLanguage);
    console.log(`[TWILIO/VOICE] Greeting: "${welcomeMsg}" | lead="${leadFirstName}" | lang="${agentLanguage}"`);

    const mediaStreamsEnabled = process.env.ENABLE_MEDIA_STREAMS === 'true';

    if (baseUrl && mediaStreamsEnabled) {
      // ── Full AI audio mode: connect Twilio Media Streams to our Gemini proxy ──
      // wss:// is required for Twilio streams (secure WebSocket)
      // Enable via ENABLE_MEDIA_STREAMS=true in .env (requires /twilio-stream WS handler)
      const wsHost    = baseUrl.replace(/^https?:\/\//, '');
      const streamUrl = `wss://${wsHost}/twilio-stream?agentId=${agentId || ''}&campaignId=${campaignId || ''}&leadName=${encodeURIComponent(leadFirstName)}`;

      // Start recording via Twilio REST API alongside the Media Stream.
      // <Record> verb is NOT compatible with <Connect><Stream> in the same TwiML response,
      // so we use the Recordings REST API to start dual-channel recording separately.
      // Recording URL is delivered via /twilio/recording-status callback.
      const recCb = baseUrl ? `${baseUrl}/twilio/recording-status` : '/twilio/recording-status';

      const connect = response.connect();
      connect.stream({ url: streamUrl });

      // Trigger recording asynchronously via REST API after stream connects
      const twilioCallSid = req.body.CallSid;
      if (twilioCallSid && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        setTimeout(async () => {
          try {
            await twilio.calls(twilioCallSid).recordings.create({
              recordingStatusCallback:       recCb,
              recordingStatusCallbackMethod: 'POST',
            });
            console.log(`[TWILIO/VOICE] Recording started for CallSid: ${twilioCallSid}`);
          } catch (recErr) {
            console.error('[TWILIO/VOICE] Recording start error:', recErr.message);
          }
        }, 2000); // 2s delay — wait for Media Stream to fully connect before starting recording
      }

      console.log(`[TWILIO/VOICE] Connecting Media Stream → ${streamUrl}`);
    } else {
      // ── Basic voice mode: Say personalised welcome message + record the call ──
      // Default mode until Gemini Media Streams bridge is built.
      const recCb = baseUrl
        ? `${baseUrl}/twilio/recording-status`
        : '/twilio/recording-status';

      response.say({ voice: 'Polly.Aditi', language: 'en-IN' }, welcomeMsg);
      response.pause({ length: 1 });
      response.record({
        maxLength:                     3600,
        playBeep:                      false,
        recordingStatusCallback:       recCb,
        recordingStatusCallbackMethod: 'POST',
      });
      console.log(`[TWILIO/VOICE] Basic voice mode — <Say>+<Record> | mediaStreams=${mediaStreamsEnabled}`);
    }
  } catch (err) {
    console.error('[TWILIO/VOICE] Error building TwiML:', err.message);
    response.say('Thank you for your time. Goodbye.');
    response.hangup();
  }

  res.type('text/xml');
  res.send(response.toString());
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /twilio/status
// Twilio StatusCallback — fires on every call state change.
// Terminal statuses (completed, failed, busy, no-answer, canceled) trigger
// slot refill in the campaign worker.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/status', async (req, res) => {
  const {
    CallSid,
    CallStatus,
    CallDuration,
    RecordingUrl,
    To,
    From,
    Direction,
  } = req.body;

  const logStatus = CallDuration ? `${CallStatus} (${CallDuration}s)` : CallStatus;
  console.log(`[TWILIO/STATUS] ${CallSid} → ${logStatus} | ${From} → ${To}`);

  try {
    await processCampaignNextCall(CallSid, CallStatus, {
      callDuration: CallDuration,
      recordingUrl: RecordingUrl,
      to:           To,
      from:         From,
      direction:    Direction,
    });
  } catch (err) {
    console.error('[TWILIO/STATUS] Error processing status callback:', err.message);
    // Always return 200 to Twilio — a non-200 causes Twilio to retry
  }

  // Emit real-time dashboard update for any terminal or in-progress status
  try {
    const io = getIo();
    if (io) {
      io.emit('CALL_STATUS_UPDATE', { callSid: CallSid, status: CallStatus, duration: CallDuration });
    }
  } catch (_) {}

  res.status(200).send('OK');
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /twilio/recording-status
// Twilio recording status callback.
// Updates the call record with the MP3 recording URL.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/recording-status', async (req, res) => {
  const {
    CallSid,
    RecordingUrl,
    RecordingStatus,
    RecordingDuration,
    RecordingSid,
  } = req.body;

  console.log(`[TWILIO/REC] ${CallSid} → ${RecordingStatus}`);

  if (RecordingStatus === 'completed' && RecordingUrl) {
    try {
      const Call = require('../call/call.model.js');
      await Call.findOneAndUpdate(
        { twilioCallSid: CallSid },
        {
          recordingUrl:               RecordingUrl + '.mp3',
          recordingStatus:            'completed',
          'recordingMetadata.duration': Number(RecordingDuration) || 0,
          'recordingMetadata.format':   'mp3',
        }
      );
      console.log(`[TWILIO/REC] Saved recording for ${CallSid}: ${RecordingUrl}.mp3`);
    } catch (err) {
      console.error('[TWILIO/REC] Error saving recording URL:', err.message);
    }
  }

  res.status(200).send('OK');
});

module.exports = router;
