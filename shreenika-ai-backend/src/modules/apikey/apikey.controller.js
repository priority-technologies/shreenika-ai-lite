import crypto from "crypto";
import ApiKey from "./apikey.model.js";

/**
 * Generate a new API key for the authenticated user.
 * Returns the raw key ONCE — it is never stored in plain text.
 */
export const generateApiKey = async (req, res) => {
  try {
    const { name } = req.body;

    // Limit: max 3 active keys per user
    const activeCount = await ApiKey.countDocuments({
      userId: req.user.id,
      isActive: true,
    });
    if (activeCount >= 3) {
      return res
        .status(400)
        .json({ error: "Maximum 3 active API keys allowed. Revoke one first." });
    }

    // Generate a secure random key
    const rawKey = `sk_live_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const prefix = rawKey.slice(0, 12);

    await ApiKey.create({
      userId: req.user.id,
      name: name || "Default API Key",
      keyHash,
      prefix,
    });

    // Return the raw key — user must copy it now
    res.status(201).json({
      key: rawKey,
      prefix,
      name: name || "Default API Key",
      message: "Copy this key now. It will not be shown again.",
    });
  } catch (err) {
    console.error("Generate API key error:", err);
    res.status(500).json({ error: "Failed to generate API key" });
  }
};

/**
 * List all API keys for the authenticated user (masked).
 */
export const listApiKeys = async (req, res) => {
  try {
    const keys = await ApiKey.find({ userId: req.user.id })
      .select("name prefix isActive lastUsedAt createdAt")
      .sort({ createdAt: -1 });

    res.json(keys);
  } catch (err) {
    console.error("List API keys error:", err);
    res.status(500).json({ error: "Failed to list API keys" });
  }
};

/**
 * Revoke (deactivate) an API key.
 */
export const revokeApiKey = async (req, res) => {
  try {
    const { id } = req.params;

    const key = await ApiKey.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { isActive: false },
      { new: true }
    );

    if (!key) {
      return res.status(404).json({ error: "API key not found" });
    }

    res.json({ message: "API key revoked", id: key._id });
  } catch (err) {
    console.error("Revoke API key error:", err);
    res.status(500).json({ error: "Failed to revoke API key" });
  }
};
