// Modelos de campanha: cada um vira um plano revisável (tarefas com prazo).
// Os prazos são em dias contados a partir do primeiro dia do evento (negativo = antes).
import { diaDaSemana, diferencaDias, somarDias, type DataISO } from "../escala/datas";
import type { Papel } from "../tipos";

export type TipoTarefa = "arte" | "video" | "stories" | "post" | "aviso" | "fotos" | "cobertura" | "texto" | "outro";

export const NOME_TIPO: Record<TipoTarefa, string> = {
  arte: "Arte",
  video: "Vídeo",
  stories: "Stories",
  post: "Post",
  aviso: "Aviso",
  fotos: "Fotos",
  cobertura: "Cobertura",
  texto: "Texto",
  outro: "Outro",
};

export const ETAPAS = ["Planejamento", "Divulgação", "No dia", "Depois"] as const;
export type Etapa = (typeof ETAPAS)[number];

export interface ItemModelo {
  chave: string;
  titulo: string;
  etapa: Etapa;
  tipo: TipoTarefa;
  /** prazo de produção, em dias a partir do 1º dia do evento */
  prazo: number;
  /** quando publicar (se for publicação), em dias a partir do 1º dia do evento */
  publicar?: number;
  /** quem costuma fazer; o plano já sugere alguém da equipe com esse papel */
  papel: Papel;
  descricao?: string;
}

export interface Modelo {
  id: string;
  nome: string;
  resumo: string;
  /** dias de antecedência ideais para começar */
  antecedencia: number;
  itens: ItemModelo[];
}

const ORIENTACAO_FOTOS =
  "Chegue antes, confira bateria e memória e combine com a liderança onde pode fotografar. " +
  "Não registre pessoas em situação constrangedora, aconselhamentos ou crianças sem seguir a orientação da igreja. " +
  "Entregue as melhores (até 20), em ordem: chegada → culto → comunhão. Cole o link da pasta.";

