-- Structured Job table (spatial + pricing holds).
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "depth" DOUBLE PRECISION NOT NULL,
    "dwelling_type" TEXT NOT NULL,
    "floor_level" INTEGER NOT NULL DEFAULT 1,
    "has_elevator" BOOLEAN NOT NULL DEFAULT true,
    "render_url" TEXT,
    "blueprint_url" TEXT,
    "shopping_list" JSONB NOT NULL DEFAULT '[]',
    "material_cost" DOUBLE PRECISION NOT NULL,
    "estimated_hours" DOUBLE PRECISION NOT NULL,
    "total_labor_hold" DOUBLE PRECISION NOT NULL,
    "immediate_charge" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);
