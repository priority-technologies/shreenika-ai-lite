'use strict';
const BillingService = require('./billing.service');

// ── Block if no minutes remaining ─────────────────────────────────────────
const requireMinutes = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const hasMin = await BillingService.hasMinutes(userId);
    if (!hasMin) {
      return res.status(402).json({
        error:   'NO_MINUTES',
        message: 'You have no minutes remaining. Please recharge or upgrade your plan.',
        action:  'recharge',
      });
    }
    next();
  } catch (err) {
    next(err);
  }
};

// ── Block if agent limit reached ──────────────────────────────────────────
const requireAgentSlot = (getAgentCount) => async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const AgentMdl = require('../voice/agent.mongo.model.js');
    const count    = await AgentMdl.countDocuments({ userId });
    const check    = await BillingService.checkAgentLimit(userId, count);

    if (!check.allowed) {
      return res.status(402).json({
        error:   'AGENT_LIMIT_REACHED',
        message: `Your ${check.plan} plan allows up to ${check.limit} agent(s). Please upgrade to add more.`,
        current: check.current,
        limit:   check.limit,
        plan:    check.plan,
        action:  'upgrade',
      });
    }
    next();
  } catch (err) {
    next(err);
  }
};

// ── Block KB upload if not allowed on plan ────────────────────────────────
const requireDocSlot = async (req, res, next) => {
  try {
    const userId  = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const agentId = req.params.id || req.body.agentId;
    const AgentService = require('../voice/agent.service.js');
    const agent    = await AgentService.getAgentById(agentId);
    const docCount = (agent?.knowledgeBase || []).length;
    const check    = await BillingService.checkDocLimit(userId, docCount);

    if (!check.allowed) {
      return res.status(402).json({
        error:   check.reason ? 'KB_NOT_AVAILABLE' : 'DOC_LIMIT_REACHED',
        message: check.reason || `Your ${check.plan} plan allows up to ${check.limit} documents. Please upgrade or purchase the Extra Docs add-on.`,
        current: check.current,
        limit:   check.limit,
        plan:    check.plan,
        action:  check.reason ? 'upgrade' : 'addon',
      });
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { requireMinutes, requireAgentSlot, requireDocSlot };
