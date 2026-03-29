'use strict';
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true
    },

    phone: {
      type: String,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String
    },

    role: {
      type: String,
      default: 'user'
    },

    avatar: {
      type: String,
      default: null,
    },

    provider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local'
    },

    emailVerified: {
      type: Boolean,
      default: false
    },

    emailVerificationToken: {
      type: String
    },

    resetPasswordToken: {
      type: String
    },

    resetPasswordExpires: {
      type: Date
    },

    isActive: {
      type: Boolean,
      default: true
    },

    hasOnboarded: {
      type: Boolean,
      default: false
    },

    apiKey: {
      type: String,
      default: null,
      index: true,
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
