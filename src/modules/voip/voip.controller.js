'use strict';
const { VoipProvider, VoipNumber } = require('./voip.model.js');
const Agent   = require('../voice/agent.mongo.model.js');
const Twilio  = require('twilio');

// ─────────────────────────────────────────────────────
// GET /voip/provider
// ─────────────────────────────────────────────────────
const getVoipProvider = async (req, res) => {
  try {
    const provider = await VoipProvider.findOne({
      userId:   req.user._id,
      isActive: true,
    });

    if (!provider) {
      return res.json({ hasProvider: false, provider: null });
    }

    return res.json({
      hasProvider: true,
      provider: {
        id:          provider._id,
        provider:    provider.provider,
        isVerified:  provider.isVerified,
        // Mask accountSid — show first 6 and last 4 chars only
        accountSid:  provider.credentials.accountSid
          ? `${provider.credentials.accountSid.substring(0, 6)}...${provider.credentials.accountSid.slice(-4)}`
          : null,
        lastSyncedAt: provider.lastSyncedAt,
        createdAt:    provider.createdAt,
      },
    });
  } catch (err) {
    console.error('[VOIP] getVoipProvider error:', err);
    res.status(500).json({ error: 'Failed to fetch VOIP provider' });
  }
};

// ─────────────────────────────────────────────────────
// POST /voip/provider
// ─────────────────────────────────────────────────────
const addVoipProvider = async (req, res) => {
  try {
    const {
      provider,
      // Agent to auto-assign imported numbers to (optional — from Settings VOIP modal)
      agentId,
      // Twilio
      accountSid, authToken,
      // Generic / BlandAI / Vapi / Vonage / Other
      apiKey, secretKey, endpointUrl, httpMethod, headers, region,
      // SansPBX
      tokenEndpoint, dialEndpoint, accessToken, accessKey,
      appId, username, password, did,
    } = req.body;

    if (!provider) {
      return res.status(400).json({ error: 'Provider name is required' });
    }

    // Declare shared state before any provider validation block
    let didList    = [];
    let isVerified = false;

    // ── Twilio validation ──────────────────────────────
    if (provider === 'Twilio') {
      if (!accountSid || !authToken) {
        return res.status(400).json({
          error: 'Account SID and Auth Token are required for Twilio',
        });
      }
      try {
        const twilioClient = new Twilio(accountSid, authToken);
        await twilioClient.api.accounts(accountSid).fetch();
        isVerified = true;   // ← mark verified on successful API call
        console.log('[VOIP] Twilio credentials verified successfully');
      } catch (twilioErr) {
        console.error('[VOIP] Twilio verification failed:', twilioErr);
        return res.status(400).json({
          error: 'Invalid Twilio credentials. Please check your Account SID and Auth Token.',
        });
      }
    }

    // ── SansPBX validation ─────────────────────────────

    if (provider === 'SansPBX') {
      if (!tokenEndpoint || !dialEndpoint || !accessToken || !accessKey || !username || !password || !appId) {
        return res.status(400).json({
          error: 'Token endpoint, dial endpoint, access token, access key, username, password, and app ID are required for SansPBX',
        });
      }
      if (!did) {
        return res.status(400).json({ error: 'DID (phone number) is required for SansPBX' });
      }
      try {
        const nodeFetch = require('node-fetch');
        const fetchFn   = nodeFetch.default || nodeFetch;
        const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');

        console.log('[VOIP] SansPBX: Validating credentials...');
        const response = await fetchFn(tokenEndpoint, {
          method:  'POST',
          headers: {
            Accesstoken:    accessToken,
            'Content-Type': 'application/json',
            Authorization:  `Basic ${basicAuth}`,
          },
          body: JSON.stringify({ access_key: accessKey }),
        });

        if (!response.ok) {
          throw new Error(`Token generation failed with status ${response.status}`);
        }
        const data = await response.json();
        if (data.status !== 'success' || !data.Apitoken) {
          throw new Error(`Invalid response: ${JSON.stringify(data)}`);
        }

        console.log('[VOIP] SansPBX credentials validated successfully');
        isVerified = true;
        didList    = [{ number: did, friendlyName: `SansPBX DID ${did}`, region: 'India', country: 'IN', capabilities: { voice: true } }];
      } catch (sansPbxErr) {
        console.error('[VOIP] SansPBX validation failed:', sansPbxErr);
        return res.status(400).json({ error: 'Invalid SansPBX credentials or endpoint. ' + sansPbxErr.message });
      }
    }

    // ── TataTele (Smartflo) validation ────────────────────
    if (provider === 'TataTele') {
      if (!apiKey) {
        return res.status(400).json({ error: 'Click-to-Call API Key is required for TataTele' });
      }
      if (!endpointUrl) {
        return res.status(400).json({ error: 'Click-to-Call Endpoint URL is required for TataTele' });
      }
      if (!did) {
        return res.status(400).json({ error: 'DID (phone number) is required for TataTele' });
      }
      // Mark as verified — we trust credentials since there is no dry-run token API
      console.log('[VOIP] TataTele: credentials accepted (live validation on first call)');
      isVerified = true;
      didList    = [{ number: did, friendlyName: `Smartflo DID ${did}`, region: 'India', country: 'IN', capabilities: { voice: true } }];
    }

    // ── Other provider validation ──────────────────────
    if (provider === 'Other') {
      if (!apiKey || !secretKey || !endpointUrl) {
        return res.status(400).json({
          error: 'API Key, Secret Key, and Endpoint URL are required for Other providers',
        });
      }
      try {
        const nodeFetch = require('node-fetch');
        const fetchFn   = nodeFetch.default || nodeFetch;
        const response  = await fetchFn(endpointUrl, {
          method:  httpMethod || 'GET',
          headers: { Authorization: `Bearer ${apiKey}:${secretKey}`, ...(headers || {}) },
        });
        if (!response.ok) throw new Error('Failed to validate VOIP API');
        const data = await response.json();
        didList = data.dids || data.numbers || [];
        if (!Array.isArray(didList) || didList.length === 0) {
          throw new Error('No DIDs found for this VOIP provider');
        }
        isVerified = true;
      } catch (otherErr) {
        console.error('[VOIP] Other provider validation failed:', otherErr);
        return res.status(400).json({ error: 'Invalid VOIP API credentials or endpoint. ' + otherErr.message });
      }
    }

    // ── Generic providers (BlandAI, Vapi, Vonage) ─────
    if (['BlandAI', 'Vapi', 'Vonage'].includes(provider)) {
      if (!apiKey) {
        return res.status(400).json({ error: 'API Key is required for ' + provider });
      }
      // Mark as verified on trust — no live validation endpoint for these
      isVerified = true;
    }

    // ── Check for existing provider (reconnect / update) ──
    const existingProvider = await VoipProvider.findOne({
      userId:   req.user._id,
      provider: provider,
      isActive: true,
    });

    let savedProvider;

    if (existingProvider) {
      console.log(`[VOIP] Updating existing ${provider} provider`);
      existingProvider.credentials = {
        accountSid:    accountSid    || existingProvider.credentials.accountSid,
        authToken:     authToken     || existingProvider.credentials.authToken,
        apiKey:        apiKey        || existingProvider.credentials.apiKey,
        secretKey:     secretKey     || existingProvider.credentials.secretKey,
        endpointUrl:   endpointUrl   || existingProvider.credentials.endpointUrl,
        httpMethod:    httpMethod    || existingProvider.credentials.httpMethod,
        headers:       headers       || existingProvider.credentials.headers,
        region:        region        || existingProvider.credentials.region,
        tokenEndpoint: tokenEndpoint || existingProvider.credentials.tokenEndpoint,
        dialEndpoint:  dialEndpoint  || existingProvider.credentials.dialEndpoint,
        accessToken:   accessToken   || existingProvider.credentials.accessToken,
        accessKey:     accessKey     || existingProvider.credentials.accessKey,
        appId:         appId         || existingProvider.credentials.appId,
        username:      username      || existingProvider.credentials.username,
        password:      password      || existingProvider.credentials.password,
      };
      existingProvider.isVerified  = isVerified;
      existingProvider.lastSyncedAt = new Date();
      savedProvider = await existingProvider.save();
      console.log(`[VOIP] ${provider} provider updated`);
    } else {
      // Deactivate any OTHER providers for this user
      await VoipProvider.updateMany(
        { userId: req.user._id, provider: { $ne: provider } },
        { isActive: false }
      );

      console.log(`[VOIP] Creating new ${provider} provider`);
      savedProvider = await VoipProvider.create({
        userId:   req.user._id,
        provider,
        credentials: {
          accountSid:    accountSid    || null,
          authToken:     authToken     || null,
          apiKey:        apiKey        || null,
          secretKey:     secretKey     || null,
          endpointUrl:   endpointUrl   || null,
          httpMethod:    httpMethod    || null,
          headers:       headers       || null,
          region:        region        || null,
          tokenEndpoint: tokenEndpoint || null,
          dialEndpoint:  dialEndpoint  || null,
          accessToken:   accessToken   || null,
          accessKey:     accessKey     || null,
          appId:         appId         || null,
          username:      username      || null,
          password:      password      || null,
        },
        isVerified,
        isActive:     true,
        lastSyncedAt: new Date(),
      });
    }

    // ── Import numbers from Twilio ─────────────────────
    if (provider === 'Twilio' && accountSid && authToken) {
      try {
        const twilioClient = new Twilio(accountSid, authToken);
        const numbers      = await twilioClient.incomingPhoneNumbers.list({ limit: 50 });
        let importedCount  = 0;
        for (const number of numbers) {
          try {
            await VoipNumber.findOneAndUpdate(
              { userId: req.user._id, phoneNumber: number.phoneNumber },
              {
                userId:       req.user._id,
                providerId:   savedProvider._id,
                phoneNumber:  number.phoneNumber,
                friendlyName: number.friendlyName || number.phoneNumber,
                region:       number.region       || 'Unknown',
                country:      number.isoCountry   || 'US',
                capabilities: {
                  voice: number.capabilities?.voice !== false,
                  sms:   number.capabilities?.sms   !== false,
                  mms:   number.capabilities?.mms   === true,
                },
                status: 'active',
                source: 'imported',
                providerData: {
                  sid:          number.sid,
                  capabilities: number.capabilities,
                },
                // Auto-assign to selected agent if agentId supplied; else leave unassigned
                assignedAgentId: agentId || null,
              },
              { upsert: true, new: true }
            );
            importedCount++;
          } catch (numErr) {
            console.warn(`[VOIP] Failed to import Twilio number ${number.phoneNumber}:`, numErr.message);
          }
        }

        // ── Fallback: if Twilio account has no incomingPhoneNumbers, register
        //    the TWILIO_FROM_NUMBER env var as a known DID (outbound caller ID)
        if (importedCount === 0) {
          const envFromNumber = process.env.TWILIO_FROM_NUMBER;
          if (envFromNumber) {
            try {
              await VoipNumber.findOneAndUpdate(
                { userId: req.user._id, phoneNumber: envFromNumber },
                {
                  userId:          req.user._id,
                  providerId:      savedProvider._id,
                  phoneNumber:     envFromNumber,
                  friendlyName:    `Twilio Caller ID ${envFromNumber}`,
                  region:          'Unknown',
                  country:         'US',
                  capabilities:    { voice: true, sms: false, mms: false },
                  status:          'active',
                  source:          'imported',
                  providerData:    { note: 'Registered from TWILIO_FROM_NUMBER env var' },
                  assignedAgentId: agentId || null,
                },
                { upsert: true, new: true }
              );
              importedCount++;
              console.log(`[VOIP] No incomingPhoneNumbers found — registered env TWILIO_FROM_NUMBER: ${envFromNumber}`);
            } catch (envErr) {
              console.warn('[VOIP] Failed to register TWILIO_FROM_NUMBER fallback:', envErr.message);
            }
          }
        }

        console.log(`[VOIP] Imported ${importedCount} Twilio numbers${agentId ? ` → auto-assigned to agent ${agentId}` : ' (no auto-assignment)'}`);
      } catch (importErr) {
        console.error('[VOIP] Failed to import Twilio numbers:', importErr);
      }
    }

    // ── Import DIDs from SansPBX ───────────────────────
    if (provider === 'SansPBX' && isVerified && didList.length > 0) {
      let importedCount = 0;
      for (const d of didList) {
        try {
          const phoneNumber = d.number || d.did || d;
          // Remove any stale record owned by another user for this number
          await VoipNumber.deleteMany({ phoneNumber, userId: { $ne: req.user._id } });
          await VoipNumber.findOneAndUpdate(
            { userId: req.user._id, phoneNumber },
            {
              userId:          req.user._id,
              providerId:      savedProvider._id,
              phoneNumber,
              friendlyName:    d.friendlyName || d.name || phoneNumber,
              region:          d.region    || 'India',
              country:         d.country   || 'IN',
              capabilities:    d.capabilities || { voice: true },
              status:          'active',
              source:          'imported',
              providerData:    d,
              assignedAgentId: agentId || null,
            },
            { upsert: true, new: true }
          );
          importedCount++;
        } catch (didErr) {
          console.warn(`[VOIP] Failed to import SansPBX DID ${d.number || d}:`, didErr.message);
        }
      }
      console.log(`[VOIP] Imported ${importedCount} SansPBX DIDs${agentId ? ` → auto-assigned to agent ${agentId}` : ' (no auto-assignment)'}`);
    }

    // ── Import DIDs from Other provider ───────────────
    if (provider === 'Other' && isVerified && didList.length > 0) {
      let importedCount = 0;
      for (const d of didList) {
        try {
          const phoneNumber = d.number || d.did || d;
          await VoipNumber.findOneAndUpdate(
            { userId: req.user._id, phoneNumber },
            {
              userId:          req.user._id,
              providerId:      savedProvider._id,
              phoneNumber,
              friendlyName:    d.friendlyName || d.name || phoneNumber,
              region:          d.region    || region || 'Unknown',
              country:         d.country   || 'Unknown',
              capabilities:    d.capabilities || { voice: true },
              status:          'active',
              source:          'imported',
              providerData:    d,
              assignedAgentId: agentId || null,
            },
            { upsert: true, new: true }
          );
          importedCount++;
        } catch (didErr) {
          console.warn(`[VOIP] Failed to import Other DID ${d.number || d}:`, didErr.message);
        }
      }
      console.log(`[VOIP] Imported ${importedCount} Other provider DIDs (no auto-assignment)`);
    }

    return res.json({
      success:      true,
      message:      agentId
        ? 'VOIP provider connected and numbers assigned to agent'
        : 'VOIP provider connected. Assign a number to an agent to start calling.',
      provider: {
        id:           savedProvider._id,
        provider:     savedProvider.provider,
        isVerified:   savedProvider.isVerified,
        dids:         didList,
      },
      autoAssigned: !!agentId,
      assignedAgent: agentId || null,
    });
  } catch (err) {
    console.error('[VOIP] addVoipProvider error:', err);

    let errorMessage = 'Failed to add VOIP provider';
    let statusCode   = 500;

    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'unknown';
      const value = err.keyValue?.[field] || 'value';
      if (field === 'phoneNumber') {
        errorMessage = `Phone number ${value} already exists. To clear old data call POST /voip/cleanup first.`;
      } else {
        errorMessage = `Duplicate VOIP ${field}: ${value}. A provider with this ${field} already exists.`;
      }
      statusCode = 400;
    } else if (err.message?.includes('validation failed')) {
      errorMessage = `Validation error: ${err.message}`;
      statusCode   = 400;
    }

    return res.status(statusCode).json({ error: errorMessage, code: err.code || 'VOIP_ERROR', details: err.message });
  }
};

