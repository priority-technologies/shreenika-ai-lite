import { Router } from 'express';
import { getCurrentUsage } from '../controllers/usage.controller';

const router = Router();

router.get('/current', getCurrentUsage);

export default router;
