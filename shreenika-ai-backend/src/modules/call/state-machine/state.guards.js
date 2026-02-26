/**
 * State Machine Guards
 *
 * Boolean conditions that determine if state transitions should occur.
 * Guards prevent invalid transitions.
 */

// ========== INIT GUARDS ==========
export const setupSuccessful = (context, event) => {
  return event.success === true && context.geminiSession !== null;
};

// ========== LISTENING GUARDS ==========
export const hasAudio = (context, event) => {
  return event.audioChunk && event.audioChunk.length > 0;
};

// ========== HUMAN_SPEAKING GUARDS ==========
/**
 * Check if silence threshold has been met
 * Human audio silence > 800ms indicates speech finished
 */
export const silenceThresholdMet = (context, event) => {
  if (!event.silenceDuration) return false;
  return event.silenceDuration > 800; // 800ms = speech finished
};

// ========== PROCESSING_REQUEST GUARDS ==========
export const hasGeminiAudio = (context, event) => {
  return event.audio && event.audio.length > 0;
};

// ========== RESPONDING GUARDS ==========
/**
 * Determine if Gemini should be interrupted based on:
 * 1. Interruption sensitivity setting (0-1.0)
 * 2. Incoming audio level (RMS calculation)
 * 3. Confidence in voice detection
 *
 * Decision matrix:
 * - HIGH (0.8+): Stop on ANY audio above threshold
 * - NORMAL (0.4-0.8): Stop only on confident voice detection
 * - LOW (<0.4): Only stop on very loud/forceful interruption
 */
export const shouldInterruptGemini = (context, event) => {
  if (!event.audioChunk || event.audioChunk.length === 0) {
    return false; // No audio, don't interrupt
  }

  // Calculate RMS (Root Mean Square) to detect voice activity
  let sumSquares = 0;
  const samples = event.audioChunk.length / 2; // 16-bit = 2 bytes

  for (let i = 0; i < samples; i++) {
    const sample = event.audioChunk.readInt16LE(i * 2) / 32768.0;
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / samples);
  const SILENCE_THRESHOLD = 0.008;
  const LOUD_THRESHOLD = 0.05;

  const sensitivity = context.interruptionSensitivity || 0.5;

  // HIGH Sensitivity (0.8+): Stop on any voice
  if (sensitivity >= 0.8) {
    const isHumanSpeaking = rms > SILENCE_THRESHOLD;
    if (isHumanSpeaking) {
      console.log(`🔴 HIGH sensitivity: Interruption accepted (RMS: ${rms.toFixed(4)})`);
      return true;
    }
    return false;
  }

  // NORMAL Sensitivity (0.4-0.8): Stop on confident speech
  if (sensitivity >= 0.4 && sensitivity < 0.8) {
    const isHumanSpeaking = rms > SILENCE_THRESHOLD;
    if (!isHumanSpeaking) {
      return false; // Background noise, don't interrupt
    }

    // Check confidence (for normal sensitivity, require stronger signal)
    const confidence = Math.min(rms / LOUD_THRESHOLD, 1.0);
    const shouldInterrupt = confidence > 0.7;

    if (shouldInterrupt) {
      console.log(`🟡 NORMAL sensitivity: Interruption accepted (RMS: ${rms.toFixed(4)}, Confidence: ${confidence.toFixed(2)})`);
    } else {
      console.log(`🟡 NORMAL sensitivity: Low confidence, continuing (RMS: ${rms.toFixed(4)}, Confidence: ${confidence.toFixed(2)})`);
    }

    return shouldInterrupt;
  }

  // LOW Sensitivity (<0.4): Only stop on very loud interruption
  const isVeryLoud = rms > LOUD_THRESHOLD;
  if (isVeryLoud) {
    console.log(`🟢 LOW sensitivity: Only forceful interruption accepted (RMS: ${rms.toFixed(4)})`);
    return true;
  }

  return false;
};

// ========== RESPONSE_COMPLETE GUARDS ==========
/**
 * Check if maximum call duration has been exceeded
 */
export const maxDurationExceeded = (context) => {
  if (!context.callStartTime) return false;
  const elapsed = (Date.now() - context.callStartTime) / 1000;
  return elapsed > context.maxCallDuration;
};

/**
 * Check if end-on-silence condition has been triggered
 * Silence > endOnSilenceDuration without any audio input
 */
export const endOnSilenceTriggered = (context, event) => {
  if (!context.lastAudioTime) return false;
  const silenceDuration = Date.now() - context.lastAudioTime;
  return silenceDuration > context.endOnSilenceDuration;
};

// Export all guards as object for xstate config
export const stateGuards = {
  setupSuccessful,
  hasAudio,
  silenceThresholdMet,
  hasGeminiAudio,
  shouldInterruptGemini,
  maxDurationExceeded,
  endOnSilenceTriggered
};

export default stateGuards;
