'use strict';

/**
 * Campaign Model — CommonJS conversion from ES6 reference
 * 2026-03-22
 */

const mongoose = require('mongoose');

const CampaignSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    agentId: {
      type: String,   // Agent uses string IDs like 'agent-default-001'
      required: true,
      index: true,
    },

    // ── Basic Info ────────────────────────────────────────────────────────
    name:        { type: String, required: true },
    description: String,

    // ── Configuration Sheet (Agent defaults + Campaign overrides) ─────────
    configurationSheet: {
      voiceProfile: {
        voiceId:       String,
        displayName:   String,
        googleVoiceId: String,
        language:      String,
      },

      speechSettings: {
        voiceSpeed:                { type: Number, default: 1.0, min: 0.75, max: 1.25 },
        interruptionSensitivity:   { type: Number, default: 0.5, min: 0,    max: 1    },
        responsiveness:            { type: Number, default: 0.5, min: 0,    max: 1    },
        emotions:                  { type: Number, default: 0.5, min: 0,    max: 1    },
        backgroundNoise:           { type: String, default: 'office' },
      },

      callStartBehavior: {
        type:    String,
        enum:    ['waitForHuman', 'startImmediately', 'initiate'],
        default: 'waitForHuman',
      },

      callSettings: {
        maxCallDuration:    { type: Number, default: 3600   },
        silenceDetectionMs: { type: Number, default: 30000  },
        voicemailDetection: { type: Boolean, default: true  },
        voicemailAction:    { type: String, default: 'leave-message' },
        voicemailMessage:   String,
      },

      role: {
        agentRole:        String,
        systemInstruction: String,
        longPrompt:       String,
        companyName:      String,
        productInfo:      String,
        targetAudience:   String,
        welcomeMessage:   String,
        documentIds: [
          { type: mongoose.Schema.Types.ObjectId, ref: 'Knowledge' },
        ],
      },

      overriddenFields: [String],
    },

    // ── Leads ─────────────────────────────────────────────────────────────
    leads: [
      {
        leadId:   { type: mongoose.Schema.Types.Mixed },  // string or ObjectId
        name:     String,
        phone:    String,
        email:    String,
        metadata: mongoose.Schema.Types.Mixed,

        status: {
          type: String,
          enum: ['pending', 'calling', 'completed', 'failed', 'no-answer', 'voicemail', 'retry-pending'],
          default: 'pending',
        },

        callId:        String,
        retryCount:    { type: Number, default: 0 },
        lastAttemptAt: Date,
        completedAt:   Date,
        notes:         String,
      },
    ],

    // ── Execution ─────────────────────────────────────────────────────────
    parallelSlots: { type: Number, default: 5, min: 1, max: 5 },

    status: {
      type: String,
      enum: ['draft', 'running', 'paused', 'completed', 'cancelled'],
      default: 'draft',
      index: true,
    },

    executionMetrics: {
      totalLeads:          Number,
      callsCompleted:      { type: Number, default: 0 },
      callsFailed:         { type: Number, default: 0 },
      callsNoAnswer:       { type: Number, default: 0 },
      callsVoicemail:      { type: Number, default: 0 },
      currentActiveSlots:  { type: Number, default: 0 },
      totalDuration:       { type: Number, default: 0 },
      averageDuration:     { type: Number, default: 0 },
    },

    // ── Timestamps ────────────────────────────────────────────────────────
    startedAt:   Date,
    completedAt: Date,
    pausedAt:    Date,
  },
  { timestamps: true }
);

module.exports = mongoose.models.Campaign || mongoose.model('Campaign', CampaignSchema);
