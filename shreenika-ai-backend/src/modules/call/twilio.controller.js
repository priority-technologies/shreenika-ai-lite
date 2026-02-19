import Call from "./call.model.js";
import Agent from "../agent/agent.model.js";
import VoiceSession from "../voice/voice_sessions.model.js";
import Usage from "../usage/usage.model.js";
import { getTwilioClient } from "../../config/twilio.client.js";
import { ProviderFactory } from "./providers/ProviderFactory.js";
import { getAgentProviderOrFallback, getAgentPhoneNumber } from "./helpers/getAgentProvider.js";
import { VoicePipeline } from "../voice/voicePipeline.js";
import { CallControlService, createCallControl } from "./call.control.service.js";
import { createTTSService, shouldUseTTS } from "../voice/tts.service.js";

const getMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * OUTBOUND CALL - Routes through agent's assigned VOIP provider
 */
export const startOutboundCall = async (req, res) => {
  let voipProvider = null;
  let call = null;

  try {
    const { agentId, leadId, toPhone } = req.body;

    if (!toPhone || !agentId) {
      return res.status(400).json({ error: "Missing required fields: agentId and toPhone are required" });
    }

    // Clean up phone number (remove formatting characters)
    // Provider-specific formatting happens in each provider's initiateCall()
    // Each provider handles its own format: SansPBX (7 digits), Twilio (E.164), etc.
    let cleanPhone = toPhone.replace(/[\s\-\(\)\.]/g, '');

    console.log(`📱 Phone cleaned: "${toPhone}" → "${cleanPhone}" (provider will format based on its type)`);

    // Get agent's assigned VOIP provider
    console.log(`\n📱 [startOutboundCall] TRACING CALL EXECUTION FOR AGENT: ${agentId}`);
    console.log(`📱 [startOutboundCall] ├─ To Phone: ${toPhone}`);
    console.log(`📱 [startOutboundCall] ├─ Lead ID: ${leadId || 'none'}`);
    console.log(`📱 [startOutboundCall] └─ Fetching assigned VOIP provider...`);

    voipProvider = await getAgentProviderOrFallback(agentId);

    if (!voipProvider) {
      console.error(`❌ [startOutboundCall] No VOIP provider found (not even fallback)`);
      return res.status(400).json({
        error: "No VOIP provider assigned to this agent. Please connect a VOIP provider in Settings > VOIP Integration."
      });
    }

    console.log(`✅ [startOutboundCall] Provider: ${voipProvider.provider}`);
    if (voipProvider.provider !== 'Twilio') {
      console.log(`   └─ (This is the assigned provider, not a fallback)`);
    }

    // Get agent's assigned phone number (DID)
    console.log(`📱 [startOutboundCall] Fetching assigned DID for agent...`);
    const fromPhone = await getAgentPhoneNumber(agentId);

    if (fromPhone) {
      console.log(`✅ [startOutboundCall] DID found: ${fromPhone}`);
    } else {
      console.log(`⚠️  [startOutboundCall] No DID assigned to agent`);

      // CRITICAL: Non-Twilio providers REQUIRE a DID, cannot use system fallback
      if (voipProvider.provider !== 'Twilio') {
        console.error(`❌ [startOutboundCall] ${voipProvider.provider} requires DID but agent has none`);
        return res.status(400).json({
          error: `${voipProvider.provider} provider requires a DID (phone number) assigned to this agent. ` +
                 `Please assign a phone number in Settings > VOIP Integration > Connected Phone Numbers.`
        });
      }

      // Only Twilio can use system-wide fallback
      if (!process.env.TWILIO_FROM_NUMBER) {
        console.error(`❌ [startOutboundCall] No DID assigned and no TWILIO_FROM_NUMBER env var`);
        return res.status(400).json({
          error: "No phone number (DID) assigned to this agent and no system TWILIO_FROM_NUMBER configured."
        });
      }

      console.warn(`⚠️  [startOutboundCall] Using fallback TWILIO_FROM_NUMBER for Twilio provider`);
      // Note: fromPhone remains null, will use fallback in initiateCall() below
    }

    // Validate PUBLIC_BASE_URL
    if (!process.env.PUBLIC_BASE_URL) {
      console.error("❌ PUBLIC_BASE_URL env var is not set");
      return res.status(500).json({ error: "Public webhook URL not configured." });
    }

    // Create call record
    call = await Call.create({
      userId: req.user.id,
      agentId,
      leadId,
      direction: "OUTBOUND",
      status: "INITIATED",
      voipProvider: voipProvider.provider
    });

    // Initialize call control (40% priority - duration, silence, voicemail enforcement)
    const callControl = await createCallControl(call._id, agentId);
    console.log(`🎛️  [startOutboundCall] Call Control initialized`);

    // Initialize TTS service if agent has custom voice settings (60% priority)
    const agent = await Agent.findById(agentId);
    const ttsService = shouldUseTTS(agent) ? await createTTSService(agent) : null;
    if (ttsService) {
      console.log(`🎤 [startOutboundCall] TTS Service initialized with characteristics: ${agent.characteristics.join(', ') || 'default'}`);
    } else {
      console.log(`🎤 [startOutboundCall] Using Gemini Live native voice (no TTS customization)`);
    }

    // Store call control & TTS in call metadata for mediastream handler
    call.callControlConfig = {
      maxCallDuration: callControl.maxCallDuration,
      silenceDetectionMs: callControl.silenceDetectionMs,
      voicemailDetection: callControl.voicemailDetection
    };
    call.ttsConfig = ttsService ? ttsService.getAudioProfile() : null;
    await call.save();

    // Instantiate the correct provider
    console.log(`📱 [startOutboundCall] Creating provider instance via ProviderFactory...`);
    let provider;
    try {
      provider = await ProviderFactory.createProvider(voipProvider);
      console.log(`✅ [startOutboundCall] Provider instance created successfully`);
    } catch (err) {
      console.error(`❌ [startOutboundCall] Provider creation failed: ${err.message}`);
      call.status = "FAILED";
      await call.save();
      return res.status(500).json({
        error: `VOIP Provider Error: ${err.message}. Please check your VOIP credentials in Settings > VOIP Integration.`
      });
    }

    // Initiate call via provider abstraction
    const effectiveFromPhone = fromPhone || process.env.TWILIO_FROM_NUMBER;
    console.log(`\n📞 [startOutboundCall] INITIATING CALL`);
    console.log(`   ├─ Provider: ${voipProvider.provider}`);
    console.log(`   ├─ From: ${effectiveFromPhone}`);
    console.log(`   ├─ To: ${cleanPhone}`);
    console.log(`   └─ Calling provider.initiateCall()...\n`);

    const callResult = await provider.initiateCall({
      toPhone: cleanPhone,
      fromPhone: effectiveFromPhone,
      webhookUrl: `${process.env.PUBLIC_BASE_URL}/twilio/voice`,
      statusCallbackUrl: `${process.env.PUBLIC_BASE_URL}/twilio/status`
    });

    // CRITICAL: Validate callResult has required fields before saving
    if (!callResult || typeof callResult !== 'object') {
      throw new Error(`Provider returned invalid response: ${JSON.stringify(callResult)}`);
    }

    if (!callResult.callSid) {
      throw new Error(`Provider response missing callSid. Got: ${JSON.stringify(callResult)}`);
    }

    if (!callResult.providerCallId) {
      throw new Error(`Provider response missing providerCallId. Got: ${JSON.stringify(callResult)}`);
    }

    if (!callResult.provider) {
      throw new Error(`Provider response missing provider field. Got: ${JSON.stringify(callResult)}`);
    }

    // Update call record with provider's call ID
    call.twilioCallSid = callResult.callSid;
    call.providerCallId = callResult.providerCallId;
    call.voipProvider = callResult.provider;
    await call.save();

    console.log(`\n✅ [startOutboundCall] CALL INITIATED SUCCESSFULLY`);
    console.log(`   ├─ Call SID: ${callResult.callSid}`);
    console.log(`   ├─ Provider: ${callResult.provider}`);
    console.log(`   └─ Provider Call ID: ${callResult.providerCallId}\n`);

    res.json(call);
  } catch (err) {
    console.error("\n❌ [startOutboundCall] CALL EXECUTION FAILED");
    console.error(`   ├─ Error: ${err.message}`);
    console.error(`   ├─ Provider: ${voipProvider?.provider || 'unknown'}`);
    console.error(`   └─ Full error:`, err.stack);

    // Update call record with failure status
    try {
      if (call && call._id) {
        const failedCall = await Call.findById(call._id);
        if (failedCall) {
          failedCall.status = "FAILED";
          await failedCall.save();
        }
      }
    } catch (saveErr) {
      console.error("Failed to update call status:", saveErr.message);
    }

    res.status(500).json({
      error: err.message || "Outbound call failed",
      provider: voipProvider.provider,
      hint: "Check Cloud Run logs for detailed error information"
    });
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
    // CRITICAL FIX (2026-02-19): Search by BOTH twilioCallSid (Twilio) and providerCallId (SansPBX)
    // Twilio calls use twilioCallSid, but SansPBX calls use providerCallId
    const call = await Call.findOne({
      $or: [
        { twilioCallSid: CallSid },
        { providerCallId: CallSid }
      ]
    });

    if (!call) {
      console.error(`❌ Call not found for SID: ${CallSid}`);
      console.error(`   Searched in both twilioCallSid and providerCallId fields`);
      // Fall back to static response
      return twilioVoiceFallback(req, res);
    }

    // Check if real-time voice is enabled (PUBLIC_BASE_URL must be set)
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;

    if (!publicBaseUrl) {
      console.warn("⚠️ PUBLIC_BASE_URL not set, using static voice response");
      return twilioVoiceFallback(req, res);
    }

    console.log(`🎙️ Starting Media Stream for call: ${CallSid}`);
    console.log(`   Provider: ${call.voipProvider}`);

    // CRITICAL FIX (2026-02-19): Use provider-specific response format
    // Each provider (Twilio, SansPBX, etc.) expects different formats
    // - Twilio: TwiML (XML)
    // - SansPBX: JSON with actions
    // - Generic: JSON with actions
    try {
      // Get the agent and their VOIP provider to generate provider-specific response
      const agent = await Agent.findById(call.agentId);
      if (agent) {
        // Get the agent's VOIP provider
        const voipProvider = await getAgentProviderOrFallback(call.agentId);

        if (voipProvider) {
          try {
            // Create provider instance to get provider-specific response
            const provider = await ProviderFactory.createProvider(voipProvider);
            const voiceResponse = provider.generateVoiceResponse({ callSid: CallSid, publicBaseUrl });

            // Set content type based on provider
            if (call.voipProvider === 'Twilio') {
              res.type("text/xml");
            } else {
              res.type("application/json");
            }

            console.log(`✅ Using ${call.voipProvider}-specific voice response format`);
            res.send(voiceResponse);
            return;
          } catch (providerCreateErr) {
            console.warn(`⚠️ Could not instantiate provider: ${providerCreateErr.message}`);
            // Fall through to default TwiML
          }
        }
      }
    } catch (providerError) {
      console.warn(`⚠️ Could not get provider: ${providerError.message}`);
      // Fall through to default TwiML
    }

    // Fallback: Return TwiML with Media Stream for real-time AI conversation
    // The WebSocket URL must be wss:// for production
    const wsUrl = publicBaseUrl.replace('https://', 'wss://').replace('http://', 'ws://');

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
 * STATUS CALLBACK - Handles call completion events from Twilio
 * Includes Twilio error code logging and campaign queue triggering
 */
export const twilioStatus = async (req, res) => {
  try {
    const {
      CallSid,
      CallStatus,
      CallDuration,
      RecordingUrl,
      ErrorCode,
      ErrorMessage
    } = req.body;

    // CRITICAL FIX (2026-02-19): Search by BOTH twilioCallSid (Twilio) and providerCallId (SansPBX)
    const call = await Call.findOne({
      $or: [
        { twilioCallSid: CallSid },
        { providerCallId: CallSid }
      ]
    });
    if (!call) return res.sendStatus(200);

    call.status = CallStatus.toUpperCase();

    // Log Twilio error code if present
    if (ErrorCode) {
      call.endReason = `Twilio ${ErrorCode}: ${ErrorMessage || 'Unknown error'}`;
      console.warn(`⚠️ [Twilio] Call ${CallSid} error ${ErrorCode}: ${ErrorMessage}`);
    }

    if (CallStatus === "completed") {
      call.durationSeconds = Number(CallDuration || 0);
      call.recordingUrl = RecordingUrl || null;
      await call.save();

      // Trigger AI processing
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

      // If this call is part of a campaign, trigger the next call in the queue
      if (call.campaignId) {
        console.log(`[Campaign] Call completed. Triggering next call in queue...`);
        import("./call.controller.js").then(({ processCampaignNextCall }) => {
          processCampaignNextCall(call.campaignId, call.agentId, call.userId);
        });
      }
    } else if (CallStatus === "failed" || CallStatus === "no-answer" || CallStatus === "busy" || CallStatus === "canceled") {
      // Handle failed/no-answer calls
      await call.save();

      // If this call is part of a campaign, trigger the next call in the queue
      if (call.campaignId) {
        console.log(`[Campaign] Call ${CallStatus}. Triggering next call in queue...`);
        import("./call.controller.js").then(({ processCampaignNextCall }) => {
          processCampaignNextCall(call.campaignId, call.agentId, call.userId);
        });
      }
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
 * AMD STATUS CALLBACK - Handles Answering Machine Detection results from Twilio
 * Updates call outcome to 'voicemail' if machine is detected
 */
export const twilioAmdStatus = async (req, res) => {
  try {
    const { CallSid, AnsweredBy } = req.body;

    // CRITICAL FIX (2026-02-19): Search by BOTH twilioCallSid (Twilio) and providerCallId (SansPBX)
    const call = await Call.findOne({
      $or: [
        { twilioCallSid: CallSid },
        { providerCallId: CallSid }
      ]
    });
    if (!call) return res.sendStatus(200);

    if (AnsweredBy === 'machine_start') {
      // Voicemail/answering machine detected
      call.dialStatus = 'Voicemail detected';
      call.outcome = 'voicemail';
      console.log(`📱 [AMD] Voicemail detected for call ${CallSid}`);
    } else if (AnsweredBy === 'human') {
      // Human answered
      call.dialStatus = 'Human answered';
      console.log(`📱 [AMD] Human answered for call ${CallSid}`);
    }

    await call.save();
    res.sendStatus(200);
  } catch (err) {
    console.error("AMD status error:", err.message);
    res.sendStatus(200);
  }
};

/**
 * RECORDING STATUS CALLBACK - Handles recording completion from Twilio
 * Retrieves recording URL and triggers AI transcription
 */
export const twilioRecordingStatus = async (req, res) => {
  try {
    const { RecordingUrl, CallSid } = req.body;

    // CRITICAL FIX (2026-02-19): Search by BOTH twilioCallSid (Twilio) and providerCallId (SansPBX)
    const call = await Call.findOne({
      $or: [
        { twilioCallSid: CallSid },
        { providerCallId: CallSid }
      ]
    });
    if (!call) return res.sendStatus(200);

    if (RecordingUrl) {
      call.recordingUrl = RecordingUrl;
      await call.save();
      console.log(`📹 [Recording] URL saved for call ${CallSid}`);

      // Trigger AI processing if not already done
      if (!call.aiProcessed) {
        import("../call/call.processor.js").then(({ processCompletedCall }) => {
          processCompletedCall(call._id);
        });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Recording status error:", err.message);
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

    // Find call and agent (CRITICAL FIX: Search by BOTH twilioCallSid AND providerCallId for Twilio+SansPBX support)
    const call = await Call.findOne({
      $or: [
        { twilioCallSid: callSid },
        { providerCallId: callSid }
      ]
    });
    if (!call) {
      console.error(`❌ Call not found for any provider: ${callSid}`);
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
