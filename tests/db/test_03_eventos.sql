-- Testes da fase 2: eventos, plano e tarefas (usa as igrejas e pessoas criadas no test_01).
\set QUIET 1
\pset tuples_only on
\pset format unaligned

\set como_ana 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000b1","email":"ana@igrejaa.com","role":"authenticated"}'', false); set role authenticated;'
\set como_lia 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000b2","email":"lia@igrejaa.com","role":"authenticated"}'', false); set role authenticated;'
\set como_dan 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000b3","email":"dan@igrejaa.com","role":"authenticated"}'', false); set role authenticated;'
\set como_bob 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000c1","email":"bob@igrejab.com","role":"authenticated"}'', false); set role authenticated;'
\set como_anon 'reset role; select set_config(''request.jwt.claims'', ''{"role":"anon"}'', false); set role anon;'

-- 1. Criar evento ------------------------------------------------------------------
:como_dan
select t.erro(format($$select public.save_event(%L, null, '{"nome":"Conferência","data_inicio":"2030-11-14"}')$$,
  (select v from t.vars where k = 'church_a')), 'designer não cria evento');

:como_bob
select t.erro(format($$select public.save_event(%L, null, '{"nome":"Conferência","data_inicio":"2030-11-14"}')$$,
  (select v from t.vars where k = 'church_a')), 'líder de outra igreja não cria evento na igreja A');

:como_lia
select t.erro(format($$select public.save_event(%L, null, '{"nome":"Conf","data_inicio":"2030-11-14","data_fim":"2030-11-15","dias":[{"data":"2030-11-20","turno":"noite"}]}')$$,
  (select v from t.vars where k = 'church_a')), 'dia da escala fora do período é recusado');

insert into t.vars select 'ev1', public.save_event((select v::uuid from t.vars where k = 'church_a'), null,
  '{"nome":"Conferência Avivados","modelo":"conferencia","data_inicio":"2030-11-14","data_fim":"2030-11-15",
    "dias":[{"data":"2030-11-14","turno":"tarde"},{"data":"2030-11-15","turno":"noite"},{"data":"2030-11-15","turno":"noite"}],
    "canais":["Instagram","WhatsApp"]}')::text;
select t.ok((select count(*) from public.services where event_id = (select v::uuid from t.vars where k = 'ev1')) = 2,
  'líder cria evento e os dias entram na escala (sem duplicar)');
select t.ok((select tipo::text from public.services where data = '2030-11-14' and event_id is not null) = 'evento',
  'culto do evento fica marcado como evento');

-- editar: tira um dia
select public.save_event((select v::uuid from t.vars where k = 'church_a'), (select v::uuid from t.vars where k = 'ev1'),
  '{"nome":"Conferência Avivados","data_inicio":"2030-11-14","data_fim":"2030-11-15","dias":[{"data":"2030-11-15","turno":"noite"}]}');
select t.ok((select count(*) from public.services where event_id = (select v::uuid from t.vars where k = 'ev1')) = 1,
  'dia tirado do evento sai da escala');

-- 2. Plano e tarefas ---------------------------------------------------------------
:como_dan
select t.erro(format($$select public.create_event_tasks(%L, '[{"chave":"x","titulo":"Arte"}]')$$,
  (select v from t.vars where k = 'ev1')), 'designer não cria o plano');

:como_lia
select t.ok(public.create_event_tasks((select v::uuid from t.vars where k = 'ev1'),
  '[{"chave":"arte","titulo":"Arte de divulgação","tipo":"arte","prazo":"2030-11-01","responsavel_id":"00000000-0000-0000-0000-0000000000b3"},
    {"chave":"fotos","titulo":"Fotos do evento","tipo":"fotos","prazo":"2030-11-15"}]') = 2, 'líder confirma o plano e cria 2 tarefas');
select t.ok(public.create_event_tasks((select v::uuid from t.vars where k = 'ev1'),
  '[{"chave":"arte","titulo":"Arte de divulgação"},{"chave":"stories","titulo":"Stories contagem"}]') = 1,
  'gerar de novo não duplica (só entra o item novo)');
select t.ok((select status::text from public.events where id = (select v::uuid from t.vars where k = 'ev1')) = 'divulgacao',
  'evento passa para "em divulgação"');
select t.erro($$select public.create_event_tasks((select v::uuid from t.vars where k = 'ev1'),
  '[{"chave":"z","titulo":"Arte","responsavel_id":"00000000-0000-0000-0000-0000000000c1"}]')$$,
  'responsável de fora da equipe é recusado');

-- 3. Andamento -----------------------------------------------------------------------
:como_dan
select t.ok((select count(*) from public.tasks) = 3, 'designer vê as tarefas da igreja');
select public.update_task_progress((select id from public.tasks where chave = 'arte'), 'feito', 'https://canva.com/design/abc');
select t.ok((select status::text || concluida_em::date::text from public.tasks where chave = 'arte') = 'feito' || current_date::text,
  'responsável marca como feito e coloca o link');
select t.erro($$select public.update_task_progress((select id from public.tasks where chave = 'fotos'), 'feito', null)$$,
  'quem não é responsável não mexe na tarefa');
select t.erro($$select public.update_task_progress((select id from public.tasks where chave = 'arte'), 'feito', 'javascript:alert(1)')$$,
  'link que não é https é recusado');
update public.tasks set titulo = 'mudei' where chave = 'arte';
select t.ok((select titulo from public.tasks where chave = 'arte') = 'Arte de divulgação', 'designer não edita a tarefa direto');

:como_bob
select t.ok((select count(*) from public.events) = 0 and (select count(*) from public.tasks) = 0,
  'outra igreja não vê eventos nem tarefas');

:como_anon
select t.erro($$select count(*) from public.events$$, 'visitante não lê eventos');
select t.erro($$select count(*) from public.tasks$$, 'visitante não lê tarefas');

-- 4. Apagar evento ----------------------------------------------------------------------
:como_lia
delete from public.events where id = (select v::uuid from t.vars where k = 'ev1');
select t.ok((select count(*) from public.tasks) = 0, 'apagar o evento apaga as tarefas dele');
select t.ok((select count(*) from public.services where data = '2030-11-15') = 0, 'culto do evento sem ninguém escalado sai da escala');

reset role;
