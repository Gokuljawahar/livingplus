-- AI-assisted KYC: the AI reading of the uploaded document (no full ID numbers).
ALTER TABLE "PGTenant" ADD COLUMN "kycAiCheck" JSONB;
