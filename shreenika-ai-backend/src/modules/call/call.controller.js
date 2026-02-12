import Call from "./call.model.js";
import Lead from "../lead/lead.model.js";
import Usage from "../usage/usage.model.js";
import { processCallAI } from "./call.processor.js";
import { io } from "../../server.js";
import { ProviderFactory } from "./providers/ProviderFactory.js";
import { getAgentProviderOrFallback, getAgentPhoneNumber } from "./helpers/getAgentProvider.js";

let activeCampaigns = new Map(); // userId -> { active: boolean, current: number, total: number }

const getMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * Start Campaign (Sequential Calling)
 */
export const startCampaign = async (req, res) => {
  try {
    const { agentId, leadIds, campaignName } = req.body;
    const userId = req.user._id;

    if (!leadIds || leadIds.length === 0) {
      return res.status(400).json({ error: "No leads selected" });
    }

    // Check if already running
    if (activeCampaigns.has(userId.toString()) && activeCampaigns.get(userId.toString()).active) {
      return res.status(400).json({ error: "Campaign already running" });
    }

    // Mark campaign as active
    activeCampaigns.set(userId.toString(), {
      active: true,
      current: 0,
      total: leadIds.length,
    });

    res.json({
      success: true,
      message: `Campaign started with ${leadIds.length} leads`,
    });

    // Process calls sequentially
    for (let i = 0; i < leadIds.length; i++) {
      const campaign = activeCampaigns.get(userId.toString());
      if (!campaign || !campaign.active) break; // Campaign stopped

      const leadId = leadIds[i];
      const lead = await Lead.findById(leadId);

      if (!lead) continue;

      // Emit progress
      campaign.current = i + 1;
      io.emit("campaign:progress", {
        userId: userId.toString(),
        current: campaign.current,
        total: campaign.total,
      });

      // Create call record
      const call = await Call.create({
        userId,
        agentId,
        leadId,
        direction: "OUTBOUND",
        status: "INITIATED",
        phoneNumber: lead.phone,
        leadName: `${lead.firstName} ${lead.lastName}`,
      });

      // Emit call started
      io.emit("call:started", {
        userId: userId.toString(),
        callId: call._id,
        phone: lead.phone,
      });

      // Get agent's VOIP provider
      const voipProvider = await getAgentProviderOrFallback(agentId);
      if (!voipProvider) {
        console.error(`❌ Agent ${agentId} has no VOIP provider assigned, skipping lead ${leadId}`);
        call.status = "FAILED";
        await call.save();
        continue;
      }

      const fromPhone = await getAgentPhoneNumber(agentId);
      if (!fromPhone && voipProvider.provider !== 'Twilio') {
        console.error(`❌ Agent ${agentId} has no phone number assigned, skipping lead ${leadId}`);
        call.status = "FAILED";
        await call.save();
        continue;
      }

      try {
        const provider = ProviderFactory.createProvider(voipProvider);

        const callResult = await provider.initiateCall({
          toPhone: lead.phone,
          fromPhone: fromPhone || process.env.TWILIO_FROM_NUMBER,
          webhookUrl: `${process.env.PUBLIC_BASE_URL}/twilio/voice`,
          statusCallbackUrl: `${process.env.PUBLIC_BASE_URL}/twilio/status`
        });

        call.twilioCallSid = callResult.callSid;
        call.providerCallId = callResult.providerCallId;
        call.voipProvider = callResult.provider;
        call.status = "INITIATED";
        await call.save();

        console.log(`✅ Campaign call initiated: ${callResult.callSid} via ${callResult.provider}`);

        // Wait for call to complete (in production, use webhook status updates)
        // For now, simulate with timeout
        await new Promise((resolve) => setTimeout(resolve, 5000));

      } catch (err) {
        console.error(`❌ Failed to initiate call for lead ${leadId}:`, err.message);
        call.status = "FAILED";
        await call.save();
        continue;
      }

      // Update call duration and status
      const duration = Math.floor(Math.random() * 60) + 15;
      call.status = "COMPLETED";
      call.durationSeconds = duration;
      call.endedAt = new Date();
      await call.save();

      // Usage tracking
      const minutes = Math.ceil(duration / 60);
      const month = getMonthKey();
      await Usage.findOneAndUpdate(
        { userId, month },
        { $inc: { voiceMinutesUsed: minutes, callsCount: 1 } },
        { upsert: true }
      );

      // AI processing
      if (!call.aiProcessed) {
        processCallAI(call._id).catch((err) =>
          console.error("❌ AI processing failed:", err.message)
        );
      }

      // Emit call completed
      io.emit("call:completed", {
        userId: userId.toString(),
        call: {
          id: call._id,
          leadId: call.leadId,
          leadName: call.leadName,
          phoneNumber: call.phoneNumber,
          status: call.status,
          durationSeconds: call.durationSeconds,
          startedAt: call.createdAt,
          endedAt: call.endedAt,
        },
      });
    }

    // Campaign complete
    activeCampaigns.set(userId.toString(), { active: false, current: 0, total: 0 });
    io.emit("campaign:completed", { userId: userId.toString() });
  } catch (err) {
    console.error("❌ Campaign error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Stop Campaign
 */
export const stopCampaign = async (req, res) => {
  const userId = req.user._id.toString();

  if (activeCampaigns.has(userId)) {
    activeCampaigns.set(userId, { active: false, current: 0, total: 0 });
  }

  res.json({ success: true, message: "Campaign stopped" });
};

/**
 * Redial Single Call
 */
export const redialCall = async (req, res) => {
  try {
    const originalCall = await Call.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!originalCall) {
      return res.status(404).json({ error: "Call not found" });
    }

    const newCall = await Call.create({
      userId: req.user._id,
      agentId: originalCall.agentId,
      leadId: originalCall.leadId,
      direction: "OUTBOUND",
      status: "INITIATED",
      phoneNumber: originalCall.phoneNumber,
      leadName: originalCall.leadName,
    });

    res.json({ success: true, callId: newCall._id });

    // Emit to WebSocket
    io.emit("call:started", {
      userId: req.user._id.toString(),
      callId: newCall._id,
      phone: originalCall.phoneNumber,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * List Calls
 */
export const listCalls = async (req, res) => {
  try {
    const calls = await Call.find({
      userId: req.user._id,
      archived: false,
    })
      .sort({ createdAt: -1 })
      .lean();

    // Map to frontend format
    const formatted = calls.map((call) => ({
      id: call._id.toString(),
      leadId: call.leadId?.toString(),
      leadName: call.leadName,
      phoneNumber: call.phoneNumber,
      status: call.status,
      durationSeconds: call.durationSeconds || 0,
      startedAt: call.createdAt,
      endedAt: call.endedAt || call.createdAt,
      transcript: call.transcript,
      summary: call.summary,
      sentiment: call.sentiment,
      rating: call.rating,
      recordingUrl: call.recordingUrl,
      usageCost: call.usageCost,
      dialStatus: call.dialStatus,
      endReason: call.endReason,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Archive Call (Soft Delete)
 */
export const archiveCall = async (req, res) => {
  try {
    await Call.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { archived: true }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Create Call (Legacy)
 */
export const createCall = async (req, res) => {
  const call = await Call.create({
    userId: req.user._id,
    agentId: req.body.agentId,
    leadId: req.body.leadId,
    direction: req.body.direction,
    status: "INITIATED",
  });

  res.json(call);
};

/**
 * Complete Call (Legacy)
 */
export const completeCall = async (req, res) => {
  const { durationSeconds, recordingUrl } = req.body;

  const call = await Call.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!call) {
    return res.status(404).json({ error: "Call not found" });
  }

  call.status = "COMPLETED";
  call.durationSeconds = durationSeconds || 0;
  call.recordingUrl = recordingUrl || null;
  await call.save();

  const minutes = Math.ceil(call.durationSeconds / 60);
  const month = getMonthKey();

  await Usage.findOneAndUpdate(
    { userId: req.user._id, month },
    { $inc: { voiceMinutesUsed: minutes } },
    { upsert: true }
  );

  if (!call.aiProcessed) {
    processCallAI(call._id).catch((err) =>
      console.error("❌ AI processing failed:", err.message)
    );
  }

  res.json({ success: true });
};