import Agent from "./agent.model.js";

/* =========================
   CREATE AGENT
========================= */
export const createAgent = async (req, res) => {
  try {
    // Basic validation
    if (!req.body.name || !req.body.prompt) {
      return res.status(400).json({
        error: "name and prompt are required"
      });
    }

    // Create agent with all provided fields plus userId
    const agent = await Agent.create({
      ...req.body,
      userId: req.user._id
    });

    res.status(201).json(agent);
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

    res.json({
      success: true,
      message: "Agent activated successfully",
      agent
    });
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
    res.json(agents);
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

    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   UPDATE AGENT
========================= */
export const updateAgent = async (req, res) => {
  try {
    const agent = await Agent.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true }
    );

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    res.json(agent);
  } catch (err) {
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
