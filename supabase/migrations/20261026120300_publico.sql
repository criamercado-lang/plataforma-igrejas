-- Fase 1 · Página pública da escala (/{igreja})
-- Estas funções são chamadas SOMENTE pelas funções do servidor (service role),
-- que fazem a proteção contra robôs e o limite de envios.
-- Nenhuma delas devolve telefone.

-- ---------------------------------------------------------------------------
-- Dados públicos da igreja (também usados na prévia do link no WhatsApp)
-- ---------------------------------------------------------------------------
create or replace function public.public_church(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id,
    'nome', c.nome,
    'slug', c.slug,
    'logo_path', c.logo_path,
    'cor_principal', c.cor_principal,
    'fuso_horario', c.fuso_horario,
    'cultos_fixos', c.cultos_fixos,
    'versiculos', c.versiculos
  )
  from public.churches c
  where c.slug = lower(p_slug);
$$;

-- Voluntário pelo código do aparelho (ou null).
create or replace function public._volunteer_by_token(p_church uuid, p_token text)
returns public.volunteers
language sql
stable
security definer
set search_path = public
as $$
  select v.* from public.volunteers v
  where v.church_id = p_church
    and p_token is not null and length(p_token) >= 32
    and v.device_token_hash = public.hash_token(p_token)
  limit 1;
$$;

create or replace function public._volunteer_json(v public.volunteers)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', v.id,
    'nome', v.nome,
    'frequencia', v.frequencia,
    'escala_12x36_ref', v.escala_12x36_ref,
    'cultos_costume', v.cultos_costume,
    'datas_bloqueadas', to_jsonb(v.datas_bloqueadas),
    'datas_escolhidas', to_jsonb(v.datas_escolhidas),
    'observacao', v.observacao,
    'disponibilidade_atualizada_em', v.disponibilidade_atualizada_em
  );
$$;

-- ---------------------------------------------------------------------------
-- Calendário público: cultos do período e quem está escalado (só escalas enviadas)
-- ---------------------------------------------------------------------------
create or replace function public.public_calendar(
  p_slug text,
  p_inicio date,
  p_fim date,
  p_device_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_church uuid;
  v_me public.volunteers;
begin
  select id into v_church from public.churches where slug = lower(p_slug);
  if v_church is null then
    return null;
  end if;
  if p_fim < p_inicio or p_fim - p_inicio > 62 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;

  v_me := public._volunteer_by_token(v_church, p_device_token);

  return jsonb_build_object(
    'cultos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'data', s.data,
        'turno', s.turno,
        'nome', s.nome,
        'tipo', s.tipo,
        'eu_escalado', v_me.id is not null and exists (
          select 1 from public.assignments a
          join public.schedules sc on sc.id = a.schedule_id and sc.status = 'enviada'
          where a.service_id = s.id and a.volunteer_id = v_me.id
        ),
        'escalados', coalesce((
          select jsonb_agg(jsonb_build_object('funcao', f.funcao, 'nomes', f.nomes) order by f.ordem)
          from (
            select r.nome as funcao, r.ordem, jsonb_agg(v.nome order by v.nome) as nomes
            from public.assignments a
            join public.schedules sc on sc.id = a.schedule_id and sc.status = 'enviada'
            join public.ministry_roles r on r.id = a.ministry_role_id
            join public.volunteers v on v.id = a.volunteer_id
            where a.service_id = s.id
            group by r.nome, r.ordem
          ) f
        ), '[]'::jsonb)
      ) order by s.data, s.turno)
      from public.services s
      where s.church_id = v_church and s.data between p_inicio and p_fim
    ), '[]'::jsonb),
    'eu', case when v_me.id is null then null else public._volunteer_json(v_me) end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Buscar cadastro pelo WhatsApp
