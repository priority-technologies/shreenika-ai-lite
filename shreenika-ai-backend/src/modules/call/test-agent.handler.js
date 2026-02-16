import Agent from '../agent/agent.model.js';
import { VoiceService } from './voice.service.js';
import { testAgentSessions } from './test-agent.controller.js';

/**
 * Handles WebSocket connections for browser-based test agent calls
 * Bridges browser audio <-> Gemini Live API
 *
 * Audio flow:
 * Browser (48kHz PCM) → Resample to 16kHz → VoiceService → Gemini Live
 * Gemini Live → 24kHz PCM → Resample to 48kHz → Browser
 */
export const handleTestAgentUpgrade = async (ws, req, sessionId) => {
  console.log(`🔌 Test Agent: WebSocket connecting - Session: ${sessionId}`);

  const session = testAgentSessions.get(sessionId);
  if (!session) {
    console.warn(`❌ Test Agent: Invalid session - ${sessionId}`);
    ws.close(1008, 'Invalid or expired session');
    return;
  }

  let voiceService = null;
  let audioProcessor = null;
  let maxDurationTimer = null;

  try {
    // Fetch agent configuration
    const agent = await Agent.findById(session.agentId);
    if (!agent) {
      console.error(`❌ Test Agent: Agent not found - ${session.agentId}`);
      ws.close(1008, 'Agent not found');
      return;
    }

    console.log(`✅ Test Agent: Agent loaded - ${agent.name}`);

    // Apply voice configuration from session (40-60 ratio)
    if (session.voiceConfig) {
      agent.speechSettings = {
        ...agent.speechSettings,
        voiceSpeed: session.voiceConfig.speechSettings60.voiceSpeed,
        responsiveness: session.voiceConfig.speechSettings60.responsiveness,
        interruptionSensitivity: session.voiceConfig.speechSettings60.interruptionSensitivity,
        emotions: session.voiceConfig.characteristics40.emotions,
        backgroundNoise: session.voiceConfig.speechSettings60.backgroundNoise
      };

      agent.characteristics = session.voiceConfig.characteristics40.traits;

      console.log(`🎨 Test Agent: Voice config applied (40-60 ratio)`);
      console.log(`   ├─ Characteristics (40%): ${agent.characteristics.join(', ') || 'none'}`);
      console.log(`   └─ Speech Settings (60%): Speed=${agent.speechSettings.voiceSpeed}, Emotions=${agent.speechSettings.emotions}`);
    }

    // Apply role prompt from session (NO knowledge base in test mode)
    if (session.rolePrompt) {
      agent.prompt = session.rolePrompt;
      console.log(`📋 Test Agent: Role prompt set from agent config`);
    }

    // Create VoiceService in test mode with voice customization
    // isTestMode = true: skips Call document lookup
    // voiceConfig: Applied voice customization (40-60 ratio)
    voiceService = new VoiceService(sessionId, session.agentId, true, session.voiceConfig);

    // Attach error handler BEFORE initialize so setup errors aren't lost
    voiceService.on('error', (error) => {
      console.error('❌ Test Agent: Voice service error:', error.message || error);
      try {
        ws.send(JSON.stringify({
          type: 'ERROR',
          message: error.message || 'Voice service error'
        }));
      } catch (sendError) {
        console.error('Error sending error message:', sendError);
      }
    });

    console.log(`🎙️  Test Agent: Initializing voice service (test mode with voice customization)...`);
    await voiceService.initialize();
    console.log(`✅ Test Agent: Voice service ready - Gemini Live session confirmed active`);

    // Auto-disconnect after max duration
    maxDurationTimer = setTimeout(() => {
      console.log(`⏰ Test Agent: Max duration (5 min) reached - ${sessionId}`);
      try {
        ws.send(JSON.stringify({ type: 'MAX_DURATION_REACHED' }));
        ws.close(1000, 'Max duration reached');
      } catch (error) {
        console.error('Error sending max duration message:', error);
      }
    }, session.maxDuration);

    // Handle incoming audio from browser
    let audioChunksSentToGemini = 0;
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);

        if (message.type === 'AUDIO' && message.audio) {
          // Browser sends PCM audio (base64 encoded, typically 48kHz)
          const browserAudio = Buffer.from(message.audio, 'base64');
          const browserSampleRate = message.sampleRate || 48000;

          // Resample from browser format (48kHz) to Gemini format (16kHz)
          const geminiAudio = resampleAudio(browserAudio, browserSampleRate, 16000);

          // Send to Gemini Live (VoiceService logs if audio is dropped)
          if (voiceService) {
            voiceService.sendAudio(geminiAudio);
            audioChunksSentToGemini++;
            if (audioChunksSentToGemini === 1) {
              console.log(`🎤 Test Agent: First audio chunk sent to VoiceService (${geminiAudio.length} bytes)`);
            }
          }
        } else if (message.type === 'PING') {
          // Keep-alive ping
          ws.send(JSON.stringify({ type: 'PONG' }));
        }
      } catch (error) {
        console.error('❌ Test Agent: Error processing message:', error);
        try {
          ws.send(JSON.stringify({
            type: 'ERROR',
            message: 'Failed to process audio'
          }));
        } catch (sendError) {
          console.error('Error sending error message:', sendError);
        }
      }
    });

    // Handle audio output from Gemini Live
    if (voiceService) {
      voiceService.on('audio', (audioData) => {
        try {
          // Gemini sends PCM 24kHz, resample to browser format (48kHz)
          const browserAudio = resampleAudio(audioData, 24000, 48000);

          ws.send(JSON.stringify({
            type: 'AUDIO',
            audio: browserAudio.toString('base64'),
            sampleRate: 48000
          }));
        } catch (error) {
          console.error('❌ Test Agent: Error sending audio:', error);
        }
      });

      // Handle transcript events (optional, for debugging only)
      voiceService.on('transcript', (transcript) => {
        console.log(`📝 Test Agent Transcript:`, transcript);
        // NOT sent to frontend per requirements
      });

      // Note: error handler already attached before initialize()
    }

    // Handle WebSocket connection errors
    ws.on('error', (error) => {
      console.error(`❌ Test Agent: WebSocket error - ${sessionId}:`, error.message);
    });

    // Handle WebSocket closure
    ws.on('close', (code, reason) => {
      console.log(`🔌 Test Agent: WebSocket closed - ${sessionId} (Code: ${code}, Reason: ${reason})`);

      // Cleanup
      if (maxDurationTimer) {
        clearTimeout(maxDurationTimer);
      }

      if (voiceService) {
        try {
          voiceService.close();
        } catch (error) {
          console.error('Error during voice service cleanup:', error);
        }
      }

      // Remove session from map (if still exists)
      if (testAgentSessions.has(sessionId)) {
        const sess = testAgentSessions.get(sessionId);
        if (sess && sess.expiryTimer) {
          clearTimeout(sess.expiryTimer);
        }
        testAgentSessions.delete(sessionId);
      }
    });

    console.log(`✅ Test Agent: WebSocket connected and ready - ${sessionId}`);

  } catch (error) {
    console.error(`❌ Test Agent: Setup error - ${sessionId}:`, error.message);

    // Cleanup on error
    if (maxDurationTimer) {
      clearTimeout(maxDurationTimer);
    }

    if (voiceService) {
      try {
        voiceService.close();
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }
    }

    try {
      ws.close(1011, error.message || 'Failed to initialize test agent');
    } catch (closeError) {
      console.error('Error closing WebSocket:', closeError);
    }
  }
};

