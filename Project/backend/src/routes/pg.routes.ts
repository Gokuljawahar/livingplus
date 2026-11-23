import { reviewDeposit } from '../controllers/deposit-shield.controller.js';
import { getKitchenForecast, getPulse, postBriefingPass, postWeeklyBrief } from '../controllers/insights.controller.js';
import { Router } from 'express';
import { systemRoute } from '../db/context.js';
import { cancelMyServiceOrder, createServiceOrder, listMyServiceOrders, listStaffServiceOrders, updateServiceOrderStatus, updateServiceSettings } from '../controllers/services.controller.js';
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
  vibeCheckProperty,
  buildVibeProfileFromText,
  vibeInterviewStep,
  saveTenantVibe,
  getTenantVibeMatch,
  checkMyKyc,
  checkTenantKyc,
  listConditionReports,
  createConditionReport,
  listPgSites,
  getPgSite,
  searchPropertiesSemantic,
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
import { aiChatLimiter, aiVoiceLimiter, semanticSearchLimiter } from '../middleware/ai-rate-limit.js';
import { validateBody, validateQuery } from '../middleware/validate.middleware.js';
import {
  aiChatBody,
  briefingPassBody,
  conditionReportBody,
  depositReviewBody,
  kitchenForecastQuery,
  pulseQuery,
  saveTenantVibeBody,
  serviceOrderStatusBody,
  vibeCheckBody,
  vibeInterviewBody,
  vibeProfileBody,
  weeklyBriefBody
} from '../validation/request.schemas.js';
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


router.get('/config', getPublicConfig);
router.get('/ai/status', getAiStatus);
router.post('/ai/chat', optionalAuthenticate, aiChatLimiter, validateBody(aiChatBody), postChat);
router.post('/ai/transcribe', optionalAuthenticate, aiVoiceLimiter, voiceUpload.single('audio'), postTranscribe);
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
router.get('/owner/pulse', authenticate, validateQuery(pulseQuery), getPulse);
router.post('/owner/briefing/pass', authenticate, aiChatLimiter, validateBody(briefingPassBody), postBriefingPass);
router.post('/owner/pulse/brief', authenticate, aiChatLimiter, validateBody(weeklyBriefBody), postWeeklyBrief);
router.get('/owner/kitchen-forecast', authenticate, aiChatLimiter, validateQuery(kitchenForecastQuery), getKitchenForecast);
// Public endpoints that work across PGs by design run as the system; each
// validates its own input (slug-only lookups, verified phone codes, booking refs).
router.get('/sites', systemRoute('directory of PG resident sites (name and place only)', listPgSites));
router.get('/sites/:slug', systemRoute('resident sites of unpublished PGs still resolve', getPgSite));
router.get('/properties', optionalAuthenticate, listProperties);
// VibeCheck compares a visitor with residents of any published PG, so it reads across RLS by design;
// it returns only scores and habit-level reasons.
router.post('/properties/:propertyId/vibecheck', aiChatLimiter, validateBody(vibeCheckBody), systemRoute('VibeCheck scores a visitor against a published PG', vibeCheckProperty));
router.post('/vibecheck/profile', aiChatLimiter, validateBody(vibeProfileBody), buildVibeProfileFromText);
router.post('/vibecheck/interview', aiChatLimiter, validateBody(vibeInterviewBody), systemRoute('VibeCheck reads the public PG listing it is matching against', vibeInterviewStep));
router.put('/tenant/:tenantId/vibe', authenticate, validateBody(saveTenantVibeBody), saveTenantVibe);
router.get('/tenant/:tenantId/vibe-match', authenticate, getTenantVibeMatch);
router.post('/tenant/:tenantId/kyc-check', authenticate, aiChatLimiter, checkMyKyc);
router.post('/owner/tenants/:tenantId/kyc-check', authenticate, aiChatLimiter, checkTenantKyc);
router.get('/condition-reports', authenticate, listConditionReports);
router.put('/owner/properties/:propertyId/services', authenticate, updateServiceSettings);
router.get('/owner/service-orders', authenticate, listStaffServiceOrders);
router.patch('/owner/service-orders/:orderId', authenticate, validateBody(serviceOrderStatusBody), updateServiceOrderStatus);
router.get('/tenant/:tenantId/service-orders', authenticate, listMyServiceOrders);
router.post('/tenant/:tenantId/service-orders', authenticate, createServiceOrder);
router.post('/tenant/:tenantId/service-orders/:orderId/cancel', authenticate, cancelMyServiceOrder);
router.post('/condition-reports', authenticate, validateBody(conditionReportBody), createConditionReport);
router.get('/search', optionalAuthenticate, semanticSearchLimiter, searchPropertiesSemantic);
router.get('/bookings/mine', systemRoute('guest booking lookup by phone', listGuestBookings));
router.post('/bookings', optionalAuthenticate, systemRoute('a verified guest holds a bed in any published PG', createBookingRequest));
router.post('/bookings/:bookingRef/cancel', systemRoute('guest cancels their own booking', cancelBookingRequest));
router.get('/bookings/:bookingRef/status', systemRoute('guest booking status by reference and phone', getPublicBookingStatus));

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
router.post('/owner/tenants/:tenantId/deposit-review', authenticate, aiChatLimiter, validateBody(depositReviewBody), reviewDeposit);
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