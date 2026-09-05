-- Zentra Sales AI
-- Centro administrativo de cobranças
-- Migração aditiva: não remove nem altera dados existentes.

create table if not exists public.admin_billing_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_user_id uuid not null unique references public.company_users(id) on delete cascade,
  monthly_value numeric(12,2) not null default 139.00,
  signup_fee numeric(12,2) not null default 89.00,
  due_day integer not null default 10 check (due_day between 1 and 31),
  payment_method text not null default 'PIX',
  plan_status text not null default 'ATIVO'
    check (plan_status in ('ATIVO','SUSPENSO','CANCELADO')),
  joined_at date,
  document text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_billing_profiles_company
  on public.admin_billing_profiles(company_id);

create index if not exists idx_admin_billing_profiles_status
  on public.admin_billing_profiles(plan_status);

create index if not exists idx_admin_billing_profiles_due_day
  on public.admin_billing_profiles(due_day);

create table if not exists public.admin_billing_payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.admin_billing_profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  company_user_id uuid not null references public.company_users(id) on delete cascade,
  competence text not null,
  type text not null default 'MENSALIDADE',
  due_date date not null,
  amount numeric(12,2) not null,
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE','PAGO','CANCELADO')),
  paid_at timestamptz,
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_admin_billing_payment_competence
    unique (profile_id, competence, type)
);

create index if not exists idx_admin_billing_payments_company
  on public.admin_billing_payments(company_id);

create index if not exists idx_admin_billing_payments_company_user
  on public.admin_billing_payments(company_user_id);

create index if not exists idx_admin_billing_payments_competence
  on public.admin_billing_payments(competence);

create index if not exists idx_admin_billing_payments_status
  on public.admin_billing_payments(status);

-- As tabelas são administrativas e não devem ficar disponíveis
-- diretamente via cliente Supabase/PostgREST.
alter table public.admin_billing_profiles enable row level security;
alter table public.admin_billing_payments enable row level security;

-- Nenhuma policy é criada de propósito.
-- O acesso é feito somente pelo backend Next.js com Prisma.
