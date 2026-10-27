import { diaDaSemana, intervalo, type DataISO } from "./datas";
import type { CultoFixo, Turno } from "./tipos";

export interface NovoCulto {
  data: DataISO;
  turno: Turno;
  nome: string;
  tipo: "culto";
}

/**
 * Cultos fixos da igreja que ainda não existem no período.
 * Um culto já cadastrado no mesmo dia e turno (por exemplo, um evento) não é duplicado.
 */
export function cultosFaltando(
  inicio: DataISO,
  fim: DataISO,
  cultosFixos: CultoFixo[],
  existentes: { data: DataISO; turno: Turno }[],
): NovoCulto[] {
  const ja = new Set(existentes.map((e) => `${e.data}|${e.turno}`));
  const novos: NovoCulto[] = [];
  for (const data of intervalo(inicio, fim)) {
    const dia = diaDaSemana(data);
    for (const fixo of cultosFixos) {
      if (fixo.dia !== dia) continue;
      const chave = `${data}|${fixo.turno}`;
      if (ja.has(chave)) continue;
      ja.add(chave);
      novos.push({ data, turno: fixo.turno, nome: fixo.nome, tipo: "culto" });
    }
  }
  return novos;
}
