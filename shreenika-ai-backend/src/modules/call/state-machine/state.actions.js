/**
 * State Machine Actions
 *
 * All actions that execute when entering/exiting states or on transitions.
 * Actions are side-effect operations (logging, I/O, etc.)
 */

import { assign } from 'xstate';

// ========== LOGGING ACTIONS ==========
export const logStateEntry = (context, event) => {
  console.log(`✅ Entering state`);
};

export const logTransition = (context, event) => {
  console.log(`➡️ State transition triggered: ${event?.type || 'UNKNOWN'}`);
};

export const logError = (context, event) => {
  const error = event?.error || 'Unknown error';
  console.error(`❌ Error: ${error}`);
};

export const incrementErrorCount = assign((context, event) => ({
  errorCount: context.errorCount + 1,
  lastError: event?.error || null
}));

// ========== INIT STATE ACTIONS ==========
export const initializeCallContext = assign((context, event) => ({
  callStartTime: Date.now(),
  callId: event?.callId || context.callId || null,
  agentId: event?.agentId || context.agentId || null,
  leadPhone: event?.leadPhone || context.leadPhone || null,
  leadName: event?.leadName || context.leadName || null,
  interruptionSensitivity: event?.interruptionSensitivity ?? context.interruptionSensitivity ?? 0.5,
  maxCallDuration: event?.maxCallDuration || context.maxCallDuration || 600,
  voiceService: event?.voiceService || context.voiceService || null,
  geminiSession: event?.geminiSession || context.geminiSession || null,
  voiceConfig: event?.voiceConfig || context.voiceConfig || null,
  agentConfig: event?.agentConfig || context.agentConfig || null
}));

export const logSetupTimeout = (context) => {
  console.warn('⏱️ Setup timeout: Gemini session initialization took > 10 seconds');
};

// ========== WELCOME STATE ACTIONS ==========
export const playWelcomeMessage = (context) => {
  if (context.voiceService && context.welcomeMessage) {
    console.log(`👋 Playing welcome message: "${context.welcomeMessage.substring(0, 50)}..."`);
    context.voiceService.emit('playWelcome', context.welcomeMessage);
  }
};

export const logWelcomeTimeout = (context) => {
  console.log(`⏱️ Welcome message timeout: Moving to LISTENING after 5s`);
};

// ========== LISTENING STATE ACTIONS ==========
export const resetAudioBuffer = assign((context) => ({
  humanAudioBuffer: [],
  lastAudioTime: Date.now()
}));

export const startAudioCapture = (context) => {
  console.log(`🎤 Audio capture started - listening for human input`);
};

// ========== HUMAN_SPEAKING STATE ACTIONS ==========
export const startRecordingAudio = (context) => {
  console.log(`🔴 Recording human audio...`);
};

export const addAudioChunk = assign((context, event) => ({
  humanAudioBuffer: [
    ...context.humanAudioBuffer,
    ...(event?.audioChunk || [])
  ],
  metrics: {
    ...context.metrics,
    totalChunksSent: context.metrics.totalChunksSent + 1
  }
}));

export const updateLastAudioTime = assign((context) => ({
  lastAudioTime: Date.now()
}));

export const stopRecordingAudio = (context) => {
  console.log(`⏹️ Recording stopped - analyzing audio`);
};

export const analyzeSentimentAndObjection = assign({
  currentSentiment: async (context, event) => {
    // This will be populated by external sentiment analyzer
    // For now, placeholder
    return event.sentiment || { level: 'NEUTRAL', score: 0 };
  },
  detectedObjection: async (context, event) => {
    // This will be populated by external objection detector
    return event.objection || null;
  }
});

