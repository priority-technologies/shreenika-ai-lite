/**
 * VoiceAgentStateMachine.js
 * ============================================================
 * Core 5-State Machine for Voice AI Sales Agent
 * States: IDLE → LISTENING → THINKING → SPEAKING → RECOVERY
 *
 * Based on: SMART_AGENT_BLUEPRINT.md (Version 2.0)
 * Author: Claude Code
 * Date: 2026-02-23
 */

const ConversationAnalyzer = require('../intelligence/ConversationAnalyzer');
const PrincipleDecisionEngine = require('../intelligence/PrincipleDecisionEngine');
const HedgeEngineV2 = require('../intelligence/HedgeEngineV2');

class VoiceAgentStateMachine {
  constructor(agentConfig, geminiClient) {
    // ============================================================
    // STATE: IDLE (initialization)
    // ============================================================
    this.currentState = 'IDLE';
    this.agentConfig = agentConfig;
    this.geminiClient = geminiClient;

    // Conversation tracking
    this.conversationHistory = [];
    this.currentTurnNumber = 0;
    this.usedFillers = [];

    // Call metadata
    this.callStartTime = null;
    this.callId = null;
    this.currentAnalysis = null;
    this.currentPrinciple = null;

    // Audio buffers
    this.audioBuffer = [];
    this.isCollectingAudio = false;

    // State transition tracking
    this.stateLog = [];

    // Initialize subsystems
    this.conversationAnalyzer = new ConversationAnalyzer();
    this.principleEngine = new PrincipleDecisionEngine();
    this.hedgeEngine = new HedgeEngineV2();

    // Timers
    this.llmTimeout = null;
    this.vadTimeout = null;

    // Recovery state tracking
    this.pendingLLMResponse = null;
    this.fillerInProgress = null;
  }

  // ============================================================
  // INITIALIZATION (IDLE STATE)
  // ============================================================
  async initialize(callId) {
    this.callId = callId;
    this.currentState = 'IDLE';
    this.callStartTime = new Date();

    console.log(`\n🎯 [${this.callId}] Initializing Agent: ${this.agentConfig.agentName}`);

    try {
      // Pre-warm Gemini session
      console.log(`⏳ Pre-warming Gemini Live session...`);
      await this.geminiClient.connect(this.callId, this.agentConfig);

      // Load filler metadata index
      console.log(`⏳ Loading filler metadata index...`);
      await this.hedgeEngine.loadFillerIndex();

      // Verify agent config
      this._validateConfig(this.agentConfig);

      // Log initialization
      console.log(`✅ Agent initialized successfully`);
      console.log(`   - Name: ${this.agentConfig.agentName}`);
      console.log(`   - Role: ${this.agentConfig.primaryObjective}`);
      console.log(`   - Language: ${this.agentConfig.primaryLanguage}`);
      console.log(`   - Fillers loaded: ${this.hedgeEngine.fillers.length}`);

      this._logStateTransition('INITIALIZATION', 'IDLE', 'N/A', 'Agent ready');

    } catch (error) {
      console.error(`❌ Initialization failed: ${error.message}`);
      throw error;
    }
  }

  // ============================================================
  // STATE 1: LISTENING (Perception)
  // ============================================================
  startListening() {
    this.currentState = 'LISTENING';
    this.audioBuffer = [];
    this.isCollectingAudio = true;

    console.log(`\n📢 [${this.callId}] STATE: LISTENING - Agent is silent, listening for user input`);
    this._logStateTransition('LISTENING', 'START', this.currentTurnNumber, 'Audio collection started');
  }

  /**
   * Process incoming audio chunk
   * @param {Buffer} audioData - 16-bit PCM audio at 16kHz
   */
  onAudioChunk(audioData) {
    if (this.currentState !== 'LISTENING') {
      return; // Ignore audio if not listening
    }

    this.audioBuffer.push(audioData);
  }

  /**
   * Detect end of user speech (VAD > 500ms)
   * Triggers transition to THINKING
   */
  onSilenceDetected() {
    if (this.currentState !== 'LISTENING') {
      return;
    }

    console.log(`🔇 [${this.callId}] VAD: Silence >500ms detected - User finished speaking`);
    this._logStateTransition('LISTENING', 'SILENCE_DETECTED', this.currentTurnNumber, 'VAD >500ms');

    // Transition to THINKING
    this.transitionToThinking();
  }

  /**
   * Handle user interruption during SPEAKING state
   * Immediately stop agent audio and return to LISTENING
   */
  onUserInterruption() {
    if (this.currentState !== 'SPEAKING') {
      return;
    }

    console.log(`⚡ [${this.callId}] INTERRUPTION: User spoke while agent was speaking`);
    this._logStateTransition('SPEAKING', 'INTERRUPT_DETECTED', this.currentTurnNumber, 'Immediate transition to LISTENING');

    // Stop audio playback immediately
    this.geminiClient.stopAudio();

    // Clear filler if playing
    if (this.fillerInProgress) {
      this.fillerInProgress.stop();
      this.fillerInProgress = null;
    }

    // Return to LISTENING
    this.startListening();
  }

