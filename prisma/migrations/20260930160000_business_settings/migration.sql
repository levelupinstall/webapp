-- Business rate card (single row, id "default")
CREATE TABLE "business_settings" (
    "id" TEXT NOT NULL,
    "labor_rate_cad" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "call_out_fee_cad" DOUBLE PRECISION NOT NULL DEFAULT 150,
    "procurement_markup_pct" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "default_sub_rate_cad" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "included_labor_hours" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "carpentry_margin_pct" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "business_settings" ("id") VALUES ('default');
