import { Webhook, WebhookLog } from './webhook.model.js';
import { WebhookService } from './webhook.service.js';

/**
 * Create new webhook
 */
export const createWebhook = async (req, res) => {
  try {
    const { name, description, url, events, headers, auth, transformations, retryPolicy } = req.body;
    const userId = req.user.id;

    if (!url || !events || events.length === 0) {
      return res.status(400).json({ error: 'URL and at least one event are required' });
    }

    const webhook = new Webhook({
      userId,
      name: name || new URL(url).hostname,
      description,
      url,
      events,
      headers: new Map(Object.entries(headers || {})),
      auth: auth || { type: 'none' },
      transformations: transformations || [],
      retryPolicy: retryPolicy || { maxRetries: 3, retryDelay: 5000 },
      isActive: true,
    });

    await webhook.save();

    console.log(`✅ Webhook created: ${webhook._id}`);
    res.status(201).json({
      message: 'Webhook created successfully',
      webhook: webhook.toJSON(),
    });
  } catch (error) {
    console.error('❌ Error creating webhook:', error.message);
    res.status(500).json({ error: error.message });
  }
};

/**
 * List all webhooks for user
 */
export const listWebhooks = async (req, res) => {
  try {
    const userId = req.user.id;
    const { isActive } = req.query;

    const filter = { userId };
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const webhooks = await Webhook.find(filter).sort({ createdAt: -1 });

    res.json({
      total: webhooks.length,
      webhooks: webhooks.map((w) => ({
        ...w.toJSON(),
        // Don't send sensitive auth data to frontend
        auth: {
          type: w.auth?.type || 'none',
          configured: !!w.auth?.credentials,
        },
      })),
    });
  } catch (error) {
    console.error('❌ Error listing webhooks:', error.message);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get single webhook
 */
export const getWebhook = async (req, res) => {
  try {
    const { webhookId } = req.params;
    const userId = req.user.id;

    const webhook = await Webhook.findOne({
      _id: webhookId,
      userId,
    });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    res.json({
      ...webhook.toJSON(),
      auth: {
        type: webhook.auth?.type || 'none',
        configured: !!webhook.auth?.credentials,
      },
    });
  } catch (error) {
    console.error('❌ Error fetching webhook:', error.message);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update webhook
 */
export const updateWebhook = async (req, res) => {
  try {
    const { webhookId } = req.params;
    const userId = req.user.id;
    const { name, description, url, events, headers, auth, transformations, retryPolicy, isActive } = req.body;

    const webhook = await Webhook.findOneAndUpdate(
      { _id: webhookId, userId },
      {
        name,
        description,
        url,
        events,
        headers: headers ? new Map(Object.entries(headers)) : undefined,
        auth: auth || undefined,
        transformations,
        retryPolicy,
        isActive,
      },
      { new: true, runValidators: true }
    );

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    console.log(`✅ Webhook updated: ${webhookId}`);
    res.json({
      message: 'Webhook updated successfully',
      webhook: webhook.toJSON(),
    });
  } catch (error) {
    console.error('❌ Error updating webhook:', error.message);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Delete webhook
 */
export const deleteWebhook = async (req, res) => {
  try {
    const { webhookId } = req.params;
    const userId = req.user.id;

    const webhook = await Webhook.findOneAndDelete({
      _id: webhookId,
      userId,
    });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    // Also delete related logs
    await WebhookLog.deleteMany({ webhookId });

    console.log(`✅ Webhook deleted: ${webhookId}`);
    res.json({ message: 'Webhook deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting webhook:', error.message);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Test webhook
 */
export const testWebhook = async (req, res) => {
  try {
    const { webhookId } = req.params;
    const userId = req.user.id;

    const webhook = await Webhook.findOne({
      _id: webhookId,
      userId,
    });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const result = await WebhookService.testWebhook(webhookId);

    res.json({
      message: 'Test webhook sent',
      result,
    });
  } catch (error) {
    console.error('❌ Error testing webhook:', error.message);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get webhook logs
 */
export const getWebhookLogs = async (req, res) => {
  try {
    const { webhookId } = req.params;
    const userId = req.user.id;
    const { limit = 50, skip = 0 } = req.query;

    const webhook = await Webhook.findOne({
      _id: webhookId,
      userId,
    });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const logs = await WebhookLog.find({ webhookId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await WebhookLog.countDocuments({ webhookId });

    res.json({
      total,
      logs,
    });
  } catch (error) {
    console.error('❌ Error fetching logs:', error.message);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Toggle webhook active status
 */
export const toggleWebhookStatus = async (req, res) => {
  try {
    const { webhookId } = req.params;
    const userId = req.user.id;

    const webhook = await Webhook.findOne({
      _id: webhookId,
      userId,
    });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    webhook.isActive = !webhook.isActive;
    await webhook.save();

    console.log(`✅ Webhook toggled: ${webhookId} -> ${webhook.isActive ? 'active' : 'inactive'}`);
    res.json({
      message: `Webhook ${webhook.isActive ? 'activated' : 'deactivated'}`,
      webhook,
    });
  } catch (error) {
    console.error('❌ Error toggling webhook:', error.message);
    res.status(500).json({ error: error.message });
  }
};
