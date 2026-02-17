/**
 * Prosody Service
 *
 * Calculates and applies prosody parameters (pitch, timing, intensity, voice quality)
 * based on agent voice customization settings and language profiles.
 *
 * Prosody Dimensions:
 * - Pitch (F0): Emotion level + language patterns → 50-250Hz range
 * - Intensity (RMS Energy): Characteristics traits + speech settings
 * - Duration (Timing): Responsiveness + voiceSpeed sliders
 * - Voice Quality: Background noise selection + characteristics
 * - Spectral Centroid: Emotion level determines formant frequencies
 */

/**
 * Calculate pitch (F0) in Hz based on emotion and language
 * Range: 50-250Hz (typical for speech)
 */
export function calculatePitch(emotionLevel, language = 'en-US') {
  if (emotionLevel === undefined) emotionLevel = 0.5;

  // Base pitch by language
  const basePitches = {
    'hinglish': 120,  // Warmer, mid-range base
    'hi-IN': 130,     // Slightly higher for Hindi
    'en-IN': 110,     // Warm Indian English base
    'en-US': 100      // Standard American base
  };

  const basePitch = basePitches[language] || 100;

  // Emotion variation: 0 (calm) → 0.5 (neutral) → 1 (enthusiastic)
  // Calm: -20 semitones, Enthusiastic: +20 semitones
  const emotionVariation = (emotionLevel - 0.5) * 40;

  // Convert semitones to Hz (multiply by 1.06 per semitone)
  const pitchMultiplier = Math.pow(1.06, emotionVariation);
  const finalPitch = basePitch * pitchMultiplier;

  return {
    hz: Math.round(finalPitch),
    semitones: emotionVariation,
    emotion: emotionLevel,
    language
  };
}

/**
 * Calculate speech rate (duration multiplier)
 * Range: 0.5-2.0x (50% slower to 2x faster than normal)
 */
export function calculateSpeechRate(voiceSpeed, responsiveness) {
  if (voiceSpeed === undefined) voiceSpeed = 1.0;
  if (responsiveness === undefined) responsiveness = 0.5;

  // Voice speed is primary factor (0.75-1.25x)
  // Responsiveness adds dynamics (0 = slower, 1 = faster)
  const responsivityFactor = 0.75 + (responsiveness * 0.5); // 0.75-1.25x
  const speedFactor = voiceSpeed;

  return {
    baseMultiplier: speedFactor,
    responsivityAdjustment: responsivityFactor,
    finalMultiplier: speedFactor * responsivityFactor,
    descriptive: speedFactor > 1.1 ? 'fast' : speedFactor < 0.9 ? 'slow' : 'normal'
  };
}

/**
 * Calculate intensity (RMS energy / loudness) 0-100
 * Based on characteristics and emotions
 */
export function calculateIntensity(emotionLevel, characteristics = []) {
  if (emotionLevel === undefined) emotionLevel = 0.5;

  // Base intensity from emotion
  const emotionIntensity = 40 + (emotionLevel * 40); // 40-80 range

  // Characteristic modifiers
  const intensityModifiers = {
    'Enthusiastic': 15,
    'Energetic': 12,
    'Confident': 8,
    'Professional': 5,
    'Calm': -5,
    'Thoughtful': -3,
    'Quiet': -10
  };

  let characteristicBonus = 0;
  characteristics.forEach(char => {
    characteristicBonus += intensityModifiers[char] || 0;
  });

  const finalIntensity = Math.min(100, Math.max(0, emotionIntensity + characteristicBonus));

  return {
    level: Math.round(finalIntensity),
    emotion: emotionLevel,
    characteristics: characteristics.filter(c => intensityModifiers[c] !== undefined),
    bonus: characteristicBonus
  };
}

/**
 * Calculate interruptibility threshold
 * Higher value = more likely to be interrupted by user
 * Range: 0-1 (0 = not interruptible, 1 = highly interruptible)
 */
export function calculateInterruptibility(interruptionSensitivity) {
  if (interruptionSensitivity === undefined) interruptionSensitivity = 0.5;

  // Convert slider (0-1) to RMS energy threshold for silence detection
  // Low sensitivity (0): Only interrupt on long pauses, high threshold
  // High sensitivity (1): Interrupt on short pauses, low threshold
  const energyThreshold = 30 + (interruptionSensitivity * 60); // 30-90 range

  return {
    sensitivity: interruptionSensitivity,
    energyThreshold: Math.round(energyThreshold),
    minPauseDurationMs: Math.round(1000 - (interruptionSensitivity * 800)), // 200-1000ms
    descriptive: interruptionSensitivity > 0.7 ? 'high' : interruptionSensitivity < 0.3 ? 'low' : 'medium'
  };
}

/**
 * Calculate voice quality profile
 * Returns parameters for audio effects: eq, compression, reverb
 */
