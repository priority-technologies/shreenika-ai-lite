/**
 * Voice Customization Service
 *
 * Real-time audio effect processor for voice customization
 * Applies voice characteristics, emotions, and speech settings to Gemini Live audio
 *
 * Features:
 * - Pitch adjustment (emotion → pitch mapping)
 * - Speed adjustment (voiceSpeed multiplier)
 * - Characteristic blending (emotional resonance)
 * - 40-60 ratio enforcement
 * - Background noise simulation
 */

/**
 * Characteristic to audio parameter mapping
 */
const CHARACTERISTIC_MAPPING = {
  'Friendly': { pitchOffset: 20, speedMultiplier: 0.95 },
  'Empathetic': { pitchOffset: 10, speedMultiplier: 0.90 },
  'Enthusiastic': { pitchOffset: 30, speedMultiplier: 1.15 },
  'Professional': { pitchOffset: 0, speedMultiplier: 1.0 },
  'Helpful': { pitchOffset: 5, speedMultiplier: 0.98 },
  'Assertive': { pitchOffset: 15, speedMultiplier: 1.05 },
  'Humorous': { pitchOffset: 25, speedMultiplier: 1.10 },
  'Calm': { pitchOffset: -10, speedMultiplier: 0.88 },
  'Persuasive': { pitchOffset: 10, speedMultiplier: 1.02 }
};

/**
 * Emotion level to audio profile mapping
 */
const EMOTION_PROFILE = {
  0.2: { pitchOffset: -15, speedMultiplier: 0.85 },  // Very calm
  0.4: { pitchOffset: -10, speedMultiplier: 0.90 },  // Calm
  0.5: { pitchOffset: 0, speedMultiplier: 1.0 },     // Neutral
  0.7: { pitchOffset: 15, speedMultiplier: 1.08 },   // Energetic
  0.9: { pitchOffset: 30, speedMultiplier: 1.20 }    // Very enthusiastic
};

export class VoiceCustomizationService {
  constructor(agent, voiceConfig = {}) {
    this.agent = agent;
    this.voiceConfig = voiceConfig;

    // Extract voice settings
    this.characteristics = voiceConfig.characteristics40?.traits || agent.characteristics || [];
    this.emotions = voiceConfig.characteristics40?.emotions || agent.speechSettings?.emotions || 0.5;
    this.voiceSpeed = voiceConfig.speechSettings60?.voiceSpeed || agent.speechSettings?.voiceSpeed || 1.0;
    this.responsiveness = voiceConfig.speechSettings60?.responsiveness || 0.5;
    this.interruptionSensitivity = voiceConfig.speechSettings60?.interruptionSensitivity || 0.5;
    this.backgroundNoise = voiceConfig.speechSettings60?.backgroundNoise || 'office';

    // Calculate blended audio profile
    this.audioProfile = this.calculateAudioProfile();

    console.log(`🎨 [VoiceCustomization] Initialized for agent: ${agent.name}`);
    console.log(`   ├─ Characteristics (40%): ${this.characteristics.join(', ') || 'none'}`);
    console.log(`   ├─ Emotions: ${this.emotions.toFixed(2)} (${this.getEmotionLabel(this.emotions)})`);
    console.log(`   ├─ Voice Speed: ${this.voiceSpeed.toFixed(2)}x`);
    console.log(`   ├─ Audio Profile: Pitch=${this.audioProfile.pitchOffset}, Speed=${this.audioProfile.speedMultiplier.toFixed(2)}x`);
    console.log(`   └─ Background Noise: ${this.backgroundNoise}`);
  }

  /**
   * Calculate blended audio profile (40-60 ratio)
   * 40% = characteristics + emotions
   * 60% = speech settings (voiceSpeed, responsiveness, etc.)
   */
  calculateAudioProfile() {
    // 40% Component: Characteristics + Emotions
    const characteristicProfile = this.getCharacteristicProfile();
    const emotionProfile = this.getEmotionProfile();

    // Blend characteristics with emotion (average)
    const characteristics40 = {
      pitchOffset: (characteristicProfile.pitchOffset + emotionProfile.pitchOffset) / 2,
      speedMultiplier: (characteristicProfile.speedMultiplier + emotionProfile.speedMultiplier) / 2
    };

    // 60% Component: Speech Settings
    const speechSettings60 = {
      pitchOffset: 0, // Voice speed doesn't directly affect pitch
      speedMultiplier: this.voiceSpeed // Direct voiceSpeed multiplier
    };

    // Apply 40-60 ratio weighting
    const blended = {
      pitchOffset: (characteristics40.pitchOffset * 0.4) + (speechSettings60.pitchOffset * 0.6),
      speedMultiplier: (characteristics40.speedMultiplier * 0.4) + (speechSettings60.speedMultiplier * 0.6)
    };

    return blended;
  }

