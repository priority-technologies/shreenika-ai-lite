/**
 * State Machine Controller
 *
 * Integrates xstate machine with VoiceService.
 * Acts as the bridge between audio events and state transitions.
 */

import { interpret } from 'xstate';
import voiceCallMachine from './voice-call.machine.js';
import { EventEmitter } from 'events';

export class StateMachineController extends EventEmitter {
  constructor(callId, agentId, voiceService, config = {}) {
    super();

    this.callId = callId;
    this.agentId = agentId;
    this.voiceService = voiceService;
    this.config = config;

    // Create machine instance (already has config from import)
    this.machine = voiceCallMachine;

    // Create interpreter (state machine executor)
    this.interpreter = interpret(this.machine);

    // Setup event handlers using subscribe (xstate v5 API)
    this.subscription = this.interpreter.subscribe((snapshot) => {
      this.currentState = snapshot;
      console.log(`🎯 [SM] State: ${snapshot.value}`);
      this.emit('stateChange', {
        state: snapshot.value,
        context: snapshot.context
      });

      if (snapshot.error) {
        console.error(`❌ [SM] Machine error:`, snapshot.error);
        this.emit('error', snapshot.error);
      }
    });
  }

  /**
   * Start the state machine
   */
  start(initialContext = {}) {
    console.log(`🚀 [SM] Starting state machine for call: ${this.callId}`);

    // Merge initial context
    const context = {
      ...this.interpreter.getSnapshot().context,
      ...initialContext,
      voiceService: this.voiceService,
      callId: this.callId,
      agentId: this.agentId
    };

    // Start with merged context
    this.interpreter.start({
      ...this.interpreter.getSnapshot(),
      context
    });

    // Send SETUP_COMPLETE event after machine starts
    setTimeout(() => {
      this.send('SETUP_COMPLETE', {
        success: true,
        callId: this.callId,
        agentId: this.agentId
      });
    }, 100);
  }

  /**
   * Send event to state machine
   */
  send(eventType, eventData = {}) {
    const event = {
      type: eventType,
      ...eventData
    };

    console.log(`📨 [SM] Sending event: ${eventType}`);
    this.interpreter.send(event);
  }

  /**
   * Audio chunk received from Twilio/SansPBX
   */
  onAudioChunk(audioChunk) {
    this.send('AUDIO_CHUNK', { audioChunk });
  }

  /**
   * Silence detected (800ms+)
   */
  onSilenceDetected(silenceDuration = 800) {
    this.send('SILENCE_DETECTED', { silenceDuration });
  }

  /**
   * Human audio input detected
   */
  onHumanAudioDetected(audioChunk) {
    this.send('HUMAN_AUDIO_DETECTED', { audioChunk });
  }

  /**
   * Gemini response received
   */
  onGeminiResponseReceived(audio) {
    this.send('GEMINI_RESPONSE_RECEIVED', { audio });
  }

  /**
   * Gemini finished speaking
   */
  onGeminiFinished() {
    this.send('GEMINI_FINISHED');
  }

  /**
   * Welcome message finished
   */
  onWelcomeFinished() {
    this.send('WELCOME_FINISHED');
  }

  /**
   * Interruption detected
   */
  onInterruptionDetected(audioChunk) {
    this.send('INTERRUPTION_DETECTED', { audioChunk });
  }

  /**
   * Gemini error occurred
   */
  onGeminiError(error) {
    this.send('GEMINI_ERROR', { error });
  }

  /**
   * Call timeout
   */
  onCallTimeout() {
    this.send('CALL_TIMEOUT');
  }

  /**
   * Manual hangup
   */
  onManualHangup() {
    this.send('MANUAL_HANGUP');
  }

  /**
   * Check call status and decide next state
   */
  checkCallStatus() {
    this.send('CHECK_CALL_STATUS');
  }

  /**
   * Get current state snapshot
   */
  getState() {
    return this.interpreter.getSnapshot();
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const state = this.getState();
    return state.context.metrics;
  }

  /**
   * Stop the state machine
   */
  stop() {
    console.log(`🛑 [SM] Stopping state machine`);
    this.interpreter.stop();
  }

  /**
   * Check if machine is in specific state
   */
  isInState(stateName) {
    const state = this.getState();
    return state.value === stateName;
  }

  /**
   * Log current state and context
   */
  logState() {
    const state = this.getState();
    console.log('=== STATE MACHINE SNAPSHOT ===');
    console.log(`Current State: ${state.value}`);
    console.log(`Call ID: ${state.context.callId}`);
    console.log(`Duration: ${state.context.callDuration.toFixed(2)}s`);
    console.log(`Sentiment: ${state.context.currentSentiment?.level || 'N/A'}`);
    console.log(`Interruptions: ${state.context.metrics.interruptionsCount}`);
    console.log(`Error Count: ${state.context.errorCount}`);
    console.log('==============================');
  }
}

export default StateMachineController;
