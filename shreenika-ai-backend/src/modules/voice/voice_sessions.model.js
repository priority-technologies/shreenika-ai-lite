/**
 * Voice Session Model
 * Stores voice conversation history, transcripts, and metrics
 */

import mongoose from 'mongoose';

const VoiceSessionSchema = new mongoose.Schema(
  {
    // Session Info
    sessionId: {
      type: String,
      required: true,
      index: true
    },

    callId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Call',
      index: true
    },

    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
      index: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // ===== CONVERSATION TRANSCRIPT =====
    transcript: [
      {
        role: {
          type: String,
          enum: ['user', 'assistant'],
          required: true
        },
        text: {
          type: String,
          required: true
        },
        timestamp: {
          type: Date,
          default: Date.now
        },
        confidence: Number  // STT confidence score (0-1)
      }
    ],

    // ===== VOICE SETTINGS USED =====
    voiceProfile: {
      voiceId: String,
      displayName: String,
      googleVoiceId: String,
      language: String
    },

    speechSettings: {
      voiceSpeed: Number,
      interruptionSensitivity: Number,
      responsiveness: Number,
      emotions: Number,
      backgroundNoise: String
    },

    // ===== PERFORMANCE METRICS =====
    metrics: {
      // Overall
      duration: Number,                    // session duration in ms
      totalMessages: Number,               // user + assistant messages

      // STT Metrics
      averageSTTLatency: Number,          // ms
      sttErrors: Number,
      sttConfidence: Number,              // average confidence

      // LLM Metrics
      averageLLMLatency: Number,          // ms
      llmErrors: Number,
      averageResponseLength: Number,      // tokens

      // TTS Metrics
      averageTTSLatency: Number,          // ms
      ttsErrors: Number,

      // Overall Pipeline
      averageCycleLatency: Number,        // STT + LLM + TTS total
      totalCycles: Number,
      errorRate: Number                   // errors / cycles
    },

    // ===== QUALITY & ANALYSIS =====
    quality: {
      userSentiment: String,              // positive, neutral, negative
      callCompleteness: {
        type: Number,
        min: 0,
        max: 100                          // percentage of objectives met
      },
      agentPerformance: {
        type: Number,
        min: 0,
        max: 100                          // agent effectiveness score
      },
      notes: String                       // manual notes
    },

    // ===== STATUS =====
    status: {
      type: String,
      enum: ['active', 'completed', 'failed', 'interrupted'],
      default: 'active'
    },

    endReason: String,                    // why session ended

    // ===== TIMESTAMPS =====
    startedAt: {
      type: Date,
      default: Date.now
    },

    endedAt: Date
  },
  { timestamps: true }
);

// Indexes for efficient querying
VoiceSessionSchema.index({ sessionId: 1 });
VoiceSessionSchema.index({ agentId: 1, createdAt: -1 });
VoiceSessionSchema.index({ userId: 1, createdAt: -1 });
VoiceSessionSchema.index({ callId: 1 });
VoiceSessionSchema.index({ status: 1 });

export default mongoose.model('VoiceSession', VoiceSessionSchema);
