-- Zentra Sales AI
-- Prospecção CNPJ V2
-- Base pública filtrada: SP + situação ATIVA + ramo alimentício + celular provável.
-- Esta migration preserva a Prospecção V1 e generaliza a origem para Receita/CNPJ.

CREATE TABLE IF NOT EXISTS "cnpj_prospecting_companies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cnpj" text NOT NULL,
  "cnpj_basico" text NOT NULL,
  "cnpj_ordem" text NOT NULL,
  "cnpj_dv" text NOT NULL,

  "trade_name" text,
  "legal_name" text,

  "cnae_main" text NOT NULL,
  "cnae_secondary" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "cnae_description" text,
  "segment_tags" text[] NOT NULL DEFAULT ARRAY[]::text[],

  "status_code" text NOT NULL DEFAULT '02',
  "start_date" date,

  "uf" text NOT NULL DEFAULT 'SP',
  "city_code" text NOT NULL,
  "city" text NOT NULL,
  "city_search" text NOT NULL,
  "neighborhood" text,
  "neighborhood_search" text,

  "street_type" text,
  "street" text,
  "number" text,
  "complement" text,
  "postal_code" text,

  "phone" text NOT NULL,
  "phone_digits" text NOT NULL,
  "email" text,

  "company_size_code" text,
  "capital_social" numeric(18,2),

  "source_month" text NOT NULL,
  "source_snapshot_date" date,
  "imported_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cnpj_prospecting_companies_cnpj"
  ON "cnpj_prospecting_companies" ("cnpj");

CREATE INDEX IF NOT EXISTS "idx_cnpj_prospecting_uf_city"
  ON "cnpj_prospecting_companies" ("uf", "city_search");

CREATE INDEX IF NOT EXISTS "idx_cnpj_prospecting_neighborhood"
  ON "cnpj_prospecting_companies" ("neighborhood_search");

CREATE INDEX IF NOT EXISTS "idx_cnpj_prospecting_cnae"
  ON "cnpj_prospecting_companies" ("cnae_main");

CREATE INDEX IF NOT EXISTS "idx_cnpj_prospecting_phone"
  ON "cnpj_prospecting_companies" ("phone_digits");

CREATE INDEX IF NOT EXISTS "idx_cnpj_prospecting_source_month"
  ON "cnpj_prospecting_companies" ("source_month");

CREATE INDEX IF NOT EXISTS "idx_cnpj_prospecting_segment_tags"
  ON "cnpj_prospecting_companies"
  USING GIN ("segment_tags");

-- Generaliza a tabela já criada na Prospecção V1.
ALTER TABLE "external_prospect_companies"
  ADD COLUMN IF NOT EXISTS "source_external_id" text;

UPDATE "external_prospect_companies"
SET "source_external_id" = COALESCE("source_external_id", "google_place_id")
WHERE "source_external_id" IS NULL;

ALTER TABLE "external_prospect_companies"
  ALTER COLUMN "source_external_id" SET NOT NULL;

ALTER TABLE "external_prospect_companies"
  ALTER COLUMN "google_place_id" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_ext_prospect_company_source_ref"
  ON "external_prospect_companies" ("company_id", "source", "source_external_id");

CREATE INDEX IF NOT EXISTS "idx_ext_prospect_company_source_external"
  ON "external_prospect_companies" ("source", "source_external_id");

-- Segurança: a base CNPJ é fonte global de consulta e não deve ser exposta
-- diretamente ao cliente/browser. O acesso é sempre pelas APIs do Zentra.
ALTER TABLE "cnpj_prospecting_companies" ENABLE ROW LEVEL SECURITY;

-- Não criamos policy pública. Prisma/server usa a conexão de backend.
