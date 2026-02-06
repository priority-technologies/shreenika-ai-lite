import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    month: {
      type: String, // format: YYYY-MM
      required: true,
      index: true
    },

    inboundMinutes: {
      type: Number,
      default: 0
    },

    outboundMinutes: {
      type: Number,
      default: 0
    },

    inboundCost: {
      type: Number,
      default: 0
    },

    outboundCost: {
      type: Number,
      default: 0
    },

    totalAmount: {
      type: Number,
      required: true
    },

    breakdown: {
      llm: Number,
      stt: Number,
      tts: Number,
      infrastructure: Number
    },

    generatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

invoiceSchema.index({ userId: 1, month: 1 }, { unique: true });

export default mongoose.model("Invoice", invoiceSchema);
