'use strict';

/**
 * Campaign Controller — CommonJS conversion
 * Adds stopCampaign (permanent cancel) separate from pauseCampaign (soft pause)
 * 2026-03-22
 */

const Campaign         = require('./campaign.model.js');
const CampaignService  = require('./campaign.service.js');
const Agent            = require('../voice/agent.mongo.model.js');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/campaigns
// ─────────────────────────────────────────────────────────────────────────────
const createCampaign = async (req, res) => {
  try {
    const { agentId, name, description, leads, configOverrides } = req.body;
    const userId = req.user._id;

    const agent = await Agent.findOne({ agentId });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    if (!leads || leads.length === 0) {
      return res.status(400).json({ error: 'At least one lead required' });
    }

    const campaign = await CampaignService.createCampaign(userId, agentId, {
      name,
      description,
      leads,
      ...(configOverrides || {}),
    });

    res.status(201).json({
      campaignId:  campaign._id,
      name:        campaign.name,
      status:      campaign.status,
      totalLeads:  campaign.leads.length,
      createdAt:   campaign.createdAt,
    });
  } catch (err) {
    console.error('[CAMPAIGN] createCampaign error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/campaigns/:campaignId/start
// ─────────────────────────────────────────────────────────────────────────────
const startCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user._id;

    const campaign = await Campaign.findOne({ _id: campaignId, userId });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const result = await CampaignService.startCampaign(campaignId);

    res.json({
      campaignId,
      status:     result.status,
      queued:     result.queued,
      totalLeads: result.totalLeads,
      message:    'Campaign started — parallel calls initiating',
    });
  } catch (err) {
    console.error('[CAMPAIGN] startCampaign error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/campaigns/:campaignId/status
// ─────────────────────────────────────────────────────────────────────────────
const getCampaignStatus = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user._id;

    const exists = await Campaign.findOne({ _id: campaignId, userId });
    if (!exists) return res.status(404).json({ error: 'Campaign not found' });

    const status = await CampaignService.getCampaignStatus(campaignId);
    res.json(status);
  } catch (err) {
    console.error('[CAMPAIGN] getCampaignStatus error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/campaigns/:campaignId/pause
// Soft pause — active calls complete, no new calls fired
// ─────────────────────────────────────────────────────────────────────────────
const pauseCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user._id;

    const campaign = await Campaign.findOne({ _id: campaignId, userId });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (campaign.status !== 'running') {
      return res.status(400).json({ error: `Campaign is '${campaign.status}' — can only pause a running campaign` });
    }

    await CampaignService.pauseCampaign(campaignId);
    res.json({
      campaignId,
      status:  'paused',
      message: 'Campaign paused. Active calls will finish. Resume when ready.',
    });
  } catch (err) {
    console.error('[CAMPAIGN] pauseCampaign error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/campaigns/:campaignId/resume
// ─────────────────────────────────────────────────────────────────────────────
const resumeCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user._id;

    const campaign = await Campaign.findOne({ _id: campaignId, userId });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (campaign.status !== 'paused') {
      return res.status(400).json({ error: `Campaign is '${campaign.status}' — can only resume a paused campaign` });
    }

    const result = await CampaignService.resumeCampaign(campaignId);
    res.json({
      campaignId,
      status:         result.status,
      queueRemaining: result.queueRemaining,
      message:        'Campaign resumed. Calls continuing.',
    });
  } catch (err) {
    console.error('[CAMPAIGN] resumeCampaign error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/campaigns/:campaignId/stop
// Hard stop — marks campaign cancelled, queue cleared, no resume
// ─────────────────────────────────────────────────────────────────────────────
const stopCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user._id;

    const campaign = await Campaign.findOne({ _id: campaignId, userId });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (!['running', 'paused'].includes(campaign.status)) {
      return res.status(400).json({
        error: `Campaign is '${campaign.status}' — can only stop a running or paused campaign`,
      });
    }

    await CampaignService.stopCampaign(campaignId);
    res.json({
      campaignId,
      status:  'cancelled',
      message: 'Campaign stopped permanently. No new calls will be made.',
    });
  } catch (err) {
    console.error('[CAMPAIGN] stopCampaign error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/campaigns
// ─────────────────────────────────────────────────────────────────────────────
const listCampaigns = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, agentId } = req.query;

    const filter = { userId };
    if (status)  filter.status  = status;
    if (agentId) filter.agentId = agentId;

    const campaigns = await Campaign.find(filter)
      .populate('agentId', 'name agentName')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      total: campaigns.length,
      campaigns: campaigns.map(c => ({
        _id:         c._id,
        name:        c.name,
        status:      c.status,
        agent:       c.agentId?.agentName || c.agentId?.name,
        totalLeads:  c.executionMetrics?.totalLeads,
        completed:   c.executionMetrics?.callsCompleted,
        failed:      c.executionMetrics?.callsFailed,
        noAnswer:    c.executionMetrics?.callsNoAnswer,
        activeSlots: c.executionMetrics?.currentActiveSlots,
        createdAt:   c.createdAt,
        startedAt:   c.startedAt,
        completedAt: c.completedAt,
      })),
    });
  } catch (err) {
    console.error('[CAMPAIGN] listCampaigns error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/campaigns/:campaignId
// ─────────────────────────────────────────────────────────────────────────────
const getCampaignDetails = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user._id;

    const campaign = await Campaign.findOne({ _id: campaignId, userId })
      .populate('agentId', 'name agentName title voiceProfile')
      .lean();

    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    res.json({
      _id:           campaign._id,
      name:          campaign.name,
      description:   campaign.description,
      status:        campaign.status,
      agent:         campaign.agentId,
      configuration: campaign.configurationSheet,
      metrics:       campaign.executionMetrics,
      leads:         campaign.leads,
      createdAt:     campaign.createdAt,
      startedAt:     campaign.startedAt,
      completedAt:   campaign.completedAt,
      pausedAt:      campaign.pausedAt,
    });
  } catch (err) {
    console.error('[CAMPAIGN] getCampaignDetails error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/campaigns/:campaignId
// ─────────────────────────────────────────────────────────────────────────────
const deleteCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user._id;

    const campaign = await Campaign.findOne({ _id: campaignId, userId });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (campaign.status === 'running') {
      return res.status(400).json({ error: 'Cannot delete a running campaign. Stop it first.' });
    }

    await Campaign.findByIdAndDelete(campaignId);
    res.json({ message: 'Campaign deleted successfully' });
  } catch (err) {
    console.error('[CAMPAIGN] deleteCampaign error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createCampaign,
  startCampaign,
  getCampaignStatus,
  pauseCampaign,
  resumeCampaign,
  stopCampaign,
  listCampaigns,
  getCampaignDetails,
  deleteCampaign,
};