// ─────────────────────────────────────────────────────
// GET /voip/numbers
// ─────────────────────────────────────────────────────
const getVoipNumbers = async (req, res) => {
  try {
    const numbers = await VoipNumber.find({ userId: req.user._id, status: 'active' })
      .populate('providerId', 'provider isActive')
      .sort({ createdAt: -1 });

    // Fetch agent names for any assigned agent IDs
    const agentIds = [...new Set(numbers.map(n => n.assignedAgentId).filter(Boolean))];
    const agents   = agentIds.length
      ? await Agent.find({ _id: { $in: agentIds } }).lean()
      : [];
    const agentMap = Object.fromEntries(agents.map(a => [a._id.toString(), a]));

    const formatted = numbers.map((num) => {
      const agentDoc = num.assignedAgentId ? agentMap[num.assignedAgentId.toString()] : null;
      return {
        _id:          num._id,
        id:           num._id,
        phoneNumber:  num.phoneNumber,
        number:       num.phoneNumber,
        friendlyName: num.friendlyName,
        region:       num.region,
        country:      num.country,
        capabilities: num.capabilities,
        voipProvider: num.providerId
          ? { _id: num.providerId._id, provider: num.providerId.provider, isActive: num.providerId.isActive }
          : null,
        assignedAgent: num.assignedAgentId
          ? { id: num.assignedAgentId, agentId: num.assignedAgentId, name: agentDoc?.name || agentDoc?.agentName || num.assignedAgentId }
          : null,
        monthlyCost: num.monthlyCost,
        source:      num.source,
        createdAt:   num.createdAt,
      };
    });

    return res.json({ numbers: formatted });
  } catch (err) {
    console.error('[VOIP] getVoipNumbers error:', err);
    res.status(500).json({ error: 'Failed to fetch phone numbers' });
  }
};

