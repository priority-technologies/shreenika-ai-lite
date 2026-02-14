/**
 * Google Gemini Live API Client
 *
 * Handles real-time bidirectional audio streaming with Gemini Live API.
 * Used for AI-powered voice conversations during phone calls.
 *
 * API Reference: https://ai.google.dev/gemini-api/docs/live
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

const GEMINI_LIVE_ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

/**
 * Available Gemini Live voices
 */
export const GEMINI_VOICES = {
  PUCK: 'Puck',
  CHARON: 'Charon',
  KORE: 'Kore',
  FENRIR: 'Fenrir',
  AOEDE: 'Aoede',
  LEDA: 'Leda',
  ORUS: 'Orus',
  ZEPHYR: 'Zephyr'
};

/**
 * Map agent voice settings to Gemini Live voice
 * @param {string} agentVoiceId - Voice ID from agent config
 * @returns {string} - Gemini voice name
 */
export const mapAgentVoiceToGemini = (agentVoiceId) => {
  // Map common voice IDs to Gemini voices
  const voiceMap = {
    'Monika (en-IN)': GEMINI_VOICES.AOEDE,
    'Rachel': GEMINI_VOICES.KORE,
    'Drew': GEMINI_VOICES.PUCK,
    'Clyde': GEMINI_VOICES.CHARON,
    'Paul': GEMINI_VOICES.FENRIR,
    'Domi': GEMINI_VOICES.LEDA,
    'Elli': GEMINI_VOICES.ORUS,
    'Josh': GEMINI_VOICES.ZEPHYR
  };

  return voiceMap[agentVoiceId] || GEMINI_VOICES.AOEDE;
};

/**
 * Build system instruction from agent configuration
 * @param {Object} agent - Agent document from MongoDB
 * @param {Array} knowledgeDocs - Knowledge documents fetched from DB (optional)
 * @returns {string} - System instruction for Gemini
 */
export const buildSystemInstruction = (agent, knowledgeDocs = []) => {
  const parts = [];

  // Agent identity
  parts.push(`You are ${agent.name}, a ${agent.title || 'voice assistant'}.`);

  // Personality characteristics
  if (agent.characteristics && agent.characteristics.length > 0) {
    parts.push(`Your personality traits are: ${agent.characteristics.join(', ')}.`);
  }

  // Speaking style based on emotion level
  if (agent.emotionLevel) {
    if (agent.emotionLevel > 0.7) {
      parts.push('Speak with warmth and enthusiasm. Be expressive and engaging.');
    } else if (agent.emotionLevel < 0.3) {
      parts.push('Speak in a calm, professional manner. Be concise and direct.');
    }
  }

  // Custom prompt
  if (agent.prompt) {
    parts.push('\nYour instructions:');
    parts.push(agent.prompt);
  }

  // ===== KNOWLEDGE BASE INJECTION =====
  // Priority 1: Knowledge documents fetched from DB (full text)
  // Priority 2: Embedded content in agent.knowledgeBase array
  const docsToInject = [];

  // From DB-fetched knowledge documents
  if (knowledgeDocs && knowledgeDocs.length > 0) {
    knowledgeDocs.forEach(doc => {
      if (doc.rawText || doc.content) {
        docsToInject.push({
          title: doc.title || 'Untitled',
          content: doc.rawText || doc.content
        });
      }
    });
  }

  // Fallback: from embedded knowledgeBase array on agent
  if (docsToInject.length === 0 && agent.knowledgeBase && agent.knowledgeBase.length > 0) {
    agent.knowledgeBase.forEach(item => {
      if (item.content) {
        docsToInject.push({
          title: item.name || 'Untitled',
          content: item.content
        });
      }
    });
  }

  // Inject knowledge into system prompt
  if (docsToInject.length > 0) {
    parts.push('\n===== TRAINING KNOWLEDGE BASE =====');
    parts.push('You have been trained on the following documents. Use this knowledge to make informed decisions during the conversation.');
    parts.push('Study, learn, and apply the content from these documents when answering questions, making recommendations, or handling objections.');
    parts.push('Use the logic, data, pricing, features, and strategies described in these documents as your core decision-making framework.\n');

    let totalChars = 0;
    const maxTotalChars = 30000; // Gemini context limit safety

    docsToInject.forEach((doc, index) => {
      const remaining = maxTotalChars - totalChars;
      if (remaining <= 0) return;

      const content = doc.content.substring(0, Math.min(remaining, 10000));
      parts.push(`[Document ${index + 1}: ${doc.title}]`);
      parts.push(content);
      parts.push('');
      totalChars += content.length;
    });

    parts.push('===== END KNOWLEDGE BASE =====\n');
    parts.push('IMPORTANT: Use the above knowledge to support your conversations. Reference specific data, features, or pricing from the documents when relevant.');
    parts.push('If a question falls outside the knowledge base, acknowledge that honestly and offer to help with what you do know.\n');
  }

  // Call handling instructions
  parts.push('\n\nCall handling guidelines:');
  parts.push('- Listen carefully to the caller and respond naturally');
  parts.push('- If the caller interrupts, stop speaking and listen');
  parts.push('- Keep responses concise (1-2 sentences) unless more detail is needed');
  parts.push('- Be helpful and professional at all times');

  if (agent.maxCallDuration) {
    const minutes = Math.floor(agent.maxCallDuration / 60);
    parts.push(`- This call should not exceed ${minutes} minutes`);
  }

  return parts.join('\n');
};

