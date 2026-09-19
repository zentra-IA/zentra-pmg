CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "seller_push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth_key" text NOT NULL,
  "permission" text NOT NULL DEFAULT 'granted',
  "active" boolean NOT NULL DEFAULT true,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "seller_push_subscriptions_endpoint_key"
  ON "seller_push_subscriptions" ("endpoint");

CREATE INDEX IF NOT EXISTS "seller_push_subscriptions_company_seller_idx"
  ON "seller_push_subscriptions" ("company_id", "seller_id", "active");
