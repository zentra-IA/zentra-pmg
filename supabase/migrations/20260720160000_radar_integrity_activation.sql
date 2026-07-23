begin;

-- ============================================================
-- MIGRATION 04
-- Integridade da identidade dos prospects e ativação atômica
--
-- Não ativa nenhum snapshot automaticamente.
-- Não altera dados atuais do Radar.
-- Não modifica rotas, telas ou workers.
-- ============================================================


-- ============================================================
-- 1. VALIDAÇÕES PRÉVIAS
-- A migration será cancelada caso exista inconsistência.
-- ============================================================

do $$
begin
  if exists (
    select 1
    from public."Prospect"
    where external_id is not null
      and btrim(external_id) <> ''
    group by company_id, external_id
    having count(*) > 1
  ) then
    raise exception
      'Migration cancelada: existem Prospects duplicados por company_id + external_id.';
  end if;
end;
$$;


do $$
begin
  if exists (
    select 1
    from public.radar_snapshots
    where is_current = true
    group by company_id
    having count(*) > 1
  ) then
    raise exception
      'Migration cancelada: existem duas ou mais snapshots atuais para a mesma empresa.';
  end if;
end;
$$;


-- ============================================================
-- 2. IDENTIDADE DO CLIENTE NO RADAR
-- Garante uma linha por empresa + ID da planilha.
-- Valores nulos/vazios não entram na restrição.
-- ============================================================

create unique index if not exists
  uq_prospect_company_external_id
on public."Prospect" (
  company_id,
  external_id
)
where external_id is not null
  and btrim(external_id) <> '';


-- ============================================================
-- 3. SOMENTE UM SNAPSHOT ATUAL POR EMPRESA
-- ============================================================

create unique index if not exists
  uq_radar_snapshots_current_company
on public.radar_snapshots (
  company_id
)
where is_current = true;


-- Índices auxiliares para histórico, worker e consulta atual.
create index if not exists
  idx_radar_snapshots_company_created
on public.radar_snapshots (
  company_id,
  created_at desc
);


create index if not exists
  idx_radar_snapshots_company_status
on public.radar_snapshots (
  company_id,
  status
);


create index if not exists
  idx_radar_snapshots_pending
on public.radar_snapshots (
  created_at
)
where status = 'pending';


-- ============================================================
-- 4. FUNÇÃO INTERNA DE TROCA ATÔMICA
-- Não será exposta para usuários do Supabase.
-- ============================================================

create or replace function public._set_current_radar_snapshot(
  p_snapshot_id uuid
)
returns public.radar_snapshots
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot public.radar_snapshots%rowtype;
  v_current_snapshot_id uuid;
  v_link_count bigint;
  v_invalid_company_links bigint;
begin
  if p_snapshot_id is null then
    raise exception 'snapshot_id é obrigatório.';
  end if;

  select *
  into v_snapshot
  from public.radar_snapshots
  where id = p_snapshot_id
  for update;

  if not found then
    raise exception
      'Snapshot não encontrado: %',
      p_snapshot_id;
  end if;

  -- Serializa ativações da mesma empresa.
  -- Evita duas trocas simultâneas.
  perform pg_advisory_xact_lock(
    74123,
    hashtext(v_snapshot.company_id::text)
  );

  -- O snapshot precisa estar completamente concluído.
  if v_snapshot.status <> 'completed' then
    raise exception
      'Snapshot % não pode ser ativado com status "%".',
      p_snapshot_id,
      v_snapshot.status;
  end if;

  -- Upload com queda anormal precisa ser confirmado antes.
  if v_snapshot.requires_confirmation then
    raise exception
      'Snapshot % exige confirmação administrativa.',
      p_snapshot_id;
  end if;

  -- Snapshot vazio nunca pode substituir o atual.
  if v_snapshot.valid_rows <= 0 then
    raise exception
      'Snapshot % não possui linhas válidas.',
      p_snapshot_id;
  end if;

  select count(*)
  into v_link_count
  from public.radar_snapshot_prospects
  where snapshot_id = p_snapshot_id;

  if v_link_count <> v_snapshot.valid_rows then
    raise exception
      'Snapshot inconsistente. valid_rows=%, vínculos=%',
      v_snapshot.valid_rows,
      v_link_count;
  end if;

  -- Confirma que nenhum vínculo aponta para outra empresa.
  select count(*)
  into v_invalid_company_links
  from public.radar_snapshot_prospects rsp
  inner join public."Prospect" p
    on p.id = rsp.prospect_id
  where rsp.snapshot_id = p_snapshot_id
    and (
      rsp.company_id <> v_snapshot.company_id
      or p.company_id <> v_snapshot.company_id
    );

  if v_invalid_company_links > 0 then
    raise exception
      'Snapshot % contém % vínculos de outra empresa.',
      p_snapshot_id,
      v_invalid_company_links;
  end if;

  select id
  into v_current_snapshot_id
  from public.radar_snapshots
  where company_id = v_snapshot.company_id
    and is_current = true
    and id <> p_snapshot_id
  order by created_at desc
  limit 1
  for update;

  -- Desativa o snapshot anterior.
  update public.radar_snapshots
  set
    is_current = false,
    updated_at = now()
  where company_id = v_snapshot.company_id
    and is_current = true
    and id <> p_snapshot_id;

  -- Ativa o novo snapshot.
  update public.radar_snapshots
  set
    is_current = true,
    previous_snapshot_id =
      coalesce(v_current_snapshot_id, previous_snapshot_id),
    progress_percent = 100,
    finished_at = coalesce(finished_at, now()),
    updated_at = now()
  where id = p_snapshot_id
  returning *
  into v_snapshot;

  return v_snapshot;
end;
$$;


-- ============================================================
-- 5. FUNÇÃO PÚBLICA PARA ATIVAÇÃO
-- Somente backend/service role poderá executar.
-- ============================================================

create or replace function public.activate_radar_snapshot(
  p_snapshot_id uuid
)
returns public.radar_snapshots
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.radar_snapshots%rowtype;
begin
  select *
  into v_result
  from public._set_current_radar_snapshot(
    p_snapshot_id
  );

  return v_result;
end;
$$;


-- ============================================================
-- 6. FUNÇÃO DE REATIVAÇÃO / ROLLBACK
-- Usa os mesmos controles de integridade.
-- Não reprocessa a planilha.
-- ============================================================

create or replace function public.reactivate_radar_snapshot(
  p_snapshot_id uuid
)
returns public.radar_snapshots
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.radar_snapshots%rowtype;
begin
  select *
  into v_result
  from public._set_current_radar_snapshot(
    p_snapshot_id
  );

  return v_result;
end;
$$;


-- ============================================================
-- 7. SEGURANÇA DAS FUNÇÕES
-- Impede chamadas pela API pública/autenticada.
-- ============================================================

revoke all
on function public._set_current_radar_snapshot(uuid)
from public, anon, authenticated;


revoke all
on function public.activate_radar_snapshot(uuid)
from public, anon, authenticated;


revoke all
on function public.reactivate_radar_snapshot(uuid)
from public, anon, authenticated;


grant execute
on function public.activate_radar_snapshot(uuid)
to service_role;


grant execute
on function public.reactivate_radar_snapshot(uuid)
to service_role;


commit;