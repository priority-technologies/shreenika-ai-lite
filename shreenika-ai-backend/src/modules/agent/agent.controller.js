import Agent from "./agent.model.js";

// Helper: Flatten nested agent schema to flat frontend format
const flattenAgent = (agent) => ({
  id: agent._id,
  _id: agent._id,
  isActive: agent.isActive !== false,
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
  const map = { "Office": "office", "Quiet": "quiet", "Cafe": "cafe", "Street": "street", "Call Center": "call-center", "None": "office", "minimal": "quiet", "none": "office" };
  return map[val] || (val ? val.toLowerCase() : "office");
};

// Map responsiveness string values to 0-1 numeric range
const mapResponsiveness = (val) => {
  if (typeof val === 'number') return Math.min(Math.max(val, 0), 1); // Clamp to 0-1
  const map = { "slow": 0.25, "thoughtful": 0.25, "balanced": 0.5, "quick": 0.75, "fast": 0.9 };
  return map[val] !== undefined ? map[val] : 0.5; // Default to balanced
};

// Map interruptionSensitivity string values to 0-1 numeric range
const mapInterruptionSensitivity = (val) => {
  if (typeof val === 'number') return Math.min(Math.max(val, 0), 1); // Clamp to 0-1
  return typeof val === 'string' ? 0.5 : val; // If string, treat as default; otherwise use numeric
};

// Defensive language code mapping (handles legacy display-name values and new code values)
const mapLanguageToCode = (val) => {
  const map = {
    'English (US)': 'en-US',
    'English (UK)': 'en-GB',
    'English (India)': 'en-IN',
    'Hindi (India)': 'hi-IN',
    'Hinglish': 'hinglish',
    'Spanish': 'es-US',
    'French': 'fr-FR'
  };
  return map[val] || val; // If already a code, return as-is
};

// Restructure flat frontend payload into nested backend schema
// Handles both Agent format (name, title, prompt) and SmartAgent format (agentName, agentRole, systemPrompt)
const restructurePayload = (b) => {
  const data = {};

  // Flat fields - Handle BOTH Agent format AND SmartAgent format
  // Agent format: name, title, prompt, welcomeMessage
  // SmartAgent format: agentName, agentRole, systemPrompt
  if (b.name !== undefined) data.name = b.name;
  if (b.agentName !== undefined) data.name = b.agentName; // SmartAgent → Agent mapping

  if (b.title !== undefined) data.title = b.title;
  if (b.agentRole !== undefined) data.title = b.agentRole; // SmartAgent → Agent mapping

  if (b.avatar !== undefined) data.avatar = b.avatar;
  if (b.prompt !== undefined) data.prompt = b.prompt;
  if (b.systemPrompt !== undefined) data.prompt = b.systemPrompt; // SmartAgent → Agent mapping

  if (b.welcomeMessage !== undefined) data.welcomeMessage = b.welcomeMessage;
  if (b.characteristics !== undefined) data.characteristics = b.characteristics;
  if (b.knowledgeBase !== undefined) data.knowledgeBase = b.knowledgeBase;

  // Voice Profile (nested)
  // Handle both: voiceId/language (Agent) and voiceCharacteristics/primaryLanguage (SmartAgent)
  let hasVoiceProfile = false;
  let voiceIdToUse = b.voiceId;
  let languageToUse = b.language || b.primaryLanguage; // SmartAgent uses primaryLanguage

  // SmartAgent voiceCharacteristics object (ignore for voiceProfile, it's handled in speechSettings)
  if (b.voiceCharacteristics) {
    // voiceCharacteristics is more complex in SmartAgent, but voiceProfile is simpler in Agent
    // For now, we just use the basic voiceId
  }

  if (voiceIdToUse !== undefined || languageToUse !== undefined) {
    data.voiceProfile = {};
    if (voiceIdToUse !== undefined) data.voiceProfile.voiceId = voiceIdToUse;
    if (languageToUse !== undefined) data.voiceProfile.language = mapLanguageToCode(languageToUse);
  }

  // Speech Settings (nested, with field name mapping)
  // Handle both formats: voiceSpeed, emotionLevel (agent) and voiceCharacteristics.emotionLevel (smart)
  const hasSmartVoiceChars = b.voiceCharacteristics && typeof b.voiceCharacteristics === 'object';
  const hasSmartSpeechSettings = b.speechSettings && typeof b.speechSettings === 'object';

  if (b.voiceSpeed !== undefined || b.interruptionSensitivity !== undefined ||
      b.responsiveness !== undefined || b.emotionLevel !== undefined ||
      b.backgroundNoise !== undefined ||
      hasSmartVoiceChars || hasSmartSpeechSettings) {
    data.speechSettings = {};

    // Agent format fields
    if (b.voiceSpeed !== undefined) data.speechSettings.voiceSpeed = b.voiceSpeed;
    if (b.interruptionSensitivity !== undefined) data.speechSettings.interruptionSensitivity = mapInterruptionSensitivity(b.interruptionSensitivity);
    if (b.responsiveness !== undefined) data.speechSettings.responsiveness = mapResponsiveness(b.responsiveness);
    if (b.emotionLevel !== undefined) data.speechSettings.emotions = b.emotionLevel;
    if (b.backgroundNoise !== undefined) data.speechSettings.backgroundNoise = mapBackgroundNoise(b.backgroundNoise);

    // SmartAgent format fields (from voiceCharacteristics)
    if (hasSmartVoiceChars) {
      if (b.voiceCharacteristics.emotionLevel !== undefined) {
        data.speechSettings.emotions = b.voiceCharacteristics.emotionLevel;
      }
    }

    // SmartAgent format fields (from speechSettings)
    if (hasSmartSpeechSettings) {
      if (b.speechSettings.voiceSpeed !== undefined) data.speechSettings.voiceSpeed = b.speechSettings.voiceSpeed;
      if (b.speechSettings.interruptionSensitivity !== undefined) data.speechSettings.interruptionSensitivity = mapInterruptionSensitivity(b.speechSettings.interruptionSensitivity);
      if (b.speechSettings.responsiveness !== undefined) data.speechSettings.responsiveness = mapResponsiveness(b.speechSettings.responsiveness);
      if (b.speechSettings.backgroundNoise !== undefined) data.speechSettings.backgroundNoise = mapBackgroundNoise(b.speechSettings.backgroundNoise);
    }
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
    console.log("🔄 CREATE AGENT: Starting...");
    console.log("   User ID:", req.user?._id);
    console.log("   Received data keys:", Object.keys(req.body));

    // Accept both Agent format (name, prompt) and SmartAgent format (agentName, systemPrompt)
    const name = req.body.name || req.body.agentName;
    const prompt = req.body.prompt || req.body.systemPrompt;

    if (!name || !prompt) {
      return res.status(400).json({ error: "name/agentName and prompt/systemPrompt are required" });
    }

    console.log("   ✅ Validation passed");

    const structured = restructurePayload(req.body);
    structured.userId = req.user._id;

    console.log("   ✅ Payload restructured");
    console.log("   Structured data keys:", Object.keys(structured));

    const agent = await Agent.create(structured);
    console.log("   ✅ Agent created in database:", agent._id);

    res.status(201).json(flattenAgent(agent));
  } catch (err) {
    console.error("❌ CREATE AGENT ERROR:", err.message);
    console.error("   Stack:", err.stack);
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
    console.log("🔄 UPDATE AGENT: Starting...");
    console.log("   Agent ID:", req.params.id);
    console.log("   User ID:", req.user._id);
    console.log("   Received data keys:", Object.keys(req.body));

    const updateData = restructurePayload(req.body);
    console.log("   ✅ Payload restructured");
    console.log("   Update data keys:", Object.keys(updateData));

    const agent = await Agent.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      updateData,
      { new: true, runValidators: true }
    );

    if (!agent) {
      console.error("❌ Agent not found for update");
      return res.status(404).json({ error: "Agent not found" });
    }

    console.log("   ✅ Agent updated successfully:", agent._id);
    res.json(flattenAgent(agent));
  } catch (err) {
    console.error("❌ UPDATE AGENT ERROR:", err.message);
    console.error("   Stack:", err.stack);
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
