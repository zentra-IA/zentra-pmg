CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "portal_price_table_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL,
  "price_table" integer NOT NULL,
  "table_date" date NOT NULL,
  "pdf_name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ready',
  "product_count" integer NOT NULL DEFAULT 0,
  "unmatched_count" integer NOT NULL DEFAULT 0,
  "parser_engine" text,
  "imported_by" uuid,
  "activated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "portal_price_table_versions_price_table_check"
    CHECK ("price_table" BETWEEN 0 AND 5),
  CONSTRAINT "portal_price_table_versions_status_check"
    CHECK ("status" IN ('processing','ready','active','superseded','failed'))
);

CREATE INDEX IF NOT EXISTS "portal_price_table_versions_company_table_status_date_idx"
  ON "portal_price_table_versions" ("company_id", "price_table", "status", "table_date" DESC);

CREATE INDEX IF NOT EXISTS "portal_price_table_versions_company_date_idx"
  ON "portal_price_table_versions" ("company_id", "table_date" DESC);

CREATE TABLE IF NOT EXISTS "portal_price_table_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "version_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "price_table" integer NOT NULL,
  "catalog_product_id" uuid,
  "code" text NOT NULL,
  "product_name" text NOT NULL,
  "sell_unit" text NOT NULL,
  "price" numeric(12,2) NOT NULL,
  "raw_line" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "portal_price_table_items_price_table_check"
    CHECK ("price_table" BETWEEN 0 AND 5),
  CONSTRAINT "portal_price_table_items_version_fkey"
    FOREIGN KEY ("version_id")
    REFERENCES "portal_price_table_versions"("id")
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "portal_price_table_items_version_code_key"
  ON "portal_price_table_items" ("version_id", "code");

CREATE INDEX IF NOT EXISTS "portal_price_table_items_company_table_code_idx"
  ON "portal_price_table_items" ("company_id", "price_table", "code");

CREATE INDEX IF NOT EXISTS "portal_price_table_items_version_idx"
  ON "portal_price_table_items" ("version_id");

CREATE TABLE IF NOT EXISTS "portal_quote_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL,
  "seller_id" uuid,
  "customer_id" uuid NOT NULL,
  "conversation_id" uuid,
  "source" text NOT NULL DEFAULT 'portal_chat',
  "status" text NOT NULL DEFAULT 'collecting',
  "raw_request" text,
  "normalized_request" text,
  "price_table" integer,
  "price_table_version_id" uuid,
  "table_date" date,
  "total" numeric(14,2),
  "output_text" text,
  "metadata" jsonb,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "portal_quote_sessions_price_table_check"
    CHECK ("price_table" IS NULL OR "price_table" BETWEEN 0 AND 5)
);

CREATE INDEX IF NOT EXISTS "portal_quote_sessions_company_seller_created_idx"
  ON "portal_quote_sessions" ("company_id", "seller_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "portal_quote_sessions_company_customer_created_idx"
  ON "portal_quote_sessions" ("company_id", "customer_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "portal_quote_sessions_conversation_idx"
  ON "portal_quote_sessions" ("conversation_id");

CREATE INDEX IF NOT EXISTS "portal_quote_sessions_status_idx"
  ON "portal_quote_sessions" ("status");

CREATE TABLE IF NOT EXISTS "portal_quote_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "quote_session_id" uuid NOT NULL,
  "raw_term" text,
  "product_code" text,
  "product_name" text,
  "requested_quantity" numeric(12,3),
  "requested_unit" text,
  "sell_unit" text,
  "unit_price" numeric(12,2),
  "subtotal" numeric(14,2),
  "status" text NOT NULL DEFAULT 'pending',
  "candidates_snapshot" jsonb,
  "price_snapshot" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "portal_quote_items_session_fkey"
    FOREIGN KEY ("quote_session_id")
    REFERENCES "portal_quote_sessions"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "portal_quote_items_session_idx"
  ON "portal_quote_items" ("quote_session_id");

CREATE INDEX IF NOT EXISTS "portal_quote_items_product_code_idx"
  ON "portal_quote_items" ("product_code");
