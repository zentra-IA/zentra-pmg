begin;

-- ============================================================
-- MIGRATION 01A
-- Preparação mínima e aditiva do Radar
--
-- Não cria tabelas novas
-- Não cria índices
-- Não cria triggers
-- Não cria foreign keys
-- Não remove ou renomeia nada
-- ============================================================


-- ============================================================
-- 1. EVOLUÇÃO MÍNIMA DE radar_snapshots
-- ============================================================

alter table public.radar_snapshots
  add column if not exists storage_path text,
  add column if not exists processed_rows integer not null default 0,
  add column if not exists invalid_count integer not null default 0,
  add column if not exists error_count integer not null default 0,
  add column if not exists progress_percent numeric(5,2) not null default 0,
  add column if not exists requires_confirmation boolean not null default false,
  add column if not exists confirmation_reason text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by_user_id uuid,
  add column if not exists previous_snapshot_id uuid,
  add column if not exists error_message text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;


-- Copia mensagens antigas sem apagar ou alterar a coluna original.
update public.radar_snapshots
set error_message = error
where error_message is null
  and error is not null;


-- ============================================================
-- 2. EVOLUÇÃO MÍNIMA DE ProspectImportJob
-- ============================================================

alter table public."ProspectImportJob"
  add column if not exists snapshot_id uuid,
  add column if not exists storage_path text,
  add column if not exists processed_rows integer not null default 0,
  add column if not exists valid_rows integer not null default 0,
  add column if not exists invalid_count integer not null default 0,
  add column if not exists error_count integer not null default 0,
  add column if not exists removed_count integer not null default 0,
  add column if not exists progress_percent numeric(5,2) not null default 0,
  add column if not exists attempts integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists locked_by text,
  add column if not exists locked_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists requires_confirmation boolean not null default false,
  add column if not exists confirmation_reason text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by_user_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;


commit;