import Call from "./call.model.js";
import Usage from "../usage/usage.model.js";
import { getTwilioClient } from "../../config/twilio.client.js";

const getMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * OUTBOUND CALL
 */
export const startOutboundCall = async (req, res) => {
  try {
    const { agentId, leadId, toPhone } = req.body;
    if (!toPhone || !agentId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const call = await Call.create({
      userId: req.user.id,
      agentId,
      leadId,
      direction: "OUTBOUND",
      status: "INITIATED"
    });

    const twilio = getTwilioClient();

    const twilioCall = await twilio.calls.create({
      to: toPhone,
      from: process.env.TWILIO_FROM_NUMBER,
      url: `${process.env.PUBLIC_BASE_URL}/twilio/voice`,
      statusCallback: `${process.env.PUBLIC_BASE_URL}/twilio/status`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST"
    });

    call.twilioCallSid = twilioCall.sid;
    await call.save();

    res.json(call);
  } catch (err) {
    console.error("Twilio outbound error:", err.message);
    res.status(500).json({ error: "Outbound call failed" });
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