/**
 * Gemini Live Session
 * Manages a single real-time conversation session
 */
export class GeminiLiveSession extends EventEmitter {
  constructor(apiKey, options = {}) {
    super();

    this.apiKey = apiKey;
    this.model = options.model || process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-preview-native-audio-dialog';
    this.voice = options.voice || process.env.GEMINI_LIVE_VOICE || GEMINI_VOICES.AOEDE;
    this.systemInstruction = options.systemInstruction || '';

    this.ws = null;
    this.isConnected = false;
    this.sessionId = null;

    // Audio configuration
    this.inputSampleRate = 16000; // 16kHz PCM input
    this.outputSampleRate = 24000; // 24kHz PCM output
  }

  /**
   * Connect to Gemini Live API
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      const url = `${GEMINI_LIVE_ENDPOINT}?key=${this.apiKey}`;

      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        console.log('🔌 Gemini Live WebSocket connected');
        this.isConnected = true;
        this._sendSetup();
        resolve();
      });

      this.ws.on('message', (data) => {
        this._handleMessage(data);
      });

      this.ws.on('error', (error) => {
        console.error('❌ Gemini Live WebSocket error:', error.message);
        this.emit('error', error);
        reject(error);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`🔌 Gemini Live WebSocket closed: ${code} ${reason}`);
        this.isConnected = false;
        this.emit('close', { code, reason: reason.toString() });
      });

      // Connection timeout
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('Gemini Live connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Send initial setup message with configuration
   * @private
   */
  _sendSetup() {
    const setupMessage = {
      setup: {
        model: `models/${this.model}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.voice
              }
            }
          }
        }
      }
    };

    // Add system instruction if provided
    if (this.systemInstruction) {
      setupMessage.setup.systemInstruction = {
        parts: [{ text: this.systemInstruction }]
      };
    }

    this._send(setupMessage);
  }

  /**
   * Handle incoming WebSocket messages
   * @private
   * @param {Buffer} data - Raw message data
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());

      // Setup complete
      if (message.setupComplete) {
        console.log('✅ Gemini Live session setup complete');
        this.sessionId = message.setupComplete.sessionId;
        this.emit('ready', { sessionId: this.sessionId });
        return;
      }

      // Server content (audio response or text)
      if (message.serverContent) {
        const content = message.serverContent;

        // Model turn complete
        if (content.turnComplete) {
          this.emit('turnComplete');
          return;
        }

        // Check for audio data
        if (content.modelTurn && content.modelTurn.parts) {
          for (const part of content.modelTurn.parts) {
            // Audio response
            if (part.inlineData && part.inlineData.mimeType?.includes('audio')) {
              const audioData = Buffer.from(part.inlineData.data, 'base64');
              this.emit('audio', audioData);
            }

            // Text response (for transcript)
            if (part.text) {
              this.emit('text', part.text);
            }
          }
        }

        // Interrupted by user
        if (content.interrupted) {
          this.emit('interrupted');
        }
      }

      // Tool call (for knowledge base queries)
      if (message.toolCall) {
        this.emit('toolCall', message.toolCall);
      }

    } catch (error) {
      console.error('❌ Failed to parse Gemini Live message:', error.message);
      this.emit('error', error);
    }
  }

  /**
   * Send audio data to Gemini Live
   * @param {Buffer} pcmBuffer - PCM 16-bit 16kHz audio buffer
   */
  sendAudio(pcmBuffer) {
    if (!this.isConnected) {
      console.warn('⚠️ Cannot send audio: not connected');
      return;
    }

    const message = {
      realtimeInput: {
        mediaChunks: [{
          mimeType: 'audio/pcm;rate=16000',
          data: pcmBuffer.toString('base64')
        }]
      }
    };

    this._send(message);
  }

  /**
   * Send text message to Gemini Live
   * @param {string} text - Text message
   */
  sendText(text) {
    if (!this.isConnected) {
      console.warn('⚠️ Cannot send text: not connected');
      return;
    }

    const message = {
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text }]
        }],
        turnComplete: true
      }
    };

    this._send(message);
  }

  /**
   * Send tool response back to Gemini
   * @param {string} functionCallId - Function call ID
   * @param {object} response - Function response
   */
  sendToolResponse(functionCallId, response) {
    if (!this.isConnected) return;

    const message = {
      toolResponse: {
        functionResponses: [{
          id: functionCallId,
          response
        }]
      }
    };

    this._send(message);
  }

  /**
   * Send raw message to WebSocket
   * @private
   * @param {object} message - Message object
   */
  _send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Close the session
   */
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

/**
 * Create a Gemini Live session with agent configuration
 * @param {Object} agent - Agent document from MongoDB
 * @param {Array} knowledgeDocs - Knowledge documents from DB (optional)
 * @returns {GeminiLiveSession} - Configured session
 */
export const createGeminiLiveSession = (agent, knowledgeDocs = []) => {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not configured');
  }

  const systemInstruction = buildSystemInstruction(agent, knowledgeDocs);
  const voice = mapAgentVoiceToGemini(agent.voiceId);

  console.log(`📋 System instruction built: ${systemInstruction.length} chars, ${knowledgeDocs.length} knowledge docs injected`);

  return new GeminiLiveSession(apiKey, {
    systemInstruction,
    voice
  });
};

export default {
  GeminiLiveSession,
  createGeminiLiveSession,
  buildSystemInstruction,
  mapAgentVoiceToGemini,
  GEMINI_VOICES
};
