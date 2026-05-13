-- CRM-facing planner digest + structural blueprint archive (admin).
ALTER TABLE "portal_users" ADD COLUMN "ai_planner_crm_summary" TEXT NOT NULL DEFAULT '';
ALTER TABLE "portal_users" ADD COLUMN "ai_planner_blueprint_log" JSONB NOT NULL DEFAULT '[]';
