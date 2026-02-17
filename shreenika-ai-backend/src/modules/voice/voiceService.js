/**
 * Voice Service
 * Manages voice profiles, language settings, and voice-related utilities
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const voiceProfiles = JSON.parse(
  readFileSync(join(__dirname, '../../../config/voiceProfiles.json'), 'utf8')
);
const languageProfiles = JSON.parse(
  readFileSync(join(__dirname, '../../../config/languageProfiles.json'), 'utf8')
);

/**
 * Get a voice profile by ID
 */
export function getVoiceProfile(voiceId) {
  if (!voiceId) return null;
  const profile = voiceProfiles.voices.find((v) => v.id === voiceId);
  if (!profile) {
    throw new Error(`Voice profile not found: ${voiceId}`);
  }
  return profile;
}

/**
 * Get all available voice profiles
 */
export function getAllVoiceProfiles() {
  return voiceProfiles.voices;
}

/**
 * Get a language profile by code
 * Falls back to en-US if code not found instead of throwing error
 */
export function getLanguageProfile(languageCode) {
  if (!languageCode) {
    console.warn('⚠️  No language code provided, defaulting to en-US');
    return languageProfiles.languages.find((l) => l.code === 'en-US');
  }

  const profile = languageProfiles.languages.find((l) => l.code === languageCode);
  if (!profile) {
    // Try fallback: look up by display name (in case frontend sends name instead of code)
    const nameMatch = languageProfiles.languages.find((l) => l.name === languageCode);
    if (nameMatch) {
      console.log(`ℹ️  Language matched by name: "${languageCode}" → "${nameMatch.code}"`);
      return nameMatch;
    }

    // Last resort: default to en-US
    console.warn(`⚠️  Language profile not found: "${languageCode}", defaulting to en-US`);
    return languageProfiles.languages.find((l) => l.code === 'en-US');
  }
  return profile;
}

/**
 * Get all available languages
 */
export function getAllLanguages() {
  return languageProfiles.languages;
}

/**
 * Get languages sorted by priority
 */
export function getLanguagesByPriority() {
  return [...languageProfiles.languages].sort((a, b) => a.priority - b.priority);
}

/**
 * Validate voice configuration
 */
export async function validateVoiceSettings(agent) {
  if (!agent) {
    throw new Error('Agent configuration required');
  }

  const { voiceProfile, speechSettings, voiceProfile: vp } = agent;

  // Validate voice profile exists
  if (!vp || !vp.voiceId) {
    throw new Error('Voice profile ID is required');
  }

  try {
    getVoiceProfile(vp.voiceId);
  } catch (error) {
    throw new Error(`Invalid voice ID: ${vp.voiceId}`);
  }

  // Validate voice speed range
  if (speechSettings?.voiceSpeed !== undefined) {
    if (speechSettings.voiceSpeed < 0.75 || speechSettings.voiceSpeed > 1.25) {
      throw new Error('Voice speed must be between 0.75 and 1.25');
    }
  }

  // Validate all slider values (0-1)
  const sliderFields = [
    'interruptionSensitivity',
    'responsiveness',
    'emotions'
  ];

  for (const field of sliderFields) {
    if (speechSettings?.[field] !== undefined) {
      const value = speechSettings[field];
      if (value < 0 || value > 1) {
        throw new Error(`${field} must be between 0 and 1`);
      }
    }
  }

  // Validate background noise
  if (speechSettings?.backgroundNoise) {
    const validNoises = ['office', 'quiet', 'cafe', 'street', 'call-center'];
    if (!validNoises.includes(speechSettings.backgroundNoise)) {
      throw new Error(`Invalid background noise: ${speechSettings.backgroundNoise}`);
    }
  }

  // Validate language is supported by voice
  if (vp.supportedLanguages && vp.language) {
    const voice = getVoiceProfile(vp.voiceId);
    if (voice.supportedLanguages && !voice.supportedLanguages.includes(vp.language)) {
      throw new Error(
        `Language ${vp.language} not supported by voice ${voice.displayName}`
      );
    }
  }

  return true;
}

/**
 * Get voice recommendations based on agent characteristics
 */
export function recommendVoices(characteristics = []) {
  if (!characteristics || characteristics.length === 0) {
    return getAllVoiceProfiles();
  }

  // Score voices based on characteristic match
  const scoredVoices = voiceProfiles.voices.map((voice) => {
    const matches = voice.characteristics.filter((char) =>
      characteristics.includes(char)
    ).length;
    return { ...voice, score: matches };
  });

  // Sort by score and return top 3-4
  return scoredVoices.sort((a, b) => b.score - a.score).slice(0, 4);
}

/**
 * Get recommended voices for specific use case
 */
export function getVoicesForUseCase(useCase) {
  const useCaseMap = {
    'sales': ['voice_3', 'voice_1', 'voice_4'],
    'support': ['voice_2', 'voice_6', 'voice_4'],
    'debt-recovery': ['voice_5', 'voice_1', 'voice_8'],
    'tech-support': ['voice_7', 'voice_3', 'voice_4'],
    'recruitment': ['voice_2', 'voice_8', 'voice_1'],
    'healthcare': ['voice_6', 'voice_2', 'voice_4']
  };

  const voiceIds = useCaseMap[useCase] || ['voice_1', 'voice_2', 'voice_3'];
  return voiceIds
    .map((id) => getVoiceProfile(id))
    .filter((v) => v !== null);
}

/**
 * Get voices by gender and age group
 */
