/**
 * Audio Quality Monitor Service
 * Gap 26: Monitor call audio quality and SLA compliance
 *
 * Tracks:
 * - Packet loss rate
 * - Jitter
 * - Latency
 * - Audio level
 * - Background noise
 */

export class AudioQualityMonitor {
  constructor(callId) {
    this.callId = callId;
    this.startTime = Date.now();

    // Metrics
    this.metrics = {
      totalPackets: 0,
      lostPackets: 0,
      jitterSamples: [],
      latencySamples: [],
      audioLevelSamples: [],
      noiseLevelSamples: [],
      gapsSamples: []
    };

    // Thresholds (SLA targets)
    this.thresholds = {
      maxPacketLoss: 0.02, // 2%
      maxJitter: 50, // 50ms
      maxLatency: 150, // 150ms
      maxNoise: 0.3, // 30% noise floor
      minAudioLevel: 0.1 // 10% min level
    };

    // Alerts
    this.activeAlerts = [];
    this.alertCallbacks = [];
  }

  /**
   * Record packet statistics
   * @param {object} stats - { totalPackets, lostPackets, gap }
   */
  recordPacketStats(stats) {
    this.metrics.totalPackets += stats.totalPackets || 1;
    if (stats.lostPackets) {
      this.metrics.lostPackets += stats.lostPackets;
    }
    if (stats.gap) {
      this.metrics.gapsSamples.push(stats.gap);
    }

    // Check packet loss SLA
    this.checkPacketLossSLA();
  }

  /**
   * Record jitter sample
   * @param {number} jitterMs - Jitter in milliseconds
   */
  recordJitter(jitterMs) {
    this.metrics.jitterSamples.push(jitterMs);

    // Keep only last 100 samples
    if (this.metrics.jitterSamples.length > 100) {
      this.metrics.jitterSamples.shift();
    }

    this.checkJitterSLA();
  }

  /**
   * Record latency sample
   * @param {number} latencyMs - Latency in milliseconds
   */
  recordLatency(latencyMs) {
    this.metrics.latencySamples.push(latencyMs);

    // Keep only last 100 samples
    if (this.metrics.latencySamples.length > 100) {
      this.metrics.latencySamples.shift();
    }

    this.checkLatencySLA();
  }

  /**
   * Record audio level
   * @param {number} level - Audio level 0-1
   */
  recordAudioLevel(level) {
    this.metrics.audioLevelSamples.push(level);

    // Keep only last 100 samples
    if (this.metrics.audioLevelSamples.length > 100) {
      this.metrics.audioLevelSamples.shift();
    }

    this.checkAudioLevelSLA();
  }

  /**
   * Record noise level
   * @param {number} noiseLevel - Noise level 0-1
   */
  recordNoiseLevel(noiseLevel) {
    this.metrics.noiseLevelSamples.push(noiseLevel);

    // Keep only last 100 samples
    if (this.metrics.noiseLevelSamples.length > 100) {
      this.metrics.noiseLevelSamples.shift();
    }

    this.checkNoiseSLA();
  }

  /**
   * Check packet loss SLA
   */
  checkPacketLossSLA() {
    if (this.metrics.totalPackets === 0) return;

    const lossRate = this.metrics.lostPackets / this.metrics.totalPackets;

    if (lossRate > this.thresholds.maxPacketLoss) {
      this.raiseAlert('PACKET_LOSS', `High packet loss: ${(lossRate * 100).toFixed(2)}%`, lossRate);
    } else {
      this.clearAlert('PACKET_LOSS');
    }
  }

  /**
   * Check jitter SLA
   */
  checkJitterSLA() {
    if (this.metrics.jitterSamples.length === 0) return;

    const avgJitter = this.metrics.jitterSamples.reduce((a, b) => a + b) / this.metrics.jitterSamples.length;

    if (avgJitter > this.thresholds.maxJitter) {
      this.raiseAlert('HIGH_JITTER', `High jitter: ${avgJitter.toFixed(1)}ms`, avgJitter);
    } else {
      this.clearAlert('HIGH_JITTER');
    }
  }

  /**
   * Check latency SLA
   */
  checkLatencySLA() {
    if (this.metrics.latencySamples.length === 0) return;

    const avgLatency = this.metrics.latencySamples.reduce((a, b) => a + b) / this.metrics.latencySamples.length;

    if (avgLatency > this.thresholds.maxLatency) {
      this.raiseAlert('HIGH_LATENCY', `High latency: ${avgLatency.toFixed(0)}ms`, avgLatency);
    } else {
      this.clearAlert('HIGH_LATENCY');
    }
  }

