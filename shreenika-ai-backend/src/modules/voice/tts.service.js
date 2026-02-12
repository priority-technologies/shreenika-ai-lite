/**
 * Text-to-Speech Service
 * Handles speech synthesis with voice settings
 * Uses Google Cloud Text-to-Speech API
 */

import textToSpeech from '@google-cloud/text-to-speech';
import { getTTSLanguageCode, calculatePitch, buildSSML } from './voiceService.js';
import { getVoiceProfile } from './voiceService.js';

const client = new textToSpeech.TextToSpeechClient();

export class TTSService {
  /**
   * Initialize TTS service for an agent
   */
  constructor(agent, options = {}) {
    this.agent = agent;
    this.voiceProfile = getVoiceProfile(agent.voiceProfile?.voiceId);

    if (!this.voiceProfile) {
      throw new Error('Invalid voice profile for TTS');
    }

    this.languageCode = getTTSLanguageCode(agent.voiceProfile?.language || 'en-US');
    this.voiceSpeed = agent.speechSettings?.voiceSpeed || 1.0;
    this.pitch = calculatePitch(agent.speechSettings?.emotions || 0.5);

    this.options = {
      audioEncoding: options.audioEncoding || 'LINEAR16',
      sampleRateHertz: options.sampleRateHertz || 16000,
      effectsProfileUri: options.effectsProfileUri || null,
      ...options
    };

    this.cache = new Map(); // Simple in-memory cache
  }

  /**
   * Synthesize text to speech with SSML
   */
  async synthesize(text, useCache = true) {
    try {
      // Check cache
      const cacheKey = `${this.voiceProfile.id}_${text}_${this.voiceSpeed}_${this.pitch}`;
      if (useCache && this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      // Build SSML with voice settings
      const ssml = buildSSML(text, this.agent);

      const request = {
        input: {
          ssml: ssml
        },
        voice: {
          languageCode: this.languageCode,
          name: this.voiceProfile.googleVoiceId,
          ssmlGender: this.voiceProfile.gender === 'Male' ? 'MALE' : 'FEMALE'
        },
        audioConfig: {
          audioEncoding: this.options.audioEncoding,
          sampleRateHertz: this.options.sampleRateHertz,
          pitch: this.pitch,
          speakingRate: this.voiceSpeed,
          effectsProfileUri: this.options.effectsProfileUri
        }
      };

      const [response] = await client.synthesizeSpeech(request);

      const result = {
        audioContent: response.audioContent,
        audioEncoding: this.options.audioEncoding,
        voiceId: this.voiceProfile.id,
        voiceName: this.voiceProfile.displayName,
        language: this.languageCode,
        timestamp: new Date()
      };

      // Cache the result
      if (useCache) {
        this.cache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      console.error('Error in TTS synthesis:', error);
      return {
        error: error.message,
        audioContent: null
      };
    }
  }

  /**
   * Synthesize with streaming (for large texts)
   */
  async synthesizeStream(text) {
    try {
      const ssml = buildSSML(text, this.agent);

      const request = {
        input: {
          ssml: ssml
        },
        voice: {
          languageCode: this.languageCode,
          name: this.voiceProfile.googleVoiceId,
          ssmlGender: this.voiceProfile.gender === 'Male' ? 'MALE' : 'FEMALE'
        },
        audioConfig: {
          audioEncoding: this.options.audioEncoding,
          sampleRateHertz: this.options.sampleRateHertz,
          pitch: this.pitch,
          speakingRate: this.voiceSpeed
        }
      };

      return new Promise((resolve, reject) => {
        const chunks = [];

        client.synthesizeSpeech(request, (error, response) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              audioContent: response.audioContent,
              voiceId: this.voiceProfile.id,
              timestamp: new Date()
            });
          }
        });
      });
    } catch (error) {
      console.error('Error in TTS stream synthesis:', error);
      throw error;
    }
  }

  /**
   * Get voice configuration
   */
  getVoiceConfig() {
    return {
      voiceId: this.voiceProfile.id,
      displayName: this.voiceProfile.displayName,
      googleVoiceId: this.voiceProfile.googleVoiceId,
      gender: this.voiceProfile.gender,
      language: this.languageCode,
      voiceSpeed: this.voiceSpeed,
      pitch: this.pitch,
      characteristics: this.voiceProfile.characteristics
    };
  }

  /**
   * Get audio config
   */
  getAudioConfig() {
    return {
      encoding: this.options.audioEncoding,
      sampleRateHertz: this.options.sampleRateHertz,
      pitch: this.pitch,
      speakingRate: this.voiceSpeed
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: 100 // Can be configurable
    };
  }

  /**
   * Update voice settings
   */
  updateSettings(newSettings) {
    if (newSettings.voiceSpeed !== undefined) {
      this.voiceSpeed = newSettings.voiceSpeed;
    }
    if (newSettings.emotions !== undefined) {
      this.pitch = calculatePitch(newSettings.emotions);
    }
    // Clear cache when settings change
    this.clearCache();
  }
}

export default TTSService;
