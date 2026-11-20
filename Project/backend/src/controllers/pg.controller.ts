// Barrel re-exporting domain-split PG controllers.
// Individual domains live under ./pg/.
export {
  accessiblePropertyIds,
  canManageProperty,
  currentUser,
  ownStay
} from './pg/access.js';
export {
  buildVibeProfileFromText,
  getTenantVibeMatch,
  saveTenantVibe,
  vibeCheckProperty,
  vibeInterviewStep
} from './pg/vibecheck.controller.js';
export {
  createConditionReport,
  listConditionReports
} from './pg/condition-reports.controller.js';
export {
  createProperty,
  createPropertyStaff,
  createRoom,
  deleteProperty,
  getOwnerSummary,
  listAuditLogs,
  listOwnerProperties,
  listPropertyStaff,
  removePropertyStaff,
  updateBedStatus,
  updateProperty
} from './pg/properties.controller.js';
export {
  cancelBookingRequest,
  createBookingRequest,
  getPgSite,
  getPublicBookingStatus,
  getPublicConfig,
  listGuestBookings,
  listOwnerBookings,
  listPgSites,
  listProperties,
  searchPropertiesSemantic,
  updateBookingStatus
} from './pg/discovery-bookings.controller.js';
export {
  cancelTenantNotice,
  checkInTenant,
  checkMyKyc,
  checkOutTenant,
  checkTenantKyc,
  listOwnerTenants,
  listResidentNotifications,
  listTenantStays,
  markDepositRefunded,
  markResidentNotificationRead,
  submitTenantNotice,
  updateResidentProfile,
  updateTenantProfile
} from './pg/residents.controller.js';
export {
  approveElectricityBill,
  createOwnerExpense,
  createRentEntry,
  createResidentPaymentClaim,
  deleteOwnerExpense,
  getOwnerReport,
  listElectricityBills,
  listOwnerExpenses,
  listOwnerPaymentClaims,
  listOwnerRentEntries,
  listResidentPaymentClaims,
  proposeElectricityBill,
  recordRentPayment,
  reviewPaymentClaim,
  sendRentReminders
} from './pg/finance.controller.js';
export {
  createMaintenanceTicket,
  createTenantTicket,
  listOwnerTickets,
  listTenantTickets,
  updateMaintenanceStatus
} from './pg/maintenance.controller.js';