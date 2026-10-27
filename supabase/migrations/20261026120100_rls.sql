-- Fase 1 · Segurança: cada igreja só vê e altera os próprios dados.
-- As permissões valem no banco (Row Level Security), não só na tela.

-- ---------------------------------------------------------------------------
-- Funções auxiliares (security definer para não cair em recursão de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.is_member(p_church uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where church_id = p_church and user_id = auth.uid()
  );
$$;

create or replace function public.has_role(p_church uuid, p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where church_id = p_church and user_id = auth.uid() and papel = any (p_roles)
  );
$$;

-- admin ou líder de comunicação
create or replace function public.is_gestor(p_church uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(p_church, array['admin', 'lider']::public.app_role[]);
$$;

create or replace function public.is_admin(p_church uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(p_church, array['admin']::public.app_role[]);
$$;

-- ---------------------------------------------------------------------------
-- Toda igreja mantém pelo menos um admin geral
-- ---------------------------------------------------------------------------
create or replace function public.keep_one_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.papel = 'admin'
     and (tg_op = 'DELETE' or new.papel <> 'admin')
     and exists (select 1 from public.churches where id = old.church_id)
     and not exists (
       select 1 from public.memberships
       where church_id = old.church_id and papel = 'admin' and id <> old.id
     )
  then
    raise exception 'A igreja precisa de pelo menos um admin geral' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_keep_admin before update or delete on public.memberships
  for each row execute function public.keep_one_admin();

-- ---------------------------------------------------------------------------
-- Ligar RLS em tudo
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.churches enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.volunteers enable row level security;
alter table public.ministry_roles enable row level security;
alter table public.services enable row level security;
alter table public.schedules enable row level security;
alter table public.assignments enable row level security;
alter table public.activity_log enable row level security;

-- Visitantes sem conta não acessam tabela nenhuma: a página pública passa
-- pelas funções do servidor (Netlify Functions).
revoke all on all tables in schema public from anon;

-- profiles --------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships m
      where m.user_id = profiles.id and public.is_member(m.church_id)
    )
  );

create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke insert, delete on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (nome) on public.profiles to authenticated;

-- platform_admins ---------------------------------------------------------------
create policy platform_admins_select_own on public.platform_admins for select to authenticated
  using (user_id = auth.uid());
revoke insert, update, delete on public.platform_admins from authenticated;

-- churches --------------------------------------------------------------------
create policy churches_select on public.churches for select to authenticated
  using (public.is_member(id) or public.is_platform_admin());

create policy churches_update on public.churches for update to authenticated
  using (public.is_gestor(id))
  with check (public.is_gestor(id));

-- criar igreja só pela função platform_create_church()
revoke insert, delete on public.churches from authenticated;
revoke update on public.churches from authenticated;
grant update (nome, logo_path, cor_principal, fuso_horario, cultos_fixos, versiculos)
  on public.churches to authenticated;

-- memberships -----------------------------------------------------------------
create policy memberships_select on public.memberships for select to authenticated
  using (public.is_member(church_id));

-- só o admin mexe em papéis; o líder não promove nem rebaixa ninguém a/de admin
create policy memberships_update on public.memberships for update to authenticated
  using (public.is_admin(church_id) or (public.is_gestor(church_id) and papel <> 'admin'))
  with check (public.is_admin(church_id) or (public.is_gestor(church_id) and papel <> 'admin'));

create policy memberships_delete on public.memberships for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin(church_id)
    or (public.is_gestor(church_id) and papel <> 'admin')
  );

-- entrar na equipe só por convite (accept_invite)
revoke insert on public.memberships from authenticated;
revoke update on public.memberships from authenticated;
grant update (papel) on public.memberships to authenticated;

-- invites ---------------------------------------------------------------------
create policy invites_select on public.invites for select to authenticated
  using (public.is_gestor(church_id));

create policy invites_delete on public.invites for delete to authenticated
  using (public.is_admin(church_id) or (public.is_gestor(church_id) and papel <> 'admin'));

-- criar convite só pela função create_invite() (gera o token)
revoke insert, update on public.invites from authenticated;
revoke select on public.invites from authenticated;
grant select (id, church_id, email, papel, expira_em, aceito_em, aceito_por, convidado_por, created_at, updated_at)
  on public.invites to authenticated;

-- volunteers ------------------------------------------------------------------
create policy volunteers_select on public.volunteers for select to authenticated
  using (public.is_member(church_id));

create policy volunteers_insert on public.volunteers for insert to authenticated
  with check (public.is_gestor(church_id));

create policy volunteers_update on public.volunteers for update to authenticated
  using (public.is_gestor(church_id))
  with check (public.is_gestor(church_id));

create policy volunteers_delete on public.volunteers for delete to authenticated
  using (public.is_gestor(church_id));

-- Telefone e código do aparelho não são lidos direto da tabela.
-- O líder vê os telefones pela função volunteer_contacts().
revoke select, insert, update on public.volunteers from authenticated;
grant select (
  id, church_id, nome, user_id, frequencia, escala_12x36_ref, cultos_costume,
  datas_bloqueadas, datas_escolhidas, observacao, ativo,
  disponibilidade_atualizada_em, created_at, updated_at
) on public.volunteers to authenticated;
grant insert (
  church_id, nome, telefone, user_id, frequencia, escala_12x36_ref, cultos_costume,
  datas_bloqueadas, datas_escolhidas, observacao, ativo
) on public.volunteers to authenticated;
grant update (
  nome, telefone, user_id, frequencia, escala_12x36_ref, cultos_costume,
  datas_bloqueadas, datas_escolhidas, observacao, ativo
) on public.volunteers to authenticated;

-- ministry_roles, services, schedules, assignments ---------------------------
create policy ministry_roles_select on public.ministry_roles for select to authenticated
  using (public.is_member(church_id));
create policy ministry_roles_write on public.ministry_roles for all to authenticated
  using (public.is_gestor(church_id))
  with check (public.is_gestor(church_id));

create policy services_select on public.services for select to authenticated
  using (public.is_member(church_id));
create policy services_write on public.services for all to authenticated
  using (public.is_gestor(church_id))
  with check (public.is_gestor(church_id));

create policy schedules_select on public.schedules for select to authenticated
  using (public.is_member(church_id));
create policy schedules_write on public.schedules for all to authenticated
  using (public.is_gestor(church_id))
  with check (public.is_gestor(church_id));

create policy assignments_select on public.assignments for select to authenticated
  using (public.is_member(church_id));
create policy assignments_write on public.assignments for all to authenticated
  using (public.is_gestor(church_id))
  with check (public.is_gestor(church_id));

-- activity_log ----------------------------------------------------------------
create policy activity_log_select on public.activity_log for select to authenticated
  using (public.is_gestor(church_id));
revoke insert, update, delete on public.activity_log from authenticated;
