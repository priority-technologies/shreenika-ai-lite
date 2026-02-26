/**
 * Twilio Media Stream Handler
 *
 * Handles WebSocket connections from Twilio Media Streams,
 * processes audio, and bridges to Gemini Live API.
 *
 * Twilio Media Streams Reference: https://www.twilio.com/docs/voice/media-streams
 */

import { WebSocketServer } from 'ws';
import { twilioToGemini, geminiToTwilio, createTwilioMediaMessage, upsample8kTo16k, downsample24kTo8k, encodeMulawBuffer } from './audio.converter.js';
import { VoiceService } from './voice.service.js';
import { createCallControl, analyzeAudioLevel } from './call.control.service.js';
import AudioRouter from '../voice/audio.router.js';
import Call from './call.model.js';
import Agent from '../agent/agent.model.js';
import { handleTestAgentUpgrade } from './test-agent.handler.js';

// Store active sessions
// CRITICAL FIX (2026-02-19): Export for use by twilio.controller.js pre-initialization
export const activeSessions = new Map();

/**
 * Downsample audio from 44100 Hz to 16000 Hz
 * Used for SansPBX incoming audio (44100 Hz LINEAR16) → Gemini Live (16000 Hz required)
 *
 * SansPBX incoming: 44100 Hz LINEAR16 mono
 * Gemini Live requires: 16000 Hz
 * Ratio: 44100 / 16000 = 2.75
 *
 * @param {Buffer} audioBuffer - Input audio buffer (44100 Hz PCM 16-bit)
 * @returns {Buffer} - Output audio buffer (16000 Hz PCM 16-bit)
 */
