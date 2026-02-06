// backend/models/Agent.js

const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  avatar: {
    type: String,
    required: true,
  },
  prompt: {
    type: String,
    required: true,
  },
  welcomeMessage: {
    type: String,
    required: true,
  },
  characteristics: {
    type: [String],
    default: [],
  },
  language: {
    type: String,
    default: 'English',
  },
  voiceId: {
    type: String,
    required: true,
  },
  maxCallDuration: {
    type: Number,
    default: 300,
  },
  voicemailDetection: {
    type: Boolean,
    default: false,
  },
  voicemailAction: {
    type: String,
    default: 'Hang up',
  },
  voicemailMessage: {
    type: String,
    default: '',
  },
  silenceDetectionMs: {
    type: Number,
    default: 30,
  },
  voiceSpeed: {
    type: Number,
    default: 1.0,
  },
  interruptionSensitivity: {
    type: Number,
    default: 0.5,
  },
  responsiveness: {
    type: Number,
    default: 0.5,
  },
  emotionLevel: {
    type: Number,
    default: 0.5,
  },
  backgroundNoise: {
    type: String,
    default: 'None',
  },
  knowledgeBase: {
    type: Array,
    default: [],
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Agent', agentSchema);