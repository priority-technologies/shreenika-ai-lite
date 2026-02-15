/**
 * TTS Service - Google Cloud Text-to-Speech Integration (ENHANCED)
 * Handles voice customization: voiceSpeed, pitch, emotion, characteristics
 * Part of Hybrid Gemini + TTS approach (60% of Agent Voice System)
 *
 * FEATURES:
 * - Characteristic-based voice customization (Friendly, Empathetic, Enthusiastic, etc.)
 * - Emotion level mapping to audio parameters
 * - Voice speed customization (0.75 - 1.25x)
 * - Pitch adjustment for emotional resonance
 * - Fallback to Gemini Live if TTS fails
 * - System prompt injection for natural speech
 */

import textToSpeech from '@google-cloud/text-to-speech';

const client = new textToSpeech.TextToSpeechClient({
  projectId: process.env.GOOGLE_CLOUD_PROJECT
});

/**
 * Characteristic to voice parameter mapping (60% Priority Implementation)
 */
const CHARACTERISTIC_CONFIG = {
  'Friendly': {
    pitch: 20,           // Higher pitch = warmer
    speakingRate: 0.95,  // Slightly slower = more conversational
    description: 'Warm, approachable tone'
  },
  'Empathetic': {
    pitch: 10,           // Slightly higher
    speakingRate: 0.90,  // Slower = more thoughtful
    description: 'Soft, understanding tone'
  },
  'Enthusiastic': {
    pitch: 30,           // Much higher
    speakingRate: 1.15,  // Faster = more energetic
    description: 'High energy, vibrant tone'
  },
  'Professional': {
    pitch: 0,            // Neutral pitch
    speakingRate: 1.0,   // Standard pace
    description: 'Neutral, authoritative tone'
  },
  'Helpful': {
    pitch: 5,            // Slightly higher
    speakingRate: 0.98,  // Nearly normal
    description: 'Clear, solution-focused tone'
  }
};

/**
 * Emotion level to audio profile mapping
 */
const EMOTION_LEVEL_CONFIG = {
  0.2: { pitch: -15, speakingRate: 0.85 },  // Very calm
  0.4: { pitch: -10, speakingRate: 0.90 },  // Calm
  0.5: { pitch: 0, speakingRate: 1.0 },     // Neutral
  0.7: { pitch: 15, speakingRate: 1.08 },   // Energetic
  0.9: { pitch: 30, speakingRate: 1.20 }    // Very enthusiastic
};

/**
 * Voice ID mapping - Google Cloud TTS voices
 */
const VOICE_MAPPING = {
  'Monika (en-IN)': { languageCode: 'en-IN', name: 'en-IN-Neural2-A' },
  'Aditi (en-IN)': { languageCode: 'en-IN', name: 'en-IN-Neural2-B' },
  'Adit (en-IN)': { languageCode: 'en-IN', name: 'en-IN-Neural2-C' },
  'Aria (en-US)': { languageCode: 'en-US', name: 'en-US-Neural2-A' },
  'Breeze (en-US)': { languageCode: 'en-US', name: 'en-US-Neural2-B' },
  'Priya (hi-IN)': { languageCode: 'hi-IN', name: 'hi-IN-Neural2-A' },
  'default': { languageCode: 'en-IN', name: 'en-IN-Neural2-A' }
};

export class TTSService {
  /**
   * Initialize TTS service with agent settings
   */
  constructor(agent, options = {}) {
    this.agent = agent;

    // Voice settings
    this.voiceId = agent?.voiceProfile?.voiceId || 'Monika (en-IN)';
    this.voiceConfig = VOICE_MAPPING[this.voiceId] || VOICE_MAPPING['default'];

    // Characteristic & emotion settings
    this.characteristics = agent?.characteristics || [];
    this.emotionLevel = agent?.speechSettings?.emotions || 0.5;
    this.voiceSpeed = agent?.speechSettings?.voiceSpeed || 1.0;

    // Audio config
    this.options = {
      audioEncoding: options.audioEncoding || 'LINEAR16',
      sampleRateHertz: options.sampleRateHertz || 24000,
      ...options
    };

    // Calculate blended audio profile
    this.audioProfile = this.calculateAudioProfile();
    this.cache = new Map();

    console.log(`🎤 TTSService: Initialized with ${this.characteristics.length} characteristics`);
  }

  /**
   * Calculate blended audio profile from characteristics + emotion + speed
   */
  calculateAudioProfile() {
    let pitch = 0;
    let speakingRate = 1.0;

    // 1. Apply emotion level
    const emotionConfig = this.findClosestEmotionConfig(this.emotionLevel);
    if (emotionConfig) {
      pitch += emotionConfig.pitch;
      speakingRate += (emotionConfig.speakingRate - 1);
    }

    // 2. Blend characteristics
    if (this.characteristics.length > 0) {
      const charWeights = 1 / this.characteristics.length;

      this.characteristics.forEach(char => {
        const charConfig = CHARACTERISTIC_CONFIG[char];
        if (charConfig) {
          pitch += (charConfig.pitch * charWeights);
          speakingRate += ((charConfig.speakingRate - 1) * charWeights);
        }
      });
    }

    // 3. Apply voice speed multiplier
    speakingRate = Math.max(0.25, Math.min(4.0, speakingRate * this.voiceSpeed));

    // Clamp pitch to valid Google Cloud range (-20 to +20)
    pitch = Math.max(-20, Math.min(20, pitch));

    return { pitch, speakingRate };
  }

  /**
   * Find closest emotion config from predefined levels
   */
  findClosestEmotionConfig(emotionLevel) {
    const levels = Object.keys(EMOTION_LEVEL_CONFIG).map(Number).sort((a, b) => a - b);
    let closest = levels[0];

    for (let level of levels) {
      if (Math.abs(level - emotionLevel) < Math.abs(closest - emotionLevel)) {
        closest = level;
      }
    }

    return EMOTION_LEVEL_CONFIG[closest];
  }

