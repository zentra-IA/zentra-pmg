begin;

-- ============================================================
-- MIGRATION 03
-- Associação histórica entre snapshots e prospects
--
-- Não altera a tabela Prospect
-- Não altera rotas, workers ou telas
-- Não muda o comportamento atual do Radar
-- ============================================================

create table if not exists public.radar_snapshot_prospects (
  snapshot_id uuid not null,
  prospect_id text not null,
  company_id uuid not null,

  created_at timestamptz not null default now(),

  constraint radar_snapshot_prospects_pkey
    primary key (snapshot_id, prospect_id)
);


-- ============================================================
-- FOREIGN KEY PARA O SNAPSHOT
-- Como radar_snapshots está vazia, a criação é segura.
-- ============================================================

alter table public.radar_snapshot_prospects
  add constraint radar_snapshot_prospects_snapshot_fk
  foreign key (snapshot_id)
  references public.radar_snapshots(id)
  on delete cascade;


-- ============================================================
-- FOREIGN KEY PARA PROSPECT
-- Prospect usa chave primária text.
-- ============================================================

alter table public.radar_snapshot_prospects
  add constraint radar_snapshot_prospects_prospect_fk
  foreign key (prospect_id)
  references public."Prospect"(id)
  on delete cascade;


-- ============================================================
-- FOREIGN KEY PARA EMPRESA
-- Mantém isolamento entre empresas.
-- ============================================================

alter table public.radar_snapshot_prospects
  add constraint radar_snapshot_prospects_company_fk
  foreign key (company_id)
  references public.companies(id)
  on delete cascade;


-- ============================================================
-- ÍNDICES
-- ============================================================

-- Permite encontrar em quais snapshots um prospect apareceu.
create index if not exists idx_radar_snapshot_prospects_prospect
  on public.radar_snapshot_prospects (
    prospect_id
  );


-- Principal índice para consulta do Radar por empresa e snapshot.
create index if not exists idx_radar_snapshot_prospects_company_snapshot
  on public.radar_snapshot_prospects (
    company_id,
    snapshot_id
  );


-- Ajuda em contagens e validações de integridade por snapshot.
create index if not exists idx_radar_snapshot_prospects_snapshot
  on public.radar_snapshot_prospects (
    snapshot_id
  );


-- ============================================================
-- SEGURANÇA
-- A tabela será usada apenas pelo backend/worker.
-- ============================================================

alter table public.radar_snapshot_prospects
  enable row level security;

revoke all
  on table public.radar_snapshot_prospects
  from anon, authenticated;


commit;