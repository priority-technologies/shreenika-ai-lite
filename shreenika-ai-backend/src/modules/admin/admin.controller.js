import User from "../auth/user.model.js";
import Subscription from "../billing/subscription.model.js";
import Contact from "../contacts/contact.model.js";
import Call from "../call/call.model.js";
import Agent from "../agent/agent.model.js";
import Lead from "../lead/lead.model.js";
import { VoipProvider, VoipNumber } from "../voip/voip.model.js";
import CMS from "../cms/cms.model.js";
import { Parser } from "json2csv";

/**
 * List all users (for Super Admin Lead Management)
 */
export const listUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("email role createdAt isActive")
      .sort({ createdAt: -1 });

    // Get additional stats for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const [contactCount, callCount, agentCount, subscription] = await Promise.all([
          Contact.countDocuments({ ownerUserId: user._id }),
          Call.countDocuments({ userId: user._id }),
          Agent.countDocuments({ userId: user._id }),
          Subscription.findOne({ userId: user._id }).select("plan status")
        ]);

        return {
          _id: user._id,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt,
          stats: {
            contacts: contactCount,
            calls: callCount,
            agents: agentCount
          },
          subscription: subscription ? {
            plan: subscription.plan,
            status: subscription.status
          } : null
        };
      })
    );

    res.json({ users: usersWithStats });
  } catch (error) {
    console.error("❌ listUsers error:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

/**
 * Get single user details
 */
export const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select("-password -emailVerificationToken -resetPasswordToken");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const [subscription, agents, contactCount, callCount, voipProvider, voipNumbers] = await Promise.all([
      Subscription.findOne({ userId }),
      Agent.find({ userId }).select("_id name"),
      Contact.countDocuments({ ownerUserId: userId }),
      Call.countDocuments({ userId }),
      VoipProvider.findOne({ userId }).select("provider"),
      VoipNumber.find({ userId }).populate('assignedAgentId', 'name')
    ]);

    res.json({
      user: {
        ...user.toObject(),
        agents,
        voipProvider: voipProvider?.provider,
        voipNumbers: voipNumbers?.map(v => ({
          number: v.number,
          assignedAgentId: v.assignedAgentId?._id,
          agentName: v.assignedAgentId?.name
        })),
        accountType: subscription?.plan || 'Starter',
        stats: {
          agents: agents.length,
          contacts: contactCount,
          calls: callCount
        },
        subscription
      }
    });
  } catch (error) {
    console.error("❌ getUserDetails error:", error);
    res.status(500).json({ error: "Failed to fetch user details" });
  }
};

/**
 * Get all contacts for a specific user (Lead Management drill-down)
 */
export const getUserContacts = async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user exists
    const user = await User.findById(userId).select("email");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get all contacts for this user
    const contacts = await Contact.find({ ownerUserId: userId })
      .sort({ createdAt: -1 });

    // Get call count for each contact
    const contactsWithStats = await Promise.all(
      contacts.map(async (contact) => {
        const callCount = await Call.countDocuments({ leadId: contact._id });
        const lastCall = await Call.findOne({ leadId: contact._id })
          .sort({ createdAt: -1 })
          .select("createdAt status sentiment");

        return {
          ...contact.toObject(),
          callCount,
          lastCall: lastCall ? {
            date: lastCall.createdAt,
            status: lastCall.status,
            sentiment: lastCall.sentiment
          } : null
        };
      })
    );

    res.json({
      user: { _id: user._id, email: user.email },
      contacts: contactsWithStats,
      total: contactsWithStats.length
    });
  } catch (error) {
    console.error("❌ getUserContacts error:", error);
    res.status(500).json({ error: "Failed to fetch user contacts" });
  }
};

/**
 * Get all calls for a specific contact (with recordings)
 */
