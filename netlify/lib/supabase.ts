// Acesso ao Supabase pelas funções do servidor, só com fetch (sem dependências).
// A chave service role fica APENAS aqui, nunca no navegador.

export class ErroApi extends Error {
  constructor(public status: number, message: string, public codigo?: string) {
    super(message);
  }
}

function env(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new ErroApi(500, `Variável de ambiente ${nome} não configurada`);
  return v;
}

export function supabaseUrl(): string {
  return env("SUPABASE_URL").replace(/\/$/, "");
}

function chaveServidor(): string {
  return env("SUPABASE_SERVICE_ROLE_KEY");
}

async function lerErro(r: Response): Promise<ErroApi> {
  let corpo: { message?: string; msg?: string; error_description?: string; code?: string } = {};
  try {
    corpo = await r.json();
  } catch {
    /* sem corpo */
  }
  const msg = corpo.message ?? corpo.msg ?? corpo.error_description ?? `Erro ${r.status}`;
  return new ErroApi(r.status, msg, corpo.code);
}

/** Chama uma função do banco (RPC) como service role. */
export async function rpc<T = unknown>(funcao: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${supabaseUrl()}/rest/v1/rpc/${funcao}`, {
    method: "POST",
    headers: {
      apikey: chaveServidor(),
      Authorization: `Bearer ${chaveServidor()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw await lerErro(r);
  const texto = await r.text();
  return (texto ? JSON.parse(texto) : null) as T;
}

/** Cria uma conta já confirmada (usado no aceite de convite). */
export async function criarUsuario(email: string, senha: string, nome: string): Promise<{ id: string }> {
  const r = await fetch(`${supabaseUrl()}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: chaveServidor(),
      Authorization: `Bearer ${chaveServidor()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome } }),
  });
  if (!r.ok) throw await lerErro(r);
  const corpo = await r.json();
  return { id: corpo.id ?? corpo.user?.id };
}

export async function apagarUsuario(id: string): Promise<void> {
  await fetch(`${supabaseUrl()}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { apikey: chaveServidor(), Authorization: `Bearer ${chaveServidor()}` },
  });
}

export function json(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function erro(e: unknown): Response {
  if (e instanceof ErroApi) {
    const status = e.status >= 400 && e.status < 500 ? e.status : 500;
    const msg = status === 500 ? "Erro no servidor. Tente de novo em instantes." : e.message;
    if (status === 500) console.error(e);
    return json({ erro: msg }, status);
  }
  console.error(e);
  return json({ erro: "Erro no servidor. Tente de novo em instantes." }, 500);
}

/** Lê o corpo JSON com limite de tamanho. */
export async function lerJson<T>(req: Request, limiteBytes = 16_000): Promise<T> {
  const texto = await req.text();
  if (texto.length > limiteBytes) throw new ErroApi(413, "Dados grandes demais");
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new ErroApi(400, "Dados inválidos");
  }
}

/** Proteção contra robôs (Cloudflare Turnstile). Só é exigida se TURNSTILE_SECRET_KEY estiver configurada. */
export async function conferirRobo(token: string | undefined, ip: string | undefined): Promise<void> {
  const segredo = process.env.TURNSTILE_SECRET_KEY;
  if (!segredo) return;
  if (!token) throw new ErroApi(400, "Confirme que você não é um robô");
  const form = new URLSearchParams({ secret: segredo, response: token });
  if (ip) form.set("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const corpo = (await r.json()) as { success?: boolean };
  if (!corpo.success) throw new ErroApi(400, "Não foi possível confirmar que você não é um robô. Tente de novo.");
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const TOKEN_RE = /^[a-f0-9]{32,128}$/;
