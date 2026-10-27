-- Fase 1 · Base: igrejas, equipe, convites e escalas de mídia
-- Plataforma de comunicação para igrejas
-- Todas as tabelas (exceto profiles e platform_admins) têm church_id, created_at e updated_at.

-- ---------------------------------------------------------------------------
-- Tipos fixos
-- ---------------------------------------------------------------------------
create type public.app_role as enum (
  'admin',        -- admin geral da igreja
  'lider',        -- líder de comunicação
  'aprovador',    -- pastor / aprovador
  'designer',
  'social_media',
  'audiovisual'
);

create type public.turno as enum ('manha', 'tarde', 'noite');

-- toda semana (até 1x por semana) · de 15 em 15 dias (até 2x no mês) · só em datas escolhidas
create type public.frequencia as enum ('semanal', 'quinzenal', 'datas');

create type public.tipo_ocasiao as enum ('culto', 'evento');

create type public.status_escala as enum ('rascunho', 'enviada');

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Só dígitos; números brasileiros de 10 ou 11 dígitos ganham o 55 na frente.
create or replace function public.normalizar_telefone(p text)
returns text
language sql
immutable
as $$
  select case
    when d is null or d = '' then null
    when length(d) in (10, 11) then '55' || d
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s;
$$;

-- Nome comparável: minúsculas, sem acento, espaços simples.
create or replace function public.normalizar_nome(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    translate(
      lower(trim(coalesce(p, ''))),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    '\s+', ' ', 'g'
  );
$$;

create or replace function public.hash_token(p text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex');
$$;

-- Token aleatório (2 UUID v4 = 244 bits) sem depender de pgcrypto.
create or replace function public.novo_token()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

-- ---------------------------------------------------------------------------
-- Pessoas da plataforma
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Quem cria igrejas (você, no curso).
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Cria o perfil quando a conta nasce no Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Igrejas e equipe
-- ---------------------------------------------------------------------------
create table public.churches (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 60),
  logo_path text,
  cor_principal text not null default '#7A2E3B'
    check (cor_principal ~ '^#[0-9A-Fa-f]{6}$'),
  fuso_horario text not null default 'America/Sao_Paulo',
  -- cultos fixos da semana: [{"dia":0-6 (0 = domingo), "turno":"noite", "nome":"Culto da Família"}]
  cultos_fixos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(cultos_fixos) = 'array'),
  -- versículos de incentivo informados pela igreja: [{"texto":"...", "referencia":"Pv 16:3"}]
  versiculos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(versiculos) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger churches_updated_at before update on public.churches
  for each row execute function public.set_updated_at();

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  papel public.app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (church_id, user_id)
);

create index memberships_user_idx on public.memberships (user_id);

create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  papel public.app_role not null,
  token_hash text not null unique,
  expira_em timestamptz not null default now() + interval '7 days',
  aceito_em timestamptz,
  aceito_por uuid references auth.users (id) on delete set null,
  convidado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invites_church_idx on public.invites (church_id);

create trigger invites_updated_at before update on public.invites
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Escalas de mídia
-- ---------------------------------------------------------------------------
create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  telefone text not null check (telefone ~ '^[0-9]{10,15}$'),
  user_id uuid references auth.users (id) on delete set null,
  frequencia public.frequencia not null default 'semanal',
  -- 12x36: um dia em que a pessoa trabalhou; o sistema alterna a partir dele.
  -- null = não trabalha em 12x36.
  escala_12x36_ref date,
  -- cultos em que costuma poder: [{"dia":0, "turno":"noite"}]
  cultos_costume jsonb not null default '[]'::jsonb
    check (jsonb_typeof(cultos_costume) = 'array'),
  datas_bloqueadas date[] not null default '{}',
  datas_escolhidas date[] not null default '{}',
  observacao text,
  ativo boolean not null default true,
  -- código do aparelho (só o hash fica no banco)
  device_token_hash text,
  -- última vez que a própria pessoa conferiu a disponibilidade
  disponibilidade_atualizada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (church_id, telefone)
);

create index volunteers_church_idx on public.volunteers (church_id);
create index volunteers_user_idx on public.volunteers (user_id);

create trigger volunteers_updated_at before update on public.volunteers
  for each row execute function public.set_updated_at();