// ─────────────────────────────────────────────────────
// POST /voip/numbers/sync  (Twilio only)
// ─────────────────────────────────────────────────────
const syncVoipNumbers = async (req, res) => {
  try {
    const provider = await VoipProvider.findOne({ userId: req.user._id, isActive: true });

    if (!provider) {
      return res.status(404).json({ error: 'No active VOIP provider found' });
    }
    if (provider.provider !== 'Twilio') {
      return res.status(400).json({ error: 'Sync is only supported for Twilio' });
    }

    const creds       = provider.getDecryptedCredentials();
    const twilioClient = new Twilio(creds.accountSid, creds.authToken);
    const numbers      = await twilioClient.incomingPhoneNumbers.list({ limit: 50 });

    let imported = 0;
    for (const number of numbers) {
      try {
        await VoipNumber.findOneAndUpdate(
          { userId: req.user._id, phoneNumber: number.phoneNumber },
          {
            userId:       req.user._id,
            providerId:   provider._id,
            phoneNumber:  number.phoneNumber,
            friendlyName: number.friendlyName || number.phoneNumber,
            region:       number.region       || 'Unknown',
            country:      number.isoCountry   || 'US',
            capabilities: {
              voice: number.capabilities?.voice !== false,
              sms:   number.capabilities?.sms   !== false,
              mms:   number.capabilities?.mms   === true,
            },
            status: 'active',
            source: 'imported',
            providerData: { sid: number.sid, capabilities: number.capabilities },
          },
          { upsert: true, new: true }
        );
        imported++;
      } catch (numErr) {
        console.warn(`[VOIP] Failed to sync ${number.phoneNumber}:`, numErr.message);
      }
    }

    provider.lastSyncedAt = new Date();
    await provider.save();

    return res.json({ success: true, message: `Successfully synced ${imported} numbers`, count: imported });
  } catch (err) {
    console.error('[VOIP] syncVoipNumbers error:', err);
    res.status(500).json({ error: 'Failed to sync phone numbers' });
  }
};

