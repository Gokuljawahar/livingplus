import { Router } from 'express';
import { login, register, updateProfile, forgotPassword, changePassword, adminResetPassword, requestOtp, verifyOtp } from '../controllers/pg-auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/login', login);
router.post('/otp-request', requestOtp);
router.post('/otp-verify', verifyOtp);
router.post('/register', register);
router.post('/forgot-password', forgotPassword);
router.post('/change-password', authenticate, changePassword);
router.post('/admin-reset-password', authenticate, adminResetPassword);
router.put('/profile', authenticate, updateProfile);

export default router;
