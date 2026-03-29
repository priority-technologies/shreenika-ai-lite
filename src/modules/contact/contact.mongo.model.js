'use strict';
/**
 * Contact MongoDB Model — CommonJS
 * Stores lead/contact data with nested company object.
 * contactId (string) is the canonical ID used by all API routes.
 */

const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema(
  {
    contactId: { type: String, required: true, unique: true, index: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },  // owner scoping

    // Personal info
    firstName:  { type: String, default: '' },
    lastName:   { type: String, default: '' },
    email:      { type: String, default: '' },
    phone:      { type: String, default: '' },
    address:    { type: String, default: '' },

    // Company (nested — matches what frontend sends)
    company: {
      name:      { type: String, default: '' },
      employees: { type: Number },
      website:   { type: String, default: '' },
    },

    // Lead metadata
    jobTitle:  { type: String, default: '' },
    industry:  { type: String, default: '' },
    source:    { type: String, default: 'manual' },   // manual | csv | excel
    status:    { type: String, default: 'New' },       // New | Contacted | Qualified | Closed
    leadScore: { type: Number, default: 0, min: 0, max: 100 },
    tags:      { type: [String], default: [] },
    notes:     { type: String, default: '' },

    lastContactedAt: { type: String, default: null },
  },
  {
    timestamps: true,   // createdAt / updatedAt auto-managed
    strict: false,      // allow extra fields without rejection
  }
);

module.exports = mongoose.model('Contact', ContactSchema);