// ─────────────────────────────────────────────────────
// POST /voip/numbers/assign
// ─────────────────────────────────────────────────────
const assignNumberToAgent = async (req, res) => {
  try {
    const { numberId, agentId } = req.body;
    if (!numberId || !agentId) {
      return res.status(400).json({ error: 'Number ID and Agent ID are required' });
    }

    const number = await VoipNumber.findOne({ _id: numberId, userId: req.user._id, status: 'active' });
    if (!number) {
      return res.status(404).json({ error: 'Phone number not found' });
    }

    const agent = await Agent.findOne({ agentId });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Enforce 1 agent = 1 number
    const existingAssignment = await VoipNumber.findOne({
      userId:          req.user._id,
      assignedAgentId: agentId,
      status:          'active',
    });
    if (existingAssignment && existingAssignment._id.toString() !== numberId) {
      return res.status(400).json({
        error: `This agent is already assigned to ${existingAssignment.phoneNumber}. Unassign it first.`,
      });
    }

    number.assignedAgentId = agentId;
    await number.save();

    return res.json({
      success: true,
      message: 'Number assigned successfully',
      number:  { id: number._id, number: number.phoneNumber, assignedAgent: { id: agent._id, name: agent.name } },
    });
  } catch (err) {
    console.error('[VOIP] assignNumberToAgent error:', err);
    res.status(500).json({ error: 'Failed to assign number to agent' });
  }
};