-- Só devolve os dados se o código do aparelho bater. Senão, avisa que o
-- número existe e pede o nome completo para confirmar.
-- ---------------------------------------------------------------------------
create or replace function public.public_volunteer_lookup(
  p_slug text,
  p_telefone text,
  p_device_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_church uuid;
  v public.volunteers;
begin
  select id into v_church from public.churches where slug = lower(p_slug);
  if v_church is null then
    raise exception 'Igreja não encontrada' using errcode = 'P0002';
  end if;

  select * into v from public.volunteers
  where church_id = v_church and telefone = public.normalizar_telefone(p_telefone);

  if not found then
    return jsonb_build_object('encontrado', false);
  end if;

  if v.device_token_hash is not null
     and p_device_token is not null
     and v.device_token_hash = public.hash_token(p_device_token) then
    return jsonb_build_object('encontrado', true, 'voluntario', public._volunteer_json(v));
  end if;

  return jsonb_build_object('encontrado', true, 'precisa_confirmar_nome', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Salvar disponibilidade
-- p_dados: {nome, telefone, frequencia, escala_12x36_ref, cultos_costume,
--           datas_bloqueadas, datas_escolhidas, observacao}
-- Devolve {ok, device_token?, voluntario} ou {ok:false, erro}.
-- ---------------------------------------------------------------------------
create or replace function public.public_volunteer_save(
  p_slug text,
  p_dados jsonb,
  p_device_token text default null,
  p_confirmar_nome text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church public.churches;
  v public.volunteers;
  v_tel text := public.normalizar_telefone(p_dados ->> 'telefone');
  v_nome text := regexp_replace(trim(coalesce(p_dados ->> 'nome', '')), '\s+', ' ', 'g');
  v_freq public.frequencia;
  v_ref date;
  v_cultos jsonb := coalesce(p_dados -> 'cultos_costume', '[]'::jsonb);
  v_bloq date[];
  v_escolhidas date[];
  v_obs text := nullif(trim(coalesce(p_dados ->> 'observacao', '')), '');
  v_hoje date;
  v_token text;
  v_origem text := 'link_publico';
  v_item jsonb;
begin
  select * into v_church from public.churches where slug = lower(p_slug);
  if not found then
    raise exception 'Igreja não encontrada' using errcode = 'P0002';
  end if;
  v_hoje := (now() at time zone v_church.fuso_horario)::date;

  -- validação --------------------------------------------------------------
  if length(v_nome) < 2 or length(v_nome) > 80 then
    return jsonb_build_object('ok', false, 'erro', 'nome_invalido');
  end if;
  if v_tel is null or v_tel !~ '^[0-9]{12,15}$' then
    return jsonb_build_object('ok', false, 'erro', 'telefone_invalido');
  end if;
  begin
    v_freq := (p_dados ->> 'frequencia')::public.frequencia;
    v_ref := nullif(p_dados ->> 'escala_12x36_ref', '')::date;
    select coalesce(array_agg(distinct d::date order by d::date), '{}')
      into v_bloq from jsonb_array_elements_text(coalesce(p_dados -> 'datas_bloqueadas', '[]')) d;
    select coalesce(array_agg(distinct d::date order by d::date), '{}')
      into v_escolhidas from jsonb_array_elements_text(coalesce(p_dados -> 'datas_escolhidas', '[]')) d;
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end;
  if v_freq is null then
    return jsonb_build_object('ok', false, 'erro', 'frequencia_invalida');
  end if;
  if v_freq = 'datas' then
    v_ref := null; -- 12x36 não se aplica a quem escolhe as datas
  end if;
  if v_ref is not null and (v_ref < v_hoje - 400 or v_ref > v_hoje + 400) then
    return jsonb_build_object('ok', false, 'erro', 'data_12x36_invalida');
  end if;
  if jsonb_typeof(v_cultos) <> 'array' or jsonb_array_length(v_cultos) > 21 then
    return jsonb_build_object('ok', false, 'erro', 'cultos_invalidos');
  end if;
  for v_item in select * from jsonb_array_elements(v_cultos) loop
    if jsonb_typeof(v_item -> 'dia') <> 'number'
       or (v_item ->> 'dia')::int not between 0 and 6
       or coalesce(v_item ->> 'turno', '') not in ('manha', 'tarde', 'noite') then
      return jsonb_build_object('ok', false, 'erro', 'cultos_invalidos');
    end if;
  end loop;
  if coalesce(array_length(v_bloq, 1), 0) > 200 or coalesce(array_length(v_escolhidas, 1), 0) > 200 then
    return jsonb_build_object('ok', false, 'erro', 'datas_demais');
  end if;
  if length(coalesce(v_obs, '')) > 500 then
    return jsonb_build_object('ok', false, 'erro', 'observacao_longa');
  end if;
  -- datas passadas não importam mais
  v_bloq := array(select d from unnest(v_bloq) d where d >= v_hoje - 31);
  v_escolhidas := array(select d from unnest(v_escolhidas) d where d >= v_hoje - 31);

  -- quem é ----------------------------------------------------------------
  select * into v from public.volunteers
  where church_id = v_church.id and telefone = v_tel
  for update;

  if found then
    if v.device_token_hash is not null
       and p_device_token is not null
       and v.device_token_hash = public.hash_token(p_device_token) then
      v_token := null; -- mesmo aparelho, mantém o código
    elsif public.normalizar_nome(p_confirmar_nome) = public.normalizar_nome(v.nome) then
      v_token := public.novo_token();
      v_origem := 'link_publico_outro_aparelho';
    else
      return jsonb_build_object('ok', false, 'erro', 'precisa_confirmar_nome');
    end if;

    perform set_config('app.origem', v_origem, true);

    update public.volunteers set
      nome = v_nome,
      frequencia = v_freq,
      escala_12x36_ref = v_ref,
      cultos_costume = v_cultos,
      datas_bloqueadas = v_bloq,
      datas_escolhidas = v_escolhidas,
      observacao = v_obs,
      device_token_hash = coalesce(public.hash_token(v_token), device_token_hash),
      disponibilidade_atualizada_em = now()
    where id = v.id
    returning * into v;
  else
    v_token := public.novo_token();
    perform set_config('app.origem', v_origem, true);

    insert into public.volunteers (
      church_id, nome, telefone, frequencia, escala_12x36_ref, cultos_costume,
      datas_bloqueadas, datas_escolhidas, observacao, device_token_hash,
      disponibilidade_atualizada_em
    ) values (
      v_church.id, v_nome, v_tel, v_freq, v_ref, v_cultos,
      v_bloq, v_escolhidas, v_obs, public.hash_token(v_token), now()
    )
    returning * into v;
  end if;

  return jsonb_build_object(
    'ok', true,
    'device_token', v_token,
    'voluntario', public._volunteer_json(v)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Botão "Não posso" no calendário
-- ---------------------------------------------------------------------------
create or replace function public.public_volunteer_nao_posso(
  p_slug text,
  p_device_token text,
  p_data date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church public.churches;
  v public.volunteers;
  v_estava_escalado boolean;
begin
  select * into v_church from public.churches where slug = lower(p_slug);
  if not found then
    raise exception 'Igreja não encontrada' using errcode = 'P0002';
  end if;
  v := public._volunteer_by_token(v_church.id, p_device_token);
  if v.id is null then
    return jsonb_build_object('ok', false, 'erro', 'identifique_se');
  end if;
  if p_data < (now() at time zone v_church.fuso_horario)::date then
    return jsonb_build_object('ok', false, 'erro', 'data_passada');
  end if;

  select exists (
    select 1 from public.assignments a
    join public.services s on s.id = a.service_id
    join public.schedules sc on sc.id = a.schedule_id and sc.status = 'enviada'
    where a.volunteer_id = v.id and s.data = p_data
  ) into v_estava_escalado;

  perform set_config('app.origem', 'link_publico', true);

  update public.volunteers set
    datas_bloqueadas = array(select distinct d from unnest(datas_bloqueadas || p_data) d order by d),
    datas_escolhidas = array_remove(datas_escolhidas, p_data),
    disponibilidade_atualizada_em = now()
  where id = v.id
  returning * into v;

  return jsonb_build_object(
    'ok', true,
    'estava_escalado', v_estava_escalado,
    'voluntario', public._volunteer_json(v)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: só a service role chama estas funções.
-- public_church também é liberada para a prévia do link (só dados públicos).
-- ---------------------------------------------------------------------------
revoke execute on function public.public_church(text) from public, anon, authenticated;
revoke execute on function public._volunteer_by_token(uuid, text) from public, anon, authenticated;
revoke execute on function public._volunteer_json(public.volunteers) from public, anon, authenticated;
revoke execute on function public.public_calendar(text, date, date, text) from public, anon, authenticated;
revoke execute on function public.public_volunteer_lookup(text, text, text) from public, anon, authenticated;
revoke execute on function public.public_volunteer_save(text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.public_volunteer_nao_posso(text, text, date) from public, anon, authenticated;

grant execute on function public.public_church(text) to anon, authenticated;