export function calculateVoiceQuality(backgroundNoise, emotionLevel, characteristics = []) {
  if (emotionLevel === undefined) emotionLevel = 0.5;

  // EQ settings by background noise environment
  const eqProfiles = {
    'quiet': {
      highCut: 12000,  // Preserve all highs
      midBuild: 1.0,   // Neutral mids
      bassBuild: 1.2,  // Slight bass boost for presence
      description: 'Clean, clear voice'
    },
    'office': {
      highCut: 8000,   // Reduce harsh highs
      midBuild: 1.2,   // Boost mids for intelligibility
      bassBuild: 0.8,  // Reduce bass to minimize rumble
      description: 'Clear with intelligibility'
    },
    'cafe': {
      highCut: 6000,   // Heavy high cut
      midBuild: 1.4,   // Strong mid boost
      bassBuild: 0.7,  // Reduce bass rumble
      description: 'Intelligible over noise'
    },
    'street': {
      highCut: 5000,   // Very aggressive high cut
      midBuild: 1.5,   // Maximum mid presence
      bassBuild: 0.6,  // Minimal bass
      description: 'Maximum intelligibility'
    },
    'call-center': {
      highCut: 7000,
      midBuild: 1.3,
      bassBuild: 0.8,
      description: 'Professional call quality'
    }
  };

  const eqProfile = eqProfiles[backgroundNoise] || eqProfiles['office'];

  // Compression based on emotion (more compression = more controlled, less emotion)
  const compressionRatio = 2 + (emotionLevel * 2); // 2:1 → 4:1 ratio
  const thresholdDb = -15 - (emotionLevel * 10); // -15dB to -25dB

  // Reverb adds warmth to emotional voices
  const reverbAmount = emotionLevel > 0.6 ? 0.2 : emotionLevel < 0.4 ? 0.05 : 0.12;

  return {
    eq: {
      ...eqProfile,
      highCutHz: eqProfile.highCut,
      midBoost: eqProfile.midBuild,
      bassBoost: eqProfile.bassBuild
    },
    compression: {
      ratio: Math.round(compressionRatio * 10) / 10,
      thresholdDb: Math.round(thresholdDb),
      makeupGainDb: 3
    },
    reverb: {
      amount: Math.round(reverbAmount * 100) / 100,
      decaySeconds: 0.5 + (reverbAmount * 1.5)
    },
    characteristics: characteristics
  };
}

/**
 * Calculate complete prosody profile for an agent
 * Combines all dimensions into actionable instructions for Gemini
 */
export function calculateProsodyProfile(agent, voiceConfig = null) {
  // Use voiceConfig if provided (test mode), otherwise use agent settings
  const emotionLevel = voiceConfig?.characteristics40?.emotions ?? agent.speechSettings?.emotions ?? 0.5;
  const voiceSpeed = voiceConfig?.speechSettings60?.voiceSpeed ?? agent.speechSettings?.voiceSpeed ?? 1.0;
  const responsiveness = voiceConfig?.speechSettings60?.responsiveness ?? agent.speechSettings?.responsiveness ?? 0.5;
  const interruptionSensitivity = agent.speechSettings?.interruptionSensitivity ?? 0.5;
  const backgroundNoise = agent.speechSettings?.backgroundNoise ?? 'office';
  const characteristics = voiceConfig?.characteristics40?.traits ?? agent.characteristics ?? [];
  const language = agent.voiceProfile?.language ?? 'en-US';

  const profile = {
    timestamp: new Date().toISOString(),
    agent: {
      id: agent._id?.toString() || 'unknown',
      name: agent.name
    },
    language,
    pitch: calculatePitch(emotionLevel, language),
    speechRate: calculateSpeechRate(voiceSpeed, responsiveness),
    intensity: calculateIntensity(emotionLevel, characteristics),
    interruptibility: calculateInterruptibility(interruptionSensitivity),
    voiceQuality: calculateVoiceQuality(backgroundNoise, emotionLevel, characteristics),
    emotions: emotionLevel,
    settings: {
      voiceSpeed,
      responsiveness,
      interruptionSensitivity,
      backgroundNoise,
      characteristics
    }
  };

  return profile;
}

/**
 * Generate prosody instructions for Gemini system prompt
 * Translates calculated prosody into natural language instructions
 */
export function generateProsodyInstructions(prosodyProfile) {
  const instructions = [];

  // Pitch instruction
  instructions.push(`Pitch Guidance: ${prosodyProfile.pitch.emotion > 0.7 ? 'Use higher pitch range for enthusiasm and engagement' : prosodyProfile.pitch.emotion < 0.3 ? 'Use lower, calm pitch for measured responses' : 'Use moderate pitch with natural variation'}.`);

  // Speech rate instruction
  const rateDesc = prosodyProfile.speechRate.descriptive;
  if (rateDesc === 'fast') {
    instructions.push('Speech Rate: Speak quickly and energetically, maintaining natural clarity.');
  } else if (rateDesc === 'slow') {
    instructions.push('Speech Rate: Speak deliberately with pauses for emphasis and clarity.');
  } else {
    instructions.push('Speech Rate: Speak at a natural, conversational pace.');
  }

  // Intensity instruction
  const intensityLevel = prosodyProfile.intensity.level;
  if (intensityLevel > 70) {
    instructions.push('Intensity: Speak with confident, powerful delivery. Project energy and conviction.');
  } else if (intensityLevel < 40) {
    instructions.push('Intensity: Speak softly and gently, with measured confidence.');
  } else {
    instructions.push('Intensity: Speak with balanced, professional clarity.');
  }

  // Interruptibility guidance
  const interruptDesc = prosodyProfile.interruptibility.descriptive;
  instructions.push(`Interruptibility: You are ${interruptDesc === 'high' ? 'highly responsive to interruptions' : interruptDesc === 'low' ? 'focused on completing thoughts before responding' : 'moderately responsive to interruptions'}.`);

  // Voice quality and characteristics
  if (prosodyProfile.settings.characteristics.length > 0) {
    instructions.push(`Voice Character: Your voice embodies these characteristics: ${prosodyProfile.settings.characteristics.join(', ')}.`);
  }

  return instructions;
}

export default {
  calculatePitch,
  calculateSpeechRate,
  calculateIntensity,
  calculateInterruptibility,
  calculateVoiceQuality,
  calculateProsodyProfile,
  generateProsodyInstructions
};
