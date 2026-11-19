import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { login, googleLogin, linkGoogle, unlinkGoogle, register, updateProfile, forgotPassword, changePassword, adminResetPassword, requestOtp, verifyOtp } from '../controllers/pg-auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
const router = Router();
const otpRequestLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many verification requests. Try again in 10 minutes.' }
});
const otpVerifyLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many verification attempts. Try again in 10 minutes.' }
});
// Google sign-in has its own budget, so busy OTP traffic cannot block it (or vice versa).
const googleLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many Google sign-in attempts. Try again in 10 minutes.' }
});
router.post('/login', login);
router.post('/google', googleLimiter, googleLogin);
router.post('/google/link', authenticate, googleLimiter, linkGoogle);
router.delete('/google/link', authenticate, unlinkGoogle);
router.post('/otp-request', otpRequestLimiter, requestOtp);
router.post('/otp-verify', otpVerifyLimiter, verifyOtp);
router.post('/register', register);
router.post('/forgot-password', forgotPassword);
router.post('/change-password', authenticate, changePassword);
router.post('/admin-reset-password', authenticate, adminResetPassword);
router.put('/profile', authenticate, updateProfile);
export default router;
//# sourceMappingURL=auth.routes.js.map