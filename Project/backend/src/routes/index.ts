import { Router } from 'express';
import adminRoutes from './admin.routes.js';
import authRoutes from './auth.routes.js';
import pgRoutes from './pg.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/pg', pgRoutes);
router.use('/admin', adminRoutes);

export default router;
