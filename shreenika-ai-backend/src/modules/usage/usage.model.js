import mongoose from "mongoose";

const usageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    month: {
      type: String,
      required: true,
      index: true
    },

    voiceMinutesUsed: { type: Number, default: 0 },
    llmTokensUsed: { type: Number, default: 0 },

    hardStopped: { type: Boolean, default: false }
  },
  { timestamps: true }
);

usageSchema.index({ userId: 1, month: 1 }, { unique: true });

export default mongoose.model("Usage", usageSchema);
