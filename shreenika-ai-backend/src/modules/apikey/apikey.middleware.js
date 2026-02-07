import crypto from "crypto";
import ApiKey from "./apikey.model.js";
import User from "../auth/user.model.js";

/**
 * Middleware: authenticate requests via x-api-key header.
 * Sets req.user just like JWT auth so downstream controllers work unchanged.
 */
export const requireApiKey = async (req, res, next) => {
  try {
    const rawKey = req.headers["x-api-key"];

    if (!rawKey) {
      return res.status(401).json({
        error: "Missing API key. Include x-api-key header.",
      });
    }

    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const apiKey = await ApiKey.findOne({ keyHash, isActive: true });
    if (!apiKey) {
      return res.status(401).json({ error: "Invalid or revoked API key." });
    }

    const user = await User.findById(apiKey.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Account not found or suspended." });
    }

    // Update last used timestamp (non-blocking)
    ApiKey.updateOne({ _id: apiKey._id }, { lastUsedAt: new Date() }).catch(() => {});

    // Set req.user for downstream controllers (same shape as JWT auth)
    req.user = user;
    next();
  } catch (err) {
    console.error("API key auth error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
};
