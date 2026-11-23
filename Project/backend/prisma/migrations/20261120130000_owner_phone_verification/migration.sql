-- Owners prove their phone number with a code; listings show "Verified owner" only then.
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
