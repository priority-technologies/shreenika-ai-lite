/**
 * Voice Agent State Machine
 *
 * STEP 3: Implements 5-state voice conversation flow
 *
 * States:
 * - IDLE: Waiting for call, no voice activity
 * - LISTENING: User is speaking, recording audio
 * - THINKING: Processing user input, generating response
 * - SPEAKING: Playing agent response to user
 * - RECOVERY: Error state, attempting to recover
 *
 * Transitions:
 * IDLE → LISTENING (user speaks / call connected)
 * LISTENING → THINKING (user stops speaking)
 * THINKING → SPEAKING (response generated)
 * SPEAKING → LISTENING (response complete)
 * ANY → RECOVERY (error detected)
 * RECOVERY → IDLE (recovery successful)
 * RECOVERY → SPEAKING (fallback response)
 */

import { EventEmitter } from 'events';

/**
 * Voice conversation states
 */
export const VoiceState = {
  IDLE: 'IDLE',           // No activity
  LISTENING: 'LISTENING', // Receiving user audio
  THINKING: 'THINKING',   // Processing user input
  SPEAKING: 'SPEAKING',   // Delivering response
  RECOVERY: 'RECOVERY'    // Error recovery
};

/**
 * Fallback responses for different contexts
 */
const FALLBACK_RESPONSES = {
  timeout: "I didn't quite catch that. Could you repeat?",
  error: "Sorry, I'm experiencing a technical issue. Please bear with me.",
  silence: "Are you still there?",
  interrupt: "Go ahead, I'm listening.",
  noInput: "Hello? I'm ready whenever you are."
};

/**
 * VoiceAgentStateMachine - Manages conversation state flow
 */
export class VoiceAgentStateMachine extends EventEmitter {
  constructor(agentConfig, voiceService = null) {
    super();

    // Agent configuration
    this.agentConfig = agentConfig;
    this.voiceService = voiceService;

    // State management
    this.currentState = VoiceState.IDLE;
    this.previousState = null;
    this.stateStartTime = Date.now();

    // Call tracking
    this.callId = null;
    this.callStartTime = null;
    this.conversationHistory = [];
    this.currentTurnNumber = 0;

    // Audio tracking
    this.userAudioChunks = [];
    this.agentResponseStartTime = null;
    this.silenceStartTime = null;

    // Timers
    this.listeningTimeout = null;
    this.thinkingTimeout = null;
    this.silenceThreshold = 2000; // 2 seconds of silence
    this.maxThinkingTime = 15000; // 15 seconds max
    this.maxListeningTime = 60000; // 60 seconds max per turn

    // Recovery state
    this.errorCount = 0;
    this.maxErrorsBeforeFail = 3;

    console.log(`🤖 VoiceAgentStateMachine initialized for agent: ${agentConfig.name}`);
  }

  /**
   * Initialize the state machine for a call
   * @param {string} callId - Unique call identifier
   */
  async initialize(callId) {
    this.callId = callId;
    this.callStartTime = Date.now();
    this.currentState = VoiceState.IDLE;
    this.conversationHistory = [];
    this.currentTurnNumber = 0;
    this.errorCount = 0;

    console.log(`📞 State Machine initialized for call: ${callId}`);
    console.log(`   ├─ Initial State: ${this.currentState}`);
    console.log(`   ├─ Agent: ${this.agentConfig.name}`);
    console.log(`   └─ Timestamp: ${new Date().toISOString()}`);

    this.emit('initialized', { callId, state: this.currentState });
  }

  /**
   * Transition to a new state with validation
   * @param {string} newState - Target state
   * @param {object} context - Transition context
   * @returns {boolean} - True if transition succeeded
   */
  transitionTo(newState, context = {}) {
    // Validate state
    if (!Object.values(VoiceState).includes(newState)) {
      console.error(`❌ Invalid state: ${newState}`);
      return false;
    }

    // Check if transition is valid
    if (!this._isValidTransition(this.currentState, newState)) {
      console.warn(`⚠️ Invalid transition: ${this.currentState} → ${newState}`);
      return false;
    }

    // Clear existing timers
    this._clearTimers();

    // Store previous state
    this.previousState = this.currentState;
    this.currentState = newState;
    this.stateStartTime = Date.now();

    const elapsed = this.stateStartTime - this.callStartTime;
    const ms = elapsed % 1000;
    const seconds = Math.floor(elapsed / 1000);

    console.log(`🔄 State transition: ${this.previousState} → ${this.currentState}`);
    console.log(`   ├─ Context: ${JSON.stringify(context)}`);
    console.log(`   └─ Call elapsed: ${seconds}s ${ms}ms`);

    // Set up state-specific behaviors
    this._handleStateEntry(newState, context);

    // Emit transition event
    this.emit('stateChanged', {
      from: this.previousState,
      to: this.currentState,
      context
    });

    return true;
  }

