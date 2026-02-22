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
import { sharedCachingService } from '../modules/voice/context-caching.service.js';

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
  // Map voice IDs to Gemini voices (supports both new voice_N format and legacy display names)
  const voiceMap = {
    // New voice_N IDs (primary)
    'voice_1': GEMINI_VOICES.CHARON,      // en-IN Male Professional
    'voice_2': GEMINI_VOICES.AOEDE,       // en-IN Female Professional
    'voice_3': GEMINI_VOICES.PUCK,        // en-US Male Friendly
    'voice_4': GEMINI_VOICES.KORE,        // en-US Female Friendly
    'voice_5': GEMINI_VOICES.FENRIR,      // hi-IN Male Formal
    'voice_6': GEMINI_VOICES.LEDA,        // hi-IN Female Warm
    'voice_7': GEMINI_VOICES.ORUS,        // en-IN Male Young
    'voice_8': GEMINI_VOICES.ZEPHYR,      // en-US Female Bold

    // Legacy display name IDs (fallback for backward compatibility)
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
 * Build characteristics behavior with permutation/combination logic
 * Applies multiple characteristics as intersecting behavioral constraints
 * @param {Array} characteristics - Array of trait names (e.g., ['Professional', 'Empathetic'])
 * @returns {string|null} - Behavioral instruction string, or null if no traits
 */
const buildCharacteristicsBehavior = (characteristics) => {
  if (!characteristics || characteristics.length === 0) return null;

  // Individual behavioral descriptors per characteristic
  const BEHAVIOR_MAP = {
    'Friendly':     'Use warm greetings, personal pronouns (I, you), and end sentences with inclusive phrases.',
    'Empathetic':   'Acknowledge the listener\'s feelings before responding. Mirror emotional cues. Pause after difficult topics.',
    'Enthusiastic': 'Use energetic openers, exclamatory sentences, and upward intonation on key points.',
    'Professional': 'Maintain formal register. Avoid slang. Use precise language and complete sentences.',
    'Helpful':      'Proactively offer solutions. Frame every response around what you can do, not what you cannot.',
    'Assertive':    'State positions clearly and directly. Avoid hedging language like "maybe" or "perhaps".',
    'Humorous':     'Incorporate light, appropriate humor naturally. Use wit without undermining professionalism.',
    'Calm':         'Maintain steady pacing. Use de-escalating phrases. Never rush or raise urgency unnecessarily.',
    'Persuasive':   'Build agreement incrementally. Use social proof and benefit-first framing.'
  };

  if (characteristics.length === 1) {
    const single = BEHAVIOR_MAP[characteristics[0]];
    return single ? `Behavioral style: ${single}` : null;
  }

  // Multi-characteristic combination: create a unified behavioral instruction
  // that filters word choice and delivery through ALL selected lenses simultaneously
  const behaviors = characteristics.map(c => BEHAVIOR_MAP[c]).filter(Boolean);
  const traitList = characteristics.join(' + ');

  return `Combined behavioral profile [${traitList}]:\n` +
    `Every response must simultaneously satisfy ALL of the following:\n` +
    behaviors.map((b, i) => `${i + 1}. ${b}`).join('\n') +
    `\nNever let one trait cancel another - find the intersection where all traits coexist naturally.`;
};

/**
 * Build system instruction from agent configuration
 * @param {Object} agent - Agent document from MongoDB
 * @param {Array} knowledgeDocs - Knowledge documents fetched from DB (optional)
 * @param {Object} voiceConfig - Voice customization config (optional)
 * @param {String} leadName - Lead's full name for personalized welcome (optional) - Bug 2.2
 * @returns {string} - System instruction for Gemini
 */
export const buildSystemInstruction = (agent, knowledgeDocs = [], voiceConfig = null, leadName = null) => {
  const parts = [];

  // Extract language from agent configuration
  const language = agent.voiceProfile?.language || agent.language || 'en-US';

  // Agent identity
  parts.push(`You are ${agent.name}, a ${agent.title || 'voice assistant'}.`);

  // ===== VOICE CUSTOMIZATION (40-60 RATIO) =====
  // 40% = Characteristics + Emotions
  // 60% = Speech Settings (voiceSpeed, responsiveness)

  // Personality characteristics with permutation/combination (40% weight)
  const characteristics = voiceConfig?.characteristics40?.traits || agent.characteristics || [];
  const characteristicsBehavior = buildCharacteristicsBehavior(characteristics);
  if (characteristicsBehavior) {
    parts.push(characteristicsBehavior);
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

  // Add emotion-based acoustic guidance (emotionLevel already defined above)
  if (emotionLevel > 0.7) {
    parts.push('- Deliver with enthusiasm, energy, and warmth (higher pitch, faster pace)');
  } else if (emotionLevel < 0.3) {
    parts.push('- Deliver with calm, measured tone (lower pitch, slower pace, thoughtful pauses)');
  }

  // Background noise acoustic instructions
  const backgroundNoise = voiceConfig?.speechSettings60?.backgroundNoise ||
    agent.speechSettings?.backgroundNoise || 'office';

  const NOISE_INSTRUCTIONS = {
    'office':      'You are in a professional office environment. Speak in a measured, professional tone appropriate for a business setting.',
    'quiet':       'You are in a quiet environment. Speak softly and clearly. Use minimal vocal filler. Allow comfortable silences.',
    'cafe':        'You are in a cafe setting with ambient background noise. Speak with slightly elevated energy and clarity to cut through noise.',
    'street':      'You are on the street with traffic and outdoor noise. Speak clearly and deliberately. Be patient with interruptions.',
    'call-center': 'You are in a call center environment. Use a confident, service-oriented tone. Be clear and efficient.'
  };

  const noiseInstruction = NOISE_INSTRUCTIONS[backgroundNoise];
  if (noiseInstruction) {
    parts.push(`\nEnvironment: ${noiseInstruction}`);
  }

  // Custom prompt
  if (agent.prompt) {
    parts.push('\nYour instructions:');
    parts.push(agent.prompt);
  }

  // ===== FIX 2: KNOWLEDGE BASE HARD LIMIT (2026-02-22) =====
  // Knowledge docs injected directly into system instruction as fallback
  // HARD LIMIT: 20,000 characters (prevents API rejection + memory issues)
  if (knowledgeDocs && knowledgeDocs.length > 0) {
    parts.push('\n\n=== YOUR KNOWLEDGE BASE ===');
    parts.push('Use this information to answer questions accurately:');

    const MAX_KNOWLEDGE_CHARS = 20000; // Hard limit - truncate beyond this
    let totalKnowledgeChars = 0;
    let docsIncluded = 0;

    for (const doc of knowledgeDocs) {
      const text = doc.rawText || doc.content || '';
      if (text) {
        // Check if adding this doc would exceed limit
        if (totalKnowledgeChars + text.length <= MAX_KNOWLEDGE_CHARS) {
          parts.push(`\n[${doc.title || 'Document'}]`);
          parts.push(text);
          totalKnowledgeChars += text.length;
          docsIncluded++;
        } else {
          // Would exceed limit - truncate remaining space
          const remainingSpace = MAX_KNOWLEDGE_CHARS - totalKnowledgeChars;
          if (remainingSpace > 100) {
            const truncatedText = text.substring(0, remainingSpace);
            parts.push(`\n[${doc.title || 'Document'} - TRUNCATED]`);
            parts.push(truncatedText);
            parts.push('\n[... remaining knowledge truncated due to size limit ...]');
            totalKnowledgeChars = MAX_KNOWLEDGE_CHARS;
          }
          break; // Stop processing more docs
        }
      }
    }

    parts.push('\n=== END KNOWLEDGE BASE ===');
    console.log(`✅ Knowledge base included: ${docsIncluded} docs, ${totalKnowledgeChars} chars (limit: ${MAX_KNOWLEDGE_CHARS})`);
  }

  // ===== CALL START BEHAVIOR =====
  // Bug 2.2: Include personalized lead name in welcome message
  const callStartBehavior = agent.callStartBehavior || 'waitForHuman';
  parts.push('\n\nCRITICAL CALL BEHAVIOR:');
  parts.push('This is a REAL PHONE CALL. You are speaking to a real person via telephone.');

  if (callStartBehavior === 'waitForHuman') {
    parts.push('IMPORTANT: DO NOT SPEAK IMMEDIATELY when the call connects.');
    parts.push('WAIT for the human to speak first. They will say "Hello", "Hi", "Haan", or similar.');
    parts.push('Only AFTER you hear the human speak, respond with a natural greeting.');
    parts.push('Do NOT speak over ringing tones, connection sounds, or silence.');
    parts.push('The human expects you to listen first, then respond.');
  } else {
    parts.push('Start speaking immediately when the call connects.');
    parts.push('Greet the caller proactively without waiting for them to speak first.');

    // Build personalized greeting with lead name (Bug 2.2)
    let greeting = 'Use a warm, confident opening like "Hello! This is ' + (agent.name || 'your assistant') + '.';

    if (leadName) {
      // Extract first name from "John Smith" → "John"
      const firstName = leadName.split(' ')[0];
      // Get language from agent config to determine salutation style
      const language = agent.voiceProfile?.language || agent.language || 'en-US';

      if (language.includes('hi') || language.includes('en-IN')) {
        // India/Hindi: Use "Ji" suffix → "Hello John Ji, welcome..."
        greeting = `Use a warm, confident opening like "Hello ${firstName} Ji! This is ${agent.name || 'your assistant'}. Welcome!"`;
      } else {
        // English/Global: Use "Mr." or "Ms." prefix (assume Mr. for now, can be extended) → "Hello Mr. John, welcome..."
        greeting = `Use a warm, confident opening like "Hello Mr. ${firstName}! This is ${agent.name || 'your assistant'}. Welcome!"`;
      }
    }

    parts.push(greeting + '"');
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
    // Gemini Live API model: env var > options > fallback
    // Using gemini-2.5-flash with AUDIO modality (native-audio-preview not available in all regions)
    // Documentation: https://ai.google.dev/gemini-api/docs/live-guide
    this.model = options.model || process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash';
    this.voice = options.voice || process.env.GEMINI_LIVE_VOICE || GEMINI_VOICES.AOEDE;
    this.systemInstruction = options.systemInstruction || '';
    this.cacheId = options.cacheId || null; // Context Caching support

    this.ws = null;
    this.isConnected = false;
    this.sessionId = null;

    // Audio configuration
    // Gemini Live outputs 24kHz PCM natively. Conversion to 8kHz MULAW
    // for phone systems happens in audio.converter.js (geminiToTwilio function)
    this.inputSampleRate = 16000; // 16kHz PCM input (Gemini preference)
    this.outputSampleRate = 24000; // 24kHz PCM output (Gemini native, converted downstream)

    // ===== FIX 3: WEBSOCKET AUTO-RECONNECT (2026-02-22) =====
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 1000; // Start with 1 second
    this.isIntentionalDisconnect = false;
  }

  /**
   * Handle WebSocket reconnection with exponential backoff (FIX 3)
   * @private
   */
  async _handleReconnect(error) {
    if (this.isIntentionalDisconnect) {
      console.log('🛑 Intentional disconnect - no auto-reconnect');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ MAX RECONNECT ATTEMPTS REACHED (${this.maxReconnectAttempts}) - Giving up`);
      this.emit('fatal_error', new Error(`WebSocket reconnection failed after ${this.maxReconnectAttempts} attempts`));
      return;
    }

    this.reconnectAttempts++;

    // Exponential backoff: 1s, 2s, 4s
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.warn(`⚠️ RECONNECTING in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    console.warn(`   Reason: ${error.message}`);

    await new Promise(resolve => setTimeout(resolve, delay));

    console.log('🔄 Attempting reconnect...');
    try {
      await this.connect();
      console.log('✅ Reconnect successful!');
    } catch (reconnectError) {
      console.error('❌ Reconnect failed:', reconnectError.message);
      await this._handleReconnect(reconnectError);
    }
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
      console.log(`   ├─ Reconnect attempt: ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
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
        this.emit('error', error);
        // Attempt reconnect (FIX 3)
        this._handleReconnect(error);
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

        // Attempt reconnect if not intentional (FIX 3)
        if (!this.isIntentionalDisconnect && !resolved) {
          console.warn('⚠️ Unexpected disconnect - attempting auto-reconnect');
          this._handleReconnect(new Error(`WebSocket closed: code=${code} reason=${reasonStr}`));
        }

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
          // Reset reconnect counter on successful connection (FIX 3)
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
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
                voiceName: this.voice  // Aoede, Charon, Kore, Fenrir, Leda, Orus, Zephyr
              }
            }
          }
        }
      }
    };

    // ===== FIX 1: CACHE ID VALIDATION WITH FALLBACK (2026-02-22) =====
    // Validate cache ID format before using to prevent silent failures
    let validCacheId = null;
    if (this.cacheId) {
      // Cache ID must match format: cachedContents/[alphanumeric-_]+
      const cacheIdRegex = /^cachedContents\/[a-zA-Z0-9_-]+$/;
      if (typeof this.cacheId === 'string' && cacheIdRegex.test(this.cacheId)) {
        validCacheId = this.cacheId;
        console.log('✅ Valid cache ID:', validCacheId);
      } else {
        console.warn('⚠️ MALFORMED CACHE ID DETECTED - Falling back to no-cache mode:', this.cacheId);
        validCacheId = null; // Force fallback
      }
    }

    // Use validated cache ID OR fallback to system instruction
    if (validCacheId) {
      setupMessage.setup.cachedContent = validCacheId;
      console.log(`📦 Using cached content: ${validCacheId}`);
      console.log(`   💰 90% cost savings on system instruction + knowledge base`);
    } else {
      // No valid cache - include full system instruction
      if (this.systemInstruction) {
        setupMessage.setup.systemInstruction = {
          parts: [{ text: this.systemInstruction }]
        };
        console.log(`📋 System instruction included (no cache or cache invalid)`);
      }
    }

    // 🔴 DIAGNOSTIC: Log the exact setup message being sent to Gemini
    console.log(`\n🔧 GEMINI LIVE SETUP MESSAGE:`);
    console.log(`   ├─ Model: ${setupMessage.setup.model}`);
    console.log(`   ├─ Response Modalities: ${JSON.stringify(setupMessage.setup.generationConfig.responseModalities)}`);
    console.log(`   ├─ Voice Name: ${this.voice}`);
    console.log(`   ├─ Audio Output: ENABLED ✅`);
    console.log(`   ├─ System Instruction: ${setupMessage.setup.systemInstruction ? `${setupMessage.setup.systemInstruction.parts[0].text.length} chars` : 'OMITTED (using cache)'}`);
    console.log(`   └─ Cache ID: ${validCacheId || 'NONE'}\n`);

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

      // 🔴 DIAGNOSTIC: Log all message types from Gemini for debugging
      const messageKeys = Object.keys(message);
      if (!message.setupComplete && !message.serverContent && !message.toolCall) {
        console.log(`📡 [Gemini] Unexpected message keys:`, messageKeys);
      }

      // Setup complete
      if (message.setupComplete) {
        console.log('✅ Gemini Live session setup complete');
        console.log(`   ├─ Session ID: ${message.setupComplete.sessionId}`);
        console.log(`   ├─ Audio output: Ready to receive`);
        console.log(`   └─ Timestamp: ${new Date().toISOString()}`);
        this.sessionId = message.setupComplete.sessionId;
        this.emit('ready', { sessionId: this.sessionId });
        return;
      }

      // Server content (audio response or text)
      if (message.serverContent) {
        const content = message.serverContent;

        // Model turn complete
        if (content.turnComplete) {
          console.log(`✅ Model turn complete - waiting for next user input`);
          this.emit('turnComplete');
          return;
        }

        // 🔴 CRITICAL DIAGNOSTIC: Log all serverContent structure with detailed inspection
        if (content.modelTurn) {
          console.log(`\n📊 [Gemini] modelTurn received:`);
          console.log(`   ├─ Parts count: ${content.modelTurn.parts ? content.modelTurn.parts.length : 0}`);
          if (content.modelTurn.parts) {
            for (let i = 0; i < content.modelTurn.parts.length; i++) {
              const part = content.modelTurn.parts[i];
              console.log(`   ├─ Part[${i}] type: ${part.text ? 'TEXT' : part.inlineData ? 'INLINEDATA' : 'UNKNOWN'}`);

              if (part.text) {
                const preview = part.text.substring(0, 60).replace(/\n/g, ' ');
                console.log(`   │  ├─ Text (${part.text.length} chars): "${preview}${part.text.length > 60 ? '...' : ''}"`);
              }

              if (part.inlineData) {
                console.log(`   │  ├─ InlineData:`);
                console.log(`   │  │  ├─ MIME Type: ${part.inlineData.mimeType}`);
                console.log(`   │  │  ├─ Is audio?: ${part.inlineData.mimeType?.includes('audio') ? 'YES ✅' : 'NO ❌'}`);
                console.log(`   │  │  └─ Data length (base64): ${part.inlineData.data ? part.inlineData.data.length : 0} chars`);
              }

              // Check for unexpected fields
              if (!part.text && !part.inlineData) {
                console.log(`   │  └─ Fields: ${Object.keys(part).join(', ')}`);
              }
            }
          }
          console.log('');
        }

        // Check for audio data
        if (content.modelTurn && content.modelTurn.parts) {
          let audioFound = false;
          for (const part of content.modelTurn.parts) {
            // Audio response
            if (part.inlineData && part.inlineData.mimeType?.includes('audio')) {
              audioFound = true;
              const audioData = Buffer.from(part.inlineData.data, 'base64');
              console.log(`📥 ✅ AUDIO CHUNK RECEIVED from Gemini: ${audioData.length} bytes (base64 input: ${part.inlineData.data.length} chars)`);
              this.emit('audio', audioData);
            }

            // Text response (for transcript)
            if (part.text) {
              const preview = part.text.substring(0, 50);
              console.log(`💬 [Gemini] Text: "${preview}${part.text.length > 50 ? '...' : ''}"`);
              this.emit('text', part.text);
            }
          }

          if (!audioFound && content.modelTurn.parts.length > 0) {
            console.warn(`⚠️ MODEL TURN RECEIVED BUT NO AUDIO FOUND - Gemini may not be outputting audio`);
          }
        }

        // Interrupted by user
        if (content.interrupted) {
          console.log(`🤚 [Gemini] User interrupted agent`);
          this.emit('interrupted');
        }
      }

      // Tool call (for knowledge base queries)
      if (message.toolCall) {
        console.log(`🔧 [Gemini] Tool call:`, message.toolCall.id);
        this.emit('toolCall', message.toolCall);
      }

    } catch (error) {
      console.error('❌ Failed to parse Gemini Live message:', error.message);
      const messageStr = data.toString();
      console.error(`   Raw message preview (first 300 chars): ${messageStr.substring(0, 300)}`);
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

    // 🔴 DIAGNOSTIC: Verify message is being sent
    if (this.ws && this.ws.readyState === 1) { // WebSocket.OPEN = 1
      this.ws.send(JSON.stringify(message));
      // Log sent messages at lower verbosity
      if (this._audioSentCount === undefined) this._audioSentCount = 0;
      this._audioSentCount++;
      if (this._audioSentCount <= 2) {
        console.log(`📤 Gemini audio message sent via WebSocket (OPEN state), total sent: ${this._audioSentCount}`);
      }
    } else {
      console.warn(`⚠️ WebSocket not in OPEN state - readyState=${this.ws?.readyState || 'null'}`);
    }
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
   * Update system instruction during active session - DISABLED
   *
   * ⚠️ CRITICAL: Gemini Live API does NOT support mid-session system instruction changes
   * Attempting to update causes:
   * - 5+ second connection delays
   * - Failed responses after user input
   * - Dropped turns
   *
   * System instruction must be set at session creation and kept static throughout
   *
   * @deprecated Do not call this method
   */
  updateSystemInstruction(newSystemInstruction) {
    // DISABLED: This breaks Gemini Live connections
    // Just log and return without making any changes
    console.warn(`⚠️ updateSystemInstruction() disabled - Gemini Live doesn't support mid-session updates`);
    return;
  }

  /**
   * Close the session
   * Gracefully disconnect without triggering auto-reconnect (FIX 3)
   */
  close() {
    this.isIntentionalDisconnect = true; // Prevent auto-reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    console.log('✅ Gemini Live session closed intentionally');
  }
}

/**
 * Create a Gemini Live session with agent configuration
 * Handles Context Caching for knowledge documents
 * @async
 * @param {Object} agent - Agent document from MongoDB
 * @param {Array} knowledgeDocs - Knowledge documents from DB (optional)
 * @param {Object} voiceConfig - Voice customization config (optional)
 * @param {String} leadName - Lead's full name for personalized welcome (optional) - Bug 2.2
 * @returns {Promise<GeminiLiveSession>} - Configured session
 */
export const createGeminiLiveSession = async (agent, knowledgeDocs = [], voiceConfig = null, leadName = null) => {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not configured');
  }

  const systemInstruction = buildSystemInstruction(agent, knowledgeDocs, voiceConfig, leadName);
  const voice = mapAgentVoiceToGemini(agent.voiceProfile?.voiceId || agent.voiceId);

  // ✅ CRITICAL FIX: Use singleton for deduplication (saves 90% on cache creation)
  // Context Caching: Cache system instruction + knowledge docs once, reuse on every call
  let cacheId = null;
  try {
    cacheId = await sharedCachingService.getOrCreateCache(
      agent._id.toString(),
      systemInstruction,  // Now cache BOTH instruction and knowledge
      knowledgeDocs || []
    );
    if (cacheId) {
      console.log(`✅ Using Explicit Context Caching for 90% cost savings`);
    }
  } catch (err) {
    console.warn('⚠️ Context Caching failed, continuing without cache:', err.message);
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
