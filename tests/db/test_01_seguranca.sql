-- Testes de segurança da fase 1: isolamento entre igrejas, papéis e página pública.
-- Roda como superusuário e troca de papel com SET ROLE + claims do JWT,
-- do mesmo jeito que o Supabase faz por baixo.

\set QUIET 1
\pset tuples_only on
\pset format unaligned

create schema if not exists t;
grant usage on schema t to anon, authenticated, service_role;

create or replace function t.ok(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FALHOU: %', label;
  end if;
  raise notice 'ok  %', label;
end $$;

create or replace function t.erro(sql text, label text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok  % (bloqueado: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FALHOU: esperava bloqueio — %', label;
end $$;

grant execute on all functions in schema t to anon, authenticated, service_role;

create table t.vars (k text primary key, v text);
grant select, insert, update on t.vars to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Pessoas
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'plataforma@curso.com', '{"nome":"Plataforma"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'ana@igrejaa.com',      '{"nome":"Ana"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'lia@igrejaa.com',      '{"nome":"Lia"}'),
  ('00000000-0000-0000-0000-0000000000b3', 'dan@igrejaa.com',      '{"nome":"Dan"}'),
  ('00000000-0000-0000-0000-0000000000b4', 'pr@igrejaa.com',       '{"nome":"Pastor"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'bob@igrejab.com',      '{"nome":"Bob"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'fora@x.com',           '{"nome":"Fora"}');
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000a1');

select t.ok((select count(*) from public.profiles) = 7, 'perfil criado automaticamente para cada conta');

\set como_plataforma 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000a1","email":"plataforma@curso.com","role":"authenticated"}'', false); set role authenticated;'
\set como_ana 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000b1","email":"ana@igrejaa.com","role":"authenticated"}'', false); set role authenticated;'
\set como_lia 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000b2","email":"lia@igrejaa.com","role":"authenticated"}'', false); set role authenticated;'
\set como_dan 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000b3","email":"dan@igrejaa.com","role":"authenticated"}'', false); set role authenticated;'
\set como_pastor 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000b4","email":"pr@igrejaa.com","role":"authenticated"}'', false); set role authenticated;'
\set como_bob 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000c1","email":"bob@igrejab.com","role":"authenticated"}'', false); set role authenticated;'
\set como_fora 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000d1","email":"fora@x.com","role":"authenticated"}'', false); set role authenticated;'
\set como_anon 'reset role; select set_config(''request.jwt.claims'', ''{"role":"anon"}'', false); set role anon;'
\set como_servidor 'reset role; select set_config(''request.jwt.claims'', ''{"role":"service_role"}'', false); set role service_role;'

-- ---------------------------------------------------------------------------
-- 1. Criar igrejas e entrar por convite
-- ---------------------------------------------------------------------------
:como_fora
select t.erro($$select public.platform_create_church('Igreja X', 'igreja-x', 'fora@x.com')$$,
  'quem não é da plataforma não cria igreja');

:como_plataforma
insert into t.vars select 'tokA', public.platform_create_church('AD Vida com Cristo', 'advicc', 'ana@igrejaa.com') ->> 'convite_token';
insert into t.vars select 'tokB', public.platform_create_church('Igreja B', 'igreja-b', 'bob@igrejab.com') ->> 'convite_token';
select t.erro($$select public.platform_create_church('Outra', 'advicc', 'x@x.com')$$, 'endereço (slug) repetido é recusado');
select t.erro($$select public.platform_create_church('Outra', 'Endereço Inválido', 'x@x.com')$$, 'slug com espaço/acento é recusado');

:como_anon
select t.ok((public.invite_info((select v from t.vars where k = 'tokA')) ->> 'igreja') = 'AD Vida com Cristo',
  'visitante com o link vê para qual igreja é o convite');
select t.ok((public.invite_info('token-que-nao-existe') ->> 'valido')::boolean = false, 'token inventado é inválido');
select t.erro($$select public.accept_invite('x')$$, 'visitante sem conta não aceita convite');

:como_bob
select t.erro(format('select public.accept_invite(%L)', (select v from t.vars where k = 'tokA')),
  'convite de outro e-mail é recusado');

:como_ana
select t.ok(public.accept_invite((select v from t.vars where k = 'tokA')) is not null, 'Ana aceita o convite e vira admin');
select t.erro(format('select public.accept_invite(%L)', (select v from t.vars where k = 'tokA')),
  'convite não pode ser usado duas vezes');

:como_servidor
select t.ok(public.accept_invite_for_user((select v from t.vars where k = 'tokB'), '00000000-0000-0000-0000-0000000000c1') is not null,
  'servidor aceita convite de conta nova (Bob, igreja B)');

-- ---------------------------------------------------------------------------
-- 2. Convites dentro da igreja e papéis
-- ---------------------------------------------------------------------------
:como_ana
insert into t.vars select 'church_a', id::text from public.churches where slug = 'advicc';
insert into t.vars select 'tokLia', public.create_invite((select id from public.churches where slug = 'advicc'), 'lia@igrejaa.com', 'lider');
insert into t.vars select 'tokPr', public.create_invite((select id from public.churches where slug = 'advicc'), 'PR@igrejaa.com ', 'aprovador');

:como_lia
select public.accept_invite((select v from t.vars where k = 'tokLia'));
insert into t.vars select 'tokDan', public.create_invite((select id from public.churches where slug = 'advicc'), 'dan@igrejaa.com', 'designer');
select t.erro($$select public.create_invite((select id from public.churches where slug = 'advicc'), 'novo@x.com', 'admin')$$,
  'líder não convida admin');
select t.erro($$select public.create_invite((select id from public.churches where slug = 'advicc'), 'ana@igrejaa.com', 'designer')$$,
  'não convida quem já está na equipe');

:como_dan
select public.accept_invite((select v from t.vars where k = 'tokDan'));
select t.erro($$select public.create_invite((select id from public.churches where slug = 'advicc'), 'z@x.com', 'designer')$$,
  'designer não convida ninguém');

:como_pastor
select public.accept_invite((select v from t.vars where k = 'tokPr'));
select t.ok((select papel::text from public.memberships where user_id = auth.uid()) = 'aprovador',
  'e-mail com maiúsculas/espaços no convite funciona');

:como_lia
select t.erro($$update public.memberships set papel = 'admin' where user_id = '00000000-0000-0000-0000-0000000000b3'$$,
  'líder não promove ninguém a admin');
update public.memberships set papel = 'designer' where user_id = '00000000-0000-0000-0000-0000000000b1';
select t.ok((select papel::text from public.memberships where user_id = '00000000-0000-0000-0000-0000000000b1') = 'admin',
  'líder não rebaixa o admin');

:como_dan
update public.memberships set papel = 'lider' where user_id = auth.uid();
select t.ok((select papel::text from public.memberships where user_id = auth.uid()) = 'designer',
  'designer não muda o próprio papel');

:como_ana
select t.erro($$delete from public.memberships where user_id = auth.uid()$$, 'último admin não sai da igreja');
select t.erro($$update public.memberships set papel = 'lider' where user_id = auth.uid()$$, 'último admin não se rebaixa');
select t.erro($$insert into public.memberships (church_id, user_id, papel) select id, '00000000-0000-0000-0000-0000000000d1', 'admin' from public.churches where slug = 'advicc'$$,
  'ninguém entra na equipe sem convite (insert direto)');

-- ---------------------------------------------------------------------------
-- 3. Dados da igreja A
-- ---------------------------------------------------------------------------
:como_lia
update public.churches set cultos_fixos = '[{"dia":0,"turno":"noite","nome":"Culto da Família"},{"dia":3,"turno":"noite","nome":"Culto de Ensino"}]'
where slug = 'advicc';
insert into public.ministry_roles (church_id, nome, ordem, pessoas_por_culto)
select id, x.nome, x.ordem, x.n from public.churches,
  (values ('Stories', 1, 1), ('Projeção', 2, 1), ('Fotos', 3, 2)) x(nome, ordem, n)
where slug = 'advicc';
insert into public.volunteers (church_id, nome, telefone, frequencia, cultos_costume)
select id, 'Maria Souza', '5532999990001', 'semanal', '[{"dia":0,"turno":"noite"}]' from public.churches where slug = 'advicc';
insert into public.services (church_id, data, turno, nome)
select id, date '2030-11-03', 'noite', 'Culto da Família' from public.churches where slug = 'advicc';
insert into public.schedules (church_id, inicio, fim, criada_por)
select id, date '2030-11-01', date '2030-11-15', auth.uid() from public.churches where slug = 'advicc';

select t.ok(public.save_schedule(
  (select id from public.schedules limit 1),
  (select jsonb_agg(jsonb_build_object('service_id', s.id, 'ministry_role_id', r.id, 'volunteer_id', v.id))
   from public.services s, public.ministry_roles r, public.volunteers v
   where r.nome = 'Stories')
) = 1, 'líder salva a escala');

select t.erro($$select public.save_schedule(
  (select id from public.schedules limit 1),
  (select jsonb_agg(jsonb_build_object('service_id', s.id, 'ministry_role_id', r.id, 'volunteer_id', v.id))
   from public.services s, public.ministry_roles r, public.volunteers v
   where r.nome in ('Stories', 'Projeção'))
)$$, 'mesma pessoa em duas funções no mesmo culto é recusado');

:como_dan
select t.ok((select count(*) from public.services) = 1, 'designer vê os cultos da própria igreja');
select t.ok((select count(*) from public.volunteers) = 1, 'designer vê os voluntários (sem telefone)');
select t.erro($$select telefone from public.volunteers$$, 'designer não lê telefones');
select t.erro($$select * from public.volunteer_contacts((select id from public.churches where slug = 'advicc'))$$,
  'designer não acessa a lista de contatos');
select t.erro($$insert into public.services (church_id, data, turno, nome) select id, date '2030-11-05', 'noite', 'X' from public.churches where slug = 'advicc'$$,
  'designer não cria culto');
select t.erro($$select public.save_schedule((select id from public.schedules limit 1), '[]')$$, 'designer não salva escala');
select t.ok((select count(*) from public.activity_log) = 0, 'designer não vê o histórico');
update public.churches set nome = 'Hackeado';
select t.ok((select nome from public.churches) = 'AD Vida com Cristo', 'designer não altera a igreja');

:como_lia
select t.ok((select count(*) from public.volunteer_contacts((select id from public.churches where slug = 'advicc'))) = 1,
  'líder vê os telefones pela função de contatos');
select t.ok((select count(*) from public.activity_log) > 0, 'líder vê o histórico');
select t.ok(not exists (select 1 from public.activity_log where antes ? 'device_token_hash' or depois ? 'device_token_hash' or antes ? 'token_hash' or depois ? 'token_hash'),
  'histórico não guarda hash de código nem de convite');

-- ---------------------------------------------------------------------------
-- 4. Isolamento entre igrejas
-- ---------------------------------------------------------------------------
:como_bob
select t.ok((select count(*) from public.churches) = 1 and (select slug from public.churches) = 'igreja-b', 'Bob só vê a igreja B');
select t.ok((select count(*) from public.volunteers) = 0, 'Bob não vê voluntários da igreja A');
select t.ok((select count(*) from public.services) = 0, 'Bob não vê cultos da igreja A');
select t.ok((select count(*) from public.memberships) = 1, 'Bob só vê a própria equipe');
select t.ok((select count(*) from public.profiles) = 1, 'Bob não vê perfis de outra igreja');
select t.ok((select count(*) from public.activity_log) = 0 or not exists (
  select 1 from public.activity_log where church_id = (select v::uuid from t.vars where k = 'church_a')),
  'Bob não vê histórico da igreja A');
update public.volunteers set nome = 'X';
delete from public.services;
reset role;
select t.ok((select nome from public.volunteers limit 1) = 'Maria Souza' and (select count(*) from public.services) = 1,
  'Bob não altera nem apaga dados da igreja A');
:como_bob
select t.erro(format($$insert into public.volunteers (church_id, nome, telefone) values (%L, 'Intruso', '5511999990000')$$,
  (select v from t.vars where k = 'church_a')), 'Bob não cria voluntário na igreja A');
select t.erro(format($$select public.create_invite(%L, 'bob2@igrejab.com', 'designer')$$,
  (select v from t.vars where k = 'church_a')), 'Bob não convida para a igreja A');
select t.erro(format($$select * from public.volunteer_contacts(%L)$$,
  (select v from t.vars where k = 'church_a')), 'Bob não vê telefones da igreja A');

-- assignment apontando para voluntário de outra igreja
reset role;
insert into public.volunteers (church_id, nome, telefone)
select id, 'Voluntário B', '5521999990009' from public.churches where slug = 'igreja-b';
insert into t.vars select 'vol_b', id::text from public.volunteers where nome = 'Voluntário B';
:como_lia
select t.erro($$select public.save_schedule(
  (select id from public.schedules limit 1),
  jsonb_build_array(jsonb_build_object(
    'service_id', (select id from public.services limit 1),
    'ministry_role_id', (select id from public.ministry_roles where nome = 'Fotos'),
    'volunteer_id', null
  ))
)$$, 'escala com dados incompletos é recusada');
select t.erro($$select public.save_schedule(
  (select id from public.schedules limit 1),
  jsonb_build_array(jsonb_build_object(
    'service_id', (select id from public.services limit 1),
    'ministry_role_id', (select id from public.ministry_roles where nome = 'Fotos'),
    'volunteer_id', (select v from t.vars where k = 'vol_b')
  ))
)$$, 'escala com voluntário de outra igreja é recusada');
select t.ok((select count(*) from public.assignments) = 1, 'escala anterior continua intacta depois das tentativas recusadas');

-- ---------------------------------------------------------------------------
-- 5. Visitante sem conta
-- ---------------------------------------------------------------------------
:como_anon
select t.erro($$select count(*) from public.volunteers$$, 'visitante não lê voluntários');
select t.erro($$select count(*) from public.churches$$, 'visitante não lê igrejas');
select t.erro($$select public.public_calendar('advicc', current_date, current_date + 30)$$, 'visitante não chama o calendário direto (só pelo servidor)');
select t.erro($$select public.public_volunteer_save('advicc', '{}'::jsonb)$$, 'visitante não salva direto (só pelo servidor)');
select t.ok((public.public_church('advicc') ->> 'nome') = 'AD Vida com Cristo', 'visitante lê os dados públicos da igreja (prévia do link)');
select t.ok(not (public.public_church('advicc') ? 'telefone'), 'dados públicos não têm telefone');

reset role;

-- 6. Endereços reservados
:como_plataforma
select t.erro($$select public.platform_create_church('Igreja App', 'app', 'x@x.com')$$, 'endereço reservado (/app) é recusado');
select t.erro($$select public.platform_create_church('Igreja Convite', 'convite', 'x@x.com')$$, 'endereço reservado (/convite) é recusado');
reset role;