create table public.ministry_roles (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  ordem int not null default 0,
  pessoas_por_culto int not null default 1 check (pessoas_por_culto between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (church_id, nome)
);

create trigger ministry_roles_updated_at before update on public.ministry_roles
  for each row execute function public.set_updated_at();

-- Culto ou ocasião escalável (um dia + turno).
create table public.services (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  data date not null,
  turno public.turno not null,
  nome text not null check (length(trim(nome)) > 0),
  tipo public.tipo_ocasiao not null default 'culto',
  -- ligação com events (fase 2 cria a tabela e a chave estrangeira)
  event_id uuid,
  -- pessoas por função neste culto, quando diferente do padrão: {"<ministry_role_id>": 2}
  pessoas_por_funcao jsonb not null default '{}'::jsonb
    check (jsonb_typeof(pessoas_por_funcao) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (church_id, data, turno)
);

create trigger services_updated_at before update on public.services
  for each row execute function public.set_updated_at();

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  inicio date not null,
  fim date not null,
  status public.status_escala not null default 'rascunho',
  enviada_em timestamptz,
  criada_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fim >= inicio)
);

create index schedules_church_idx on public.schedules (church_id, inicio);

create trigger schedules_updated_at before update on public.schedules
  for each row execute function public.set_updated_at();

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  schedule_id uuid not null references public.schedules (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  ministry_role_id uuid not null references public.ministry_roles (id) on delete cascade,
  volunteer_id uuid not null references public.volunteers (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- nunca a mesma pessoa em duas funções no mesmo culto
  unique (service_id, volunteer_id)
);

create index assignments_schedule_idx on public.assignments (schedule_id);
create index assignments_volunteer_idx on public.assignments (volunteer_id);

create trigger assignments_updated_at before update on public.assignments
  for each row execute function public.set_updated_at();

-- Linhas filhas precisam ser da mesma igreja que o pai.
create or replace function public.check_same_church()
returns trigger
language plpgsql
as $$
declare
  v_ok boolean;
begin
  if tg_table_name = 'assignments' then
    select
      (select church_id from public.schedules where id = new.schedule_id) = new.church_id
      and (select church_id from public.services where id = new.service_id) = new.church_id
      and (select church_id from public.ministry_roles where id = new.ministry_role_id) = new.church_id
      and (select church_id from public.volunteers where id = new.volunteer_id) = new.church_id
    into v_ok;
    if not coalesce(v_ok, false) then
      raise exception 'Registro de outra igreja' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger assignments_same_church before insert or update on public.assignments
  for each row execute function public.check_same_church();

-- ---------------------------------------------------------------------------
-- Histórico de atividades
-- ---------------------------------------------------------------------------
create table public.activity_log (
  id bigint generated always as identity primary key,
  church_id uuid not null references public.churches (id) on delete cascade,
  quem uuid references auth.users (id) on delete set null,
  origem text not null default 'app', -- app | link_publico | link_publico_outro_aparelho | plataforma
  acao text not null,                 -- INSERT | UPDATE | DELETE
  tabela text not null,
  registro_id uuid,
  antes jsonb,
  depois jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index activity_log_church_idx on public.activity_log (church_id, created_at desc);

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_church uuid;
  v_id uuid;
begin
  -- nunca guardar hash do código do aparelho no histórico
  -- nem hash de convite
  v_antes := v_antes - 'device_token_hash' - 'token_hash';
  v_depois := v_depois - 'device_token_hash' - 'token_hash';

  if tg_table_name = 'churches' then
    v_church := coalesce(new.id, old.id);
  else
    v_church := coalesce(v_depois ->> 'church_id', v_antes ->> 'church_id')::uuid;
  end if;
  v_id := coalesce(v_depois ->> 'id', v_antes ->> 'id')::uuid;

  -- igreja apagada: o histórico vai junto (cascade); não registrar
  if tg_op = 'DELETE' and not exists (select 1 from public.churches where id = v_church) then
    return old;
  end if;

  insert into public.activity_log (church_id, quem, origem, acao, tabela, registro_id, antes, depois)
  values (
    v_church,
    auth.uid(),
    coalesce(nullif(current_setting('app.origem', true), ''), 'app'),
    tg_op,
    tg_table_name,
    v_id,
    v_antes,
    v_depois
  );
  return coalesce(new, old);
end;
$$;

create trigger churches_log after insert or update or delete on public.churches
  for each row execute function public.log_activity();
create trigger memberships_log after insert or update or delete on public.memberships
  for each row execute function public.log_activity();
create trigger invites_log after insert or update or delete on public.invites
  for each row execute function public.log_activity();
create trigger volunteers_log after insert or update or delete on public.volunteers
  for each row execute function public.log_activity();
create trigger ministry_roles_log after insert or update or delete on public.ministry_roles
  for each row execute function public.log_activity();
create trigger services_log after insert or update or delete on public.services
  for each row execute function public.log_activity();
create trigger schedules_log after insert or update or delete on public.schedules
  for each row execute function public.log_activity();
-- assignments não tem log por linha (montar escala mexe em dezenas de linhas);
-- o salvamento da escala registra um resumo em save_schedule().
