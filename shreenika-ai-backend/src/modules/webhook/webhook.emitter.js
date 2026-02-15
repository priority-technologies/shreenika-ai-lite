import { WebhookService } from './webhook.service.js';

/**
 * Webhook Event Emitter
 * Used to trigger webhooks from various modules
 * Example: webhookEmitter.emit('lead.created', userId, leadData)
 */

export const webhookEmitter = {
  /**
   * Emit lead.created event
   */
  async onLeadCreated(userId, leadData) {
    try {
      await WebhookService.triggerEvent(userId, 'lead.created', {
        event: 'lead.created',
        timestamp: new Date().toISOString(),
        data: leadData,
      });
    } catch (error) {
      console.error('❌ Error emitting lead.created webhook:', error.message);
    }
  },

  /**
   * Emit lead.updated event
   */
  async onLeadUpdated(userId, leadData, changedFields) {
    try {
      await WebhookService.triggerEvent(userId, 'lead.updated', {
        event: 'lead.updated',
        timestamp: new Date().toISOString(),
        changedFields,
        data: leadData,
      });
    } catch (error) {
      console.error('❌ Error emitting lead.updated webhook:', error.message);
    }
  },

  /**
   * Emit call.completed event
   */
  async onCallCompleted(userId, callData) {
    try {
      await WebhookService.triggerEvent(userId, 'call.completed', {
        event: 'call.completed',
        timestamp: new Date().toISOString(),
        data: callData,
      });
    } catch (error) {
      console.error('❌ Error emitting call.completed webhook:', error.message);
    }
  },

  /**
   * Emit agent.assigned event
   */
  async onAgentAssigned(userId, leadId, agentId, agentData) {
    try {
      await WebhookService.triggerEvent(userId, 'agent.assigned', {
        event: 'agent.assigned',
        timestamp: new Date().toISOString(),
        leadId,
        agentId,
        agent: agentData,
      });
    } catch (error) {
      console.error('❌ Error emitting agent.assigned webhook:', error.message);
    }
  },

  /**
   * Emit contact.created event
   */
  async onContactCreated(userId, contactData) {
    try {
      await WebhookService.triggerEvent(userId, 'contact.created', {
        event: 'contact.created',
        timestamp: new Date().toISOString(),
        data: contactData,
      });
    } catch (error) {
      console.error('❌ Error emitting contact.created webhook:', error.message);
    }
  },
};
