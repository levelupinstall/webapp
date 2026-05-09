-- Formal job proposals (CRM + customer signing + Stripe).
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "work_proposals" JSONB NOT NULL DEFAULT '[]';
