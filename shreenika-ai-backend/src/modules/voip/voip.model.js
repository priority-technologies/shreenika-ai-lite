import mongoose from "mongoose";

const voipProviderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    provider: {
      type: String,
      enum: ["Twilio", "Bland AI", "Vapi", "Vonage", "Other"],
      required: true,
    },

    // Provider credentials (encrypted in production)
    credentials: {
      accountSid: String, // Twilio: Account SID
      authToken: String, // Twilio: Auth Token
      apiKey: String, // Generic API Key for other providers
      secretKey: String, // Generic Secret Key
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    lastSyncedAt: Date,
  },
  { timestamps: true }
);

const voipNumberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VoipProvider",
      required: true,
    },

    phoneNumber: {
      type: String,
      required: true,
      unique: true,
    },

    friendlyName: String,
    region: String,
    country: String,

    capabilities: {
      voice: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      mms: { type: Boolean, default: false },
    },

    // Agent assignment
    assignedAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      default: null,
    },

    // Pricing
    monthlyCost: {
      type: Number,
      default: 1.15, // USD
    },

    // Status
    status: {
      type: String,
      enum: ["active", "released", "pending"],
      default: "active",
    },

    // Source
    source: {
      type: String,
      enum: ["purchased", "imported"],
      default: "imported",
    },

    // External provider data
    providerData: {
      sid: String, // Twilio Phone Number SID
      capabilities: Object,
      addressRequirements: String,
    },
  },
  { timestamps: true }
);

// Index for faster queries
voipNumberSchema.index({ userId: 1, status: 1 });
voipNumberSchema.index({ assignedAgentId: 1 });

export const VoipProvider = mongoose.model("VoipProvider", voipProviderSchema);
export const VoipNumber = mongoose.model("VoipNumber", voipNumberSchema);
