import { VoipProvider, VoipNumber } from "./voip.model.js";
import Agent from "../agent/agent.model.js";
import Twilio from "twilio";

/**
 * Get current VOIP provider configuration
 */
export const getVoipProvider = async (req, res) => {
  try {
    const provider = await VoipProvider.findOne({
      userId: req.user._id,
      isActive: true,
    });

    if (!provider) {
      return res.json({
        hasProvider: false,
        provider: null,
      });
    }

    // Don't send full credentials to frontend
    return res.json({
      hasProvider: true,
      provider: {
        id: provider._id,
        provider: provider.provider,
        isVerified: provider.isVerified,
        accountSid: provider.credentials.accountSid
          ? `${provider.credentials.accountSid.substring(0, 6)}...${provider.credentials.accountSid.slice(-4)}`
          : null,
        lastSyncedAt: provider.lastSyncedAt,
        createdAt: provider.createdAt,
      },
    });
  } catch (error) {
    console.error("Get VOIP provider error:", error);
    res.status(500).json({ error: "Failed to fetch VOIP provider" });
  }
};

/**
 * Add/Update VOIP provider credentials
 */
export const addVoipProvider = async (req, res) => {
  try {
    const {
      provider,
      accountSid,
      authToken,
      apiKey,
      secretKey,
      endpointUrl,
      httpMethod,
      headers,
      region,
      // SansPBX specific
      tokenEndpoint,
      dialEndpoint,
      accessToken,
      accessKey,
      appId,
      username,
      password,
      did,
      agentId  // CRITICAL: Receive agentId from frontend to auto-assign DID
    } = req.body;

    if (!provider) {
      return res.status(400).json({ error: "Provider name is required" });
    }

    // Twilio validation (existing logic)
    if (provider === "Twilio") {
      if (!accountSid || !authToken) {
        return res.status(400).json({
          error: "Account SID and Auth Token are required for Twilio",
        });
      }
      try {
        const twilioClient = new Twilio(accountSid, authToken);
        await twilioClient.api.accounts(accountSid).fetch();
      } catch (twilioError) {
        console.error("Twilio verification failed:", twilioError);
        return res.status(400).json({
          error: "Invalid Twilio credentials. Please check your Account SID and Auth Token.",
        });
      }
    }

    // SansPBX validation
    let didList = [];
    let isVerified = false;
    if (provider === "SansPBX") {
      if (!tokenEndpoint || !dialEndpoint || !accessToken || !accessKey || !username || !password || !appId) {
        return res.status(400).json({ error: "Token endpoint, dial endpoint, access token, access key, username, password, and app ID are required for SansPBX" });
      }
      if (!did) {
        return res.status(400).json({ error: "DID (phone number) is required for SansPBX" });
      }

      // Validate SansPBX credentials
      try {
        const fetch = (await import('node-fetch')).default;

        // Create Basic auth header
        const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');

        console.log("🔐 SansPBX: Validating credentials...");

        const response = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: {
            'Accesstoken': accessToken,
            'Content-Type': 'application/json',
            'Authorization': `Basic ${basicAuth}`
          },
          body: JSON.stringify({ access_key: accessKey })
        });

        if (!response.ok) {
          throw new Error(`Token generation failed with status ${response.status}`);
        }

        const data = await response.json();
        if (data.status !== 'success' || !data.Apitoken) {
          throw new Error(`Invalid response: ${JSON.stringify(data)}`);
        }

        console.log("✅ SansPBX credentials validated successfully");
        isVerified = true;

        // Add the DID to the list
        didList = [{
          number: did,
          friendlyName: `SansPBX DID ${did}`,
          region: "India",
          country: "IN",
          capabilities: { voice: true }
        }];
      } catch (err) {
        console.error("SansPBX validation failed:", err);
        return res.status(400).json({ error: "Invalid SansPBX credentials or endpoint. " + err.message });
      }
    }

    // Other provider validation
    if (provider === "Other") {
      if (!apiKey || !secretKey || !endpointUrl) {
        return res.status(400).json({ error: "API Key, Secret Key, and Endpoint URL are required for Other providers" });
      }
      // Basic validation: try to fetch DIDs from the endpoint
      try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(endpointUrl, {
          method: httpMethod || 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}:${secretKey}`,
            ...(headers || {})
          }
        });
        if (!response.ok) throw new Error('Failed to validate VOIP API');
        const data = await response.json();
        // Assume DIDs are in data.dids or data.numbers (customize as needed)
        didList = data.dids || data.numbers || [];
        if (!Array.isArray(didList) || didList.length === 0) {
          throw new Error('No DIDs found for this VOIP provider');
        }
        isVerified = true;
      } catch (err) {
        console.error("Other VOIP validation failed:", err);
        return res.status(400).json({ error: "Invalid VOIP API credentials or endpoint. " + err.message });
      }
    }

    // Deactivate existing providers
    await VoipProvider.updateMany(
      { userId: req.user._id },
      { isActive: false }
    );

    // Create new provider
    const newProvider = await VoipProvider.create({
      userId: req.user._id,
      provider,
      credentials: {
        // Twilio
        accountSid: accountSid || null,
        authToken: authToken || null,
        // Generic providers
        apiKey: apiKey || null,
        secretKey: secretKey || null,
        endpointUrl: endpointUrl || null,
        httpMethod: httpMethod || null,
        headers: headers || null,
        region: region || null,
        // SansPBX specific
        tokenEndpoint: tokenEndpoint || null,
        dialEndpoint: dialEndpoint || null,
        accessToken: accessToken || null,
        accessKey: accessKey || null,
        appId: appId || null,
        username: username || null,
        password: password || null,
      },
      isVerified,
      isActive: true,
      lastSyncedAt: new Date(),
    });

    // If Twilio, immediately fetch and import numbers
    if (provider === "Twilio" && accountSid && authToken) {
      try {
        const twilioClient = new Twilio(accountSid, authToken);
        const numbers = await twilioClient.incomingPhoneNumbers.list({ limit: 50 });
        for (let idx = 0; idx < numbers.length; idx++) {
          const number = numbers[idx];
          await VoipNumber.findOneAndUpdate(
            {
              userId: req.user._id,
              phoneNumber: number.phoneNumber,
            },
            {
              userId: req.user._id,
              providerId: newProvider._id,
              phoneNumber: number.phoneNumber,
              friendlyName: number.friendlyName || number.phoneNumber,
              region: number.region || "Unknown",
              country: number.isoCountry || "US",
              capabilities: {
                voice: number.capabilities?.voice || true,
                sms: number.capabilities?.sms || true,
                mms: number.capabilities?.mms || false,
              },
              status: "active",
              source: "imported",
              providerData: {
                sid: number.sid,
                capabilities: number.capabilities,
                addressRequirements: number.addressRequirements,
              },
              // CRITICAL: Auto-assign first number to the selected agent
              assignedAgentId: idx === 0 && agentId ? agentId : null,
            },
            { upsert: true, new: true }
          );
          if (idx === 0 && agentId) {
            console.log(`✅ Auto-assigned first number ${number.phoneNumber} to agent ${agentId}`);
          }
        }
        console.log(`✅ Imported ${numbers.length} numbers from Twilio`);
      } catch (importError) {
        console.error("Failed to import Twilio numbers:", importError);
      }
    }

    // If SansPBX, import DIDs
    if (provider === "SansPBX" && isVerified && didList.length > 0) {
      for (let idx = 0; idx < didList.length; idx++) {
        const d = didList[idx];
        const voipNumber = await VoipNumber.findOneAndUpdate(
          {
            userId: req.user._id,
            phoneNumber: d.number || d.did || d,
          },
          {
            userId: req.user._id,
            providerId: newProvider._id,
            phoneNumber: d.number || d.did || d,
            friendlyName: d.friendlyName || d.name || d.number || d,
            region: d.region || "India",
            country: d.country || "IN",
            capabilities: d.capabilities || { voice: true },
            status: "active",
            source: "imported",
            providerData: d,
            // CRITICAL: Auto-assign first DID to the selected agent
            assignedAgentId: idx === 0 && agentId ? agentId : null,
          },
          { upsert: true, new: true }
        );
        if (idx === 0 && agentId) {
          console.log(`✅ Auto-assigned first DID ${voipNumber.phoneNumber} to agent ${agentId}`);
        }
      }
      console.log(`✅ Imported ${didList.length} DIDs from SansPBX provider`);
    }

    // If Other, import DIDs
    if (provider === "Other" && isVerified && didList.length > 0) {
      for (let idx = 0; idx < didList.length; idx++) {
        const did = didList[idx];
        await VoipNumber.findOneAndUpdate(
          {
            userId: req.user._id,
            phoneNumber: did.number || did.did || did,
          },
          {
            userId: req.user._id,
            providerId: newProvider._id,
            phoneNumber: did.number || did.did || did,
            friendlyName: did.friendlyName || did.name || did.number || did,
            region: did.region || region || "Unknown",
            country: did.country || "Unknown",
            capabilities: did.capabilities || { voice: true },
            status: "active",
            source: "imported",
            providerData: did,
            // CRITICAL: Auto-assign first DID to the selected agent
            assignedAgentId: idx === 0 && agentId ? agentId : null,
          },
          { upsert: true, new: true }
        );
        if (idx === 0 && agentId) {
          console.log(`✅ Auto-assigned first DID ${did.number || did.did || did} to agent ${agentId}`);
        }
      }
      console.log(`✅ Imported ${didList.length} DIDs from Other provider`);
    }

    res.json({
      success: true,
      message: "VOIP provider added successfully",
      provider: {
        id: newProvider._id,
        provider: newProvider.provider,
        isVerified: newProvider.isVerified,
        dids: didList,
      },
    });
  } catch (error) {
    console.error("Add VOIP provider error:", error);
    res.status(500).json({ error: "Failed to add VOIP provider" });
  }
};

/**
 * Get all phone numbers
 */
export const getVoipNumbers = async (req, res) => {
  try {
    const numbers = await VoipNumber.find({
      userId: req.user._id,
      status: "active",
    })
      .populate("assignedAgentId", "name title")
      .sort({ createdAt: -1 });

    const formattedNumbers = numbers.map((num) => ({
      id: num._id,
      number: num.phoneNumber,
      friendlyName: num.friendlyName,
      region: num.region,
      country: num.country,
      capabilities: num.capabilities,
      assignedAgent: num.assignedAgentId
        ? {
            id: num.assignedAgentId._id,
            name: num.assignedAgentId.name,
          }
        : null,
      monthlyCost: num.monthlyCost,
      source: num.source,
      createdAt: num.createdAt,
    }));

    res.json({ numbers: formattedNumbers });
  } catch (error) {
    console.error("Get VOIP numbers error:", error);
    res.status(500).json({ error: "Failed to fetch phone numbers" });
  }
};

/**
 * Sync numbers from Twilio (refresh)
 */
export const syncVoipNumbers = async (req, res) => {
  try {
    const provider = await VoipProvider.findOne({
      userId: req.user._id,
      isActive: true,
    });

    if (!provider) {
      return res.status(404).json({ error: "No active VOIP provider found" });
    }

    if (provider.provider !== "Twilio") {
      return res
        .status(400)
        .json({ error: "Sync is only supported for Twilio" });
    }

    const decryptedCreds = provider.getDecryptedCredentials();
    const { accountSid, authToken } = decryptedCreds;
    const twilioClient = new Twilio(accountSid, authToken);

    const numbers = await twilioClient.incomingPhoneNumbers.list({ limit: 50 });

    let imported = 0;
    for (const number of numbers) {
      await VoipNumber.findOneAndUpdate(
        {
          userId: req.user._id,
          phoneNumber: number.phoneNumber,
        },
        {
          userId: req.user._id,
          providerId: provider._id,
          phoneNumber: number.phoneNumber,
          friendlyName: number.friendlyName || number.phoneNumber,
          region: number.region || "Unknown",
          country: number.isoCountry || "US",
          capabilities: {
            voice: number.capabilities?.voice || true,
            sms: number.capabilities?.sms || true,
            mms: number.capabilities?.mms || false,
          },
          status: "active",
          source: "imported",
          providerData: {
            sid: number.sid,
            capabilities: number.capabilities,
            addressRequirements: number.addressRequirements,
          },
        },
        { upsert: true, new: true }
      );
      imported++;
    }

    // Update last synced timestamp
    provider.lastSyncedAt = new Date();
    await provider.save();

    res.json({
      success: true,
      message: `Successfully synced ${imported} numbers`,
      count: imported,
    });
  } catch (error) {
    console.error("Sync VOIP numbers error:", error);
    res.status(500).json({ error: "Failed to sync phone numbers" });
  }
};

/**
 * Assign phone number to agent
 */
export const assignNumberToAgent = async (req, res) => {
  try {
    const { numberId, agentId } = req.body;

    if (!numberId || !agentId) {
      return res
        .status(400)
        .json({ error: "Number ID and Agent ID are required" });
    }

    // Verify number belongs to user
    const number = await VoipNumber.findOne({
      _id: numberId,
      userId: req.user._id,
      status: "active",
    });

    if (!number) {
      return res.status(404).json({ error: "Phone number not found" });
    }

    // Verify agent belongs to user
    const agent = await Agent.findOne({
      _id: agentId,
      userId: req.user._id,
    });

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    // Check if agent already has a number assigned (1 agent = 1 number rule)
    const existingAssignment = await VoipNumber.findOne({
      userId: req.user._id,
      assignedAgentId: agentId,
      status: "active",
    });

    if (existingAssignment && existingAssignment._id.toString() !== numberId) {
      return res.status(400).json({
        error: `This agent is already assigned to ${existingAssignment.phoneNumber}. Unassign it first.`,
      });
    }

    // Assign number to agent
    number.assignedAgentId = agentId;
    await number.save();

    res.json({
      success: true,
      message: "Number assigned successfully",
      number: {
        id: number._id,
        number: number.phoneNumber,
        assignedAgent: {
          id: agent._id,
          name: agent.name,
        },
      },
    });
  } catch (error) {
    console.error("Assign number error:", error);
    res.status(500).json({ error: "Failed to assign number to agent" });
  }
};

/**
 * Unassign phone number from agent
 */
export const unassignNumber = async (req, res) => {
  try {
    const { numberId } = req.body;

    if (!numberId) {
      return res.status(400).json({ error: "Number ID is required" });
    }

    const number = await VoipNumber.findOne({
      _id: numberId,
      userId: req.user._id,
      status: "active",
    });

    if (!number) {
      return res.status(404).json({ error: "Phone number not found" });
    }

    number.assignedAgentId = null;
    await number.save();

    res.json({
      success: true,
      message: "Number unassigned successfully",
    });
  } catch (error) {
    console.error("Unassign number error:", error);
    res.status(500).json({ error: "Failed to unassign number" });
  }
};

/**
 * Release phone number
 */
export const releaseNumber = async (req, res) => {
  try {
    const { numberId } = req.body;

    if (!numberId) {
      return res.status(400).json({ error: "Number ID is required" });
    }

    const number = await VoipNumber.findOne({
      _id: numberId,
      userId: req.user._id,
      status: "active",
    });

    if (!number) {
      return res.status(404).json({ error: "Phone number not found" });
    }

    // Check for unpaid bills (integrate with billing system later)
    // For now, just mark as released

    // Mark as released (soft delete)
    number.status = "released";
    number.assignedAgentId = null;
    await number.save();

    res.json({
      success: true,
      message: "Number released successfully",
    });
  } catch (error) {
    console.error("Release number error:", error);
    res.status(500).json({ error: "Failed to release number" });
  }
};

/**
 * Get available numbers to purchase (Twilio)
 */
export const getAvailableNumbers = async (req, res) => {
  try {
    const { country = "US", areaCode } = req.query;

    const provider = await VoipProvider.findOne({
      userId: req.user._id,
      isActive: true,
      provider: "Twilio",
    });

    if (!provider) {
      return res
        .status(404)
        .json({ error: "Twilio provider not configured" });
    }

    const decryptedCreds = provider.getDecryptedCredentials();
    const { accountSid, authToken } = decryptedCreds;
    const twilioClient = new Twilio(accountSid, authToken);

    const searchParams = {
      limit: 10,
    };

    if (areaCode) {
      searchParams.areaCode = areaCode;
    }

    const availableNumbers =
      await twilioClient.availablePhoneNumbers(country).local.list(searchParams);

    const formattedNumbers = availableNumbers.map((num) => ({
      phoneNumber: num.phoneNumber,
      friendlyName: num.friendlyName,
      locality: num.locality,
      region: num.region,
      country: num.isoCountry,
      capabilities: num.capabilities,
      estimatedCost: 1.15, // USD per month (Twilio standard)
    }));

    res.json({ numbers: formattedNumbers });
  } catch (error) {
    console.error("Get available numbers error:", error);
    res.status(500).json({ error: "Failed to fetch available numbers" });
  }
};

/**
 * Setup VOIP during registration - Optional, auto-assigns first DID to default agent
 */
export const setupVoipForRegistration = async (req, res) => {
  try {
    const {
      provider,
      accountSid,
      authToken,
      apiKey,
      secretKey,
      endpointUrl,
      httpMethod,
      headers,
      region,
      customScript
    } = req.body;

    if (!provider) {
      return res.status(400).json({ error: "Provider name is required" });
    }

    let didList = [];
    let isVerified = false;

    // Twilio validation
    if (provider === "Twilio") {
      if (!accountSid || !authToken) {
        return res.status(400).json({
          error: "Account SID and Auth Token are required for Twilio",
        });
      }
      try {
        const twilioClient = new Twilio(accountSid, authToken);
        // Verify Twilio credentials by fetching account info
        const account = await twilioClient.api.accounts(accountSid).fetch();
        isVerified = !!account.sid;  // If we got account data, credentials are valid
      } catch (twilioError) {
        console.error("Twilio verification failed:", twilioError);
        return res.status(400).json({
          error: "Invalid Twilio credentials. Please check your Account SID and Auth Token.",
        });
      }
    } else {
      // Other provider validation
      if (!apiKey || !secretKey || !endpointUrl) {
        return res.status(400).json({
          error: "API Key, Secret Key, and Endpoint URL are required",
        });
      }
      try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(endpointUrl, {
          method: httpMethod || 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}:${secretKey}`,
            ...(headers || {})
          }
        });
        if (!response.ok) throw new Error('Failed to validate VOIP API');
        const data = await response.json();
        didList = data.dids || data.numbers || [];
        if (!Array.isArray(didList) || didList.length === 0) {
          throw new Error('No DIDs found for this VOIP provider');
        }
        isVerified = true;
      } catch (err) {
        console.error("VOIP validation failed:", err);
        return res.status(400).json({
          error: "Invalid VOIP API credentials or endpoint. " + err.message
        });
      }
    }

    // Deactivate existing providers
    await VoipProvider.updateMany(
      { userId: req.user._id },
      { isActive: false }
    );

    // Create new provider
    const newProvider = await VoipProvider.create({
      userId: req.user._id,
      provider,
      credentials: {
        accountSid: accountSid || null,
        authToken: authToken || null,
        apiKey: apiKey || null,
        secretKey: secretKey || null,
        endpointUrl: endpointUrl || null,
        httpMethod: httpMethod || null,
        headers: headers || null,
        region: region || null,
      },
      customScript: customScript || null,
      isVerified,
      isActive: true,
      lastSyncedAt: new Date(),
    });

    // Import numbers from Twilio
    if (provider === "Twilio" && accountSid && authToken) {
      try {
        const twilioClient = new Twilio(accountSid, authToken);
        const numbers = await twilioClient.incomingPhoneNumbers.list({ limit: 50 });
        for (const number of numbers) {
          await VoipNumber.findOneAndUpdate(
            { userId: req.user._id, phoneNumber: number.phoneNumber },
            {
              userId: req.user._id,
              providerId: newProvider._id,
              phoneNumber: number.phoneNumber,
              friendlyName: number.friendlyName || number.phoneNumber,
              region: number.region || "Unknown",
              country: number.isoCountry || "US",
              capabilities: {
                voice: number.capabilities?.voice || true,
                sms: number.capabilities?.sms || true,
                mms: number.capabilities?.mms || false,
              },
              status: "active",
              source: "imported",
              providerData: { sid: number.sid, capabilities: number.capabilities },
            },
            { upsert: true, new: true }
          );
        }
        didList = numbers.map(n => ({ number: n.phoneNumber, sid: n.sid }));
        console.log(`✅ Imported ${numbers.length} numbers from Twilio`);
      } catch (importError) {
        console.error("Failed to import Twilio numbers:", importError);
      }
    }

    // Import DIDs from Other provider
    if (provider !== "Twilio" && isVerified && didList.length > 0) {
      for (const did of didList) {
        await VoipNumber.findOneAndUpdate(
          { userId: req.user._id, phoneNumber: did.number || did.did || did },
          {
            userId: req.user._id,
            providerId: newProvider._id,
            phoneNumber: did.number || did.did || did,
            friendlyName: did.friendlyName || did.name || did.number || did,
            region: did.region || region || "Unknown",
            country: did.country || "Unknown",
            capabilities: did.capabilities || { voice: true },
            status: "active",
            source: "imported",
            providerData: did,
          },
          { upsert: true, new: true }
        );
      }
      console.log(`✅ Imported ${didList.length} DIDs`);
    }

    // Auto-assign first DID to user's default agent
    if (didList.length > 0) {
      try {
        const Agent = (await import("../agent/agent.model.js")).default;
        const defaultAgent = await Agent.findOne({ userId: req.user._id }).sort({ createdAt: 1 });
        if (defaultAgent) {
          const firstNumber = didList[0].number || didList[0].phoneNumber || didList[0];
          const firstDID = await VoipNumber.findOne({
            userId: req.user._id,
            providerId: newProvider._id,
            phoneNumber: firstNumber
          });
          if (firstDID) {
            firstDID.assignedAgentId = defaultAgent._id;
            await firstDID.save();
            console.log(`✅ Auto-assigned to agent ${defaultAgent.name}`);
          }
        }
      } catch (err) {
        console.error("Failed to auto-assign DID:", err);
      }
    }

    res.json({
      success: true,
      message: "VOIP provider setup complete",
      provider: { id: newProvider._id, provider: newProvider.provider, isVerified: newProvider.isVerified },
      dids: didList,
      autoAssigned: didList.length > 0,
    });
  } catch (error) {
    console.error("Setup VOIP for registration error:", error);
    res.status(500).json({ error: "Failed to setup VOIP provider" });
  }
};

