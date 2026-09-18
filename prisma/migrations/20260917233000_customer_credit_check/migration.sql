CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "customer_credit_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL,
  "seller_id" uuid,
  "customer_id" uuid NOT NULL,
  "protest_status" text NOT NULL DEFAULT 'NOT_CHECKED',
  "protest_checked_at" timestamptz,
  "protest_checked_by" uuid,
  "boleto_requested" boolean NOT NULL DEFAULT false,
  "boleto_requested_at" timestamptz,
  "boleto_requested_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "customer_credit_checks_protest_status_check"
    CHECK ("protest_status" IN ('NOT_CHECKED','NO_PROTEST','HAS_PROTEST'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_credit_checks_company_customer_key"
  ON "customer_credit_checks" ("company_id", "customer_id");

CREATE INDEX IF NOT EXISTS "customer_credit_checks_company_seller_idx"
  ON "customer_credit_checks" ("company_id", "seller_id");

CREATE INDEX IF NOT EXISTS "customer_credit_checks_boleto_idx"
  ON "customer_credit_checks" ("company_id", "boleto_requested");
