-- Alex phased intake / CRM: Project North Star fields on structured jobs
ALTER TABLE "jobs" ADD COLUMN "design_category" VARCHAR(500);
ALTER TABLE "jobs" ADD COLUMN "design_style" VARCHAR(500);
ALTER TABLE "jobs" ADD COLUMN "scope_notes" TEXT;
