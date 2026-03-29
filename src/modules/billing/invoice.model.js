'use strict';
const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // Billing period
  month: { type: String, required: true }, // e.g. "2026-03"
  periodStart: { type: Date, required: true },
  periodEnd:   { type: Date, required: true },

  // Line items
  lineItems: [{
    description: { type: String },
    quantity:    { type: Number, default: 1 },
    unitPrice:   { type: Number, default: 0 }, // INR
    total:       { type: Number, default: 0 }, // INR
    type: {
      type: String,
      enum: ['subscription', 'setup_fee', 'recharge', 'addon_docs', 'addon_agent', 'addon_minutes'],
    },
  }],

  // Totals (INR)
  subtotal:     { type: Number, default: 0 },
  gst:          { type: Number, default: 0 }, // 18% GST
  total:        { type: Number, default: 0 },

  // Usage breakdown (for graph)
  usageBreakdown: {
    geminiMinutes: { type: Number, default: 0 },
    cacheMinutes:  { type: Number, default: 0 },
    totalMinutes:  { type: Number, default: 0 },
  },

  // Payment
  status: {
    type: String,
    enum: ['draft', 'paid', 'failed', 'void'],
    default: 'draft',
  },
  stripeInvoiceId:       { type: String, default: null },
  stripePaymentIntentId: { type: String, default: null },
  paidAt: { type: Date, default: null },

  // Plan snapshot at time of invoice
  plan:         { type: String },
  billingCycle: { type: String },

}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