// ─────────────────────────────────────────────────────
// POST /voip/numbers/unassign
// ─────────────────────────────────────────────────────
const unassignNumber = async (req, res) => {
  try {
    const { numberId } = req.body;
    if (!numberId) {
      return res.status(400).json({ error: 'Number ID is required' });
    }

    const number = await VoipNumber.findOne({ _id: numberId, userId: req.user._id, status: 'active' });
    if (!number) {
      return res.status(404).json({ error: 'Phone number not found' });
    }

    number.assignedAgentId = null;
    await number.save();

    return res.json({ success: true, message: 'Number unassigned successfully' });
  } catch (err) {
    console.error('[VOIP] unassignNumber error:', err);
    res.status(500).json({ error: 'Failed to unassign number' });
  }
};

// ─────────────────────────────────────────────────────
// POST /voip/numbers/release
// ─────────────────────────────────────────────────────
const releaseNumber = async (req, res) => {
  try {
    const { numberId } = req.body;
    if (!numberId) {
      return res.status(400).json({ error: 'Number ID is required' });
    }

    const number = await VoipNumber.findOne({ _id: numberId, userId: req.user._id, status: 'active' });
    if (!number) {
      return res.status(404).json({ error: 'Phone number not found' });
    }

    number.status          = 'released';
    number.assignedAgentId = null;
    await number.save();

    return res.json({ success: true, message: 'Number released successfully' });
  } catch (err) {
    console.error('[VOIP] releaseNumber error:', err);
    res.status(500).json({ error: 'Failed to release number' });
  }
};

