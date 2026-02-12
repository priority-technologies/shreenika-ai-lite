import Call from "./call.model.js";
import Agent from "../agent/agent.model.js";
import VoiceSession from "../voice/voice_sessions.model.js";
import Usage from "../usage/usage.model.js";
import { getTwilioClient } from "../../config/twilio.client.js";
import { ProviderFactory } from "./providers/ProviderFactory.js";
import { getAgentProviderOrFallback, getAgentPhoneNumber } from "./helpers/getAgentProvider.js";
import { VoicePipeline } from "../voice/voicePipeline.js";

const getMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * OUTBOUND CALL - Routes through agent's assigned VOIP provider
 */
export const startOutboundCall = async (req, res) => {
  try {
    const { agentId, leadId, toPhone } = req.body;

    if (!toPhone || !agentId) {
      return res.status(400).json({ error: "Missing required fields: agentId and toPhone are required" });
    }

    // Normalize phone to E.164 format
    let normalizedPhone = toPhone.replace(/[\s\-\(\)\.]/g, '');
    if (!normalizedPhone.startsWith('+')) {
      normalizedPhone = '+1' + normalizedPhone;
    }

    console.log(`📱 Phone normalized: "${toPhone}" → "${normalizedPhone}"`);

    // Get agent's assigned VOIP provider
    const voipProvider = await getAgentProviderOrFallback(agentId);

    if (!voipProvider) {
      return res.status(400).json({
        error: "No VOIP provider assigned to this agent. Please assign a phone number in Settings > VOIP."
      });
    }

    // Get agent's assigned phone number (DID)
    const fromPhone = await getAgentPhoneNumber(agentId);

    if (!fromPhone) {
      // Fallback to env var if available (for backward compatibility)
      if (process.env.TWILIO_FROM_NUMBER && voipProvider.provider === 'Twilio') {
        console.warn(`⚠️ Agent ${agentId} has no assigned phone number, using system TWILIO_FROM_NUMBER`);
      } else {
        return res.status(400).json({
          error: "No phone number (DID) assigned to this agent."
        });
      }
    }

    // Validate PUBLIC_BASE_URL
    if (!process.env.PUBLIC_BASE_URL) {
      console.error("❌ PUBLIC_BASE_URL env var is not set");
      return res.status(500).json({ error: "Public webhook URL not configured." });
    }

    // Create call record
    const call = await Call.create({
      userId: req.user.id,
      agentId,
      leadId,
      direction: "OUTBOUND",
      status: "INITIATED",
      voipProvider: voipProvider.provider
    });

    // Instantiate the correct provider
    let provider;
    try {
      provider = ProviderFactory.createProvider(voipProvider);
    } catch (err) {
      console.error(`❌ Failed to create provider: ${err.message}`);
      call.status = "FAILED";
      await call.save();
      return res.status(500).json({ error: `Provider error: ${err.message}` });
    }

    // Initiate call via provider abstraction
    console.log(`📞 Starting outbound call via ${voipProvider.provider}: to=${normalizedPhone}, from=${fromPhone || 'system'}`);

    const callResult = await provider.initiateCall({
      toPhone: normalizedPhone,
      fromPhone: fromPhone || process.env.TWILIO_FROM_NUMBER,
      webhookUrl: `${process.env.PUBLIC_BASE_URL}/twilio/voice`,
      statusCallbackUrl: `${process.env.PUBLIC_BASE_URL}/twilio/status`
    });

    // Update call record with provider's call ID
    call.twilioCallSid = callResult.callSid;
    call.providerCallId = callResult.providerCallId;
    call.voipProvider = callResult.provider;
    await call.save();

    console.log(`✅ Call initiated: SID=${callResult.callSid}, Provider=${callResult.provider}`);
    res.json(call);
  } catch (err) {
    console.error("❌ Outbound call error:", err.message);
    console.error("Full error:", err);
    res.status(500).json({ error: err.message || "Outbound call failed" });
  }
};

/**
 * TWILIO VOICE - Static fallback
 */
export const twilioVoiceFallback = (_req, res) => {
  res.type("text/xml");
  res.send(`
    <Response>
      <Say voice="alice">Hello. This is Shreenika AI calling you.</Say>
    </Response>
  `);
};

/**
 * TWILIO VOICE - Real-time AI conversation via Media Streams
 * Connects the call to Gemini Live API for bidirectional audio
 */
export const twilioVoice = async (req, res) => {
  try {
    const { CallSid } = req.body;

    // Find the call to get agent info
    const call = await Call.findOne({ twilioCallSid: CallSid });

    if (!call) {
      console.error(`❌ Call not found for SID: ${CallSid}`);
      // Fall back to static response
      return twilioVoiceFallback(req, res);
    }

    // Check if real-time voice is enabled (PUBLIC_BASE_URL must be set)
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;

    if (!publicBaseUrl) {
      console.warn("⚠️ PUBLIC_BASE_URL not set, using static voice response");
      return twilioVoiceFallback(req, res);
    }

    // Return TwiML with Media Stream for real-time AI conversation
    // The WebSocket URL must be wss:// for production
    const wsUrl = publicBaseUrl.replace('https://', 'wss://').replace('http://', 'ws://');

    console.log(`🎙️ Starting Media Stream for call: ${CallSid}`);

    res.type("text/xml");
    res.send(`
      <Response>
        <Connect>
          <Stream url="${wsUrl}/media-stream/${CallSid}">
            <Parameter name="callSid" value="${CallSid}" />
          </Stream>
        </Connect>
      </Response>
    `);

  } catch (error) {
    console.error("❌ twilioVoice error:", error.message);
    twilioVoiceFallback(req, res);
  }
};

