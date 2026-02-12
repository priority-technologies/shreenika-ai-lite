import mongoose from "mongoose";

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

    hasOnboarded: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

// TODO: Add encryption/decryption middleware for apiKey and apiSecret fields

export default mongoose.model("User", userSchema);
