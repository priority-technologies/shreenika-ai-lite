/**
 * Gemini LLM Service
 * Handles conversation with Google's Gemini model
 * Supports streaming and multi-turn conversations
 */

import { VertexAI } from '@google-cloud/vertexai';
import { getMaxTokens } from './voiceService.js';
import { buildSystemPrompt, buildConversationContext } from './systemPromptBuilder.js';

const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id',
  location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
});

// ⚠️ DEPRECATED: GeminiService was used by old VoicePipeline (STT→LLM→TTS cycle)
// That system has been replaced with Gemini Live (gemini-2.5-flash-native-audio-latest)
// This file is kept for backwards compatibility but is NOT actively used in production
const MODEL_ID = process.env.GEMINI_MODEL || 'gemini-1.5-flash'; // Legacy fallback

export class GeminiService {
  /**
   * Initialize Gemini service for an agent
   */
  constructor(agent, options = {}) {
    this.agent = agent;
    this.model = vertexAI.getGenerativeModel({
      model: MODEL_ID,
      generationConfig: {
        temperature: this.getTemperature(),
        topK: 40,
        topP: 0.95,
        maxOutputTokens: getMaxTokens(agent.speechSettings?.responsiveness || 0.5),
        candidateCount: 1
      }
    });

    this.systemPrompt = buildSystemPrompt(agent);
    this.conversationHistory = options.conversationHistory || [];
    this.sessionId = options.sessionId || this.generateSessionId();
    this.options = options;
  }

  /**
   * Generate session ID for tracking
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get temperature based on agent emotions
   * Calm (0) = 0.3, Emotional (1) = 0.9
   */
  getTemperature() {
    const emotions = this.agent.speechSettings?.emotions || 0.5;
    return 0.3 + emotions * 0.6;
  }

  /**
   * Generate response to user input
   */
  async generateResponse(userText, streaming = false) {
    try {
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: userText
      });

      // Build conversation content
      const content = this.conversationHistory.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));

      // Generate response
      if (streaming) {
        return this.generateResponseStreaming(content);
      } else {
        return this.generateResponseNormal(content);
      }
    } catch (error) {
      console.error('Error generating response:', error);
      return {
        response: 'I apologize, I encountered an error. Could you please repeat that?',
        error: error.message,
        isError: true
      };
    }
  }

  /**
   * Normal (non-streaming) response generation
   */
  async generateResponseNormal(content) {
    const startTime = Date.now();

    const response = await this.model.generateContent({
      contents: content,
      systemInstruction: {
        role: 'user',
        parts: [{ text: this.systemPrompt }]
      }
    });

    const latency = Date.now() - startTime;

    if (!response.response.candidates || response.response.candidates.length === 0) {
      return {
        response: "I couldn't generate a response. Please try again.",
        isError: true
      };
    }

    const aiResponse = response.response.candidates[0].content.parts[0].text;

    // Add to history
    this.conversationHistory.push({
      role: 'assistant',
      content: aiResponse
    });

    return {
      response: aiResponse,
      latency: latency,
      finishReason: response.response.candidates[0].finishReason,
      isError: false
    };
  }

  /**
   * Streaming response generation
   */
  async generateResponseStreaming(content) {
    const startTime = Date.now();
    let fullResponse = '';

    const stream = await this.model.generateContentStream({
      contents: content,
      systemInstruction: {
        role: 'user',
        parts: [{ text: this.systemPrompt }]
      }
    });

    return new Promise((resolve, reject) => {
      let isFirstChunk = true;

      stream.on('data', (chunk) => {
        if (chunk.candidates && chunk.candidates.length > 0) {
          const text = chunk.candidates[0].content.parts[0].text;
          fullResponse += text;

          // For audio streaming, we'd emit these chunks to be converted to speech
          if (isFirstChunk) {
            isFirstChunk = false;
            // Emit first chunk for ultra-low latency response
            // (could send to TTS immediately)
          }
        }
      });

      stream.on('end', () => {
        const latency = Date.now() - startTime;

        // Add to history
        this.conversationHistory.push({
          role: 'assistant',
          content: fullResponse
        });

        resolve({
          response: fullResponse,
          latency: latency,
          isStreaming: true,
          isError: false
        });
      });

      stream.on('error', (error) => {
        reject({
          error: error.message,
          response: "I encountered an error processing your request.",
          isError: true
        });
      });
    });
  }

  /**
   * Get conversation history
   */
  getHistory() {
    return this.conversationHistory;
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Add message to history manually
   */
  addToHistory(role, content) {
    this.conversationHistory.push({ role, content });
  }

  /**
   * Get session info
   */
  getSessionInfo() {
    return {
      sessionId: this.sessionId,
      agentName: this.agent.name,
      model: MODEL_ID,
      messageCount: this.conversationHistory.length,
      createdAt: new Date()
    };
  }

  /**
   * Update system prompt (if agent settings change mid-conversation)
   */
  updateSystemPrompt() {
    this.systemPrompt = buildSystemPrompt(this.agent);
  }

  /**
   * Get model config
   */
  getConfig() {
    return {
      model: MODEL_ID,
      temperature: this.getTemperature(),
      maxOutputTokens: getMaxTokens(this.agent.speechSettings?.responsiveness || 0.5),
      systemPrompt: this.systemPrompt
    };
  }

  /**
   * Save conversation to database (to be called from voice pipeline)
   */
  getConversationSnapshot() {
    return {
      sessionId: this.sessionId,
      agentId: this.agent._id,
      agentName: this.agent.name,
      messages: this.conversationHistory,
      systemPrompt: this.systemPrompt,
      voiceSettings: this.agent.speechSettings,
      voiceProfile: this.agent.voiceProfile,
      timestamp: new Date()
    };
  }
}

export default GeminiService;
