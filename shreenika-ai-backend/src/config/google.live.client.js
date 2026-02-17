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
import { calculateProsodyProfile, generateProsodyInstructions } from '../modules/voice/prosody.service.js';
import ContextCachingService from '../modules/voice/context-caching.service.js';

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
 * @param {Object} voiceConfig - Voice customization config (optional)
 * @returns {string} - System instruction for Gemini
 */
export const buildSystemInstruction = (agent, knowledgeDocs = [], voiceConfig = null) => {
  const parts = [];

  // Extract language from agent configuration
  const language = agent.voiceProfile?.language || agent.language || 'en-US';

  // Agent identity
  parts.push(`You are ${agent.name}, a ${agent.title || 'voice assistant'}.`);

  // ===== VOICE CUSTOMIZATION (40-60 RATIO) =====
  // 40% = Characteristics + Emotions
  // 60% = Speech Settings (voiceSpeed, responsiveness)

  // Personality characteristics (40% weight)
  const characteristics = voiceConfig?.characteristics40?.traits || agent.characteristics || [];
  if (characteristics.length > 0) {
    parts.push(`Your personality traits are: ${characteristics.join(', ')}.`);
  }

  // Emotion level from voiceConfig or agent settings (40% weight)
  const emotionLevel = voiceConfig?.characteristics40?.emotions ?? agent.speechSettings?.emotions ?? 0.5;
  if (emotionLevel > 0.7) {
    parts.push('Speak with warmth and enthusiasm. Be expressive, engaging, and energetic in your tone.');
  } else if (emotionLevel < 0.3) {
    parts.push('Speak in a calm, measured manner. Be thoughtful, collected, and professional in your tone.');
  } else {
    parts.push('Speak in a balanced, natural manner. Be conversational yet professional.');
  }

  // Speech settings instructions (60% weight)
  if (voiceConfig?.speechSettings60) {
    const voiceSpeed = voiceConfig.speechSettings60.voiceSpeed || 1.0;
    const responsiveness = voiceConfig.speechSettings60.responsiveness || 0.5;

    if (voiceSpeed > 1.1) {
      parts.push('Speak quickly and energetically. Keep responses brisk and dynamic.');
    } else if (voiceSpeed < 0.9) {
      parts.push('Speak slowly and deliberately. Allow pauses for emphasis and clarity.');
    }

    if (responsiveness > 0.7) {
      parts.push('Respond immediately and attentively to user input. Show quick understanding and engagement.');
    } else if (responsiveness < 0.3) {
      parts.push('Take thoughtful pauses before responding. Process user input carefully before answering.');
    }
  }

  // ===== ACOUSTIC STEERING (Gemini Native Audio Directives) =====
  // Per Gemini 2.5 native audio, use natural language for acoustic control
  parts.push('\nACOUSTIC STEERING FOR VOICE DELIVERY:');

  if (language === 'hinglish') {
    parts.push('- Use Hinglish rhythm (warm, conversational blend of Hindi and English)');
    parts.push('- Speak with upward inflection (rising intonation) at sentence ends to convey warmth');
    parts.push('- First syllable stress on multi-syllabic words (e.g., COMputer, IMportant)');
    parts.push('- Use natural Hinglish fillers: "Acha", "Haan", "Matlab" for conversational flow');
    parts.push('- Mix Hindi and English naturally in speech, never robotic or forced');
    parts.push('- Sound genuinely engaged, never transactional or formal');
  } else if (language === 'hi-IN') {
    parts.push('- Use authentic Hindi intonation and rhythm');
    parts.push('- Sound warm, engaged, and emotionally expressive');
    parts.push('- Use natural Hindi expressions and colloquialisms');
    parts.push('- Maintain high prosody variation (expressive, not monotone)');
  } else if (language === 'en-IN') {
    parts.push('- Use Indian English rhythm and phrasing');
    parts.push('- Sound warm, personable, and authentically Indian');
    parts.push('- Natural intonation patterns of Indian English speakers');
    parts.push('- Use common Indian expressions naturally in conversation');
  } else {
    // Default: American English
    parts.push('- Use American English rhythm and intonation');
    parts.push('- Sound professional, confident, and naturally engaging');
    parts.push('- Conversational tone, never robotic');
  }

  // Add emotion-based acoustic guidance
  const emotionLevel = voiceConfig?.characteristics40?.emotions ?? agent.speechSettings?.emotions ?? 0.5;
  if (emotionLevel > 0.7) {
    parts.push('- Deliver with enthusiasm, energy, and warmth (higher pitch, faster pace)');
  } else if (emotionLevel < 0.3) {
    parts.push('- Deliver with calm, measured tone (lower pitch, slower pace, thoughtful pauses)');
  }

  // Custom prompt
  if (agent.prompt) {
    parts.push('\nYour instructions:');
    parts.push(agent.prompt);
  }

  // ===== KNOWLEDGE BASE (Via Context Caching) =====
  // Knowledge documents are now handled via Context Caching Service
  // instead of being injected into systemInstruction.
  // This provides:
  // - No character/token overhead in system prompt
  // - 90% cost savings on cached tokens
  // - Faster document retrieval from Google's cache
  // - Support for documents up to 200K+ chars (vs 30K limit)
  //
  // The createGeminiLiveSession() factory will handle cache creation
  // and pass cache_id to the WebSocket setup message.

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

  const systemInstruction = parts.join('\n');
  const totalChars = systemInstruction.length;
  const safeMargin = totalChars < 25000 ? '✅' : totalChars < 30000 ? '⚠️' : '❌';
  console.log(`📋 System instruction built: ${totalChars} chars ${safeMargin} (safe: <25K), knowledge handled via Context Caching (${knowledgeDocs.length} docs)`);

  return systemInstruction;
};