export const selectPsychologicalPrinciples = assign({
  selectedPrinciples: async (context, event) => {
    // This will be populated by principle selector based on sentiment
    const principles = [];

    if (context.currentSentiment?.level === 'NEGATIVE') {
      principles.push('RECIPROCITY', 'AUTHORITY');
    } else if (context.detectedObjection === 'PRICE') {
      principles.push('ANCHORING', 'SCARCITY');
    } else if (context.detectedObjection === 'TRUST') {
      principles.push('AUTHORITY', 'SOCIAL_PROOF');
    } else if (context.currentSentiment?.level === 'POSITIVE') {
      principles.push('COMMITMENT');
    } else {
      principles.push('DECOY_EFFECT');
    }

    console.log(`💡 Principles selected: ${principles.join(', ')}`);
    return principles;
  },
  'metrics.principlesApplied': (context, event) => [
    ...context.metrics.principlesApplied,
    ...context.selectedPrinciples
  ]
});

// ========== PROCESSING_REQUEST STATE ACTIONS ==========
export const sendAudioToGemini = (context, event) => {
  if (context.voiceService && context.geminiSession) {
    console.log(`📤 Sending audio to Gemini (${context.humanAudioBuffer.length} chunks)`);
    context.voiceService.sendAudio(Buffer.concat(context.humanAudioBuffer));
  }
};

export const startFiller = async (context) => {
  if (context.voiceService && !context.fillerPlaying) {
    console.log(`🔊 Filler playback started`);
    context.voiceService.emit('startFiller');
  }
};

export const recordFillerStartTime = assign((context) => ({
  fillerStartTime: Date.now()
}));

export const stopFiller = (context) => {
  if (context.voiceService) {
    console.log(`⏹️ Filler stopped`);
    context.voiceService.emit('stopFiller');
  }
};

export const calculateFillerDuration = assign((context) => ({
  metrics: {
    ...context.metrics,
    fillerDurationMs: context.fillerStartTime ? Date.now() - context.fillerStartTime : 0
  }
}));

export const injectPrinciples = (context) => {
  if (context.voiceService && context.selectedPrinciples.length > 0) {
    console.log(`💉 Injecting principles to Gemini: ${context.selectedPrinciples.join(', ')}`);
    context.voiceService.emit('injectPrinciples', context.selectedPrinciples);
  }
};

export const logGeminiError = (context, event) => {
  console.error(`❌ Gemini error: ${event.error?.message || 'Unknown error'}`);
};

export const logGeminiTimeout = (context) => {
  console.warn(`⏱️ Gemini response timeout after 15 seconds, returning to LISTENING`);
};

// ========== RESPONDING STATE ACTIONS ==========
export const playGeminiAudio = (context) => {
  if (context.voiceService) {
    console.log(`🎧 Gemini audio playback started`);
  }
};

export const recordResponsingStartTime = assign((context) => ({
  respondingStartTime: Date.now()
}));

export const stopGemini = (context) => {
  if (context.voiceService && context.geminiSession) {
    console.log(`🛑 Stopping Gemini due to interruption`);
    context.voiceService.emit('stopGemini');
  }
};

export const logInterruptionDetected = (context, event) => {
  console.log(`🤚 Interruption detected - Gemini will stop`);
};

export const incrementInterruptionCount = assign((context) => ({
  metrics: {
    ...context.metrics,
    interruptionsCount: context.metrics.interruptionsCount + 1
  }
}));

// ========== RESPONSE_COMPLETE STATE ACTIONS ==========
export const stopAllAudio = (context) => {
  if (context.voiceService) {
    console.log(`🛑 Stopping all audio output`);
    context.voiceService.emit('stopAllAudio');
  }
};

export const updateMetrics = assign((context) => ({
  callDuration: context.callStartTime ? (Date.now() - context.callStartTime) / 1000 : 0,
  metrics: {
    ...context.metrics,
    geminiDurationMs: context.respondingStartTime ? Date.now() - context.respondingStartTime : 0
  }
}));

export const logMaxDurationReached = (context) => {
  console.log(`📊 Max call duration (${context.maxCallDuration}s) reached`);
};

export const logEndOnSilenceTriggered = (context) => {
  console.log(`🤐 End on silence triggered: Silence detected for ${context.endOnSilenceDuration}ms`);
};

