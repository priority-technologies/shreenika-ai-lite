'use strict';

/**
 * Campaign Worker Service — In-memory slot engine (no Redis)
 * 2026-03-22
 *
 * Architecture:
 * ─────────────
 *  activeCampaigns  Map<campaignId, CampaignState>
 *    CampaignState = {
 *      status:    'running' | 'paused' | 'stopped'
 *      leadQueue: [ { leadId, name, phone } ]   ← in-memory FIFO
 *      slots:     Map<slotId(1-5), SlotState>
 *      totalLeads:     Number
 *      metrics:        { completed, failed, noAnswer, voicemail }
 *    }
 *
 *  callSidMap  Map<callSid, { campaignId, slotId, callDocId, leadId }>
 *    ← reverse lookup for Twilio status webhooks
 *
 * Flow:
 *  1. initCampaign()   — loads pending leads → fills 5 slots → fires calls
 *  2. Twilio webhook   → processCampaignNextCall(callSid, status)
 *     a. update Call record
 *     b. free slot
 *     c. update campaign metrics
 *     d. emit Socket.IO CAMPAIGN_PROGRESS
 *     e. if leads remain → fillSlots() → fire next call into empty slot
 *     f. if all done → completeCampaign()
 */

const Campaign = require('./campaign.model.js');
const Call     = require('../call/call.model.js');
const { VoipProvider, VoipNumber } = require('../voip/voip.model.js');
const twilio   = require('twilio');

// ── In-memory state ───────────────────────────────────────────────────────────
const activeCampaigns = new Map();
const callSidMap      = new Map();   // callSid → { campaignId, slotId, callDocId, leadId }

// ── Socket.IO lazy loader ─────────────────────────────────────────────────────
let _io = null;
function getIo() {
  if (!_io) {
    try { _io = require('../../server.js').io; } catch (_) { /* server not exported yet */ }
  }
  return _io;
}

function emitProgress(campaignId, state, extra = {}) {
  const io = getIo();
  if (!io) return;

  const processed = state.metrics.completed + state.metrics.failed +
                    state.metrics.noAnswer  + state.metrics.voicemail;
  const total     = state.totalLeads || 1;
  const pct       = Math.round((processed / total) * 100);
  const active    = [...state.slots.values()].filter(s => s.status === 'calling').length;

  io.emit('CAMPAIGN_PROGRESS', {
    campaignId,
    status:         state.status,
    processed,
    completed:      state.metrics.completed,
    failed:         state.metrics.failed,
    noAnswer:       state.metrics.noAnswer,
    voicemail:      state.metrics.voicemail,
    total,
    percentage:     pct,
    activeSlots:    active,
    queueRemaining: state.leadQueue.length,
    timestamp:      new Date(),
    ...extra,
  });
}

// ── Phone normalisation → Twilio E.164 ───────────────────────────────────────
function normalisePhone(phone) {
  if (!phone) return '';
  phone = String(phone).replace(/[\s\-().]/g, '');
  if (phone.startsWith('+')) return phone;
  if (phone.startsWith('0'))  return '+91' + phone.substring(1);
  if (/^91\d{10}$/.test(phone)) return '+' + phone;
  return '+91' + phone;
}

// ── Build Twilio client from VoipProvider + VoipNumber assigned to agent ──────
// Falls back to TWILIO_* environment variables if no DB record found.
async function getTwilioContext(agentId, userId) {
  // ── Try DB-first (VoipProvider + VoipNumber records) ──────────────────────
  const numDoc = await VoipNumber.findOne({
    assignedAgentId: agentId,
    status: 'active',
  });

  if (numDoc) {
    const provDoc = await VoipProvider.findOne({
      _id:      numDoc.providerId,
      userId,
      provider: 'Twilio',
      isActive: true,
    });

    if (provDoc) {
      const creds = provDoc.getDecryptedCredentials();
      if (creds.accountSid && creds.authToken) {
        return {
          client:     twilio(creds.accountSid, creds.authToken),
          fromNumber: numDoc.phoneNumber,
          providerId: provDoc._id,
          numberId:   numDoc._id,
        };
      }
    }
  }

  // ── Fallback: use TWILIO_* environment variables ──────────────────────────
  const envSid   = process.env.TWILIO_ACCOUNT_SID;
  const envToken = process.env.TWILIO_AUTH_TOKEN;
  const envFrom  = process.env.TWILIO_FROM_NUMBER;

  if (envSid && envToken && envFrom) {
    console.log('[WORKER] Using TWILIO_* env-var credentials (no DB record found for agent)');
    return {
      client:     twilio(envSid, envToken),
      fromNumber: envFrom,
      providerId: null,
      numberId:   null,
    };
  }

  return { error: 'No Twilio credentials found — add them via VOIP Integration or set TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER in .env' };
}