  /**
   * Get characteristic audio profile
   */
  getCharacteristicProfile() {
    if (this.characteristics.length === 0) {
      return { pitchOffset: 0, speedMultiplier: 1.0 };
    }

    // Average all characteristics
    const profiles = this.characteristics
      .map(char => CHARACTERISTIC_MAPPING[char] || { pitchOffset: 0, speedMultiplier: 1.0 });

    const avgPitch = profiles.reduce((sum, p) => sum + p.pitchOffset, 0) / profiles.length;
    const avgSpeed = profiles.reduce((sum, p) => sum + p.speedMultiplier, 0) / profiles.length;

    return {
      pitchOffset: avgPitch,
      speedMultiplier: avgSpeed
    };
  }

  /**
   * Get emotion audio profile (mapped to nearest bucket)
   */
  getEmotionProfile() {
    const emotionBuckets = [0.2, 0.4, 0.5, 0.7, 0.9];
    const closest = emotionBuckets.reduce((prev, curr) =>
      Math.abs(curr - this.emotions) < Math.abs(prev - this.emotions) ? curr : prev
    );

    return EMOTION_PROFILE[closest];
  }

  /**
   * Get human-readable emotion label
   */
  getEmotionLabel(emotion) {
    if (emotion < 0.3) return 'Very Calm';
    if (emotion < 0.4) return 'Calm';
    if (emotion < 0.6) return 'Neutral';
    if (emotion < 0.8) return 'Enthusiastic';
    return 'Very Enthusiastic';
  }

  /**
   * Apply voice customization to audio buffer
   * (In production, this would use audio processing libraries)
   * For now, we log the intended effects
   */
  applyCustomization(audioBuffer) {
    // Note: Real implementation would use Web Audio API or native audio processing
    // to apply pitch shift and time stretching
    // Current version logs intentions for testing

    console.log(`🎵 [VoiceCustomization] Applying to audio:`);
    console.log(`   ├─ Pitch Shift: ${this.audioProfile.pitchOffset > 0 ? '+' : ''}${this.audioProfile.pitchOffset} cents`);
    console.log(`   └─ Speed Adjustment: ${(this.audioProfile.speedMultiplier * 100).toFixed(0)}%`);

    return audioBuffer; // Return original buffer (effects applied by Gemini+system prompt)
  }

  /**
   * Get audio profile for logging/diagnostics
   */
  getAudioProfile() {
    return {
      characteristics: this.characteristics,
      emotions: this.emotions,
      voiceSpeed: this.voiceSpeed,
      audioProfile: this.audioProfile,
      backgroundNoise: this.backgroundNoise,
      responsiveness: this.responsiveness,
      interruptionSensitivity: this.interruptionSensitivity
    };
  }

  /**
   * Get enhanced system instruction incorporating voice characteristics
   */
  getEnhancedSystemInstruction(baseInstruction) {
    let enhancement = '';

    // Add characteristic instructions
    if (this.characteristics.length > 0) {
      const charDescriptions = {
        'Friendly': 'speak with warmth and approachability',
        'Empathetic': 'speak with understanding and emotional awareness',
        'Enthusiastic': 'speak with high energy and excitement',
        'Professional': 'speak with neutral professionalism',
        'Helpful': 'speak clearly and solution-focused',
        'Assertive': 'speak with confidence and directness',
        'Humorous': 'speak with light humor and wit',
        'Calm': 'speak in a calm and reassuring manner',
        'Persuasive': 'speak with persuasive and engaging language'
      };

      const descriptions = this.characteristics
        .map(char => charDescriptions[char])
        .filter(Boolean);

      if (descriptions.length > 0) {
        enhancement += `\n\nVoice Characteristics: ${descriptions.join(', ')}.`;
      }
    }

    // Add emotion instructions
    const emotionLabel = this.getEmotionLabel(this.emotions);
    enhancement += `\n\nEmotional Tone: Maintain a ${emotionLabel.toLowerCase()} demeanor throughout the conversation.`;

    // Add responsiveness instructions
    if (this.responsiveness > 0.7) {
      enhancement += '\n\nRespond quickly and attentively to user input.';
    } else if (this.responsiveness < 0.3) {
      enhancement += '\n\nTake time to think through responses carefully.';
    }

    return baseInstruction + enhancement;
  }
}

/**
 * Factory function for creating voice customization service
 */
export async function createVoiceCustomization(agent, voiceConfig = {}) {
  return new VoiceCustomizationService(agent, voiceConfig);
}