  /**
   * Check audio level SLA
   */
  checkAudioLevelSLA() {
    if (this.metrics.audioLevelSamples.length === 0) return;

    const avgLevel = this.metrics.audioLevelSamples.reduce((a, b) => a + b) / this.metrics.audioLevelSamples.length;

    if (avgLevel < this.thresholds.minAudioLevel) {
      this.raiseAlert('LOW_AUDIO', `Low audio level: ${(avgLevel * 100).toFixed(1)}%`, avgLevel);
    } else {
      this.clearAlert('LOW_AUDIO');
    }
  }

  /**
   * Check noise SLA
   */
  checkNoiseSLA() {
    if (this.metrics.noiseLevelSamples.length === 0) return;

    const avgNoise = this.metrics.noiseLevelSamples.reduce((a, b) => a + b) / this.metrics.noiseLevelSamples.length;

    if (avgNoise > this.thresholds.maxNoise) {
      this.raiseAlert('HIGH_NOISE', `High background noise: ${(avgNoise * 100).toFixed(1)}%`, avgNoise);
    } else {
      this.clearAlert('HIGH_NOISE');
    }
  }

  /**
   * Raise quality alert
   */
  raiseAlert(type, message, value) {
    // Check if alert already exists
    if (this.activeAlerts.find(a => a.type === type)) {
      return; // Already alerted
    }

    const alert = {
      type,
      message,
      value,
      timestamp: new Date().toISOString(),
      severity: this.calculateSeverity(type, value)
    };

    this.activeAlerts.push(alert);
    console.warn(`⚠️  QUALITY ALERT [${alert.severity}]: ${message}`);

    // Trigger alert callbacks
    this.alertCallbacks.forEach(cb => {
      try {
        cb(alert);
      } catch (err) {
        console.error(`Error in alert callback: ${err.message}`);
      }
    });
  }

  /**
   * Clear alert
   */
  clearAlert(type) {
    this.activeAlerts = this.activeAlerts.filter(a => a.type !== type);
  }

  /**
   * Calculate alert severity
   */
  calculateSeverity(type, value) {
    const ratios = {
      'PACKET_LOSS': value / this.thresholds.maxPacketLoss,
      'HIGH_JITTER': value / this.thresholds.maxJitter,
      'HIGH_LATENCY': value / this.thresholds.maxLatency,
      'LOW_AUDIO': 1 - (value / this.thresholds.minAudioLevel),
      'HIGH_NOISE': value / this.thresholds.maxNoise
    };

    const ratio = ratios[type] || 1;

    if (ratio > 2) return 'CRITICAL';
    if (ratio > 1.5) return 'HIGH';
    if (ratio > 1) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Register alert callback
   * @param {function} callback - Called on quality alert
   */
  onAlert(callback) {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get quality report
   * @returns {object} - Quality metrics and SLA status
   */
  getReport() {
    const duration = (Date.now() - this.startTime) / 1000;
    const avgJitter = this.metrics.jitterSamples.length > 0
      ? this.metrics.jitterSamples.reduce((a, b) => a + b) / this.metrics.jitterSamples.length
      : 0;
    const avgLatency = this.metrics.latencySamples.length > 0
      ? this.metrics.latencySamples.reduce((a, b) => a + b) / this.metrics.latencySamples.length
      : 0;
    const avgAudioLevel = this.metrics.audioLevelSamples.length > 0
      ? this.metrics.audioLevelSamples.reduce((a, b) => a + b) / this.metrics.audioLevelSamples.length
      : 0;
    const avgNoise = this.metrics.noiseLevelSamples.length > 0
      ? this.metrics.noiseLevelSamples.reduce((a, b) => a + b) / this.metrics.noiseLevelSamples.length
      : 0;
    const packetLoss = this.metrics.totalPackets > 0
      ? this.metrics.lostPackets / this.metrics.totalPackets
      : 0;

    return {
      callId: this.callId,
      duration: duration.toFixed(1) + 's',
      metrics: {
        packetLoss: (packetLoss * 100).toFixed(2) + '%',
        jitter: avgJitter.toFixed(1) + 'ms',
        latency: avgLatency.toFixed(0) + 'ms',
        audioLevel: (avgAudioLevel * 100).toFixed(1) + '%',
        noiseLevel: (avgNoise * 100).toFixed(1) + '%'
      },
      slaCompliance: {
        packetLoss: packetLoss <= this.thresholds.maxPacketLoss ? '✅' : '❌',
        jitter: avgJitter <= this.thresholds.maxJitter ? '✅' : '❌',
        latency: avgLatency <= this.thresholds.maxLatency ? '✅' : '❌',
        audioLevel: avgAudioLevel >= this.thresholds.minAudioLevel ? '✅' : '❌',
        noiseLevel: avgNoise <= this.thresholds.maxNoise ? '✅' : '❌'
      },
      activeAlerts: this.activeAlerts.length,
      alerts: this.activeAlerts
    };
  }
}

export default AudioQualityMonitor;
