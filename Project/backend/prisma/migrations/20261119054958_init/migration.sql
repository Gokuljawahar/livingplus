-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "slug" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PG_OWNER',
    "profileImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PGProperty" (
    "id" TEXT NOT NULL,
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT NOT NULL,
    "locality" TEXT NOT NULL,
    "contactPhone" TEXT,
    "landmark" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Chennai',
    "pincode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "genderPolicy" TEXT NOT NULL DEFAULT 'ANY',
    "amenities" JSONB NOT NULL DEFAULT '[]',
    "houseRules" JSONB NOT NULL DEFAULT '[]',
    "photoUrls" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "bookingLockMinutes" INTEGER NOT NULL DEFAULT 120,
    "rentDay" INTEGER NOT NULL DEFAULT 1,
    "rentDueDay" INTEGER NOT NULL DEFAULT 5,
    "upiId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PGProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PGPropertyAccess" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PGPropertyAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PGRoom" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "block" TEXT,
    "roomNumber" TEXT NOT NULL,
    "floor" INTEGER,
    "roomType" TEXT NOT NULL DEFAULT 'SHARED',
    "monthlyRent" DOUBLE PRECISION NOT NULL,
    "depositAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maintenanceFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "utilitiesSurcharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasAc" BOOLEAN NOT NULL DEFAULT false,
    "foodIncluded" BOOLEAN NOT NULL DEFAULT false,
    "foodCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PGRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PGBed" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "maintenanceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PGBed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PGBooking" (
    "id" TEXT NOT NULL,
    "bookingRef" TEXT,
    "propertyId" TEXT NOT NULL,
    "bedId" TEXT,
    "residentName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "moveInDate" TIMESTAMP(3) NOT NULL,
    "moveOutDate" TIMESTAMP(3),
    "lockExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "rejectionReason" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PGBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PGTenant" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "bedId" TEXT,
    "bookingId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "permanentAddress" TEXT,
    "bloodGroup" TEXT,
    "institutionOrEmployer" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "kycType" TEXT,
    "kycDocumentUrl" TEXT,
    "kycVerified" BOOLEAN NOT NULL DEFAULT false,
    "kycVerifiedAt" TIMESTAMP(3),
    "foodOptOut" BOOLEAN NOT NULL DEFAULT false,
    "noticeDate" TIMESTAMP(3),
    "moveInDate" TIMESTAMP(3) NOT NULL,
    "moveOutDate" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "monthlyRent" DOUBLE PRECISION NOT NULL,
    "depositAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depositReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depositDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depositRefundAmount" DOUBLE PRECISION,
    "depositRefundStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "depositRefundReference" TEXT,
    "depositRefundedAt" TIMESTAMP(3),
    "checkoutNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PGTenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PGRentEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL DEFAULT 'RENT',
    "period" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "reference" TEXT,
    "method" TEXT,
    "notes" TEXT,
    "invoiceCode" TEXT,
    "lastReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PGRentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PGMaintenanceTicket" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "bedId" TEXT,
    "tenantId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "imageUrl" TEXT,
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PGMaintenanceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PGPaymentClaim" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rentEntryId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PGPaymentClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PGResidentNotification" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PGResidentNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PGRoomChangeRequest" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL DEFAULT 'SWAP',
    "fromBedId" TEXT,
    "toBedId" TEXT,
    "partnerId" TEXT,
    "preferences" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_MATCH',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PGRoomChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PGExpense" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "amount" DOUBLE PRECISION NOT NULL,
    "spentOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PGExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PGElectricityBill" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "imageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "splitJson" TEXT NOT NULL DEFAULT '[]',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PGElectricityBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "propertyId" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'BOOKING',
    "codeHash" TEXT NOT NULL,
    "verifiedToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PHAuditLog" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PHAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "role" TEXT NOT NULL DEFAULT 'RESIDENT',
    "stateJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_slug_key" ON "User"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "PGProperty_slug_key" ON "PGProperty"("slug");

-- CreateIndex
CREATE INDEX "PGPropertyAccess_userId_role_idx" ON "PGPropertyAccess"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "PGPropertyAccess_propertyId_userId_key" ON "PGPropertyAccess"("propertyId", "userId");

-- CreateIndex
CREATE INDEX "PGRoom_propertyId_status_idx" ON "PGRoom"("propertyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PGRoom_propertyId_roomNumber_key" ON "PGRoom"("propertyId", "roomNumber");

-- CreateIndex
CREATE INDEX "PGBed_roomId_status_idx" ON "PGBed"("roomId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PGBed_roomId_label_key" ON "PGBed"("roomId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "PGBooking_bookingRef_key" ON "PGBooking"("bookingRef");

-- CreateIndex
CREATE UNIQUE INDEX "PGBooking_idempotencyKey_key" ON "PGBooking"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PGBooking_propertyId_status_createdAt_idx" ON "PGBooking"("propertyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PGBooking_bedId_status_idx" ON "PGBooking"("bedId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PGTenant_bookingId_key" ON "PGTenant"("bookingId");

-- CreateIndex
CREATE INDEX "PGTenant_propertyId_status_idx" ON "PGTenant"("propertyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PGRentEntry_invoiceCode_key" ON "PGRentEntry"("invoiceCode");

-- CreateIndex
CREATE INDEX "PGRentEntry_period_status_idx" ON "PGRentEntry"("period", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PGRentEntry_tenantId_period_entryType_key" ON "PGRentEntry"("tenantId", "period", "entryType");

-- CreateIndex
CREATE INDEX "PGMaintenanceTicket_propertyId_status_priority_idx" ON "PGMaintenanceTicket"("propertyId", "status", "priority");

-- CreateIndex
CREATE INDEX "PGPaymentClaim_propertyId_status_createdAt_idx" ON "PGPaymentClaim"("propertyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PGPaymentClaim_tenantId_status_idx" ON "PGPaymentClaim"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PGPaymentClaim_propertyId_reference_key" ON "PGPaymentClaim"("propertyId", "reference");

-- CreateIndex
CREATE INDEX "PGResidentNotification_tenantId_readAt_createdAt_idx" ON "PGResidentNotification"("tenantId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "PGResidentNotification_propertyId_type_createdAt_idx" ON "PGResidentNotification"("propertyId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "PGRoomChangeRequest_propertyId_status_idx" ON "PGRoomChangeRequest"("propertyId", "status");

-- CreateIndex
CREATE INDEX "PGRoomChangeRequest_requesterId_status_idx" ON "PGRoomChangeRequest"("requesterId", "status");

-- CreateIndex
CREATE INDEX "PGExpense_propertyId_spentOn_idx" ON "PGExpense"("propertyId", "spentOn");

-- CreateIndex
CREATE INDEX "PGElectricityBill_propertyId_period_status_idx" ON "PGElectricityBill"("propertyId", "period", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OtpCode_verifiedToken_key" ON "OtpCode"("verifiedToken");

-- CreateIndex
CREATE INDEX "OtpCode_phone_purpose_createdAt_idx" ON "OtpCode"("phone", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "PHAuditLog_propertyId_createdAt_idx" ON "PHAuditLog"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationSession_userId_updatedAt_idx" ON "ConversationSession"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "PGPropertyAccess" ADD CONSTRAINT "PGPropertyAccess_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PGProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGPropertyAccess" ADD CONSTRAINT "PGPropertyAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGRoom" ADD CONSTRAINT "PGRoom_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PGProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGBed" ADD CONSTRAINT "PGBed_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "PGRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGBooking" ADD CONSTRAINT "PGBooking_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PGProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGBooking" ADD CONSTRAINT "PGBooking_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "PGBed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGTenant" ADD CONSTRAINT "PGTenant_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PGProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGTenant" ADD CONSTRAINT "PGTenant_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "PGBed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGTenant" ADD CONSTRAINT "PGTenant_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "PGBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGRentEntry" ADD CONSTRAINT "PGRentEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PGTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGMaintenanceTicket" ADD CONSTRAINT "PGMaintenanceTicket_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PGProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGMaintenanceTicket" ADD CONSTRAINT "PGMaintenanceTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PGTenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGPaymentClaim" ADD CONSTRAINT "PGPaymentClaim_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PGProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGPaymentClaim" ADD CONSTRAINT "PGPaymentClaim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PGTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGPaymentClaim" ADD CONSTRAINT "PGPaymentClaim_rentEntryId_fkey" FOREIGN KEY ("rentEntryId") REFERENCES "PGRentEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGResidentNotification" ADD CONSTRAINT "PGResidentNotification_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PGProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGResidentNotification" ADD CONSTRAINT "PGResidentNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PGTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGRoomChangeRequest" ADD CONSTRAINT "PGRoomChangeRequest_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PGProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGRoomChangeRequest" ADD CONSTRAINT "PGRoomChangeRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "PGTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGRoomChangeRequest" ADD CONSTRAINT "PGRoomChangeRequest_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PGTenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGRoomChangeRequest" ADD CONSTRAINT "PGRoomChangeRequest_fromBedId_fkey" FOREIGN KEY ("fromBedId") REFERENCES "PGBed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGRoomChangeRequest" ADD CONSTRAINT "PGRoomChangeRequest_toBedId_fkey" FOREIGN KEY ("toBedId") REFERENCES "PGBed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGExpense" ADD CONSTRAINT "PGExpense_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PGProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGElectricityBill" ADD CONSTRAINT "PGElectricityBill_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PGProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PHAuditLog" ADD CONSTRAINT "PHAuditLog_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PGProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
