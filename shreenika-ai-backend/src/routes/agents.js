// backend/routes/agents.js

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Agent = require('../models/Agent');

// GET /api/agents - Get all agents for logged-in user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const agents = await Agent.find({ userId: req.user.id });
    res.json({ data: agents });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ message: 'Failed to fetch agents' });
  }
});

// GET /api/agents/:id - Get single agent
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const agent = await Agent.findOne({ 
      _id: req.params.id, 
      userId: req.user.id 
    });
    
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    res.json({ data: agent });
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({ message: 'Failed to fetch agent' });
  }
});

// POST /api/agents - Create new agent
router.post('/', authenticateToken, async (req, res) => {
    console.log('📝 Creating agent for user:', req.user?.id);
    console.log('📦 Request body:', req.body);
  try {
    const agent = new Agent({
      ...req.body,
      userId: req.user.id,
    });
    
    await agent.save();
    res.status(201).json({ data: agent });
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ message: 'Failed to create agent' });
  }
});

// PUT /api/agents/:id - Update agent
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const agent = await Agent.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    res.json({ data: agent });
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ message: 'Failed to update agent' });
  }
});

// DELETE /api/agents/:id - Delete agent
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const agent = await Agent.findOneAndDelete({ 
      _id: req.params.id, 
      userId: req.user.id 
    });
    
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ message: 'Failed to delete agent' });
  }
});

module.exports = router;