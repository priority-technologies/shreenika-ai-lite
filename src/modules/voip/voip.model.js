'use strict';
const mongoose  = require('mongoose');
const { encrypt, decrypt } = require('../../utils/encryption.js');

// ─────────────────────────────────────────────
// VoipProvider Schema
// Stores one VOIP provider record per user.
// Credential fields are AES-256 encrypted at rest.
// ─────────────────────────────────────────────
const voipProviderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    provider: {
      type: String,
      required: true,
      enum: ['Twilio', 'SansPBX', 'BlandAI', 'Vapi', 'Vonage', 'Other'],
    },

    // All credential fields — encrypted before save, decrypted on demand
    credentials: {
      // ── Twilio ──
      accountSid:    { type: String, default: null },
      authToken:     { type: String, default: null },

      // ── Generic / BlandAI / Vapi / Vonage ──
      apiKey:        { type: String, default: null },
      secretKey:     { type: String, default: null },
      endpointUrl:   { type: String, default: null },
      httpMethod:    { type: String, default: null },
      headers:       { type: mongoose.Schema.Types.Mixed, default: null },
      region:        { type: String, default: null },

      // ── SansPBX ──
      tokenEndpoint: { type: String, default: null },
      dialEndpoint:  { type: String, default: null },
      accessToken:   { type: String, default: null },
      accessKey:     { type: String, default: null },
      appId:         { type: String, default: null },
      username:      { type: String, default: null },
      password:      { type: String, default: null },
    },

    customScript:  { type: String, default: null },
    isActive:      { type: Boolean, default: true },
    isVerified:    { type: Boolean, default: false },
    lastSyncedAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Encrypt sensitive credential strings before saving ──
const CRED_FIELDS = [
  'accountSid', 'authToken', 'apiKey', 'secretKey',
  'tokenEndpoint', 'dialEndpoint', 'accessToken', 'accessKey',
  'appId', 'username', 'password',
];

voipProviderSchema.pre('save', function (next) {
  if (this.isModified('credentials')) {
    for (const field of CRED_FIELDS) {
      const val = this.credentials[field];
      if (val && typeof val === 'string' && !val.includes(':')) {
        // Only encrypt if it doesn't look like it's already encrypted
        // (encrypted values contain a hex IV followed by ':')
        try {
          this.credentials[field] = encrypt(val);
        } catch (_) {
          // If encrypt fails for any reason, leave as-is
        }
      }
    }
  }
  next();
});

/**
 * Returns a plain object with all credential fields decrypted.
 * Use this whenever you need to pass credentials to a third-party SDK.
 */
voipProviderSchema.methods.getDecryptedCredentials = function () {
  const creds = {};
  for (const field of CRED_FIELDS) {
    const val = this.credentials[field];
    try {
      creds[field] = val ? decrypt(val) : null;
    } catch (_) {
      creds[field] = val; // Return as-is if decryption fails
    }
  }
  // Pass through non-encrypted fields
  creds.endpointUrl = this.credentials.endpointUrl || null;
  creds.httpMethod  = this.credentials.httpMethod  || null;
  creds.headers     = this.credentials.headers     || null;
  creds.region      = this.credentials.region      || null;
  return creds;
};

// ─────────────────────────────────────────────
// VoipNumber Schema
// One record per phone number / DID.
// ─────────────────────────────────────────────
const voipNumberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VoipProvider',
      required: true,
    },

    phoneNumber: {
      type: String,
      required: true,
      // NOTE: Uniqueness is scoped per-user via compound index below,
      // not globally — same DID could theoretically appear for different users.
    },

    friendlyName:  { type: String, default: '' },
    region:        { type: String, default: 'Unknown' },
    country:       { type: String, default: 'US' },

    capabilities: {
      voice: { type: Boolean, default: true },
      sms:   { type: Boolean, default: false },
      mms:   { type: Boolean, default: false },
    },

    assignedAgentId: {
      type: String,   // Agent string ID like 'agent-default-001'
      default: null,
    },

    monthlyCost: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['active', 'released', 'pending'],
      default: 'active',
    },

    source: {
      type: String,
      enum: ['purchased', 'imported'],
      default: 'imported',
    },

    providerData: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Compound unique index: one entry per (user + phoneNumber)
voipNumberSchema.index({ userId: 1, phoneNumber: 1 }, { unique: true });

const VoipProvider = mongoose.model('VoipProvider', voipProviderSchema);
const VoipNumber   = mongoose.model('VoipNumber',   voipNumberSchema);

module.exports = { VoipProvider, VoipNumber };
