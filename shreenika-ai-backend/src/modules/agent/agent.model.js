import mongoose from "mongoose";

const AgentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    // Agent active status (frozen agents can't be used for calls)
    isActive: {
      type: Boolean,
      default: true
    },

    // Basic Info
    name: String,
    title: String,
    avatar: String,
    prompt: String,
    welcomeMessage: String,
    characteristics: [String],
    knowledgeBase: Array,

    // ===== VOICE CONFIGURATION =====
    voiceProfile: {
      voiceId: String,           // voice_1, voice_2, etc.
      displayName: String,       // "Adit (Male, Professional)"
      googleVoiceId: String,     // "en-IN-Neural2-B"
      language: String           // "en-IN", "hi-IN", "hinglish"
    },

    speechSettings: {
      voiceSpeed: {
        type: Number,
        default: 1.0,            // 0.75x → 1.25x
        min: 0.75,
        max: 1.25
      },

      interruptionSensitivity: {
        type: Number,
        default: 0.5,            // 0 (Low) → 1 (High)
        min: 0,
        max: 1
      },

      responsiveness: {
        type: Number,
        default: 0.5,            // 0 (Slow) → 1 (Fast)
        min: 0,
        max: 1
      },

      emotions: {
        type: Number,
        default: 0.5,            // 0 (Calm) → 1 (Emotional)
        min: 0,
        max: 1
      },

      backgroundNoise: {
        type: String,
        enum: ["office", "quiet", "cafe", "street", "call-center"],
        default: "office"
      }
    },

    // ===== CALL START BEHAVIOR =====
    // Controls when the AI agent starts speaking on the call
    callStartBehavior: {
      type: String,
      enum: ["waitForHuman", "startImmediately"],
      default: "waitForHuman"
    },

    // ===== CALL SETTINGS =====
    callSettings: {
      maxCallDuration: {
        type: Number,
        default: 3600            // 1 hour in seconds
      },

      silenceDetectionMs: {
        type: Number,
        default: 15              // seconds
      },

      voicemailDetection: {
        type: Boolean,
        default: true
      },

      voicemailAction: {
        type: String,
        enum: ["leave-message", "hang-up", "transfer"],
        default: "leave-message"
      },

      voicemailMessage: String
    }
  },
  { timestamps: true }
);

export default mongoose.model("Agent", AgentSchema);
