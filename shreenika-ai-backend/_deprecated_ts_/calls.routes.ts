import { Router } from 'express';
import { startCall, callWebhook, getCallLogs } from '../controllers/calls.controller';

const router = Router();

router.post('/start', startCall);
router.post('/webhook', callWebhook);
router.get('/logs', getCallLogs);

export default router;
