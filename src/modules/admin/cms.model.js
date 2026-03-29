'use strict';
const mongoose = require('mongoose');

const cmsContentSchema = new mongoose.Schema({
  page:      { type: String, required: true, unique: true }, // e.g. 'privacy', 'faqs', 'affiliate'
  title:     { type: String, default: '' },
  content:   { type: String, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('CmsContent', cmsContentSchema);