export function getVoicesByDemographics(gender, ageGroup) {
  let filtered = voiceProfiles.voices;

  if (gender) {
    filtered = filtered.filter((v) => v.gender === gender);
  }

  if (ageGroup) {
    filtered = filtered.filter((v) => v.ageGroup === ageGroup);
  }

  return filtered;
}

/**
 * Get STT language code from agent language
 * Returns safe default en-US if language not found
 */
export function getSTTLanguageCode(language) {
  try {
    const langProfile = getLanguageProfile(language);
    return langProfile?.sttLanguageCode || 'en-US';
  } catch (error) {
    console.warn('⚠️  Error getting STT language code, defaulting to en-US:', error.message);
    return 'en-US';
  }
}

/**
 * Get TTS language code from agent language
 * Returns safe default en-US if language not found
 */
export function getTTSLanguageCode(language) {
  try {
    const langProfile = getLanguageProfile(language);
    return langProfile?.ttsLanguageCode || 'en-US';
  } catch (error) {
    console.warn('⚠️  Error getting TTS language code, defaulting to en-US:', error.message);
    return 'en-US';
  }
}

/**
 * Calculate SSML pitch from emotion slider (0-1)
 * Returns semitones: -20 to +20
 */
export function calculatePitch(emotionValue) {
  if (emotionValue === undefined) emotionValue = 0.5;
  // Range: 0 (Calm, -10st) → 0.5 (Normal, 0st) → 1 (Emotional, +10st)
  return (emotionValue - 0.5) * 20;
}

/**
 * Generate SSML markup from text and agent settings
 */
export function buildSSML(text, agent) {
  if (!agent || !agent.speechSettings) {
    return `<speak>${text}</speak>`;
  }

  const { speechSettings } = agent;
  const voiceSpeed = speechSettings.voiceSpeed || 1.0;
  const pitch = calculatePitch(speechSettings.emotions);
  const pauseMs = 500 - (speechSettings.interruptionSensitivity || 0.5) * 300;

  let ssml = '<speak>';

  // Add prosody for pitch and rate
  ssml += `<prosody rate="${voiceSpeed}" pitch="${pitch > 0 ? '+' : ''}${pitch}st">`;

  // Break text into sentences for natural pauses
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim());

  sentences.forEach((sentence, index) => {
    const trimmed = sentence.trim();
    if (trimmed) {
      ssml += trimmed;

      // Add break between sentences (except the last)
      if (index < sentences.length - 1) {
        ssml += `<break time="${pauseMs}ms"/>`;
      }
    }
  });

  ssml += '</prosody></speak>';

  return ssml;
}

/**
 * Get max tokens for Gemini based on responsiveness
 * Faster → shorter, Slower → longer
 */
export function getMaxTokens(responsiveness) {
  if (responsiveness === undefined) responsiveness = 0.5;
  // Range: Slow (0) = 200 tokens, Fast (1) = 50 tokens
  const baseTokens = 50;
  const maxTokens = 200;
  return maxTokens - responsiveness * (maxTokens - baseTokens);
}

/**
 * Validate agent voice settings before use
 */
export async function validateAgentForVoice(agent) {
  try {
    // Check required fields
    if (!agent?.voiceProfile?.voiceId) {
      throw new Error('Agent voice profile not configured');
    }

    // Validate all settings
    await validateVoiceSettings(agent);

    // Get and verify voice exists
    const voice = getVoiceProfile(agent.voiceProfile.voiceId);

    return {
      valid: true,
      voice,
      message: `Agent ${agent.name} is ready for voice calls`
    };
  } catch (error) {
    return {
      valid: false,
      message: error.message,
      error
    };
  }
}

/**
 * Get voice configuration summary
 * Uses safe defaults if voice or language profiles not found
 */
export function getVoiceSummary(agent) {
  if (!agent) return null;

  let voice = null;
  let language = null;

  try {
    voice = getVoiceProfile(agent.voiceProfile?.voiceId);
  } catch (error) {
    console.warn('⚠️  Voice profile not found, using defaults:', error.message);
    voice = { displayName: 'Default Voice', gender: 'neutral', characteristics: [] };
  }

  try {
    language = getLanguageProfile(agent.voiceProfile?.language);
  } catch (error) {
    console.warn('⚠️  Language profile not found, using defaults:', error.message);
    language = { code: 'en-US', name: 'English (USA)', priority: 4 };
  }

  return {
    agent: agent.name,
    voice: {
      id: agent.voiceProfile?.voiceId,
      displayName: voice?.displayName || 'Default Voice',
      gender: voice?.gender || 'neutral',
      characteristics: voice?.characteristics || []
    },
    language: {
      code: language?.code || 'en-US',
      name: language?.name || 'English (USA)',
      priority: language?.priority || 4
    },
    settings: {
      voiceSpeed: agent.speechSettings?.voiceSpeed || 1.0,
      interruptionSensitivity: agent.speechSettings?.interruptionSensitivity || 0.5,
      responsiveness: agent.speechSettings?.responsiveness || 0.5,
      emotions: agent.speechSettings?.emotions || 0.5,
      backgroundNoise: agent.speechSettings?.backgroundNoise || 'office'
    }
  };
}

export default {
  getVoiceProfile,
  getAllVoiceProfiles,
  getLanguageProfile,
  getAllLanguages,
  getLanguagesByPriority,
  validateVoiceSettings,
  recommendVoices,
  getVoicesForUseCase,
  getVoicesByDemographics,
  getSTTLanguageCode,
  getTTSLanguageCode,
  calculatePitch,
  buildSSML,
  getMaxTokens,
  validateAgentForVoice,
  getVoiceSummary
};
