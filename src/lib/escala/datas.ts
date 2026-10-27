// Datas sem hora no formato "AAAA-MM-DD", calculadas sem fuso para não
// "pular" um dia por causa do horário de verão ou do UTC.

export type DataISO = string; // "2026-11-02"

const DIA_MS = 86_400_000;

export function paraDia(data: DataISO): number {
  const [a, m, d] = data.split("-").map(Number);
  if (!a || !m || !d) throw new Error(`Data inválida: ${data}`);
  return Math.floor(Date.UTC(a, m - 1, d) / DIA_MS);
}

export function deDia(dia: number): DataISO {
  return new Date(dia * DIA_MS).toISOString().slice(0, 10);
}

export function somarDias(data: DataISO, dias: number): DataISO {
  return deDia(paraDia(data) + dias);
}

/** b - a, em dias */
export function diferencaDias(a: DataISO, b: DataISO): number {
  return paraDia(b) - paraDia(a);
}

/** 0 = domingo ... 6 = sábado */
export function diaDaSemana(data: DataISO): number {
  return (paraDia(data) + 4) % 7; // 1970-01-01 foi quinta-feira
}

/** "2026-11" */
export function mesDe(data: DataISO): string {
  return data.slice(0, 7);
}

/** Lista de datas de inicio até fim (inclusive). */
export function intervalo(inicio: DataISO, fim: DataISO): DataISO[] {
  const out: DataISO[] = [];
  for (let d = paraDia(inicio); d <= paraDia(fim); d++) out.push(deDia(d));
  return out;
}

/** Data de hoje no fuso da igreja. */
export function hojeNoFuso(fuso = "America/Sao_Paulo", agora = new Date()): DataISO {
  // en-CA formata como AAAA-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const DIAS_LONGOS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** "02/11" */
export function formatarCurta(data: DataISO): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/** "Dom 02/11" */
export function formatarComDia(data: DataISO): string {
  return `${DIAS_CURTOS[diaDaSemana(data)]} ${formatarCurta(data)}`;
}
