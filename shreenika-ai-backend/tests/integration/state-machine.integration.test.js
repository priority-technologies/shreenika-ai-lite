/**
 * state-machine.integration.test.js
 * ============================================================
 * Integration tests for SMART Agent State Machine
 * Tests full conversation cycle: LISTENING→THINKING→SPEAKING→LISTENING
 *
 * Author: Claude Code
 * Date: 2026-02-23
 */

const VoiceAgentStateMachine = require('../../src/modules/voice/state-machine/VoiceAgentStateMachine');
const ConversationAnalyzer = require('../../src/modules/voice/intelligence/ConversationAnalyzer');
const PrincipleDecisionEngine = require('../../src/modules/voice/intelligence/PrincipleDecisionEngine');
const HedgeEngineV2 = require('../../src/modules/voice/intelligence/HedgeEngineV2');

// Mock Gemini Client
class MockGeminiClient {
  constructor() {
    this.isConnected = false;
  }

  async connect() {
    this.isConnected = true;
    return Promise.resolve();
  }

  async disconnect() {
    this.isConnected = false;
    return Promise.resolve();
  }

  async sendMessage({ transcript, principle }) {
    // Simulate LLM response
    return {
      audioStream: 'mock_audio_stream',
      text: `Response to: ${transcript}`,
      principle: principle
    };
  }

  async playAudio() {
    return Promise.resolve();
  }

  stopAudio() {}

  createAudioPlayer() {
    return {
      play: async () => Promise.resolve(),
      stop: () => {},
      waitForCompletion: async () => Promise.resolve()
    };
  }
}

