import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aleatorio,
  conferirEscala,
  cultosFaltando,
  diaDaSemana,
  eDiaDeTrabalho,
  intervalo,
  montarEscala,
  motivoIndisponivel,
  somarDias,
  textoEscalaWhatsApp,
  linkWhatsApp,
  versiculoDoPeriodo,
  type Culto,
  type Funcao,
  type Voluntario,
} from "../src/lib/escala/index.ts";

function vol(id: string, p: Partial<Voluntario> = {}): Voluntario {
  return {
    id,
    nome: id,
    frequencia: "semanal",
    escala_12x36_ref: null,
    cultos_costume: [
      { dia: 0, turno: "noite" },
      { dia: 3, turno: "noite" },
    ],
    datas_bloqueadas: [],
    datas_escolhidas: [],
    ativo: true,
    ...p,
  };
}

function culto(data: string, p: Partial<Culto> = {}): Culto {
  return { id: `${data}-${p.turno ?? "noite"}`, data, turno: "noite", nome: "Culto", tipo: "culto", pessoas_por_funcao: {}, ...p };
}

const STORIES: Funcao = { id: "stories", nome: "Stories", ordem: 1, pessoas_por_culto: 1 };
const PROJECAO: Funcao = { id: "projecao", nome: "Projeção", ordem: 2, pessoas_por_culto: 1 };

// Domingos e quartas de novembro de 2026
const NOV = intervalo("2026-11-01", "2026-11-30").filter((d) => [0, 3].includes(diaDaSemana(d)));

test("dia da semana confere com o calendário", () => {
  for (const d of intervalo("2024-01-01", "2028-12-31")) {
    assert.equal(diaDaSemana(d), new Date(`${d}T12:00:00Z`).getUTCDay(), d);
  }
  assert.equal(diaDaSemana("2026-11-01"), 0); // domingo
});

test("12x36 alterna sem erro na virada de mês de 31 dias", () => {
  const v = vol("a", { escala_12x36_ref: "2026-10-31" });
  assert.equal(eDiaDeTrabalho(v, "2026-10-31"), true);
  assert.equal(eDiaDeTrabalho(v, "2026-11-01"), false, "dia 1 é folga (pela regra de par/ímpar seria trabalho)");
  assert.equal(eDiaDeTrabalho(v, "2026-11-02"), true);
  assert.equal(eDiaDeTrabalho(v, "2026-10-30"), false, "funciona para datas antes da referência");
  assert.equal(eDiaDeTrabalho(v, "2026-10-29"), true);
  assert.equal(eDiaDeTrabalho({ ...v, frequencia: "datas" }, "2026-10-31"), false, "não vale para 'só datas'");
});

test("disponibilidade por culto", () => {
  const domingo = culto("2026-11-01");
  const segunda = culto("2026-11-02");
  assert.equal(motivoIndisponivel(vol("a"), domingo), null);
  assert.match(motivoIndisponivel(vol("a"), segunda)!, /não costuma/);
  assert.match(motivoIndisponivel(vol("a", { datas_bloqueadas: ["2026-11-01"] }), domingo)!, /não pode/);
  assert.match(motivoIndisponivel(vol("a", { ativo: false }), domingo)!, /inativo/);
  assert.match(motivoIndisponivel(vol("a", { escala_12x36_ref: "2026-10-30" }), domingo)!, /trabalho/);

  const soDatas = vol("b", { frequencia: "datas", datas_escolhidas: ["2026-11-04"] });
  assert.match(motivoIndisponivel(soDatas, domingo)!, /não escolheu/);
  assert.equal(motivoIndisponivel(soDatas, culto("2026-11-04")), null);

  // evento especial: todos que não bloquearam e não estão trabalhando
  const evento = culto("2026-11-07", { tipo: "evento", turno: "tarde" });
  assert.equal(motivoIndisponivel(vol("a"), evento), null, "sábado à tarde não é costume, mas é evento");
  assert.match(motivoIndisponivel(vol("a", { escala_12x36_ref: "2026-11-07" }), evento)!, /trabalho/);
  assert.match(motivoIndisponivel(soDatas, evento)!, /não escolheu/, "'só datas' só entra se escolheu");
});

