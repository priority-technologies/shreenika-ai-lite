import { Router } from 'express';
import * as controller from '../controllers/auth.controller';

const router = Router();

router.post('/login', controller.login);
router.post('/register', controller.register);
router.post('/google', controller.googleLogin);
router.post('/forgot-password', controller.forgotPassword);
router.post('/reset-password', controller.resetPassword);
router.get('/verify/:token', controller.verifyEmail);

export default router;
