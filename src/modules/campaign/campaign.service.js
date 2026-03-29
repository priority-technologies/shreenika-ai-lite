'use strict';

/**
 * Campaign Service — thin orchestration layer
 * CommonJS conversion + Redis removed (uses in-memory worker)
 * 2026-03-22
 */

const Campaign = require('./campaign.model.js');
const Agent    = require('../voice/agent.mongo.model.js');
const worker   = require('./campaign-worker.service.js');

// ─────────────────────────────────────────────────────────────────────────────
// createCampaign
// ─────────────────────────────────────────────────────────────────────────────
async function createCampaign(userId, agentId, campaignData) {
  const agent = await Agent.findOne({ agentId });
  if (!agent) throw new Error('Agent not found');

  const configurationSheet = {
    voiceProfile:      campaignData.voiceProfile      || agent.voiceProfile      || {},
    speechSettings:    { ...(agent.speechSettings  || {}), ...(campaignData.speechSettings  || {}) },
    callStartBehavior: campaignData.callStartBehavior || agent.callStartBehavior || 'waitForHuman',
    callSettings:      { ...(agent.callSettings    || {}), ...(campaignData.callSettings    || {}) },
    role:              { ...(agent.role            || {}), ...(campaignData.role            || {}) },
    overriddenFields:  campaignData.overriddenFields  || [],
  };

  const campaign = await Campaign.create({
    userId,
    agentId,
    name:        campaignData.name,
    description: campaignData.description,
    configurationSheet,
    parallelSlots: 5,
    leads: (campaignData.leads || []).map(l => ({ ...l, status: 'pending', retryCount: 0 })),
    status: 'draft',
    executionMetrics: {
      totalLeads: (campaignData.leads || []).length,
    },
  });

  console.log(`[CAMPAIGN] Created: ${campaign._id} — ${(campaignData.leads || []).length} leads`);
  return campaign;
}

// ─────────────────────────────────────────────────────────────────────────────
// startCampaign
// ─────────────────────────────────────────────────────────────────────────────
async function startCampaign(campaignId) {
  return worker.initCampaign(campaignId);
}

// ─────────────────────────────────────────────────────────────────────────────
// pauseCampaign
// ─────────────────────────────────────────────────────────────────────────────
async function pauseCampaign(campaignId) {
  return worker.pauseCampaign(campaignId);
}

// ─────────────────────────────────────────────────────────────────────────────
// resumeCampaign
// ─────────────────────────────────────────────────────────────────────────────
async function resumeCampaign(campaignId) {
  return worker.resumeCampaign(campaignId);
}

// ─────────────────────────────────────────────────────────────────────────────
// stopCampaign — permanent cancel
// ─────────────────────────────────────────────────────────────────────────────
async function stopCampaign(campaignId) {
  return worker.stopCampaign(campaignId);
}

// ─────────────────────────────────────────────────────────────────────────────
// getCampaignStatus — merges DB doc with live in-memory state
// ─────────────────────────────────────────────────────────────────────────────
async function getCampaignStatus(campaignId) {
  const campaign = await Campaign.findById(campaignId).lean();
  if (!campaign) throw new Error('Campaign not found');

  const mem = worker.getCampaignState(campaignId);

  const processed = (campaign.executionMetrics.callsCompleted || 0) +
                    (campaign.executionMetrics.callsFailed    || 0) +
                    (campaign.executionMetrics.callsNoAnswer  || 0);
  const total     = campaign.executionMetrics.totalLeads || 1;

  return {
    campaignId: campaign._id,
    name:       campaign.name,
    status:     campaign.status,
    metrics: {
      ...campaign.executionMetrics,
      currentActiveSlots: mem?.activeSlots ?? (campaign.executionMetrics.currentActiveSlots || 0),
    },
    progress: {
      completed:      campaign.executionMetrics.callsCompleted || 0,
      failed:         campaign.executionMetrics.callsFailed    || 0,
      noAnswer:       campaign.executionMetrics.callsNoAnswer  || 0,
      total,
      percentage:     Math.round((processed / total) * 100),
      queueRemaining: mem?.queueRemaining ?? 0,
    },
    isInMemory: !!mem,
  };
}

module.exports = {
  createCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  stopCampaign,
  getCampaignStatus,
};
