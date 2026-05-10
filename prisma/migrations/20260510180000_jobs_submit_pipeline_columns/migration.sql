-- Planner submit pipeline: labor breakdown, scope text, Stripe labor-hold session id.

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "stripe_labor_hold_checkout_session_id" TEXT;

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "labor_breakdown" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "scope_of_work_terms" TEXT;
