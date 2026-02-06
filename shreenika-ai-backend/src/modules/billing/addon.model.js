import mongoose from "mongoose";

/**
 * AddOn Model
 * Tracks purchased add-ons for each user
 */
const AddOnSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    plan: {
      type: String,
      enum: ["Starter", "Pro", "Enterprise"],
      required: true
    },

    addOns: [
      {
        type: {
          type: String,
          enum: ["extra_documents", "extra_agent", "training_package"],
          required: true
        },
        quantity: {
          type: Number,
          required: true,
          min: 1
        },
        cost: {
          type: Number,
          required: true,
          min: 0
        },
        purchasedAt: {
          type: Date,
          default: Date.now
        },
        isActive: {
          type: Boolean,
          default: true
        },
        // Stripe payment reference
        stripePaymentIntentId: String,
        // Metadata
        metadata: {
          type: mongoose.Schema.Types.Mixed,
          default: {}
        }
      }
    ],

    // Total monthly recurring cost from all add-ons
    totalAddOnCost: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

// Index for faster lookups
AddOnSchema.index({ userId: 1, "addOns.isActive": 1 });

// Calculate total add-on cost before saving
AddOnSchema.pre("save", function (next) {
  this.totalAddOnCost = this.addOns
    .filter((addon) => addon.isActive)
    .reduce((total, addon) => total + addon.cost, 0);
  next();
});

// Instance method: Get active add-ons
AddOnSchema.methods.getActiveAddOns = function () {
  return this.addOns.filter((addon) => addon.isActive);
};

// Instance method: Get add-on count by type
AddOnSchema.methods.getAddOnCountByType = function (type) {
  return this.addOns
    .filter((addon) => addon.type === type && addon.isActive)
    .reduce((total, addon) => total + addon.quantity, 0);
};

// Static method: Get user's add-ons
AddOnSchema.statics.getUserAddOns = async function (userId) {
  return this.findOne({ userId });
};

// Static method: Add an add-on
AddOnSchema.statics.addAddOn = async function (
  userId,
  plan,
  addOnType,
  quantity,
  cost,
  stripePaymentIntentId
) {
  let addOnDoc = await this.findOne({ userId });

  if (!addOnDoc) {
    addOnDoc = new this({
      userId,
      plan,
      addOns: []
    });
  }

  addOnDoc.addOns.push({
    type: addOnType,
    quantity,
    cost,
    purchasedAt: new Date(),
    isActive: true,
    stripePaymentIntentId
  });

  await addOnDoc.save();
  return addOnDoc;
};

// Static method: Deactivate an add-on
AddOnSchema.statics.deactivateAddOn = async function (userId, addOnId) {
  const addOnDoc = await this.findOne({ userId });
  if (!addOnDoc) return null;

  const addon = addOnDoc.addOns.id(addOnId);
  if (addon) {
    addon.isActive = false;
    await addOnDoc.save();
  }

  return addOnDoc;
};

export default mongoose.model("AddOn", AddOnSchema);