test("ninguém é escalado duas vezes no mesmo dia nem em duas funções no mesmo culto", () => {
  const cultos = [culto("2026-11-01", { turno: "manha" }), culto("2026-11-01", { turno: "noite" })];
  const vols = ["a", "b", "c"].map((id) =>
    vol(id, { cultos_costume: [{ dia: 0, turno: "manha" }, { dia: 0, turno: "noite" }] }),
  );
  const r = montarEscala({ cultos, funcoes: [STORIES, PROJECAO], voluntarios: vols, sorteio: aleatorio(1) });
  // 4 vagas para 3 pessoas no mesmo dia: uma fica faltando
  assert.equal(r.atribuicoes.length, 3);
  assert.equal(new Set(r.atribuicoes.map((a) => a.volunteer_id)).size, 3);
  assert.equal(r.incompletos.reduce((s, i) => s + i.faltam, 0), 1);
});

test("intervalo mínimo de 7 dias para 'toda semana'", () => {
  const cultos = NOV.map((d) => culto(d));
  const vols = ["a", "b", "c", "d"].map((id) => vol(id));
  const r = montarEscala({ cultos, funcoes: [STORIES], voluntarios: vols, sorteio: aleatorio(7) });
  assert.equal(r.incompletos.length, 0);
  assert.equal(r.relaxadas.length, 0);
  const porPessoa = new Map<string, string[]>();
  for (const a of r.atribuicoes) {
    const data = cultos.find((c) => c.id === a.service_id)!.data;
    porPessoa.set(a.volunteer_id, [...(porPessoa.get(a.volunteer_id) ?? []), data]);
  }
  for (const [id, datas] of porPessoa) {
    datas.sort();
    for (let i = 1; i < datas.length; i++) {
      const dif = (Date.parse(datas[i]) - Date.parse(datas[i - 1])) / 86400000;
      assert.ok(dif >= 7, `${id}: ${datas[i - 1]} e ${datas[i]}`);
    }
  }
});

test("'de 15 em 15 dias': 14 dias de intervalo e no máximo 2 vezes no mês, mesmo faltando gente", () => {
  const cultos = NOV.map((d) => culto(d)); // 9 cultos em novembro
  const vols = [vol("q", { frequencia: "quinzenal" })];
  const r = montarEscala({ cultos, funcoes: [STORIES], voluntarios: vols, sorteio: aleatorio(3) });
  assert.equal(r.atribuicoes.length, 2, "só 2 vezes no mês");
  assert.equal(r.incompletos.length, cultos.length - 2, "os outros cultos ficam incompletos");
});

test("relaxa o intervalo quando falta gente, e marca incompleto se ainda faltar", () => {
  const cultos = [culto("2026-11-01"), culto("2026-11-04")]; // domingo e quarta (3 dias)
  const r = montarEscala({ cultos, funcoes: [STORIES], voluntarios: [vol("a")], sorteio: aleatorio(1) });
  assert.equal(r.atribuicoes.length, 2, "a única pessoa entra nos dois, com intervalo relaxado");
  assert.equal(r.relaxadas.length, 1);
  assert.equal(r.incompletos.length, 0);

  const r2 = montarEscala({
    cultos: [culto("2026-11-01", { pessoas_por_funcao: { stories: 3 } })],
    funcoes: [STORIES],
    voluntarios: [vol("a"), vol("b")],
    sorteio: aleatorio(1),
  });
  assert.deepEqual(r2.incompletos, [{ service_id: "2026-11-01-noite", ministry_role_id: "stories", faltam: 1 }]);
});

test("quem foi escalado menos vezes entra primeiro (distribuição justa)", () => {
  const cultos = intervalo("2026-11-01", "2026-12-31").filter((d) => diaDaSemana(d) === 0).map((d) => culto(d));
  const vols = ["a", "b", "c"].map((id) => vol(id));
  const r = montarEscala({ cultos, funcoes: [STORIES, PROJECAO], voluntarios: vols, sorteio: aleatorio(11) });
  const n = [...r.contagem.values()];
  assert.ok(Math.max(...n) - Math.min(...n) <= 1, `contagem desigual: ${n}`);
});

test("escalas anteriores contam para o intervalo", () => {
  const r = montarEscala({
    cultos: [culto("2026-11-01")],
    funcoes: [STORIES],
    voluntarios: [vol("a"), vol("b")],
    anteriores: [{ volunteer_id: "a", data: "2026-10-28" }],
    sorteio: aleatorio(1),
  });
  assert.equal(r.atribuicoes[0].volunteer_id, "b");
});