/**
 * Resample audio from one sample rate to another
 * Uses simple nearest-neighbor resampling
 *
 * @param {Buffer} audioBuffer - Input audio buffer (PCM 16-bit)
 * @param {number} fromSampleRate - Input sample rate (e.g., 48000)
 * @param {number} toSampleRate - Output sample rate (e.g., 16000)
 * @returns {Buffer} Resampled audio buffer
 */
function resampleAudio(audioBuffer, fromSampleRate, toSampleRate) {
  if (fromSampleRate === toSampleRate) {
    return audioBuffer; // No resampling needed
  }

  const ratio = toSampleRate / fromSampleRate;
  const inputSamples = audioBuffer.length / 2; // 16-bit = 2 bytes per sample
  const outputSamples = Math.floor(inputSamples * ratio);
  const outputBuffer = Buffer.alloc(outputSamples * 2);

  // Simple nearest-neighbor resampling
  for (let i = 0; i < outputSamples; i++) {
    const inputIndex = Math.floor(i / ratio);
    const inputOffset = inputIndex * 2;
    const outputOffset = i * 2;

    // Copy 16-bit sample
    if (inputOffset + 1 < audioBuffer.length) {
      audioBuffer.copy(outputBuffer, outputOffset, inputOffset, inputOffset + 2);
    }
  }

  return outputBuffer;
}

/**
 * Alternative: Linear interpolation resampling (higher quality)
 * Uncomment to use instead of nearest-neighbor
 */
export function resampleAudioLinear(audioBuffer, fromSampleRate, toSampleRate) {
  if (fromSampleRate === toSampleRate) {
    return audioBuffer;
  }

  const ratio = toSampleRate / fromSampleRate;
  const inputSamples = audioBuffer.length / 2;
  const outputSamples = Math.floor(inputSamples * ratio);
  const outputBuffer = Buffer.alloc(outputSamples * 2);

  // Linear interpolation resampling
  for (let i = 0; i < outputSamples; i++) {
    const inputIndex = i / ratio;
    const inputIndexFloor = Math.floor(inputIndex);
    const fraction = inputIndex - inputIndexFloor;

    const inputOffset1 = inputIndexFloor * 2;
    const inputOffset2 = (inputIndexFloor + 1) * 2;
    const outputOffset = i * 2;

    // Read 16-bit samples
    let sample1 = 0;
    let sample2 = 0;

    if (inputOffset1 + 1 < audioBuffer.length) {
      sample1 = audioBuffer.readInt16LE(inputOffset1);
    }

    if (inputOffset2 + 1 < audioBuffer.length) {
      sample2 = audioBuffer.readInt16LE(inputOffset2);
    }

    // Linear interpolation
    const interpolated = sample1 + (sample2 - sample1) * fraction;
    const clamped = Math.max(-32768, Math.min(32767, Math.round(interpolated)));

    outputBuffer.writeInt16LE(clamped, outputOffset);
  }

  return outputBuffer;
}