  /**
   * Handle state entry behaviors
   * @private
   */
  _handleStateEntry(state, context) {
    switch (state) {
      case VoiceState.IDLE:
        // Clear user audio
        this.userAudioChunks = [];
        break;

      case VoiceState.LISTENING:
        // Start listening timeout
        this.listeningTimeout = setTimeout(() => {
          console.warn(`⚠️ Listening timeout - no response detected`);
          this.transitionTo(VoiceState.THINKING, { reason: 'timeout' });
        }, this.maxListeningTime);

        // Reset silence tracking
        this.silenceStartTime = null;
        console.log(`🎤 Now listening for user input...`);
        break;

      case VoiceState.THINKING:
        // Start thinking timeout
        this.thinkingTimeout = setTimeout(() => {
          console.warn(`⚠️ Thinking timeout - no response generated`);
          this._handleThinkingTimeout();
        }, this.maxThinkingTime);

        this.currentTurnNumber++;
        console.log(`💭 Processing turn #${this.currentTurnNumber}...`);
        break;

      case VoiceState.SPEAKING:
        // Track response start time
        this.agentResponseStartTime = Date.now();
        console.log(`🗣️ Agent speaking...`);
        break;

      case VoiceState.RECOVERY:
        // Increment error count
        this.errorCount++;
        console.error(`❌ Entering RECOVERY state (error #${this.errorCount})`);

        if (this.errorCount >= this.maxErrorsBeforeFail) {
          console.error(`❌ Max errors exceeded - call will be terminated`);
          this.emit('maxErrorsReached');
        }
        break;
    }
  }

  /**
   * Detect user audio input (called from mediastream handler)
   * @param {Buffer} audioBuffer - PCM audio data
   * @param {number} energyLevel - Audio energy level (0-100)
   */
  onUserAudio(audioBuffer, energyLevel = 0) {
    // Store audio chunk for transcript
    this.userAudioChunks.push({
      timestamp: Date.now(),
      buffer: audioBuffer,
      energy: energyLevel
    });

    // Transition to LISTENING if in IDLE
    if (this.currentState === VoiceState.IDLE) {
      this.transitionTo(VoiceState.LISTENING, {
        source: 'userAudio',
        energy: energyLevel
      });
    }

    // Track silence
    if (energyLevel > 10) {
      // User is speaking
      this.silenceStartTime = null;
    } else if (energyLevel <= 10) {
      // Silence detected
      if (!this.silenceStartTime) {
        this.silenceStartTime = Date.now();
      }

      const silenceDuration = Date.now() - this.silenceStartTime;
      if (silenceDuration > this.silenceThreshold && this.currentState === VoiceState.LISTENING) {
        console.log(`🔇 Silence detected (${silenceDuration}ms) - transitioning to THINKING`);
        this.transitionTo(VoiceState.THINKING, {
          reason: 'silenceDetected',
          duration: silenceDuration
        });
      }
    }

    this.emit('userAudio', { energyLevel, chunks: this.userAudioChunks.length });
  }

  /**
   * Notify state machine that Gemini response started
   */
  onGeminiResponseStart() {
    if (this.currentState === VoiceState.THINKING) {
      this.transitionTo(VoiceState.SPEAKING, {
        source: 'geminiResponse'
      });
    }
  }

  /**
   * Notify state machine that Gemini response completed
   */
  onGeminiResponseComplete(responseText) {
    if (this.currentState === VoiceState.SPEAKING) {
      // Store in conversation history
      this.conversationHistory.push({
        turn: this.currentTurnNumber,
        agentResponse: responseText,
        timestamp: Date.now()
      });

      // Transition back to LISTENING for next turn
      this.transitionTo(VoiceState.LISTENING, {
        source: 'responseComplete',
        responseLength: responseText.length
      });
    }
  }

