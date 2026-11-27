import { Router } from 'express';
import {
  adminCreateRoom,
  adminDeleteRoom,
  adminUpdateProperty,
  conciergeOnboardProperty,
  getAdminOverview,
  listAdminCatalog,
  listAdminOwners,
  listAdminProperties,
  listOwnerLeads,
  requirePlatformAdmin,
  updateAdminCatalog,
  updateOwnerLead
} from '../controllers/admin.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate, requirePlatformAdmin);

router.get('/overview', getAdminOverview);
router.get('/leads', listOwnerLeads);
router.patch('/leads/:leadId', updateOwnerLead);
router.get('/owners', listAdminOwners);
router.get('/properties', listAdminProperties);
router.post('/onboard', conciergeOnboardProperty);
router.patch('/properties/:propertyId', adminUpdateProperty);
router.post('/properties/:propertyId/rooms', adminCreateRoom);
router.delete('/properties/:propertyId/rooms/:roomId', adminDeleteRoom);
router.get('/catalog', listAdminCatalog);
router.put('/catalog/:key', updateAdminCatalog);

export default router;
