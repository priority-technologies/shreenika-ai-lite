/**
 * Error Recovery Handler
 * Handles failures gracefully with fallbacks and recovery strategies
 */

export class ErrorRecoveryHandler {
  constructor() {
    this.errorHistory = [];
    this.maxErrorCount = 5;
    this.maxRetries = 3;
    this.fallbackResponses = {
      sttError: "Sorry, I didn't catch that. Could you please repeat?",
      llmError: "I encountered an issue. Let me try that again.",
      ttsError: "I'm having trouble speaking. Please hold.",
      networkError: "Connection issue. Please wait a moment.",
      timeoutError: "That took too long. Let's continue.",
      generic: "I apologize for the interruption. Please try again."
    };
  }

  /**
   * Log error for tracking
   */
  logError(error, context = {}) {
    const errorEntry = {
      timestamp: new Date(),
      message: error.message,
      code: error.code,
      context,
      stack: error.stack
    };

    this.errorHistory.push(errorEntry);

    // Keep only last N errors
    if (this.errorHistory.length > this.maxErrorCount * 2) {
      this.errorHistory = this.errorHistory.slice(-this.maxErrorCount);
    }

    console.error('❌ Error logged:', errorEntry);

    return errorEntry;
  }

  /**
   * Get appropriate fallback response
   */
  getFallbackResponse(errorType) {
    return this.fallbackResponses[errorType] || this.fallbackResponses.generic;
  }

  /**
   * Handle STT failure
   */
  async handleSTTError(error, context = {}) {
    console.error('❌ STT Error:', error.message);

    this.logError(error, { ...context, component: 'STT' });

    // Retry logic
    if (context.retryCount < this.maxRetries) {
      console.log(`🔄 Retrying STT (${context.retryCount + 1}/${this.maxRetries})`);
      return {
        action: 'retry',
        retryCount: context.retryCount + 1
      };
    }

    // Fallback response
    return {
      action: 'fallback',
      response: this.getFallbackResponse('sttError'),
      message: 'STT service unavailable - using fallback'
    };
  }

  /**
   * Handle Gemini failure
   */
  async handleLLMError(error, context = {}) {
    console.error('❌ LLM Error:', error.message);

    this.logError(error, { ...context, component: 'Gemini' });

    // If timeout, don't retry
    if (error.message.includes('timeout') || error.code === 'DEADLINE_EXCEEDED') {
      return {
        action: 'fallback',
        response: this.getFallbackResponse('timeoutError'),
        message: 'LLM request timed out'
      };
    }

    // Retry for other errors
    if (context.retryCount < this.maxRetries) {
      console.log(`🔄 Retrying LLM (${context.retryCount + 1}/${this.maxRetries})`);
      return {
        action: 'retry',
        retryCount: context.retryCount + 1
      };
    }

    return {
      action: 'fallback',
      response: this.getFallbackResponse('llmError'),
      message: 'LLM service unavailable - using fallback'
    };
  }

  /**
   * Handle TTS failure
   */
  async handleTTSError(error, context = {}) {
    console.error('❌ TTS Error:', error.message);

    this.logError(error, { ...context, component: 'TTS' });

    // Retry TTS
    if (context.retryCount < this.maxRetries) {
      console.log(`🔄 Retrying TTS (${context.retryCount + 1}/${this.maxRetries})`);
      return {
        action: 'retry',
        retryCount: context.retryCount + 1
      };
    }

    // Use text fallback if TTS fails
    return {
      action: 'fallback_text',
      response: this.getFallbackResponse('ttsError'),
      message: 'TTS service unavailable - sending text only'
    };
  }

  /**
   * Handle network errors
   */
  async handleNetworkError(error, context = {}) {
    console.error('❌ Network Error:', error.message);

    this.logError(error, { ...context, component: 'Network' });

    // Check connection
    const isConnected = await this.checkConnection();

    if (!isConnected) {
      return {
        action: 'wait',
        delay: 2000,
        message: 'Waiting for connection to restore'
      };
    }

    // Retry if connection restored
    if (context.retryCount < this.maxRetries) {
      return {
        action: 'retry',
        retryCount: context.retryCount + 1
      };
    }

    return {
      action: 'fallback',
      response: this.getFallbackResponse('networkError'),
      message: 'Network unavailable'
    };
  }

  /**
   * Check if API connectivity exists
   */
  async checkConnection() {
    try {
      // Quick health check
      const response = await fetch(`${process.env.PUBLIC_BASE_URL || 'http://localhost:8080'}/health`, {
        timeout: 3000
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Circuit breaker - stop processing if too many errors
   */
  shouldBreakCircuit() {
    const recentErrors = this.errorHistory.slice(-this.maxErrorCount);
    return recentErrors.length === this.maxErrorCount;
  }

  /**
   * Reset error tracking
   */
  resetErrorTracking() {
    this.errorHistory = [];
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    const stats = {
      totalErrors: this.errorHistory.length,
      errorsByComponent: {},
      errorsByType: {},
      lastError: this.errorHistory[this.errorHistory.length - 1] || null,
      circuitBreakerTripped: this.shouldBreakCircuit()
    };

    this.errorHistory.forEach((err) => {
      // Count by component
      stats.errorsByComponent[err.context.component] =
        (stats.errorsByComponent[err.context.component] || 0) + 1;

      // Count by type
      const type = err.code || 'unknown';
      stats.errorsByType[type] = (stats.errorsByType[type] || 0) + 1;
    });

    return stats;
  }

  /**
   * Generate error report
   */
  generateErrorReport() {
    return {
      timestamp: new Date(),
      summary: this.getErrorStats(),
      recentErrors: this.errorHistory.slice(-10),
      recommendations: this.getRecommendations()
    };
  }

  /**
   * Get recommendations based on errors
   */
  getRecommendations() {
    const stats = this.getErrorStats();
    const recommendations = [];

    if (stats.errorsByComponent['STT'] > 2) {
      recommendations.push('High STT error rate - check microphone and audio input');
    }

    if (stats.errorsByComponent['Gemini'] > 2) {
      recommendations.push('High LLM error rate - check API quotas and credentials');
    }

    if (stats.errorsByComponent['TTS'] > 2) {
      recommendations.push('High TTS error rate - verify TTS API is functioning');
    }

    if (stats.circuitBreakerTripped) {
      recommendations.push('Circuit breaker triggered - system temporarily unavailable');
    }

    return recommendations;
  }
}

export default ErrorRecoveryHandler;
