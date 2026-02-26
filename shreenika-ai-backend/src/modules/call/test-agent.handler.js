import Agent from '../agent/agent.model.js';
import { VoiceService } from './voice.service.js';
import { testAgentSessions } from './test-agent.controller.js';

/**
 * Detect audio format by checking magic bytes and structure
 * @param {Buffer} audioBuffer - Audio data buffer
 * @returns {string} - Format: 'pcm16', 'webm', 'mp4', or 'unknown'
 */
function detectAudioFormat(audioBuffer) {
  if (!audioBuffer || audioBuffer.length < 4) return 'unknown';

  const magic = audioBuffer.slice(0, 4);

  // WebM container: 0x1A 0x45 0xDF 0xA3
  if (magic[0] === 0x1A && magic[1] === 0x45 && magic[2] === 0xDF && magic[3] === 0xA3) {
    return 'webm';
  }

  // MP4 container: Has 'ftyp' at bytes 4-7 (check: 0x66 0x74 0x79 0x70)
  if (audioBuffer.length >= 8 && audioBuffer[4] === 0x66 && audioBuffer[5] === 0x74 &&
      audioBuffer[6] === 0x79 && audioBuffer[7] === 0x70) {
    return 'mp4';
  }

  // Raw PCM: Analyze sample distribution
  // PCM 16-bit samples vary across the full range, not concentrated in one byte
  if (audioBuffer.length >= 100) {
    const byteDistribution = new Map();
    for (let i = 0; i < Math.min(100, audioBuffer.length); i++) {
      byteDistribution.set(audioBuffer[i], (byteDistribution.get(audioBuffer[i]) || 0) + 1);
    }

    // If most bytes are the same value, it's likely silence or corrupted data
    const maxFreq = Math.max(...byteDistribution.values());
    if (maxFreq < 30) { // PCM should have good distribution
      return 'pcm16';
    }
  }

  return 'unknown';
}

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
          // FIX Gap 2: Validate audio format before processing
          const browserAudio = Buffer.from(message.audio, 'base64');
          const browserSampleRate = message.sampleRate || 48000;
          const audioFormat = message.format || 'pcm16'; // Get format from browser

          // FIX Gap 6: Detect and validate audio format
          const detectedFormat = detectAudioFormat(browserAudio);
          if (detectedFormat !== 'pcm16') {
            console.error(`❌ Test Agent: Audio format mismatch - received ${detectedFormat}, expected pcm16`);
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: `Invalid audio format: ${detectedFormat}. Expected PCM 16-bit.`
            }));
            return; // Drop this chunk
          }

          // VAD disabled in Test Agent for voice quality (no filtering)
          // Cost savings less important than correct voice detection
          // Will be re-enabled in real VOIP calls (Twilio/SansPBX)

          // FIX Gap 3, 7: Add try-catch and validation around resampling
          let geminiAudio;
          try {
            // Resample from browser format to Gemini format (16kHz required)
            geminiAudio = resampleAudio(browserAudio, browserSampleRate, 16000);

            if (!geminiAudio || geminiAudio.length === 0) {
              throw new Error('Resampling produced empty buffer');
            }
          } catch (resampleErr) {
            console.error(`❌ Test Agent: Resampling failed - ${resampleErr.message}`);
            console.error(`   ├─ Input: ${browserAudio.length} bytes at ${browserSampleRate}Hz`);
            console.error(`   └─ Error: ${resampleErr.stack}`);
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Audio resampling failed'
            }));
            return; // Drop this chunk
          }

          // [PHASE-2-DIAG] Log incoming audio with format validation
          if (audioChunksSentToGemini === 0) {
            const hexDump = browserAudio.slice(0, 20)
              .toString('hex')
              .match(/.{1,2}/g)
              .join(' ')
              .toUpperCase();

            console.log(`[PHASE-2-DIAG] 🎤 Backend: First audio chunk from browser`);
            console.log(`[PHASE-2-DIAG]   ├─ Bytes received: ${browserAudio.length}`);
            console.log(`[PHASE-2-DIAG]   ├─ Sample rate: ${browserSampleRate}Hz (actual from microphone)`);
            console.log(`[PHASE-2-DIAG]   ├─ Format: ${detectedFormat} (validated)`);
            console.log(`[PHASE-2-DIAG]   └─ First 20 bytes: ${hexDump}`);

            // Check for issues
            if (browserAudio.length === 0) {
              console.warn(`[PHASE-2-DIAG] 🚨 ZERO-BYTE ALERT: Received 0 bytes from browser`);
            }

            const int16View = new Int16Array(browserAudio);
            const isSilent = !Array.from(int16View.slice(0, Math.min(50, int16View.length)))
              .some(sample => Math.abs(sample) > 100);
            if (isSilent) {
              console.warn(`[PHASE-2-DIAG] ⚠️  Audio appears silent (RMS too low)`);
            } else {
              console.log(`[PHASE-2-DIAG] ✅ Audio contains voice data`);
            }

            console.log(`[PHASE-2-DIAG] 📊 Resampling: ${browserSampleRate}Hz (${browserAudio.length}B) → 16kHz (${geminiAudio.length}B)`);
            const ratio = (geminiAudio.length / browserAudio.length).toFixed(3);
            const expectedRatio = (16000 / browserSampleRate).toFixed(3);
            console.log(`[PHASE-2-DIAG]   ├─ Ratio: ${ratio}x`);
            console.log(`[PHASE-2-DIAG]   └─ Expected: ${expectedRatio}x (validates resampling correctness)`);
          }

          totalBytesFromBrowser += browserAudio.length;
          totalBytesResampledTo16k += geminiAudio.length;

          // Send to Gemini Live (VoiceService logs if audio is dropped)
          if (voiceService) {
            try {
              voiceService.sendAudio(geminiAudio);
              audioChunksSentToGemini++;
            } catch (sendErr) {
              console.error(`❌ Test Agent: sendAudio failed - ${sendErr.message}`);
              console.error(`   └─ This may indicate Gemini session is closed or error`);
              // Don't close connection - client can keep trying
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

      // Handle user interruption - signal browser to clear audio queue
      voiceService.on('interrupted', () => {
        console.log(`🤚 Test Agent: User interrupted - sending INTERRUPT signal to browser`);
        try {
          ws.send(JSON.stringify({
            type: 'INTERRUPT',
            message: 'User interrupted agent'
          }));
        } catch (error) {
          console.error('❌ Test Agent: Error sending interrupt signal:', error);
        }
      });

      // FIX Gap 33: Handle text-fallback when Gemini sends TEXT-only (no audio)
      if (voiceService.geminiSession) {
        voiceService.geminiSession.on('text-fallback', (fallbackData) => {
          console.log(`⚠️ Test Agent: Gemini returned TEXT-only - sending fallback to browser`);
          try {
            ws.send(JSON.stringify({
              type: 'TEXT_FALLBACK',
              text: fallbackData.text,
              reason: fallbackData.reason
            }));
          } catch (error) {
            console.error('❌ Test Agent: Error sending text fallback:', error);
          }
        });
      }

      // Handle VoiceService session close - when Gemini session ends
      voiceService.on('close', () => {
        console.log(`🔌 Test Agent: Voice service closed - Gemini session ended`);
        // Don't close the WebSocket yet - let client decide when to end
        // The client can continue to send audio if needed
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
 * FIX Gap 7: Added comprehensive error handling and validation
 *
 * @param {Buffer} audioBuffer - Input audio buffer (PCM 16-bit)
 * @param {number} fromSampleRate - Input sample rate (e.g., 48000)
 * @param {number} toSampleRate - Output sample rate (e.g., 16000)
 * @returns {Buffer} Resampled audio buffer
 * @throws {Error} If input is invalid or resampling fails
 */
function resampleAudio(audioBuffer, fromSampleRate, toSampleRate) {
  // FIX Gap 7: Input validation
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('Audio buffer is empty or null');
  }

  if (audioBuffer.length % 2 !== 0) {
    throw new Error(`Audio buffer length must be even (16-bit samples), got ${audioBuffer.length}`);
  }

  if (!Number.isFinite(fromSampleRate) || fromSampleRate <= 0) {
    throw new Error(`Invalid source sample rate: ${fromSampleRate}`);
  }

  if (!Number.isFinite(toSampleRate) || toSampleRate <= 0) {
    throw new Error(`Invalid target sample rate: ${toSampleRate}`);
  }

  if (fromSampleRate === toSampleRate) {
    return audioBuffer;
  }

  try {
    const ratio = toSampleRate / fromSampleRate;
    const inputSamples = audioBuffer.length / 2;
    const outputSamples = Math.floor(inputSamples * ratio);

    // FIX Gap 7: Validate output size
    if (!Number.isFinite(outputSamples) || outputSamples < 0) {
      throw new Error(`Invalid output sample count: ${outputSamples}`);
    }

    const outputBuffer = Buffer.alloc(outputSamples * 2);

    // Linear interpolation resampling (high quality, fixes distortion)
    for (let i = 0; i < outputSamples; i++) {
      const inputIndex = i / ratio;
      const inputIndexFloor = Math.floor(inputIndex);
      const fraction = inputIndex - inputIndexFloor;

      const inputOffset1 = inputIndexFloor * 2;
      const inputOffset2 = (inputIndexFloor + 1) * 2;
      const outputOffset = i * 2;

      // Read 16-bit samples with boundary checks
      let sample1 = 0;
      let sample2 = 0;

      if (inputOffset1 + 1 < audioBuffer.length) {
        try {
          sample1 = audioBuffer.readInt16LE(inputOffset1);
        } catch (readErr) {
          console.warn(`Warning: Failed to read sample at offset ${inputOffset1}, using 0`);
          sample1 = 0;
        }
      }

      if (inputOffset2 + 1 < audioBuffer.length) {
        try {
          sample2 = audioBuffer.readInt16LE(inputOffset2);
        } catch (readErr) {
          console.warn(`Warning: Failed to read sample at offset ${inputOffset2}, using sample1`);
          sample2 = sample1;
        }
      } else {
        sample2 = sample1; // Use previous sample at edge
      }

      // Linear interpolation
      const interpolated = sample1 + (sample2 - sample1) * fraction;
      const clamped = Math.max(-32768, Math.min(32767, Math.round(interpolated)));

      try {
        outputBuffer.writeInt16LE(clamped, outputOffset);
      } catch (writeErr) {
        throw new Error(`Failed to write sample at offset ${outputOffset}: ${writeErr.message}`);
      }
    }

    return outputBuffer;
  } catch (error) {
    throw new Error(`Resampling from ${fromSampleRate}Hz to ${toSampleRate}Hz failed: ${error.message}`);
  }
}
