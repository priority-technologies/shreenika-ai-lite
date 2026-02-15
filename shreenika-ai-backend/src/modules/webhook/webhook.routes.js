import { Router } from 'express';
import {
  createWebhook,
  listWebhooks,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  getWebhookLogs,
  toggleWebhookStatus,
} from './webhook.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

const router = Router();

// All webhook routes require authentication
router.use(authenticate);

/**
 * Webhook Management
 */
router.post('/', createWebhook);
router.get('/', listWebhooks);
router.get('/:webhookId', getWebhook);
router.put('/:webhookId', updateWebhook);
router.delete('/:webhookId', deleteWebhook);
router.patch('/:webhookId/toggle', toggleWebhookStatus);

/**
 * Webhook Testing & Logs
 */
router.post('/:webhookId/test', testWebhook);
router.get('/:webhookId/logs', getWebhookLogs);

export default router;
