import type { CultoCostume, CultoFixo, Frequencia, Turno } from "./escala";
import type { Versiculo } from "./escala";

export type Papel = "admin" | "lider" | "aprovador" | "designer" | "social_media" | "audiovisual";

export const NOME_PAPEL: Record<Papel, string> = {
  admin: "Admin geral",
  lider: "Líder de comunicação",
  aprovador: "Pastor / aprovador",
  designer: "Designer",
  social_media: "Social media",
  audiovisual: "Audiovisual",
};

export interface Igreja {
  id: string;
  nome: string;
  slug: string;
  logo_path: string | null;
  cor_principal: string;
  fuso_horario: string;
  cultos_fixos: CultoFixo[];
  versiculos: Versiculo[];
}

export interface VoluntarioDb {
  id: string;
  church_id: string;
  nome: string;
  user_id: string | null;
  frequencia: Frequencia;
  escala_12x36_ref: string | null;
  cultos_costume: CultoCostume[];
  datas_bloqueadas: string[];
  datas_escolhidas: string[];
  observacao: string | null;
  ativo: boolean;
  disponibilidade_atualizada_em: string | null;
}

/** Colunas de volunteers que a equipe pode ler (telefone fica de fora). */
export const COLUNAS_VOLUNTARIO =
  "id,church_id,nome,user_id,frequencia,escala_12x36_ref,cultos_costume,datas_bloqueadas,datas_escolhidas,observacao,ativo,disponibilidade_atualizada_em";

export interface FuncaoDb {
  id: string;
  church_id: string;
  nome: string;
  ordem: number;
  pessoas_por_culto: number;
}

export interface CultoDb {
  id: string;
  church_id: string;
  data: string;
  turno: Turno;
  nome: string;
  tipo: "culto" | "evento";
  pessoas_por_funcao: Record<string, number>;
}

export interface EscalaDb {
  id: string;
  church_id: string;
  inicio: string;
  fim: string;
  status: "rascunho" | "enviada";
  enviada_em: string | null;
}

export interface AtribuicaoDb {
  id: string;
  schedule_id: string;
  service_id: string;
  ministry_role_id: string;
  volunteer_id: string;
}

// ---------------------------------------------------------------------------
// Fase 2 · Eventos e tarefas
// ---------------------------------------------------------------------------
export type StatusEvento = "planejamento" | "divulgacao" | "realizado" | "cancelado";
export type StatusTarefa = "a_fazer" | "fazendo" | "feito";

export const NOME_STATUS_EVENTO: Record<StatusEvento, string> = {
  planejamento: "Planejando",
  divulgacao: "Em divulgação",
  realizado: "Realizado",
  cancelado: "Cancelado",
};
export const NOME_STATUS_TAREFA: Record<StatusTarefa, string> = {
  a_fazer: "A fazer",
  fazendo: "Fazendo",
  feito: "Feito",
};

export interface EventoDb {
  id: string;
  church_id: string;
  nome: string;
  modelo: string;
  data_inicio: string;
  data_fim: string;
  dias: { data: string; turno: Turno }[];
  horario: string | null;
  local: string | null;
  tema: string | null;
  versiculo: string | null;
  convidados: string | null;
  objetivo: string | null;
  canais: string[];
  status: StatusEvento;
}
export const COLUNAS_EVENTO =
  "id,church_id,nome,modelo,data_inicio,data_fim,dias,horario,local,tema,versiculo,convidados,objetivo,canais,status";

export interface TarefaDb {
  id: string;
  church_id: string;
  event_id: string | null;
  chave: string | null;
  titulo: string;
  etapa: string;
  tipo: string;
  descricao: string | null;
  responsavel_id: string | null;
  prazo: string | null;
  publicar_em: string | null;
  status: StatusTarefa;
  link: string | null;
  ordem: number;
  concluida_em: string | null;
}
export const COLUNAS_TAREFA =
  "id,church_id,event_id,chave,titulo,etapa,tipo,descricao,responsavel_id,prazo,publicar_em,status,link,ordem,concluida_em";
