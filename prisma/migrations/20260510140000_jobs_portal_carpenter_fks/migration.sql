-- Jobs: foreign keys to portal customer + optional carpenter assignment + proposal correlation.

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "portal_user_id" TEXT;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "assigned_carpenter_id" TEXT;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "work_proposal_id" TEXT;

DELETE FROM "jobs" WHERE "portal_user_id" IS NULL;

ALTER TABLE "jobs" ALTER COLUMN "portal_user_id" SET NOT NULL;

ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_portal_user_id_fkey";
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "portal_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_assigned_carpenter_id_fkey";
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_assigned_carpenter_id_fkey" FOREIGN KEY ("assigned_carpenter_id") REFERENCES "carpenter_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "jobs_portal_user_id_idx" ON "jobs"("portal_user_id");
CREATE INDEX IF NOT EXISTS "jobs_assigned_carpenter_id_idx" ON "jobs"("assigned_carpenter_id");
CREATE INDEX IF NOT EXISTS "jobs_work_proposal_id_idx" ON "jobs"("work_proposal_id");
