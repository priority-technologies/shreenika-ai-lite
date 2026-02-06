import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: false, // Google users won’t have password
    },

    googleId: {
      type: String,
      required: false,
    },

    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'admin',
    },

    plan: {
      type: String,
      enum: ['Starter', 'Pro', 'Enterprise'],
      default: 'Starter',
    },

    accountId: {
      type: String,
      required: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },

    emailVerificationToken: {
      type: String,
    },

    emailVerificationExpires: {
      type: Date,
    },

    resetPasswordToken: {
      type: String,
    },

    resetPasswordExpires: {
      type: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.model('User', UserSchema);
