// Acesso ao Supabase direto pela API REST (sem bibliotecas extras).
// Só usa a chave pública (anon); as permissões valem no banco (RLS).

const URL_SB = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const CHAVE_SESSAO = "sessao-equipe";

export const configurado = Boolean(URL_SB && ANON);

export class ErroApi extends Error {
  constructor(message: string, public status = 0, public codigo?: string) {
    super(message);
  }
}

export interface Sessao {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email: string; user_metadata?: Record<string, unknown> };
}

// ---------------------------------------------------------------- sessão
let sessao: Sessao | null = lerSessao();
const ouvintes = new Set<(s: Sessao | null) => void>();

function lerSessao(): Sessao | null {
  try {
    const t = localStorage.getItem(CHAVE_SESSAO);
    return t ? (JSON.parse(t) as Sessao) : null;
  } catch {
    return null;
  }
}

function gravarSessao(s: Sessao | null) {
  sessao = s;
  try {
    if (s) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
    else localStorage.removeItem(CHAVE_SESSAO);
  } catch {
    /* navegador sem armazenamento: a sessão vale só nesta aba */
  }
  ouvintes.forEach((f) => f(s));
}

export function sessaoAtual(): Sessao | null {
  return sessao;
}

export function aoMudarSessao(f: (s: Sessao | null) => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

// ---------------------------------------------------------------- erros
const TRADUCOES: [RegExp, string][] = [
  [/invalid login credentials/i, "E-mail ou senha incorretos."],
  [/row-level security|permission denied/i, "Você não tem permissão para fazer isso."],
  [/duplicate key value.*churches_slug/i, "Já existe uma igreja com esse endereço."],
  [/duplicate key value.*assignments_service_id_volunteer_id/i, "A mesma pessoa não pode estar em duas funções no mesmo culto."],
  [/duplicate key value.*services_church_id_data_turno/i, "Já existe um culto nesse dia e turno."],
  [/duplicate key value.*volunteers_church_id_telefone/i, "Já existe um voluntário com esse WhatsApp."],
  [/duplicate key value.*ministry_roles_church_id_nome/i, "Já existe uma função com esse nome."],
  [/duplicate key value/i, "Esse registro já existe."],
  [/JWT expired|invalid JWT/i, "Sua sessão expirou. Entre de novo."],
  [/violates check constraint.*slug/i, "Endereço inválido: use letras minúsculas, números e hífen."],
  [/violates check constraint.*telefone/i, "WhatsApp inválido."],
  [/violates check constraint/i, "Algum dado está fora do formato esperado."],
];

export function mensagemAmigavel(msg: string): string {
  for (const [re, txt] of TRADUCOES) if (re.test(msg)) return txt;
  return msg;
}

async function lerErro(r: Response): Promise<ErroApi> {
  let corpo: { message?: string; msg?: string; error_description?: string; erro?: string; code?: string } = {};
  try {
    corpo = await r.json();
  } catch {
    /* sem corpo */
  }
  const msg = corpo.erro ?? corpo.message ?? corpo.error_description ?? corpo.msg ?? `Erro ${r.status}`;
  return new ErroApi(mensagemAmigavel(msg), r.status, corpo.code);
}

async function chamar(caminho: string, init: RequestInit = {}, comSessao = true): Promise<Response> {
  if (comSessao && sessao && sessao.expires_at - Date.now() / 1000 < 60) await renovar();
  const headers = new Headers(init.headers);
  headers.set("apikey", ANON);
  headers.set("Authorization", `Bearer ${comSessao && sessao ? sessao.access_token : ANON}`);
  let r: Response;
  try {
    r = await fetch(`${URL_SB}${caminho}`, { ...init, headers });
  } catch {
    throw new ErroApi("Sem conexão. Confira a internet e tente de novo.");
  }
  if (r.status === 401 && comSessao && sessao) {
    gravarSessao(null);
    throw new ErroApi("Sua sessão expirou. Entre de novo.", 401);
  }
  if (!r.ok) throw await lerErro(r);
  return r;
}

// ---------------------------------------------------------------- login
export async function entrar(email: string, senha: string): Promise<Sessao> {
  const r = await chamar(
    "/auth/v1/token?grant_type=password",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password: senha }) },
    false,
  );
  const s = (await r.json()) as Sessao;
  gravarSessao(s);
  return s;
}