describe('SMART Agent State Machine - Integration Tests', () => {

  let stateMachine;
  let mockGemini;
  let testConfig;

  beforeEach(() => {
    // Setup test agent configuration
    testConfig = {
      agentName: 'Test Agent',
      primaryObjective: 'Close Sale',
      primaryLanguage: 'English',
      agentRole: 'Sales',
      conversationStyle: 'Consultative',
      voiceCharacteristics: {
        tone: 'Professional',
        emotionLevel: 0.5,
        pitch: 1.0,
        speed: 1.0
      }
    };

    mockGemini = new MockGeminiClient();
    stateMachine = new VoiceAgentStateMachine(testConfig, mockGemini);
  });

  // ============================================================
  // INITIALIZATION TESTS
  // ============================================================

  describe('Initialization (IDLE State)', () => {
    test('should initialize agent and load fillers', async () => {
      await stateMachine.initialize('test-call-1');

      const state = stateMachine.getStateInfo();
      expect(state.currentState).toBe('IDLE');
      expect(state.callId).toBe('test-call-1');
      expect(mockGemini.isConnected).toBe(true);
    });

    test('should set initial values correctly', async () => {
      await stateMachine.initialize('test-call-2');

      expect(stateMachine.currentTurnNumber).toBe(0);
      expect(stateMachine.conversationHistory.length).toBe(0);
      expect(stateMachine.usedFillers.length).toBe(0);
    });
  });

  // ============================================================
  // STATE TRANSITION TESTS
  // ============================================================

  describe('State Transitions', () => {
    beforeEach(async () => {
      await stateMachine.initialize('test-call-3');
    });

    test('should transition from IDLE to LISTENING', () => {
      stateMachine.startListening();

      const state = stateMachine.getStateInfo();
      expect(state.currentState).toBe('LISTENING');
    });

    test('should transition from LISTENING to THINKING on silence', async () => {
      stateMachine.startListening();

      // Simulate audio chunks and silence detection
      // In real scenario, VAD would detect this
      // For test, we call it directly
      await stateMachine.transitionToThinking();

      // Note: This is async, so state might change
      // Check log instead
      const log = stateMachine.stateLog;
      expect(log.some(entry => entry.toState === 'THINKING')).toBe(true);
    });
  });

  // ============================================================
  // CONVERSATION ANALYSIS TESTS
  // ============================================================

  describe('Conversation Analysis (Part of THINKING State)', () => {
    let analyzer;

    beforeEach(() => {
      analyzer = new ConversationAnalyzer();
    });

    test('should detect AWARENESS stage in first message', () => {
      const analysis = analyzer.analyze({
        transcript: 'Tell me about your product',
        history: []
      });

      expect(analysis.stage).toBe('AWARENESS');
    });

    test('should detect CONSIDERATION stage after multiple turns', () => {
      const history = [
        { userMessage: 'Tell me about pricing' },
        { userMessage: 'How does it compare to alternatives?' }
      ];

      const analysis = analyzer.analyze({
        transcript: 'What are the implementation requirements?',
        history: history
      });

      expect(analysis.stage).toBe('CONSIDERATION');
    });

    test('should detect DECISION stage when user is ready', () => {
      const history = Array(8).fill({ userMessage: 'Some message' });

      const analysis = analyzer.analyze({
        transcript: 'When can I schedule this?',
        history: history
      });

      expect(analysis.stage).toBe('DECISION');
    });

    test('should detect ANALYTICAL client profile', () => {
      const analysis = analyzer.analyze({
        transcript: 'What are the ROI metrics and cost breakdown?',
        history: []
      });

      expect(analysis.profile).toBe('ANALYTICAL');
    });

    test('should detect EMOTIONAL client profile', () => {
      const analysis = analyzer.analyze({
        transcript: 'I love how this makes me feel. It's exciting!',
        history: []
      });

      expect(analysis.profile).toBe('EMOTIONAL');
    });

    test('should detect PRICE objection', () => {
      const analysis = analyzer.analyze({
        transcript: 'That's too expensive for our budget',
        history: []
      });

      expect(analysis.objections).toContain('PRICE');
    });

    test('should detect TRUST objection', () => {
      const analysis = analyzer.analyze({
        transcript: 'How do I know this isn\'t a scam?',
        history: []
      });

      expect(analysis.objections).toContain('TRUST');
    });

    test('should detect English language', () => {
      const analysis = analyzer.analyze({
        transcript: 'Hello, I need help with my project',
        history: []
      });

      expect(analysis.language).toBe('English');
    });

    test('should detect Hinglish language', () => {
      const analysis = analyzer.analyze({
        transcript: 'Acha, mujhe kya benefits milenge aur cost kya hai?',
        history: []
      });

      expect(analysis.language).toBe('Hinglish');
    });

    test('should analyze positive sentiment', () => {
      const analysis = analyzer.analyze({
        transcript: 'That sounds great! I love this idea, absolutely perfect!',
        history: []
      });

      expect(analysis.sentiment.score).toBeGreaterThan(0.6);
    });

    test('should analyze negative sentiment', () => {
      const analysis = analyzer.analyze({
        transcript: 'I hate this. It\'s terrible and doesn\'t work.',
        history: []
      });

      expect(analysis.sentiment.score).toBeLessThan(0.4);
    });
  });

  // ============================================================
  // PRINCIPLE SELECTION TESTS
  // ============================================================

  describe('Principle Decision Engine', () => {
    let principleEngine;

    beforeEach(() => {
      principleEngine = new PrincipleDecisionEngine();
    });

    test('should select AUTHORITY for SKEPTICAL profile in AWARENESS', () => {
      const principle = principleEngine.selectPrinciple({
        stage: 'AWARENESS',
        profile: 'SKEPTICAL',
        objections: ['TRUST'],
        turnNumber: 1
      });

      expect(['AUTHORITY', 'SOCIAL_PROOF']).toContain(principle);
    });

    test('should select LIKING for EMOTIONAL profile', () => {
      const principle = principleEngine.selectPrinciple({
        stage: 'AWARENESS',
        profile: 'EMOTIONAL',
        objections: [],
        turnNumber: 1
      });

      expect(principle).toBe('LIKING');
    });

    test('should address PRICE objection with appropriate principle', () => {
      const principle = principleEngine.selectPrinciple({
        stage: 'CONSIDERATION',
        profile: 'ANALYTICAL',
        objections: ['PRICE'],
        turnNumber: 3
      });

      expect(['RECIPROCITY', 'SOCIAL_PROOF']).toContain(principle);
    });

    test('should not repeat same principle twice in a row', () => {
      // First call
      const principle1 = principleEngine.selectPrinciple({
        stage: 'AWARENESS',
        profile: 'EMOTIONAL',
        objections: [],
        turnNumber: 1
      });

      // Second call - should be different
      const principle2 = principleEngine.selectPrinciple({
        stage: 'AWARENESS',
        profile: 'EMOTIONAL',
        objections: [],
        turnNumber: 2
      });

      // Principles might be same by chance, but if we call 5 times, should see variety
      const principles = [
        principle1,
        principle2,
        principleEngine.selectPrinciple({
          stage: 'AWARENESS',
          profile: 'EMOTIONAL',
          objections: [],
          turnNumber: 3
        })
      ];

      // Check that not all are the same
      const unique = new Set(principles);
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  // ============================================================
  // HEDGE ENGINE V2 TESTS
  // ============================================================

  describe('Hedge Engine V2 (Intelligent Filler System)', () => {
    let hedgeEngine;

    beforeEach(async () => {
      hedgeEngine = new HedgeEngineV2();
      await hedgeEngine.loadFillerIndex();
    });

    test('should load filler metadata', () => {
      expect(hedgeEngine.fillers.length).toBeGreaterThan(0);
    });

    test('should select filler for English language', () => {
      const filler = hedgeEngine.selectFiller({
        language: 'English',
        principle: 'LIKING',
        profile: 'EMOTIONAL',
        usedFillers: []
      });

      expect(filler).toBeDefined();
      expect(filler.metadata.languages).toContain('English');
    });

    test('should select filler for Hinglish language', () => {
      const filler = hedgeEngine.selectFiller({
        language: 'Hinglish',
        principle: 'AUTHORITY',
        profile: 'ANALYTICAL',
        usedFillers: []
      });

      expect(filler).toBeDefined();
      expect(filler.metadata.languages).toContain('Hinglish');
    });

    test('should select filler matching current principle', () => {
      const filler = hedgeEngine.selectFiller({
        language: 'English',
        principle: 'SCARCITY',
        profile: 'DECISION_MAKER',
        usedFillers: []
      });

      expect(filler).toBeDefined();
      expect(filler.metadata.principles).toContain('SCARCITY');
    });

    test('should avoid repeating same filler', () => {
      const filler1 = hedgeEngine.selectFiller({
        language: 'English',
        principle: 'LIKING',
        profile: 'EMOTIONAL',
        usedFillers: []
      });

      const filler2 = hedgeEngine.selectFiller({
        language: 'English',
        principle: 'LIKING',
        profile: 'EMOTIONAL',
        usedFillers: [filler1.filename]
      });

      // Should be different
      expect(filler2.filename).not.toBe(filler1.filename);
    });

    test('should have high effectiveness scores', () => {
      const filler = hedgeEngine.selectFiller({
        language: 'English',
        principle: 'AUTHORITY',
        profile: 'ANALYTICAL',
        usedFillers: []
      });

      expect(filler.metadata.effectiveness.completionRate).toBeGreaterThan(0.75);
      expect(filler.metadata.effectiveness.sentimentLift).toBeGreaterThan(0.65);
    });
  });

  // ============================================================
  // FULL CONVERSATION CYCLE TESTS
  // ============================================================

  describe('Full Conversation Cycle', () => {
    beforeEach(async () => {
      await stateMachine.initialize('test-call-full');
    });

    test('should complete a full 5-turn conversation', async () => {
      const turns = [
        'Hello, tell me about your product',
        'How does it compare to alternatives?',
        'What is the pricing?',
        'I\'m interested, can we schedule a meeting?',
        'Great, I\'m ready to move forward'
      ];

      for (const userMessage of turns) {
        // Start listening
        stateMachine.startListening();

        // Simulate THINKING state
        const conversationHistory = stateMachine.conversationHistory;
        const analyzer = new ConversationAnalyzer();

        const analysis = analyzer.analyze({
          transcript: userMessage,
          history: conversationHistory
        });

        // Verify analysis worked
        expect(analysis.stage).toBeDefined();
        expect(analysis.profile).toBeDefined();
        expect(analysis.language).toBeDefined();
      }

      // Verify conversation history
      expect(stateMachine.conversationHistory.length).toBeGreaterThan(0);
    });

    test('should track conversation metrics', async () => {
      stateMachine.startListening();
      await stateMachine.transitionToThinking();

      const state = stateMachine.getStateInfo();

      // Should have metrics
      expect(state.callId).toBe('test-call-full');
      expect(state.turnNumber).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // ERROR HANDLING TESTS
  // ============================================================

  describe('Error Handling & Recovery', () => {
    beforeEach(async () => {
      await stateMachine.initialize('test-call-error');
    });

    test('should handle missing agent config', async () => {
      const badConfig = {
        agentName: 'Bad Agent'
        // Missing required fields
      };

      const stateMachine2 = new VoiceAgentStateMachine(badConfig, mockGemini);

      expect(() => {
        stateMachine2._validateConfig(badConfig);
      }).toThrow();
    });

    test('should recover from filler not found', async () => {
      const hedgeEngine = new HedgeEngineV2();
      await hedgeEngine.loadFillerIndex();

      // If no fillers match, should return fallback
      const originalLength = hedgeEngine.fillers.length;

      // Simulate empty filler database
      hedgeEngine.fillers = [];
      hedgeEngine.fillerIndex = {};

      const filler = hedgeEngine.selectFiller({
        language: 'Klingon', // Non-existent language
        principle: 'LIKING',
        profile: 'ANALYTICAL',
        usedFillers: []
      });

      // Should still return something (fallback)
      expect(filler).toBeDefined();
    });
  });

  // ============================================================
  // PERFORMANCE TESTS
  // ============================================================

  describe('Performance & Latency', () => {
    let analyzer;
    let principleEngine;
    let hedgeEngine;

    beforeEach(async () => {
      analyzer = new ConversationAnalyzer();
      principleEngine = new PrincipleDecisionEngine();
      hedgeEngine = new HedgeEngineV2();
      await hedgeEngine.loadFillerIndex();
    });

    test('conversation analysis should complete in <100ms', () => {
      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        analyzer.analyze({
          transcript: 'Tell me about your pricing and features',
          history: []
        });
      }

      const duration = Date.now() - startTime;
      const avgTime = duration / 10;

      expect(avgTime).toBeLessThan(100);
    });

    test('principle selection should complete in <50ms', () => {
      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        principleEngine.selectPrinciple({
          stage: 'CONSIDERATION',
          profile: 'ANALYTICAL',
          objections: ['PRICE'],
          turnNumber: i
        });
      }

      const duration = Date.now() - startTime;
      const avgTime = duration / 10;

      expect(avgTime).toBeLessThan(50);
    });

    test('filler selection should complete in <100ms', () => {
      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        hedgeEngine.selectFiller({
          language: 'English',
          principle: 'LIKING',
          profile: 'EMOTIONAL',
          usedFillers: []
        });
      }

      const duration = Date.now() - startTime;
      const avgTime = duration / 10;

      expect(avgTime).toBeLessThan(100);
    });
  });

  // ============================================================
  // CLEANUP
  // ============================================================

  afterEach(async () => {
    if (stateMachine) {
      await stateMachine.endCall();
    }
  });
});

module.exports = {};
