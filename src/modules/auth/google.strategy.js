'use strict';
const passport       = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User           = require('./user.model.js');

passport.use(
  new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback'
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] && profile.emails[0].value;
        if (!email) {
          return done(new Error('Google account has no email'));
        }

        let user = await User.findOne({ email });

        if (!user) {
          user = await User.create({
            email,
            name:          profile.displayName || 'Google User',
            password:      'GOOGLE_AUTH',
            provider:      'google',
            role:          'user',
            emailVerified: true,
            isActive:      true,
            lastLogin:     new Date()
          });
        } else {
          user.lastLogin = new Date();
          await user.save();
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

module.exports = passport;
