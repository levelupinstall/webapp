-- Sales handoff: consultation calls agreed in the AI planner (admin CRM).
ALTER TABLE "portal_users" ADD COLUMN "scheduled_calls" JSONB NOT NULL DEFAULT '[]';
