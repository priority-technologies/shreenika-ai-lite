/**
 * Voice Controller
 * Handles voice-related API endpoints
 */

import {
  getAllVoiceProfiles,
  getLanguagesByPriority,
  validateVoiceSettings,
  recommendVoices,
  getVoicesForUseCase,
  getVoiceSummary
} from './voiceService.js';
import TTSService from './tts.service.js';
import User from '../auth/user.model.js';
import Agent from '../agent/agent.model.js';

/**
 * GET /voice/available-voices
 * Get all available voice profiles
 */
export async function getAvailableVoices(req, res) {
  try {
    const voices = getAllVoiceProfiles();

    res.json({
      success: true,
      count: voices.length,
      voices: voices.map((voice) => ({
        id: voice.id,
        displayName: voice.displayName,
        gender: voice.gender,
        ageGroup: voice.ageGroup,
        language: voice.language,
        characteristics: voice.characteristics,
        bestFor: voice.bestFor
      }))
    });
  } catch (error) {
    console.error('Error getting available voices:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /voice/available-languages
 * Get all available languages sorted by priority
 */
export async function getAvailableLanguages(req, res) {
  try {
    const languages = getLanguagesByPriority();

    res.json({
      success: true,
      count: languages.length,
      languages: languages.map((lang) => ({
        code: lang.code,
        name: lang.name,
        priority: lang.priority,
        description: lang.description
      }))
    });
  } catch (error) {
    console.error('Error getting available languages:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * PUT /voice/agent/:agentId/voice
 * Update agent voice settings
 */
export async function updateAgentVoiceSettings(req, res) {
  try {
    const { agentId } = req.params;
    const { voiceProfile, speechSettings } = req.body;

    if (!agentId) {
      return res.status(400).json({
        success: false,
        error: 'Agent ID is required'
      });
    }

    // Find agent
    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    // Update voice profile
    if (voiceProfile) {
      agent.voiceProfile = {
        voiceId: voiceProfile.voiceId,
        displayName: voiceProfile.displayName,
        language: voiceProfile.language
      };
    }

    // Update speech settings
    if (speechSettings) {
      agent.speechSettings = {
        voiceSpeed: speechSettings.voiceSpeed || 1.0,
        interruptionSensitivity: speechSettings.interruptionSensitivity || 0.5,
        responsiveness: speechSettings.responsiveness || 0.5,
        emotions: speechSettings.emotions || 0.5,
        backgroundNoise: speechSettings.backgroundNoise || 'office'
      };
    }

    // Validate settings
    await validateVoiceSettings(agent);

    // Save agent
    await agent.save();

    res.json({
      success: true,
      message: 'Voice settings updated successfully',
      agent: {
        id: agent._id,
        name: agent.name,
        voiceProfile: agent.voiceProfile,
        speechSettings: agent.speechSettings
      }
    });
  } catch (error) {
    console.error('Error updating voice settings:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /voice/agent/:agentId/voice-preview
 * Generate and play voice preview
 */
export async function testVoicePreview(req, res) {
  try {
    const { agentId } = req.params;
    const { text } = req.body;

    if (!agentId) {
      return res.status(400).json({
        success: false,
        error: 'Agent ID is required'
      });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Text is required for voice preview'
      });
    }

    // Find agent
    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    // Validate voice settings
    await validateVoiceSettings(agent);

    // Initialize TTS service
    const ttsService = new TTSService(agent);

    // Generate preview audio
    const result = await ttsService.synthesize(text, false);

    if (result.error) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    // Return audio
    res.set('Content-Type', 'audio/wav');
    res.set('Content-Disposition', `attachment; filename="preview.wav"`);
    res.send(result.audioContent);
  } catch (error) {
    console.error('Error generating voice preview:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /voice/agent/:agentId/settings
 * Get agent voice settings
 */
export async function getAgentVoiceSettings(req, res) {
  try {
    const { agentId } = req.params;

    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    const summary = getVoiceSummary(agent);

    res.json({
      success: true,
      voiceSettings: summary
    });
  } catch (error) {
    console.error('Error getting voice settings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /voice/recommend-voices
 * Get voice recommendations based on characteristics
 */
export async function recommendVoicesHandler(req, res) {
  try {
    const { characteristics, useCase } = req.body;

    let voices;

    if (useCase) {
      voices = getVoicesForUseCase(useCase);
    } else if (characteristics && Array.isArray(characteristics)) {
      voices = recommendVoices(characteristics);
    } else {
      voices = getAllVoiceProfiles();
    }

    res.json({
      success: true,
      count: voices.length,
      voices: voices.map((voice) => ({
        id: voice.id,
        displayName: voice.displayName,
        characteristics: voice.characteristics,
        bestFor: voice.bestFor
      }))
    });
  } catch (error) {
    console.error('Error recommending voices:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /voice/validate-settings
 * Validate voice settings before saving
 */
export async function validateVoiceSettingsHandler(req, res) {
  try {
    const { voiceProfile, speechSettings } = req.body;

    // Create temporary agent object for validation
    const tempAgent = {
      voiceProfile,
      speechSettings
    };

    await validateVoiceSettings(tempAgent);

    res.json({
      success: true,
      message: 'Voice settings are valid'
    });
  } catch (error) {
    console.error('Error validating settings:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

export default {
  getAvailableVoices,
  getAvailableLanguages,
  updateAgentVoiceSettings,
  testVoicePreview,
  getAgentVoiceSettings,
  recommendVoicesHandler,
  validateVoiceSettingsHandler
};
