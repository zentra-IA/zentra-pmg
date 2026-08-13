-- Zentra Sales AI - Preferências persistentes do Inbox por usuário
-- Migração ADITIVA.
-- Não altera, remove ou apaga dados existentes.

CREATE TABLE IF NOT EXISTS "inbox_user_conversations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "custom_name" TEXT,
  "hidden_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "inbox_user_conversations_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "inbox_user_conversations_company_user_lead_key"
    UNIQUE ("company_id", "user_id", "lead_id"),

  CONSTRAINT "inbox_user_conversations_company_id_fkey"
    FOREIGN KEY ("company_id")
    REFERENCES "companies"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION,

  CONSTRAINT "inbox_user_conversations_lead_id_fkey"
    FOREIGN KEY ("lead_id")
    REFERENCES "leads"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_inbox_user_conversations_owner"
  ON "inbox_user_conversations"("company_id", "user_id");

CREATE INDEX IF NOT EXISTS "idx_inbox_user_conversations_lead"
  ON "inbox_user_conversations"("lead_id");

CREATE INDEX IF NOT EXISTS "idx_inbox_user_conversations_hidden"
  ON "inbox_user_conversations"("hidden_at");

-- A tabela é utilizada somente pela API server-side com service role.
-- Nenhum acesso direto do navegador é necessário.
ALTER TABLE "inbox_user_conversations"
  ENABLE ROW LEVEL SECURITY;
