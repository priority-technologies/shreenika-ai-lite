/**
 * Webhook Emitter Service
 * Gap 24: Send call status updates via webhooks for real-time integration
 *
 * Sends events for:
 * - Call initiated
 * - Call answered/connected
 * - Agent speaking
 * - User speaking
 * - Call ended
 * - Call failed
 */

export class WebhookEmitter {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
    this.retryAttempts = 3;
    this.retryDelay = 1000; // ms
    this.eventQueue = [];
    this.isProcessing = false;
  }

  /**
   * Emit webhook event
   * @param {string} event - Event type
   * @param {object} data - Event data
   */
  async emit(event, data) {
    if (!this.webhookUrl) {
      console.warn(`⚠️ No webhook URL configured, skipping event: ${event}`);
      return;
    }

    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data
    };

    // Queue event for processing
    this.eventQueue.push(payload);

    // Process queue if not already processing
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process webhook event queue
   */
  async processQueue() {
    if (this.isProcessing || this.eventQueue.length === 0) return;

    this.isProcessing = true;

    while (this.eventQueue.length > 0) {
      const payload = this.eventQueue.shift();

      try {
        await this.sendWebhook(payload);
      } catch (error) {
        console.error(`❌ Webhook failed for event ${payload.event}: ${error.message}`);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Send webhook with retry logic
   * @param {object} payload - Webhook payload
   */
  async sendWebhook(payload, attempt = 1) {
    try {
      const { default: fetch } = await import('node-fetch');

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Shreenika-AI/1.0'
        },
        body: JSON.stringify(payload),
        timeout: 10000 // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      console.log(`✅ Webhook sent: ${payload.event}`);
    } catch (error) {
      if (attempt < this.retryAttempts) {
        console.warn(`⚠️ Webhook attempt ${attempt}/${this.retryAttempts} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        return this.sendWebhook(payload, attempt + 1);
      } else {
        console.error(`❌ Webhook failed after ${this.retryAttempts} attempts: ${error.message}`);
        throw error;
      }
    }
  }

  /**
   * Emit call initiated event
   */
  async emitCallInitiated(callData) {
    await this.emit('call.initiated', {
      callId: callData.callId,
      campaignId: callData.campaignId,
      leadId: callData.leadId,
      agentId: callData.agentId,
      toPhone: callData.toPhone,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit call answered event
   */
  async emitCallAnswered(callData) {
    await this.emit('call.answered', {
      callId: callData.callId,
      providerCallId: callData.providerCallId,
      provider: callData.provider,
      answeredAt: new Date().toISOString()
    });
  }

  /**
   * Emit agent speaking event
   */
  async emitAgentSpeaking(callData) {
    await this.emit('agent.speaking', {
      callId: callData.callId,
      agentId: callData.agentId,
      text: callData.text,
      duration: callData.duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit user speaking event
   */
  async emitUserSpeaking(callData) {
    await this.emit('user.speaking', {
      callId: callData.callId,
      text: callData.text,
      confidence: callData.confidence,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit call ended event
   */
  async emitCallEnded(callData) {
    await this.emit('call.ended', {
      callId: callData.callId,
      duration: callData.duration,
      endReason: callData.endReason,
      status: callData.status,
      metrics: callData.metrics,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit call failed event
   */
  async emitCallFailed(callData) {
    await this.emit('call.failed', {
      callId: callData.callId,
      error: callData.error,
      failureReason: callData.failureReason,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit audio quality alert
   */
  async emitQualityAlert(callData) {
    await this.emit('quality.alert', {
      callId: callData.callId,
      severity: callData.severity, // LOW, MEDIUM, HIGH
      type: callData.type, // JITTER, PACKET_LOSS, LATENCY, NOISE
      value: callData.value,
      threshold: callData.threshold,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      webhookUrl: this.webhookUrl ? '***configured***' : 'NOT CONFIGURED',
      queueLength: this.eventQueue.length,
      isProcessing: this.isProcessing,
      retryAttempts: this.retryAttempts,
      retryDelay: this.retryDelay + 'ms'
    };
  }

  /**
   * Clear event queue
   */
  clearQueue() {
    this.eventQueue = [];
    console.log(`✅ Webhook queue cleared`);
  }
}

export default WebhookEmitter;
