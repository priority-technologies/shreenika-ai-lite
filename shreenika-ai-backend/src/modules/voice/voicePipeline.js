/**
 * Voice Pipeline Orchestrator
 * Manages the complete voice conversation flow:
 * Audio Input → STT → Gemini → TTS → Audio Output
 */

import STTService from './stt.service.js';
import TTSService from './tts.service.js';
import GeminiService from './gemini.service.js';
import { validateAgentForVoice, getVoiceSummary } from './voiceService.js';

export class VoicePipeline {
  /**
   * Initialize voice pipeline for an agent
   */
  constructor(agent, options = {}) {
    this.agent = agent;
    this.sessionId = options.sessionId || this.generateSessionId();

    // Initialize services
    this.sttService = new STTService(agent, options.sttConfig || {});
    this.ttsService = new TTSService(agent, options.ttsConfig || {});
    this.geminiService = new GeminiService(agent, {
      sessionId: this.sessionId,
      ...options.geminiConfig
    });

    // Metrics
    this.metrics = {
      startTime: new Date(),
      messagesProcessed: 0,
      totalLatency: 0,
      sttLatency: [],
      llmLatency: [],
      ttsLatency: [],
      errors: []
    };

    this.status = 'initialized'; // initialized, running, paused, ended
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    return `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start voice conversation pipeline
   */
  async start() {
    try {
      // Validate agent is ready for voice
      const validation = await validateAgentForVoice(this.agent);
      if (!validation.valid) {
        throw new Error(`Agent validation failed: ${validation.message}`);
      }

      this.status = 'running';
      console.log(`[VoicePipeline] Started for agent: ${this.agent.name} (${this.sessionId})`);

      return {
        success: true,
        sessionId: this.sessionId,
        status: 'running',
        message: `Voice pipeline started for ${this.agent.name}`
      };
    } catch (error) {
      this.status = 'error';
      this.metrics.errors.push({
        step: 'start',
        error: error.message,
        timestamp: new Date()
      });

      return {
        success: false,
        error: error.message,
        status: 'error'
      };
    }
  }

  /**
   * Process a complete conversation cycle
   * Audio Input → STT → Gemini → TTS → Audio Output
   */
  async processConversationCycle(audioBuffer) {
    if (this.status !== 'running') {
      throw new Error(`Cannot process cycle - pipeline status: ${this.status}`);
    }

    const cycleStartTime = Date.now();
    const result = {
      success: false,
      transcript: null,
      response: null,
      audioOutput: null,
      metrics: {}
    };

    try {
      // STEP 1: Speech-to-Text
      const sttResult = await this.processSTT(audioBuffer);
      if (!sttResult.success) {
        throw new Error(`STT failed: ${sttResult.error}`);
      }
      result.transcript = sttResult.transcript;
      result.metrics.sttLatency = sttResult.latency;
      this.metrics.sttLatency.push(sttResult.latency);

      // STEP 2: Gemini LLM Processing
      const geminiResult = await this.processGemini(result.transcript);
      if (!geminiResult.success) {
        throw new Error(`Gemini failed: ${geminiResult.error}`);
      }
      result.response = geminiResult.response;
      result.metrics.llmLatency = geminiResult.latency;
      this.metrics.llmLatency.push(geminiResult.latency);

      // STEP 3: Text-to-Speech
      const ttsResult = await this.processTTS(result.response);
      if (!ttsResult.success) {
        throw new Error(`TTS failed: ${ttsResult.error}`);
      }
      result.audioOutput = ttsResult.audioContent;
      result.metrics.ttsLatency = ttsResult.latency;
      this.metrics.ttsLatency.push(ttsResult.latency);

      // Calculate total cycle latency
      const totalLatency = Date.now() - cycleStartTime;
      result.metrics.totalLatency = totalLatency;
      this.metrics.totalLatency += totalLatency;
      this.metrics.messagesProcessed += 1;

      result.success = true;
      result.sessionId = this.sessionId;

      console.log(
        `[VoicePipeline] Cycle complete - STT: ${sttResult.latency}ms, LLM: ${geminiResult.latency}ms, TTS: ${ttsResult.latency}ms, Total: ${totalLatency}ms`
      );

      return result;
    } catch (error) {
      result.success = false;
      result.error = error.message;
      result.sessionId = this.sessionId;

      this.metrics.errors.push({
        step: 'cycle',
        error: error.message,
        timestamp: new Date()
      });

      console.error(`[VoicePipeline] Error in cycle:`, error);
      return result;
    }
  }

  /**
   * Process Speech-to-Text
   */
  async processSTT(audioBuffer) {
    const startTime = Date.now();

    try {
      const sttResult = await this.sttService.recognizeAudio(audioBuffer);

      if (sttResult.error) {
        return {
          success: false,
          error: sttResult.error,
          transcript: null,
          latency: Date.now() - startTime
        };
      }

      return {
        success: true,
        transcript: sttResult.transcript,
        confidence: sttResult.confidence,
        latency: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        transcript: null,
        latency: Date.now() - startTime
      };
    }
  }

  /**
   * Process Gemini LLM
   */
  async processGemini(userText) {
    const startTime = Date.now();

    try {
      // Check for empty input
      if (!userText || userText.trim().length === 0) {
        return {
          success: true,
          response: 'I did not hear anything. Could you please repeat?',
          latency: 100
        };
      }

      const geminiResult = await this.geminiService.generateResponse(userText, false);

      if (geminiResult.isError) {
        return {
          success: false,
          error: geminiResult.error,
          response: geminiResult.response,
          latency: Date.now() - startTime
        };
      }

      return {
        success: true,
        response: geminiResult.response,
        latency: geminiResult.latency || Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        response: 'I encountered an error. Please try again.',
        latency: Date.now() - startTime
      };
    }
  }

  /**
   * Process Text-to-Speech
   */
  async processTTS(text) {
    const startTime = Date.now();

    try {
      if (!text || text.trim().length === 0) {
        return {
          success: false,
          error: 'Empty text for TTS',
          audioContent: null,
          latency: 50
        };
      }

      const ttsResult = await this.ttsService.synthesize(text, true);

      if (ttsResult.error) {
        return {
          success: false,
          error: ttsResult.error,
          audioContent: null,
          latency: Date.now() - startTime
        };
      }

      return {
        success: true,
        audioContent: ttsResult.audioContent,
        voiceName: ttsResult.voiceName,
        latency: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        audioContent: null,
        latency: Date.now() - startTime
      };
    }
  }

  /**
   * End voice conversation
   */
  async end() {
    this.status = 'ended';

    const snapshot = {
      sessionId: this.sessionId,
      agentId: this.agent._id,
      agentName: this.agent.name,
      conversationHistory: this.geminiService.getHistory(),
      metrics: {
        duration: Date.now() - this.metrics.startTime.getTime(),
        messagesProcessed: this.metrics.messagesProcessed,
        averageLatency: this.metrics.totalLatency / Math.max(this.metrics.messagesProcessed, 1),
        averageSTTLatency: this.getAverageLatency(this.metrics.sttLatency),
        averageLLMLatency: this.getAverageLatency(this.metrics.llmLatency),
        averageTTSLatency: this.getAverageLatency(this.metrics.ttsLatency),
        errorCount: this.metrics.errors.length
      },
      voiceSettings: this.agent.speechSettings,
      voiceProfile: this.agent.voiceProfile,
      timestamp: new Date()
    };

    console.log(`[VoicePipeline] Session ended: ${this.sessionId}`);

    return snapshot;
  }

  /**
   * Calculate average latency
   */
  getAverageLatency(latencies) {
    if (latencies.length === 0) return 0;
    const sum = latencies.reduce((a, b) => a + b, 0);
    return Math.round(sum / latencies.length);
  }

  /**
   * Get pipeline status
   */
  getStatus() {
    return {
      status: this.status,
      sessionId: this.sessionId,
      agent: this.agent.name,
      messagesProcessed: this.metrics.messagesProcessed,
      errorCount: this.metrics.errors.length,
      voiceSummary: getVoiceSummary(this.agent)
    };
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      averageLatency: this.metrics.totalLatency / Math.max(this.metrics.messagesProcessed, 1)
    };
  }

  /**
   * Get conversation history
   */
  getConversationHistory() {
    return this.geminiService.getHistory();
  }
}

export default VoicePipeline;