/**
 * STATUS CALLBACK
 */
export const twilioStatus = async (req, res) => {
  try {
    const {
      CallSid,
      CallStatus,
      CallDuration,
      RecordingUrl
    } = req.body;

    const call = await Call.findOne({ twilioCallSid: CallSid });
    if (!call) return res.sendStatus(200);

    call.status = CallStatus.toUpperCase();

    if (CallStatus === "completed") {
      call.durationSeconds = Number(CallDuration || 0);
      call.recordingUrl = RecordingUrl || null;
      await call.save();
      import("../call/call.processor.js").then(({ processCompletedCall }) => {
        processCompletedCall(call._id);
      });

      const minutes = Math.ceil(call.durationSeconds / 60);
      const month = getMonthKey();

      await Usage.findOneAndUpdate(
        { userId: call.userId, month },
        { $inc: { voiceMinutesUsed: minutes } },
        { upsert: true }
      );
    } else {
      await call.save();
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Twilio status error:", err.message);
    res.sendStatus(200);
  }
};

/**
 * MEDIA STREAM HANDLER - WebSocket for real-time voice
 * Receives audio from Twilio, processes through VoicePipeline (STT→Gemini→TTS)
 */
export const handleMediaStream = async (req, res, ws) => {
  let callSid;
  let voicePipeline;
  let voiceSession;
  let agent;

  try {
    callSid = req.params.callSid;
    console.log(`🎤 Media Stream connected: ${callSid}`);

    // Find call and agent
    const call = await Call.findOne({ twilioCallSid: callSid });
    if (!call) {
      console.error(`❌ Call not found: ${callSid}`);
      ws.close(1000, 'Call not found');
      return;
    }

    // Get agent configuration
    agent = await Agent.findById(call.agentId);
    if (!agent) {
      console.error(`❌ Agent not found: ${call.agentId}`);
      ws.close(1000, 'Agent not found');
      return;
    }

    // Initialize VoicePipeline for this agent
    voicePipeline = new VoicePipeline(agent, {
      sessionId: `call_${callSid}`
    });

    // Start pipeline
    const startResult = await voicePipeline.start();
    if (!startResult.success) {
      console.error(`❌ Failed to start VoicePipeline: ${startResult.error}`);
      ws.close(1000, 'Pipeline initialization failed');
      return;
    }

    // Create voice session record
    voiceSession = await VoiceSession.create({
      sessionId: voicePipeline.sessionId,
      callId: call._id,
      agentId: agent._id,
      userId: call.userId,
      voiceProfile: agent.voiceProfile,
      speechSettings: agent.speechSettings,
      status: 'active',
      startedAt: new Date()
    });

    console.log(`✅ VoicePipeline initialized for agent: ${agent.name}`);

    // Handle WebSocket messages from Twilio
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);

        // Twilio sends audio events
        if (data.event === 'media') {
          const audioBuffer = Buffer.from(data.media.payload, 'base64');

          // Process through voice pipeline
          const cycleResult = await voicePipeline.processConversationCycle(audioBuffer);

          if (cycleResult.success) {
            // Update voice session with transcript
            voiceSession.transcript.push(
              {
                role: 'user',
                text: cycleResult.transcript,
                confidence: cycleResult.confidence
              },
              {
                role: 'assistant',
                text: cycleResult.response
              }
            );

            // Send audio response back to Twilio
            if (cycleResult.audioOutput) {
              ws.send(
                JSON.stringify({
                  event: 'media',
                  streamSid: data.streamSid,
                  media: {
                    payload: cycleResult.audioOutput.toString('base64')
                  }
                })
              );
            }

            // Log metrics
            console.log(
              `📊 Cycle complete - STT: ${cycleResult.metrics.sttLatency}ms, LLM: ${cycleResult.metrics.llmLatency}ms, TTS: ${cycleResult.metrics.ttsLatency}ms`
            );
          } else {
            console.error(`❌ Cycle error: ${cycleResult.error}`);
          }
        }
      } catch (error) {
        console.error('❌ Error processing media:', error.message);
      }
    });

    // Handle WebSocket close
    ws.on('close', async () => {
      try {
        console.log(`📞 Media Stream closed: ${callSid}`);

        // End pipeline session
        const sessionSnapshot = await voicePipeline.end();

        // Update voice session
        voiceSession.status = 'completed';
        voiceSession.endedAt = new Date();
        voiceSession.metrics = sessionSnapshot.metrics;
        voiceSession.transcript = sessionSnapshot.conversationHistory.map((msg) => ({
          role: msg.role,
          text: msg.content
        }));
        await voiceSession.save();

        console.log(`✅ Voice session saved: ${voiceSession._id}`);
      } catch (error) {
        console.error('Error ending voice session:', error.message);
      }
    });

    // Handle WebSocket errors
    ws.on('error', async (error) => {
      console.error('❌ WebSocket error:', error.message);

      if (voiceSession) {
        voiceSession.status = 'failed';
        voiceSession.endReason = error.message;
        voiceSession.endedAt = new Date();
        await voiceSession.save();
      }
    });
  } catch (error) {
    console.error('❌ Media stream handler error:', error.message);
    ws.close(1011, 'Internal server error');

    if (voiceSession) {
      voiceSession.status = 'failed';
      voiceSession.endReason = error.message;
      await voiceSession.save();
    }
  }
};
