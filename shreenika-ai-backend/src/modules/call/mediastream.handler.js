/**
 * Twilio Media Stream Handler
 *
 * Handles WebSocket connections from Twilio Media Streams,
 * processes audio, and bridges to Gemini Live API.
 *
 * Twilio Media Streams Reference: https://www.twilio.com/docs/voice/media-streams
 */

import { WebSocketServer } from 'ws';
import { twilioToGemini, geminiToTwilio, createTwilioMediaMessage } from './audio.converter.js';
import { VoiceService } from './voice.service.js';
import { createCallControl, analyzeAudioLevel } from './call.control.service.js';
import Call from './call.model.js';
import Agent from '../agent/agent.model.js';

// Store active sessions
const activeSessions = new Map();

/**
 * Voice Activity Detection (VAD) - Silence Detection for Real Calls
 * Reduces Gemini Live billing by ~30% by not sending silent/background noise frames
 *
 * @param {Buffer} audioBuffer - Input audio buffer (PCM 16-bit)
 * @returns {boolean} - True if audio contains voice, false if silent
 */
function isVoiceActive(audioBuffer) {
  if (!audioBuffer || audioBuffer.length === 0) return false;

  // Calculate RMS (Root Mean Square) to detect voice activity
  let sumSquares = 0;
  const samples = audioBuffer.length / 2; // 16-bit = 2 bytes per sample

  for (let i = 0; i < samples; i++) {
    const sample = audioBuffer.readInt16LE(i * 2) / 32768.0; // Normalize to [-1, 1]
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / samples);
  const VOICE_THRESHOLD = 0.003; // ~0.3% of full scale amplitude (lowered from 0.008 to catch actual speech)

  return rms > VOICE_THRESHOLD; // Voice active if RMS exceeds threshold
}

/**
 * Handle WebSocket upgrade for Media Streams
 * @param {http.IncomingMessage} request - HTTP request
 * @param {net.Socket} socket - Network socket
 * @param {Buffer} head - First packet of upgraded stream
 * @param {http.Server} httpServer - HTTP server instance
 */
export const handleMediaStreamUpgrade = (request, socket, head, wss) => {
  // Extract call SID from URL path
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathParts = url.pathname.split('/');
  const callSid = pathParts[pathParts.length - 1];

  console.log(`📞 Media Stream upgrade request for call: ${callSid}`);

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request, callSid);
  });
};

/**
 * Create WebSocket server for Twilio Media Streams
 * @param {http.Server} httpServer - HTTP server
 * @returns {WebSocketServer} - WebSocket server instance
 */
