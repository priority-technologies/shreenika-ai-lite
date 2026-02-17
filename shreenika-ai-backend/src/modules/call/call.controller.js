import Call from "./call.model.js";
import Lead from "../lead/lead.model.js";
import Usage from "../usage/usage.model.js";
import Campaign from "./campaign.model.js";
import CallLog from "./callLog.model.js";
import { processCallAI } from "./call.processor.js";
import { io } from "../../server.js";
import { ProviderFactory } from "./providers/ProviderFactory.js";
import { getAgentProviderOrFallback, getAgentPhoneNumber } from "./helpers/getAgentProvider.js";
import { webhookEmitter } from "../webhook/webhook.emitter.js";
import Agent from "../agent/agent.model.js";

// Track active campaigns by ID (for pause/resume)
let activeCampaigns = new Map(); // campaignId -> { active: boolean, paused: boolean }

const getMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * Start Campaign (Batch Processing with Real Webhooks)
 * - Uses 5 concurrent calls instead of sequential
 * - Waits for real webhook updates instead of hardcoded 5-second timeout
 * - Creates detailed call logs for transparency
 * - Persists campaign state to database
 */
export const startCampaign = async (req, res) => {
  try {
    const { agentId, leadIds, campaignName } = req.body;
    const userId = req.user._id;

    if (!leadIds || leadIds.length === 0) {
      return res.status(400).json({ error: "No leads selected" });
    }

    // Validate PUBLIC_BASE_URL
    if (!process.env.PUBLIC_BASE_URL) {
      return res.status(500).json({ error: "PUBLIC_BASE_URL env var not set" });
    }

    // Create campaign record in database
    const campaign = await Campaign.create({
      userId,
      agentId,
      name: campaignName || `Campaign-${Date.now()}`,
      leads: leadIds,
      totalLeads: leadIds.length,
      status: "RUNNING",
      startedAt: new Date()
    });

    // Track campaign as active
    activeCampaigns.set(campaign._id.toString(), {
      active: true,
      paused: false
    });

    console.log(`\n📞 [Campaign] Starting campaign: ${campaign._id}`);
    console.log(`   Name: ${campaign.name}`);
    console.log(`   Agent: ${agentId}`);
    console.log(`   Total Leads: ${leadIds.length}`);
    console.log(`   Concurrent Calls: 5\n`);

    // Respond immediately (async processing)
    res.json({
      success: true,
      campaignId: campaign._id,
      message: `Campaign started with ${leadIds.length} leads`,
      estimatedTime: `~${Math.ceil((leadIds.length / 5) * 1)}min (batch of 5)`
    });

    // Emit campaign started event
    io.emit("campaign:started", {
      userId: userId.toString(),
      campaignId: campaign._id.toString(),
      totalLeads: leadIds.length
    });

    // Process campaign asynchronously (batch processor)
    processCampaignBatches(campaign._id, leadIds, agentId, userId);

  } catch (err) {
    console.error("❌ Campaign error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Process campaign leads in batches (5 concurrent calls)
 */
async function processCampaignBatches(campaignId, leadIds, agentId, userId) {
  const BATCH_SIZE = 5;
  const CALL_TIMEOUT = 120000; // 2 minutes max wait for call to complete
  const MAX_RETRIES = 2;

  const campaign = await Campaign.findById(campaignId);
  if (!campaign) return;

  try {
    // Process leads in batches
    for (let batchIndex = 0; batchIndex < leadIds.length; batchIndex += BATCH_SIZE) {
      // Check if campaign is paused
      const activeCampaign = activeCampaigns.get(campaignId.toString());
      if (!activeCampaign || !activeCampaign.active) {
        console.log(`⏸️ Campaign paused: ${campaignId}`);
        campaign.status = "PAUSED";
        campaign.pausedAt = new Date();
        await campaign.save();
        break;
      }

      const batch = leadIds.slice(batchIndex, batchIndex + BATCH_SIZE);

      console.log(`\n📦 Batch ${Math.floor(batchIndex / BATCH_SIZE) + 1}: Processing ${batch.length} calls concurrently...`);

      // Process 5 calls in parallel
      await Promise.all(
        batch.map(leadId =>
          processSingleCall(
            campaignId,
            leadId,
            agentId,
            userId,
            CALL_TIMEOUT,
            MAX_RETRIES
          ).catch(err => {
            console.error(`❌ Batch error for lead ${leadId}:`, err.message);
            // Continue with next call on error
          })
        )
      );

      // Update campaign progress
      const completedCount = Math.min(batchIndex + BATCH_SIZE, leadIds.length);
      campaign.completedLeads = completedCount;
      await campaign.save();

      // Calculate stats
      const successRate = campaign.successfulCalls > 0
        ? Math.round((campaign.successfulCalls / completedCount) * 100)
        : 0;

      // Emit progress update
      io.emit("campaign:progress", {
        userId: userId.toString(),
        campaignId: campaignId.toString(),
        current: completedCount,
        total: campaign.totalLeads,
        successfulCalls: campaign.successfulCalls,
        failedCalls: campaign.failedCalls,
        successRate
      });

      console.log(`   ✅ Batch completed: ${completedCount}/${campaign.totalLeads} leads processed (${successRate}% success)`);
    }

    // Campaign complete
    campaign.status = "COMPLETED";
    campaign.completedAt = new Date();
    await campaign.save();

    activeCampaigns.delete(campaignId.toString());

    console.log(`\n✅ Campaign completed: ${campaignId}`);
    console.log(`   Total: ${campaign.totalLeads}`);
    console.log(`   Successful: ${campaign.successfulCalls}`);
    console.log(`   Failed: ${campaign.failedCalls}`);
    console.log(`   Average Duration: ${campaign.averageDuration}s\n`);

    io.emit("campaign:completed", {
      userId: userId.toString(),
      campaignId: campaignId.toString(),
      stats: {
        total: campaign.totalLeads,
        successful: campaign.successfulCalls,
        failed: campaign.failedCalls,
        missed: campaign.missedCalls,
        successRate: campaign.successRate
      }
    });

  } catch (err) {
    console.error(`❌ Campaign processing failed: ${err.message}`);
    campaign.status = "FAILED";
    await campaign.save();
    activeCampaigns.delete(campaignId.toString());
    io.emit("campaign:failed", {
      userId: userId.toString(),
      campaignId: campaignId.toString(),
      error: err.message
    });
  }
}

/**
 * Process a single call - wait for real webhook instead of mock data
 */
async function processSingleCall(campaignId, leadId, agentId, userId, callTimeout, maxRetries = 2) {
  const campaign = await Campaign.findById(campaignId);
  const lead = await Lead.findById(leadId);
  const agent = await Agent.findById(agentId);

  if (!lead) {
    console.warn(`   ⚠️ Lead not found: ${leadId}`);
    return;
  }

  let call = null;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      // Create call record
      call = await Call.create({
        userId,
        agentId,
        leadId,
        direction: "OUTBOUND",
        status: "INITIATED",
        phoneNumber: lead.phone,
        leadName: `${lead.firstName} ${lead.lastName}`
      });

      // Create initial log
      await CallLog.create({
        callId: call._id,
        campaignId,
        userId,
        leadId,
        leadName: call.leadName,
        phoneNumber: lead.phone,
        event: "INITIATED",
        details: `Campaign call initiated for lead ${lead.firstName} ${lead.lastName}`,
        voipProvider: null
      });

      // Get agent's VOIP provider
      const voipProvider = await getAgentProviderOrFallback(agentId);
      if (!voipProvider) {
        throw new Error(`Agent ${agentId} has no VOIP provider assigned`);
      }

      const fromPhone = await getAgentPhoneNumber(agentId);
      if (!fromPhone && voipProvider.provider !== 'Twilio') {
        throw new Error(`Agent ${agentId} has no phone number assigned`);
      }

      // Create VOIP provider instance
      const provider = ProviderFactory.createProvider(voipProvider);

      // Convert phone number format based on provider
      // Inputs: +918888888888 or 08888888888 or 8888888888
      let phoneForProvider = lead.phone;

      if (voipProvider.provider === 'Twilio') {
        // Twilio needs E.164 format: +918888888888
        if (!phoneForProvider.startsWith('+')) {
          // If starts with 0 or just digits, add country code
          if (phoneForProvider.startsWith('0')) {
            phoneForProvider = '+91' + phoneForProvider.substring(1);
          } else if (!phoneForProvider.startsWith('+91')) {
            phoneForProvider = '+91' + phoneForProvider;
          }
        }
        console.log(`   📞 Twilio format: ${lead.phone} → ${phoneForProvider}`);
      }
      else if (voipProvider.provider === 'SansPBX') {
        // SansPBX needs 0-prefix format: 08888888888
        if (phoneForProvider.startsWith('+91')) {
          // Convert +918888888888 → 08888888888
          phoneForProvider = '0' + phoneForProvider.substring(3);
        } else if (!phoneForProvider.startsWith('0') && phoneForProvider.length === 10) {
          // Convert 8888888888 → 08888888888
          phoneForProvider = '0' + phoneForProvider;
        }
        console.log(`   📞 SansPBX format: ${lead.phone} → ${phoneForProvider}`);
      }

      // Initiate call via VOIP
      const callResult = await provider.initiateCall({
        toPhone: phoneForProvider,
        fromPhone: fromPhone || process.env.TWILIO_FROM_NUMBER,
        webhookUrl: `${process.env.PUBLIC_BASE_URL}/twilio/voice`,
        statusCallbackUrl: `${process.env.PUBLIC_BASE_URL}/twilio/status`
      });

      call.twilioCallSid = callResult.callSid;
      call.providerCallId = callResult.providerCallId;
      call.voipProvider = callResult.provider;
      call.status = "DIALING";
      await call.save();

      // Log dialing event
      await CallLog.create({
        callId: call._id,
        campaignId,
        userId,
        leadId,
        leadName: call.leadName,
        phoneNumber: lead.phone,
        event: "DIALING",
        details: `Call initiated via ${callResult.provider}. Waiting for connection...`,
        voipProvider: callResult.provider
      });

      console.log(`   📞 ${lead.firstName} ${lead.lastName} (${lead.phone}) - DIALING via ${callResult.provider}`);

      // Wait for call to complete (webhook will update status)
      // Maximum wait time is 2 minutes
      const startTime = Date.now();
      let callCompleted = false;

      while (Date.now() - startTime < callTimeout) {
        // Refresh call from database
        call = await Call.findById(call._id);

        // Check if call has completed
        if (call.status === "COMPLETED" || call.status === "FAILED" || call.status === "MISSED") {
          callCompleted = true;
          break;
        }

        // Wait 1 second before checking again
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // If call didn't complete within timeout, mark as failed
      if (!callCompleted) {
        console.warn(`   ⏱️ Call timeout for lead ${leadId}. Marking as no-answer.`);
        call.status = "NO_ANSWER";
        call.endedAt = new Date();
        call.durationSeconds = Math.floor((call.endedAt - call.createdAt) / 1000);
        await call.save();

        await CallLog.create({
          callId: call._id,
          campaignId,
          userId,
          leadId,
          event: "NO_ANSWER",
          details: "Call timeout - no answer after 2 minutes",
          callStatus: call.status,
          durationSeconds: call.durationSeconds
        });

        campaign.noAnswerCalls += 1;
      }

      // Update campaign stats based on final call status
      if (call.status === "COMPLETED" && call.durationSeconds > 0) {
        campaign.successfulCalls += 1;
        campaign.totalDuration += call.durationSeconds;
      } else if (call.status === "FAILED") {
        campaign.failedCalls += 1;
      } else if (call.status === "MISSED" || call.status === "NO_ANSWER") {
        campaign.missedCalls += 1;
      }

      await campaign.save();

      // Emit call update
      io.emit("call:updated", {
        callId: call._id.toString(),
        leadName: lead.firstName,
        status: call.status,
        duration: call.durationSeconds,
        campaignId: campaignId.toString()
      });

      // AI processing (non-blocking)
      if (!call.aiProcessed && call.status === "COMPLETED") {
        processCallAI(call._id).catch(err =>
          console.error(`❌ AI processing failed for call ${call._id}:`, err.message)
        );
      }

      // Usage tracking
      if (call.durationSeconds > 0) {
        const minutes = Math.ceil(call.durationSeconds / 60);
        const month = getMonthKey();
        await Usage.findOneAndUpdate(
          { userId, month },
          { $inc: { voiceMinutesUsed: minutes, callsCount: 1 } },
          { upsert: true }
        );
      }

      // Trigger webhook event
      await webhookEmitter.onCallCompleted(userId, call.toObject()).catch(err =>
        console.error("❌ Webhook error:", err.message)
      );

      // Log completion
      console.log(`   ✅ ${lead.firstName} - ${call.status} (${call.durationSeconds || 0}s)`);

      // Success - exit retry loop
      return;

    } catch (err) {
      retryCount += 1;
      console.error(`   ❌ Call attempt ${retryCount}/${maxRetries} failed: ${err.message}`);

      if (call) {
        call.status = "FAILED";
        await call.save();

        await CallLog.create({
          callId: call._id,
          campaignId,
          userId,
          leadId,
          event: "FAILED",
          details: `Call failed: ${err.message}`,
          callStatus: call.status
        });

        campaign.failedCalls += 1;
        await campaign.save();
      }

      if (retryCount >= maxRetries) {
        console.error(`   ⛔ Max retries exceeded for lead ${leadId}`);
        return;
      }

      // Wait 2 seconds before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

/**
 * Pause Campaign
 */
export const pauseCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user._id;

    const campaign = await Campaign.findOne({ _id: campaignId, userId });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (campaign.status !== "RUNNING") {
      return res.status(400).json({ error: "Campaign is not running" });
    }

    // Mark campaign as paused
    const activeCampaign = activeCampaigns.get(campaignId);
    if (activeCampaign) {
      activeCampaign.paused = true;
    }

    campaign.status = "PAUSED";
    campaign.pausedAt = new Date();
    await campaign.save();

    io.emit("campaign:paused", {
      userId: userId.toString(),
      campaignId: campaignId
    });

    res.json({ success: true, campaign });
  } catch (err) {
    console.error("❌ Pause campaign error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Resume Campaign
 */
export const resumeCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user._id;

    const campaign = await Campaign.findOne({ _id: campaignId, userId });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (campaign.status !== "PAUSED") {
      return res.status(400).json({ error: "Campaign is not paused" });
    }

    campaign.status = "RUNNING";
    campaign.pausedAt = null;
    await campaign.save();

    // Mark as active
    activeCampaigns.set(campaignId, {
      active: true,
      paused: false
    });

    // Resume processing from where it left off
    const remainingLeads = campaign.leads.slice(campaign.currentBatchIndex);
    if (remainingLeads.length > 0) {
      processCampaignBatches(
        campaign._id,
        remainingLeads,
        campaign.agentId,
        userId
      );
    }

    io.emit("campaign:resumed", {
      userId: userId.toString(),
      campaignId: campaignId
    });

    res.json({ success: true, campaign });
  } catch (err) {
    console.error("❌ Resume campaign error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Stop Campaign
 */
export const stopCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user._id;

    const campaign = await Campaign.findOne({ _id: campaignId, userId });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Mark campaign as inactive
    activeCampaigns.delete(campaignId);

    campaign.status = "COMPLETED";
    campaign.completedAt = new Date();
    await campaign.save();

    io.emit("campaign:stopped", {
      userId: userId.toString(),
      campaignId: campaignId
    });

    res.json({ success: true, message: "Campaign stopped" });
  } catch (err) {
    console.error("❌ Stop campaign error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get Campaign Details
 */
export const getCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user._id;

    const campaign = await Campaign.findOne({ _id: campaignId, userId })
      .populate('agentId', 'name')
      .lean();

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Add calculated fields
    campaign.successRate = campaign.completedLeads > 0
      ? Math.round((campaign.successfulCalls / campaign.completedLeads) * 100)
      : 0;

    campaign.elapsedSeconds = campaign.startedAt
      ? Math.floor((new Date() - campaign.startedAt) / 1000)
      : 0;

    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get Campaign Logs
 */
export const getCampaignLogs = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { limit = 50, skip = 0 } = req.query;
    const userId = req.user._id;

    // Verify campaign ownership
    const campaign = await Campaign.findOne({ _id: campaignId, userId });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Get call logs
    const logs = await CallLog.find({ campaignId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await CallLog.countDocuments({ campaignId });

    res.json({
      logs,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * List Campaigns
 */
export const listCampaigns = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status = null } = req.query;

    const query = { userId };
    if (status) query.status = status;

    const campaigns = await Campaign.find(query)
      .sort({ createdAt: -1 })
      .populate('agentId', 'name')
      .lean();

    // Add calculated fields
    const formatted = campaigns.map(c => ({
      ...c,
      successRate: c.completedLeads > 0
        ? Math.round((c.successfulCalls / c.completedLeads) * 100)
        : 0,
      elapsedSeconds: c.startedAt
        ? Math.floor((new Date() - c.startedAt) / 1000)
        : 0
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
 * List Calls with Search, Filter, and Sort
 * Query params:
 * - search: String to search in leadName or phoneNumber
 * - status: Filter by call status (COMPLETED, FAILED, NO_ANSWER, etc.)
 * - sentiment: Filter by sentiment (Positive, Negative, Neutral)
 * - dateFrom: ISO date string for start of range
 * - dateTo: ISO date string for end of range
 * - sort: 'latest' (default) or 'oldest'
 * - page: Page number (default 1)
 * - limit: Items per page (default 50)
 */
export const listCalls = async (req, res) => {
  try {
    const { search, status, sentiment, dateFrom, dateTo, sort = 'latest', page = 1, limit = 50 } = req.query;

    // Build query filter
    let filter = {
      userId: req.user._id,
      archived: false,
    };

    // Search filter (leadName or phoneNumber)
    if (search) {
      filter.$or = [
        { leadName: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Sentiment filter
    if (sentiment) {
      filter.sentiment = sentiment;
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) {
        filter.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.createdAt.$lte = new Date(dateTo);
      }
    }

    // Count total matching documents
    const total = await Call.countDocuments(filter);

    // Determine sort order
    const sortOrder = sort === 'oldest' ? 1 : -1;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 50)); // Cap at 100
    const skip = (pageNum - 1) * limitNum;

    // Fetch paginated results
    const calls = await Call.find(filter)
      .sort({ createdAt: sortOrder })
      .skip(skip)
      .limit(limitNum)
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
      outcome: call.outcome,
      rating: call.rating,
      recordingUrl: call.recordingUrl,
      usageCost: call.usageCost,
      dialStatus: call.dialStatus,
      endReason: call.endReason,
    }));

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      calls: formatted,
      total,
      page: pageNum,
      pages: totalPages,
      limit: limitNum,
    });
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

  // Trigger webhook event for completed call
  webhookEmitter.onCallCompleted(req.user._id, call.toObject()).catch((err) =>
    console.error("❌ Webhook error:", err.message)
  );

  if (!call.aiProcessed) {
    processCallAI(call._id).catch((err) =>
      console.error("❌ AI processing failed:", err.message)
    );
  }

  res.json({ success: true });
};

/**
 * Process Campaign Next Call (StatusCallback-driven recursive queuing)
 * Called from twilioStatus when a campaign call completes/fails/no-answer
 * Initiates the next pending lead in the campaign if < 5 concurrent calls
 */
export const processCampaignNextCall = async (campaignId, agentId, userId) => {
  try {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      console.warn(`[Campaign] Campaign ${campaignId} not found`);
      return;
    }

    // Check if campaign is still active (not paused/stopped)
    const campaignState = activeCampaigns.get(campaignId.toString());
    if (!campaignState || !campaignState.active || campaignState.paused) {
      console.log(`[Campaign] Campaign ${campaignId} is paused or stopped. Skipping next call.`);
      return;
    }

    // Count currently active/in-progress calls for this campaign
    const activeCalls = await Call.countDocuments({
      campaignId,
      status: { $in: ['INITIATED', 'DIALING', 'RINGING', 'ANSWERED'] }
    });

    console.log(`[Campaign] ${campaignId}: ${activeCalls} active calls. Max concurrent: 5`);

    // If we have room for more concurrent calls
    if (activeCalls < 5) {
      // Find next call that's not yet been attempted in this campaign
      // We track this by checking if call exists for the lead in this campaign
      const attemptedLeadIds = await Call.find({ campaignId }).select('leadId').lean();
      const attemptedLeadSet = new Set(attemptedLeadIds.map(c => c.leadId?.toString()));

      // Find next lead in campaign.leads that hasn't been called yet
      let nextLeadId = null;
      for (const leadId of campaign.leads) {
        if (!attemptedLeadSet.has(leadId.toString())) {
          nextLeadId = leadId;
          break;
        }
      }

      if (nextLeadId) {
        console.log(`[Campaign] ${campaignId}: Initiating next call for lead ${nextLeadId}`);

        // Create call for next lead (reuse processSingleCall logic)
        const lead = await Lead.findById(nextLeadId);
        if (!lead) {
          console.warn(`[Campaign] Lead ${nextLeadId} not found`);
          return;
        }

        const call = await Call.create({
          userId,
          agentId,
          leadId: nextLeadId,
          campaignId,
          direction: 'OUTBOUND',
          status: 'INITIATED',
          phoneNumber: lead.phone,
          leadName: `${lead.firstName} ${lead.lastName}`
        });

        // Get VOIP provider and initiate call
        const voipProvider = await getAgentProviderOrFallback(agentId);
        if (!voipProvider) {
          console.error(`[Campaign] Agent ${agentId} has no VOIP provider`);
          return;
        }

        const fromPhone = await getAgentPhoneNumber(agentId);
        const provider = ProviderFactory.createProvider(voipProvider);

        // Convert phone number format based on provider
        let phoneForProvider = lead.phone;

        if (voipProvider.provider === 'Twilio') {
          // Twilio needs E.164 format: +918888888888
          if (!phoneForProvider.startsWith('+')) {
            if (phoneForProvider.startsWith('0')) {
              phoneForProvider = '+91' + phoneForProvider.substring(1);
            } else if (!phoneForProvider.startsWith('+91')) {
              phoneForProvider = '+91' + phoneForProvider;
            }
          }
        }
        else if (voipProvider.provider === 'SansPBX') {
          // SansPBX needs 0-prefix format: 08888888888
          if (phoneForProvider.startsWith('+91')) {
            phoneForProvider = '0' + phoneForProvider.substring(3);
          } else if (!phoneForProvider.startsWith('0') && phoneForProvider.length === 10) {
            phoneForProvider = '0' + phoneForProvider;
          }
        }

        const callResult = await provider.initiateCall({
          toPhone: phoneForProvider,
          fromPhone: fromPhone || process.env.TWILIO_FROM_NUMBER,
          webhookUrl: `${process.env.PUBLIC_BASE_URL}/twilio/voice`,
          statusCallbackUrl: `${process.env.PUBLIC_BASE_URL}/twilio/status`
        });

        call.twilioCallSid = callResult.callSid;
        call.providerCallId = callResult.providerCallId;
        call.voipProvider = callResult.provider;
        call.status = 'DIALING';
        await call.save();

        console.log(`   📞 [Campaign] ${lead.firstName} ${lead.lastName} (${lead.phone}) - DIALING`);
      } else {
        // All leads have been attempted - mark campaign as COMPLETED
        console.log(`[Campaign] ${campaignId}: All leads attempted. Marking campaign as COMPLETED.`);
        campaign.status = 'COMPLETED';
        campaign.completedAt = new Date();
        await campaign.save();
        activeCampaigns.delete(campaignId.toString());

        io.emit('campaign:completed', {
          userId: userId.toString(),
          campaignId: campaignId.toString(),
          totalLeads: campaign.leads.length,
          successfulCalls: campaign.successfulCalls,
          failedCalls: campaign.failedCalls
        });
      }
    } else {
      console.log(`[Campaign] ${campaignId}: Already at 5 concurrent calls. Waiting for next completion.`);
    }
  } catch (err) {
    console.error(`[Campaign] Error processing next call for campaign ${campaignId}:`, err);
  }
};