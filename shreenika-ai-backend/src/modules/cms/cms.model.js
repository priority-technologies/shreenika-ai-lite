import mongoose from "mongoose";

const cmsSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["privacy", "faqs"],
      required: true,
      unique: true
    },
    content: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);

export default mongoose.model("CMS", cmsSchema);
