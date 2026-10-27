// Leitura e gravação das escalas, usando as regras de src/lib/escala.
import { eq, inserir, listar, rpc } from "../../lib/api";
import {
  aleatorio,
  cultosFaltando,
  montarEscala,
  somarDias,
  type Atribuicao,
  type Culto,
  type EscalaAnterior,
  type Funcao,
  type Voluntario,
} from "../../lib/escala";
import { COLUNAS_VOLUNTARIO, type AtribuicaoDb, type CultoDb, type EscalaDb, type FuncaoDb, type Igreja, type VoluntarioDb } from "../../lib/tipos";

export interface DadosEscala {
  escala: EscalaDb;
  cultos: Culto[];
  funcoes: Funcao[];
  voluntarios: (Voluntario & { observacao: string | null })[];
  atribuicoes: Atribuicao[];
  anteriores: EscalaAnterior[];
}

const COLUNAS_CULTO = "id,church_id,data,turno,nome,tipo,pessoas_por_funcao";

export async function carregarDados(escalaId: string): Promise<DadosEscala> {
  const [escala] = await listar<EscalaDb>("schedules", { select: "id,church_id,inicio,fim,status,enviada_em", id: eq(escalaId) });
  if (!escala) throw new Error("Escala não encontrada");
  const church = eq(escala.church_id);

  const [cultosDb, funcoes, vols, atrib] = await Promise.all([
    listar<CultoDb>("services", { select: COLUNAS_CULTO, church_id: church, data: `gte.${somarDias(escala.inicio, -31)}`, order: "data.asc" }),
    listar<FuncaoDb>("ministry_roles", { select: "id,church_id,nome,ordem,pessoas_por_culto", church_id: church, order: "ordem.asc,nome.asc" }),
    listar<VoluntarioDb>("volunteers", { select: COLUNAS_VOLUNTARIO, church_id: church, order: "nome.asc" }),
    listar<AtribuicaoDb>("assignments", { select: "id,schedule_id,service_id,ministry_role_id,volunteer_id", church_id: church }),
  ]);

  const noPeriodo = cultosDb.filter((c) => c.data >= escala.inicio && c.data <= escala.fim);
  const dataDoCulto = new Map(cultosDb.map((c) => [c.id, c.data]));
  const anteriores: EscalaAnterior[] = atrib
    .filter((a) => a.schedule_id !== escala.id && dataDoCulto.has(a.service_id))
    .map((a) => ({ volunteer_id: a.volunteer_id, data: dataDoCulto.get(a.service_id)! }));

  return {
    escala,
    cultos: noPeriodo.map((c) => ({ ...c, pessoas_por_funcao: c.pessoas_por_funcao ?? {} })),
    funcoes,
    voluntarios: vols.map((v) => ({ ...v, cultos_costume: v.cultos_costume ?? [], datas_bloqueadas: v.datas_bloqueadas ?? [], datas_escolhidas: v.datas_escolhidas ?? [] })),
    atribuicoes: atrib
      .filter((a) => a.schedule_id === escala.id)
      .map(({ service_id, ministry_role_id, volunteer_id }) => ({ service_id, ministry_role_id, volunteer_id })),
    anteriores,
  };
}

export function montar(d: DadosEscala): ReturnType<typeof montarEscala> {
  return montarEscala({
    cultos: d.cultos,
    funcoes: d.funcoes,
    voluntarios: d.voluntarios,
    anteriores: d.anteriores,
    sorteio: aleatorio(Date.now() % 100000),
  });
}

export async function salvar(escalaId: string, atribuicoes: Atribuicao[]): Promise<void> {
  await rpc("save_schedule", { p_schedule: escalaId, p_assignments: atribuicoes });
}

/** Cria a escala do período, os cultos fixos que faltam e já monta automaticamente. */
export async function criarEscala(igreja: Igreja, inicio: string, fim: string, usuarioId: string): Promise<string> {
  const existentes = await listar<{ data: string; turno: CultoDb["turno"] }>("services", {
    select: "data,turno",
    church_id: eq(igreja.id),
    data: `gte.${inicio}`,
  });
  const novos = cultosFaltando(inicio, fim, igreja.cultos_fixos ?? [], existentes.filter((e) => e.data <= fim));
  if (novos.length) await inserir("services", novos.map((n) => ({ ...n, church_id: igreja.id })));

  const [escala] = await inserir<{ id: string }>("schedules", { church_id: igreja.id, inicio, fim, criada_por: usuarioId });
  const dados = await carregarDados(escala.id);
  await salvar(escala.id, montar(dados).atribuicoes);
  return escala.id;
}

export async function ultimaEscala(churchId: string): Promise<EscalaDb | null> {
  const [e] = await listar<EscalaDb>("schedules", { select: "id,church_id,inicio,fim,status,enviada_em", church_id: eq(churchId), order: "fim.desc", limit: "1" });
  return e ?? null;
}
