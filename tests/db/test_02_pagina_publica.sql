-- Testes da página pública (chamada pelo servidor com service role).
-- Usa os dados criados em test_01.

\set QUIET 1
\pset tuples_only on
\pset format unaligned

\set como_servidor 'reset role; select set_config(''request.jwt.claims'', ''{"role":"service_role"}'', false); set role service_role;'
\set como_lia 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000b2","email":"lia@igrejaa.com","role":"authenticated"}'', false); set role authenticated;'

:como_servidor

-- 1. Cadastro novo ---------------------------------------------------------------
insert into t.vars select 'r1', public.public_volunteer_save('advicc', jsonb_build_object(
  'nome', '  João   da Silva ',
  'telefone', '(32) 99999-1234',
  'frequencia', 'quinzenal',
  'escala_12x36_ref', (current_date - 1)::text,
  'cultos_costume', '[{"dia":0,"turno":"noite"}]'::jsonb,
  'datas_bloqueadas', jsonb_build_array((current_date + 10)::text, (current_date + 10)::text),
  'observacao', 'Prefiro stories'
))::text;

select t.ok(((select v from t.vars where k = 'r1')::jsonb ->> 'ok')::boolean, 'cadastro novo salva');
select t.ok(length((select v from t.vars where k = 'r1')::jsonb ->> 'device_token') >= 32, 'cadastro novo recebe código do aparelho');
insert into t.vars select 'tokJoao', (select v from t.vars where k = 'r1')::jsonb ->> 'device_token';
select t.ok((select telefone from public.volunteers where nome = 'João da Silva') = '5532999991234',
  'telefone normalizado com 55 e nome sem espaços extras');
select t.ok((select cardinality(datas_bloqueadas) from public.volunteers where nome = 'João da Silva') = 1,
  'datas repetidas viram uma só');
select t.ok(not ((select v from t.vars where k = 'r1')::jsonb -> 'voluntario' ? 'telefone'), 'resposta não devolve telefone');

-- 2. Buscar pelo WhatsApp ---------------------------------------------------------
select t.ok((public.public_volunteer_lookup('advicc', '32999991234') ->> 'precisa_confirmar_nome')::boolean,
  'sem código do aparelho: não mostra os dados, pede o nome');
select t.ok(not (public.public_volunteer_lookup('advicc', '32999991234') ? 'voluntario'),
  'sem código do aparelho: nenhum dado do cadastro vaza');
select t.ok((public.public_volunteer_lookup('advicc', '32999991234', (select v from t.vars where k = 'tokJoao')) -> 'voluntario' ->> 'nome') = 'João da Silva',
  'com o código do aparelho: carrega o cadastro');
select t.ok((public.public_volunteer_lookup('advicc', '11900000000') ->> 'encontrado')::boolean = false, 'número novo: não encontrado');
select t.ok((public.public_volunteer_lookup('igreja-b', '32999991234') ->> 'encontrado')::boolean = false,
  'mesmo número em outra igreja: não encontrado');

-- 3. Outro aparelho ----------------------------------------------------------------
select t.ok((public.public_volunteer_save('advicc', jsonb_build_object(
  'nome', 'Invasor', 'telefone', '32999991234', 'frequencia', 'semanal')) ->> 'erro') = 'precisa_confirmar_nome',
  'outro aparelho sem confirmar o nome: não altera');
select t.ok((public.public_volunteer_save('advicc', jsonb_build_object(
  'nome', 'Invasor', 'telefone', '32999991234', 'frequencia', 'semanal'), null, 'Fulano') ->> 'erro') = 'precisa_confirmar_nome',
  'outro aparelho com nome errado: não altera');
select t.ok((select nome from public.volunteers where telefone = '5532999991234') = 'João da Silva', 'cadastro intacto');

insert into t.vars select 'r2', public.public_volunteer_save('advicc', jsonb_build_object(
  'nome', 'João da Silva', 'telefone', '32999991234', 'frequencia', 'semanal',
  'cultos_costume', '[{"dia":0,"turno":"noite"},{"dia":3,"turno":"noite"}]'::jsonb), null, 'joao  DA silva')::text;
select t.ok(((select v from t.vars where k = 'r2')::jsonb ->> 'ok')::boolean, 'outro aparelho com nome certo (sem acento/maiúsculas): altera');
select t.ok(((select v from t.vars where k = 'r2')::jsonb ->> 'device_token') is not null
  and ((select v from t.vars where k = 'r2')::jsonb ->> 'device_token') <> (select v from t.vars where k = 'tokJoao'),
  'outro aparelho recebe código novo');
reset role;
select t.ok(exists (select 1 from public.activity_log where tabela = 'volunteers' and origem = 'link_publico_outro_aparelho'),
  'alteração de outro aparelho fica no histórico para o líder');
:como_servidor
select t.ok((public.public_volunteer_lookup('advicc', '32999991234', (select v from t.vars where k = 'tokJoao')) ->> 'precisa_confirmar_nome')::boolean,
  'código antigo deixa de valer');

