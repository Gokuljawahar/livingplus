// Form schemas (Zod) for react-hook-form. They mirror the API's rules, so
// mistakes show next to the field before a request is sent.
import { z } from 'zod';

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

const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

export const registerSchema = z.object({
  phone: z.string().min(1, 'Phone number is required').refine((value) => value.replace(/\D/g, '').length >= 10, 'Enter a valid 10-digit number'),
  name: z.string().trim().min(1, 'Owner name is required'),
  propertyName: z.string().trim().min(1, 'PG name is required'),
  propertyAddress: z.string().trim().min(1, 'Property address is required'),
  locality: z.string().trim().min(1, 'Locality is required'),
  city: z.string(),
  genderPolicy: z.enum(['ANY', 'MEN', 'WOMEN']),
  contactPhone: z.string(),
  businessLogo: z.string(),
  password: z.string().min(1, 'Password is required').regex(STRONG_PASSWORD, 'Must contain 8+ chars, 1 uppercase, 1 lowercase, 1 number, 1 special char'),
  confirmPassword: z.string()
}).refine((form) => form.password === form.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });
export type RegisterForm = z.infer<typeof registerSchema>;

export const operatorSchema = z.object({
  ownerName: z.string().trim().min(1, 'Owner name is required'),
  phone: z.string().refine((value) => value.replace(/\D/g, '').length >= 10, 'Enter a valid owner phone'),
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
  title: z.string().trim().min(1, 'Add a short title').max(120, 'Keep the title under 120 characters'),
  description: z.string().trim().min(1, 'Describe the issue').max(2000, 'Keep the details under 2000 characters')
});
export type ResidentTicketForm = z.infer<typeof residentTicketSchema>;

export const paymentClaimSchema = z.object({
  tenantId: z.string(),
  rentEntryId: z.string(),
  amount: z.string().refine((value) => Number(value) > 0, 'Enter the amount you paid'),
  reference: z.string().trim().regex(/^[a-zA-Z0-9._/-]{6,80}$/, 'Enter the UPI reference / UTR (6-80 letters or numbers)')
});
export type PaymentClaimForm = z.infer<typeof paymentClaimSchema>;

export const residentProfileSchema = z.object({
  permanentAddress: z.string().max(200),
  institutionOrEmployer: z.string().max(200),
  emergencyName: z.string().max(200),
  emergencyPhone: z.string().max(20),
  bloodGroup: z.enum(['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  kycType: z.string(),
  foodOptOut: z.boolean()
});
export type ResidentProfileForm = z.infer<typeof residentProfileSchema>;
