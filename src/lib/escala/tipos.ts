import type { DataISO } from "./datas";

export type Turno = "manha" | "tarde" | "noite";
export type Frequencia = "semanal" | "quinzenal" | "datas";

export const TURNOS: Turno[] = ["manha", "tarde", "noite"];
export const NOME_TURNO: Record<Turno, string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };

export const NOME_FREQUENCIA: Record<Frequencia, string> = {
  semanal: "Toda semana",
  quinzenal: "De 15 em 15 dias",
  datas: "Só em datas que eu escolher",
};

export interface CultoFixo {
  dia: number; // 0 = domingo
  turno: Turno;
  nome: string;
}

export interface CultoCostume {
  dia: number;
  turno: Turno;
}

export interface Voluntario {
  id: string;
  nome: string;
  frequencia: Frequencia;
  /** Um dia em que a pessoa trabalhou no 12x36; null = não trabalha em 12x36. */
  escala_12x36_ref: DataISO | null;
  cultos_costume: CultoCostume[];
  datas_bloqueadas: DataISO[];
  datas_escolhidas: DataISO[];
  ativo: boolean;
}

export interface Culto {
  id: string;
  data: DataISO;
  turno: Turno;
  nome: string;
  tipo: "culto" | "evento";
  /** pessoas por função neste culto, quando diferente do padrão */
  pessoas_por_funcao: Record<string, number>;
}

export interface Funcao {
  id: string;
  nome: string;
  ordem: number;
  pessoas_por_culto: number;
}

export interface Atribuicao {
  service_id: string;
  ministry_role_id: string;
  volunteer_id: string;
}

/** Escalas já existentes (de períodos anteriores) que contam para intervalo e limite do mês. */
export interface EscalaAnterior {
  volunteer_id: string;
  data: DataISO;
}
