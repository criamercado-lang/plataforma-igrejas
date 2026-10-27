-- Fase 2 · Eventos, plano de divulgação e tarefas.
-- O app só guarda links (Canva, Drive, Instagram); nenhum arquivo de arte ou vídeo.

create type public.status_evento as enum ('planejamento', 'divulgacao', 'realizado', 'cancelado');
create type public.status_tarefa as enum ('a_fazer', 'fazendo', 'feito');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 120),
  modelo text not null default 'culto_especial' check (length(modelo) <= 40),
  data_inicio date not null,
  data_fim date not null,
  -- dias e turnos que entram na escala da mídia: [{"data":"2026-11-14","turno":"noite"}]
  dias jsonb not null default '[]'::jsonb check (jsonb_typeof(dias) = 'array'),
  horario text check (length(horario) <= 60),
  local text check (length(local) <= 120),
  tema text check (length(tema) <= 200),
  versiculo text check (length(versiculo) <= 300),
  convidados text check (length(convidados) <= 300),
  objetivo text check (length(objetivo) <= 500),
  canais text[] not null default '{}' check (cardinality(canais) <= 10),
  status public.status_evento not null default 'planejamento',
  criado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (data_fim >= data_inicio and data_fim <= data_inicio + 31)
);

create index events_church_idx on public.events (church_id, data_inicio);

create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- services.event_id foi criado na fase 1 aguardando esta tabela
alter table public.services
  add constraint services_event_fk foreign key (event_id) references public.events (id) on delete set null;
create index services_event_idx on public.services (event_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  -- identifica o item do modelo; gerar o plano de novo não duplica
  chave text check (length(chave) <= 60),
  titulo text not null check (length(trim(titulo)) between 2 and 120),
  etapa text not null default 'Divulgação' check (length(etapa) <= 40),
  tipo text not null default 'outro' check (length(tipo) <= 30),
  descricao text check (length(descricao) <= 1000),
  responsavel_id uuid references auth.users (id) on delete set null,
  prazo date,
  publicar_em date,
  status public.status_tarefa not null default 'a_fazer',
  link text check (link is null or (length(link) <= 500 and link ~* '^https?://')),
  ordem int not null default 0,
  concluida_em timestamptz,
  criado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, chave)
);

create index tasks_church_idx on public.tasks (church_id, prazo);
create index tasks_responsavel_idx on public.tasks (responsavel_id, status);

create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- Linhas ligadas precisam ser da mesma igreja; responsável precisa ser da equipe.
create or replace function public.check_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_id is not null
     and (select church_id from public.events where id = new.event_id) is distinct from new.church_id then
    raise exception 'Evento de outra igreja' using errcode = '42501';
  end if;
  if new.responsavel_id is not null and not exists (
    select 1 from public.memberships m where m.church_id = new.church_id and m.user_id = new.responsavel_id
  ) then
    raise exception 'O responsável precisa ser da equipe da igreja' using errcode = '22023';
  end if;
  if new.status = 'feito' and (tg_op = 'INSERT' or old.status <> 'feito') then
    new.concluida_em := now();
  elsif new.status <> 'feito' then
    new.concluida_em := null;
  end if;
  return new;
end;
$$;

create trigger tasks_check before insert or update on public.tasks
  for each row execute function public.check_task();

create trigger events_log after insert or update or delete on public.events
  for each row execute function public.log_activity();
create trigger tasks_log after insert or update or delete on public.tasks
  for each row execute function public.log_activity();

-- RLS ------------------------------------------------------------------------
alter table public.events enable row level security;
alter table public.tasks enable row level security;

-- o Supabase dá acesso a tabelas novas para anon por padrão: tirar
revoke all on public.events, public.tasks from anon;

create policy events_select on public.events for select to authenticated
  using (public.is_member(church_id));
create policy events_write on public.events for all to authenticated
  using (public.is_gestor(church_id))
  with check (public.is_gestor(church_id));

create policy tasks_select on public.tasks for select to authenticated
  using (public.is_member(church_id));
create policy tasks_write on public.tasks for all to authenticated
  using (public.is_gestor(church_id))
  with check (public.is_gestor(church_id));

-- Funções --------------------------------------------------------------------

