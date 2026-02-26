import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Loader2 } from 'lucide-react';

interface TestAgentModalProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
}

interface LatencyMetrics {
  wsOpenTime: number;
  firstAudioTime: number | null;
  lastAudioTime: number | null;
  audioChunksReceived: number;
}

export const TestAgentModal: React.FC<TestAgentModalProps> = ({ agentId, agentName, onClose }) => {
  const [status, setStatus] = useState<'checking-permissions' | 'connecting' | 'connected' | 'error'>('checking-permissions');
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Audio streaming buffers for low-latency playback
  const audioQueueRef = useRef<Float32Array[]>([]);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isPlayingRef = useRef<boolean>(false);

  // Latency tracking
  const metricsRef = useRef<LatencyMetrics>({
    wsOpenTime: 0,
    firstAudioTime: null,
    lastAudioTime: null,
    audioChunksReceived: 0
  });

  useEffect(() => {
    initializeTestAgent();
    return () => cleanup();
  }, [agentId]);

  const initializeTestAgent = async () => {
    try {
      // Step 1: Check microphone permissions
      setStatus('checking-permissions');
      console.log('🎙️ Test Agent: Requesting microphone access');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      console.log('✅ Test Agent: Microphone access granted');

      // Step 2: Initialize audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
      audioContextRef.current = audioContext;

      // FIX: Resume audio context (required by modern browsers)
      // Some browsers require explicit resume() after user interaction to start processing audio
      if (audioContext.state === 'suspended') {
        console.log('⏸️ Audio context suspended - resuming...');
        await audioContext.resume();
        console.log(`✅ Audio context resumed - state: ${audioContext.state}`);
      } else {
        console.log(`📊 Audio context state: ${audioContext.state}`);
      }

      // FIX: Create source that will be used by both analyzer AND worklet
      // Store source reference so we can reuse it in startAudioCapture
      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);
      analyzerRef.current = analyzer;

      // Store source for reuse in startAudioCapture
      (audioContextRef.current as any)._mediaSource = source;

      console.log('✅ Test Agent: Audio context initialized (48kHz)');

      // Start audio level monitoring (for waveform)
      monitorAudioLevel();

      // Step 3: Start backend session
      setStatus('connecting');
      console.log('📡 Test Agent: Starting backend session');

      const token = localStorage.getItem('token');
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
      const response = await fetch(`${apiBase}/api/voice/test-agent/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ agentId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start test session');
      }

      const data = await response.json();
      const { sessionId, wsUrl, maxDuration } = data;
      sessionIdRef.current = sessionId;

      console.log(`✅ Test Agent: Backend session started - ${sessionId}`);

      // Step 4: Connect WebSocket
      console.log(`🔌 Test Agent: Connecting WebSocket to ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ Test Agent: WebSocket connected');
        metricsRef.current.wsOpenTime = Date.now();
        setStatus('connected');
        startElapsedTimer();

        // Start sending audio to backend
        startAudioCapture(audioContext, stream);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'AUDIO') {
            // Track latency metrics
            const now = Date.now();
            if (!metricsRef.current.firstAudioTime) {
              metricsRef.current.firstAudioTime = now;
              const latency = now - metricsRef.current.wsOpenTime;
              console.log(`⏱️  Test Agent: First audio arrived in ${latency}ms`);
            }
            metricsRef.current.lastAudioTime = now;
            metricsRef.current.audioChunksReceived++;

            // Play audio from Gemini (streaming)
            playAudio(message.audio, message.sampleRate);
          } else if (message.type === 'MAX_DURATION_REACHED') {
            console.log('⏰ Test Agent: Max duration reached');
            if (metricsRef.current.firstAudioTime) {
              console.log(`📊 Test Agent Latency Summary:`);
              console.log(`   ├─ First Response: ${metricsRef.current.firstAudioTime - metricsRef.current.wsOpenTime}ms`);
              console.log(`   ├─ Total Audio Chunks: ${metricsRef.current.audioChunksReceived}`);
              console.log(`   └─ Duration: ${metricsRef.current.lastAudioTime ? metricsRef.current.lastAudioTime - metricsRef.current.firstAudioTime : 0}ms`);
            }
            handleEndCall();
          } else if (message.type === 'TEXT_FALLBACK') {
            // FIX Gap 33: Gemini returned TEXT-only (no audio)
            // Use Web Speech API (browser TTS) as fallback
            console.warn(`⚠️ [Gap 33 Fallback] Gemini returned TEXT-only response, using text-to-speech`);
            console.warn(`   └─ Text: "${message.text.substring(0, 100)}${message.text.length > 100 ? '...' : ''}"`);

            try {
              // Use browser Web Speech API (SpeechSynthesis)
              const utterance = new SpeechSynthesisUtterance(message.text);
              utterance.rate = 1.0;
              utterance.pitch = 1.0;
              utterance.volume = 1.0;

              speechSynthesis.cancel(); // Cancel any previous speech
              speechSynthesis.speak(utterance);

              console.log('🔊 Text-to-Speech started via Web Speech API');
            } catch (ttsErr) {
              console.error('❌ Text-to-speech failed:', ttsErr);
              setError('Gemini returned text-only response and text-to-speech unavailable');
            }
          } else if (message.type === 'ERROR') {
            console.error('❌ Test Agent Error:', message.message);
            setError(message.message || 'Voice service error');
          } else if (message.type === 'PONG') {
            // Keep-alive response
            console.log('💓 Test Agent: Received pong');
          } else if (message.type === 'INTERRUPT') {
            // User interrupted agent - clear audio queue and stop playback
            console.log('🤚 Test Agent: Interrupt signal received - clearing audio queue');

            // Clear the audio queue (will stop queued audio from playing)
            audioQueueRef.current = [];

            // Stop current audio playback if any is playing
            if (currentSourceRef.current) {
              try {
                currentSourceRef.current.stop();
                currentSourceRef.current.disconnect();
                currentSourceRef.current = null;
              } catch (e) {
                console.warn('⚠️  Error stopping audio source:', e);
              }
            }

            // Mark as not playing so new audio can start when needed
            isPlayingRef.current = false;

            console.log('✅ Test Agent: Audio queue cleared, ready for next response');
          }
        } catch (error) {
          console.error('❌ Test Agent: Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ Test Agent: WebSocket error', error);
        setError('Connection error - WebSocket failed');
        setStatus('error');
      };

      ws.onclose = () => {
        console.log('🔌 Test Agent: WebSocket closed');
      };

    } catch (error: any) {
      console.error('❌ Test Agent: Initialization error', error);

      if (error.name === 'NotAllowedError') {
        setError('Microphone access denied. Please enable microphone in your browser settings and refresh.');
      } else if (error.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone and refresh.');
      } else if (error.message === 'Permission denied') {
        setError('Microphone permission denied. Please check browser settings.');
      } else {
        setError(error.message || 'Failed to initialize test agent. Please try again.');
      }

      setStatus('error');
    }
  };

  const startAudioCapture = async (audioContext: AudioContext, stream: MediaStream) => {
    try {
      console.log('🎤 Test Agent: Starting audio capture (AudioWorklet - RAW PCM)');

      // FIX Gap 1: Use AudioWorklet for RAW PCM capture (not MediaRecorder container format)
      // AudioWorklet processes audio samples directly from microphone
      // Output: Pure 16-bit signed PCM audio at native sample rate

      const actualSampleRate = audioContext.sampleRate;
      console.log(`📊 Actual microphone sample rate: ${actualSampleRate}Hz`);

      // Load AudioWorklet processor
      try {
        await audioContext.audioWorklet.addModule('/audio-worklet-processor.js');
        console.log('✅ AudioWorklet processor loaded');
      } catch (err) {
        console.error('❌ Failed to load AudioWorklet processor:', err);
        throw new Error('AudioWorklet not supported - use ScriptProcessorNode fallback');
      }

      // Create AudioWorklet node
      const workletNode = new (window as any).AudioWorkletNode(
        audioContext,
        'raw-pcm-processor'
      );

      // FIX: Reuse the source created in initializeTestAgent (already connected to analyzer)
      // Don't create a second source - connect the existing source to worklet
      const source = (audioContext as any)._mediaSource;
      if (!source) {
        throw new Error('Media source not initialized - microphone may not be properly connected');
      }

      // Connect the same source to the worklet (it's already connected to analyzer)
      source.connect(workletNode);

      // Optional: Connect worklet to destination if you want to hear the captured audio
      // workletNode.connect(audioContext.destination); // Commented out - no need to play back captured audio

      let audioChunksSent = 0;
      let totalAudioSize = 0;

      // Receive raw PCM audio from AudioWorklet
      workletNode.port.onmessage = (event) => {
        try {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return;
          }

          const { type, data, sampleRate, format, timestamp } = event.data;

          if (type !== 'audio') return;

          // FIX Gap 5: Use actual sample rate, not hardcoded 48000
          const audioBuffer = data; // Already Int16 from AudioWorklet

          // [PHASE-2-DIAG] Log first audio chunk with format info
          if (audioChunksSent === 0) {
            const hexDump = Array.from(new Uint8Array(audioBuffer).slice(0, 20))
              .map(b => b.toString(16).padStart(2, '0').toUpperCase())
              .join(' ');

            console.log(`[PHASE-2-DIAG] 🎤 Browser: First audio chunk captured (AUDIOWORKLET - RAW PCM)`);
            console.log(`[PHASE-2-DIAG]   ├─ Bytes: ${audioBuffer.byteLength}`);
            console.log(`[PHASE-2-DIAG]   ├─ Sample Rate: ${sampleRate}Hz (actual microphone rate)`);
            console.log(`[PHASE-2-DIAG]   ├─ Format: ${format} 16-bit LE (raw PCM from microphone)`);
            console.log(`[PHASE-2-DIAG]   └─ First 20 bytes: ${hexDump}`);

            // Check for actual audio data (not silence)
            const int16View = new Int16Array(audioBuffer);
            const isSilent = !Array.from(int16View.slice(0, 100)).some(sample => Math.abs(sample) > 100);
            const hasNoise = Array.from(int16View.slice(0, 100)).some(sample => Math.abs(sample) > 500);

            if (isSilent) {
              console.warn(`[PHASE-2-DIAG] ⚠️  WARNING: Microphone may not be working (audio is silent)`);
            } else if (hasNoise) {
              console.log(`[PHASE-2-DIAG] ✅ Audio contains voice/noise data (microphone working!)`);
            }
          }

          audioChunksSent++;
          totalAudioSize += audioBuffer.byteLength;

          // FIX Gap 6: Add error handling for WebSocket send
          try {
            wsRef.current!.send(JSON.stringify({
              type: 'AUDIO',
              audio: uint8ArrayToBase64(new Uint8Array(audioBuffer)),
              sampleRate: sampleRate, // Send actual rate, not hardcoded
              format: format // Include format for backend validation
            }));
          } catch (sendErr) {
            console.error('❌ Failed to send audio to WebSocket:', sendErr);
            // FIX Gap 7: Log error instead of failing silently
          }
        } catch (error) {
          console.error('❌ Test Agent: Error processing audio chunk:', error);
        }
      };

      audioProcessorRef.current = {
        disconnect: () => {
          console.log(`✅ Test Agent: Audio capture stopped (${audioChunksSent} chunks, ${totalAudioSize} bytes total)`);
          workletNode.disconnect();
          source.disconnect();
        }
      } as any;

      console.log('✅ Test Agent: Audio capture started (using AudioWorklet - raw PCM at native sample rate)');
    } catch (error) {
      console.error('❌ Test Agent: Error starting audio capture:', error);
      setError('Failed to capture audio - AudioWorklet not supported in your browser');
      setStatus('error');
    }
  };

  const monitorAudioLevel = () => {
    if (!analyzerRef.current) return;

    const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);

    const update = () => {
      if (!analyzerRef.current) return;

      analyzerRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
      setAudioLevel(Math.min(1, average / 255)); // Normalize to 0-1

      requestAnimationFrame(update);
    };

    update();
  };

  const playAudio = (base64Audio: string, sampleRate: number) => {
    try {
      if (!audioContextRef.current) return;

      // Decode base64 audio to bytes (browser-compatible, no Buffer)
      const binaryString = atob(base64Audio);
      const audioData = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        audioData[i] = binaryString.charCodeAt(i);
      }

      // [PHASE-1-DIAG] Log incoming audio from server
      if (metricsRef.current.audioChunksReceived === 0) {
        const hexDump = Array.from(audioData.slice(0, 20))
          .map(b => b.toString(16).padStart(2, '0').toUpperCase())
          .join(' ');

        console.log(`[PHASE-1-DIAG] 🎙️  Browser: First audio chunk from server`);
        console.log(`[PHASE-1-DIAG]   ├─ Bytes: ${audioData.length}`);
        console.log(`[PHASE-1-DIAG]   ├─ Sample rate: ${sampleRate}Hz`);
        console.log(`[PHASE-1-DIAG]   ├─ Format: PCM 16-bit LE`);
        console.log(`[PHASE-1-DIAG]   └─ First 20 bytes: ${hexDump}`);

        if (audioData.length === 0) {
          console.warn(`[PHASE-1-DIAG] 🚨 ZERO-BYTE ALERT: Server returned 0 bytes`);
        }
        const isSilent = !Array.from(audioData.slice(0, Math.min(100, audioData.length)))
          .some(b => b !== 0 && b !== 255);
        if (isSilent) {
          console.warn(`[PHASE-1-DIAG] ⚠️  Audio appears silent (all 0x00 or 0xFF)`);
        }
      }

      // Convert PCM16 to Float32
      const float32Array = new Float32Array(audioData.length / 2);
      const dataView = new DataView(audioData.buffer, audioData.byteOffset);
      for (let i = 0; i < audioData.length / 2; i++) {
        // Read 16-bit signed integer in little-endian format
        const sample = dataView.getInt16(i * 2, true);
        float32Array[i] = sample / 32768.0;
      }

      // Queue audio for streaming playback
      audioQueueRef.current.push(float32Array);

      // Start playback if not already playing
      if (!isPlayingRef.current) {
        playQueuedAudio();
      }
    } catch (error) {
      console.error('❌ Test Agent: Error queuing audio:', error);
    }
  };

  const playQueuedAudio = () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    try {
      if (!audioContextRef.current) return;

      isPlayingRef.current = true;
      const chunk = audioQueueRef.current.shift();
      if (!chunk) {
        isPlayingRef.current = false;
        return;
      }

      // Create audio buffer for this chunk
      const audioBuffer = audioContextRef.current.createBuffer(1, chunk.length, 48000);
      const channelData = audioBuffer.getChannelData(0);
      channelData.set(chunk);

      // Create and start source
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);

      // Play next chunk when this one finishes
      source.onended = () => {
        isPlayingRef.current = false;
        if (audioQueueRef.current.length > 0) {
          playQueuedAudio();
        }
      };

      source.start(0);
      currentSourceRef.current = source;
    } catch (error) {
      console.error('❌ Test Agent: Error playing queued audio:', error);
      isPlayingRef.current = false;
    }
  };

  const startElapsedTimer = () => {
    const interval = setInterval(() => {
      setElapsedSeconds(prev => {
        if (prev >= 300) {
          // Max 5 minutes reached
          clearInterval(interval);
          handleEndCall();
          return 300;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const handleEndCall = async () => {
    console.log('🛑 Test Agent: Ending call');

    // Step 1: Notify backend FIRST (before closing WebSocket)
    // WebSocket close triggers session cleanup on backend, so POST must happen first
    if (sessionIdRef.current) {
      try {
        const token = localStorage.getItem('token');
        const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
        await fetch(`${apiBase}/api/voice/test-agent/${sessionIdRef.current}/end`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        console.log('✅ Test Agent: Session ended on backend');
      } catch (error) {
        console.error('Error notifying backend of session end:', error);
      }
    }

    // Step 2: Stop audio capture
    if (audioProcessorRef.current) {
      try {
        audioProcessorRef.current.disconnect();
      } catch (error) {
        console.error('Error disconnecting audio processor:', error);
      }
    }

    // Step 3: Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (error) {
          console.error('Error stopping media track:', error);
        }
      });
    }

    // Step 4: Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        await audioContextRef.current.close();
      } catch (error) {
        console.error('Error closing audio context:', error);
      }
    }

    // Step 5: Close WebSocket LAST (triggers backend session cleanup)
    if (wsRef.current) {
      wsRef.current.close();
    }

    onClose();
  };

  const cleanup = () => {
    console.log('🧹 Test Agent: Cleanup');

    // Stop current audio playback
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current = null;
      } catch (error) {
        console.error('Error stopping audio source:', error);
      }
    }

    // Clear audio queue
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    if (audioProcessorRef.current) {
      try {
        audioProcessorRef.current.disconnect();
      } catch (error) {
        console.error('Error cleaning up audio processor:', error);
      }
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (error) {
          console.error('Error stopping media track:', error);
        }
      });
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (error) {
        console.error('Error closing audio context:', error);
      }
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
    }
  };

  const convertFloat32ToPCM16 = (float32Array: Float32Array): Uint8Array => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, sample * 32767, true); // true = little-endian
    }
    return new Uint8Array(buffer);
  };

  const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">Test Agent: {agentName}</h3>
          <button
            onClick={handleEndCall}
            className="text-slate-500 hover:text-slate-700 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {status === 'checking-permissions' && (
            <div className="text-center py-4">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-600">Checking microphone permissions...</p>
            </div>
          )}

          {status === 'connecting' && (
            <div className="text-center py-4">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-600">Connecting to agent...</p>
            </div>
          )}

          {status === 'connected' && (
            <>
              {/* Audio Waveform with Logo */}
              <div className="relative h-40 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl flex items-center justify-center overflow-hidden">
                {/* Waveform Bars */}
                <div className="absolute inset-0 flex items-center justify-center space-x-1 px-4">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1 rounded-full transition-all duration-100 bg-indigo-400"
                      style={{
                        height: `${Math.max(8, audioLevel * 100 * (0.6 + Math.random() * 0.4))}%`,
                        opacity: 0.7 + audioLevel * 0.3
                      }}
                    />
                  ))}
                </div>

                {/* Logo and Company Name in Center */}
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className="bg-white rounded-full p-3 shadow-lg">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center">
                      <Mic className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-slate-700 text-center">Priority Technologies Inc.</p>
                </div>
              </div>

              {/* Timer */}
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-900 font-mono">
                  {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}
                </p>
                <p className="text-xs text-slate-500 mt-2">Maximum: 5:00 minutes</p>
              </div>

              {/* Microphone Indicator */}
              <div className="flex items-center justify-center space-x-2 text-sm text-slate-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Microphone active</span>
              </div>
            </>
          )}

          {status === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700 font-bold mb-1">⚠️ Connection Error</p>
              <p className="text-xs text-red-600 leading-relaxed">{error}</p>
              <button
                onClick={initializeTestAgent}
                className="mt-3 text-xs font-bold text-red-700 hover:text-red-900 underline"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {status === 'connected' && (
          <div className="px-6 pb-6 flex justify-center">
            <button
              onClick={handleEndCall}
              className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-lg font-bold flex items-center space-x-2 transition-all shadow-sm"
            >
              <MicOff className="w-5 h-5" />
              <span>End Test</span>
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="px-6 pb-6 flex justify-center">
            <button
              onClick={onClose}
              className="bg-slate-600 hover:bg-slate-700 text-white px-8 py-3 rounded-lg font-bold transition-all shadow-sm"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