// ── Get SansPBX credentials for an agent ─────────────────────────────────────
async function getSansPBXContext(agentId, userId) {
  const numDoc = await VoipNumber.findOne({ assignedAgentId: agentId, status: 'active' });
  if (!numDoc) return { error: 'No active DID assigned to this agent' };

  const provDoc = await VoipProvider.findOne({
    _id: numDoc.providerId, userId, provider: 'SansPBX', isActive: true,
  });
  if (!provDoc) return { error: 'No active SansPBX provider found for agent' };

  const creds = provDoc.getDecryptedCredentials();
  return {
    creds,
    did:        numDoc.phoneNumber,
    providerId: provDoc._id,
    numberId:   numDoc._id,
  };
}

// ── Phone normalisation for SansPBX ──────────────────────────────────────────
// call_to: 11 digits with leading 0 (e.g. 09876543210)
// caller_id: last 7 digits of DID (no country code, no leading 0)
function normaliseSansPBXPhone(phone) {
  phone = String(phone).replace(/[\s\-().+]/g, '');
  if (phone.startsWith('91') && phone.length === 12) phone = phone.substring(2); // remove 91
  if (phone.startsWith('0') && phone.length === 11)  phone = phone.substring(1); // remove leading 0
  return '0' + phone.slice(-10); // always 11 digits with leading 0
}

function extractCallerId(did) {
  did = String(did).replace(/[\s\-().+]/g, '');
  if (did.startsWith('91')) did = did.substring(2);
  if (did.startsWith('0'))  did = did.substring(1);
  return did.slice(-7); // last 7 digits
}

// ── Fire a single SansPBX outbound call ──────────────────────────────────────
async function fireSansPBXCall(campaign, lead, callDocId) {
  try {
    const agentId = campaign.agentId.toString();
    const userId  = campaign.userId.toString();
    const ctx     = await getSansPBXContext(agentId, userId);
    if (ctx.error) return { error: ctx.error };

    const { creds, did, providerId, numberId } = ctx;
    const { tokenEndpoint, dialEndpoint, accessToken, accessKey, username, password, appId } = creds;

    const baseUrl   = process.env.PUBLIC_BASE_URL || '';
    if (!baseUrl)   return { error: 'PUBLIC_BASE_URL not configured' };

    const wssUrl    = baseUrl.replace(/^https?:\/\//, 'wss://');
    const campId    = campaign._id.toString();

    // Step 1: Generate SansPBX JWT token
    const nodeFetch = require('node-fetch');
    const fetchFn   = nodeFetch.default || nodeFetch;
    const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');

    const tokenRes  = await fetchFn(tokenEndpoint, {
      method:  'POST',
      headers: { Accesstoken: accessToken, 'Content-Type': 'application/json', Authorization: `Basic ${basicAuth}` },
      body:    JSON.stringify({ access_key: accessKey }),
    });
    const tokenData = await tokenRes.json();
    const apiToken  = tokenData.Apitoken || tokenData.data?.Apitoken;
    if (!apiToken) return { error: 'SansPBX token generation failed: ' + JSON.stringify(tokenData) };

    // Step 2: Dial the call
    const callTo   = normaliseSansPBXPhone(lead.phone);
    const callerId = extractCallerId(did);

    const dialRes  = await fetchFn(dialEndpoint, {
      method:  'POST',
      headers: { Apitoken: apiToken, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        appid:           Number(appId),
        call_to:         callTo,
        caller_id:       callerId,
        status_callback: `${baseUrl}/sanspbx/status`,
        audio_ws_url:    `${wssUrl}/sanspbx-stream`,
        custom_field:    { record_id: callDocId, agentId, campaignId: campId },
      }),
    });
    const dialData = await dialRes.json();
    const sansPbxCallId = dialData.callid || dialData.call_id || dialData.id || dialData.msg?.callid;
    if (!sansPbxCallId) return { error: 'SansPBX dial failed: ' + JSON.stringify(dialData) };

    console.log(`[WORKER] SansPBX call: ${callerId} → ${callTo} | callId=${sansPbxCallId}`);

    // Store in streamMeta so the WebSocket handler can resolve agentId from callId
    const streamMeta = require('../../shared/stream-meta'); // Map exported directly — do NOT destructure
    streamMeta.set(sansPbxCallId, { agentId, campaignId: campId });

    return { callSid: sansPbxCallId, providerId, numberId, fromNumber: did };
  } catch (err) {
    console.error('[WORKER] fireSansPBXCall error:', err.message);
    return { error: err.message };
  }
}

