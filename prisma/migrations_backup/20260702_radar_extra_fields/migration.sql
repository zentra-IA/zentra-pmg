DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'prospects'
  ) THEN

    ALTER TABLE "prospects"
    ADD COLUMN IF NOT EXISTS "state" TEXT,
    ADD COLUMN IF NOT EXISTS "segment" TEXT,
    ADD COLUMN IF NOT EXISTS "category" TEXT,
    ADD COLUMN IF NOT EXISTS "productInterest" TEXT,
    ADD COLUMN IF NOT EXISTS "external_id" TEXT,
    ADD COLUMN IF NOT EXISTS "last_transfer_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "last_activation_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "last_order_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "credit_limit" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "payment_method" TEXT,
    ADD COLUMN IF NOT EXISTS "source_payload" JSONB;

    CREATE INDEX IF NOT EXISTS "prospects_external_id_idx" ON "prospects"("external_id");
    CREATE INDEX IF NOT EXISTS "prospects_last_order_at_idx" ON "prospects"("last_order_at");
    CREATE INDEX IF NOT EXISTS "prospects_credit_limit_idx" ON "prospects"("credit_limit");

  END IF;
END $$;

ALTER TABLE "company_users"
ADD COLUMN IF NOT EXISTS "radar_monthly_limit" INTEGER;