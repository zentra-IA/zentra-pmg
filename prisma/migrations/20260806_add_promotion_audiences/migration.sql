-- Zentra Sales AI
-- Extensão aditiva: campanhas/listas personalizadas para promoções.
-- Não remove nem renomeia tabelas ou colunas existentes.

BEGIN;

CREATE TABLE IF NOT EXISTS "promotion_audience_lists" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "seller_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "promotion_audience_lists_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotion_audience_lists_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "promotion_audience_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "audience_list_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "added_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "promotion_audience_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotion_audience_members_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "promotion_audience_members_audience_list_id_fkey"
    FOREIGN KEY ("audience_list_id") REFERENCES "promotion_audience_lists"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "promotion_audience_members_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "SalesCustomer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "promotion_audience_members_audience_list_id_customer_id_key"
    UNIQUE ("audience_list_id", "customer_id")
);

ALTER TABLE "web_promotions"
  ADD COLUMN IF NOT EXISTS "audience_mode" TEXT NOT NULL DEFAULT 'table',
  ADD COLUMN IF NOT EXISTS "audience_list_id" UUID;

UPDATE "web_promotions"
SET "audience_mode" = 'table'
WHERE "audience_mode" IS NULL OR "audience_mode" NOT IN ('table', 'campaign');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'web_promotions_audience_list_id_fkey'
  ) THEN
    ALTER TABLE "web_promotions"
      ADD CONSTRAINT "web_promotions_audience_list_id_fkey"
      FOREIGN KEY ("audience_list_id")
      REFERENCES "promotion_audience_lists"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'web_promotions_audience_mode_check'
  ) THEN
    ALTER TABLE "web_promotions"
      ADD CONSTRAINT "web_promotions_audience_mode_check"
      CHECK ("audience_mode" IN ('table', 'campaign'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'promotion_audience_lists_status_check'
  ) THEN
    ALTER TABLE "promotion_audience_lists"
      ADD CONSTRAINT "promotion_audience_lists_status_check"
      CHECK ("status" IN ('active', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "promotion_audience_lists_company_id_idx"
  ON "promotion_audience_lists"("company_id");

CREATE INDEX IF NOT EXISTS "promotion_audience_lists_seller_id_idx"
  ON "promotion_audience_lists"("seller_id");

CREATE INDEX IF NOT EXISTS "promotion_audience_lists_company_id_seller_id_status_idx"
  ON "promotion_audience_lists"("company_id", "seller_id", "status");

CREATE INDEX IF NOT EXISTS "promotion_audience_members_company_id_idx"
  ON "promotion_audience_members"("company_id");

CREATE INDEX IF NOT EXISTS "promotion_audience_members_audience_list_id_idx"
  ON "promotion_audience_members"("audience_list_id");

CREATE INDEX IF NOT EXISTS "promotion_audience_members_customer_id_idx"
  ON "promotion_audience_members"("customer_id");

CREATE INDEX IF NOT EXISTS "web_promotions_audience_mode_idx"
  ON "web_promotions"("audience_mode");

CREATE INDEX IF NOT EXISTS "web_promotions_audience_list_id_idx"
  ON "web_promotions"("audience_list_id");

COMMIT;