export const MODELOS: Modelo[] = [
  {
    id: "conferencia",
    nome: "Conferência / evento grande",
    resumo: "Divulgação de 4 semanas, cobertura nos dias e retrospectiva.",
    antecedencia: 30,
    itens: [
      { chave: "briefing", titulo: "Definir tema, versículo, convidados e identidade", etapa: "Planejamento", tipo: "outro", prazo: -30, papel: "lider" },
      { chave: "identidade", titulo: "Identidade visual do evento (key visual)", etapa: "Planejamento", tipo: "arte", prazo: -26, papel: "designer" },
      { chave: "anuncio", titulo: "Post de anúncio: “vem aí”", etapa: "Divulgação", tipo: "post", prazo: -23, publicar: -21, papel: "designer" },
      { chave: "aviso-1", titulo: "Aviso no culto (slide + texto para o pastor)", etapa: "Divulgação", tipo: "aviso", prazo: -15, publicar: -14, papel: "lider" },
      { chave: "convidados", titulo: "Posts dos convidados", etapa: "Divulgação", tipo: "post", prazo: -12, publicar: -10, papel: "designer", descricao: "Só publique convidados confirmados." },
      { chave: "video-convite", titulo: "Vídeo convite (pastor ou convidado)", etapa: "Divulgação", tipo: "video", prazo: -10, publicar: -7, papel: "audiovisual" },
      { chave: "programacao", titulo: "Post com a programação completa", etapa: "Divulgação", tipo: "post", prazo: -8, publicar: -6, papel: "designer" },
      { chave: "whatsapp", titulo: "Texto + arte para os grupos de WhatsApp", etapa: "Divulgação", tipo: "texto", prazo: -6, publicar: -5, papel: "social_media" },
      { chave: "contagem", titulo: "Stories de contagem regressiva (5 dias)", etapa: "Divulgação", tipo: "stories", prazo: -6, publicar: -5, papel: "social_media" },
      { chave: "aviso-2", titulo: "Último aviso no culto", etapa: "Divulgação", tipo: "aviso", prazo: -4, publicar: -3, papel: "lider" },
      { chave: "e-hoje", titulo: "Post “É hoje”", etapa: "No dia", tipo: "post", prazo: -1, publicar: 0, papel: "designer" },
      { chave: "stories-ao-vivo", titulo: "Stories ao vivo durante o evento", etapa: "No dia", tipo: "stories", prazo: 0, publicar: 0, papel: "social_media" },
      { chave: "fotos", titulo: "Fotos do evento", etapa: "No dia", tipo: "fotos", prazo: 0, papel: "audiovisual", descricao: ORIENTACAO_FOTOS },
      { chave: "video-cobertura", titulo: "Captação para o vídeo de cobertura", etapa: "No dia", tipo: "cobertura", prazo: 0, papel: "audiovisual" },
      { chave: "album", titulo: "Álbum / carrossel de fotos", etapa: "Depois", tipo: "post", prazo: 2, publicar: 2, papel: "social_media" },
      { chave: "video-resumo", titulo: "Vídeo resumo (até 60s)", etapa: "Depois", tipo: "video", prazo: 5, publicar: 5, papel: "audiovisual" },
      { chave: "agradecimento", titulo: "Post de agradecimento", etapa: "Depois", tipo: "post", prazo: 3, publicar: 3, papel: "designer" },
      { chave: "avaliacao", titulo: "Reunião rápida: o que funcionou e o que mudar", etapa: "Depois", tipo: "outro", prazo: 7, papel: "lider" },
    ],
  },
  {
    id: "culto_especial",
    nome: "Culto especial",
    resumo: "Santa Ceia, Dia das Mães, aniversário da igreja: divulgação curta e fotos.",
    antecedencia: 10,
    itens: [
      { chave: "arte", titulo: "Arte de divulgação", etapa: "Divulgação", tipo: "arte", prazo: -9, papel: "designer" },
      { chave: "post", titulo: "Post de divulgação", etapa: "Divulgação", tipo: "post", prazo: -8, publicar: -7, papel: "social_media" },
      { chave: "aviso", titulo: "Aviso no culto anterior", etapa: "Divulgação", tipo: "aviso", prazo: -8, publicar: -7, papel: "lider" },
      { chave: "stories", titulo: "Stories de lembrete na véspera", etapa: "Divulgação", tipo: "stories", prazo: -2, publicar: -1, papel: "social_media" },
      { chave: "fotos", titulo: "Fotos do culto", etapa: "No dia", tipo: "fotos", prazo: 0, papel: "audiovisual", descricao: ORIENTACAO_FOTOS },
      { chave: "carrossel", titulo: "Carrossel com as fotos", etapa: "Depois", tipo: "post", prazo: 2, publicar: 2, papel: "social_media" },
    ],
  },
  {
    id: "batismo",
    nome: "Batismo (cobertura completa)",
    resumo: "Uma igreja, uma história: quem não esteve lá entende onde foi, quem estava e como terminou.",
    antecedencia: 14,
    itens: [
      { chave: "lista", titulo: "Lista de batizandos e autorização de imagem", etapa: "Planejamento", tipo: "outro", prazo: -10, papel: "lider" },
      { chave: "arte", titulo: "Arte de divulgação do batismo", etapa: "Divulgação", tipo: "arte", prazo: -8, papel: "designer" },
      { chave: "post", titulo: "Post convidando a igreja", etapa: "Divulgação", tipo: "post", prazo: -7, publicar: -6, papel: "social_media" },
      { chave: "depoimentos", titulo: "Depoimentos curtos dos batizandos (antes)", etapa: "Divulgação", tipo: "video", prazo: -3, papel: "audiovisual" },
      { chave: "fotos", titulo: "Fotos: chegada, batismo de cada pessoa, abraço da família", etapa: "No dia", tipo: "fotos", prazo: 0, papel: "audiovisual", descricao: ORIENTACAO_FOTOS },
      { chave: "video", titulo: "Captação de vídeo do batismo", etapa: "No dia", tipo: "cobertura", prazo: 0, papel: "audiovisual" },
      { chave: "carrossel", titulo: "Carrossel com os batizados", etapa: "Depois", tipo: "post", prazo: 2, publicar: 2, papel: "social_media" },
      { chave: "video-resumo", titulo: "Vídeo: uma igreja, uma história", etapa: "Depois", tipo: "video", prazo: 5, publicar: 6, papel: "audiovisual" },
    ],
  },
  {
    id: "natal",
    nome: "Natal",
    resumo: "Cantata ou culto de Natal: campanha de 3 semanas e cobertura.",
    antecedencia: 21,
    itens: [
      { chave: "tema", titulo: "Definir tema e identidade do Natal", etapa: "Planejamento", tipo: "outro", prazo: -24, papel: "lider" },
      { chave: "identidade", titulo: "Identidade visual do Natal", etapa: "Planejamento", tipo: "arte", prazo: -21, papel: "designer" },
      { chave: "convite", titulo: "Post convite para a programação", etapa: "Divulgação", tipo: "post", prazo: -16, publicar: -14, papel: "designer" },
      { chave: "convide", titulo: "Arte “Convide alguém” para a igreja compartilhar", etapa: "Divulgação", tipo: "arte", prazo: -12, publicar: -10, papel: "designer" },
      { chave: "aviso", titulo: "Aviso nos cultos", etapa: "Divulgação", tipo: "aviso", prazo: -8, publicar: -7, papel: "lider" },
      { chave: "video-convite", titulo: "Vídeo convite", etapa: "Divulgação", tipo: "video", prazo: -8, publicar: -6, papel: "audiovisual" },
      { chave: "contagem", titulo: "Stories de contagem regressiva", etapa: "Divulgação", tipo: "stories", prazo: -4, publicar: -3, papel: "social_media" },
      { chave: "fotos", titulo: "Fotos da programação", etapa: "No dia", tipo: "fotos", prazo: 0, papel: "audiovisual", descricao: ORIENTACAO_FOTOS },
      { chave: "feliz-natal", titulo: "Post “Feliz Natal” da igreja", etapa: "Depois", tipo: "post", prazo: 0, publicar: 0, papel: "designer" },
      { chave: "video-resumo", titulo: "Vídeo resumo do Natal", etapa: "Depois", tipo: "video", prazo: 4, publicar: 4, papel: "audiovisual" },
    ],
  },
  {
    id: "pascoa",
    nome: "Páscoa",
    resumo: "Culto de Páscoa (e Santa Ceia): campanha de 2 semanas.",
    antecedencia: 14,
    itens: [
      { chave: "identidade", titulo: "Identidade visual da Páscoa", etapa: "Planejamento", tipo: "arte", prazo: -14, papel: "designer" },
      { chave: "convite", titulo: "Post convite para o culto de Páscoa", etapa: "Divulgação", tipo: "post", prazo: -9, publicar: -7, papel: "designer" },
      { chave: "aviso", titulo: "Aviso no culto anterior", etapa: "Divulgação", tipo: "aviso", prazo: -8, publicar: -7, papel: "lider" },
      { chave: "semana-santa", titulo: "Stories da semana: um versículo por dia", etapa: "Divulgação", tipo: "stories", prazo: -7, publicar: -6, papel: "social_media" },
      { chave: "fotos", titulo: "Fotos do culto", etapa: "No dia", tipo: "fotos", prazo: 0, papel: "audiovisual", descricao: ORIENTACAO_FOTOS },
      { chave: "ressuscitou", titulo: "Post “Ele ressuscitou”", etapa: "No dia", tipo: "post", prazo: -1, publicar: 0, papel: "designer" },
      { chave: "carrossel", titulo: "Carrossel com as fotos", etapa: "Depois", tipo: "post", prazo: 2, publicar: 2, papel: "social_media" },
    ],
  },
];

