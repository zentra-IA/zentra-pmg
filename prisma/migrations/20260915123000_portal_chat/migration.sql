CREATE TABLE IF NOT EXISTS "portal_conversations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "seller_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "customer_name" TEXT NOT NULL,
  "customer_phone" TEXT,
  "last_message" TEXT,
  "last_message_at" TIMESTAMPTZ(6),
  "last_sender_type" TEXT,
  "seller_unread" INTEGER NOT NULL DEFAULT 0,
  "customer_unread" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "portal_conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS
  "portal_conversations_customer_id_key"
  ON "portal_conversations"("customer_id");

CREATE INDEX IF NOT EXISTS
  "portal_conversations_company_id_idx"
  ON "portal_conversations"("company_id");

CREATE INDEX IF NOT EXISTS
  "portal_conversations_seller_id_idx"
  ON "portal_conversations"("seller_id");

CREATE INDEX IF NOT EXISTS
  "portal_conversations_customer_id_idx"
  ON "portal_conversations"("customer_id");

CREATE INDEX IF NOT EXISTS
  "portal_conversations_company_id_seller_id_last_message_at_idx"
  ON "portal_conversations"("company_id", "seller_id", "last_message_at");

CREATE TABLE IF NOT EXISTS "portal_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "seller_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "sender_type" TEXT NOT NULL,
  "message_type" TEXT NOT NULL DEFAULT 'text',
  "content" TEXT,
  "media_url" TEXT,
  "mime_type" TEXT,
  "file_name" TEXT,
  "file_size" INTEGER,
  "read_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "portal_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS
  "portal_messages_conversation_id_created_at_idx"
  ON "portal_messages"("conversation_id", "created_at");

CREATE INDEX IF NOT EXISTS
  "portal_messages_company_id_idx"
  ON "portal_messages"("company_id");

CREATE INDEX IF NOT EXISTS
  "portal_messages_seller_id_idx"
  ON "portal_messages"("seller_id");

CREATE INDEX IF NOT EXISTS
  "portal_messages_customer_id_idx"
  ON "portal_messages"("customer_id");

CREATE INDEX IF NOT EXISTS
  "portal_messages_company_id_seller_id_created_at_idx"
  ON "portal_messages"("company_id", "seller_id", "created_at");
