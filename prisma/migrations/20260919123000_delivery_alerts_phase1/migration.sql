CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "push_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "subscription_id" uuid NOT NULL UNIQUE REFERENCES "push_subscriptions"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "promotions_enabled" boolean NOT NULL DEFAULT true,
  "deliveries_enabled" boolean NOT NULL DEFAULT false,
  "finance_enabled" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "push_preferences_company_customer_idx"
  ON "push_preferences" ("company_id", "customer_id");

CREATE INDEX IF NOT EXISTS "push_preferences_deliveries_idx"
  ON "push_preferences" ("company_id", "deliveries_enabled");

CREATE TABLE IF NOT EXISTS "order_delivery_tracking" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL,
  "order_id" uuid NOT NULL UNIQUE REFERENCES "SalesOrder"("id") ON DELETE CASCADE,
  "customer_id" uuid,
  "seller_id" uuid,
  "delivery_start" timestamptz NOT NULL,
  "delivery_end" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "first_alert_at" timestamptz NOT NULL,
  "next_alert_at" timestamptz,
  "last_alert_at" timestamptz,
  "alert_count" integer NOT NULL DEFAULT 0,
  "customer_confirmed_at" timestamptz,
  "seller_alerted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "order_delivery_tracking_status_check"
    CHECK ("status" IN ('PENDING','READY','NOT_READY','DELIVERED','CANCELLED'))
);

CREATE INDEX IF NOT EXISTS "order_delivery_tracking_due_idx"
  ON "order_delivery_tracking" ("status", "next_alert_at");

CREATE INDEX IF NOT EXISTS "order_delivery_tracking_company_seller_idx"
  ON "order_delivery_tracking" ("company_id", "seller_id", "delivery_start");

CREATE TABLE IF NOT EXISTS "order_delivery_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tracking_id" uuid NOT NULL REFERENCES "order_delivery_tracking"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "order_delivery_events_tracking_idx"
  ON "order_delivery_events" ("tracking_id", "created_at");