export const logReturningToListening = (context) => {
  console.log(`👂 Response complete, returning to LISTENING state`);
};

// ========== CALL_ENDING STATE ACTIONS ==========
export const closeGeminiSession = (context) => {
  if (context.voiceService && context.geminiSession) {
    console.log(`🔌 Closing Gemini session`);
    context.voiceService.emit('closeGemini');
  }
};

export const logFinalMetrics = (context) => {
  console.log(`📊 ========== FINAL CALL METRICS ==========`);
  console.log(`   Call Duration: ${context.callDuration.toFixed(2)}s`);
  console.log(`   Filler Duration: ${context.metrics.fillerDurationMs}ms`);
  console.log(`   Gemini Duration: ${context.metrics.geminiDurationMs}ms`);
  console.log(`   Interruptions: ${context.metrics.interruptionsCount}`);
  console.log(`   Sentiment: ${context.currentSentiment?.level || 'N/A'}`);
  console.log(`   Principles Applied: ${context.metrics.principlesApplied.join(', ') || 'None'}`);
  console.log(`   Cache Hit: ${context.metrics.cacheHit}`);
  console.log(`========================================`);
};

export const saveCallRecord = async (context) => {
  if (!context.voiceService) return;

  const callRecord = {
    callId: context.callId,
    agentId: context.agentId,
    leadPhone: context.leadPhone,
    leadName: context.leadName,
    duration: context.callDuration,
    fillerDurationMs: context.metrics.fillerDurationMs,
    geminiDurationMs: context.metrics.geminiDurationMs,
    interruptionsCount: context.metrics.interruptionsCount,
    sentiment: context.currentSentiment?.level || 'UNKNOWN',
    detectedObjection: context.detectedObjection,
    principlesApplied: context.metrics.principlesApplied,
    cacheHit: context.metrics.cacheHit,
    errorCount: context.errorCount,
    timestamp: new Date()
  };

  console.log(`💾 Saving call record for call: ${context.callId}`);
  context.voiceService.emit('saveCallRecord', callRecord);
};

export const cleanup = (context) => {
  console.log(`🧹 Call ended, cleaning up resources`);
};

// ========== TIMEOUT LOGGING ==========
export const logTimeoutReason = (context) => {
  console.log(`⏱️ Call timeout: Max duration exceeded`);
};

export const logManualHangup = (context) => {
  console.log(`📱 Manual hangup triggered`);
};

export const logMaxSpeakingDuration = (context) => {
  console.log(`⏱️ Max speaking duration (30s) reached`);
};

export const logResponsingTimeout = (context) => {
  console.log(`⏱️ Responding timeout after 60 seconds`);
};

// Export all actions as object for xstate config
export const stateActions = {
  logStateEntry,
  logTransition,
  logError,
  incrementErrorCount,
  initializeCallContext,
  logSetupTimeout,
  playWelcomeMessage,
  logWelcomeTimeout,
  resetAudioBuffer,
  startAudioCapture,
  startRecordingAudio,
  addAudioChunk,
  updateLastAudioTime,
  stopRecordingAudio,
  analyzeSentimentAndObjection,
  selectPsychologicalPrinciples,
  sendAudioToGemini,
  startFiller,
  recordFillerStartTime,
  stopFiller,
  calculateFillerDuration,
  injectPrinciples,
  logGeminiError,
  logGeminiTimeout,
  playGeminiAudio,
  recordResponsingStartTime,
  stopGemini,
  logInterruptionDetected,
  incrementInterruptionCount,
  stopAllAudio,
  updateMetrics,
  logMaxDurationReached,
  logEndOnSilenceTriggered,
  logReturningToListening,
  closeGeminiSession,
  logFinalMetrics,
  saveCallRecord,
  cleanup,
  logTimeoutReason,
  logManualHangup,
  logMaxSpeakingDuration,
  logResponsingTimeout
};

export default stateActions;