-- 4. Validações --------------------------------------------------------------------
select t.ok((public.public_volunteer_save('advicc', '{"nome":"A","telefone":"32999990000","frequencia":"semanal"}') ->> 'erro') = 'nome_invalido', 'nome curto demais');
select t.ok((public.public_volunteer_save('advicc', '{"nome":"Ana","telefone":"123","frequencia":"semanal"}') ->> 'erro') = 'telefone_invalido', 'telefone inválido');
select t.ok((public.public_volunteer_save('advicc', '{"nome":"Ana","telefone":"32999990000","frequencia":"sempre"}') ->> 'erro') = 'dados_invalidos', 'frequência inválida');
select t.ok((public.public_volunteer_save('advicc', '{"nome":"Ana","telefone":"32999990000","frequencia":"semanal","cultos_costume":[{"dia":9,"turno":"noite"}]}') ->> 'erro') = 'cultos_invalidos', 'culto com dia inválido');
select t.ok((public.public_volunteer_save('advicc', '{"nome":"Ana","telefone":"32999990000","frequencia":"semanal","datas_bloqueadas":["ontem"]}') ->> 'erro') = 'dados_invalidos', 'data inválida');
select t.ok((public.public_volunteer_save('advicc', jsonb_build_object('nome','Ana','telefone','32999990000','frequencia','datas','escala_12x36_ref', current_date::text)) -> 'voluntario' ->> 'escala_12x36_ref') is null,
  '12x36 é ignorado para quem escolhe "só datas"');

-- 5. Calendário público ---------------------------------------------------------
reset role;
-- culto onde Maria está escalada (escala ainda em rascunho) e João será escalado
insert into public.services (church_id, data, turno, nome, tipo)
select id, current_date + 5, 'noite', 'Conferência', 'evento' from public.churches where slug = 'advicc';
insert into public.schedules (church_id, inicio, fim, status)
select id, current_date, current_date + 14, 'rascunho' from public.churches where slug = 'advicc';
insert into public.assignments (church_id, schedule_id, service_id, ministry_role_id, volunteer_id)
select c.id, sc.id, s.id, r.id, v.id
from public.churches c
join public.schedules sc on sc.church_id = c.id and sc.inicio = current_date
join public.services s on s.church_id = c.id and s.data = current_date + 5
join public.ministry_roles r on r.church_id = c.id and r.nome = 'Stories'
join public.volunteers v on v.church_id = c.id and v.nome = 'João da Silva'
where c.slug = 'advicc';
insert into t.vars select 'tokJoao2', (select v from t.vars where k = 'r2')::jsonb ->> 'device_token';

:como_servidor
select t.ok(jsonb_array_length(public.public_calendar('advicc', current_date, current_date + 30) -> 'cultos') = 1,
  'calendário mostra os cultos do período');
select t.ok(jsonb_array_length(public.public_calendar('advicc', current_date, current_date + 30) -> 'cultos' -> 0 -> 'escalados') = 0,
  'escala em rascunho não aparece para o público');

reset role;
update public.schedules set status = 'enviada', enviada_em = now() where inicio = current_date;
:como_servidor
select t.ok((public.public_calendar('advicc', current_date, current_date + 30) -> 'cultos' -> 0 -> 'escalados' -> 0 ->> 'funcao') = 'Stories',
  'escala enviada aparece com função e nomes');
select t.ok(public.public_calendar('advicc', current_date, current_date + 30)::text not like '%5532%',
  'calendário público não contém telefones');
select t.ok((public.public_calendar('advicc', current_date, current_date + 30, (select v from t.vars where k = 'tokJoao2')) -> 'cultos' -> 0 ->> 'eu_escalado')::boolean,
  'com o código do aparelho, o dia aparece como "estou escalado"');
select t.ok((public.public_calendar('advicc', current_date, current_date + 30) -> 'cultos' -> 0 ->> 'eu_escalado')::boolean = false,
  'sem código, ninguém aparece como "eu"');
select t.erro($$select public.public_calendar('advicc', current_date, current_date + 400)$$, 'período longo demais é recusado');
select t.ok(public.public_calendar('nao-existe', current_date, current_date + 30) is null, 'igreja inexistente devolve vazio');

-- 6. Botão "Não posso" ------------------------------------------------------------
select t.ok((public.public_volunteer_nao_posso('advicc', 'codigo-falso-codigo-falso-codigo-falso', current_date + 5) ->> 'erro') = 'identifique_se',
  '"Não posso" exige o código do aparelho');
select t.ok((public.public_volunteer_nao_posso('advicc', (select v from t.vars where k = 'tokJoao2'), current_date + 5) ->> 'estava_escalado')::boolean,
  '"Não posso" avisa que a pessoa estava escalada');
select t.ok((select (current_date + 5) = any (datas_bloqueadas) from public.volunteers where nome = 'João da Silva'),
  '"Não posso" bloqueia a data');
select t.ok((public.public_volunteer_nao_posso('advicc', (select v from t.vars where k = 'tokJoao2'), current_date - 1) ->> 'erro') = 'data_passada',
  '"Não posso" não aceita data passada');

reset role;