/**
 * Purchase phone number (Twilio)
 */
export const purchaseNumber = async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const provider = await VoipProvider.findOne({
      userId: req.user._id,
      isActive: true,
      provider: "Twilio",
    });

    if (!provider) {
      return res
        .status(404)
        .json({ error: "Twilio provider not configured" });
    }

    const decryptedCreds = provider.getDecryptedCredentials();
    const { accountSid, authToken } = decryptedCreds;
    const twilioClient = new Twilio(accountSid, authToken);

    // Purchase number from Twilio
    const purchasedNumber = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber,
    });

    // Add to database
    const newNumber = await VoipNumber.create({
      userId: req.user._id,
      providerId: provider._id,
      phoneNumber: purchasedNumber.phoneNumber,
      friendlyName: purchasedNumber.friendlyName || purchasedNumber.phoneNumber,
      region: purchasedNumber.region || "Unknown",
      country: purchasedNumber.isoCountry || "US",
      capabilities: {
        voice: purchasedNumber.capabilities?.voice || true,
        sms: purchasedNumber.capabilities?.sms || true,
        mms: purchasedNumber.capabilities?.mms || false,
      },
      status: "active",
      source: "purchased",
      monthlyCost: 1.15,
      providerData: {
        sid: purchasedNumber.sid,
        capabilities: purchasedNumber.capabilities,
      },
    });

    res.json({
      success: true,
      message: "Number purchased successfully",
      number: {
        id: newNumber._id,
        number: newNumber.phoneNumber,
        region: newNumber.region,
      },
    });
  } catch (error) {
    console.error("Purchase number error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to purchase number" });
  }
};
