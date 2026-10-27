import { diaDaSemana, diferencaDias, mesDe, type DataISO } from "./datas";
import type { Culto, Frequencia, Voluntario } from "./tipos";

/**
 * 12x36: a pessoa informa um dia em que trabalhou e o sistema alterna
 * a partir dele (trabalha, folga, trabalha...), sem erro na virada do mês.
 */
export function eDiaDeTrabalho(v: Pick<Voluntario, "escala_12x36_ref" | "frequencia">, data: DataISO): boolean {
  if (!v.escala_12x36_ref || v.frequencia === "datas") return false;
  const dif = diferencaDias(v.escala_12x36_ref, data);
  return ((dif % 2) + 2) % 2 === 0;
}

/** Por que a pessoa não está disponível neste culto (null = disponível). */
export function motivoIndisponivel(v: Voluntario, culto: Culto): string | null {
  if (!v.ativo) return "cadastro inativo";
  if (v.datas_bloqueadas.includes(culto.data)) return "marcou que não pode nesta data";

  if (v.frequencia === "datas") {
    return v.datas_escolhidas.includes(culto.data) ? null : "não escolheu esta data";
  }

  if (eDiaDeTrabalho(v, culto.data)) return "dia de trabalho (12x36)";

  // Em eventos especiais entram todos que não bloquearam a data e não estão trabalhando.
  if (culto.tipo === "evento") return null;

  const dia = diaDaSemana(culto.data);
  const costuma = v.cultos_costume.some((c) => c.dia === dia && c.turno === culto.turno);
  return costuma ? null : "não costuma servir neste culto";
}

export function estaDisponivel(v: Voluntario, culto: Culto): boolean {
  return motivoIndisponivel(v, culto) === null;
}

/** Intervalo mínimo entre duas escalas da mesma pessoa. */
export function intervaloMinimo(f: Frequencia): number {
  return f === "quinzenal" ? 14 : 7;
}

/** "De 15 em 15 dias" promete no máximo 2 vezes no mês. */
export function limiteNoMes(f: Frequencia): number | null {
  return f === "quinzenal" ? 2 : null;
}

export interface Agenda {
  /** datas em que cada voluntário já está escalado (inclui escalas anteriores) */
  datasPorVoluntario: Map<string, DataISO[]>;
}

export function novaAgenda(): Agenda {
  return { datasPorVoluntario: new Map() };
}

export function registrar(agenda: Agenda, volunteerId: string, data: DataISO): void {
  const lista = agenda.datasPorVoluntario.get(volunteerId) ?? [];
  lista.push(data);
  agenda.datasPorVoluntario.set(volunteerId, lista);
}

export interface RegrasDeRitmo {
  /** respeitar o intervalo mínimo entre escalas */
  intervalo: boolean;
}

/** Por que a pessoa não pode ser escalada de novo nesta data (null = pode). */
export function motivoRitmo(
  v: Voluntario,
  data: DataISO,
  agenda: Agenda,
  regras: RegrasDeRitmo = { intervalo: true },
): string | null {
  const datas = agenda.datasPorVoluntario.get(v.id) ?? [];
  if (datas.includes(data)) return "já está escalado neste dia";

  const limite = limiteNoMes(v.frequencia);
  if (limite !== null) {
    const noMes = datas.filter((d) => mesDe(d) === mesDe(data)).length;
    if (noMes >= limite) return `já tem ${limite} escalas neste mês`;
  }

  if (regras.intervalo) {
    const minimo = intervaloMinimo(v.frequencia);
    const perto = datas.some((d) => Math.abs(diferencaDias(d, data)) < minimo);
    if (perto) return `intervalo menor que ${minimo} dias desde a última escala`;
  }
  return null;
}
