import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "./user.model.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback"
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error("Google account has no email"));
        }

        let user = await User.findOne({ email });

        if (!user) {
          user = await User.create({
            email,
            name: profile.displayName || "Google User",
            password: "GOOGLE_AUTH",
            role: "user",
            emailVerified: true,
            lastLogin: new Date()
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

export default passport;
