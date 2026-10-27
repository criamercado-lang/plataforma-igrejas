-- Fase 1 · Funções: criar igreja, convites, contatos e salvar escala.
-- Cada função confere o papel de quem chama dentro do banco.

-- ---------------------------------------------------------------------------
-- Plataforma: criar igreja + convite do admin geral
-- ---------------------------------------------------------------------------
create or replace function public.platform_create_church(
  p_nome text,
  p_slug text,
  p_admin_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church uuid;
  v_token text := public.novo_token();
begin
  if not public.is_platform_admin() then
    raise exception 'Só a administração da plataforma cria igrejas' using errcode = '42501';
  end if;

  perform set_config('app.origem', 'plataforma', true);

  insert into public.churches (nome, slug, versiculos)
  values (
    trim(p_nome),
    lower(trim(p_slug)),
    -- versículos iniciais (os mesmos usados hoje no app da ADVICC e no material do curso);
    -- a igreja edita nas configurações
    jsonb_build_array(
      jsonb_build_object('texto', 'Consagre ao Senhor tudo o que você faz, e os seus planos serão bem-sucedidos.', 'referencia', 'Provérbios 16:3'),
      jsonb_build_object('texto', 'Tudo quanto fizerem, façam de todo o coração, como para o Senhor.', 'referencia', 'Colossenses 3:23')
    )
  )
  returning id into v_church;

  insert into public.invites (church_id, email, papel, token_hash, convidado_por)
  values (v_church, lower(trim(p_admin_email)), 'admin', public.hash_token(v_token), auth.uid());

  return jsonb_build_object('church_id', v_church, 'convite_token', v_token);
exception
  when unique_violation then
    raise exception 'Já existe uma igreja com o endereço "%"', lower(trim(p_slug)) using errcode = '23505';
end;
$$;

-- ---------------------------------------------------------------------------
-- Convites da equipe
-- ---------------------------------------------------------------------------
create or replace function public.create_invite(
  p_church uuid,
  p_email text,
  p_papel public.app_role
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := public.novo_token();
  v_email text := lower(trim(p_email));
begin
  if not public.is_gestor(p_church) then
    raise exception 'Só admin ou líder de comunicação convida a equipe' using errcode = '42501';
  end if;
  if p_papel = 'admin' and not public.is_admin(p_church) then
    raise exception 'Só o admin geral convida outro admin' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.church_id = p_church and lower(u.email) = v_email
  ) then
    raise exception 'Essa pessoa já faz parte da equipe' using errcode = '23505';
  end if;

  -- um convite aberto por e-mail: o novo substitui o anterior
  delete from public.invites
  where church_id = p_church and lower(email) = v_email and aceito_em is null;

  insert into public.invites (church_id, email, papel, token_hash, convidado_por)
  values (p_church, v_email, p_papel, public.hash_token(v_token), auth.uid());

  return v_token;
end;
$$;

-- Dados para a tela do convite. Quem tem o token (link) pode ver.
create or replace function public.invite_info(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
begin
  select i.email, i.papel, i.expira_em, i.aceito_em, c.nome as igreja, c.slug, c.logo_path, c.cor_principal
  into v
  from public.invites i
  join public.churches c on c.id = i.church_id
  where i.token_hash = public.hash_token(p_token);

  if not found then
    return jsonb_build_object('valido', false, 'motivo', 'nao_encontrado');
  end if;

  return jsonb_build_object(
    'valido', v.aceito_em is null and v.expira_em > now(),
    'motivo', case
      when v.aceito_em is not null then 'ja_aceito'
      when v.expira_em <= now() then 'expirado'
    end,
    'email', v.email,
    'papel', v.papel,
    'igreja', v.igreja,
    'slug', v.slug,
    'logo_path', v.logo_path,
    'cor_principal', v.cor_principal,
    'conta_existe', exists (select 1 from auth.users where lower(email) = v.email)
  );
end;
$$;

-- Núcleo do aceite (sem checar quem chama).
create or replace function public._accept_invite(p_token text, p_user uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.invites;
begin
  select * into v from public.invites
  where token_hash = public.hash_token(p_token)
  for update;

  if not found then
    raise exception 'Convite não encontrado' using errcode = 'P0002';
  end if;
  if v.aceito_em is not null then
    raise exception 'Este convite já foi usado' using errcode = '22023';
  end if;
  if v.expira_em <= now() then
    raise exception 'Este convite expirou. Peça um novo ao líder.' using errcode = '22023';
  end if;
  if lower(coalesce(p_email, '')) <> lower(v.email) then
    raise exception 'Este convite foi enviado para outro e-mail (%)', v.email using errcode = '42501';
  end if;

  insert into public.memberships (church_id, user_id, papel)
  values (v.church_id, p_user, v.papel)
  on conflict (church_id, user_id) do nothing;

  update public.invites set aceito_em = now(), aceito_por = p_user where id = v.id;

  return v.church_id;
end;
$$;

-- Pessoa logada aceita o convite enviado para o e-mail dela.
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para aceitar o convite' using errcode = '42501';
  end if;
  return public._accept_invite(p_token, auth.uid(), auth.jwt() ->> 'email');
end;
$$;

-- Usada pela função do servidor que cria a conta nova (service role).
create or replace function public.accept_invite_for_user(p_token text, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = p_user;
  return public._accept_invite(p_token, p_user, v_email);
end;
$$;

-- ---------------------------------------------------------------------------
-- Contatos dos voluntários (só admin e líder)
-- ---------------------------------------------------------------------------
create or replace function public.volunteer_contacts(p_church uuid)
returns table (id uuid, nome text, telefone text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_gestor(p_church) then
    raise exception 'Só admin ou líder vê os telefones' using errcode = '42501';
  end if;
  return query
    select v.id, v.nome, v.telefone from public.volunteers v
    where v.church_id = p_church
    order by v.nome;
end;
$$;

-- ---------------------------------------------------------------------------
-- Salvar a escala montada (substitui tudo de uma vez)
-- p_assignments: [{"service_id": "...", "ministry_role_id": "...", "volunteer_id": "..."}]
-- ---------------------------------------------------------------------------
create or replace function public.save_schedule(p_schedule uuid, p_assignments jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sched public.schedules;
  v_count int;
  v_fora int;
begin
  select * into v_sched from public.schedules where id = p_schedule for update;
  if not found or not public.is_gestor(v_sched.church_id) then
    raise exception 'Sem permissão para editar esta escala' using errcode = '42501';
  end if;
  if jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'Formato inválido' using errcode = '22023';
  end if;

  -- só cultos dentro do período da escala
  select count(*) into v_fora
  from jsonb_array_elements(p_assignments) a
  join public.services s on s.id = (a ->> 'service_id')::uuid
  where s.data not between v_sched.inicio and v_sched.fim;
  if v_fora > 0 then
    raise exception 'Há cultos fora do período da escala' using errcode = '22023';
  end if;

  delete from public.assignments where schedule_id = p_schedule;

  insert into public.assignments (church_id, schedule_id, service_id, ministry_role_id, volunteer_id)
  select v_sched.church_id, p_schedule,
         (a ->> 'service_id')::uuid,
         (a ->> 'ministry_role_id')::uuid,
         (a ->> 'volunteer_id')::uuid
  from jsonb_array_elements(p_assignments) a;

  get diagnostics v_count = row_count;

  insert into public.activity_log (church_id, quem, acao, tabela, registro_id, depois)
  values (v_sched.church_id, auth.uid(), 'UPDATE', 'assignments', p_schedule,
          jsonb_build_object('escalas_salvas', v_count));

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_role(uuid, public.app_role[]) to authenticated;
grant execute on function public.is_gestor(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.normalizar_telefone(text) to authenticated;

grant execute on function public.platform_create_church(text, text, text) to authenticated;
grant execute on function public.create_invite(uuid, text, public.app_role) to authenticated;
grant execute on function public.invite_info(text) to anon, authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.volunteer_contacts(uuid) to authenticated;
grant execute on function public.save_schedule(uuid, jsonb) to authenticated;
-- accept_invite_for_user e _accept_invite: só service role (função do servidor)

-- Funções de trigger: o Postgres executa no contexto do dono, não precisam de grant.
