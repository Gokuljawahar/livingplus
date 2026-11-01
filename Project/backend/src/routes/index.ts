import { Router } from 'express';
import authRoutes from './auth.routes.js';
import pgRoutes from './pg.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/pg', pgRoutes);

export default router;
