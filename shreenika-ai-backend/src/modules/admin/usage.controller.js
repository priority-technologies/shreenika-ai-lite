import Usage from "../usage/usage.model.js";

export const resetUsage = async (req, res) => {
  const { userId, month } = req.body;

  await Usage.findOneAndUpdate(
    { userId, month },
    {
      voiceMinutesUsed: 0,
      llmTokensUsed: 0,
      hardStopped: false
    },
    { upsert: true }
  );

  res.json({ success: true });
};

export const unlockUsage = async (req, res) => {
  const { userId, month } = req.body;

  await Usage.findOneAndUpdate(
    { userId, month },
    { hardStopped: false }
  );

  res.json({ success: true });
};