  // ============================================================
  // STATE 2: THINKING (Reasoning & Parallel Processing)
  // ============================================================
  async transitionToThinking() {
    this.currentState = 'THINKING';
    this.currentTurnNumber++;

    console.log(`\n🧠 [${this.callId}] STATE: THINKING (Turn ${this.currentTurnNumber})`);
    this._logStateTransition('THINKING', 'START', this.currentTurnNumber, 'Processing user input');

    try {
      // Step 1: Get transcript from audio buffer
      console.log(`📝 Transcribing audio (${this.audioBuffer.length} chunks)...`);
      const userTranscript = await this._transcribeAudio(this.audioBuffer);
      console.log(`   → User: "${userTranscript.substring(0, 100)}..."`);

      // Step 2: PARALLEL PROCESSING (3 parallel processes)
      console.log(`🔄 Running parallel analysis...`);

      const [analysis, principle, selectedFiller] = await Promise.all([
        // Process 1: Conversation Analysis
        this.conversationAnalyzer.analyze({
          transcript: userTranscript,
          history: this.conversationHistory,
          agentProfile: this.agentConfig
        }),

        // Process 2: Principle Selection (depends on analysis - so we'll do this sequentially after)
        Promise.resolve(null), // Placeholder

        // Process 3: Filler Preparation (depends on analysis - so we'll do this sequentially after)
        Promise.resolve(null)  // Placeholder
      ]);

      // Store analysis for this turn
      this.currentAnalysis = analysis;

      console.log(`   ✓ Stage: ${analysis.stage}`);
      console.log(`   ✓ Profile: ${analysis.profile}`);
      console.log(`   ✓ Language: ${analysis.language}`);
      console.log(`   ✓ Objections: ${analysis.objections.length > 0 ? analysis.objections.join(', ') : 'None'}`);

      // Now select principle (depends on analysis)
      this.currentPrinciple = this.principleEngine.selectPrinciple({
        stage: analysis.stage,
        profile: analysis.profile,
        objections: analysis.objections,
        turnNumber: this.currentTurnNumber
      });

      console.log(`   ✓ Principle: ${this.currentPrinciple}`);

      // Now select filler (depends on analysis and principle)
      const filler = this.hedgeEngine.selectFiller({
        language: analysis.language,
        principle: this.currentPrinciple,
        profile: analysis.profile,
        usedFillers: this.usedFillers
      });

      console.log(`   ✓ Filler: ${filler.filename} (${filler.duration}s)`);

      // Update conversation history
      this.conversationHistory.push({
        turnNumber: this.currentTurnNumber,
        userMessage: userTranscript,
        timestamp: new Date(),
        stage: analysis.stage,
        profile: analysis.profile,
        principle: this.currentPrinciple,
        objections: analysis.objections,
        language: analysis.language,
        sentiment: analysis.sentiment
      });

      // Step 3: Set LLM timeout (3 seconds)
      const llmTimeoutPromise = new Promise(resolve => {
        this.llmTimeout = setTimeout(() => {
          console.log(`⏱️  [${this.callId}] LLM TIMEOUT (3s) - Transitioning to RECOVERY`);
          this.transitionToRecovery(filler);
          resolve();
        }, 3000);
      });

      // Step 4: Send to Gemini Live (streaming)
      console.log(`📡 Sending to Gemini Live...`);
      const llmPromise = this.geminiClient.sendMessage({
        transcript: userTranscript,
        history: this.conversationHistory,
        principle: this.currentPrinciple,
        agentConfig: this.agentConfig,
        streaming: true // CRITICAL: Stream first token ASAP
      });

      // Race: LLM response vs timeout
      const result = await Promise.race([llmPromise, llmTimeoutPromise]);

      // If we got here, LLM responded before timeout
      if (this.llmTimeout) {
        clearTimeout(this.llmTimeout);
      }

      if (result && result.audioStream) {
        console.log(`✅ LLM Response received`);
        this.transitionToSpeaking(result.audioStream);
      }

    } catch (error) {
      console.error(`❌ THINKING state error: ${error.message}`);
      this.transitionToRecovery(null);
    }
  }

  // ============================================================
  // STATE 3: SPEAKING (Audio Playback with Interruption Monitoring)
  // ============================================================
  async transitionToSpeaking(audioStream) {
    this.currentState = 'SPEAKING';

    console.log(`\n🔊 [${this.callId}] STATE: SPEAKING - Playing LLM response`);
    this._logStateTransition('SPEAKING', 'START', this.currentTurnNumber, 'Audio playback started');

    try {
      // Store in history
      const lastTurn = this.conversationHistory[this.conversationHistory.length - 1];
      lastTurn.agentResponse = '(audio stream)'; // Placeholder

      // Start playing audio
      // Note: Interruption monitoring happens in parallel
      console.log(`▶️  Playing audio stream...`);

      await this.geminiClient.playAudio(audioStream, {
        onInterruption: () => this.onUserInterruption(),
        callId: this.callId
      });

      console.log(`✅ Audio playback complete`);
      this._logStateTransition('SPEAKING', 'COMPLETE', this.currentTurnNumber, 'Audio finished');

      // Transition back to LISTENING for next turn
      this.startListening();

    } catch (error) {
      console.error(`❌ SPEAKING state error: ${error.message}`);
      this.startListening();
    }
  }

