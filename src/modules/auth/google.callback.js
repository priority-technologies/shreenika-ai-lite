'use strict';
const jwt  = require('jsonwebtoken');
const User = require('./user.model.js');

const googleCallback = async (req, res) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  try {
    const user = req.user;

    // Fetch the latest user data from DB to get hasOnboarded status + correct role
    const dbUser = await User.findById(user._id);
    if (!dbUser) {
      return res.redirect(`${FRONTEND_URL}/login?error=user_not_found`);
    }

    console.log(`✅ Google OAuth Login: ${dbUser.email} (role: ${dbUser.role})`);

    const token = jwt.sign(
      { id: dbUser._id.toString(), role: dbUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '48h' }
    );

    // Redirect to frontend root with token + firstLogin flag
    res.redirect(`${FRONTEND_URL}/?token=${token}&firstLogin=${!dbUser.hasOnboarded}`);
  } catch (err) {
    console.error('Google callback error:', err);
    res.redirect(`${FRONTEND_URL}/login?error=google`);
  }
};

module.exports = { googleCallback };