export const getContactCalls = async (req, res) => {
  try {
    const { userId, contactId } = req.params;

    // Verify contact exists and belongs to user
    const contact = await Contact.findOne({ _id: contactId, ownerUserId: userId });
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    // Get all calls for this contact
    const calls = await Call.find({ leadId: contactId })
      .populate("agentId", "name title")
      .sort({ createdAt: -1 });

    const callsFormatted = calls.map(call => ({
      _id: call._id,
      direction: call.direction,
      status: call.status,
      durationSeconds: call.durationSeconds,
      recordingUrl: call.recordingUrl,
      transcript: call.transcript,
      summary: call.summary,
      sentiment: call.sentiment,
      agent: call.agentId ? {
        id: call.agentId._id,
        name: call.agentId.name,
        title: call.agentId.title
      } : null,
      createdAt: call.createdAt
    }));

    res.json({
      contact: {
        _id: contact._id,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown',
        phone: contact.phone,
        email: contact.email,
        company: contact.company?.name,
        status: contact.status
      },
      calls: callsFormatted,
      total: callsFormatted.length
    });
  } catch (error) {
    console.error("❌ getContactCalls error:", error);
    res.status(500).json({ error: "Failed to fetch contact calls" });
  }
};

/**
 * Suspend a user
 */
export const suspendUser = async (req, res) => {
  try {
    const { userId } = req.params;

    await Promise.all([
      User.findByIdAndUpdate(userId, { isActive: false }),
      Subscription.findOneAndUpdate(
        { userId },
        { status: "SUSPENDED" }
      )
    ]);

    res.json({ success: true, message: "User suspended" });
  } catch (error) {
    console.error("❌ suspendUser error:", error);
    res.status(500).json({ error: "Failed to suspend user" });
  }
};

/**
 * Activate a user
 */
export const activateUser = async (req, res) => {
  try {
    const { userId } = req.params;

    await Promise.all([
      User.findByIdAndUpdate(userId, { isActive: true }),
      Subscription.findOneAndUpdate(
        { userId },
        { status: "ACTIVE" }
      )
    ]);

    res.json({ success: true, message: "User activated" });
  } catch (error) {
    console.error("❌ activateUser error:", error);
    res.status(500).json({ error: "Failed to activate user" });
  }
};

/**
 * Check if current user is super admin
 */
export const checkAdminStatus = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === "superadmin" || req.user.role === "admin";
    res.json({
      isSuperAdmin,
      role: req.user.role
    });
  } catch (error) {
    console.error("❌ checkAdminStatus error:", error);
    res.status(500).json({ error: "Failed to check admin status" });
  }
};

/**
 * SUPER ADMIN: Change user account type (plan upgrade/downgrade)
 */
export const changeAccountType = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPlan } = req.body;

    if (!["Starter", "Pro", "Enterprise"].includes(newPlan)) {
      return res.status(400).json({ message: "Invalid plan type" });
    }

    const subscription = await Subscription.findOneAndUpdate(
      { userId },
      { plan: newPlan },
      { new: true }
    );

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    res.json({
      message: `Account successfully changed to ${newPlan}`,
      plan: newPlan,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error("❌ changeAccountType error:", error);
    res.status(500).json({ error: "Failed to change account type" });
  }
};

/**
 * SUPER ADMIN: Export all user data (JSON/CSV)
 */
export const exportUserData = async (req, res) => {
  try {
    const { userId } = req.params;
    const { format = "json" } = req.query;

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get all contacts/leads
    const contacts = await Contact.find({ ownerUserId: userId });

    // Get all calls
    const exportData = {
      user: {
        _id: user._id,
        name: user.name || user.email.split("@")[0],
        email: user.email,
        createdAt: user.createdAt
      },
      contacts: await Promise.all(
        contacts.map(async (contact) => {
          const calls = await Call.find({ leadId: contact._id });
          return {
            _id: contact._id,
            name: `${contact.firstName} ${contact.lastName}`,
            phone: contact.phone,
            email: contact.email,
            company: contact.company?.name || "N/A",
            status: contact.status,
            calls: calls.map((c) => ({
              _id: c._id,
              status: c.status,
              duration: c.durationSeconds,
              startedAt: c.createdAt,
              transcript: c.transcript || "N/A",
              summary: c.summary || "N/A"
            }))
          };
        })
      )
    };

    if (format === "csv") {
      try {
        const csvData = exportData.contacts.flatMap((contact) =>
          contact.calls.map((call) => ({
            contactName: contact.name,
            contactPhone: contact.phone,
            contactEmail: contact.email,
            company: contact.company,
            callStatus: call.status,
            callDuration: call.duration,
            callDate: call.startedAt,
            transcript: call.transcript
          }))
        );

        const csv = new Parser().parse(csvData);
        res.header("Content-Type", "text/csv");
        res.header(
          "Content-Disposition",
          `attachment; filename="user-data-${Date.now()}.csv"`
        );
        return res.send(csv);
      } catch (csvError) {
        console.error("CSV generation error:", csvError);
        return res.status(400).json({ error: "Failed to generate CSV" });
      }
    } else {
      res.header("Content-Type", "application/json");
      res.header(
        "Content-Disposition",
        `attachment; filename="user-data-${Date.now()}.json"`
      );
      return res.json(exportData);
    }
  } catch (error) {
    console.error("❌ exportUserData error:", error);
    res.status(500).json({ error: "Failed to export user data" });
  }
};

