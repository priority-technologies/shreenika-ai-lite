/**
 * SmartAgent.model.js
 * ============================================================
 * MongoDB Schema for SMART Agent Configuration
 * Stores: Profile, Role, Voice, Speech, Background settings
 *
 * Based on: SMART_AGENT_BLUEPRINT.md (Version 2.0)
 * Author: Claude Code
 * Date: 2026-02-23
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SmartAgentSchema = new Schema({
  // ============================================================
  // AGENT PROFILE
  // ============================================================
  agentName: {
    type: String,
    required: true,
    description: 'Display name of the agent'
  },

  agentRole: {
    type: String,
    enum: ['Sales', 'Support', 'Lead Qualification', 'Appointment Booking'],
    required: true,
    description: 'Primary role of the agent'
  },

  agentPersonality: {
    type: String,
    description: 'Brief personality description (e.g., "Friendly professional in real estate")'
  },

  primaryLanguage: {
    type: String,
    enum: ['English', 'Marathi', 'Hindi', 'Hinglish', 'Tamil', 'Telugu', 'Kannada'],
    default: 'English',
    description: 'Primary language the agent speaks'
  },

  targetAudience: {
    type: String,
    description: 'Who this agent talks to (e.g., "High-net-worth property buyers")'
  },

  industryContext: {
    type: String,
    description: 'Industry/vertical (Real Estate, Finance, E-commerce, SaaS, etc.)'
  },

  // ============================================================
  // AGENT ROLE SETTINGS
  // ============================================================
  primaryObjective: {
    type: String,
    enum: ['Close Sale', 'Qualify Lead', 'Schedule Meeting', 'Provide Support', 'Gather Information'],
    required: true,
    description: 'Primary conversational objective'
  },

  conversationStyle: {
    type: String,
    enum: ['Consultative', 'Direct', 'Warm', 'Professional', 'Casual', 'Formal'],
    default: 'Consultative',
    description: 'How the agent communicates'
  },

  handlingApproach: {
    type: String,
    description: 'How to handle objections (e.g., "Acknowledge, provide data, offer alternatives")'
  },

  escalationTrigger: {
    type: String,
    description: 'When to hand off to human (e.g., "On 3 objections or escalation request")'
  },

  meetingBookingFlow: {
    type: Boolean,
    default: false,
    description: 'If true, include calendar integration and confirmation steps'
  },

  callDuration: {
    type: Number,
    default: 15,
    min: 1,
    max: 60,
    description: 'Max call duration in minutes'
  },

  followupStrategy: {
    type: String,
    description: 'After-call actions (SMS, Email, Calendar reminder, etc.)'
  },

  // ============================================================
  // VOICE SETTINGS (40-60 Ratio)
  // ============================================================
  voiceProvider: {
    type: String,
    enum: ['Gemini Live', 'Google TTS', 'Custom PCM'],
    default: 'Gemini Live',
    description: 'Voice provider for audio synthesis'
  },

  voiceCharacteristics: {
    tone: {
      type: String,
      enum: ['Professional', 'Friendly', 'Empathetic', 'Enthusiastic', 'Helpful'],
      default: 'Professional',
      description: 'Tone of voice'
    },

    emotionLevel: {
      type: Number,
      min: 0.0,
      max: 1.0,
      default: 0.5,
      description: 'Emotion level (0.0=calm/neutral, 1.0=enthusiastic)'
    },

    pitch: {
      type: Number,
      min: 0.75,
      max: 1.25,
      default: 1.0,
      description: 'Pitch multiplier (1.0=natural, <1.0=lower, >1.0=higher)'
    },

    speed: {
      type: Number,
      min: 0.75,
      max: 1.25,
      default: 1.0,
      description: 'Speech speed multiplier (1.0=normal, <1.0=slower, >1.0=faster)'
    },

    pauseDuration: {
      type: Number,
      default: 300,
      description: 'Natural thinking pauses in milliseconds (100-500ms)'
    },

    clarity: {
      type: String,
      enum: ['Natural', 'Crystal-Clear', 'Conversational', 'Formal'],
      default: 'Natural',
      description: 'Audio clarity setting'
    }
  },

  responseVariation: {
    type: Boolean,
    default: true,
    description: 'If true, Gemini avoids repetitive phrasing'
  },

  accentPreference: {
    type: String,
    enum: ['Neutral', 'Indian', 'British', 'American'],
    default: 'Neutral',
    description: 'Accent preference'
  },

  // ============================================================
  // BACKGROUND SOUND / AMBIANCE
  // ============================================================
  ambiance: {
    type: String,
    enum: ['None', 'Light Office', 'Busy Office', 'Coffee Shop', 'Call Center', 'Professional Quiet'],
    default: 'None',
    description: 'Background ambiance setting'
  },

  ambianceSound: {
    type: String,
    description: 'Optional background audio file path (loops)'
  },

  volumeLevel: {
    type: Number,
    min: 0,
    max: 30,
    default: 15,
    description: 'Background volume as % of main voice'
  },

  includeEnvironmentNoise: {
    type: Boolean,
    default: false,
    description: 'Subtle typing, papers, phone rings (makes it sound real)'
  },

  // ============================================================
  // SPEECH SETTINGS
  // ============================================================
  interruptionSensitivity: {
    type: String,
    enum: ['High', 'Medium', 'Low'],
    default: 'Medium',
    description: 'How quickly agent responds to interruptions'
  },

  thinkingPauseDuration: {
    type: Number,
    default: 300,
    min: 200,
    max: 800,
    description: 'Natural pause before responding (milliseconds)'
  },

  fillerFrequency: {
    type: String,
    enum: ['Rare', 'Occasional', 'Frequent'],
    default: 'Occasional',
    description: 'How often to use fillers during silence'
  },

  responseLength: {
    type: String,
    enum: ['Short', 'Medium', 'Long'],
    default: 'Medium',
    description: 'Typical response length (1-2, 2-3, or 3+ sentences)'
  },

  questionAsking: {
    type: Number,
    min: 0,
    max: 100,
    default: 60,
    description: '% of turns that end with question to keep conversation going'
  },

  emphasisPatterns: {
    type: String,
    description: 'How to emphasize key points (e.g., "Repeat important numbers, stress benefits")'
  },

  conversationalFlowStyle: {
    type: String,
    enum: ['RapidFire', 'Measured', 'Thoughtful', 'Interactive'],
    default: 'Measured',
    description: 'Conversational rhythm and engagement pattern'
  },

  sideTalkAllowed: {
    type: Boolean,
    default: true,
    description: 'If true, agent can make light comments (more human-like)'
  },

  // ============================================================
  // KNOWLEDGE BASE
  // ============================================================
  knowledgeBase: [{
    name: String,
    content: String,
    type: String, // 'pdf', 'text', 'document', etc.
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  systemPrompt: {
    type: String,
    description: 'Custom system prompt (optional override)'
  },

  // ============================================================
  // METADATA
  // ============================================================
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    description: 'Owner of this agent'
  },

  accountId: {
    type: Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
    description: 'Account this agent belongs to'
  },

  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Testing', 'Archived'],
    default: 'Active',
    description: 'Agent status'
  },

  tags: [String],

  createdAt: {
    type: Date,
    default: Date.now,
    description: 'When agent was created'
  },

  updatedAt: {
    type: Date,
    default: Date.now,
    description: 'When agent was last modified'
  },

  // ============================================================
  // USAGE STATISTICS
  // ============================================================
  statistics: {
    totalCalls: {
      type: Number,
      default: 0,
      description: 'Total calls made with this agent'
    },

    totalMinutes: {
      type: Number,
      default: 0,
      description: 'Total call duration in minutes'
    },

    avgSentiment: {
      type: Number,
      default: 0.5,
      description: 'Average customer sentiment across all calls'
    },

    conversionRate: {
      type: Number,
      default: 0,
      description: 'Sales conversion rate (0-1)'
    },

    lastCallDate: Date,

    lastModified: Date
  }
});

// Timestamps
SmartAgentSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Create indexes for faster queries
SmartAgentSchema.index({ userId: 1, status: 1 });
SmartAgentSchema.index({ accountId: 1 });
SmartAgentSchema.index({ agentRole: 1 });
SmartAgentSchema.index({ primaryLanguage: 1 });

const SmartAgent = mongoose.model('SmartAgent', SmartAgentSchema);

module.exports = SmartAgent;
