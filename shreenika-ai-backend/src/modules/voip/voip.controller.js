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
    const { provider, accountSid, authToken, apiKey, secretKey } = req.body;

    if (!provider) {
      return res.status(400).json({ error: "Provider name is required" });
    }

    // Validate Twilio credentials if Twilio is selected
    if (provider === "Twilio") {
      if (!accountSid || !authToken) {
        return res.status(400).json({
          error: "Account SID and Auth Token are required for Twilio",
        });
      }

      // Verify Twilio credentials by making a test API call
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
      },
      isVerified: provider === "Twilio", // Auto-verify if Twilio validation passed
      isActive: true,
      lastSyncedAt: new Date(),
    });

    // If Twilio, immediately fetch and import numbers
    if (provider === "Twilio" && accountSid && authToken) {
      try {
        const twilioClient = new Twilio(accountSid, authToken);
        const numbers = await twilioClient.incomingPhoneNumbers.list({
          limit: 50,
        });

        // Import all numbers
        for (const number of numbers) {
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
            },
            { upsert: true, new: true }
          );
        }

        console.log(`✅ Imported ${numbers.length} numbers from Twilio`);
      } catch (importError) {
        console.error("Failed to import Twilio numbers:", importError);
        // Don't fail the provider creation, just log
      }
    }

    res.json({
      success: true,
      message: "VOIP provider added successfully",
      provider: {
        id: newProvider._id,
        provider: newProvider.provider,
        isVerified: newProvider.isVerified,
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

    const { accountSid, authToken } = provider.credentials;
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

    const { accountSid, authToken } = provider.credentials;
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

    const { accountSid, authToken } = provider.credentials;
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
