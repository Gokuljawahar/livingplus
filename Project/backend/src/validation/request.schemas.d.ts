import { z } from 'zod';
export declare const loginBody: z.ZodObject<{
    email: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    phone: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    password: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const registerBody: z.ZodObject<{
    name: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    email: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    phone: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    password: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    propertyName: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    propertyAddress: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    locality: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    contactPhone: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    city: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    genderPolicy: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    amenities: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodString]>>>;
    houseRules: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodString]>>>;
}, z.core.$strip>;
export declare const otpRequestBody: z.ZodObject<{
    phone: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    purpose: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const otpVerifyBody: z.ZodObject<{
    phone: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    purpose: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    code: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    firebaseIdToken: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const googleLoginBody: z.ZodObject<{
    firebaseIdToken: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const changePasswordBody: z.ZodObject<{
    currentPassword: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    newPassword: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const adminResetPasswordBody: z.ZodObject<{
    userId: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    newPassword: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const updateProfileBody: z.ZodObject<{
    name: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    profileImage: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const createPgOperatorBody: z.ZodObject<{
    ownerName: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    propertyName: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    email: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    phone: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    password: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    address: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    locality: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    city: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    genderPolicy: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    amenities: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodString]>>>;
}, z.core.$strip>;
export declare const createPropertyBody: z.ZodObject<{
    name: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    address: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    locality: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    contactPhone: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    upiId: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    landmark: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    city: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    pincode: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    latitude: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    longitude: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    genderPolicy: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    amenities: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodString]>>>;
    houseRules: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodString]>>>;
    photoUrls: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodString]>>>;
}, z.core.$strip>;
export declare const updatePropertyBody: z.ZodObject<{
    name: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    address: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    locality: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    contactPhone: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    upiId: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    landmark: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    city: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    pincode: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    latitude: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    longitude: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    genderPolicy: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    amenities: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodString]>>>;
    houseRules: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodString]>>>;
    photoUrls: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodString]>>>;
    status: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    bookingLockMinutes: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    rentDay: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    rentDueDay: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
}, z.core.$strip>;
export declare const createRoomBody: z.ZodObject<{
    roomNumber: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    floor: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    block: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    roomType: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    monthlyRent: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    depositAmount: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    maintenanceFee: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    utilitiesSurcharge: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    hasAc: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodBoolean, z.ZodPipe<z.ZodEnum<{
        false: "false";
        true: "true";
    }>, z.ZodTransform<boolean, "false" | "true">>]>>>;
    foodIncluded: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodBoolean, z.ZodPipe<z.ZodEnum<{
        false: "false";
        true: "true";
    }>, z.ZodTransform<boolean, "false" | "true">>]>>>;
    foodCharge: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    numberOfBeds: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    bedLabels: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodString]>>>;
}, z.core.$strip>;
export declare const createPropertyStaffBody: z.ZodObject<{
    propertyId: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    name: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    email: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    phone: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    password: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const updateBedStatusBody: z.ZodObject<{
    status: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    note: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const cancelBookingBody: z.ZodObject<{
    phone: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const updateBookingStatusBody: z.ZodObject<{
    status: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    rejectionReason: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    newBedId: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const checkOutTenantBody: z.ZodObject<{
    checkoutNote: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    depositDeductions: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
}, z.core.$strip>;
export declare const markDepositRefundedBody: z.ZodObject<{
    reference: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const updateTenantProfileBody: z.ZodObject<{
    kycVerified: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodBoolean, z.ZodPipe<z.ZodEnum<{
        false: "false";
        true: "true";
    }>, z.ZodTransform<boolean, "false" | "true">>]>>>;
    permanentAddress: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    bloodGroup: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    institutionOrEmployer: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    emergencyName: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    emergencyPhone: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    kycType: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    kycDocumentUrl: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    foodOptOut: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodBoolean, z.ZodPipe<z.ZodEnum<{
        false: "false";
        true: "true";
    }>, z.ZodTransform<boolean, "false" | "true">>]>>>;
}, z.core.$strip>;
export declare const updateResidentProfileBody: z.ZodObject<{
    permanentAddress: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    bloodGroup: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    institutionOrEmployer: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    emergencyName: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    emergencyPhone: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    kycType: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    kycDocumentUrl: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    foodOptOut: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodBoolean, z.ZodPipe<z.ZodEnum<{
        false: "false";
        true: "true";
    }>, z.ZodTransform<boolean, "false" | "true">>]>>>;
}, z.core.$strip>;
export declare const createMaintenanceTicketBody: z.ZodObject<{
    propertyId: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    tenantId: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    title: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    category: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    priority: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    imageUrl: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    assignedTo: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const createTenantTicketBody: z.ZodObject<{
    tenantId: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    title: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    category: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const updateMaintenanceStatusBody: z.ZodObject<{
    status: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const createOwnerExpenseBody: z.ZodObject<{
    propertyId: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    category: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    amount: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    spentOn: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    note: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const proposeElectricityBillBody: z.ZodObject<{
    propertyId: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    period: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    totalAmount: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    imageUrl: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
export declare const sendRentRemindersBody: z.ZodObject<{
    period: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    force: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodBoolean, z.ZodPipe<z.ZodEnum<{
        false: "false";
        true: "true";
    }>, z.ZodTransform<boolean, "false" | "true">>]>>>;
}, z.core.$strip>;
export declare const aiChatBody: z.ZodObject<{
    message: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    sessionId: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    confirmationId: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    cancelConfirmationId: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
    imageDataUrl: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
}, z.core.$strip>;
//# sourceMappingURL=request.schemas.d.ts.map