/**
 * Gemini Live Session
 * Manages a single real-time conversation session
 */
export class GeminiLiveSession extends EventEmitter {
  constructor(apiKey, options = {}) {
    super();

    this.apiKey = apiKey;
    // Gemini Live API native audio model: env var > options > latest stable model
    // Documentation: https://ai.google.dev/gemini-api/docs/live-guide
    this.model = options.model || process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025';
    this.voice = options.voice || process.env.GEMINI_LIVE_VOICE || GEMINI_VOICES.AOEDE;
    this.systemInstruction = options.systemInstruction || '';
    this.cacheId = options.cacheId || null; // Context Caching support

    this.ws = null;
    this.isConnected = false;
    this.sessionId = null;

    // Audio configuration
    this.inputSampleRate = 16000; // 16kHz PCM input
    this.outputSampleRate = 24000; // 24kHz PCM output
  }

  /**
   * Connect to Gemini Live API
   * Waits for BOTH WebSocket open AND Gemini setupComplete before resolving
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      let resolved = false;
      const url = `${GEMINI_LIVE_ENDPOINT}?key=${this.apiKey}`;
      const connectionStartTime = Date.now();

      console.log(`\n🔌 GEMINI LIVE CONNECTION STARTING`);
      console.log(`   ├─ Model: ${this.model}`);
      console.log(`   ├─ Voice: ${this.voice}`);
      console.log(`   ├─ API Key present: ${!!this.apiKey}`);
      console.log(`   └─ Timestamp: ${new Date().toISOString()}\n`);

      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        const elapsed = Date.now() - connectionStartTime;
        console.log(`✅ WebSocket OPEN (${elapsed}ms)`);
        this.isConnected = true;
        this._sendSetup();
        // Do NOT resolve yet - wait for setupComplete
      });

      this.ws.on('message', (data) => {
        const elapsed = Date.now() - connectionStartTime;
        try {
          const message = JSON.parse(data.toString());
          if (message.setupComplete) {
            console.log(`✅ SETUP COMPLETE received (${elapsed}ms from start)`);
          }
        } catch (e) {
          // Silent - not all messages are JSON
        }
        this._handleMessage(data);
      });

      this.ws.on('error', (error) => {
        const elapsed = Date.now() - connectionStartTime;
        console.error(`❌ WebSocket ERROR (${elapsed}ms):`, error.message);
        console.error(`   Code: ${error.code}`);
        console.error(`   Details: ${JSON.stringify(error)}`);
        this.emit('error', error);
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });

      this.ws.on('close', (code, reason) => {
        const elapsed = Date.now() - connectionStartTime;
        const reasonStr = reason ? reason.toString() : 'unknown';
        console.error(`❌ WebSocket CLOSED (${elapsed}ms): code=${code} reason=${reasonStr}`);
        this.isConnected = false;
        this.emit('close', { code, reason: reasonStr });
        if (!resolved) {
          resolved = true;
          reject(new Error(`Gemini Live connection closed before ready: code=${code} reason=${reasonStr}`));
        }
      });

      // Resolve when Gemini confirms session is ready (setupComplete received)
      this.on('ready', () => {
        const elapsed = Date.now() - connectionStartTime;
        if (!resolved) {
          resolved = true;
          console.log(`✅ GEMINI LIVE: Session ready in ${elapsed}ms`);
          resolve();
        }
      });

      // Connection + setup timeout (15 seconds)
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          const elapsed = Date.now() - connectionStartTime;
          const err = new Error(
            `Gemini Live: TIMEOUT after ${elapsed}ms waiting for setupComplete.\n` +
            `   Possible causes:\n` +
            `   1. GOOGLE_API_KEY invalid or expired\n` +
            `   2. Model ${this.model} not available in your region\n` +
            `   3. API quota exceeded\n` +
            `   4. Network connectivity issue\n` +
            `   Check: gcloud auth application-default print-access-token`
          );
          console.error(`\n❌ ${err.message}\n`);
          this.close();
          reject(err);
        }
      }, 15000);
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

    // Add cached content if available (Context Caching)
    if (this.cacheId) {
      setupMessage.setup.cachedContent = this.cacheId;
      console.log(`📦 Using cached content: ${this.cacheId}`);
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
      if (this._audioDropCount === undefined) this._audioDropCount = 0;
      this._audioDropCount++;
      if (this._audioDropCount <= 3 || this._audioDropCount % 50 === 0) {
        console.warn(`⚠️ Gemini Live: Cannot send audio - not connected (dropped ${this._audioDropCount} chunks)`);
      }
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
 * Handles Context Caching for knowledge documents
 * @async
 * @param {Object} agent - Agent document from MongoDB
 * @param {Array} knowledgeDocs - Knowledge documents from DB (optional)
 * @param {Object} voiceConfig - Voice customization config (optional)
 * @returns {Promise<GeminiLiveSession>} - Configured session
 */
export const createGeminiLiveSession = async (agent, knowledgeDocs = [], voiceConfig = null) => {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not configured');
  }

  const systemInstruction = buildSystemInstruction(agent, knowledgeDocs, voiceConfig);
  const voice = mapAgentVoiceToGemini(agent.voiceProfile?.voiceId || agent.voiceId);

  // Initialize Context Caching for knowledge documents
  let cacheId = null;
  if (knowledgeDocs && knowledgeDocs.length > 0) {
    try {
      const cachingService = new ContextCachingService(apiKey);
      cacheId = await cachingService.getOrCreateCache(agent._id.toString(), knowledgeDocs);
    } catch (err) {
      console.warn('⚠️ Context Caching failed, continuing without cache:', err.message);
    }
  }

  return new GeminiLiveSession(apiKey, {
    systemInstruction,
    voice,
    cacheId  // Pass cache ID to session
  });
};

export default {
  GeminiLiveSession,
  createGeminiLiveSession,
  buildSystemInstruction,
  mapAgentVoiceToGemini,
  GEMINI_VOICES
};
