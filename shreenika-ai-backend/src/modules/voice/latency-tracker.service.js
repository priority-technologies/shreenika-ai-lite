/**
 * Latency Tracker Service
 *
 * Tracks and analyzes latency at each stage of the voice pipeline.
 * Provides detailed metrics for optimization and debugging.
 *
 * Pipeline Stages:
 * 1. WebSocket Connection (user → backend)
 * 2. Gemini Connection (backend → Google API)
 * 3. First Audio Chunk (Google → backend)
 * 4. Audio Playback (backend → user's phone)
 * 5. User Speech Detection (user talking → backend)
 * 6. Gemini Processing (backend → response)
 * 7. Total Round Trip (question → answer heard)
 */

export class LatencyTracker {
  constructor(callId, agentId) {
    this.callId = callId;
    this.agentId = agentId;

    // Stage timings (milliseconds)
    this.stages = {
      callStart: Date.now(),
      wsOpen: null,
      wsConnectDuration: null,
      geminiConnectionStart: null,
      geminiReady: null,
      geminiConnectDuration: null,
      firstAudioChunk: null,
      firstAudioLatency: null,
      audioPlaybackStart: null,
      userSpeechDetected: null,
      geminiResponseStart: null,
      firstResponseAudioChunk: null,
      responseLatency: null
    };

    // Aggregated metrics
    this.metrics = {
      totalSessions: 1,
      avgGeminiLatency: 0,
      avgResponseLatency: 0,
      maxLatency: 0,
      bottleneck: null // Which stage is slowest
    };

    // Round trip tracking
    this.roundTrips = [];
  }

  /**
   * Mark WebSocket connection opened
   */
  markWebSocketOpen() {
    this.stages.wsOpen = Date.now();
    this.stages.wsConnectDuration = this.stages.wsOpen - this.stages.callStart;

    console.log(`⏱️  [${this.callId}] WebSocket open: ${this.stages.wsConnectDuration}ms`);
  }

  /**
   * Mark Gemini connection started
   */
  markGeminiConnectionStart() {
    this.stages.geminiConnectionStart = Date.now();
    console.log(`⏱️  [${this.callId}] Gemini connection attempt started`);
  }

  /**
   * Mark Gemini session ready (setupComplete received)
   */
  markGeminiReady() {
    this.stages.geminiReady = Date.now();
    this.stages.geminiConnectDuration = this.stages.geminiReady - this.stages.geminiConnectionStart;

    console.log(`⏱️  [${this.callId}] Gemini session ready: ${this.stages.geminiConnectDuration}ms`);
  }

  /**
   * Mark first audio chunk received from Gemini
   */
  markFirstAudioChunk() {
    this.stages.firstAudioChunk = Date.now();

    if (this.stages.geminiReady) {
      this.stages.firstAudioLatency = this.stages.firstAudioChunk - this.stages.geminiReady;
    }

    console.log(`⏱️  [${this.callId}] First audio chunk: ${this.stages.firstAudioLatency || 'unknown'}ms after setupComplete`);
  }

  /**
   * Mark audio playback start (TTS audio playing to user)
   */
  markAudioPlaybackStart() {
    this.stages.audioPlaybackStart = Date.now();
    const latency = this.stages.audioPlaybackStart - this.stages.callStart;

    console.log(`⏱️  [${this.callId}] Audio playback start: ${latency}ms from call start`);
  }

  /**
   * Mark user speech detected
   */
  markUserSpeechDetected() {
    this.stages.userSpeechDetected = Date.now();
    console.log(`⏱️  [${this.callId}] User speech detected`);
  }

  /**
   * Mark Gemini response generation started
   */
  markGeminiResponseStart() {
    this.stages.geminiResponseStart = Date.now();
    console.log(`⏱️  [${this.callId}] Gemini processing response`);
  }

  /**
   * Mark first response audio chunk
   */
  markFirstResponseAudioChunk() {
    this.stages.firstResponseAudioChunk = Date.now();

    if (this.stages.userSpeechDetected) {
      this.stages.responseLatency = this.stages.firstResponseAudioChunk - this.stages.userSpeechDetected;
      console.log(`⏱️  [${this.callId}] Response latency (user speech → first audio): ${this.stages.responseLatency}ms`);
    }

    // Track round trip
    if (this.stages.responseLatency) {
      this.roundTrips.push({
        timestamp: new Date().toISOString(),
        latency: this.stages.responseLatency,
        wsLatency: this.stages.wsConnectDuration,
        geminiLatency: this.stages.geminiConnectDuration,
        audioLatency: this.stages.firstAudioLatency
      });
    }
  }

