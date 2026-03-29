'use strict';

/**
 * Call Controller — MongoDB-backed REST handlers
 * 2026-03-22
 */

const Call = require('./call.model.js');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/calls
// List calls with filtering, pagination, sorting
// ─────────────────────────────────────────────────────────────────────────────
const listCalls = async (req, res) => {
  try {
    const {
      agentId,
      campaignId,
      status,
      sentiment,
      outcome,
      search,
      sort   = 'createdAt',
      order  = 'desc',
      page   = 1,
      limit  = 20,
    } = req.query;

    // Always filter by userId — users must only see their own calls
    const userId = req.user?.id || req.user?._id;
    const filter = { archived: { $ne: true } };
    if (userId) filter.userId = userId;

    if (agentId)    filter.agentId    = agentId;
    if (campaignId) filter.campaignId = campaignId;
    if (status)     filter.status     = status;
    if (sentiment)  filter.sentiment  = sentiment;
    if (outcome)    filter.outcome    = outcome;

    if (search) {
      filter.$or = [
        { phoneNumber: { $regex: search, $options: 'i' } },
        { leadName:    { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    // Translate frontend sort values (latest/oldest) to MongoDB field + direction
    let sortField = sort;
    let sortDirection = order === 'asc' ? 1 : -1;
    if (sort === 'latest')  { sortField = 'createdAt'; sortDirection = -1; }
    if (sort === 'oldest')  { sortField = 'createdAt'; sortDirection =  1; }
    const sortObj = { [sortField]: sortDirection };

    const [calls, total] = await Promise.all([
      Call.find(filter)
        .populate('agentId', 'agentName name')
        .sort(sortObj)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Call.countDocuments(filter),
    ]);

    res.json({
      success: true,
      calls,
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    console.error('[CALL] listCalls error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/calls/:id
// ─────────────────────────────────────────────────────────────────────────────
const getCall = async (req, res) => {
  try {
    const call = await Call.findById(req.params.id)
      .populate('agentId', 'agentName name')
      .lean();
    if (!call) return res.status(404).json({ success: false, error: 'Call not found' });
    res.json({ success: true, call });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/calls/:id
// Update allowed fields: outcome, rating, summary, sentiment, sentimentScore, callAnalysis
// ─────────────────────────────────────────────────────────────────────────────
const updateCall = async (req, res) => {
  try {
    const ALLOWED = ['outcome', 'rating', 'summary', 'sentiment', 'sentimentScore', 'callAnalysis'];
    const update  = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const call = await Call.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!call) return res.status(404).json({ success: false, error: 'Call not found' });
    res.json({ success: true, call });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/calls/:id/archive
// Soft-delete
// ─────────────────────────────────────────────────────────────────────────────
const archiveCall = async (req, res) => {
  try {
    const call = await Call.findByIdAndUpdate(
      req.params.id,
      { archived: true },
      { new: true }
    );
    if (!call) return res.status(404).json({ success: false, error: 'Call not found' });
    res.json({ success: true, message: 'Call archived' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/calls/:id/redial
// Re-attempt a failed/missed/no-answer call
// Creates a new Call record and fires the actual Twilio outbound dial
// ─────────────────────────────────────────────────────────────────────────────
const redialCall = async (req, res) => {
  try {
    const original = await Call.findById(req.params.id).lean();
    if (!original) return res.status(404).json({ success: false, error: 'Call not found' });

    const newCall = await Call.create({
      userId:         original.userId,
      agentId:        original.agentId,
      leadId:         original.leadId,
      campaignId:     original.campaignId,
      direction:      'OUTBOUND',
      status:         'INITIATED',
      phoneNumber:    original.phoneNumber,
      leadName:       original.leadName,
      voipProvider:   original.voipProvider,
      voipNumberId:   original.voipNumberId,
      voipProviderId: original.voipProviderId,
    });

    // ── Fire actual Twilio outbound call ─────────────────────────────────────
    try {
      const Twilio     = require('twilio');
      const streamMeta = require('../../shared/stream-meta');
      const baseUrl    = process.env.PUBLIC_BASE_URL || '';
      const agentId    = original.agentId?.toString() || '';

      // Try DB provider credentials first, fall back to env vars
      let client, fromNumber;

      if (original.voipProviderId) {
        try {
          const { VoipProvider, VoipNumber } = require('../voip/voip.model');
          const [provDoc, numDoc] = await Promise.all([
            VoipProvider.findById(original.voipProviderId),
            VoipNumber.findById(original.voipNumberId).lean(),
          ]);
          if (provDoc && numDoc?.phoneNumber) {
            const creds = provDoc.getDecryptedCredentials();
            if (creds?.accountSid && creds?.authToken) {
              client     = new Twilio(creds.accountSid, creds.authToken);
              fromNumber = numDoc.phoneNumber;
            }
          }
        } catch (dbErr) {
          console.warn('[REDIAL] DB credential lookup failed:', dbErr.message);
        }
      }

      // Fallback: environment variable credentials
      if (!client) {
        const sid   = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;
        fromNumber  = fromNumber || process.env.TWILIO_FROM_NUMBER;
        if (sid && token && fromNumber) {
          client = new Twilio(sid, token);
        }
      }

      if (client && fromNumber && baseUrl && agentId) {
        const leadFirstName = encodeURIComponent((original.leadName || '').split(' ')[0].trim());
        const twilioResponse = await client.calls.create({
          to:                   original.phoneNumber,
          from:                 fromNumber,
          url:                  `${baseUrl}/twilio/voice?agentId=${agentId}&leadName=${leadFirstName}`,
          statusCallback:       `${baseUrl}/twilio/status`,
          statusCallbackMethod: 'POST',
          statusCallbackEvent:  ['initiated', 'ringing', 'answered', 'completed'],
        });

        // Update call record with real Twilio SID and DIALING status
        await Call.findByIdAndUpdate(newCall._id, {
          twilioCallSid: twilioResponse.sid,
          status:        'DIALING',
          fromNumber,
        });

        // Register in streamMeta so /twilio-stream handler can resolve agentId
        streamMeta.set(twilioResponse.sid, {
          agentId,
          campaignId: original.campaignId?.toString() || null,
        });

        console.log('[REDIAL] Twilio call fired:', twilioResponse.sid, '→', original.phoneNumber);

        return res.status(201).json({
          success: true,
          call:    { ...newCall.toObject(), twilioCallSid: twilioResponse.sid, status: 'DIALING' },
          message: 'Redial initiated successfully',
        });
      }

      console.warn('[REDIAL] No Twilio credentials or baseUrl — call record created but dial not fired');
    } catch (twilioErr) {
      console.error('[REDIAL] Twilio dial error:', twilioErr.message);
      // Call record was already created — return it with a warning
    }

    res.status(201).json({
      success: true,
      call:    newCall,
      message: 'Redial call record created (dial not fired — check Twilio credentials)',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/calls/stats
// Aggregate stats for dashboard
// ─────────────────────────────────────────────────────────────────────────────
const getCallStats = async (req, res) => {
  try {
    const { agentId, campaignId } = req.query;
    const match = { archived: { $ne: true } };
    if (agentId)    match.agentId    = require('mongoose').Types.ObjectId(agentId);
    if (campaignId) match.campaignId = require('mongoose').Types.ObjectId(campaignId);

    const [stats] = await Call.aggregate([
      { $match: match },
      {
        $group: {
          _id:             null,
          total:           { $sum: 1 },
          completed:       { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] },  1, 0] } },
          failed:          { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] },     1, 0] } },
          noAnswer:        { $sum: { $cond: [{ $eq: ['$status', 'NO_ANSWER'] },  1, 0] } },
          avgDurationSecs: { $avg: '$durationSeconds' },
          positive:        { $sum: { $cond: [{ $eq: ['$sentiment', 'Positive'] }, 1, 0] } },
          negative:        { $sum: { $cond: [{ $eq: ['$sentiment', 'Negative'] }, 1, 0] } },
        },
      },
    ]);

    res.json({ success: true, stats: stats || { total: 0, completed: 0, failed: 0, noAnswer: 0 } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { listCalls, getCall, updateCall, archiveCall, redialCall, getCallStats };
