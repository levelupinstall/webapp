-- CreateTable
CREATE TABLE "portal_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "verification_channel" TEXT,
    "signup_verification_pending" BOOLEAN NOT NULL DEFAULT false,
    "signup_verification_code_hash" TEXT NOT NULL DEFAULT '',
    "signup_verification_expires_at" TIMESTAMP(3),
    "account_verified_at" TIMESTAMP(3),
    "full_name" TEXT NOT NULL DEFAULT '',
    "service_address" TEXT NOT NULL DEFAULT '',
    "avatar_data_url" TEXT NOT NULL DEFAULT '',
    "last_login_at" TIMESTAMP(3),
    "ideas" JSONB NOT NULL DEFAULT '[]',
    "invoices" JSONB NOT NULL DEFAULT '[]',
    "project_status" JSONB NOT NULL DEFAULT '{}',
    "carpenter_uploads" JSONB NOT NULL DEFAULT '[]',
    "space_photos" JSONB NOT NULL DEFAULT '[]',
    "ai_planner_activity" JSONB NOT NULL DEFAULT '[]',
    "portal_analytics" JSONB NOT NULL DEFAULT '{}',
    "communication_log" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_users_email_key" ON "portal_users"("email");

-- Case-insensitive username uniqueness (matches legacy JSON store behaviour)
CREATE UNIQUE INDEX "portal_users_username_lower_key" ON "portal_users" ((LOWER("username")));
