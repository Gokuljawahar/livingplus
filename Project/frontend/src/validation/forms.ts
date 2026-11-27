// Form schemas (Zod) for react-hook-form. They mirror the API's rules, so
// mistakes show next to the field before a request is sent.
import { z } from 'zod';
import { LIMITS, MESSAGES, PATTERNS, STAFF_ROLES, isValidPhone, isValidUpiId } from '@livingplus/shared';

export const loginSchema = z.object({
  // Mobile number or admin username (the API field is named "email").
  email: z.string().trim().min(1, 'Enter your mobile number'),
  password: z.string().min(1, 'Enter your password')
});
export type LoginForm = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(1, 'Enter a new password'),
  confirmPassword: z.string().min(1, 'Confirm the new password')
}).refine((form) => form.newPassword === form.confirmPassword, {
  path: ['confirmPassword'],
  message: 'New passwords do not match'
});
export type ChangePasswordForm = z.infer<typeof changePasswordSchema>;


export const registerSchema = z.object({
  phone: z.string().min(1, 'Phone number is required').refine(isValidPhone, MESSAGES.phone),
  name: z.string().trim().min(1, 'Owner name is required'),
  propertyName: z.string().trim().min(1, 'PG name is required'),
  propertyAddress: z.string().trim().min(1, 'Property address is required'),
  locality: z.string().trim().min(1, 'Locality is required'),
  city: z.string(),
  genderPolicy: z.enum(['ANY', 'MEN', 'WOMEN']),
  contactPhone: z.string(),
  businessLogo: z.string(),
  password: z.string().min(1, 'Password is required').regex(PATTERNS.strongPassword, MESSAGES.strongPassword),
  confirmPassword: z.string()
}).refine((form) => form.password === form.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });
export type RegisterForm = z.infer<typeof registerSchema>;

export const operatorSchema = z.object({
  ownerName: z.string().trim().min(1, 'Owner name is required'),
  phone: z.string().refine(isValidPhone, 'Enter a valid owner phone'),
  email: z.union([z.literal(''), z.email('Enter a valid email')]),
  password: z.string().min(8, 'Temporary password must be at least 8 characters'),
  propertyName: z.string().trim().min(1, 'PG name is required'),
  address: z.string().trim().min(1, 'Street address is required'),
  locality: z.string().trim().min(1, 'Locality is required'),
  city: z.string().trim().min(1, 'City is required'),
  genderPolicy: z.enum(['ANY', 'MEN', 'WOMEN']),
  amenities: z.string()
});
export type OperatorForm = z.infer<typeof operatorSchema>;

// Resident portal (limits match the API).
export const residentTicketSchema = z.object({
  tenantId: z.string(),
  category: z.string(),
  priority: z.string().optional(),
  title: z.string().trim().min(1, 'Add a short title').max(LIMITS.ticketTitle, MESSAGES.ticketTitle),
  description: z.string().trim().min(1, 'Describe the issue').max(LIMITS.ticketDetails, MESSAGES.ticketDetails)
});
export type ResidentTicketForm = z.infer<typeof residentTicketSchema>;

export const paymentClaimSchema = z.object({
  tenantId: z.string(),
  rentEntryId: z.string(),
  amount: z.string().refine((value) => Number(value) > 0, 'Enter the amount you paid'),
  reference: z.string().trim().regex(PATTERNS.paymentReference, MESSAGES.paymentReference)
});
export type PaymentClaimForm = z.infer<typeof paymentClaimSchema>;

export const residentProfileSchema = z.object({
  permanentAddress: z.string().max(LIMITS.profileText),
  institutionOrEmployer: z.string().max(LIMITS.profileText),
  emergencyName: z.string().max(LIMITS.profileText),
  emergencyPhone: z.string().max(LIMITS.emergencyPhone),
  bloodGroup: z.string().max(10),
  kycType: z.string(),
  foodOptOut: z.boolean()
});
export type ResidentProfileForm = z.infer<typeof residentProfileSchema>;

