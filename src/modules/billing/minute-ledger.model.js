'use strict';
const mongoose = require('mongoose');

// Every call minute consumed gets a ledger entry — used for graph + audit
const minuteLedgerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // Source of the call
  source: {
    type: String,
    enum: ['campaign', 'test_agent', 'manual', 'admin_award', 'admin_deduct'],
    required: true,
  },

  callId:     { type: String, default: null },
  agentId:    { type: String, default: null },
  campaignId: { type: String, default: null },

  // Duration
  durationSeconds: { type: Number, default: 0 },
  durationMinutes: { type: Number, default: 0 }, // ceil(durationSeconds / 60)

  // Cache vs Gemini breakdown
  geminiMinutes: { type: Number, default: 0 },
  cacheMinutes:  { type: Number, default: 0 },

  // Billing month for grouping in graphs
  month: { type: String }, // "2026-03"

  // Minutes deducted from balance
  minutesDeducted: { type: Number, default: 0 },

}, { timestamps: true });

minuteLedgerSchema.index({ userId: 1, month: 1 });
minuteLedgerSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('MinuteLedger', minuteLedgerSchema);
