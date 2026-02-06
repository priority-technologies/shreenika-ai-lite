import mongoose from "mongoose";

const knowledgeSchema = new mongoose.Schema(
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
      index: true
    },

    title: { type: String },

    sourceType: {
      type: String,
      enum: ["TEXT", "PDF", "IMAGE", "URL"],
      required: true
    },

    rawText: { type: String },

    embedding: {
      type: [Number], // OpenAI embedding vector
      index: false
    },

    meta: {
      type: Object
    }
  },
  { timestamps: true }
);

export default mongoose.model("Knowledge", knowledgeSchema);
