begin;

-- ============================================================
-- MIGRATION 02
-- Tabela isolada para staging das importações do Radar
--
-- Não altera Prospect
-- Não altera o funcionamento atual do Radar
-- Não altera rotas, workers ou telas
-- ============================================================

create table if not exists public.radar_import_staging (
  id bigint generated always as identity primary key,

  snapshot_id uuid not null,
  company_id uuid not null,
  branch_id uuid,

  external_customer_id text,
  name text,
  zone text,

  registration_date timestamptz,
  last_transfer_at timestamptz,
  last_activation_at timestamptz,
  last_order_at timestamptz,

  phone text,
  normalized_phone text,

  credit_limit numeric(15, 2),
  payment_methods text,

  row_number integer not null,

  validation_status text not null default 'pending',
  validation_error text,

  source_payload jsonb,

  created_at timestamptz not null default now()
);


-- Cada linha da planilha deve aparecer apenas uma vez no snapshot.
create unique index if not exists uq_radar_staging_snapshot_row
  on public.radar_import_staging (
    snapshot_id,
    row_number
  );


-- Usado para ler ou limpar toda a staging de um snapshot.
create index if not exists idx_radar_staging_snapshot
  on public.radar_import_staging (
    snapshot_id
  );


-- Usado para contagem de válidos, inválidos e duplicados.
create index if not exists idx_radar_staging_snapshot_validation
  on public.radar_import_staging (
    snapshot_id,
    validation_status
  );


-- Usado para detectar IDs duplicados na mesma planilha.
create index if not exists idx_radar_staging_snapshot_external_id
  on public.radar_import_staging (
    snapshot_id,
    external_customer_id
  )
  where external_customer_id is not null
    and external_customer_id <> '';


-- Isola a tabela da API pública do Supabase.
alter table public.radar_import_staging
  enable row level security;

revoke all
  on table public.radar_import_staging
  from anon, authenticated;

revoke all
  on sequence public.radar_import_staging_id_seq
  from anon, authenticated;

commit;