// Owner workspace (rules match the API). Inputs are strings; the API converts.
const positive = (message: string) => z.string().refine((value) => Number(value) > 0, message);
const wholeInRange = (min: number, max: number, message: string) =>
  z.string().refine((value) => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max, message);
const optionalCoordinate = (limit: number, message: string) =>
  z.string().refine((value) => value.trim() === '' || (Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit), message);

export const ownerPropertySchema = z.object({
  name: z.string().trim().min(1, 'Property name is required'),
  description: z.string(),
  address: z.string().trim().min(1, 'Address is required'),
  locality: z.string().trim().min(1, 'Locality is required'),
  contactPhone: z.string(),
  upiId: z.string().refine((value) => value.trim() === '' || isValidUpiId(value), MESSAGES.upiId),
  city: z.string(),
  latitude: optionalCoordinate(90, 'Latitude must be between -90 and 90'),
  longitude: optionalCoordinate(180, 'Longitude must be between -180 and 180'),
  genderPolicy: z.string(),
  amenities: z.string(),
  houseRules: z.string(),
  status: z.string(),
  bookingLockMinutes: wholeInRange(1, 1440, 'Booking hold must be 1 to 1440 minutes'),
  rentDay: wholeInRange(1, 1440, 'Rent day must be a whole number'),
  rentDueDay: wholeInRange(1, 1440, 'Rent due day must be a whole number')
});
export type OwnerPropertyForm = z.infer<typeof ownerPropertySchema>;

export const ownerRoomSchema = z.object({
  roomNumber: z.string().trim().min(1, 'Room number is required'),
  block: z.string(),
  floor: z.string(),
  roomType: z.string(),
  monthlyRent: positive('Enter the monthly rent'),
  depositAmount: z.string(),
  maintenanceFee: z.string(),
  utilitiesSurcharge: z.string(),
  foodCharge: z.string(),
  numberOfBeds: wholeInRange(1, 50, 'Beds must be a whole number from 1 to 50'),
  hasAc: z.boolean(),
  foodIncluded: z.boolean()
});
export type OwnerRoomForm = z.infer<typeof ownerRoomSchema>;

export const rentEntrySchema = z.object({
  tenantId: z.string().min(1, 'Choose a tenant'),
  period: z.string().regex(PATTERNS.yearMonth, MESSAGES.yearMonth),
  amount: positive('Enter a positive amount'),
  dueDate: z.string().min(1, 'Choose a due date')
});
export type RentEntryForm = z.infer<typeof rentEntrySchema>;

export const staffSchema = z.object({
  name: z.string().trim().min(1, 'Staff name is required'),
  phone: z.string().refine(isValidPhone, 'Enter a valid phone number'),
  email: z.string(),
  password: z.string().min(1, 'Set a password'),
  propertyId: z.string().min(1, 'Choose a property'),
  role: z.enum(STAFF_ROLES)
});
export type StaffForm = z.infer<typeof staffSchema>;

export const expenseSchema = z.object({
  category: z.string(),
  amount: positive('Enter the expense amount'),
  spentOn: z.string().min(1, 'Choose the date'),
  note: z.string().max(500)
});
export type ExpenseForm = z.infer<typeof expenseSchema>;

export const electricityBillSchema = z.object({
  period: z.string().regex(PATTERNS.yearMonth, MESSAGES.yearMonth),
  totalAmount: positive('Enter the bill total')
});
export type ElectricityBillForm = z.infer<typeof electricityBillSchema>;

export const ownerTicketSchema = z.object({
  title: z.string().trim().min(1, 'Add a short title'),
  description: z.string().trim().min(1, 'Describe the issue'),
  category: z.string(),
  priority: z.string(),
  assignedTo: z.string()
});
export type OwnerTicketForm = z.infer<typeof ownerTicketSchema>;