let renovando: Promise<void> | null = null;
async function renovar(): Promise<void> {
  if (!sessao) return;
  if (!renovando) {
    const atual = sessao;
    renovando = (async () => {
      try {
        const r = await fetch(`${URL_SB}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { apikey: ANON, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: atual.refresh_token }),
        });
        gravarSessao(r.ok ? ((await r.json()) as Sessao) : null);
      } catch {
        /* sem rede: tenta com o token atual */
      } finally {
        renovando = null;
      }
    })();
  }
  await renovando;
}

export async function sair(): Promise<void> {
  try {
    await chamar("/auth/v1/logout", { method: "POST" });
  } catch {
    /* sai mesmo assim */
  }
  gravarSessao(null);
}

export async function esqueciSenha(email: string): Promise<void> {
  await chamar(
    `/auth/v1/recover?redirect_to=${encodeURIComponent(`${location.origin}/app`)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) },
    false,
  );
}

/** Link do e-mail de "esqueci a senha": #access_token=…&refresh_token=…&type=recovery */
export function linkDeRecuperacao(): boolean {
  return /[#&]type=recovery/.test(location.hash) && /access_token=/.test(location.hash);
}

export async function entrarPeloLink(): Promise<void> {
  const p = new URLSearchParams(location.hash.slice(1));
  const access = p.get("access_token") ?? "";
  const refresh = p.get("refresh_token") ?? "";
  const expira = Number(p.get("expires_in") ?? "3600");
  history.replaceState(null, "", location.pathname);
  let r: Response;
  try {
    r = await fetch(`${URL_SB}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${access}` } });
  } catch {
    throw new ErroApi("Sem conexão. Confira a internet e tente de novo.");
  }
  if (!r.ok) throw new ErroApi("Este link expirou. Peça um novo em “Esqueci a senha”.", r.status);
  const user = (await r.json()) as Sessao["user"];
  gravarSessao({ access_token: access, refresh_token: refresh, expires_at: Math.floor(Date.now() / 1000) + expira, user });
}

export async function trocarSenha(nova: string): Promise<void> {
  await chamar("/auth/v1/user", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: nova }),
  });
}

// ---------------------------------------------------------------- banco (REST)
type Filtros = Record<string, string>;

function qs(params: Filtros): string {
  const p = new URLSearchParams(params);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const eq = (v: string | number | boolean) => `eq.${v}`;
export const emLista = (vs: string[]) => `in.(${vs.map((v) => `"${v}"`).join(",")})`;

export async function listar<T>(tabela: string, params: Filtros): Promise<T[]> {
  const r = await chamar(`/rest/v1/${tabela}${qs(params)}`);
  return (await r.json()) as T[];
}

export async function inserir<T>(tabela: string, dados: object | object[], select = "id"): Promise<T[]> {
  const r = await chamar(`/rest/v1/${tabela}${qs({ select })}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(dados),
  });
  return (await r.json()) as T[];
}

export async function atualizar<T>(tabela: string, filtros: Filtros, dados: object, select = "id"): Promise<T[]> {
  const r = await chamar(`/rest/v1/${tabela}${qs({ ...filtros, select })}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(dados),
  });
  const linhas = (await r.json()) as T[];
  if (linhas.length === 0) throw new ErroApi("Nada foi alterado. Você tem permissão para isso?", 403);
  return linhas;
}

export async function apagar(tabela: string, filtros: Filtros): Promise<number> {
  const r = await chamar(`/rest/v1/${tabela}${qs({ ...filtros, select: "id" })}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  const linhas = (await r.json()) as unknown[];
  if (linhas.length === 0) throw new ErroApi("Nada foi apagado. Você tem permissão para isso?", 403);
  return linhas.length;
}

export async function rpc<T>(funcao: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await chamar(`/rest/v1/rpc/${funcao}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const texto = await r.text();
  return (texto ? JSON.parse(texto) : null) as T;
}

// ---------------------------------------------------------------- logo da igreja
export async function enviarLogo(churchId: string, arquivo: File): Promise<string> {
  const ext = arquivo.type === "image/png" ? "png" : arquivo.type === "image/webp" ? "webp" : "jpg";
  const nome = `logo-${Date.now()}.${ext}`;
  await chamar(`/storage/v1/object/logos/${churchId}/${nome}`, {
    method: "POST",
    headers: { "Content-Type": arquivo.type, "x-upsert": "true" },
    body: arquivo,
  });
  return `${churchId}/${nome}`;
}

export function urlLogo(logoPath: string | null | undefined): string | null {
  if (!logoPath) return null;
  return `${URL_SB}/storage/v1/object/public/logos/${logoPath.split("/").map(encodeURIComponent).join("/")}`;
}

// ---------------------------------------------------------------- funções do servidor (/api)
export async function api<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(caminho, init);
  } catch {
    throw new ErroApi("Sem conexão. Confira a internet e tente de novo.");
  }
  if (r.status === 429) throw new ErroApi("Muitas tentativas seguidas. Espere um minuto e tente de novo.", 429);
  if (!r.ok) throw await lerErro(r);
  return (await r.json()) as T;
}
