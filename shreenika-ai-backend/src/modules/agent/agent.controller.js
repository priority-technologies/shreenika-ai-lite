import Agent from "./agent.model.js";

// Helper: Flatten nested agent schema to flat frontend format
const flattenAgent = (agent) => ({
  id: agent._id,
  _id: agent._id,
  name: agent.name,
  title: agent.title,
  avatar: agent.avatar,
  prompt: agent.prompt,
  welcomeMessage: agent.welcomeMessage,
  characteristics: agent.characteristics || [],
  knowledgeBase: agent.knowledgeBase || [],
  language: agent.voiceProfile?.language || "English",
  voiceId: agent.voiceProfile?.voiceId || "voice_1",
  voiceSpeed: agent.speechSettings?.voiceSpeed ?? 1.0,
  interruptionSensitivity: agent.speechSettings?.interruptionSensitivity ?? 0.5,
  responsiveness: agent.speechSettings?.responsiveness ?? 0.5,
  emotionLevel: agent.speechSettings?.emotions ?? 0.5,
  backgroundNoise: agent.speechSettings?.backgroundNoise || "office",
  maxCallDuration: agent.callSettings?.maxCallDuration ?? 300,
  silenceDetectionMs: agent.callSettings?.silenceDetectionMs ?? 30,
  voicemailDetection: agent.callSettings?.voicemailDetection ?? false,
  voicemailAction: agent.callSettings?.voicemailAction || "hang-up",
  voicemailMessage: agent.callSettings?.voicemailMessage || "",
  createdAt: agent.createdAt,
  updatedAt: agent.updatedAt,
});

// Map frontend enum values to backend enum values
const mapVoicemailAction = (val) => {
  const map = { "Hang up": "hang-up", "Leave a voicemail": "leave-message" };
  return map[val] || val;
};

const mapBackgroundNoise = (val) => {
  const map = { "Office": "office", "Quiet": "quiet", "Cafe": "cafe", "Street": "street", "Call Center": "call-center", "None": "office" };
  return map[val] || (val ? val.toLowerCase() : "office");
};

// Restructure flat frontend payload into nested backend schema
const restructurePayload = (b) => {
  const data = {};

  // Flat fields
  if (b.name !== undefined) data.name = b.name;
  if (b.title !== undefined) data.title = b.title;
  if (b.avatar !== undefined) data.avatar = b.avatar;
  if (b.prompt !== undefined) data.prompt = b.prompt;
  if (b.welcomeMessage !== undefined) data.welcomeMessage = b.welcomeMessage;
  if (b.characteristics !== undefined) data.characteristics = b.characteristics;
  if (b.knowledgeBase !== undefined) data.knowledgeBase = b.knowledgeBase;

  // Voice Profile (nested)
  if (b.voiceId !== undefined || b.language !== undefined) {
    data.voiceProfile = {};
    if (b.voiceId !== undefined) data.voiceProfile.voiceId = b.voiceId;
    if (b.language !== undefined) data.voiceProfile.language = b.language;
  }

  // Speech Settings (nested, with field name mapping)
  if (b.voiceSpeed !== undefined || b.interruptionSensitivity !== undefined ||
      b.responsiveness !== undefined || b.emotionLevel !== undefined ||
      b.backgroundNoise !== undefined) {
    data.speechSettings = {};
    if (b.voiceSpeed !== undefined) data.speechSettings.voiceSpeed = b.voiceSpeed;
    if (b.interruptionSensitivity !== undefined) data.speechSettings.interruptionSensitivity = b.interruptionSensitivity;
    if (b.responsiveness !== undefined) data.speechSettings.responsiveness = b.responsiveness;
    if (b.emotionLevel !== undefined) data.speechSettings.emotions = b.emotionLevel;
    if (b.backgroundNoise !== undefined) data.speechSettings.backgroundNoise = mapBackgroundNoise(b.backgroundNoise);
  }

  // Call Settings (nested, with enum mapping)
  if (b.maxCallDuration !== undefined || b.silenceDetectionMs !== undefined ||
      b.voicemailDetection !== undefined || b.voicemailAction !== undefined ||
      b.voicemailMessage !== undefined) {
    data.callSettings = {};
    if (b.maxCallDuration !== undefined) data.callSettings.maxCallDuration = b.maxCallDuration;
    if (b.silenceDetectionMs !== undefined) data.callSettings.silenceDetectionMs = b.silenceDetectionMs;
    if (b.voicemailDetection !== undefined) data.callSettings.voicemailDetection = b.voicemailDetection;
    if (b.voicemailAction !== undefined) data.callSettings.voicemailAction = mapVoicemailAction(b.voicemailAction);
    if (b.voicemailMessage !== undefined) data.callSettings.voicemailMessage = b.voicemailMessage;
  }

  return data;
};

/* =========================
   CREATE AGENT
========================= */
export const createAgent = async (req, res) => {
  try {
    if (!req.body.name || !req.body.prompt) {
      return res.status(400).json({ error: "name and prompt are required" });
    }

    const structured = restructurePayload(req.body);
    structured.userId = req.user._id;

    const agent = await Agent.create(structured);
    res.status(201).json(flattenAgent(agent));
  } catch (err) {
    console.error("CREATE AGENT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   ACTIVATE AGENT (ADDED)
========================= */
export const activateAgent = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    agent.isActive = true;
    await agent.save();

    res.json({ success: true, message: "Agent activated successfully", agent: flattenAgent(agent) });
  } catch (err) {
    console.error("ACTIVATE AGENT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   GET ALL AGENTS
========================= */
export const getAgents = async (req, res) => {
  try {
    const agents = await Agent.find({ userId: req.user._id });
    res.json(agents.map(flattenAgent));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   GET AGENT BY ID
========================= */
export const getAgentById = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    res.json(flattenAgent(agent));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   UPDATE AGENT
========================= */
export const updateAgent = async (req, res) => {
  try {
    const updateData = restructurePayload(req.body);

    const agent = await Agent.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      updateData,
      { new: true }
    );

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    res.json(flattenAgent(agent));
  } catch (err) {
    console.error("UPDATE AGENT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   DELETE AGENT
========================= */
export const deleteAgent = async (req, res) => {
  try {
    await Agent.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