export function modeloPorId(id: string): Modelo {
  return MODELOS.find((m) => m.id === id) ?? MODELOS[1];
}

// ---------------------------------------------------------------------------
// Datas comemorativas (sugestão; o líder confirma ou ajusta)
// ---------------------------------------------------------------------------

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): DataISO {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** n-ésimo domingo do mês (mes 1-12). */
export function domingoDoMes(ano: number, mes: number, n: number): DataISO {
  const primeiro = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ate = (7 - diaDaSemana(primeiro)) % 7;
  return somarDias(primeiro, ate + 7 * (n - 1));
}

export interface DataComemorativa {
  nome: string;
  modelo: string;
  data: DataISO;
}

/** Próximas datas comemorativas a partir de hoje (até ~1 ano). */
export function proximasDatas(hoje: DataISO): DataComemorativa[] {
  const ano = Number(hoje.slice(0, 4));
  const lista: DataComemorativa[] = [];
  for (const a of [ano, ano + 1]) {
    lista.push(
      { nome: "Páscoa", modelo: "pascoa", data: pascoa(a) },
      { nome: "Dia das Mães", modelo: "culto_especial", data: domingoDoMes(a, 5, 2) },
      { nome: "Dia dos Pais", modelo: "culto_especial", data: domingoDoMes(a, 8, 2) },
      { nome: "Natal", modelo: "natal", data: `${a}-12-25` },
    );
  }
  return lista
    .filter((d) => d.data >= hoje && diferencaDias(hoje, d.data) <= 366)
    .sort((x, y) => x.data.localeCompare(y.data));
}

// ---------------------------------------------------------------------------
// Plano: itens do modelo com datas reais
// ---------------------------------------------------------------------------

export interface MembroEquipe {
  user_id: string;
  nome: string;
  papel: Papel;
}

export interface ItemPlano {
  chave: string;
  titulo: string;
  etapa: Etapa;
  tipo: TipoTarefa;
  prazo: DataISO;
  publicar_em: DataISO | null;
  responsavel_id: string | null;
  descricao: string | null;
  ordem: number;
  /** prazo já passou quando o plano foi gerado */
  vencido: boolean;
}

/**
 * Gera o plano do evento. Quem tem o papel do item é sugerido como responsável,
 * revezando entre as pessoas do mesmo papel para não sobrecarregar ninguém.
 */
export function gerarPlano(modelo: Modelo, inicio: DataISO, hoje: DataISO, equipe: MembroEquipe[]): ItemPlano[] {
  const fila = new Map<Papel, number>();
  const porPapel = (p: Papel) => {
    const pessoas = equipe.filter((m) => m.papel === p);
    const lideres = equipe.filter((m) => m.papel === "lider" || m.papel === "admin");
    const lista = pessoas.length ? pessoas : p === "lider" ? lideres : [];
    if (!lista.length) return null;
    const i = fila.get(p) ?? 0;
    fila.set(p, i + 1);
    return lista[i % lista.length].user_id;
  };
  return modelo.itens.map((it, ordem) => {
    const prazo = somarDias(inicio, it.prazo);
    return {
      chave: it.chave,
      titulo: it.titulo,
      etapa: it.etapa,
      tipo: it.tipo,
      prazo,
      publicar_em: it.publicar === undefined ? null : somarDias(inicio, it.publicar),
      responsavel_id: porPapel(it.papel),
      descricao: it.descricao ?? null,
      ordem,
      vencido: prazo < hoje,
    };
  });
}
