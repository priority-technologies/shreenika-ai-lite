import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    firstName: {
      type: String,
      trim: true
    },

    lastName: {
      type: String,
      trim: true
    },

    email: {
      type: String,
      trim: true,
      lowercase: true
    },

    phone: {
      type: String,
      trim: true
    },

    company: {
      name: { type: String, trim: true },
      employees: { type: Number },
      website: { type: String, trim: true }
    },

    address: {
      type: String,
      trim: true
    },

    status: {
      type: String,
      enum: ["new", "contacted", "qualified", "closed"],
      default: "new"
    },

    source: {
      type: String,
      enum: ["manual", "csv"],
      default: "manual"
    }
  },
  {
    timestamps: true
  }
);

/* =========================
   INDEXES (USER ISOLATION)
========================= */
contactSchema.index({ ownerUserId: 1 });
contactSchema.index({ ownerUserId: 1, email: 1 });

export default mongoose.model("Contact", contactSchema);
