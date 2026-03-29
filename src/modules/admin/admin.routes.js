'use strict';
const express    = require('express');
const mongoose   = require('mongoose');
const router     = express.Router();
const User       = require('../auth/user.model');
const CmsContent = require('./cms.model');

// ─── Lazy-load models to avoid circular deps ────────────────────────────────
const getSubscription = () => require('../billing/subscription.model').Subscription;
const getCall         = () => require('../call/call.model');
const getAgent        = () => require('../voice/agent.mongo.model');
const getContact      = () => require('../contact/contact.mongo.model');
const getInvoice      = () => require('../billing/invoice.model');
const getVoipNumber   = () => require('../voip/voip.model').VoipNumber;

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/dashboard/stats
// Platform-wide counts for superadmin home
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard/stats', async (req, res) => {
  try {
    const Subscription = getSubscription();
    const Call         = getCall();
    const Agent        = getAgent();
    const Contact      = getContact();

    const [totalUsers, totalCalls, totalAgents, totalContacts, subscriptions] = await Promise.all([
      User.countDocuments({ role: { $nin: ['superadmin', 'subadmin'] } }),
      Call.countDocuments({}),
      Agent.countDocuments({}),
      Contact.countDocuments({}),
      Subscription.find({}, 'plan').lean(),
    ]);

    // Plan breakdown
    const planBreakdown = subscriptions.reduce((acc, s) => {
      acc[s.plan] = (acc[s.plan] || 0) + 1;
      return acc;
    }, {});

    res.json({ totalUsers, totalCalls, totalAgents, totalContacts, planBreakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/users
// Full user list with subscription + agent count
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const Subscription = getSubscription();
    const Agent        = getAgent();
    const Contact      = getContact();

    const users = await User.find(
      { role: { $nin: ['superadmin', 'subadmin'] } },
      'name email role isActive isSuspended createdAt avatar'
    ).lean();

    // Attach subscription + stats to each user
    const enriched = await Promise.all(users.map(async (u) => {
      const [sub, agentCount, contactCount] = await Promise.all([
        Subscription.findOne({ userId: u._id }, 'plan minutesBalance').lean(),
        Agent.countDocuments({ userId: u._id }),
        Contact.countDocuments({ userId: u._id }),
      ]);
      return {
        ...u,
        accountType: sub?.plan || 'Starter',
        minutesBalance: sub?.minutesBalance || 0,
        stats: { agents: agentCount, contacts: contactCount },
      };
    }));

    res.json({ users: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/users/:id
// Full detail of one user — subscription, agents, VOIP, invoices
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:id', async (req, res) => {
  try {
    const Subscription = getSubscription();
    const Agent        = getAgent();
    const Contact      = getContact();
    const Invoice      = getInvoice();
    const VoipNumber   = getVoipNumber();

    const u = await User.findById(req.params.id, 'name email role isActive isSuspended createdAt avatar').lean();
    if (!u) return res.status(404).json({ error: 'User not found' });

    const [sub, agents, contactCount, invoices, voipNumbers] = await Promise.all([
      Subscription.findOne({ userId: u._id }).lean(),
      Agent.find({ userId: u._id }, 'agentName name isActive').lean(),
      Contact.countDocuments({ userId: u._id }),
      Invoice.find({ userId: u._id }, 'amount status createdAt invoiceNumber').sort({ createdAt: -1 }).limit(10).lean(),
      VoipNumber.find({ userId: u._id }, 'phoneNumber agentId provider isActive').lean(),
    ]);

    res.json({
      user: {
        ...u,
        accountType:    sub?.plan || 'Starter',
        minutesBalance: sub?.minutesBalance || 0,
        agentLimit:     sub?.effectiveLimits?.agentLimit || 1,
        docLimit:       sub?.effectiveLimits?.docLimit || 0,
        agents:         agents.map(a => ({ _id: a._id, name: a.agentName || a.name, isActive: a.isActive !== false })),
        voipNumbers:    voipNumbers.map(v => ({ number: v.phoneNumber, agentId: v.agentId, provider: v.provider })),
        stats:          { contacts: contactCount },
        invoices,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/users/:id/award-minutes
// Add or deduct minutes from a user's balance
// body: { minutes: number (positive=add, negative=deduct), reason: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/users/:id/award-minutes', async (req, res) => {
  try {
    const Subscription  = getSubscription();
    const MinuteLedger  = require('../billing/minute-ledger.model');
    const { minutes, reason } = req.body;

    if (!minutes || typeof minutes !== 'number') {
      return res.status(400).json({ error: 'minutes must be a non-zero number' });
    }

    const sub = await Subscription.findOne({ userId: req.params.id });
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    const before = sub.minutesBalance;
    sub.minutesBalance = Math.max(0, sub.minutesBalance + minutes);
    await sub.save();

    // Log it in the ledger
    await MinuteLedger.create({
      userId:          req.params.id,
      source:          minutes > 0 ? 'admin_award' : 'admin_deduct',
      durationSeconds: Math.abs(minutes) * 60,
      geminiMinutes:   Math.abs(minutes),
      cacheMinutes:    0,
      month:           new Date().toISOString().slice(0, 7),
      note:            reason || (minutes > 0 ? 'Admin awarded minutes' : 'Admin deducted minutes'),
    });

    res.json({
      success: true,
      before,
      after:   sub.minutesBalance,
      change:  minutes,
      message: `${minutes > 0 ? 'Awarded' : 'Deducted'} ${Math.abs(minutes)} minutes`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/users/:id/subscription
// Edit plan, agentLimit, docLimit, minutesBalance directly
// body: { plan?, minutesBalance?, agentLimit?, docLimit? }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/users/:id/subscription', async (req, res) => {
  try {
    const Subscription = getSubscription();
    const { plan, minutesBalance, agentLimit, docLimit } = req.body;

    const sub = await Subscription.findOne({ userId: req.params.id });
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    if (plan           !== undefined) sub.plan           = plan;
    if (minutesBalance !== undefined) sub.minutesBalance = Math.max(0, minutesBalance);
    if (agentLimit     !== undefined) sub.addOns = { ...(sub.addOns || {}), extraAgentSlots: Math.max(0, agentLimit - 1) };
    if (docLimit       !== undefined) sub.addOns = { ...(sub.addOns || {}), extraDocSlots: Math.max(0, docLimit) };

    await sub.save();
    res.json({ success: true, subscription: sub });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /admin/users/:id/account-type
// Change plan (alias used by frontend UserDetailsView)
// body: { newPlan: 'Starter' | 'Pro' | 'Enterprise' }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/users/:id/account-type', async (req, res) => {
  try {
    const Subscription = getSubscription();
    const { newPlan }  = req.body;
    const VALID_PLANS  = ['Starter', 'Pro', 'Enterprise'];

    if (!VALID_PLANS.includes(newPlan)) {
      return res.status(400).json({ error: 'Invalid plan. Must be Starter, Pro or Enterprise.' });
    }

    const sub = await Subscription.findOne({ userId: req.params.id });
    if (!sub) return res.status(404).json({ error: 'Subscription not found for this user' });

    sub.plan = newPlan;
    await sub.save();

    res.json({ success: true, plan: newPlan, message: `Plan updated to ${newPlan}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/users/:id/status
// Suspend / activate / hold an account
// body: { action: 'suspend' | 'activate' | 'hold' }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/users/:id/status', async (req, res) => {
  try {
    const { action } = req.body;
    const update = {};

    if (action === 'suspend') {
      update.isActive = false;
      update.isSuspended = true;
    } else if (action === 'activate') {
      update.isActive = true;
      update.isSuspended = false;
    } else if (action === 'hold') {
      update.isActive = false;
      update.isSuspended = false;
      update.isOnHold = true;
    } else {
      return res.status(400).json({ error: 'action must be suspend | activate | hold' });
    }

    await User.findByIdAndUpdate(req.params.id, { $set: update });
    res.json({ success: true, action, message: `Account ${action}d successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/users/:id/suspend  (alias used by frontend delete button)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/users/:id/suspend', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, {
      $set: { isActive: false, isSuspended: true }
    });
    res.json({ success: true, message: 'User suspended' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/users/:id/agents/:agentId/status
// Enable or disable a specific agent
// body: { isActive: boolean }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/users/:id/agents/:agentId/status', async (req, res) => {
  try {
    const Agent = getAgent();
    const { isActive } = req.body;

    await Agent.findByIdAndUpdate(req.params.agentId, { $set: { isActive } });
    res.json({ success: true, isActive, message: `Agent ${isActive ? 'enabled' : 'disabled'}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/users/:id/export
// Export all user data as JSON
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:id/export', async (req, res) => {
  try {
    const Agent    = getAgent();
    const Contact  = getContact();
    const Call     = getCall();
    const Invoice  = getInvoice();

    const [user, agents, contacts, calls, invoices] = await Promise.all([
      User.findById(req.params.id).lean(),
      Agent.find({ userId: req.params.id }).lean(),
      Contact.find({ userId: req.params.id }).lean(),
      Call.find({ userId: req.params.id }).lean(),
      Invoice.find({ userId: req.params.id }).lean(),
    ]);

    res.setHeader('Content-Disposition', `attachment; filename="user-${req.params.id}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json({ user, agents, contacts, calls, invoices, exportedAt: new Date() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/cms/:page  — fetch CMS content
// PUT /admin/cms/:page  — save CMS content
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cms/:page', async (req, res) => {
  try {
    const doc = await CmsContent.findOne({ page: req.params.page }).lean();
    res.json({ page: req.params.page, title: doc?.title || '', content: doc?.content || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/cms/:page', async (req, res) => {
  try {
    const { title, content } = req.body;
    const doc = await CmsContent.findOneAndUpdate(
      { page: req.params.page },
      { $set: { title, content, updatedBy: req.user._id } },
      { upsert: true, new: true }
    );
    res.json({ success: true, doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/users/:id/invoices — user invoice list
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:id/invoices', async (req, res) => {
  try {
    const Invoice = getInvoice();
    const invoices = await Invoice.find({ userId: req.params.id }).sort({ createdAt: -1 }).lean();
    res.json({ invoices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/users/:id/leads — user contacts list
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:id/leads', async (req, res) => {
  try {
    const Contact = getContact();
    const contacts = await Contact.find({ userId: req.params.id }).lean();
    res.json({ leads: contacts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/users/:userId/agents
// All agents for a user, enriched with VOIP assignment
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:userId/agents', async (req, res) => {
  try {
    const Agent      = getAgent();
    const VoipNumber = getVoipNumber();

    const [agents, voipNumbers] = await Promise.all([
      Agent.find({ userId: req.params.userId }).lean(),
      VoipNumber.find({ userId: req.params.userId }, 'phoneNumber agentId provider isActive').lean(),
    ]);

    const enriched = agents.map(a => {
      const assigned = voipNumbers.find(v => String(v.agentId) === String(a.agentId));
      return {
        _id:          a._id,
        agentId:      a.agentId,
        name:         a.agentName || a.name,
        title:        a.title || a.agentRole || '',
        isActive:     a.isActive !== false,
        voipProvider: assigned ? assigned.provider : null,
        voipNumber:   assigned ? assigned.phoneNumber : null,
      };
    });

    res.json({ agents: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/users/:userId/agents/:agentId/calls
// All calls made by a specific agent belonging to this user
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:userId/agents/:agentId/calls', async (req, res) => {
  try {
    const Call = getCall();
    const calls = await Call.find(
      { userId: req.params.userId, agentId: req.params.agentId },
      'leadName phoneNumber durationSeconds sentiment status direction createdAt endedAt answeredAt summary'
    ).sort({ createdAt: -1 }).lean();

    res.json({ calls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/calls/:callId
// Full detail of a single call — recording, transcript, summary
// ─────────────────────────────────────────────────────────────────────────────
router.get('/calls/:callId', async (req, res) => {
  try {
    const Call = getCall();
    const call = await Call.findById(req.params.callId).lean();
    if (!call) return res.status(404).json({ error: 'Call not found' });
    res.json({ call });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
