'use strict';
/**
 * Agent MongoDB Model — CommonJS flat schema
 * Mirrors exactly what agent.service.js (in-memory) was storing,
 * so all existing routes need zero shape changes.
 *
 * Key design decisions:
 *  - agentId (string) is the canonical identifier — same value that the
 *    frontend sends as id / _id in every API call.
 *  - strict: false  — lets extra frontend fields pass through without error.
 *  - knowledgeBase  — array of mixed docs (PDF OCR results, etc.)
 */

const mongoose = require('mongoose');

// ── Sub-schema for knowledge-base documents ──────────────────────────────────
const KnowledgeDocSchema = new mongoose.Schema(
  {
    id:         { type: String },
    title:      { type: String },
    name:       { type: String },      // frontend alias for title
    content:    { type: String },
    size:       { type: String },
    type:       { type: String },
    status:     { type: String, default: 'synced' },
    uploadedAt: { type: String },
    addedAt:    { type: String },      // legacy field
    assignedAgentIds: [String],
    uploadedFrom: { type: String },
  },
  { _id: false }
);

// ── Main agent schema ────────────────────────────────────────────────────────
const AgentSchema = new mongoose.Schema(
  {
    // Custom string ID — frontend uses this as agent.id / agent._id
    agentId: { type: String, required: true, unique: true, index: true },

    // Owner — required for per-user plan enforcement (agent limits, doc limits)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },

    // Names (dual naming convention — both kept in sync)
    agentName: { type: String },
    name:      { type: String },

    // Role
    agentRole:       { type: String },
    title:           { type: String },
    agentObjective:  { type: String },
    company:         { type: String },
    description:     { type: String, default: '' },
    industry:        { type: String, default: 'general' },
    avatar:          { type: String, default: '' },

    // Language / voice
    language:        { type: String, default: 'en-IN' },
    primaryLanguage: { type: String, default: 'en-IN' },
    voiceId:         { type: String, default: 'Aoede' },
    voiceTone:       { type: String, default: 'Professional and warm' },
    voiceGender:     { type: String, default: 'FEMALE' },
    voiceAccent:     { type: String, default: 'neutral' },

    // Personality
    characteristics:      { type: [String], default: ['Professional', 'Helpful', 'Friendly'] },
    psychologyPrinciples: { type: [String], default: ['RECIPROCITY', 'AUTHORITY', 'SOCIAL_PROOF'] },
    principleWeights:     { type: mongoose.Schema.Types.Mixed },

    // Prompt / instruction
    systemPrompt:   { type: String },
    prompt:         { type: String },   // frontend alias
    welcomeMessage: { type: String },

    // Knowledge base
    knowledgeBase: { type: [KnowledgeDocSchema], default: [] },

    // Status
    status:   { type: String, default: 'active' },
    isActive: { type: Boolean, default: true },

    // Call lifecycle
    callStartBehavior:  { type: String, default: 'initiate' },
    maxCallDuration:    { type: Number, default: 3600 },
    endCallOnSilence:   { type: Number, default: 30000 },
    silenceDetectionMs: { type: Number, default: 30000 },
    voicemailDetection: { type: Boolean, default: true },
    voicemailAction:    { type: String, default: 'hang_up' },
    voicemailMessage:   { type: String },
    retryAttempts:      { type: Number, default: 3 },
    callingLimit:       { type: Number, default: 60 },

    // Speech / behaviour sliders
    interruptionSensitivity: { type: Number, default: 0.5 },
    responsiveness:          { type: Number, default: 0.5 },
    emotionLevel:            { type: Number, default: 0.5 },
    // backgroundNoise: disabled — Gemini Live API has no background noise parameter.
    // UI dropdown hidden. Will re-enable when audio mixing is implemented.
    // backgroundNoise:         { type: String, default: 'Office' },

    // Context Caching Layer 2 — Vertex AI cached system instruction
    // cachedContentName: full resource name from Vertex AI Cache API
    // cachedContentHash: SHA256 of instruction — used to detect prompt changes
    // cachedContentExpiry: when this cache entry expires (23-hour TTL)
    cachedContentName:   { type: String,  default: null },
    cachedContentHash:   { type: String,  default: null },
    cachedContentExpiry: { type: Date,    default: null },
  },
  {
    timestamps: true,  // adds createdAt / updatedAt automatically
    strict: false,     // allow extra frontend fields without rejection
  }
);

module.exports = mongoose.model('VoiceAgent', AgentSchema);
