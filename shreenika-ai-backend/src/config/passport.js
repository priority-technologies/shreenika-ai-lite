import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

export function initPassport() {
  try {
    if (
      !process.env.GOOGLE_CLIENT_ID ||
      !process.env.GOOGLE_CLIENT_SECRET
    ) {
      console.warn("⚠️ Google OAuth not configured. Skipping Google strategy.");
      return;
    }

    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: "/auth/google/callback",
        },
        async (accessToken, refreshToken, profile, done) => {
          return done(null, profile);
        }
      )
    );

    console.log("✅ Google Passport strategy initialized");
  } catch (err) {
    console.error("❌ Passport init failed:", err.message);
  }
}
