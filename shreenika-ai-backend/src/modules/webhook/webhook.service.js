import { Webhook, WebhookLog } from './webhook.model.js';
import axios from 'axios';

/**
 * Webhook Service - Handles event triggers and webhook delivery
 */
export class WebhookService {
  /**
   * Build request headers with auth
   */
  static buildHeaders(webhook) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': webhook.event || 'unknown',
      'X-Webhook-Id': webhook._id?.toString() || 'unknown',
      'X-Webhook-Timestamp': new Date().toISOString(),
      ...Object.fromEntries(webhook.headers || new Map()),
    };

    // Add authentication headers
    if (webhook.auth?.type === 'basic' && webhook.auth?.credentials) {
      const { username, password } = webhook.auth.credentials;
      if (username && password) {
        const basic = Buffer.from(`${username}:${password}`).toString('base64');
        headers['Authorization'] = `Basic ${basic}`;
      }
    } else if (webhook.auth?.type === 'bearer' && webhook.auth?.credentials?.token) {
      headers['Authorization'] = `Bearer ${webhook.auth.credentials.token}`;
    } else if (webhook.auth?.type === 'api_key' && webhook.auth?.credentials?.apiKey) {
      const headerName = webhook.auth.credentials.apiKeyHeader || 'X-API-Key';
      headers[headerName] = webhook.auth.credentials.apiKey;
    }

    return headers;
  }

  /**
   * Transform payload based on webhook transformations
   */
  static transformPayload(originalPayload, transformations) {
    if (!transformations || transformations.length === 0) {
      return originalPayload;
    }

    const transformed = {};

    transformations.forEach((t) => {
      if (t.transformType === 'direct') {
        // Direct mapping: sourceField -> targetField
        const value = this.getNestedValue(originalPayload, t.sourceField);
        if (value !== undefined) {
          this.setNestedValue(transformed, t.targetField, value);
        }
      } else if (t.transformType === 'custom' && t.customScript) {
        // Custom transformation using eval (use with caution in production)
        try {
          const func = new Function('data', `return ${t.customScript}`);
          const value = func(originalPayload);
          this.setNestedValue(transformed, t.targetField, value);
        } catch (error) {
          console.error(`❌ Webhook transform error for ${t.targetField}:`, error.message);
        }
      }
    });

    return Object.keys(transformed).length > 0 ? transformed : originalPayload;
  }

  static getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  static setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, prop) => {
      if (!current[prop]) current[prop] = {};
      return current[prop];
    }, obj);
    target[lastKey] = value;
  }

  /**
   * Deliver webhook with retry logic
   */
  static async deliverWebhook(webhook, event, payload) {
    const startTime = Date.now();
    const headers = this.buildHeaders(webhook);
    const transformedPayload = this.transformPayload(payload, webhook.transformations);

    console.log(`📤 Webhook: Sending ${event} to ${webhook.url}`);

    for (let attempt = 0; attempt <= webhook.retryPolicy.maxRetries; attempt++) {
      try {
        const response = await axios.post(webhook.url, transformedPayload, {
          headers,
          timeout: 10000,
        });

        const duration = Date.now() - startTime;

        // Log success
        await WebhookLog.create({
          webhookId: webhook._id,
          userId: webhook.userId,
          event,
          payload: transformedPayload,
          statusCode: response.status,
          response: response.data,
          success: true,
          retryCount: attempt,
          duration,
        });

        // Update webhook stats
        await Webhook.updateOne(
          { _id: webhook._id },
          {
            lastSuccessAt: new Date(),
            lastTriggeredAt: new Date(),
            $inc: { successCount: 1 },
          }
        );

        console.log(`✅ Webhook: Success (${response.status}) after ${attempt} retries`);
        return { success: true, statusCode: response.status };
      } catch (error) {
        console.error(`❌ Webhook attempt ${attempt + 1}/${webhook.retryPolicy.maxRetries + 1} failed:`, error.message);

        if (attempt < webhook.retryPolicy.maxRetries) {
          const delay = webhook.retryPolicy.retryDelay * Math.pow(2, attempt); // Exponential backoff
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          const duration = Date.now() - startTime;

          // Log failure
          await WebhookLog.create({
            webhookId: webhook._id,
            userId: webhook.userId,
            event,
            payload: transformedPayload,
            statusCode: error.response?.status,
            response: error.response?.data,
            error: error.message,
            success: false,
            retryCount: attempt,
            duration,
          });

          // Update webhook stats
          await Webhook.updateOne(
            { _id: webhook._id },
            {
              lastTriggeredAt: new Date(),
              $inc: { failureCount: 1 },
            }
          );

          console.error(`❌ Webhook: Failed after all retries`);
          return { success: false, error: error.message };
        }
      }
    }
  }

  /**
   * Trigger event for all active webhooks
   */
  static async triggerEvent(userId, event, payload) {
    try {
      const webhooks = await Webhook.find({
        userId,
        isActive: true,
        events: event,
      });

      console.log(`🔔 Webhook event triggered: ${event} (${webhooks.length} webhooks)`);

      // Trigger all webhooks in parallel
      const results = await Promise.allSettled(
        webhooks.map((webhook) => this.deliverWebhook(webhook, event, payload))
      );

      return {
        event,
        total: webhooks.length,
        results: results.map((r) => (r.status === 'fulfilled' ? r.value : { success: false, error: r.reason })),
      };
    } catch (error) {
      console.error(`❌ Error triggering webhook event:`, error.message);
      throw error;
    }
  }

  /**
   * Test webhook immediately
   */
  static async testWebhook(webhookId) {
    try {
      const webhook = await Webhook.findById(webhookId);
      if (!webhook) {
        throw new Error('Webhook not found');
      }

      const testPayload = {
        test: true,
        timestamp: new Date().toISOString(),
        event: webhook.events[0] || 'test.event',
        message: 'This is a test payload from Shreenika AI',
      };

      const result = await this.deliverWebhook(webhook, 'test.event', testPayload);
      return result;
    } catch (error) {
      console.error(`❌ Test webhook failed:`, error.message);
      throw error;
    }
  }
}
