import mongoose from "mongoose";

const promptCacheSchema = new mongoose.Schema(
  {
    hash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    response: {
      type: Object,
      required: true
    },

    tokensUsed: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

export default mongoose.model("PromptCache", promptCacheSchema);