// ─────────────────────────────────────────────────────
// GET /voip/numbers/available?country=US&areaCode=415
// Twilio only
// ─────────────────────────────────────────────────────
const getAvailableNumbers = async (req, res) => {
  try {
    const { country = 'US', areaCode } = req.query;

    const provider = await VoipProvider.findOne({
      userId: req.user._id, isActive: true, provider: 'Twilio',
    });
    if (!provider) {
      return res.status(404).json({ error: 'Twilio provider not configured' });
    }

    const creds       = provider.getDecryptedCredentials();
    const twilioClient = new Twilio(creds.accountSid, creds.authToken);

    const searchParams = { limit: 10 };
    if (areaCode) searchParams.areaCode = areaCode;

    const available = await twilioClient.availablePhoneNumbers(country).local.list(searchParams);

    const formatted = available.map((num) => ({
      phoneNumber:   num.phoneNumber,
      friendlyName:  num.friendlyName,
      locality:      num.locality,
      region:        num.region,
      country:       num.isoCountry,
      capabilities:  num.capabilities,
      estimatedCost: 1.15,
    }));

    return res.json({ numbers: formatted });
  } catch (err) {
    console.error('[VOIP] getAvailableNumbers error:', err);
    res.status(500).json({ error: 'Failed to fetch available numbers' });
  }
};

// ─────────────────────────────────────────────────────
// POST /voip/numbers/purchase  (Twilio only)
// ─────────────────────────────────────────────────────
const purchaseNumber = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const provider = await VoipProvider.findOne({
      userId: req.user._id, isActive: true, provider: 'Twilio',
    });
    if (!provider) {
      return res.status(404).json({ error: 'Twilio provider not configured' });
    }

    const creds        = provider.getDecryptedCredentials();
    const twilioClient = new Twilio(creds.accountSid, creds.authToken);

    const purchased = await twilioClient.incomingPhoneNumbers.create({ phoneNumber });

    const newNumber = await VoipNumber.create({
      userId:       req.user._id,
      providerId:   provider._id,
      phoneNumber:  purchased.phoneNumber,
      friendlyName: purchased.friendlyName || purchased.phoneNumber,
      region:       purchased.region       || 'Unknown',
      country:      purchased.isoCountry   || 'US',
      capabilities: {
        voice: purchased.capabilities?.voice !== false,
        sms:   purchased.capabilities?.sms   !== false,
        mms:   purchased.capabilities?.mms   === true,
      },
      status:      'active',
      source:      'purchased',
      monthlyCost: 1.15,
      providerData: { sid: purchased.sid, capabilities: purchased.capabilities },
    });

    return res.json({
      success: true,
      message: 'Number purchased successfully',
      number:  { id: newNumber._id, number: newNumber.phoneNumber, region: newNumber.region },
    });
  } catch (err) {
    console.error('[VOIP] purchaseNumber error:', err);
    res.status(500).json({ error: err.message || 'Failed to purchase number' });
  }
};

// ─────────────────────────────────────────────────────
// DELETE /voip/numbers/:numberId
// ─────────────────────────────────────────────────────
const mongoose = require('mongoose');