export const createMediaStreamServer = (httpServer) => {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', async (ws, request, callSid) => {
    console.log(`🔌 Twilio Media Stream connected: ${callSid}`);

    let streamSid = null;
    let voiceService = null;
    let callControl = null;
    let durationInterval = null;
    let isClosing = false;

    // Handle Twilio Media Stream messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.event) {
          case 'connected':
            console.log(`📡 Media Stream connected event`);
            break;

          case 'start':
            // Stream started - initialize voice service
            streamSid = message.start.streamSid;
            const twilioCallSid = message.start.callSid;

            console.log(`🎙️ Stream started: ${streamSid}`);
            console.log(`📞 Twilio Call SID: ${twilioCallSid}`);

            try {
              // Find the call and initialize voice service
              const call = await Call.findOne({ twilioCallSid });

              if (!call) {
                console.error(`❌ Call not found for SID: ${twilioCallSid}`);
                ws.close();
                return;
              }

              // Load agent to get speech settings
              const agent = await Agent.findById(call.agentId);

              // Build voiceConfig from agent settings (40% characteristics + 60% speech settings)
              let voiceConfig = null;
              if (agent) {
                voiceConfig = {
                  characteristics40: {
                    traits: agent.characteristics || [],
                    emotions: agent.speechSettings?.emotions ?? 0.5
                  },
                  speechSettings60: {
                    voiceSpeed: agent.speechSettings?.voiceSpeed ?? 1.0,
                    responsiveness: agent.speechSettings?.responsiveness ?? 0.5,
                    interruptionSensitivity: agent.speechSettings?.interruptionSensitivity ?? 0.5,
                    backgroundNoise: agent.speechSettings?.backgroundNoise || 'office'
                  }
                };
                console.log(`🎙️ Voice customization loaded for real call:`);
                console.log(`   ├─ Characteristics: ${(voiceConfig.characteristics40.traits || []).join(', ') || 'none'}`);
                console.log(`   ├─ Emotion Level: ${voiceConfig.characteristics40.emotions.toFixed(2)}`);
                console.log(`   ├─ Voice Speed: ${voiceConfig.speechSettings60.voiceSpeed.toFixed(2)}x`);
                console.log(`   ├─ Responsiveness: ${voiceConfig.speechSettings60.responsiveness.toFixed(2)}`);
                console.log(`   └─ Background Noise: ${voiceConfig.speechSettings60.backgroundNoise}`);
              }

              voiceService = new VoiceService(call._id, call.agentId, false, voiceConfig);

              // Set up event handlers
              voiceService.on('audio', (audioBuffer) => {
                // Convert Gemini audio to Twilio format and send
                const base64Audio = geminiToTwilio(audioBuffer);
                const mediaMessage = createTwilioMediaMessage(streamSid, base64Audio);
                ws.send(JSON.stringify(mediaMessage));
              });

              voiceService.on('text', (text, role) => {
                console.log(`💬 [${role}]: ${text}`);
              });

              voiceService.on('error', (error) => {
                console.error(`❌ Voice service error:`, error.message);
              });

              voiceService.on('close', () => {
                console.log(`🔌 Voice service closed`);
                if (!isClosing) {
                  isClosing = true;
                  ws.close();
                }
              });

              // Initialize the voice service (connects to Gemini)
              await voiceService.initialize();

              // Initialize CallControl for duration and silence monitoring
              callControl = await createCallControl(call._id, call.agentId);

              // Start duration monitoring interval (check every 30 seconds)
              durationInterval = setInterval(() => {
                if (!callControl || !callControl.isActive) {
                  clearInterval(durationInterval);
                  return;
                }
                callControl.broadcastCallStatus();
                if (callControl.isDurationExceeded()) {
                  clearInterval(durationInterval);
                  console.log(`⏱️ Max call duration exceeded, ending call`);
                  callControl.endCall(call._id, 'max-duration-exceeded');
                  if (!isClosing) {
                    isClosing = true;
                    ws.close();
                  }
                }
              }, 30000);

              // Store session
              activeSessions.set(callSid, {
                streamSid,
                voiceService,
                callControl,
                ws,
                startTime: Date.now()
              });

              console.log(`✅ Voice service initialized for call: ${call._id}`);

            } catch (error) {
              console.error(`❌ Failed to initialize voice service:`, error.message);
              ws.close();
            }
            break;

          case 'media':
            // Audio data from caller
            if (voiceService && message.media && message.media.payload) {
              // Convert Twilio audio to Gemini format
              const pcmBuffer = twilioToGemini(message.media.payload);

              // Silence detection on each chunk (if CallControl enabled)
              if (callControl) {
                const audioLevel = analyzeAudioLevel(pcmBuffer);
                const silenceResult = callControl.updateSilenceDetection(audioLevel);
                if (silenceResult.silenceDetected) {
                  console.log(`🔇 Silence detected, ending call`);
                  callControl.endCall(call._id, 'silence-detected');
                  if (!isClosing) {
                    isClosing = true;
                    ws.close();
                  }
                  break;
                }
              }

              // ✅ VAD (Voice Activity Detection): Skip silent frames
              // Reduces Gemini billing by ~30% (silence doesn't need AI processing)
              // Threshold lowered to 0.003 to avoid filtering actual speech
              if (!isVoiceActive(pcmBuffer)) {
                // Silence detected - skip this chunk (saves ~$0.3/min on silence)
                return;

              // Send to Gemini Live
              voiceService.sendAudio(pcmBuffer);
            }
            break;

          case 'mark':
            // Mark event (used for tracking playback)
            console.log(`🏷️ Mark received: ${message.mark?.name}`);
            break;

          case 'stop':
            // Stream stopping
            console.log(`🛑 Stream stopping`);
            break;

          default:
            console.log(`📨 Unknown event: ${message.event}`);
        }

      } catch (error) {
        console.error(`❌ Error processing message:`, error.message);
      }
    });

    // Handle WebSocket close
    ws.on('close', async () => {
      console.log(`🔌 Twilio Media Stream disconnected: ${callSid}`);

      // Clean up duration monitoring
      if (durationInterval) {
        clearInterval(durationInterval);
      }

      // Clean up CallControl
      if (callControl) {
        callControl.isActive = false;
      }

      if (voiceService) {
        await voiceService.close();
      }

      activeSessions.delete(callSid);
      isClosing = true;
    });

    // Handle WebSocket errors
    ws.on('error', (error) => {
      console.error(`❌ Twilio WebSocket error:`, error.message);
    });
  });

  // Handle upgrade requests from HTTP server
  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

    if (pathname.startsWith('/media-stream/')) {
      handleMediaStreamUpgrade(request, socket, head, wss);
    }
    // Note: Socket.IO handles its own upgrades, so we only handle /media-stream
  });

  console.log('✅ Media Stream WebSocket server created');

  return wss;
};

/**
 * Get active session by call SID
 * @param {string} callSid - Twilio call SID
 * @returns {Object|null} - Session object or null
 */
export const getActiveSession = (callSid) => {
  return activeSessions.get(callSid) || null;
};

/**
 * Get count of active sessions
 * @returns {number} - Number of active sessions
 */
export const getActiveSessionCount = () => {
  return activeSessions.size;
};

/**
 * Close all active sessions
 */
export const closeAllSessions = async () => {
  for (const [callSid, session] of activeSessions) {
    console.log(`🛑 Closing session: ${callSid}`);

    if (session.voiceService) {
      await session.voiceService.close();
    }

    if (session.ws) {
      session.ws.close();
    }
  }

  activeSessions.clear();
};

export default {
  createMediaStreamServer,
  handleMediaStreamUpgrade,
  getActiveSession,
  getActiveSessionCount,
  closeAllSessions
};