  /**
   * Calculate bottleneck (slowest stage)
   */
  calculateBottleneck() {
    const durations = {
      'WebSocket Connection': this.stages.wsConnectDuration,
      'Gemini Connection': this.stages.geminiConnectDuration,
      'Audio Delivery': this.stages.firstAudioLatency,
      'Response Latency': this.stages.responseLatency
    };

    let maxDuration = 0;
    let bottleneck = null;

    Object.entries(durations).forEach(([stage, duration]) => {
      if (duration && duration > maxDuration) {
        maxDuration = duration;
        bottleneck = stage;
      }
    });

    this.metrics.bottleneck = bottleneck;
    return bottleneck;
  }

  /**
   * Get latency summary
   */
  getSummary() {
    this.calculateBottleneck();

    const summary = {
      callId: this.callId,
      agentId: this.agentId,
      timestamps: {
        wsConnectMs: this.stages.wsConnectDuration,
        geminiConnectMs: this.stages.geminiConnectDuration,
        firstAudioMs: this.stages.firstAudioLatency,
        responseLatencyMs: this.stages.responseLatency
      },
      analysis: {
        bottleneck: this.metrics.bottleneck,
        totalRoundTrips: this.roundTrips.length,
        avgResponseLatency: this.calculateAverageResponseLatency(),
        maxResponseLatency: this.calculateMaxResponseLatency()
      },
      quality: {
        wsOk: this.stages.wsConnectDuration < 100,
        geminiOk: this.stages.geminiConnectDuration < 3000,
        audioOk: this.stages.firstAudioLatency < 500,
        responseOk: this.stages.responseLatency < 400
      }
    };

    return summary;
  }

  /**
   * Calculate average response latency
   */
  calculateAverageResponseLatency() {
    if (this.roundTrips.length === 0) return 0;

    const total = this.roundTrips.reduce((sum, rt) => sum + rt.latency, 0);
    return Math.round(total / this.roundTrips.length);
  }

  /**
   * Calculate maximum response latency
   */
  calculateMaxResponseLatency() {
    if (this.roundTrips.length === 0) return 0;

    return Math.max(...this.roundTrips.map(rt => rt.latency));
  }

  /**
   * Log detailed diagnostics
   */
  logDiagnostics() {
    const summary = this.getSummary();

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           LATENCY DIAGNOSTICS - Call ${this.callId}              ║
╚═══════════════════════════════════════════════════════════════╝

📊 CONNECTION TIMINGS:
  • WebSocket Connection: ${summary.timestamps.wsConnectMs}ms ${summary.quality.wsOk ? '✅' : '❌'}
  • Gemini Connection:    ${summary.timestamps.geminiConnectMs}ms ${summary.quality.geminiOk ? '✅' : '❌'}
  • First Audio Chunk:    ${summary.timestamps.firstAudioMs}ms ${summary.quality.audioOk ? '✅' : '❌'}

📞 CONVERSATION METRICS:
  • Response Latency:     ${summary.timestamps.responseLatencyMs}ms ${summary.quality.responseOk ? '✅' : '❌'}
  • Avg Response (${this.roundTrips.length} turns):    ${summary.analysis.avgResponseLatency}ms
  • Max Response Latency: ${summary.analysis.maxResponseLatency}ms

🔍 ANALYSIS:
  • Bottleneck Stage:     ${summary.analysis.bottleneck || 'None'}
  • Round Trips:          ${summary.analysis.totalRoundTrips}

🎯 GOALS:
  • Target Latency:       <400ms
  • Current Status:       ${summary.timestamps.responseLatencyMs < 400 ? '🟢 GOOD' : '🟡 NEEDS OPTIMIZATION'}
    `);

    // Recommendations
    if (summary.analysis.bottleneck) {
      console.log(`💡 OPTIMIZATION: ${this.getOptimizationHint(summary.analysis.bottleneck)}`);
    }
  }

  /**
   * Get optimization hint based on bottleneck
   */
  getOptimizationHint(bottleneck) {
    const hints = {
      'WebSocket Connection': 'Optimize network path or use connection pooling',
      'Gemini Connection': 'Gemini API latency - consider caching or warming up',
      'Audio Delivery': 'Reduce audio processing or use streaming',
      'Response Latency': 'Optimize Gemini prompt or increase token limits'
    };

    return hints[bottleneck] || 'Unknown bottleneck';
  }

  /**
   * Export metrics for analytics
   */
  exportMetrics() {
    return {
      callId: this.callId,
      agentId: this.agentId,
      timestamp: new Date().toISOString(),
      latencies: {
        wsConnect: this.stages.wsConnectDuration,
        geminiConnect: this.stages.geminiConnectDuration,
        firstAudio: this.stages.firstAudioLatency,
        response: this.stages.responseLatency
      },
      roundTrips: this.roundTrips,
      summary: this.getSummary()
    };
  }
}

export default LatencyTracker;
