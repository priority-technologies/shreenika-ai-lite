import mongoose from "mongoose";

const callSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
      index: true
    },

    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      index: true
    },

    direction: {
      type: String,
      enum: ["OUTBOUND", "INBOUND"],
      required: true
    },

    status: {
      type: String,
      enum: ["INITIATED", "RINGING", "ANSWERED", "COMPLETED", "FAILED", "MISSED"],
      default: "INITIATED",
      index: true
    },

    twilioCallSid: {
      type: String,
      index: true
    },

    voipProvider: {
      type: String,
      enum: ["Twilio", "Bland AI", "Vapi", "Vonage", "Other"],
      default: "Twilio"
    },

    providerCallId: {
      type: String,
      index: true
    },

    phoneNumber: {
      type: String
    },

    leadName: {
      type: String
    },

    durationSeconds: {
      type: Number,
      default: 0
    },

    recordingUrl: {
      type: String
    },

    transcript: {
      type: String
    },

    // Real-time conversation turns from Gemini Live
    conversationTurns: [{
      role: {
        type: String,
        enum: ["agent", "user"]
      },
      content: String,
      timestamp: {
        type: Date,
        default: Date.now
      }
    }],

    summary: {
      type: String
    },

    sentiment: {
      type: String,
      enum: ["Positive", "Neutral", "Negative"]
    },

    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },

    dialStatus: {
      type: String
    },

    endReason: {
      type: String
    },

    usageCost: {
      type: String
    },

    aiProcessed: {
      type: Boolean,
      default: false,
      index: true
    },

    archived: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("Call", callSchema);