function downsample44100to16k(audioBuffer) {
  const inputSamples = audioBuffer.length / 2; // 16-bit = 2 bytes per sample
  const outputSamples = Math.floor(inputSamples * 16000 / 44100);
  const outputBuffer = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    // Linear interpolation for better quality (not nearest-neighbor)
    const inputIndexExact = i * 44100 / 16000;
    const inputIndex = Math.floor(inputIndexExact);
    const fraction = inputIndexExact - inputIndex;

    const sample1 = audioBuffer.readInt16LE(Math.min(inputIndex, inputSamples - 1) * 2);
    const sample2 = inputIndex + 1 < inputSamples ? audioBuffer.readInt16LE((inputIndex + 1) * 2) : sample1;

    // Linear interpolation: blend between sample1 and sample2
    const interpolatedSample = Math.round(sample1 * (1 - fraction) + sample2 * fraction);
    outputBuffer.writeInt16LE(interpolatedSample, i * 2);
  }

  return outputBuffer;
}

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
  // 🔴 CRITICAL FIX (2026-02-21): Extract call SID from URL path
  // Twilio format: /media-stream/{callSid}
  // SansPBX format: /media-stream (no call ID - comes from 'answer' event)
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathParts = url.pathname.split('/').filter(Boolean); // Remove empty strings

  // For SansPBX: pathParts = ['media-stream'], use temporary ID
  // For Twilio: pathParts = ['media-stream', 'callSid'], use the callSid
  const callSid = pathParts.length > 1 ? pathParts[1] : `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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
    let audioRouter = null;
    let durationInterval = null;
    let isClosing = false;

    // SansPBX AudioSocket metadata
    let sansPbxMetadata = {
      streamId: null,
      channelId: null,
      callId: null,
      isSansPBX: false
    };

    // Handle Twilio Media Stream messages
    ws.on('message', async (data) => {
      try {
        // CRITICAL FIX (2026-02-20): Handle binary audio from SansPBX AudioSocket
        // SansPBX may send raw binary audio frames instead of Twilio's JSON format
        if (Buffer.isBuffer(data) && data.length > 0) {
          // Check if this is binary audio (not JSON)
          const firstByte = data[0];
          // JSON always starts with { (0x7B) or [ (0x5B)
          if (firstByte !== 0x7B && firstByte !== 0x5B) {
            // Binary audio from SansPBX AudioSocket
            if (voiceService) {
              // 🔴 CRITICAL FIX (2026-02-21): SansPBX sends 44100 Hz LINEAR16, NOT 8kHz
              // Manager confirmed from SansPBX tech team logs: incoming is 44100 Hz
              // Downsample to 16kHz for Gemini Live
              const pcm16k = downsample44100to16k(data);
              if (isVoiceActive(pcm16k)) {
                voiceService.sendAudio(pcm16k);
              }
            }
            return;
          }
        }

        const message = JSON.parse(data.toString());

        switch (message.event) {
          case 'connected':
            console.log(`📡 Media Stream connected event`);
            break;

          case 'answer':
            // SansPBX AudioSocket - call answered
            console.log(`✅ SansPBX call answered: ${message.callId}`);
            sansPbxMetadata.streamId = message.streamId;
            sansPbxMetadata.channelId = message.channelId;
            sansPbxMetadata.callId = message.callId;
            sansPbxMetadata.isSansPBX = true;
            console.log(`📞 SansPBX metadata stored: streamId=${message.streamId}, callId=${message.callId}`);

            // Initialize voice service for SansPBX
            try {
              const call = await Call.findOne({ providerCallId: message.callId });
              if (!call) {
                console.error(`❌ Call not found for SansPBX callId: ${message.callId}`);
                ws.close();
                return;
              }

              // Load agent voice config
              let voiceConfig = null;
              try {
                const agent = await Agent.findById(call.agentId);
                if (agent && agent.speechSettings) {
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
                  console.log(`🎙️ Voice customization loaded for SansPBX:`);
                  console.log(`   ├─ Characteristics: ${(voiceConfig.characteristics40.traits || []).join(', ') || 'none'}`);
                  console.log(`   ├─ Emotion Level: ${voiceConfig.characteristics40.emotions.toFixed(2)}`);
                  console.log(`   └─ Voice Speed: ${voiceConfig.speechSettings60.voiceSpeed.toFixed(2)}x`);
                }
              } catch (agentError) {
                console.warn(`⚠️ Could not load agent: ${agentError.message}`);
              }

              // Initialize VoiceService for SansPBX
              voiceService = new VoiceService(call._id, call.agentId, false, voiceConfig);
              console.log(`🚀 Creating VoiceService for SansPBX call: ${message.callId}`);

              // Initialize AudioRouter for SansPBX audio delivery
              audioRouter = new AudioRouter('sanspbx', {
                ws,
                sansPbxMetadata
              });
              console.log(`🎛️ AudioRouter initialized for SansPBX`);

              // Set up audio event handler - uses AudioRouter for delivery
              voiceService.on('audio', (audioBuffer) => {
                if (!sansPbxMetadata.isSansPBX || !audioRouter) return;

                // 🔴 DIAGNOSTIC: Log audio routing
                const success = audioRouter.routeAudio(audioBuffer);
                if (!success) {
                  console.warn(`⚠️ SansPBX audio routing failed for chunk`);
                }
              });

              voiceService.on('text', (text, role) => {
                console.log(`💬 [${role}]: ${text}`);
              });

              voiceService.on('error', (error) => {
                console.error(`❌ Voice service error:`, error.message);
              });

              voiceService.on('close', () => {
                console.log(`🔌 Voice service closed for SansPBX`);
                if (!isClosing) {
                  isClosing = true;
                  ws.close();
                }
              });

              // Initialize voice service
              await voiceService.initialize();
              console.log(`✅ VoiceService initialized for SansPBX: ${message.callId}`);

              // 🔗 Log state machine status
              if (voiceService.stateMachineAdapter) {
                const smState = voiceService.stateMachineAdapter.getCurrentState();
                console.log(`🎯 State Machine Initialized:`);
                console.log(`   ├─ Current State: ${smState?.value || 'UNKNOWN'}`);
                console.log(`   ├─ Interruption Sensitivity: ${smState?.context.interruptionSensitivity || 'N/A'}`);
                console.log(`   └─ Max Duration: ${smState?.context.maxCallDuration || 600}s`);
              } else {
                console.warn(`⚠️ State machine not initialized for this call`);
              }

              // Store session
              activeSessions.set(callSid, {
                streamSid: message.streamId,
                voiceService,
                callControl,
                audioRouter,
                ws,
                startTime: Date.now(),
                provider: 'SansPBX'
              });

              // Add logging when voice service closes
              if (audioRouter) {
                voiceService.on('close', () => {
                  // Log audio routing metrics on close
                  const metrics = audioRouter.getMetrics();
                  console.log(`\n📊 AUDIO ROUTING SUMMARY FOR ${metrics.provider.toUpperCase()}:`);
                  console.log(`   ├─ Total chunks sent: ${metrics.audioChunksSent}`);
                  console.log(`   ├─ Failed chunks: ${metrics.audioChunksFailed}`);
                  console.log(`   ├─ Success rate: ${metrics.successRate}`);
                  console.log(`   ├─ Total data: ${metrics.totalKBSent} KB`);
                  console.log(`   ├─ Duration: ${metrics.elapsedMs}ms`);
                  console.log(`   └─ Avg chunk size: ${metrics.averageBytesPerChunk} bytes\n`);
                });
              }

            } catch (error) {
              console.error(`❌ SansPBX VOICE SERVICE INITIALIZATION FAILED:`, error.message);
              ws.close();
            }
            break;

          case 'start':
            // SansPBX 'start' event OR Twilio 'start' event
            if (sansPbxMetadata.isSansPBX) {
              // SansPBX 'start' event - WebSocket ready for streaming
              console.log(`✅ SansPBX WebSocket ready for audio streaming`);
              console.log(`   ├─ mediaFormat: ${JSON.stringify(message.mediaFormat)}`);
              console.log(`   └─ channelId: ${message.channelId}`);
            } else {
              // Twilio 'start' event - initialize voice service
              streamSid = message.start.streamSid;
              const twilioCallSid = message.start.callSid;

            console.log(`🎙️ Stream started: ${streamSid}`);
            console.log(`📞 Twilio Call SID: ${twilioCallSid}`);

            try {
              // Find the call and initialize voice service
              // CRITICAL FIX (2026-02-19): Search by BOTH twilioCallSid (Twilio) and providerCallId (SansPBX)
              // The CallSid in the URL could be either a Twilio CallSid or a provider CallSid
              const call = await Call.findOne({
                $or: [
                  { twilioCallSid },
                  { providerCallId: twilioCallSid }
                ]
              });

              if (!call) {
                console.error(`❌ Call not found for SID: ${twilioCallSid}`);
                console.error(`   Searched in both twilioCallSid and providerCallId fields`);
                ws.close();
                return;
              }

              // Load agent to get speech settings (with timeout protection)
              let voiceConfig = null;
              try {
                const loadAgentPromise = Agent.findById(call.agentId);
                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Agent load timeout')), 5000)
                );
                const agent = await Promise.race([loadAgentPromise, timeoutPromise]);

                // Build voiceConfig from agent settings (40% characteristics + 60% speech settings)
                if (agent && agent.speechSettings) {
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
                  console.log(`🎙️ Voice customization loaded:`);
                  console.log(`   ├─ Characteristics: ${(voiceConfig.characteristics40.traits || []).join(', ') || 'none'}`);
                  console.log(`   ├─ Emotion Level: ${voiceConfig.characteristics40.emotions.toFixed(2)}`);
                  console.log(`   ├─ Voice Speed: ${voiceConfig.speechSettings60.voiceSpeed.toFixed(2)}x`);
                  console.log(`   └─ Background Noise: ${voiceConfig.speechSettings60.backgroundNoise}`);
                }
              } catch (agentError) {
                console.warn(`⚠️ Could not load agent speech settings: ${agentError.message}, continuing without voiceConfig`);
                // Continue without voiceConfig - don't break the call
              }

              // CRITICAL FIX (2026-02-19): Check if VoiceService was already pre-initialized
              // in /twilio/voice endpoint (for SansPBX which sends audio immediately)
              const existingSession = activeSessions.get(callSid);
              if (existingSession && existingSession.voiceService) {
                voiceService = existingSession.voiceService;
                console.log(`✅ Using pre-initialized VoiceService for call: ${callSid}`);
              } else {
                voiceService = new VoiceService(call._id, call.agentId, false, voiceConfig);
                console.log(`🚀 Creating new VoiceService for call: ${callSid}`);
              }

              // Initialize AudioRouter for Twilio audio delivery
              audioRouter = new AudioRouter('twilio', {
                ws,
                streamSid: twilioCallSid // Use call SID as router identifier
              });
              console.log(`🎛️ AudioRouter initialized for Twilio: ${streamSid}`);

              // Set up event handlers for Twilio (SansPBX audio handled in 'answer' case above)
              voiceService.on('audio', (audioBuffer) => {
                // CRITICAL FIX (2026-02-21): SansPBX audio handled in 'answer' event
                // This handler is for Twilio Media Streams only

                if (!audioRouter) {
                  console.warn(`⚠️ AudioRouter not initialized for Twilio`);
                  return;
                }

                // 🔴 DIAGNOSTIC: Log audio routing
                const success = audioRouter.routeAudio(audioBuffer);
                if (!success) {
                  console.warn(`⚠️ Twilio audio routing failed for chunk`);
                }
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

              // Initialize the voice service (only if not already pre-initialized)
              // CRITICAL FIX (2026-02-19): Pre-initialized VoiceService is already ready
              if (!existingSession || !existingSession.voiceService) {
                await voiceService.initialize();
              } else {
                console.log(`✅ VoiceService already initialized, skipping init`);
              }

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
                audioRouter,
                ws,
                startTime: Date.now()
              });

              console.log(`✅ Voice service initialized for call: ${call._id}`);

              // Add logging when voice service closes
              const originalClose = voiceService.close ? voiceService.close.bind(voiceService) : null;
              if (audioRouter && originalClose) {
                voiceService.on('close', () => {
                  // Log audio routing metrics on close
                  const metrics = audioRouter.getMetrics();
                  console.log(`\n📊 AUDIO ROUTING SUMMARY FOR ${metrics.provider.toUpperCase()}:`);
                  console.log(`   ├─ Total chunks sent: ${metrics.audioChunksSent}`);
                  console.log(`   ├─ Failed chunks: ${metrics.audioChunksFailed}`);
                  console.log(`   ├─ Success rate: ${metrics.successRate}`);
                  console.log(`   ├─ Total data: ${metrics.totalKBSent} KB`);
                  console.log(`   ├─ Duration: ${metrics.elapsedMs}ms`);
                  console.log(`   └─ Avg chunk size: ${metrics.averageBytesPerChunk} bytes\n`);
                });
              }

            } catch (error) {
              console.error(`\n❌ VOICE SERVICE INITIALIZATION FAILED`);
              console.error(`   ├─ Call ID: ${call._id}`);
              console.error(`   ├─ Call SID: ${twilioCallSid}`);
              console.error(`   ├─ Error: ${error.message}`);
              console.error(`   └─ Stack: ${error.stack}\n`);

              // Update call status to FAILED so campaign knows not to wait
              try {
                const failedCall = await Call.findByIdAndUpdate(
                  call._id,
                  {
                    status: 'FAILED',
                    endedAt: new Date(),
                    failureReason: `Voice service init failed: ${error.message}`
                  },
                  { new: true }
                );
                console.log(`📞 Call marked as FAILED:`, failedCall._id);
              } catch (updateErr) {
                console.error(`Failed to update call status:`, updateErr.message);
              }

              ws.close();
            }
            } // Close else block for Twilio
            break;

          case 'media':
            // Audio data from caller (both Twilio and SansPBX)
            try {
              let pcmBuffer = null;
              let audioSource = 'unknown';

              if (sansPbxMetadata.isSansPBX && message.payload) {
                // 🔴 CRITICAL FIX (2026-02-21): Handle SansPBX incoming audio
                // Manager confirmed from SansPBX tech team logs: incoming is 44100 Hz LINEAR16, NOT 8kHz!
                // SansPBX sends base64-encoded PCM Linear 44100Hz 16-bit mono audio
                audioSource = 'SansPBX';

                // Decode base64 to PCM buffer
                const audioBuffer = Buffer.from(message.payload, 'base64');

                // Downsample 44100Hz → 16kHz for Gemini Live
                pcmBuffer = downsample44100to16k(audioBuffer);

                console.log(`🎤 [SansPBX] Received media chunk #${message.chunk}: ${message.payload.length} chars base64 (44100Hz) → ${pcmBuffer.length} bytes PCM 16kHz`);
              } else if (!sansPbxMetadata.isSansPBX && message.media && message.media.payload) {
                // Twilio Media Streams format
                audioSource = 'Twilio';
                pcmBuffer = twilioToGemini(message.media.payload);
              } else {
                return; // No audio data to process
              }

              if (!voiceService || !pcmBuffer) return;

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
              if (!isVoiceActive(pcmBuffer)) {
                // Silence detected - skip this chunk
                return;
              }

              // Send to Gemini Live for processing
              voiceService.sendAudio(pcmBuffer);
            } catch (mediaError) {
              console.error(`❌ Error processing ${audioSource} media:`, mediaError.message);
            }
            break;

          case 'dtmf':
            // DTMF (phone button) pressed during call
            if (sansPbxMetadata.isSansPBX) {
              console.log(`📱 [SansPBX] DTMF digit received: ${message.digit} (duration: ${message.dtfDurationMs}ms)`);
              // TODO: Handle DTMF input if needed (e.g., menu navigation)
            }
            break;

          case 'mark':
            // Mark event (used for tracking playback)
            if (!sansPbxMetadata.isSansPBX) {
              console.log(`🏷️ Mark received: ${message.mark?.name}`);
            }
            break;

          case 'stop':
            // Call stopped/disconnected
            if (sansPbxMetadata.isSansPBX) {
              console.log(`🛑 [SansPBX] Call stopped by ${message.disconnectedBy}`);
              console.log(`   └─ callId: ${message.callId}, timestamp: ${message.timestamp}`);
            } else {
              console.log(`🛑 Stream stopping`);
            }

            // Clean up resources
            if (!isClosing) {
              isClosing = true;
              if (voiceService) {
                await voiceService.close();
              }
              if (durationInterval) {
                clearInterval(durationInterval);
              }
              ws.close();
            }
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

  // Do NOT register upgrade handler here - it will be registered as a unified handler in server.js
  // This prevents duplicate handlers from overwriting each other (Node.js only calls the last registered)

  console.log('✅ Media Stream WebSocket server created');

  return wss;
};

/**
 * Register unified WebSocket upgrade handler
 * Handles both media streams and test agent connections with a single handler
 * This prevents duplicate upgrade handlers from overwriting each other
 *
 * @param {http.Server} httpServer - HTTP server instance
 * @param {WebSocketServer} mediaStreamWss - Media stream WebSocket server
 */
export const registerUnifiedUpgradeHandler = (httpServer, mediaStreamWss) => {
  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

    // Handle media streams (Twilio + SansPBX)
    if (pathname === '/media-stream' || pathname.startsWith('/media-stream/')) {
      handleMediaStreamUpgrade(request, socket, head, mediaStreamWss);
      return;
    }

    // Handle test agent WebSocket connections
    if (pathname.startsWith('/test-agent/')) {
      const sessionId = pathname.split('/')[2]; // Extract sessionId from /test-agent/{sessionId}
      const testWss = new WebSocketServer({ noServer: true });
      testWss.handleUpgrade(request, socket, head, (ws) => {
        handleTestAgentUpgrade(ws, request, sessionId);
      });
      return;
    }

    // Unknown path - close socket
    socket.destroy();
  });

  console.log('✅ Unified WebSocket upgrade handler registered (media-stream + test-agent)');
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
