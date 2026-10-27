import { formatarComDia, formatarCurta, paraDia, type DataISO } from "./datas";
import { ordenarCultos, pessoasNecessarias, type Incompleto } from "./escalaAutomatica";
import { NOME_TURNO, type Atribuicao, type Culto, type Funcao } from "./tipos";

export interface Versiculo {
  texto: string;
  referencia: string;
}

/** Versículo do período: sempre o mesmo para a mesma escala, variando entre escalas. */
export function versiculoDoPeriodo(versiculos: Versiculo[], inicio: DataISO): Versiculo | null {
  const validos = versiculos.filter((v) => v.texto?.trim() && v.referencia?.trim());
  if (validos.length === 0) return null;
  return validos[Math.abs(paraDia(inicio)) % validos.length];
}

export interface DadosMensagem {
  igreja: string;
  inicio: DataISO;
  fim: DataISO;
  cultos: Culto[];
  funcoes: Funcao[];
  atribuicoes: Atribuicao[];
  nomes: Map<string, string>; // volunteer_id -> nome
  versiculos: Versiculo[];
  linkCalendario: string;
}

/** Texto formatado para o grupo do WhatsApp (negrito com *, itálico com _). Sem emojis. */
export function textoEscalaWhatsApp(d: DadosMensagem): string {
  const funcoes = [...d.funcoes].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  const linhas: string[] = [];

  linhas.push(`*Escala da Mídia · ${d.igreja}*`);
  linhas.push(`${formatarCurta(d.inicio)} a ${formatarCurta(d.fim)}`);

  for (const culto of ordenarCultos(d.cultos)) {
    linhas.push("");
    linhas.push(`*${formatarComDia(culto.data)} · ${NOME_TURNO[culto.turno]} · ${culto.nome}*`);
    for (const f of funcoes) {
      const precisa = pessoasNecessarias(culto, f);
      const nomes = d.atribuicoes
        .filter((a) => a.service_id === culto.id && a.ministry_role_id === f.id)
        .map((a) => d.nomes.get(a.volunteer_id) ?? "?")
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
      if (precisa === 0 && nomes.length === 0) continue;
      const falta = precisa - nomes.length;
      const sufixo = falta > 0 ? ` (falta${falta > 1 ? "m" : ""} ${falta})` : "";
      linhas.push(`${f.nome}: ${nomes.length ? nomes.join(", ") : "—"}${sufixo}`);
    }
  }

  const v = versiculoDoPeriodo(d.versiculos, d.inicio);
  if (v) {
    linhas.push("");
    linhas.push(`_"${v.texto.trim()}"_ — ${v.referencia.trim()}`);
  }

  linhas.push("");
  linhas.push(`Calendário e disponibilidade: ${d.linkCalendario}`);
  return linhas.join("\n");
}

/** Abre o WhatsApp com a mensagem pronta para escolher o grupo. */
export function linkWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

export function resumoIncompletos(incompletos: Incompleto[]): number {
  return incompletos.reduce((s, i) => s + i.faltam, 0);
}
