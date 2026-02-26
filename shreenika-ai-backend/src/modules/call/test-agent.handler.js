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
    let totalBytesFromBrowser = 0;
    let totalBytesResampledTo16k = 0;

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);

        if (message.type === 'AUDIO' && message.audio) {
          // Browser sends PCM audio (base64 encoded, typically 48kHz)
          const browserAudio = Buffer.from(message.audio, 'base64');
          const browserSampleRate = message.sampleRate || 48000;

          // VAD disabled in Test Agent for voice quality (no filtering)
          // Cost savings less important than correct voice detection
          // Will be re-enabled in real VOIP calls (Twilio/SansPBX)

          // Resample from browser format (48kHz) to Gemini format (16kHz)
          const geminiAudio = resampleAudio(browserAudio, browserSampleRate, 16000);

          // [PHASE-1-DIAG] Log incoming audio with byte diagnostics
          if (audioChunksSentToGemini === 0) {
            const hexDump = browserAudio.slice(0, 20)
              .toString('hex')
              .match(/.{1,2}/g)
              .join(' ')
              .toUpperCase();

            console.log(`[PHASE-1-DIAG] 🎤 Backend: First audio chunk from browser`);
            console.log(`[PHASE-1-DIAG]   ├─ Bytes received: ${browserAudio.length}`);
            console.log(`[PHASE-1-DIAG]   ├─ Sample rate: ${browserSampleRate}Hz`);
            console.log(`[PHASE-1-DIAG]   ├─ Format: PCM 16-bit LE`);
            console.log(`[PHASE-1-DIAG]   └─ First 20 bytes: ${hexDump}`);

            // Check for issues
            if (browserAudio.length === 0) {
              console.warn(`[PHASE-1-DIAG] 🚨 ZERO-BYTE ALERT: Received 0 bytes from browser`);
            }
            const isSilent = !browserAudio.slice(0, Math.min(100, browserAudio.length))
              .some(b => b !== 0 && b !== 255);
            if (isSilent) {
              console.warn(`[PHASE-1-DIAG] ⚠️  Audio appears silent (all 0x00 or 0xFF)`);
            }

            console.log(`[PHASE-1-DIAG] 📊 Resampling: 48kHz (${browserAudio.length}B) → 16kHz (${geminiAudio.length}B)`);
            const ratio = (geminiAudio.length / browserAudio.length).toFixed(3);
            console.log(`[PHASE-1-DIAG]   └─ Ratio: ${ratio}x (expected ~0.333)`);
          }

          totalBytesFromBrowser += browserAudio.length;
          totalBytesResampledTo16k += geminiAudio.length;

          // Send to Gemini Live (VoiceService logs if audio is dropped)
          if (voiceService) {
            voiceService.sendAudio(geminiAudio);
            audioChunksSentToGemini++;
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
    let audioChunksFromGemini = 0;
    let totalBytesFromGemini = 0;
    let totalBytesResampledTo48k = 0;

    if (voiceService) {
      voiceService.on('audio', (audioData) => {
        try {
          // Gemini sends PCM 24kHz, resample to browser format (48kHz)
          const browserAudio = resampleAudio(audioData, 24000, 48000);

          // [PHASE-1-DIAG] Log Gemini response with byte diagnostics
          if (audioChunksFromGemini === 0) {
            const hexDump = audioData.slice(0, 20)
              .toString('hex')
              .match(/.{1,2}/g)
              .join(' ')
              .toUpperCase();

            console.log(`[PHASE-1-DIAG] 🎙️  Gemini: First audio response received`);
            console.log(`[PHASE-1-DIAG]   ├─ Bytes from Gemini: ${audioData.length}`);
            console.log(`[PHASE-1-DIAG]   ├─ Sample rate: 24kHz`);
            console.log(`[PHASE-1-DIAG]   ├─ Format: PCM 16-bit LE`);
            console.log(`[PHASE-1-DIAG]   └─ First 20 bytes: ${hexDump}`);

            if (audioData.length === 0) {
              console.warn(`[PHASE-1-DIAG] 🚨 ZERO-BYTE ALERT: Gemini returned 0 bytes`);
            }

            console.log(`[PHASE-1-DIAG] 📊 Resampling: 24kHz (${audioData.length}B) → 48kHz (${browserAudio.length}B)`);
            const ratio = (browserAudio.length / audioData.length).toFixed(3);
            console.log(`[PHASE-1-DIAG]   └─ Ratio: ${ratio}x (expected 2.0)`);
          }

          audioChunksFromGemini++;
          totalBytesFromGemini += audioData.length;
          totalBytesResampledTo48k += browserAudio.length;

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

      // [PHASE-1-DIAG] Print final diagnostic summary
      if (audioChunksSentToGemini > 0) {
        console.log(`[PHASE-1-DIAG] 📊 TEST AGENT DIAGNOSTIC SUMMARY`);
        console.log(`[PHASE-1-DIAG] ✅ Audio Flow Complete`);
        console.log(`[PHASE-1-DIAG] ├─ Browser Input:`);
        console.log(`[PHASE-1-DIAG] │  ├─ Total Chunks: ${audioChunksSentToGemini}`);
        console.log(`[PHASE-1-DIAG] │  ├─ Total Bytes: ${totalBytesFromBrowser}`);
        console.log(`[PHASE-1-DIAG] │  └─ Status: ${totalBytesFromBrowser > 0 ? '✅ Data flowing' : '❌ No data'}`);
        console.log(`[PHASE-1-DIAG] ├─ Resample (48kHz→16kHz):`);
        console.log(`[PHASE-1-DIAG] │  ├─ Input: ${totalBytesFromBrowser}B`);
        console.log(`[PHASE-1-DIAG] │  ├─ Output: ${totalBytesResampledTo16k}B`);
        console.log(`[PHASE-1-DIAG] │  └─ Ratio: ${(totalBytesResampledTo16k / totalBytesFromBrowser).toFixed(3)}x`);
        console.log(`[PHASE-1-DIAG] ├─ Gemini Response:`);
        console.log(`[PHASE-1-DIAG] │  ├─ Total Chunks: ${audioChunksFromGemini}`);
        console.log(`[PHASE-1-DIAG] │  ├─ Total Bytes: ${totalBytesFromGemini}`);
        console.log(`[PHASE-1-DIAG] │  └─ Status: ${totalBytesFromGemini > 0 ? '✅ Data received' : '❌ No response'}`);
        console.log(`[PHASE-1-DIAG] └─ Resample (24kHz→48kHz):`);
        console.log(`[PHASE-1-DIAG]    ├─ Input: ${totalBytesFromGemini}B`);
        console.log(`[PHASE-1-DIAG]    ├─ Output: ${totalBytesResampledTo48k}B`);
        console.log(`[PHASE-1-DIAG]    └─ Ratio: ${totalBytesFromGemini > 0 ? (totalBytesResampledTo48k / totalBytesFromGemini).toFixed(3) : 'N/A'}x`);
      }

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
 * Voice Activity Detection (VAD) - Silence Detection
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
  const VOICE_THRESHOLD = 0.004; // Very sensitive - catches even soft speech

  return rms > VOICE_THRESHOLD; // Voice active if RMS exceeds threshold
}

/**
 * Resample audio from one sample rate to another
 * Uses LINEAR INTERPOLATION for high-quality resampling
 * Fixes distortion issues from nearest-neighbor approach
 *
 * @param {Buffer} audioBuffer - Input audio buffer (PCM 16-bit)
 * @param {number} fromSampleRate - Input sample rate (e.g., 48000)
 * @param {number} toSampleRate - Output sample rate (e.g., 16000)
 * @returns {Buffer} Resampled audio buffer
 */
function resampleAudio(audioBuffer, fromSampleRate, toSampleRate) {
  if (fromSampleRate === toSampleRate) {
    return audioBuffer;
  }

  const ratio = toSampleRate / fromSampleRate;
  const inputSamples = audioBuffer.length / 2;
  const outputSamples = Math.floor(inputSamples * ratio);
  const outputBuffer = Buffer.alloc(outputSamples * 2);

  // Linear interpolation resampling (high quality, fixes distortion)
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
