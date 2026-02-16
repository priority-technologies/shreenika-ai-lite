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

      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);
      analyzerRef.current = analyzer;

      console.log('✅ Test Agent: Audio context initialized (48kHz)');

      // Start audio level monitoring (for waveform)
      monitorAudioLevel();

      // Step 3: Start backend session
      setStatus('connecting');
      console.log('📡 Test Agent: Starting backend session');

      const token = localStorage.getItem('token');
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
      const response = await fetch(`${apiBase}/api/test-agent/start`, {
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
          } else if (message.type === 'ERROR') {
            console.error('❌ Test Agent Error:', message.message);
            setError(message.message || 'Voice service error');
          } else if (message.type === 'PONG') {
            // Keep-alive response
            console.log('💓 Test Agent: Received pong');
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

  const startAudioCapture = (audioContext: AudioContext, stream: MediaStream) => {
    try {
      console.log('🎤 Test Agent: Starting audio capture');

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioProcessorRef.current = processor;

      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (event) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const inputData = event.inputBuffer.getChannelData(0);
          const pcmData = convertFloat32ToPCM16(inputData);
          wsRef.current.send(JSON.stringify({
            type: 'AUDIO',
            audio: pcmData.toString('base64'),
            sampleRate: 48000
          }));
        }
      };

      console.log('✅ Test Agent: Audio capture started');
    } catch (error) {
      console.error('❌ Test Agent: Error starting audio capture:', error);
      setError('Failed to capture audio');
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

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Stop audio capture
    if (audioProcessorRef.current) {
      try {
        audioProcessorRef.current.disconnect();
      } catch (error) {
        console.error('Error disconnecting audio processor:', error);
      }
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (error) {
          console.error('Error stopping media track:', error);
        }
      });
    }

    // Stop audio
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        await audioContextRef.current.close();
      } catch (error) {
        console.error('Error closing audio context:', error);
      }
    }

    // Notify backend
    if (sessionIdRef.current) {
      try {
        const token = localStorage.getItem('token');
        const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
        await fetch(`${apiBase}/api/test-agent/${sessionIdRef.current}/end`, {
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

  const convertFloat32ToPCM16 = (float32Array: Float32Array): Buffer => {
    const buffer = Buffer.alloc(float32Array.length * 2);
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      buffer.writeInt16LE(sample * 32767, i * 2);
    }
    return buffer;
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
