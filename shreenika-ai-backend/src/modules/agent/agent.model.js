import mongoose from "mongoose";

const AgentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    name: String,
    title: String,
    avatar: String,

    language: String,
    voiceId: String,

    prompt: String,
    welcomeMessage: String,

    characteristics: [String],

    maxCallDuration: Number,
    silenceDetectionMs: Number,

    voicemailDetection: Boolean,
    voicemailAction: String,
    voicemailMessage: String,

    voiceSpeed: Number,
    interruptionSensitivity: Number,
    responsiveness: Number,
    emotionLevel: Number,

    backgroundNoise: String,

    knowledgeBase: Array
  },
  { timestamps: true }
);

export default mongoose.model("Agent", AgentSchema);
