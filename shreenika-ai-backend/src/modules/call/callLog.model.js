import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema(
  {
    callId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Call",
      required: true,
      index: true
    },

    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign"
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    },

    event: {
      type: String,
      enum: [
        "INITIATED",
        "DIALING",
        "RINGING",
        "ANSWERED",
        "COMPLETED",
        "FAILED",
        "MISSED",
        "NO_ANSWER"
      ],
      required: true,
      index: true
    },

    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },

    details: String,

    // Store raw provider response for debugging
    data: mongoose.Schema.Types.Mixed,

    // For easier querying
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead"
    },

    leadName: String,
    phoneNumber: String,

    voipProvider: String,

    // Call status at time of log
    callStatus: String,
    durationSeconds: Number
  },
  { timestamps: false }
);

// Index for campaign logs queries
callLogSchema.index({ campaignId: 1, timestamp: -1 });
callLogSchema.index({ callId: 1, timestamp: -1 });
callLogSchema.index({ userId: 1, timestamp: -1 });

export default mongoose.model("CallLog", callLogSchema);