test("mesma semente dá a mesma escala; sementes diferentes sorteiam empates", () => {
  const entrada = { cultos: NOV.map((d) => culto(d)), funcoes: [STORIES], voluntarios: ["a", "b", "c", "d", "e"].map((id) => vol(id)) };
  const r1 = montarEscala({ ...entrada, sorteio: aleatorio(42) });
  const r2 = montarEscala({ ...entrada, sorteio: aleatorio(42) });
  assert.deepEqual(r1.atribuicoes, r2.atribuicoes);
  const primeiros = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => montarEscala({ ...entrada, sorteio: aleatorio(s) }).atribuicoes[0].volunteer_id));
  assert.ok(primeiros.size > 1, "empate deveria variar com o sorteio");
});

test("conferir escala editada pelo líder aponta indisponíveis", () => {
  const cultos = [culto("2026-11-01"), culto("2026-11-04")];
  const vols = [vol("a", { datas_bloqueadas: ["2026-11-01"] }), vol("b")];
  const avisos = conferirEscala(
    [
      { service_id: cultos[0].id, ministry_role_id: "stories", volunteer_id: "a" },
      { service_id: cultos[0].id, ministry_role_id: "projecao", volunteer_id: "b" },
      { service_id: cultos[1].id, ministry_role_id: "stories", volunteer_id: "b" },
    ],
    cultos,
    vols,
  );
  assert.equal(avisos.length, 2);
  assert.match(avisos[0].motivo, /não pode/);
  assert.match(avisos[1].motivo, /intervalo/);
});

test("cultos fixos do período sem duplicar evento no mesmo dia e turno", () => {
  const novos = cultosFaltando(
    "2026-11-01",
    "2026-11-15",
    [
      { dia: 0, turno: "noite", nome: "Culto da Família" },
      { dia: 3, turno: "noite", nome: "Culto de Ensino" },
    ],
    [{ data: "2026-11-08", turno: "noite" }],
  );
  assert.deepEqual(
    novos.map((n) => `${n.data} ${n.nome}`),
    ["2026-11-01 Culto da Família", "2026-11-04 Culto de Ensino", "2026-11-11 Culto de Ensino", "2026-11-15 Culto da Família"],
  );
});

test("mensagem do WhatsApp", () => {
  const cultos = [culto("2026-11-01", { nome: "Culto da Família" }), culto("2026-11-04", { nome: "Culto de Ensino" })];
  const texto = textoEscalaWhatsApp({
    igreja: "AD Vida com Cristo",
    inicio: "2026-11-01",
    fim: "2026-11-15",
    cultos,
    funcoes: [PROJECAO, STORIES],
    atribuicoes: [
      { service_id: cultos[0].id, ministry_role_id: "stories", volunteer_id: "m" },
      { service_id: cultos[0].id, ministry_role_id: "projecao", volunteer_id: "j" },
      { service_id: cultos[1].id, ministry_role_id: "stories", volunteer_id: "j" },
    ],
    nomes: new Map([
      ["m", "Maria"],
      ["j", "João"],
    ]),
    versiculos: [{ texto: "Tudo quanto fizerem, façam de todo o coração, como para o Senhor.", referencia: "Colossenses 3:23" }],
    linkCalendario: "https://exemplo.netlify.app/advicc",
  });
  const esperado = [
    "*Escala da Mídia · AD Vida com Cristo*",
    "01/11 a 15/11",
    "",
    "*Dom 01/11 · Noite · Culto da Família*",
    "Stories: Maria",
    "Projeção: João",
    "",
    "*Qua 04/11 · Noite · Culto de Ensino*",
    "Stories: João",
    "Projeção: — (falta 1)",
    "",
    '_"Tudo quanto fizerem, façam de todo o coração, como para o Senhor."_ — Colossenses 3:23',
    "",
    "Calendário e disponibilidade: https://exemplo.netlify.app/advicc",
  ].join("\n");
  assert.equal(texto, esperado);
  assert.ok(linkWhatsApp(texto).startsWith("https://wa.me/?text=*Escala%20da%20M%C3%ADdia"));
  assert.equal(versiculoDoPeriodo([], "2026-11-01"), null, "sem versículo cadastrado, não inventa");
});

test("somarDias atravessa meses e anos", () => {
  assert.equal(somarDias("2026-12-25", 14), "2027-01-08");
  assert.equal(somarDias("2028-02-28", 1), "2028-02-29");
});
