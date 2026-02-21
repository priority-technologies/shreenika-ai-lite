/**
 * GeminiLiveClient.js
 * ============================================================
 * Gemini Live API WebSocket Client
 * Handles real-time audio streaming with Gemini 2.5 Flash
 *
 * Based on: SMART_AGENT_BLUEPRINT.md (Version 2.0)
 * Author: Claude Code
 * Date: 2026-02-23
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class GeminiLiveClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.ws = null;
    this.sessionId = null;
    this.callId = null;
    this.agentConfig = null;
    this.isConnected = false;
    this.audioQueue = [];
    this.systemPrompt = null;

    // Event handlers
    this.listeners = {
      onAudioChunk: null,
      onSessionReady: null,
      onError: null,
      onClosed: null
    };

    // Timing
    this.connectionStartTime = null;
    this.firstTokenTime = null;
  }

  /**
   * Connect to Gemini Live API
   */
  async connect(callId, agentConfig) {
    return new Promise((resolve, reject) => {
      this.callId = callId;
      this.agentConfig = agentConfig;
      this.connectionStartTime = Date.now();

      try {
        const wsUrl = `wss://generativelanguage.googleapis.com/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

        console.log(`\n📡 [${callId}] Connecting to Gemini Live...`);

        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          console.log(`✅ WebSocket connected`);

          // Send initial setup message
          this._setupSession();

          // Set timeout for session ready
          const timeout = setTimeout(() => {
            if (!this.isConnected) {
              reject(new Error('Gemini session setup timeout'));
            }
          }, 5000);

          this.onSessionReady = () => {
            clearTimeout(timeout);
            resolve();
          };
        });

        this.ws.on('message', (data) => {
          this._handleMessage(data);
        });

        this.ws.on('error', (error) => {
          console.error(`❌ WebSocket error: ${error.message}`);
          if (this.listeners.onError) {
            this.listeners.onError(error);
          }
          reject(error);
        });

        this.ws.on('close', () => {
          console.log(`🔌 WebSocket closed`);
          this.isConnected = false;
          if (this.listeners.onClosed) {
            this.listeners.onClosed();
          }
        });

      } catch (error) {
        console.error(`❌ Connection failed: ${error.message}`);
        reject(error);
      }
    });
  }

  /**
   * Setup initial session
   */
  _setupSession() {
    const setupMessage = {
      setup: {
        model: 'models/gemini-2.5-flash-preview-native-audio-dialog',
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 150,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Puck' // Gemini Live voices: Puck, Charon, Kore, Fenrir, Aoede, Leda, Orus, Zephyr
              }
            }
          }
        },
        systemInstruction: {
          parts: [
            {
              text: this._buildSystemPrompt()
            }
          ]
        }
      }
    };

    console.log(`   Sending setup message...`);
    this.ws.send(JSON.stringify(setupMessage));
  }

  /**
   * Build system prompt from agent config and current principle
   */
  _buildSystemPrompt() {
    const config = this.agentConfig;

    return `
    You are ${config.agentName}, a ${config.primaryObjective} specialist.

    PERSONALITY:
    - Role: ${config.agentRole || 'Professional'}
    - Style: ${config.conversationStyle || 'Consultative'}
    - Personality: ${config.agentPersonality || 'Professional and helpful'}
    - Industry: ${config.industryContext || 'General'}
    - Target: ${config.targetAudience || 'Customers'}

    VOICE SETTINGS:
    - Tone: ${config.voiceCharacteristics?.tone || 'Professional'}
    - Emotion Level: ${config.voiceCharacteristics?.emotionLevel || 0.5} (0=calm, 1=enthusiastic)
    - Speed: ${config.voiceCharacteristics?.speed || 1.0}x

    COMMUNICATION RULES:
    1. Keep responses concise (1-3 sentences maximum)
    2. Ask questions to keep conversation flowing
    3. Listen more, talk less
    4. Be genuine and authentic
    5. Match the customer's tone
    6. If customer speaks in ${config.primaryLanguage}, respond in same language
    7. Use customer's name when appropriate
    8. Never sound like a script

    ${config.systemPrompt ? `CUSTOM INSTRUCTIONS:\n${config.systemPrompt}` : ''}

    KNOWLEDGE BASE:
    ${config.knowledgeBase && config.knowledgeBase.length > 0
      ? config.knowledgeBase.map(doc => `- ${doc.name}: ${doc.content.substring(0, 500)}`).join('\n')
      : '- No knowledge base provided'
    }
    `;
  }

  /**
   * Handle incoming messages from Gemini
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data);

      if (message.setupComplete) {
        console.log(`   ✅ Session ready (setup complete)`);
        this.isConnected = true;
        if (this.onSessionReady) {
          this.onSessionReady();
        }
      }

      if (message.serverContent) {
        const content = message.serverContent;

        // Log first token timing
        if (!this.firstTokenTime && content.turnComplete === false) {
          this.firstTokenTime = Date.now();
          const latency = this.firstTokenTime - (this.currentTurnStartTime || this.connectionStartTime);
          console.log(`      ⚡ First token: ${latency}ms`);
        }

        // Handle audio output
        if (content.modelStreamStatus === 'STREAMING') {
          // Audio is being streamed
          if (this.listeners.onAudioChunk) {
            this.listeners.onAudioChunk(content);
          }
        }

        // Handle turn completion
        if (content.turnComplete === true) {
          console.log(`      ✅ Turn complete`);
        }
      }

      if (message.error) {
        console.error(`❌ Gemini error: ${message.error.message}`);
        if (this.listeners.onError) {
          this.listeners.onError(new Error(message.error.message));
        }
      }

    } catch (error) {
      console.error(`❌ Error parsing message: ${error.message}`);
    }
  }

  /**
   * Send audio data to Gemini
   */
  sendAudio(audioChunk) {
    if (!this.isConnected) {
      console.warn(`⚠️  Not connected to Gemini`);
      return;
    }

    try {
      const message = {
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/pcm',
                    data: audioChunk.toString('base64') // PCM data as base64
                  }
                }
              ]
            }
          ],
          turnComplete: false // Will be set to true when user stops speaking
        }
      };

      this.ws.send(JSON.stringify(message));

    } catch (error) {
      console.error(`❌ Error sending audio: ${error.message}`);
      if (this.listeners.onError) {
        this.listeners.onError(error);
      }
    }
  }

  /**
   * Send text message to Gemini
   */
  async sendMessage(options) {
    const {
      transcript,
      history,
      principle,
      agentConfig,
      streaming = true
    } = options;

    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Not connected to Gemini'));
        return;
      }

      this.currentTurnStartTime = Date.now();
      this.firstTokenTime = null;

      try {
        // Build context from conversation history
        const contextParts = [];

        if (history && history.length > 0) {
          contextParts.push({
            text: `Previous conversation:\n${
              history
                .slice(-3) // Last 3 turns for context
                .map(turn => `Customer: ${turn.userMessage}\nAgent: [responded]`)
                .join('\n')
            }`
          });
        }

        // Add principle guidance
        if (principle) {
          contextParts.push({
            text: `Current psychological principle: ${principle}`
          });
        }

        // Send message
        const message = {
          clientContent: {
            turns: [
              {
                role: 'user',
                parts: [
                  {
                    text: transcript || 'Hello'
                  },
                  ...contextParts
                ]
              }
            ],
            turnComplete: true // User has finished speaking
          }
        };

        this.ws.send(JSON.stringify(message));

        // For now, return a promise that resolves when we get audio back
        // In production, this would be async streaming
        const timeout = setTimeout(() => {
          resolve({
            audioStream: null, // Placeholder
            text: 'Response received'
          });
        }, 100);

        this.messageResolve = resolve;
        this.messageReject = reject;

      } catch (error) {
        console.error(`❌ Error sending message: ${error.message}`);
        reject(error);
      }
    });
  }

  /**
   * Stop audio output
   */
  stopAudio() {
    console.log(`   🛑 Stopping audio output`);
    // Implementation depends on Gemini Live API specifics
  }

  /**
   * Play audio (placeholder - actual playback handled by state machine)
   */
  async playAudio(audioStream, options = {}) {
    return new Promise((resolve) => {
      const { onInterruption, callId } = options;

      console.log(`   ▶️  Audio playback: ${audioStream.substring ? audioStream.substring(0, 20) + '...' : 'stream'}`);

      // Simulate playback (in production, use actual audio player)
      setTimeout(() => {
        console.log(`   ✅ Audio playback complete`);
        resolve();
      }, 3000); // Simulate 3 second playback
    });
  }

  /**
   * Create audio player instance
   */
  createAudioPlayer() {
    return {
      play: async (audioData) => {
        console.log(`   ▶️  Playing audio (${audioData.length} bytes)`);
        return new Promise(resolve => setTimeout(resolve, 2000));
      },
      stop: () => {
        console.log(`   ⏹️  Stopped audio`);
      },
      waitForCompletion: async () => {
        return new Promise(resolve => setTimeout(resolve, 2000));
      }
    };
  }

  /**
   * Disconnect from Gemini
   */
  async disconnect() {
    return new Promise((resolve) => {
      if (this.ws) {
        console.log(`\n🔌 Disconnecting from Gemini...`);
        this.ws.close();

        const timeout = setTimeout(() => {
          resolve();
        }, 1000);

        this.ws.on('close', () => {
          clearTimeout(timeout);
          console.log(`   ✅ Disconnected`);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Register event listener
   */
  on(event, callback) {
    if (this.listeners.hasOwnProperty(`on${event.charAt(0).toUpperCase() + event.slice(1)}`)) {
      this.listeners[`on${event.charAt(0).toUpperCase() + event.slice(1)}`] = callback;
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      sessionId: this.sessionId,
      callId: this.callId,
      connectionDuration: this.isConnected ? Date.now() - this.connectionStartTime : 0
    };
  }
}

module.exports = GeminiLiveClient;
