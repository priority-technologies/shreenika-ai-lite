/**
 * Analytics Handler
 * Tracks metrics, performance, and quality for voice sessions
 */

export class AnalyticsHandler {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.metrics = {
      startTime: Date.now(),
      messageCount: 0,
      totalLatency: 0,
      sttMetrics: [],
      llmMetrics: [],
      ttsMetrics: [],
      userSentiment: [],
      errors: [],
      events: []
    };
  }

  /**
   * Track STT performance
   */
  trackSTT(latency, transcript, confidence) {
    this.metrics.sttMetrics.push({
      timestamp: Date.now(),
      latency,
      transcriptLength: transcript.length,
      confidence
    });

    return {
      averageLatency: this.getAverageSTTLatency(),
      metrics: this.metrics.sttMetrics
    };
  }

  /**
   * Track LLM performance
   */
  trackLLM(latency, responseLength, temperature) {
    this.metrics.llmMetrics.push({
      timestamp: Date.now(),
      latency,
      responseLength,
      temperature
    });

    this.metrics.messageCount += 1;
    this.metrics.totalLatency += latency;

    return {
      averageLatency: this.getAverageLLMLatency(),
      messageCount: this.metrics.messageCount
    };
  }

  /**
   * Track TTS performance
   */
  trackTTS(latency, audioLength) {
    this.metrics.ttsMetrics.push({
      timestamp: Date.now(),
      latency,
      audioLength
    });

    return {
      averageLatency: this.getAverageTTSLatency(),
      metrics: this.metrics.ttsMetrics
    };
  }

  /**
   * Track user sentiment (would use sentiment analysis in production)
   */
  trackSentiment(text, score = null) {
    const sentiment = {
      timestamp: Date.now(),
      text: text.substring(0, 100), // Store first 100 chars
      score: score || this.analyzeSentiment(text)
    };

    this.metrics.userSentiment.push(sentiment);

    return sentiment;
  }

  /**
   * Simple sentiment analysis (0 = negative, 0.5 = neutral, 1 = positive)
   */
  analyzeSentiment(text) {
    const negativeWords = ['no', 'bad', 'hate', 'terrible', 'awful', 'poor', 'sad'];
    const positiveWords = ['yes', 'good', 'great', 'love', 'excellent', 'happy', 'amazing'];

    const lowerText = text.toLowerCase();
    let score = 0.5; // Start neutral

    negativeWords.forEach((word) => {
      if (lowerText.includes(word)) score -= 0.1;
    });

    positiveWords.forEach((word) => {
      if (lowerText.includes(word)) score += 0.1;
    });

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Log event
   */
  logEvent(eventName, data = {}) {
    this.metrics.events.push({
      timestamp: Date.now(),
      name: eventName,
      data
    });
  }

  /**
   * Log error
   */
  logError(error, context = {}) {
    this.metrics.errors.push({
      timestamp: Date.now(),
      message: error.message,
      context
    });
  }

  /**
   * Get average latencies
   */
  getAverageSTTLatency() {
    if (this.metrics.sttMetrics.length === 0) return 0;
    const sum = this.metrics.sttMetrics.reduce((a, b) => a + b.latency, 0);
    return Math.round(sum / this.metrics.sttMetrics.length);
  }

  getAverageLLMLatency() {
    if (this.metrics.llmMetrics.length === 0) return 0;
    const sum = this.metrics.llmMetrics.reduce((a, b) => a + b.latency, 0);
    return Math.round(sum / this.metrics.llmMetrics.length);
  }

  getAverageTTSLatency() {
    if (this.metrics.ttsMetrics.length === 0) return 0;
    const sum = this.metrics.ttsMetrics.reduce((a, b) => a + b.latency, 0);
    return Math.round(sum / this.metrics.ttsMetrics.length);
  }

  /**
   * Get overall pipeline latency
   */
  getAverageCycleLatency() {
    const avgSTT = this.getAverageSTTLatency();
    const avgLLM = this.getAverageLLMLatency();
    const avgTTS = this.getAverageTTSLatency();
    return avgSTT + avgLLM + avgTTS;
  }

  /**
   * Get quality score (0-100)
   */
  getQualityScore() {
    let score = 100;

    // Penalize for errors
    score -= this.metrics.errors.length * 10;

    // Penalize for slow responses
    const cycleLatency = this.getAverageCycleLatency();
    if (cycleLatency > 3000) score -= 20; // > 3s is slow
    if (cycleLatency > 5000) score -= 30; // > 5s is very slow

    // Reward for high STT confidence
    const avgConfidence =
      this.metrics.sttMetrics.length > 0
        ? this.metrics.sttMetrics.reduce((a, b) => a + b.confidence, 0) /
          this.metrics.sttMetrics.length
        : 0;

    if (avgConfidence > 0.9) score += 10;

    // Reward for positive sentiment
    const avgSentiment =
      this.metrics.userSentiment.length > 0
        ? this.metrics.userSentiment.reduce((a, b) => a + b.score, 0) /
          this.metrics.userSentiment.length
        : 0.5;

    if (avgSentiment > 0.6) score += 15;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Get comprehensive metrics report
   */
  getMetricsReport() {
    const duration = Date.now() - this.metrics.startTime;

    return {
      sessionId: this.sessionId,
      duration: Math.round(duration / 1000), // seconds
      messageCount: this.metrics.messageCount,

      performance: {
        averageSTTLatency: this.getAverageSTTLatency(),
        averageLLMLatency: this.getAverageLLMLatency(),
        averageTTSLatency: this.getAverageTTSLatency(),
        averageCycleLatency: this.getAverageCycleLatency()
      },

      quality: {
        score: this.getQualityScore(),
        avgSTTConfidence:
          this.metrics.sttMetrics.length > 0
            ? Math.round(
                (this.metrics.sttMetrics.reduce((a, b) => a + b.confidence, 0) /
                  this.metrics.sttMetrics.length) *
                  100
              ) / 100
            : 0,
        avgUserSentiment:
          this.metrics.userSentiment.length > 0
            ? Math.round(
                (this.metrics.userSentiment.reduce((a, b) => a + b.score, 0) /
                  this.metrics.userSentiment.length) *
                  100
              ) / 100
            : 0
      },

      reliability: {
        errorCount: this.metrics.errors.length,
        errorRate: Math.round(
          (this.metrics.errors.length / Math.max(this.metrics.messageCount, 1)) * 100
        ),
        events: this.metrics.events.length
      },

      summary: this.generateSummary()
    };
  }

  /**
   * Generate human-readable summary
   */
  generateSummary() {
    const latency = this.getAverageCycleLatency();
    const quality = this.getQualityScore();
    const errors = this.metrics.errors.length;

    let summary = `Session: ${this.metrics.messageCount} messages, `;

    if (latency < 1000) {
      summary += 'Fast response times ✅';
    } else if (latency < 3000) {
      summary += 'Good response times 👍';
    } else {
      summary += 'Slow response times ⚠️';
    }

    summary += `, Quality: ${quality}%`;

    if (errors > 0) {
      summary += `, ${errors} error${errors > 1 ? 's' : ''}`;
    }

    return summary;
  }

  /**
   * Export metrics to external service (for cloud monitoring)
   */
  async exportMetrics(endpoint) {
    try {
      const report = this.getMetricsReport();

      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      });

      console.log('✅ Metrics exported');
    } catch (error) {
      console.error('Error exporting metrics:', error.message);
    }
  }
}

export default AnalyticsHandler;
