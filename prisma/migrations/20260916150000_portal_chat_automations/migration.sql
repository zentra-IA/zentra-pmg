ALTER TABLE "portal_conversations"
ADD COLUMN IF NOT EXISTS "ai_paused" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "portal_chat_automations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "seller_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "intent" TEXT,
  "trigger_keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "match_type" TEXT NOT NULL DEFAULT 'contains',
  "response_text" TEXT NOT NULL,
  "response_variations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_fallback" BOOLEAN NOT NULL DEFAULT false,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "portal_chat_automations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "portal_chat_automations_company_seller_active_priority_idx"
ON "portal_chat_automations"("company_id", "seller_id", "active", "priority");

CREATE INDEX IF NOT EXISTS "portal_chat_automations_company_id_idx"
ON "portal_chat_automations"("company_id");

CREATE INDEX IF NOT EXISTS "portal_chat_automations_seller_id_idx"
ON "portal_chat_automations"("seller_id");
