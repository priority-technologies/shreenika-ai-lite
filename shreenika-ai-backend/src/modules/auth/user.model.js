import mongoose from "mongoose";


const voipProviderSchema = new mongoose.Schema({
  providerType: { type: String, enum: ["twilio", "other"], required: true },
  providerName: { type: String }, // e.g., Twilio, MyProvider
  apiKey: { type: String }, // Encrypted
  apiSecret: { type: String }, // Encrypted
  endpointUrl: { type: String },
  httpMethod: { type: String },
  headers: { type: Object },
  region: { type: String },
  dids: [
    {
      number: { type: String },
      assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent" },
      status: { type: String, enum: ["active", "inactive"], default: "active" }
    }
  ],
  status: { type: String, enum: ["connected", "error", "pending"], default: "pending" },
  lastValidated: { type: Date }
});

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String
    },

    role: {
      type: String,
      default: "user"
    },

    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local"
    },

    emailVerified: {
      type: Boolean,
      default: false
    },

    emailVerificationToken: {
      type: String
    },

    resetPasswordToken: {
      type: String
    },

    resetPasswordExpires: {
      type: Date
    },

    isActive: {
      type: Boolean,
      default: true
    },

    voipProvider: voipProviderSchema // Only one per user
  },
  { timestamps: true }
);

// TODO: Add encryption/decryption middleware for apiKey and apiSecret fields

export default mongoose.model("User", userSchema);
