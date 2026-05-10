-- Guest-friendly structured jobs: optional portal FK, customer email, Stripe fields.

ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_portal_user_id_fkey";

ALTER TABLE "jobs" ALTER COLUMN "portal_user_id" DROP NOT NULL;

ALTER TABLE "jobs" ADD CONSTRAINT "jobs_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "portal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "customer_email" TEXT NOT NULL DEFAULT '';

UPDATE "jobs" SET "customer_email" = '' WHERE "customer_email" IS NULL;

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "payment_amount_cents" INTEGER;

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "guest_pay_token" TEXT;

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "stripe_checkout_session_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "jobs_guest_pay_token_key" ON "jobs"("guest_pay_token");

CREATE INDEX IF NOT EXISTS "jobs_status_idx" ON "jobs"("status");
