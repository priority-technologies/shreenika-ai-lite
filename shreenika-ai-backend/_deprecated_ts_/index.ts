import { Router } from 'express';
import contactsRoutes from './contacts.routes';
import authRoutes from './auth.routes';
const router = Router();

// Health check (optional but safe)
router.get('/', (_req, res) => {
  res.json({ status: 'API running' });
});

router.use('/contacts', contactsRoutes);
router.use('/auth', authRoutes);

export default router;
