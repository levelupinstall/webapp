-- AlterTable
ALTER TABLE "portal_users" ADD COLUMN "password_reset_token_hash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "portal_users" ADD COLUMN "password_reset_expires_at" TIMESTAMP(3);