  /**
   * Synthesize text to speech with characteristic customization
   */
  async synthesize(text, useCache = true) {
    try {
      // Check cache
      const cacheKey = `${this.voiceId}_${text}_${this.emotionLevel}_${this.voiceSpeed}`;
      if (useCache && this.cache.has(cacheKey)) {
        console.log(`📦 TTS: Cache hit for ${text.substring(0, 30)}...`);
        return this.cache.get(cacheKey);
      }

      console.log(`🎵 TTS: Synthesizing (${text.length} chars) with characteristics: ${this.characteristics.join(', ') || 'none'}`);

      const request = {
        input: { text },
        voice: {
          languageCode: this.voiceConfig.languageCode,
          name: this.voiceConfig.name
        },
        audioConfig: {
          audioEncoding: this.options.audioEncoding,
          sampleRateHertz: this.options.sampleRateHertz,
          pitch: this.audioProfile.pitch,
          speakingRate: this.audioProfile.speakingRate
        }
      };

      const [response] = await client.synthesizeSpeech(request);

      if (!response.audioContent) {
        throw new Error('No audio content in TTS response');
      }

      const result = {
        audioContent: response.audioContent,
        audioEncoding: this.options.audioEncoding,
        sampleRateHertz: this.options.sampleRateHertz,
        voiceId: this.voiceId,
        characteristics: {
          characteristics: this.characteristics,
          emotionLevel: this.emotionLevel,
          voiceSpeed: this.voiceSpeed,
          audioProfile: this.audioProfile
        }
      };

      // Cache result
      if (useCache) {
        this.cache.set(cacheKey, result);
      }

      console.log(`✅ TTS: Synthesis successful (${Buffer.byteLength(response.audioContent)} bytes)`);
      return result;

    } catch (error) {
      console.error(`❌ TTS Synthesis Error:`, error.message);
      return {
        error: error.message,
        audioContent: null,
        fallback: true
      };
    }
  }

  /**
   * Get system prompt injection for Gemini
   * (Tell Gemini to match the voice characteristics)
   */
  getSystemPromptInjection() {
    let prompt = '';

    // Characteristic instructions
    if (this.characteristics.length > 0) {
      prompt += `VOICE CHARACTERISTICS: Speak as ${this.characteristics.join(', ')}.\n`;

      this.characteristics.forEach(char => {
        const guidance = {
          'Friendly': 'Use warm language, smile in your tone, be conversational.',
          'Empathetic': 'Show understanding, acknowledge emotions, be compassionate.',
          'Enthusiastic': 'Show genuine excitement, use exclamation marks, be energetic.',
          'Professional': 'Use formal language, be authoritative, maintain credibility.',
          'Helpful': 'Focus on solutions, be clear, provide actionable advice.'
        };

        if (guidance[char]) {
          prompt += `- ${char}: ${guidance[char]}\n`;
        }
      });
    }

    // Emotion instructions
    if (this.emotionLevel > 0.7) {
      prompt += `SPEAKING STYLE: Speak with high energy and enthusiasm.\n`;
    } else if (this.emotionLevel < 0.3) {
      prompt += `SPEAKING STYLE: Speak calmly and thoughtfully.\n`;
    } else {
      prompt += `SPEAKING STYLE: Speak in balanced, neutral tone.\n`;
    }

    // Speed instructions
    if (this.voiceSpeed > 1.1) {
      prompt += `PACE: Speak quickly and energetically.\n`;
    } else if (this.voiceSpeed < 0.9) {
      prompt += `PACE: Speak slowly and deliberately.\n`;
    }

    return prompt;
  }

  /**
   * Get detailed audio profile for debugging
   */
  getAudioProfile() {
    return {
      voiceId: this.voiceId,
      characteristics: this.characteristics,
      emotionLevel: this.emotionLevel,
      voiceSpeed: this.voiceSpeed,
      calculatedPitch: this.audioProfile.pitch,
      calculatedSpeakingRate: this.audioProfile.speakingRate.toFixed(2),
      audioEncoding: this.options.audioEncoding,
      sampleRateHertz: this.options.sampleRateHertz
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Update settings dynamically
   */
  updateSettings(newSettings) {
    if (newSettings.characteristics) {
      this.characteristics = newSettings.characteristics;
    }
    if (newSettings.emotionLevel !== undefined) {
      this.emotionLevel = newSettings.emotionLevel;
    }
    if (newSettings.voiceSpeed) {
      this.voiceSpeed = newSettings.voiceSpeed;
    }

    // Recalculate audio profile
    this.audioProfile = this.calculateAudioProfile();
    this.clearCache();
  }
}

/**
 * Factory function to create TTS service from agent
 */
export async function createTTSService(agent) {
  if (!agent) {
    console.warn('⚠️  No agent provided, using default TTS');
    return new TTSService(null);
  }

  return new TTSService(agent);
}

/**
 * Determine if TTS should be used (vs pure Gemini Live)
 */
export function shouldUseTTS(agent) {
  if (!agent || !agent.speechSettings) return false;

  const hasCustomSpeed = agent.speechSettings.voiceSpeed && agent.speechSettings.voiceSpeed !== 1.0;
  const hasCharacteristics = agent.characteristics && agent.characteristics.length > 0;
  const hasExtremeEmotion = agent.speechSettings.emotions && (agent.speechSettings.emotions < 0.3 || agent.speechSettings.emotions > 0.7);

  return hasCustomSpeed || hasCharacteristics || hasExtremeEmotion;
}

export default TTSService;