const deleteVoipNumber = async (req, res) => {
  try {
    const { numberId } = req.params;
    if (!numberId) {
      return res.status(400).json({ error: 'Number ID is required' });
    }
    if (!mongoose.isValidObjectId(numberId)) {
      return res.status(400).json({ error: 'Invalid number ID format' });
    }

    const number = await VoipNumber.findOne({ _id: numberId, userId: req.user._id });
    if (!number) {
      return res.status(404).json({ error: 'Phone number not found' });
    }

    const { providerId, phoneNumber, assignedAgentId } = number;

    await VoipNumber.deleteOne({ _id: numberId });

    // If number had an assigned agent, try to promote next available number
    let replacementNumber = null;
    if (assignedAgentId) {
      const nextAvailable = await VoipNumber.findOne({
        providerId,
        userId:          req.user._id,
        assignedAgentId: null,
        status:          'active',
      }).sort({ createdAt: 1 });

      if (nextAvailable) {
        nextAvailable.assignedAgentId = assignedAgentId;
        await nextAvailable.save();
        replacementNumber = nextAvailable.phoneNumber;
        console.log(`[VOIP] Auto-promoted ${replacementNumber} to agent ${assignedAgentId}`);
      } else {
        console.warn(`[VOIP] No replacement number found for agent ${assignedAgentId}`);
      }
    }

    // Deactivate provider if no active numbers remain
    const remainingCount = await VoipNumber.countDocuments({ providerId, status: 'active' });
    if (remainingCount === 0) {
      await VoipProvider.updateOne({ _id: providerId }, { isActive: false });
      console.log(`[VOIP] Deactivated provider ${providerId} (no active numbers remaining)`);
    }

    return res.json({
      success:           true,
      message:           `VOIP number ${phoneNumber} deleted successfully`,
      replacementNumber: replacementNumber || null,
      providerId,
      remainingNumbers:  remainingCount,
    });
  } catch (err) {
    console.error('[VOIP] deleteVoipNumber error:', err);
    res.status(500).json({ error: 'Failed to delete VOIP number' });
  }
};

// ─────────────────────────────────────────────────────
// POST /voip/setup-registration
// One-shot setup during onboarding — auto-assigns first DID to default agent
// ─────────────────────────────────────────────────────
const setupVoipForRegistration = async (req, res) => {
  try {
    const {
      provider,
      accountSid, authToken,
      apiKey, secretKey, endpointUrl, httpMethod, headers, region,
      customScript,
    } = req.body;

    if (!provider) {
      return res.status(400).json({ error: 'Provider name is required' });
    }

    let didList    = [];
    let isVerified = false;

    if (provider === 'Twilio') {
      if (!accountSid || !authToken) {
        return res.status(400).json({ error: 'Account SID and Auth Token are required for Twilio' });
      }
      try {
        const twilioClient = new Twilio(accountSid, authToken);
        const account      = await twilioClient.api.accounts(accountSid).fetch();
        isVerified         = !!account.sid;
      } catch (twilioErr) {
        console.error('[VOIP] Twilio verification failed:', twilioErr);
        return res.status(400).json({ error: 'Invalid Twilio credentials.' });
      }
    } else {
      if (!apiKey || !secretKey || !endpointUrl) {
        return res.status(400).json({ error: 'API Key, Secret Key, and Endpoint URL are required' });
      }
      try {
        const nodeFetch = require('node-fetch');
        const fetchFn   = nodeFetch.default || nodeFetch;
        const response  = await fetchFn(endpointUrl, {
          method:  httpMethod || 'GET',
          headers: { Authorization: `Bearer ${apiKey}:${secretKey}`, ...(headers || {}) },
        });
        if (!response.ok) throw new Error('Failed to validate VOIP API');
        const data = await response.json();
        didList    = data.dids || data.numbers || [];
        if (!Array.isArray(didList) || didList.length === 0) {
          throw new Error('No DIDs found for this VOIP provider');
        }
        isVerified = true;
      } catch (err) {
        return res.status(400).json({ error: 'Invalid VOIP API credentials or endpoint. ' + err.message });
      }
    }

    // Deactivate ALL existing providers for this user
    await VoipProvider.updateMany({ userId: req.user._id }, { isActive: false });

    const newProvider = await VoipProvider.create({
      userId:   req.user._id,
      provider,
      credentials: {
        accountSid: accountSid || null,
        authToken:  authToken  || null,
        apiKey:     apiKey     || null,
        secretKey:  secretKey  || null,
        endpointUrl, httpMethod, headers, region,
      },
      customScript:  customScript || null,
      isVerified,
      isActive:      true,
      lastSyncedAt:  new Date(),
    });

    // Import Twilio numbers
    if (provider === 'Twilio' && accountSid && authToken) {
      try {
        const twilioClient  = new Twilio(accountSid, authToken);
        const numbers       = await twilioClient.incomingPhoneNumbers.list({ limit: 50 });
        const importedNums  = [];
        for (const n of numbers) {
          try {
            await VoipNumber.findOneAndUpdate(
              { userId: req.user._id, phoneNumber: n.phoneNumber },
              {
                userId: req.user._id, providerId: newProvider._id,
                phoneNumber: n.phoneNumber, friendlyName: n.friendlyName || n.phoneNumber,
                region: n.region || 'Unknown', country: n.isoCountry || 'US',
                capabilities: { voice: true, sms: true, mms: false },
                status: 'active', source: 'imported',
                providerData: { sid: n.sid, capabilities: n.capabilities },
              },
              { upsert: true, new: true }
            );
            importedNums.push({ number: n.phoneNumber, sid: n.sid });
          } catch (numErr) {
            console.warn(`[VOIP] Failed to import ${n.phoneNumber}:`, numErr.message);
          }
        }
        didList = importedNums;
        console.log(`[VOIP] Imported ${importedNums.length} Twilio numbers`);
      } catch (importErr) {
        console.error('[VOIP] Failed to import Twilio numbers:', importErr);
      }
    }

    // Import Other provider DIDs
    if (provider !== 'Twilio' && isVerified && didList.length > 0) {
      for (const d of didList) {
        try {
          const phoneNumber = d.number || d.did || d;
          await VoipNumber.findOneAndUpdate(
            { userId: req.user._id, phoneNumber },
            {
              userId: req.user._id, providerId: newProvider._id, phoneNumber,
              friendlyName: d.friendlyName || d.name || phoneNumber,
              region: d.region || region || 'Unknown', country: d.country || 'Unknown',
              capabilities: d.capabilities || { voice: true },
              status: 'active', source: 'imported', providerData: d,
            },
            { upsert: true, new: true }
          );
        } catch (didErr) {
          console.warn(`[VOIP] Failed to import DID:`, didErr.message);
        }
      }
    }

    // Auto-assign first DID to user's first/default agent
    if (didList.length > 0) {
      try {
        const defaultAgent = await Agent.findOne({ userId: req.user._id }).sort({ createdAt: 1 })
          || await Agent.findOne({}).sort({ createdAt: 1 });  // fallback to any agent (seeded default)
        if (defaultAgent) {
          const firstPhone = didList[0].number || didList[0].phoneNumber || didList[0];
          const firstDID   = await VoipNumber.findOne({ userId: req.user._id, providerId: newProvider._id, phoneNumber: firstPhone });
          if (firstDID) {
            firstDID.assignedAgentId = defaultAgent.agentId;  // use string agentId, not ObjectId _id
            await firstDID.save();
            console.log(`[VOIP] Auto-assigned to agent ${defaultAgent.agentId} (${defaultAgent.name})`);
          }
        }
      } catch (assignErr) {
        console.error('[VOIP] Failed to auto-assign DID:', assignErr);
      }
    }

    return res.json({
      success:      true,
      message:      'VOIP provider setup complete',
      provider:     { id: newProvider._id, provider: newProvider.provider, isVerified: newProvider.isVerified },
      dids:         didList,
      autoAssigned: didList.length > 0,
    });
  } catch (err) {
    console.error('[VOIP] setupVoipForRegistration error:', err);
    res.status(500).json({ error: 'Failed to setup VOIP provider' });
  }
};