// ── Fire a single Twilio outbound call ───────────────────────────────────────
async function fireCall(campaign, lead) {
  try {
    const ctx = await getTwilioContext(
      campaign.agentId.toString(),
      campaign.userId.toString()
    );
    if (ctx.error) {
      console.error('[WORKER] getTwilioContext error:', ctx.error);
      return { error: ctx.error };
    }

    const toPhone  = normalisePhone(lead.phone);
    const baseUrl  = process.env.PUBLIC_BASE_URL || '';
    const agentId  = campaign.agentId.toString();
    const campId   = campaign._id.toString();

    // Extract first name for personalised greeting (URL-encoded)
    const firstName = encodeURIComponent((lead.name || '').split(' ')[0].trim() || '');

    if (!baseUrl) {
      console.warn('[WORKER] PUBLIC_BASE_URL not set — Twilio needs a webhook URL to initiate calls.');
      console.warn('[WORKER] Set PUBLIC_BASE_URL=https://<your-ngrok>.ngrok.io in .env and restart.');
      return { error: 'PUBLIC_BASE_URL not configured' };
    }

    const callParams = {
      to:                    toPhone,
      from:                  ctx.fromNumber,
      url:                   `${baseUrl}/twilio/voice?agentId=${agentId}&campaignId=${campId}&leadName=${firstName}`,
      statusCallback:        `${baseUrl}/twilio/status`,
      statusCallbackMethod:  'POST',
      statusCallbackEvent:   ['initiated', 'ringing', 'answered', 'completed'],
    };

    console.log(`[WORKER] Twilio call: ${ctx.fromNumber} → ${toPhone}`);
    const response = await ctx.client.calls.create(callParams);

    return {
      callSid:    response.sid,
      providerId: ctx.providerId,
      numberId:   ctx.numberId,
      fromNumber: ctx.fromNumber,
    };
  } catch (err) {
    console.error('[WORKER] fireCall error:', err.message);
    return { error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// fillSlots — pull next lead(s) from queue, fire calls, occupy idle slots
// ─────────────────────────────────────────────────────────────────────────────
async function fillSlots(campaignId) {
  const cid   = campaignId.toString();
  const state = activeCampaigns.get(cid);
  if (!state || state.status !== 'running') return;

  const campaign = await Campaign.findById(cid);
  if (!campaign) return;

  let campaignDirty = false;

  for (const [slotId, slot] of state.slots.entries()) {
    if (slot.status !== 'idle') continue;
    if (state.leadQueue.length === 0) break;   // No more leads — leave slots empty

    const lead = state.leadQueue.shift();
    console.log(`[WORKER] Slot ${slotId} ← ${lead.name} (${lead.phone})`);

    // ── Create Call doc (INITIATED) ──────────────────────────────────────
    const callDoc = await Call.create({
      userId:      campaign.userId,
      agentId:     campaign.agentId,
      campaignId:  campaign._id,
      direction:   'OUTBOUND',
      status:      'INITIATED',
      phoneNumber: lead.phone,
      leadName:    lead.name,
    });

    // ── Optimistically mark slot as calling ──────────────────────────────
    state.slots.set(slotId, {
      status:    'calling',
      callDocId: callDoc._id.toString(),
      leadId:    lead.leadId,
      callSid:   null,
    });

    // ── Update lead status in Campaign doc ──────────────────────────────
    const lIdx = campaign.leads.findIndex(
      l => (l.leadId?.toString() || l._id?.toString()) === lead.leadId
    );
    if (lIdx >= 0) {
      campaign.leads[lIdx].status        = 'calling';
      campaign.leads[lIdx].callId        = callDoc._id.toString();
      campaign.leads[lIdx].lastAttemptAt = new Date();
      campaignDirty = true;
    }

    // ── Auto-detect provider: SansPBX or Twilio ──────────────────────────
    const sansPbxCtx = await getSansPBXContext(campaign.agentId.toString(), campaign.userId.toString());
    const useSansPBX = !sansPbxCtx.error;

    const result = useSansPBX
      ? await fireSansPBXCall(campaign, lead, callDoc._id.toString())
      : await fireCall(campaign, lead);

    if (result.error) {
      console.error(`[WORKER] Call initiation failed (slot ${slotId}):`, result.error);
      state.slots.set(slotId, { status: 'idle', callDocId: null, leadId: null, callSid: null });
      await Call.findByIdAndUpdate(callDoc._id, { status: 'FAILED', endedAt: new Date() });
      if (lIdx >= 0) { campaign.leads[lIdx].status = 'failed'; campaignDirty = true; }
      state.metrics.failed++;
      continue;
    }

    // ── Update slot with real callSid ────────────────────────────────────
    state.slots.set(slotId, {
      status:    'calling',
      callDocId: callDoc._id.toString(),
      leadId:    lead.leadId,
      callSid:   result.callSid,
    });

    // ── Register in reverse lookup ───────────────────────────────────────
    callSidMap.set(result.callSid, {
      campaignId: cid,
      slotId,
      callDocId:  callDoc._id.toString(),
      leadId:     lead.leadId,
    });

    // ── Persist callSid + provider + DIALING status ──────────────────────
    await Call.findByIdAndUpdate(callDoc._id, {
      twilioCallSid:  result.callSid,
      providerCallId: result.callSid,
      voipProvider:   useSansPBX ? 'SansPBX' : 'Twilio',
      voipProviderId: result.providerId,
      voipNumberId:   result.numberId,
      fromNumber:     result.fromNumber,
      status:         'DIALING',
    });
  }

  // ── Persist campaign metrics ─────────────────────────────────────────────
  const activeCount = [...state.slots.values()].filter(s => s.status === 'calling').length;
  campaign.executionMetrics.currentActiveSlots = activeCount;
  await campaign.save();

  emitProgress(cid, state);
}

// ─────────────────────────────────────────────────────────────────────────────
// processCampaignNextCall — called from Twilio status webhook
// ─────────────────────────────────────────────────────────────────────────────
async function processCampaignNextCall(callSid, twilioStatus, extra = {}) {
  const TERMINAL = new Set(['completed', 'failed', 'busy', 'no-answer', 'canceled']);

  const STATUS_MAP = {
    'initiated':    'DIALING',
    'ringing':      'RINGING',
    'in-progress':  'ANSWERED',
    'answered':     'ANSWERED',
    'completed':    'COMPLETED',
    'failed':       'FAILED',
    'busy':         'FAILED',
    'no-answer':    'NO_ANSWER',
    'canceled':     'FAILED',
  };

  const dbStatus = STATUS_MAP[twilioStatus] || twilioStatus.toUpperCase();

  // ── Always update Call record ────────────────────────────────────────────
  const callDoc = await Call.findOne({ twilioCallSid: callSid });
  if (callDoc) {
    const update = { status: dbStatus };
    if (twilioStatus === 'answered' || twilioStatus === 'in-progress') {
      update.answeredAt = new Date();
    }
    if (TERMINAL.has(twilioStatus)) {
      update.endedAt = new Date();
      if (extra.callDuration) update.durationSeconds = Number(extra.callDuration);
      if (extra.recordingUrl) {
        update.recordingUrl    = extra.recordingUrl + '.mp3';
        update.recordingStatus = 'completed';
      }
    }
    await callDoc.updateOne(update);
  }

  // ── Only process slot/campaign logic on terminal statuses ────────────────
  if (!TERMINAL.has(twilioStatus)) return;

  const entry = callSidMap.get(callSid);
  if (!entry) {
    // Not a tracked campaign call (inbound or standalone test) — ignore
    return;
  }

  const { campaignId, slotId, callDocId, leadId } = entry;
  callSidMap.delete(callSid);

  const state = activeCampaigns.get(campaignId);
  if (!state) {
    console.warn('[WORKER] Campaign state missing for:', campaignId);
    return;
  }

  // ── Free the slot ────────────────────────────────────────────────────────
  state.slots.set(slotId, { status: 'idle', callDocId: null, leadId: null, callSid: null });

  // ── Update in-memory metrics ─────────────────────────────────────────────
  if      (twilioStatus === 'completed')  state.metrics.completed++;
  else if (twilioStatus === 'no-answer')  state.metrics.noAnswer++;
  else                                    state.metrics.failed++;

  // ── Persist campaign metrics to DB ───────────────────────────────────────
  const campaign = await Campaign.findById(campaignId);
  if (campaign) {
    if      (twilioStatus === 'completed')  campaign.executionMetrics.callsCompleted++;
    else if (twilioStatus === 'no-answer')  campaign.executionMetrics.callsNoAnswer++;
    else                                    campaign.executionMetrics.callsFailed++;

    if (extra.callDuration) {
      campaign.executionMetrics.totalDuration += Number(extra.callDuration);
      const processed = campaign.executionMetrics.callsCompleted +
                        campaign.executionMetrics.callsFailed    +
                        campaign.executionMetrics.callsNoAnswer;
      if (processed > 0) {
        campaign.executionMetrics.averageDuration =
          campaign.executionMetrics.totalDuration / processed;
      }
    }

    // Update lead record
    const lEntry = campaign.leads.find(
      l => (l.leadId?.toString() || l._id?.toString()) === leadId
    );
    if (lEntry) {
      lEntry.status      = twilioStatus === 'completed' ? 'completed'
                         : twilioStatus === 'no-answer' ? 'no-answer'
                         : 'failed';
      lEntry.completedAt = new Date();
    }

    campaign.executionMetrics.currentActiveSlots =
      [...state.slots.values()].filter(s => s.status === 'calling').length;

    await campaign.save();
  }

  emitProgress(campaignId, state, {
    callSid,
    callStatus:   twilioStatus,
    callDuration: extra.callDuration,
  });

  // ── Check campaign completion ────────────────────────────────────────────
  const allIdle    = [...state.slots.values()].every(s => s.status === 'idle');
  const queueEmpty = state.leadQueue.length === 0;

  if (allIdle && queueEmpty && state.status === 'running') {
    await completeCampaign(campaignId);
    return;
  }

  // ── Fill next lead into freed slot ───────────────────────────────────────
  if (state.status === 'running' && state.leadQueue.length > 0) {
    await fillSlots(campaignId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// initCampaign — start or re-start from paused state
// ─────────────────────────────────────────────────────────────────────────────
async function initCampaign(campaignId) {
  const cid      = campaignId.toString();
  const campaign = await Campaign.findById(cid);
  if (!campaign) throw new Error('Campaign not found');

  if (!['draft', 'paused'].includes(campaign.status)) {
    throw new Error(`Campaign is '${campaign.status}' — cannot start`);
  }

  const pending = campaign.leads
    .filter(l => l.status === 'pending')
    .map(l => ({
      leadId: (l.leadId?.toString() || l._id?.toString()),
      name:   l.name  || 'Unknown',
      phone:  l.phone || '',
    }));

  if (pending.length === 0) throw new Error('No pending leads in campaign');

  const existing = activeCampaigns.get(cid);
  const state = {
    status:     'running',
    leadQueue:  pending,
    slots:      existing?.slots || new Map(),
    totalLeads: campaign.executionMetrics?.totalLeads || campaign.leads.length,
    metrics: {
      completed: campaign.executionMetrics?.callsCompleted  || 0,
      failed:    campaign.executionMetrics?.callsFailed     || 0,
      noAnswer:  campaign.executionMetrics?.callsNoAnswer   || 0,
      voicemail: campaign.executionMetrics?.callsVoicemail  || 0,
    },
  };

  for (let i = 1; i <= 5; i++) {
    if (!state.slots.has(i)) {
      state.slots.set(i, { status: 'idle', callDocId: null, leadId: null, callSid: null });
    }
  }

  activeCampaigns.set(cid, state);

  campaign.status    = 'running';
  campaign.startedAt = campaign.startedAt || new Date();
  campaign.pausedAt  = null;
  await campaign.save();

  console.log(`[WORKER] Campaign ${cid} started — ${pending.length} pending leads`);
  await fillSlots(cid);

  return {
    status:     'running',
    queued:     pending.length,
    totalLeads: state.totalLeads,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// pauseCampaign
// ─────────────────────────────────────────────────────────────────────────────
async function pauseCampaign(campaignId) {
  const cid   = campaignId.toString();
  const state = activeCampaigns.get(cid);
  if (state) state.status = 'paused';

  await Campaign.findByIdAndUpdate(cid, { status: 'paused', pausedAt: new Date() });
  console.log(`[WORKER] Campaign paused: ${cid}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// resumeCampaign
// ─────────────────────────────────────────────────────────────────────────────
async function resumeCampaign(campaignId) {
  const cid   = campaignId.toString();
  const state = activeCampaigns.get(cid);

  if (!state) {
    // Server restarted — re-init from DB
    return initCampaign(cid);
  }

  if (state.status !== 'paused') throw new Error('Campaign is not paused');

  state.status = 'running';
  await Campaign.findByIdAndUpdate(cid, { status: 'running', pausedAt: null });
  console.log(`[WORKER] Campaign resumed: ${cid}`);

  await fillSlots(cid);
  return { status: 'running', queueRemaining: state.leadQueue.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// stopCampaign — permanent cancel, no resume
// ─────────────────────────────────────────────────────────────────────────────
async function stopCampaign(campaignId) {
  const cid   = campaignId.toString();
  const state = activeCampaigns.get(cid);

  if (state) {
    state.status    = 'stopped';
    state.leadQueue = [];
    activeCampaigns.delete(cid);
  }

  // Clean all callSid lookups for this campaign
  for (const [sid, entry] of callSidMap.entries()) {
    if (entry.campaignId === cid) callSidMap.delete(sid);
  }

  await Campaign.findByIdAndUpdate(cid, {
    status:      'cancelled',
    completedAt: new Date(),
    'executionMetrics.currentActiveSlots': 0,
  });

  const io = getIo();
  if (io) {
    io.emit('CAMPAIGN_PROGRESS', {
      campaignId,
      status:     'cancelled',
      percentage: null,
      message:    'Campaign stopped permanently by user',
    });
  }

  console.log(`[WORKER] Campaign stopped (cancelled): ${cid}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// completeCampaign
// ─────────────────────────────────────────────────────────────────────────────
async function completeCampaign(campaignId) {
  const cid = campaignId.toString();
  activeCampaigns.delete(cid);

  await Campaign.findByIdAndUpdate(cid, {
    status:      'completed',
    completedAt: new Date(),
    'executionMetrics.currentActiveSlots': 0,
  });

  const io = getIo();
  if (io) {
    io.emit('CAMPAIGN_PROGRESS', {
      campaignId,
      status:     'completed',
      percentage: 100,
      message:    'Campaign completed — all leads processed',
    });
  }

  console.log(`[WORKER] Campaign COMPLETED: ${cid}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// getCampaignState — snapshot of in-memory state
// ─────────────────────────────────────────────────────────────────────────────
function getCampaignState(campaignId) {
  const state = activeCampaigns.get(campaignId.toString());
  if (!state) return null;

  const processed = state.metrics.completed + state.metrics.failed +
                    state.metrics.noAnswer  + state.metrics.voicemail;

  return {
    status:         state.status,
    activeSlots:    [...state.slots.values()].filter(s => s.status === 'calling').length,
    queueRemaining: state.leadQueue.length,
    totalLeads:     state.totalLeads,
    processed,
    percentage:     state.totalLeads ? Math.round((processed / state.totalLeads) * 100) : 0,
    metrics:        state.metrics,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// recoverOnBoot — on server start, pause orphaned 'running' campaigns
// ─────────────────────────────────────────────────────────────────────────────
async function recoverOnBoot() {
  try {
    const count = await Campaign.countDocuments({ status: 'running' });
    if (count > 0) {
      await Campaign.updateMany(
        { status: 'running' },
        { status: 'paused', pausedAt: new Date() }
      );
      console.log(`[WORKER] Boot recovery: ${count} orphaned campaign(s) → paused`);
    }
  } catch (err) {
    console.error('[WORKER] Boot recovery error:', err.message);
  }
}

module.exports = {
  initCampaign,
  pauseCampaign,
  resumeCampaign,
  stopCampaign,
  completeCampaign,
  processCampaignNextCall,
  getCampaignState,
  recoverOnBoot,
};