/**
 * SUPER ADMIN: Get CMS content (Privacy, Terms, FAQs)
 */
export const getCMSContent = async (req, res) => {
  try {
    const { type } = req.params; // "privacy" or "faqs"

    if (!["privacy", "faqs"].includes(type)) {
      return res.status(400).json({ message: "Invalid CMS type" });
    }

    const cms = await CMS.findOne({ type });
    if (!cms) {
      return res.json({
        type,
        content: type === "faqs" ? [] : { sections: [] }
      });
    }

    return res.json({ type, content: cms.content });
  } catch (error) {
    console.error("❌ getCMSContent error:", error);
    res.status(500).json({ error: "Failed to fetch CMS content" });
  }
};

/**
 * SUPER ADMIN: Update CMS content (Privacy, Terms, FAQs)
 */
export const updateCMSContent = async (req, res) => {
  try {
    const { type } = req.params;
    const { content } = req.body;

    if (!["privacy", "faqs"].includes(type)) {
      return res.status(400).json({ message: "Invalid CMS type" });
    }

    const cms = await CMS.findOneAndUpdate(
      { type },
      { content, lastUpdatedBy: req.user.id, updatedAt: new Date() },
      { new: true, upsert: true }
    );

    return res.json({
      message: `${type} content updated successfully`,
      type,
      content: cms.content
    });
  } catch (error) {
    console.error("❌ updateCMSContent error:", error);
    res.status(500).json({ error: "Failed to update CMS content" });
  }
};

/**
 * SUPER ADMIN: Get user's leads with archive status
 */
export const getUserLeads = async (req, res) => {
  try {
    const { userId } = req.params;

    const leads = await Lead.find({ userId })
      .sort({ createdAt: -1 });

    const formattedLeads = leads.map((lead) => ({
      _id: lead._id,
      name: `${lead.firstName} ${lead.lastName}`,
      phone: lead.phone,
      email: lead.email,
      status: lead.status,
      isArchived: lead.isArchived,
      archivedAt: lead.archivedAt
    }));

    return res.json({
      leads: formattedLeads,
      total: formattedLeads.length
    });
  } catch (error) {
    console.error("❌ getUserLeads error:", error);
    res.status(500).json({ error: "Failed to fetch user leads" });
  }
};

/**
 * SUPER ADMIN: Get lead details with all calls
 */
export const getLeadDetails = async (req, res) => {
  try {
    const { leadId } = req.params;

    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const calls = await Call.find({ leadId })
      .sort({ createdAt: -1 })
      .select("_id status durationSeconds createdAt transcript summary recordingUrl");

    return res.json({
      lead: {
        _id: lead._id,
        name: `${lead.firstName} ${lead.lastName}`,
        phone: lead.phone,
        email: lead.email,
        company: lead.company?.name || "N/A",
        status: lead.status,
        isArchived: lead.isArchived
      },
      calls: calls.map((c) => ({
        _id: c._id,
        status: c.status,
        duration: c.durationSeconds,
        date: c.createdAt,
        transcript: c.transcript || "N/A",
        summary: c.summary || "N/A",
        recordingUrl: c.recordingUrl || null
      })),
      totalCalls: calls.length
    });
  } catch (error) {
    console.error("❌ getLeadDetails error:", error);
    res.status(500).json({ error: "Failed to fetch lead details" });
  }
};
