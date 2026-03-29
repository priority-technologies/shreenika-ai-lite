'use strict';
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const User     = require('./user.model.js');
const sendMail = require('../../utils/mailer.js').sendMail;


/* =========================
   REGISTER (EMAIL + PASSWORD)
========================= */
const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      name: name || email.split('@')[0],
      password: hashedPassword,
      role: 'user',
      emailVerified: true,
      isActive: true
    });

    // Generate JWT token so user can log in immediately
    const token = jwt.sign(
      { id: user._id.toString(), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: true
      }
    });
  } catch (err) {
    console.error('REGISTER ERROR:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* =========================
   VERIFY EMAIL
========================= */
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({ emailVerificationToken: token });
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();

    return res.json({ message: 'Email verified successfully' });
  } catch (err) {
    console.error('VERIFY EMAIL ERROR:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* =========================
   LOGIN
========================= */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !user.password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ message: 'Email not verified' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id.toString(), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      user: {
        id: user._id.toString(),
        name: user.name || user.email.split('@')[0],
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified
      }
    });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* =========================
   FORGOT PASSWORD
========================= */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal whether email exists
      return res.json({ message: 'If account exists, reset link sent' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken   = hashedToken;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    await sendMail({
      to: user.email,
      subject: 'Reset your Shreenika AI password',
      html: `
        <p>You requested a password reset.</p>
        <p><a href="${resetUrl}">Reset Password</a></p>
        <p>This link expires in 15 minutes.</p>
      `
    });

    return res.json({ message: 'Reset link sent' });
  } catch (err) {
    console.error('FORGOT PASSWORD ERROR:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* =========================
   RESET PASSWORD
========================= */
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken:   hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    user.password             = await bcrypt.hash(password, 10);
    user.resetPasswordToken   = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error('RESET PASSWORD ERROR:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* =========================
   GET CURRENT USER (ME)
========================= */
const getMe = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const user = await User.findById(req.user.id)
      .select('-password -emailVerificationToken -resetPasswordToken -resetPasswordExpires');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({
      user: {
        id: user._id.toString(),
        name: user.name || user.email.split('@')[0],
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified
      }
    });
  } catch (err) {
    console.error('GET ME ERROR:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* =========================
   MARK USER AS ONBOARDED
========================= */
const markOnboarded = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { hasOnboarded: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({
      message: 'User marked as onboarded',
      hasOnboarded: user.hasOnboarded
    });
  } catch (err) {
    console.error('MARK ONBOARDED ERROR:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* =========================
   PROMOTE USER TO ADMIN
========================= */
const promoteToAdmin = async (req, res) => {
  try {
    const { email, adminKey } = req.body;

    const expectedKey = process.env.ADMIN_PROMOTION_KEY || 'shreenika-admin-key-2026';

    if (adminKey !== expectedKey) {
      return res.status(403).json({ message: 'Invalid admin key' });
    }

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOneAndUpdate(
      { email },
      { role: 'admin' },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '48h' }
    );

    console.log(`✅ User ${email} promoted to admin role`);

    return res.json({
      message: `User ${email} promoted to admin`,
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
      token
    });
  } catch (err) {
    console.error('PROMOTE TO ADMIN ERROR:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* =========================
   UPDATE PROFILE (name + optional password)
========================= */
const updateProfile = async (req, res) => {
  try {
    const { name, avatar, currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Update name if provided
    if (name && name.trim()) {
      user.name = name.trim();
    }

    // Update avatar (base64 image) if provided
    if (avatar && typeof avatar === 'string' && avatar.startsWith('data:image')) {
      // Enforce 2MB limit on base64 string (base64 is ~33% larger than binary)
      if (avatar.length > 2.8 * 1024 * 1024) {
        return res.status(400).json({ message: 'Image too large. Max 2MB allowed.' });
      }
      user.avatar = avatar;
    }

    // Change password only if both fields provided
    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: 'New password must be at least 6 characters' });
      }
      user.password = await bcrypt.hash(newPassword, 10);
    }

    await user.save();

    return res.json({
      message: 'Profile updated successfully',
      user: {
        id:     user._id.toString(),
        name:   user.name,
        email:  user.email,
        role:   user.role,
        avatar: user.avatar || null,
      }
    });
  } catch (err) {
    console.error('UPDATE PROFILE ERROR:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  register,
  login,
  verifyEmail,
  forgotPassword,
  resetPassword,
  getMe,
  markOnboarded,
  promoteToAdmin,
  updateProfile,
};
