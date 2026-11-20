import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { login, googleLogin, linkGoogle, unlinkGoogle, register, updateProfile, forgotPassword, changePassword, verifyMyPhone, requestOtp, verifyOtp } from '../controllers/pg-auth.controller.js';
import { systemRoute } from '../db/context.js';
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
// Sign-in, sign-up and phone codes look up accounts and PGs before anyone is
// authenticated, so they run as the system (each checks credentials itself).
router.post('/login', systemRoute('password sign-in looks up any account', login));
router.post('/google', googleLimiter, systemRoute('Google sign-in looks up the linked account', googleLogin));
router.post('/google/link', authenticate, googleLimiter, linkGoogle);
router.delete('/google/link', authenticate, unlinkGoogle);
router.post('/otp-request', otpRequestLimiter, systemRoute('phone codes check residency before sign-in', requestOtp));
router.post('/otp-verify', otpVerifyLimiter, systemRoute('phone codes check residency before sign-in', verifyOtp));
router.post('/register', systemRoute('registration creates a new PG workspace', register));
router.post('/forgot-password', forgotPassword);
router.post('/change-password', authenticate, changePassword);
router.post('/verify-phone', authenticate, otpVerifyLimiter, verifyMyPhone);
router.put('/profile', authenticate, updateProfile);
export default router;
//# sourceMappingURL=auth.routes.js.map