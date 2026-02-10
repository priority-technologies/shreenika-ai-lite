import jwt from "jsonwebtoken";
import User from "./user.model.js";

/* =========================
   GOOGLE AUTH CALLBACK
========================= */
export const googleAuthCallback = async (req, res) => {
  try {
    const googleUser = req.user;

    const email = googleUser?.emails?.[0]?.value;
    if (!email) {
      throw new Error("Google account email not available");
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        email,
        role: "user",
        emailVerified: true,
        isActive: true,
        provider: "google"
      });
    }

    const token = jwt.sign(
      { id: user._id.toString(), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const redirectUrl = `${process.env.FRONTEND_URL}/auth-success?token=${token}`;
    return res.redirect(redirectUrl);

  } catch (err) {
    console.error("GOOGLE AUTH ERROR:", err);
    return res.redirect(
      `${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(err?.message || "auth_failed")}`
    );
  }
};
