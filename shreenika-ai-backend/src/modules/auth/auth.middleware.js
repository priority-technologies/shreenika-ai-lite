import jwt from "jsonwebtoken";
import User from "./user.model.js";

/* =========================
   REQUIRE AUTH (JWT)
========================= */
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

/* =========================
   REQUIRE VERIFIED EMAIL
========================= */
export const requireVerifiedEmail = (req, res, next) => {
  if (!req.user || req.user.emailVerified !== true) {
    return res
      .status(403)
      .json({ error: "Email verification required" });
  }
  next();
};