// ─────────────────────────────────────────────────────
// POST /voip/cleanup  (dev/testing only)
// ─────────────────────────────────────────────────────
const cleanupVoipForUser = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production' && !req.headers['x-cleanup-key']) {
      return res.status(403).json({ error: 'Cleanup endpoint not available in production' });
    }

    const deletedNumbers   = await VoipNumber.deleteMany({ userId: req.user._id });
    const deletedProviders = await VoipProvider.deleteMany({ userId: req.user._id });

    console.log(`[VOIP] Cleanup: Deleted ${deletedNumbers.deletedCount} numbers and ${deletedProviders.deletedCount} providers for user ${req.user._id}`);

    return res.json({
      success: true,
      message: 'VOIP data cleaned up',
      deleted: { numbers: deletedNumbers.deletedCount, providers: deletedProviders.deletedCount },
    });
  } catch (err) {
    console.error('[VOIP] cleanupVoipForUser error:', err);
    res.status(500).json({ error: 'Failed to cleanup VOIP data' });
  }
};

module.exports = {
  getVoipProvider,
  addVoipProvider,
  getVoipNumbers,
  syncVoipNumbers,
  assignNumberToAgent,
  unassignNumber,
  releaseNumber,
  getAvailableNumbers,
  purchaseNumber,
  deleteVoipNumber,
  setupVoipForRegistration,
  cleanupVoipForUser,
};
