import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
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

    name: {
      type: String,
      required: true
    },

    status: {
      type: String,
      enum: ["PENDING", "RUNNING", "PAUSED", "COMPLETED", "FAILED"],
      default: "PENDING",
      index: true
    },

    // Lead tracking
    leads: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Lead"
      }
    ],

    totalLeads: {
      type: Number,
      default: 0
    },

    completedLeads: {
      type: Number,
      default: 0
    },

    // Call outcomes
    successfulCalls: {
      type: Number,
      default: 0
    },

    failedCalls: {
      type: Number,
      default: 0
    },

    missedCalls: {
      type: Number,
      default: 0
    },

    noAnswerCalls: {
      type: Number,
      default: 0
    },

    // Statistics
    averageDuration: {
      type: Number,
      default: 0
    },

    totalDuration: {
      type: Number,
      default: 0
    },

    // Timestamps
    startedAt: Date,
    completedAt: Date,
    pausedAt: Date,

    // Configuration
    maxConcurrentCalls: {
      type: Number,
      default: 5
    },

    // Notes
    notes: String,

    // For resume functionality
    currentBatchIndex: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

// Indexes for efficient querying
campaignSchema.index({ userId: 1, status: 1 });
campaignSchema.index({ userId: 1, createdAt: -1 });
campaignSchema.index({ agentId: 1, status: 1 });

// Calculate success rate
campaignSchema.virtual("successRate").get(function() {
  if (this.completedLeads === 0) return 0;
  return Math.round((this.successfulCalls / this.completedLeads) * 100);
});

// Calculate average duration
campaignSchema.pre("save", function(next) {
  if (this.successfulCalls > 0) {
    this.averageDuration = Math.round(this.totalDuration / this.successfulCalls);
  }
  next();
});

export default mongoose.model("Campaign", campaignSchema);
