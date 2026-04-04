'use strict';

/**
 * Call Model — MongoDB-backed persistent call record
 * CommonJS port of reference call.model.js
 * 2026-03-22
 */

const mongoose = require('mongoose');

const callSchema = new mongoose.Schema(
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

    leadId: {
      type: mongoose.Schema.Types.Mixed,   // string or ObjectId from campaign leads
      index: true,
    },

    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      index: true,
    },

    direction: {
      type: String,
      enum: ['OUTBOUND', 'INBOUND'],
      required: true,
    },

    status: {
      type: String,
      enum: ['INITIATED', 'DIALING', 'RINGING', 'ANSWERED', 'COMPLETED', 'FAILED', 'MISSED', 'NO_ANSWER'],
      default: 'INITIATED',
      index: true,
    },

    // ── VOIP identifiers ──────────────────────────────────────────────────
    twilioCallSid: { type: String, index: true },
    providerCallId: { type: String, index: true },

    voipProvider: {
      type: String,
      enum: ['Twilio', 'Bland AI', 'Vapi', 'Vonage', 'SansPBX', 'Other'],
      default: 'Twilio',
    },

    voipNumberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VoipNumber',
      index: true,
    },

    voipProviderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VoipProvider',
      index: true,
    },

    // ── Phone info ────────────────────────────────────────────────────────
    phoneNumber: { type: String },   // TO (callee)
    fromNumber:  { type: String },   // FROM (caller DID)
    leadName:    { type: String },

    // ── Timing ────────────────────────────────────────────────────────────
    durationSeconds: { type: Number, default: 0 },
    answeredAt:      { type: Date },
    endedAt:         { type: Date },

    // ── Recording ─────────────────────────────────────────────────────────
    recordingUrl: { type: String },
    recordingStatus: {
      type: String,
      enum: ['pending', 'recording', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    recordingMetadata: {
      gcsPath:  String,
      duration: Number,
      fileSize: Number,
      format:   { type: String, default: 'wav' },
    },
    // ── MISSING FIX #3: Separate caller and Gemini recording paths (bidirectional) ──
    recordingPath: { type: String },        // Caller audio (8kHz PCM)
    geminiRecordingPath: { type: String }, // Gemini audio (16kHz PCM)

    // ── Transcript ────────────────────────────────────────────────────────
    transcript: { type: String },
    transcriptStatus: {
      type: String,
      enum: ['pending', 'generating', 'completed', 'failed'],
      default: 'pending',
    },
    conversationTurns: [
      {
        role:      { type: String, enum: ['agent', 'user'] },
        content:   String,
        timestamp: { type: Date, default: Date.now },
      },
    ],

    // ── Post-call analytics ───────────────────────────────────────────────
    summary:        { type: String },
    sentiment:      { type: String, enum: ['Positive', 'Neutral', 'Negative', 'Unknown'] },
    sentimentScore: { type: Number, min: -1, max: 1 },

    outcome: {
      type: String,
      enum: ['meeting_booked', 'callback_requested', 'not_interested', 'voicemail', null],
      default: null,
      index: true,
    },

    rating: { type: Number, min: 0, max: 5, default: 0 },

    callAnalysis: {
      emotionDetected:   String,
      userSentiment:     String,
      agentPerformance:  String,
      keyDecisionPoints: [String],
    },

    dialStatus: { type: String },

    endReason: {
      type: String,
      enum: [
        'normal-clearing',
        'user-hangup',
        'agent-hangup',
        'max-duration-reached',
        'voicemail-detected',
        'network-error',
        'timeout',
        'user-interruption',
        null,
      ],
    },

    usageCost:   { type: String },
    aiProcessed: { type: Boolean, default: false, index: true },
    archived:    { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Call || mongoose.model('Call', callSchema);
