import Lead from "./lead.model.js";

export const createLead = async (req, res) => {
  try {
    const lead = await Lead.create({
      userId: req.user._id,
      ...req.body
    });
    res.json(lead);
  } catch (err) {
    console.error("Create lead error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const listLeads = async (req, res) => {
  try {
    const leads = await Lead.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getLead = async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, userId: req.user._id });
    if (!lead) return res.status(404).json({ error: "Not found" });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateLead = async (req, res) => {
  try {
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true }
    );
    if (!lead) return res.status(404).json({ error: "Not found" });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteLead = async (req, res) => {
  try {
    await Lead.deleteOne({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};