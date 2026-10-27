import { test } from "node:test";
import assert from "node:assert/strict";
import { MODELOS, domingoDoMes, gerarPlano, modeloPorId, pascoa, proximasDatas } from "../src/lib/eventos/modelos.ts";

test("Páscoa cai nas datas certas", () => {
  assert.equal(pascoa(2026), "2026-04-05");
  assert.equal(pascoa(2027), "2027-03-28");
  assert.equal(pascoa(2030), "2030-04-21");
});

test("Dia das Mães e dos Pais: 2º domingo", () => {
  assert.equal(domingoDoMes(2027, 5, 2), "2027-05-09");
  assert.equal(domingoDoMes(2026, 8, 2), "2026-08-09");
  assert.equal(domingoDoMes(2026, 11, 1), "2026-11-01"); // mês que começa no domingo
});

test("próximas datas comemorativas em ordem e sem passadas", () => {
  const d = proximasDatas("2026-10-27");
  assert.equal(d[0].nome, "Natal");
  assert.equal(d[0].data, "2026-12-25");
  assert.ok(d.every((x) => x.data >= "2026-10-27"));
  assert.ok(d.some((x) => x.nome === "Páscoa" && x.data === "2027-03-28"));
});

test("modelos têm chaves únicas e prazo antes da publicação", () => {
  for (const m of MODELOS) {
    const chaves = new Set(m.itens.map((i) => i.chave));
    assert.equal(chaves.size, m.itens.length, `chave repetida em ${m.id}`);
    for (const i of m.itens) if (i.publicar !== undefined) assert.ok(i.prazo <= i.publicar, `${m.id}/${i.chave}`);
  }
});

test("plano: datas, vencidos e responsáveis em rodízio", () => {
  const equipe = [
    { user_id: "lia", nome: "Lia", papel: "lider" as const },
    { user_id: "d1", nome: "Dan", papel: "designer" as const },
    { user_id: "d2", nome: "Duda", papel: "designer" as const },
  ];
  const plano = gerarPlano(modeloPorId("conferencia"), "2026-11-14", "2026-10-27", equipe);
  const briefing = plano.find((i) => i.chave === "briefing")!;
  assert.equal(briefing.prazo, "2026-10-15");
  assert.equal(briefing.vencido, true);
  assert.equal(briefing.responsavel_id, "lia");
  const artes = plano.filter((i) => i.tipo === "arte" || i.tipo === "post").filter((i) => i.responsavel_id?.startsWith("d"));
  assert.deepEqual(artes.slice(0, 2).map((i) => i.responsavel_id), ["d1", "d2"]);
  assert.equal(plano.find((i) => i.chave === "stories-ao-vivo")!.responsavel_id, null, "sem social media: fica sem responsável");
  assert.equal(plano.find((i) => i.chave === "e-hoje")!.publicar_em, "2026-11-14");
});

test("modelo desconhecido cai no culto especial", () => {
  assert.equal(modeloPorId("xyz").id, "culto_especial");
});