-- Liga os dias do evento à escala: cria (ou marca) os cultos daquele dia e turno.
-- Dias tirados do evento: o culto some se não tiver ninguém escalado; senão só perde a ligação.
create or replace function public._sync_event_services(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.events;
begin
  select * into ev from public.events where id = p_event;

  insert into public.services (church_id, data, turno, nome, tipo, event_id)
  select ev.church_id, (d ->> 'data')::date, (d ->> 'turno')::public.turno, ev.nome, 'evento', ev.id
  from jsonb_array_elements(ev.dias) d
  on conflict (church_id, data, turno) do update
    set nome = excluded.nome, tipo = 'evento', event_id = excluded.event_id;

  delete from public.services s
  where s.event_id = ev.id
    and not exists (
      select 1 from jsonb_array_elements(ev.dias) d
      where (d ->> 'data')::date = s.data and (d ->> 'turno')::public.turno = s.turno
    )
    and not exists (select 1 from public.assignments a where a.service_id = s.id);

  update public.services s set event_id = null, tipo = 'culto'
  where s.event_id = ev.id
    and not exists (
      select 1 from jsonb_array_elements(ev.dias) d
      where (d ->> 'data')::date = s.data and (d ->> 'turno')::public.turno = s.turno
    );
end;
$$;

-- Evento apagado: os cultos dele sem ninguém escalado somem; os outros voltam a ser culto comum.
create or replace function public.events_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.services s
  where s.event_id = old.id
    and not exists (select 1 from public.assignments a where a.service_id = s.id);
  update public.services set tipo = 'culto', event_id = null where event_id = old.id;
  return old;
end;
$$;

create trigger events_cleanup before delete on public.events
  for each row execute function public.events_before_delete();

-- Cria ou edita o evento (p_id nulo = novo). Devolve o id.
create or replace function public.save_event(p_church uuid, p_id uuid, p_dados jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_dias jsonb := coalesce(p_dados -> 'dias', '[]'::jsonb);
  v_inicio date;
  v_fim date;
  v_item jsonb;
  v_canais text[];
begin
  if not public.is_gestor(p_church) then
    raise exception 'Só admin e líder cadastram eventos' using errcode = '42501';
  end if;
  if p_id is not null and not exists (select 1 from public.events where id = p_id and church_id = p_church) then
    raise exception 'Evento não encontrado' using errcode = 'P0002';
  end if;

  begin
    v_inicio := (p_dados ->> 'data_inicio')::date;
    v_fim := coalesce(nullif(p_dados ->> 'data_fim', '')::date, v_inicio);
    select coalesce(array_agg(trim(c)), '{}') into v_canais
      from jsonb_array_elements_text(coalesce(p_dados -> 'canais', '[]')) c where trim(c) <> '';
  exception when others then
    raise exception 'Dados do evento inválidos' using errcode = '22023';
  end;
  if v_inicio is null then
    raise exception 'Informe a data do evento' using errcode = '22023';
  end if;

  if jsonb_typeof(v_dias) <> 'array' or jsonb_array_length(v_dias) > 20 then
    raise exception 'Dias do evento inválidos' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(v_dias) loop
    if coalesce(v_item ->> 'turno', '') not in ('manha', 'tarde', 'noite')
       or (v_item ->> 'data') !~ '^\d{4}-\d{2}-\d{2}$'
       or (v_item ->> 'data')::date not between v_inicio and v_fim then
      raise exception 'Cada dia da escala precisa estar dentro do período do evento' using errcode = '22023';
    end if;
  end loop;
  select coalesce(jsonb_agg(distinct jsonb_build_object('data', d ->> 'data', 'turno', d ->> 'turno')), '[]')
    into v_dias from jsonb_array_elements(v_dias) d;

  if v_id is null then
    insert into public.events (church_id, nome, modelo, data_inicio, data_fim, dias, horario, local, tema,
                               versiculo, convidados, objetivo, canais, criado_por)
    values (p_church, trim(p_dados ->> 'nome'), coalesce(nullif(p_dados ->> 'modelo', ''), 'culto_especial'),
            v_inicio, v_fim, v_dias,
            nullif(trim(p_dados ->> 'horario'), ''), nullif(trim(p_dados ->> 'local'), ''),
            nullif(trim(p_dados ->> 'tema'), ''), nullif(trim(p_dados ->> 'versiculo'), ''),
            nullif(trim(p_dados ->> 'convidados'), ''), nullif(trim(p_dados ->> 'objetivo'), ''),
            v_canais, auth.uid())
    returning id into v_id;
  else
    update public.events set
      nome = trim(p_dados ->> 'nome'),
      data_inicio = v_inicio,
      data_fim = v_fim,
      dias = v_dias,
      horario = nullif(trim(p_dados ->> 'horario'), ''),
      local = nullif(trim(p_dados ->> 'local'), ''),
      tema = nullif(trim(p_dados ->> 'tema'), ''),
      versiculo = nullif(trim(p_dados ->> 'versiculo'), ''),
      convidados = nullif(trim(p_dados ->> 'convidados'), ''),
      objetivo = nullif(trim(p_dados ->> 'objetivo'), ''),
      canais = v_canais,
      status = coalesce(nullif(p_dados ->> 'status', '')::public.status_evento, status)
    where id = v_id;
  end if;

  perform public._sync_event_services(v_id);
  return v_id;
end;
$$;

-- Confirma o plano revisado: cria as tarefas que ainda não existem (pela chave).
create or replace function public.create_event_tasks(p_event uuid, p_tarefas jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.events;
  v_count int;
begin
  select * into ev from public.events where id = p_event;
  if not found or not public.is_gestor(ev.church_id) then
    raise exception 'Sem permissão para este evento' using errcode = '42501';
  end if;
  if jsonb_typeof(p_tarefas) <> 'array' or jsonb_array_length(p_tarefas) > 60 then
    raise exception 'Plano inválido' using errcode = '22023';
  end if;

  insert into public.tasks (church_id, event_id, chave, titulo, etapa, tipo, descricao,
                            responsavel_id, prazo, publicar_em, ordem, criado_por)
  select ev.church_id, ev.id,
         nullif(t ->> 'chave', ''),
         trim(t ->> 'titulo'),
         coalesce(nullif(t ->> 'etapa', ''), 'Divulgação'),
         coalesce(nullif(t ->> 'tipo', ''), 'outro'),
         nullif(trim(t ->> 'descricao'), ''),
         nullif(t ->> 'responsavel_id', '')::uuid,
         nullif(t ->> 'prazo', '')::date,
         nullif(t ->> 'publicar_em', '')::date,
         coalesce((t ->> 'ordem')::int, 0),
         auth.uid()
  from jsonb_array_elements(p_tarefas) t
  on conflict (event_id, chave) do nothing;
  get diagnostics v_count = row_count;

  if ev.status = 'planejamento' then
    update public.events set status = 'divulgacao' where id = ev.id;
  end if;
  return v_count;
end;
$$;

-- Quem é responsável pela tarefa atualiza o andamento e o link (o líder também).
create or replace function public.update_task_progress(p_task uuid, p_status public.status_tarefa, p_link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tasks;
  v_link text := nullif(trim(coalesce(p_link, '')), '');
begin
  select * into t from public.tasks where id = p_task;
  if not found or not coalesce(public.is_gestor(t.church_id)
                       or (t.responsavel_id = auth.uid() and public.is_member(t.church_id)), false) then
    raise exception 'Só o responsável ou o líder atualizam esta tarefa' using errcode = '42501';
  end if;
  if v_link is not null and (length(v_link) > 500 or v_link !~* '^https?://') then
    raise exception 'O link precisa começar com https://' using errcode = '22023';
  end if;
  update public.tasks set status = p_status, link = v_link where id = p_task;
end;
$$;

revoke execute on function public._sync_event_services(uuid) from public, anon, authenticated;
revoke execute on function public.save_event(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.create_event_tasks(uuid, jsonb) from public, anon;
revoke execute on function public.update_task_progress(uuid, public.status_tarefa, text) from public, anon;
revoke execute on function public.check_task() from public, anon, authenticated;
revoke execute on function public.events_before_delete() from public, anon, authenticated;
grant execute on function public.save_event(uuid, uuid, jsonb) to authenticated;
grant execute on function public.create_event_tasks(uuid, jsonb) to authenticated;
grant execute on function public.update_task_progress(uuid, public.status_tarefa, text) to authenticated;
