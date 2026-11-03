import { Router } from 'express';
import { createPgOperator, deletePgOperatorProperty, listPgOperators } from '../controllers/pg-admin.controller.js';
import {
  cancelBookingRequest,
  checkInTenant,
  checkOutTenant,
  createBookingRequest,
  createMaintenanceTicket,
  createProperty,
  createPropertyStaff,
  createRentEntry,
  createRoom,
  deleteProperty,
  getPublicConfig,
  listTenantStays,
  submitTenantNotice,
  cancelTenantNotice,
  listAuditLogs,
  getOwnerReport,
  getOwnerSummary,
  getPublicBookingStatus,
  listGuestBookings,
  listOwnerBookings,
  listOwnerProperties,
  listOwnerRentEntries,
  sendRentReminders,
  listOwnerExpenses,
  createOwnerExpense,
  deleteOwnerExpense,
  listElectricityBills,
  proposeElectricityBill,
  approveElectricityBill,
  listOwnerTenants,
  listOwnerTickets,
  listTenantTickets,
  createTenantTicket,
  updateResidentProfile,
  listResidentNotifications,
  markResidentNotificationRead,
  createResidentPaymentClaim,
  listResidentPaymentClaims,
  listOwnerPaymentClaims,
  reviewPaymentClaim,
  markDepositRefunded,
  listProperties,
  listPropertyStaff,
  recordRentPayment,
  removePropertyStaff,
  updateBedStatus,
  updateBookingStatus,
  updateMaintenanceStatus,
  updateProperty,
  updateTenantProfile
} from '../controllers/pg.controller.js';
import multer from 'multer';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware.js';
import { getAiStatus, postChat, postTranscribe } from '../controllers/ai.controller.js';
import {
  createRoomChange,
  decideRoomChange,
  listMyRoomChanges,
  listRoomChangeMatches,
  listStaffRoomChanges,
  listVacantBeds,
  proposeRoomSwap,
  respondRoomSwap
} from '../controllers/room-change.controller.js';

const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, done) => {
    done(null, /^audio\//.test(file.mimetype || ''));
  }
});

const router = Router();

router.get('/admin/operators', authenticate, listPgOperators);
router.post('/admin/operators', authenticate, createPgOperator);
router.delete('/admin/operators/:propertyId', authenticate, deletePgOperatorProperty);

router.get('/config', getPublicConfig);
router.get('/ai/status', getAiStatus);
router.post('/ai/chat', optionalAuthenticate, postChat);
router.post('/ai/transcribe', voiceUpload.single('audio'), postTranscribe);
router.get('/tenant/stays', authenticate, listTenantStays);
router.get('/tenant/maintenance', authenticate, listTenantTickets);
router.post('/tenant/maintenance', authenticate, createTenantTicket);
router.patch('/tenant/:tenantId/profile', authenticate, updateResidentProfile);
router.get('/tenant/notifications', authenticate, listResidentNotifications);
router.patch('/tenant/notifications/:notificationId/read', authenticate, markResidentNotificationRead);
router.get('/tenant/payment-claims', authenticate, listResidentPaymentClaims);
router.post('/tenant/payment-claims', authenticate, createResidentPaymentClaim);
router.post('/tenant/:tenantId/notice', authenticate, submitTenantNotice);
router.post('/tenant/:tenantId/notice-cancel', authenticate, cancelTenantNotice);
router.get('/tenant/room-changes', authenticate, listMyRoomChanges);
router.post('/tenant/room-changes', authenticate, createRoomChange);
router.get('/tenant/room-change-matches', authenticate, listRoomChangeMatches);
router.get('/tenant/vacant-beds', authenticate, listVacantBeds);
router.post('/tenant/room-changes/:requestId/proposals', authenticate, proposeRoomSwap);
router.post('/tenant/room-changes/:requestId/response', authenticate, respondRoomSwap);
router.get('/owner/activity', authenticate, listAuditLogs);
router.get('/properties', listProperties);
router.get('/bookings/mine', listGuestBookings);
router.post('/bookings', createBookingRequest);
router.post('/bookings/:bookingRef/cancel', cancelBookingRequest);
router.get('/bookings/:bookingRef/status', getPublicBookingStatus);

router.get('/owner/properties', authenticate, listOwnerProperties);
router.post('/owner/properties', authenticate, createProperty);
router.patch('/owner/properties/:propertyId', authenticate, updateProperty);
router.delete('/owner/properties/:propertyId', authenticate, deleteProperty);
router.post('/owner/properties/:propertyId/rooms', authenticate, createRoom);
router.patch('/owner/beds/:bedId/status', authenticate, updateBedStatus);
router.get('/owner/bookings', authenticate, listOwnerBookings);
router.get('/owner/room-changes', authenticate, listStaffRoomChanges);
router.post('/owner/room-changes/:requestId/decision', authenticate, decideRoomChange);
router.patch('/owner/bookings/:bookingId/status', authenticate, updateBookingStatus);
router.post('/owner/tenants/:tenantId/check-in', authenticate, checkInTenant);
router.post('/owner/tenants/:tenantId/check-out', authenticate, checkOutTenant);
router.patch('/owner/tenants/:tenantId/deposit-refund', authenticate, markDepositRefunded);
router.get('/owner/tenants', authenticate, listOwnerTenants);
router.patch('/owner/tenants/:tenantId', authenticate, updateTenantProfile);
router.get('/owner/staff', authenticate, listPropertyStaff);
router.post('/owner/staff', authenticate, createPropertyStaff);
router.delete('/owner/staff/:propertyId/:userId', authenticate, removePropertyStaff);
router.get('/owner/rent', authenticate, listOwnerRentEntries);
router.post('/owner/rent', authenticate, createRentEntry);
router.post('/owner/rent/reminders', authenticate, sendRentReminders);
router.get('/owner/expenses', authenticate, listOwnerExpenses);
router.post('/owner/expenses', authenticate, createOwnerExpense);
router.delete('/owner/expenses/:expenseId', authenticate, deleteOwnerExpense);
router.get('/owner/electricity/bills', authenticate, listElectricityBills);
router.post('/owner/electricity/bills', authenticate, proposeElectricityBill);
router.post('/owner/electricity/bills/:billId/approve', authenticate, approveElectricityBill);
router.patch('/owner/rent/:entryId/payment', authenticate, recordRentPayment);
router.get('/owner/payment-claims', authenticate, listOwnerPaymentClaims);
router.patch('/owner/payment-claims/:claimId', authenticate, reviewPaymentClaim);
router.get('/owner/summary', authenticate, getOwnerSummary);
router.get('/owner/reports', authenticate, getOwnerReport);
router.get('/owner/maintenance', authenticate, listOwnerTickets);
router.post('/owner/maintenance', authenticate, createMaintenanceTicket);
router.patch('/owner/maintenance/:ticketId/status', authenticate, updateMaintenanceStatus);

export default router;