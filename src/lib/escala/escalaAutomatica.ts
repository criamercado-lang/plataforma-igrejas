import { paraDia } from "./datas";
import {
  estaDisponivel,
  motivoIndisponivel,
  motivoRitmo,
  novaAgenda,
  registrar,
  type Agenda,
} from "./disponibilidade";
import type { Atribuicao, Culto, EscalaAnterior, Funcao, Turno, Voluntario } from "./tipos";

const ORDEM_TURNO: Record<Turno, number> = { manha: 0, tarde: 1, noite: 2 };

export function ordenarCultos(cultos: Culto[]): Culto[] {
  return [...cultos].sort(
    (a, b) => paraDia(a.data) - paraDia(b.data) || ORDEM_TURNO[a.turno] - ORDEM_TURNO[b.turno],
  );
}

export function pessoasNecessarias(culto: Culto, funcao: Funcao): number {
  const n = culto.pessoas_por_funcao?.[funcao.id];
  return typeof n === "number" && n >= 0 ? n : funcao.pessoas_por_culto;
}

/** Gerador de números aleatórios com semente (para sorteio de empate reproduzível nos testes). */
export function aleatorio(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Incompleto {
  service_id: string;
  ministry_role_id: string;
  faltam: number;
}

export interface ResultadoEscala {
  atribuicoes: Atribuicao[];
  incompletos: Incompleto[];
  /** quantas vezes cada pessoa ficou escalada no período */
  contagem: Map<string, number>;
  /** atribuições feitas relaxando o intervalo mínimo */
  relaxadas: Atribuicao[];
}

export interface EntradaEscala {
  cultos: Culto[];
  funcoes: Funcao[];
  voluntarios: Voluntario[];
  /** escalas de períodos anteriores (contam para intervalo e limite do mês) */
  anteriores?: EscalaAnterior[];
  sorteio?: () => number;
}

/**
 * Escala automática (regras do módulo da ADVICC):
 * 1. percorre os cultos em ordem de data e, para cada função, escolhe a quantidade definida;
 * 2. só entra quem está disponível;
 * 3. intervalo mínimo: 7 dias (toda semana / só datas) ou 14 dias (de 15 em 15), e no máximo 2 no mês para "de 15 em 15";
 * 4. nunca a mesma pessoa duas vezes no mesmo dia, nem em duas funções no mesmo culto;
 * 5. quem foi escalado menos vezes entra primeiro; empate é sorteado;
 * 6. se faltar gente, relaxa o intervalo; se ainda faltar, o culto fica incompleto.
 */
export function montarEscala(entrada: EntradaEscala): ResultadoEscala {
  const sorteio = entrada.sorteio ?? Math.random;
  const funcoes = [...entrada.funcoes].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  const voluntarios = entrada.voluntarios.filter((v) => v.ativo);

  const agenda: Agenda = novaAgenda();
  for (const e of entrada.anteriores ?? []) registrar(agenda, e.volunteer_id, e.data);

  const contagem = new Map<string, number>(voluntarios.map((v) => [v.id, 0]));
  const atribuicoes: Atribuicao[] = [];
  const relaxadas: Atribuicao[] = [];
  const incompletos: Incompleto[] = [];

  for (const culto of ordenarCultos(entrada.cultos)) {
    const noCulto = new Set<string>();

    for (const funcao of funcoes) {
      const precisa = pessoasNecessarias(culto, funcao);
      let escolhidos = 0;

      for (const intervalo of [true, false]) {
        if (escolhidos >= precisa) break;

        const candidatos = voluntarios
          .filter((v) => !noCulto.has(v.id))
          .filter((v) => estaDisponivel(v, culto))
          .filter((v) => motivoRitmo(v, culto.data, agenda, { intervalo }) === null)
          .map((v) => ({ v, sorte: sorteio() }))
          .sort((a, b) => (contagem.get(a.v.id) ?? 0) - (contagem.get(b.v.id) ?? 0) || a.sorte - b.sorte);

        for (const { v } of candidatos) {
          if (escolhidos >= precisa) break;
          const a: Atribuicao = { service_id: culto.id, ministry_role_id: funcao.id, volunteer_id: v.id };
          atribuicoes.push(a);
          if (!intervalo) relaxadas.push(a);
          noCulto.add(v.id);
          registrar(agenda, v.id, culto.data);
          contagem.set(v.id, (contagem.get(v.id) ?? 0) + 1);
          escolhidos++;
        }
      }

      if (escolhidos < precisa) {
        incompletos.push({ service_id: culto.id, ministry_role_id: funcao.id, faltam: precisa - escolhidos });
      }
    }
  }

  return { atribuicoes, incompletos, contagem, relaxadas };
}

export interface Aviso {
  atribuicao: Atribuicao;
  motivo: string;
}

/**
 * Confere uma escala editada à mão pelo líder: quem está indisponível
 * ou fora do ritmo aparece com aviso (o líder pode manter mesmo assim).
 */
export function conferirEscala(
  atribuicoes: Atribuicao[],
  cultos: Culto[],
  voluntarios: Voluntario[],
  anteriores: EscalaAnterior[] = [],
): Aviso[] {
  const porCulto = new Map(cultos.map((c) => [c.id, c]));
  const porVol = new Map(voluntarios.map((v) => [v.id, v]));
  const avisos: Aviso[] = [];

  const agenda = novaAgenda();
  for (const e of anteriores) registrar(agenda, e.volunteer_id, e.data);

  const ordenadas = [...atribuicoes].sort((a, b) => {
    const ca = porCulto.get(a.service_id);
    const cb = porCulto.get(b.service_id);
    if (!ca || !cb) return 0;
    return paraDia(ca.data) - paraDia(cb.data) || ORDEM_TURNO[ca.turno] - ORDEM_TURNO[cb.turno];
  });

  for (const a of ordenadas) {
    const culto = porCulto.get(a.service_id);
    const v = porVol.get(a.volunteer_id);
    if (!culto || !v) continue;
    const motivo = motivoIndisponivel(v, culto) ?? motivoRitmo(v, culto.data, agenda);
    if (motivo) avisos.push({ atribuicao: a, motivo });
    registrar(agenda, v.id, culto.data);
  }
  return avisos;
}
