import Agent from "./agent.model.js";

/* ==========================
   VALIDATION (SECURITY FIX)
========================== */
const validateAgentConfig = (data) => {
  const errors = [];

  // 🔍 DEBUG: Log what we're validating
  console.log('🔍 [validateAgentConfig] Received data:', {
    maxCallDuration: data.maxCallDuration,
    maxCallDurationType: typeof data.maxCallDuration,
    silenceDetectionMs: data.silenceDetectionMs,
    silenceDetectionMsType: typeof data.silenceDetectionMs,
    voiceSpeed: data.voiceSpeed,
    voiceSpeedType: typeof data.voiceSpeed,
    systemPromptLength: data.systemPrompt?.length,
    allKeys: Object.keys(data)
  });

  // Convert string numbers to actual numbers (frontend sends as strings from form inputs)
  const maxCallDuration = data.maxCallDuration !== undefined ? (typeof data.maxCallDuration === 'string' ? parseFloat(data.maxCallDuration) : data.maxCallDuration) : undefined;
  const silenceDetectionMs = data.silenceDetectionMs !== undefined ? (typeof data.silenceDetectionMs === 'string' ? parseFloat(data.silenceDetectionMs) : data.silenceDetectionMs) : undefined;
  const voiceSpeed = data.voiceSpeed !== undefined ? (typeof data.voiceSpeed === 'string' ? parseFloat(data.voiceSpeed) : data.voiceSpeed) : undefined;

  console.log('🔍 [validateAgentConfig] After conversion:', {
    maxCallDuration,
    silenceDetectionMs,
    voiceSpeed
  });

  // Validate call duration (min 60s, max 3600s = 1 hour)
  if (maxCallDuration !== undefined) {
    if (isNaN(maxCallDuration)) {
      errors.push('maxCallDuration must be a valid number');
    } else if (maxCallDuration < 60 || maxCallDuration > 3600) {
      errors.push(`maxCallDuration ${maxCallDuration} is outside valid range (60-3600 seconds)`);
    }
  }

  // Validate silence detection timeout (min 5s, max 60s)
  if (silenceDetectionMs !== undefined) {
    if (isNaN(silenceDetectionMs)) {
      errors.push('silenceDetectionMs must be a valid number');
    } else if (silenceDetectionMs < 5000 || silenceDetectionMs > 60000) {
      errors.push(`silenceDetectionMs ${silenceDetectionMs} is outside valid range (5000-60000 ms)`);
    }
  }

  // Validate voice speed (0.75x - 1.25x)
  if (voiceSpeed !== undefined) {
    if (isNaN(voiceSpeed)) {
      errors.push('voiceSpeed must be a valid number');
    } else if (voiceSpeed < 0.75 || voiceSpeed > 1.25) {
      errors.push(`voiceSpeed ${voiceSpeed} is outside valid range (0.75-1.25)`);
    }
  }

  // Validate system prompt length (max 10000 chars)
  if (data.systemPrompt && typeof data.systemPrompt === 'string') {
    if (data.systemPrompt.length > 10000) {
      errors.push(`System prompt length ${data.systemPrompt.length} exceeds max 10000 characters`);
    }
  }

  if (errors.length > 0) {
    console.error('❌ [validateAgentConfig] VALIDATION FAILED:', errors);
    console.error('🔍 [validateAgentConfig] Values that failed:', {
      maxCallDuration,
      silenceDetectionMs,
      voiceSpeed,
      systemPromptLength: data.systemPrompt?.length
    });
  } else {
    console.log('✅ [validateAgentConfig] All validations passed');
  }
  return { valid: errors.length === 0, errors };
};

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
  voiceSpeed: (() => {
    const val = agent.speechSettings?.voiceSpeed ?? 1.0;
    return Math.min(Math.max(val, 0.75), 1.25); // Clamp to valid range 0.75-1.25
  })(),
  interruptionSensitivity: agent.speechSettings?.interruptionSensitivity ?? 0.5,
  responsiveness: agent.speechSettings?.responsiveness ?? 0.5,
  emotionLevel: agent.speechSettings?.emotions ?? 0.5,
  backgroundNoise: agent.speechSettings?.backgroundNoise || "office",
  maxCallDuration: (() => {
    const val = agent.callSettings?.maxCallDuration ?? 300;
    return Math.min(Math.max(val, 60), 3600); // Clamp to valid range 60-3600
  })(),
  silenceDetectionMs: (() => {
    const val = agent.callSettings?.silenceDetectionMs ?? 30000;
    return Math.min(Math.max(val, 5000), 60000); // Clamp to valid range 5000-60000
  })(),
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
    console.log("   User email:", req.user?.email);
    console.log("   Received data keys:", Object.keys(req.body));

    // Accept both Agent format (name, prompt) and SmartAgent format (agentName, systemPrompt)
    const name = req.body.name || req.body.agentName;
    const prompt = req.body.prompt || req.body.systemPrompt;

    if (!name || !prompt) {
      return res.status(400).json({ error: "name/agentName and prompt/systemPrompt are required" });
    }

    console.log("   ✅ Validation passed");

    // SECURITY FIX: Validate agent configuration parameters
    const validation = validateAgentConfig(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: "Invalid agent configuration",
        details: validation.errors
      });
    }
    console.log("   ✅ Configuration validation passed");

    const structured = restructurePayload(req.body);
    structured.userId = req.user._id;

    console.log("   ✅ Payload restructured");
    console.log("   Structured data keys:", Object.keys(structured));
    console.log("   🔍 CRITICAL: userId being set to:", structured.userId);

    const agent = await Agent.create(structured);
    console.log("   ✅ Agent created in database:", agent._id);
    console.log("   🔍 VERIFY: Saved agent userId:", agent.userId);
    console.log("   🔍 VERIFY: Saved agent name:", agent.name);

    // Verify the agent was saved with the correct userId
    const verifyAgent = await Agent.findById(agent._id);
    console.log("   🔍 VERIFY FETCH: Re-fetched agent userId:", verifyAgent?.userId);
    if (String(verifyAgent?.userId) !== String(req.user._id)) {
      console.error("   ⚠️  WARNING: Agent userId mismatch after save!");
      console.error(`      Expected: ${req.user._id}, Got: ${verifyAgent?.userId}`);
    }

    const flattened = flattenAgent(agent);
    console.log("   🔍 RESPONSE: Flattened agent will be:", { id: flattened.id, name: flattened.name });
    res.status(201).json(flattened);
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
    console.log("   Agent ID to update:", req.params.id);
    console.log("   User ID (from token):", req.user._id);
    console.log("   Received data keys:", Object.keys(req.body));

    // SECURITY FIX: Validate agent configuration parameters
    const validation = validateAgentConfig(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: "Invalid agent configuration",
        details: validation.errors
      });
    }
    console.log("   ✅ Configuration validation passed");

    const updateData = restructurePayload(req.body);
    console.log("   ✅ Payload restructured");
    console.log("   Update data keys:", Object.keys(updateData));

    // DIAGNOSTIC: Check if agent exists BEFORE update
    const agentExists = await Agent.findOne({ _id: req.params.id });
    console.log(`   🔍 Agent exists in DB (any user)?`, agentExists ? "YES" : "NO");
    if (agentExists) {
      console.log(`   └─ Agent userId in DB: ${agentExists.userId}`);
      console.log(`   └─ Match with request user? ${String(agentExists.userId) === String(req.user._id) ? 'YES' : 'NO'}`);
    }

    // Now attempt update with BOTH conditions
    const agent = await Agent.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      updateData,
      { new: true, runValidators: true }
    );

    if (!agent) {
      console.error("❌ Agent not found for update with query: { _id: " + req.params.id + ", userId: " + req.user._id + " }");

      // Additional diagnostic
      const allAgentsForUser = await Agent.find({ userId: req.user._id }).select("_id name userId");
      console.error(`   📋 All agents for this user:`, allAgentsForUser.map(a => ({ id: a._id, name: a.name, userId: a.userId })));

      return res.status(404).json({
        error: "Agent not found",
        debug: {
          requestedId: req.params.id,
          requestedUserId: req.user._id,
          agentExistsForAnyUser: agentExists ? true : false,
          userAgentCount: allAgentsForUser.length
        }
      });
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
