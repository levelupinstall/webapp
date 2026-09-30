-- AI estimates for the planner sales pipeline (admin CRM).
ALTER TABLE "portal_users" ADD COLUMN "estimates" JSONB NOT NULL DEFAULT '[]';
