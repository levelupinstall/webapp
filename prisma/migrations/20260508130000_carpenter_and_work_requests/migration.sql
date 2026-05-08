-- CreateTable
CREATE TABLE "carpenter_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "emergency_contact_name" TEXT NOT NULL DEFAULT '',
    "emergency_contact_relationship" TEXT NOT NULL DEFAULT '',
    "emergency_contact_phone" TEXT NOT NULL DEFAULT '',
    "emergency_contact_alternate_phone" TEXT NOT NULL DEFAULT '',
    "skills_summary" TEXT NOT NULL DEFAULT '',
    "tools_inventory" TEXT NOT NULL DEFAULT '',
    "has_liability_insurance" BOOLEAN NOT NULL DEFAULT false,
    "liability_insurance_details" TEXT NOT NULL DEFAULT '',
    "has_wsib" BOOLEAN NOT NULL DEFAULT false,
    "wsib_details" TEXT NOT NULL DEFAULT '',
    "availability_notes" TEXT NOT NULL DEFAULT '',
    "availability_calendar" JSONB NOT NULL DEFAULT '[]',
    "google_calendar_connected" BOOLEAN NOT NULL DEFAULT false,
    "google_calendar_email" TEXT NOT NULL DEFAULT '',
    "google_calendar_refresh_token" TEXT NOT NULL DEFAULT '',
    "profile_picture_data_url" TEXT NOT NULL DEFAULT '',
    "jobs" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carpenter_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "carpenter_users_username_lower_key" ON "carpenter_users" ((LOWER("username")));

-- CreateTable
CREATE TABLE "work_requests" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'booking',
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "project_address" TEXT NOT NULL,
    "preferred_date" TEXT NOT NULL,
    "project_details" TEXT NOT NULL,
    "signature_name" TEXT NOT NULL,
    "stripe_session_id" TEXT NOT NULL,
    "paid_amount_cents" INTEGER NOT NULL,
    "portal_user_id" TEXT NOT NULL,
    "job_plan" JSONB,

    CONSTRAINT "work_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_requests_stripe_session_id_key" ON "work_requests"("stripe_session_id");