  /**
   * Handle error - transition to RECOVERY
   * @param {Error} error - Error object
   */
  onError(error) {
    console.error(`❌ Error detected in state ${this.currentState}:`, error.message);

    if (this.currentState !== VoiceState.RECOVERY) {
      this.transitionTo(VoiceState.RECOVERY, {
        error: error.message,
        previousState: this.currentState
      });
    }
  }

  /**
   * Attempt recovery from error state
   * @returns {boolean} - True if recovery successful
   */
  attemptRecovery() {
    console.log(`🔧 Attempting recovery from error...`);

    if (this.errorCount >= this.maxErrorsBeforeFail) {
      console.error(`❌ Too many errors - cannot recover`);
      return false;
    }

    // Try fallback response
    const fallback = FALLBACK_RESPONSES.error;
    console.log(`🗣️ Playing fallback response: "${fallback}"`);

    // Transition to SPEAKING with fallback
    this.transitionTo(VoiceState.SPEAKING, {
      source: 'recovery',
      fallbackResponse: fallback
    });

    return true;
  }

  /**
   * Check if transition is valid
   * @private
   */
  _isValidTransition(from, to) {
    const validTransitions = {
      [VoiceState.IDLE]: [VoiceState.LISTENING, VoiceState.RECOVERY],
      [VoiceState.LISTENING]: [VoiceState.THINKING, VoiceState.RECOVERY],
      [VoiceState.THINKING]: [VoiceState.SPEAKING, VoiceState.RECOVERY],
      [VoiceState.SPEAKING]: [VoiceState.LISTENING, VoiceState.RECOVERY],
      [VoiceState.RECOVERY]: [VoiceState.SPEAKING, VoiceState.IDLE, VoiceState.LISTENING]
    };

    return (validTransitions[from] || []).includes(to);
  }

  /**
   * Handle thinking timeout
   * @private
   */
  _handleThinkingTimeout() {
    console.warn(`⚠️ Thinking timeout - no response generated in ${this.maxThinkingTime}ms`);

    if (this.attemptRecovery()) {
      // Recovery started
    } else {
      // Recovery failed
      this.emit('thinkingTimeout');
    }
  }

  /**
   * Clear all timers
   * @private
   */
  _clearTimers() {
    if (this.listeningTimeout) clearTimeout(this.listeningTimeout);
    if (this.thinkingTimeout) clearTimeout(this.thinkingTimeout);
  }

  /**
   * Get current state information
   * @returns {object}
   */
  getStateInfo() {
    const elapsed = Date.now() - this.stateStartTime;
    return {
      currentState: this.currentState,
      previousState: this.previousState,
      callId: this.callId,
      elapsedMs: elapsed,
      turnNumber: this.currentTurnNumber,
      errorCount: this.errorCount,
      historyLength: this.conversationHistory.length,
      audioChunks: this.userAudioChunks.length
    };
  }

  /**
   * Get conversation summary
   * @returns {object}
   */
  getSummary() {
    const totalDuration = Date.now() - this.callStartTime;
    const totalTurns = this.currentTurnNumber;
    const avgTurnDuration = totalTurns > 0 ? totalDuration / totalTurns : 0;

    return {
      callId: this.callId,
      totalDuration: totalDuration,
      totalTurns: totalTurns,
      avgTurnDuration: Math.round(avgTurnDuration),
      finalState: this.currentState,
      errorCount: this.errorCount,
      conversationLength: this.conversationHistory.length,
      success: this.errorCount < this.maxErrorsBeforeFail
    };
  }

  /**
   * Close and cleanup
   */
  close() {
    this._clearTimers();
    const summary = this.getSummary();
    console.log(`\n📊 CALL SUMMARY:`);
    console.log(`   ├─ Total Duration: ${summary.totalDuration}ms`);
    console.log(`   ├─ Turns: ${summary.totalTurns}`);
    console.log(`   ├─ Avg Turn Time: ${summary.avgTurnDuration}ms`);
    console.log(`   ├─ Errors: ${summary.errorCount}`);
    console.log(`   └─ Final State: ${summary.finalState}\n`);

    this.emit('closed', summary);
  }
}

export default VoiceAgentStateMachine;
