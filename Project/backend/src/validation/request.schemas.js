// Request-shape guards for the remaining API handlers (see utils/validate.ts).
// Unknown fields are dropped; each handler still enforces its own rules.
import { z } from 'zod';
import { booleanLike, numberLike, textField, textList } from '../utils/validate.js';
const t = textField;
// Auth
export const loginBody = z.object({ email: t(320), phone: t(30), password: t(200) });
export const registerBody = z.object({
    name: t(200), email: t(320), phone: t(30), password: t(200), propertyName: t(200), propertyAddress: t(500),
    locality: t(200), contactPhone: t(30), city: t(100), genderPolicy: t(20), amenities: textList(), houseRules: textList()
});
export const otpRequestBody = z.object({ phone: t(30), purpose: t(30) });
export const otpVerifyBody = z.object({ phone: t(30), purpose: t(30), code: t(20), firebaseIdToken: t(8192) });
export const googleLoginBody = z.object({ firebaseIdToken: t(8192) });
export const changePasswordBody = z.object({ currentPassword: t(200), newPassword: t(200) });
export const adminResetPasswordBody = z.object({ userId: t(100), newPassword: t(200) });
export const updateProfileBody = z.object({ name: t(200), profileImage: t(1_000_000) });
// Platform admin
export const createPgOperatorBody = z.object({
    ownerName: t(200), propertyName: t(200), email: t(320), phone: t(30), password: t(200),
    address: t(500), locality: t(200), city: t(100), genderPolicy: t(20), amenities: textList()
});
// Properties, rooms, staff
export const createPropertyBody = z.object({
    name: t(200), description: t(5000), address: t(500), locality: t(200), contactPhone: t(30), upiId: t(100),
    landmark: t(200), city: t(100), pincode: t(20), latitude: numberLike(), longitude: numberLike(), genderPolicy: t(20),
    amenities: textList(), houseRules: textList(), photoUrls: textList()
});
export const updatePropertyBody = createPropertyBody.extend({
    status: t(20), bookingLockMinutes: numberLike(), rentDay: numberLike(), rentDueDay: numberLike()
});
export const createRoomBody = z.object({
    roomNumber: t(50), floor: numberLike(), block: t(50), roomType: t(30), monthlyRent: numberLike(), depositAmount: numberLike(),
    maintenanceFee: numberLike(), utilitiesSurcharge: numberLike(), hasAc: booleanLike(), foodIncluded: booleanLike(),
    foodCharge: numberLike(), numberOfBeds: numberLike(), bedLabels: textList()
});
export const createPropertyStaffBody = z.object({ propertyId: t(100), name: t(200), email: t(320), phone: t(30), password: t(200) });
export const updateBedStatusBody = z.object({ status: t(30), note: t(500) });
// Bookings and tenants
export const cancelBookingBody = z.object({ phone: t(30) });
export const updateBookingStatusBody = z.object({ status: t(30), rejectionReason: t(500), newBedId: t(100) });
export const checkOutTenantBody = z.object({ checkoutNote: t(1000), depositDeductions: numberLike() });
export const markDepositRefundedBody = z.object({ reference: t(120) });
const tenantProfileFields = {
    permanentAddress: t(500), bloodGroup: t(10), institutionOrEmployer: t(200), emergencyName: t(200),
    emergencyPhone: t(30), kycType: t(30), kycDocumentUrl: t(500), foodOptOut: booleanLike()
};
export const updateTenantProfileBody = z.object({ ...tenantProfileFields, kycVerified: booleanLike() });
export const updateResidentProfileBody = z.object(tenantProfileFields);
// Maintenance
export const createMaintenanceTicketBody = z.object({
    propertyId: t(100), tenantId: t(100), title: t(200), description: t(5000), category: t(50),
    priority: t(20), imageUrl: t(1_000_000), assignedTo: t(200)
});
export const createTenantTicketBody = z.object({ tenantId: t(100), title: t(200), description: t(5000), category: t(50) });
export const updateMaintenanceStatusBody = z.object({ status: t(30) });
// Money
export const createOwnerExpenseBody = z.object({ propertyId: t(100), category: t(50), amount: numberLike(), spentOn: t(40), note: t(1000) });
export const proposeElectricityBillBody = z.object({ propertyId: t(100), period: t(20), totalAmount: numberLike(), imageUrl: t(1_000_000) });
export const sendRentRemindersBody = z.object({ period: t(20), force: booleanLike() });
// AI assistant
export const aiChatBody = z.object({
    message: t(20000), sessionId: t(100), confirmationId: t(200), cancelConfirmationId: t(200), imageDataUrl: t(6_000_000)
});
//# sourceMappingURL=request.schemas.js.map