  // ============================================================
  // STATE 4: RECOVERY (Error Handling - LLM Timeout/Failure)
  // ============================================================
  async transitionToRecovery(filler) {
    this.currentState = 'RECOVERY';

    console.log(`\n🔄 [${this.callId}] STATE: RECOVERY - Playing intelligent filler`);
    this._logStateTransition('RECOVERY', 'START', this.currentTurnNumber, 'LLM timeout or error');

    try {
      if (!filler) {
        console.warn(`⚠️  No filler available, asking user to continue...`);
        const fallbackResponse = "I'm having trouble hearing you clearly. Could you repeat that?";
        this.pendingLLMResponse = { audioStream: fallbackResponse };
      } else {
        // Load and play filler audio
        console.log(`▶️  Playing filler: ${filler.filename}`);
        const fillerAudio = await this.hedgeEngine.loadFillerAudio(filler);

        this.fillerInProgress = this.geminiClient.createAudioPlayer();
        await this.fillerInProgress.play(fillerAudio.audioData);

        // Track filler usage
        this.usedFillers.push(filler.filename);

        // Log filler usage
        console.log(`📊 Filler played: ${filler.filename}`);
        this._logStateTransition('RECOVERY', 'FILLER_PLAYED', this.currentTurnNumber, `Filler: ${filler.filename}`);
      }

      // Retry LLM in background while filler plays
      console.log(`🔄 Retrying LLM call in background...`);

      const retryPromise = this.geminiClient.sendMessage({
        transcript: this.conversationHistory[this.conversationHistory.length - 1].userMessage,
        history: this.conversationHistory,
        principle: this.currentPrinciple,
        agentConfig: this.agentConfig,
        streaming: true
      });

      try {
        const retryResult = await Promise.race([
          retryPromise,
          new Promise(resolve => setTimeout(() => resolve(null), 2000)) // 2s timeout for retry
        ]);

        if (retryResult && retryResult.audioStream) {
          console.log(`✅ LLM response received during filler`);
          this.pendingLLMResponse = retryResult;
        }
      } catch (retryError) {
        console.warn(`⚠️  LLM retry failed: ${retryError.message}`);
      }

      // Transition based on whether we got LLM response
      if (this.pendingLLMResponse) {
        console.log(`✅ Transitioning to SPEAKING with retry response`);
        this.transitionToSpeaking(this.pendingLLMResponse.audioStream);
      } else {
        console.log(`→ Transitioning back to LISTENING`);
        this.startListening();
      }

    } catch (error) {
      console.error(`❌ RECOVERY state error: ${error.message}`);
      this.startListening();
    }
  }

  // ============================================================
  // CALL TERMINATION
  // ============================================================
  async endCall() {
    this.currentState = 'IDLE';

    const callDuration = (new Date() - this.callStartTime) / 1000; // seconds

    console.log(`\n✅ [${this.callId}] CALL ENDED`);
    console.log(`   - Duration: ${callDuration.toFixed(2)}s`);
    console.log(`   - Turns: ${this.currentTurnNumber}`);
    console.log(`   - Fillers used: ${this.usedFillers.length}`);

    // Close Gemini session
    await this.geminiClient.disconnect();

    // Return call statistics
    return {
      callId: this.callId,
      duration: callDuration,
      turns: this.currentTurnNumber,
      fillersUsed: this.usedFillers.length,
      conversationHistory: this.conversationHistory,
      stateLog: this.stateLog
    };
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Transcribe audio buffer to text
   * In production, use Google Cloud Speech-to-Text API
   */
  async _transcribeAudio(audioBuffer) {
    // TODO: Implement actual transcription
    // For now, return placeholder
    return "Placeholder user input";
  }

  /**
   * Validate agent configuration
   */
  _validateConfig(config) {
    const required = [
      'agentName',
      'primaryObjective',
      'primaryLanguage',
      'voiceCharacteristics'
    ];

    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Missing required config field: ${field}`);
      }
    }
  }

  /**
   * Log state transition for analytics
   */
  _logStateTransition(toState, event, turn, details) {
    this.stateLog.push({
      timestamp: new Date(),
      fromState: this.currentState,
      toState: toState,
      event: event,
      turn: turn,
      details: details
    });
  }

  /**
   * Get current state info (for debugging)
   */
  getStateInfo() {
    return {
      currentState: this.currentState,
      callId: this.callId,
      turnNumber: this.currentTurnNumber,
      conversationHistory: this.conversationHistory,
      currentAnalysis: this.currentAnalysis,
      currentPrinciple: this.currentPrinciple,
      usedFillers: this.usedFillers
    };
  }
}

module.exports = VoiceAgentStateMachine;
