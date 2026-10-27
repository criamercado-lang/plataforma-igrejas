// Servidor de teste local: imita o essencial do Supabase (Auth, REST/PostgREST e
// Storage) em cima de um Postgres comum, com as mesmas regras de segurança (RLS),
// roda as funções do Netlify e serve o app compilado.
// Só para teste. Não vai para produção.
//
// Uso: PGHOST=/tmp PGPORT=54329 PGUSER=postgres tsx tests/e2e/servidor.ts <pasta-do-build> <banco>
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const PORTA = Number(process.env.PORTA ?? 8787);
const PASTA = process.argv[2];
const BANCO = process.argv[3] ?? "plataforma_e2e";
const BASE = `http://localhost:${PORTA}`;
export const ANON = "anon-teste";
export const SERVICO = "service-teste";

process.env.SUPABASE_URL = `${BASE}/sb`;
process.env.SUPABASE_ANON_KEY = ANON;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICO;

// ------------------------------------------------------------------ SQL
class ErroSql extends Error {
  constructor(msg: string, public codigo: string) {
    super(msg);
  }
}

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function ident(s: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new ErroSql(`identificador inválido: ${s}`, "PGRST");
  return `"${s}"`;
}

type Papel = { role: "anon" | "authenticated" | "service_role"; claims: Record<string, unknown> };

function sql(papel: Papel | null, consulta: string): string {
  const script = [
    "begin;",
    papel ? `set local "request.jwt.claims" = ${lit(JSON.stringify(papel.claims))};` : "",
    papel ? `set local role ${papel.role};` : "",
    consulta.trim().replace(/;?$/, ";"),
    "commit;",
  ].join("\n");
  try {
    return execFileSync("psql", ["-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-d", BANCO], {
      input: script,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    const err = String((e as { stderr?: string }).stderr ?? e);
    const m = /ERROR:\s+(.*)/.exec(err);
    const msg = m ? m[1] : err;
    const codigo = /permission denied|row-level security|Sem permissão|Só |não tem permissão/i.test(msg) ? "42501" : "P0001";
    throw new ErroSql(msg, codigo);
  }
}

/** Operações internas do "Supabase" (Auth), fora das regras de RLS. */
function sqlServico(consulta: string): string {
  return sql(null, consulta);
}

// ------------------------------------------------------------------ usuários (Auth)
const senhas = new Map<string, string>(); // email -> senha

function criarConta(email: string, senha: string, nome: string, plataforma = false): string {
  const id = sqlServico(
    `insert into auth.users (email, raw_user_meta_data) values (${lit(email.toLowerCase())}, ${lit({ nome })}) returning id`,
  );
  senhas.set(email.toLowerCase(), senha);
  if (plataforma) sqlServico(`insert into public.platform_admins (user_id) values (${lit(id)})`);
  return id;
}

function usuarioPorId(id: string): { id: string; email: string } | null {
  const linha = sqlServico(`select json_build_object('id', id, 'email', email) from auth.users where id = ${lit(id)}`);
  return linha ? JSON.parse(linha) : null;
}

function sessaoPara(u: { id: string; email: string }) {
  return {
    access_token: `tok.${u.id}`,
    refresh_token: `ref.${u.id}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: u.id, email: u.email, user_metadata: {} },
  };
}

function papelDaRequisicao(req: IncomingMessage): Papel {
  const auth = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (auth === SERVICO) return { role: "service_role", claims: { role: "service_role" } };
  if (auth.startsWith("tok.")) {
    const u = usuarioPorId(auth.slice(4));
    if (u) return { role: "authenticated", claims: { sub: u.id, email: u.email, role: "authenticated" } };
  }
  return { role: "anon", claims: { role: "anon" } };
}

// ------------------------------------------------------------------ REST (subconjunto do PostgREST)
function condicoes(params: URLSearchParams, prefixo = ""): string {
  const partes: string[] = [];
  for (const [chave, valor] of params) {
    if (["select", "order", "limit"].includes(chave)) continue;
    const col = (prefixo ? prefixo + "." : "") + ident(chave);
    const [op, ...resto] = valor.split(".");
    const v = resto.join(".");
    const ops: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
    if (op in ops) partes.push(`${col} ${ops[op]} ${lit(v)}`);
    else if (op === "not" && v === "is.null") partes.push(`${col} is not null`);
    else if (op === "is") partes.push(`${col} is ${v === "null" ? "null" : v === "true" ? "true" : "false"}`);
    else if (op === "in") {
      const itens = v.replace(/^\(|\)$/g, "").split(",").filter(Boolean).map((x) => lit(x.replace(/^"|"$/g, "")));
      partes.push(itens.length ? `${col} in (${itens.join(",")})` : "false");
    } else throw new ErroSql(`filtro não suportado: ${valor}`, "PGRST");
  }
  return partes.length ? `where ${partes.join(" and ")}` : "";
}

function colunas(select: string | null): string {
  if (!select || select === "*") return "*";
  return select.split(",").map((c) => ident(c.trim())).join(", ");
}

function ordem(order: string | null): string {
  if (!order) return "";
  return "order by " + order.split(",").map((p) => {
    const [c, dir, nulos] = p.split(".");
    return `${ident(c)} ${dir === "desc" ? "desc" : "asc"}${nulos === "nullslast" ? " nulls last" : nulos === "nullsfirst" ? " nulls first" : ""}`;
  }).join(", ");
}

const funcoesConjunto = new Set<string>();

async function rest(req: IncomingMessage, caminho: string, corpo: string): Promise<[number, unknown]> {
  const url = new URL(caminho, BASE);
  const papel = papelDaRequisicao(req);
  const p = url.searchParams;
  const m = /^\/sb\/rest\/v1\/(rpc\/)?([a-z_]+)$/.exec(url.pathname);
  if (!m) return [404, { message: "rota" }];
  const nome = m[2];

  if (m[1]) {
    const args = corpo ? (JSON.parse(corpo) as Record<string, unknown>) : {};
    const lista = Object.entries(args).map(([k, v]) => `${ident(k)} => ${lit(v)}`).join(", ");
    const chamada = `public.${ident(nome)}(${lista})`;
    const saida = funcoesConjunto.has(nome)
      ? sql(papel, `select coalesce(json_agg(t), '[]'::json) from ${chamada} t`)
      : sql(papel, `select to_json(${chamada})`);
    return [200, saida ? JSON.parse(saida) : null];
  }

  const tabela = `public.${ident(nome)}`;
  const sel = colunas(p.get("select"));
  if (req.method === "GET") {
    const limite = p.get("limit") ? `limit ${Number(p.get("limit"))}` : "";
    const saida = sql(papel, `select coalesce(json_agg(t), '[]'::json) from (select ${sel} from ${tabela} ${condicoes(p)} ${ordem(p.get("order"))} ${limite}) t`);
    return [200, JSON.parse(saida)];
  }
  if (req.method === "POST") {
    const dados = JSON.parse(corpo);
    const linhas = Array.isArray(dados) ? dados : [dados];
    if (linhas.length === 0) return [201, []];
    const cols = Object.keys(linhas[0]).map(ident).join(", ");
    const saida = sql(papel, `with r as (insert into ${tabela} (${cols}) select ${cols} from json_populate_recordset(null::${tabela}, ${lit(linhas)}) returning ${sel}) select coalesce(json_agg(r), '[]'::json) from r`);
    return [201, JSON.parse(saida)];
  }
  if (req.method === "PATCH") {
    const dados = JSON.parse(corpo) as Record<string, unknown>;
    const sets = Object.keys(dados).map((k) => `${ident(k)} = j.${ident(k)}`).join(", ");
    const ret = sel === "*" ? "t.*" : sel.split(", ").map((c) => `t.${c}`).join(", ");
    const saida = sql(papel, `with r as (update ${tabela} t set ${sets} from json_populate_record(null::${tabela}, ${lit(dados)}) j ${condicoes(p, "t")} returning ${ret}) select coalesce(json_agg(r), '[]'::json) from r`);
    return [200, JSON.parse(saida)];
  }
  if (req.method === "DELETE") {
    const saida = sql(papel, `with r as (delete from ${tabela} ${condicoes(p)} returning ${sel}) select coalesce(json_agg(r), '[]'::json) from r`);
    return [200, JSON.parse(saida)];
  }
  return [405, { message: "método" }];
}

// ------------------------------------------------------------------ Auth
async function auth(req: IncomingMessage, caminho: string, corpo: string): Promise<[number, unknown]> {
  const url = new URL(caminho, BASE);
  const b = corpo ? JSON.parse(corpo) : {};
  if (url.pathname === "/sb/auth/v1/token") {
    const tipo = url.searchParams.get("grant_type");
    if (tipo === "password") {
      const email = String(b.email ?? "").toLowerCase();
      if (senhas.get(email) !== b.password) return [400, { error_description: "Invalid login credentials" }];
      const id = sqlServico(`select id from auth.users where email = ${lit(email)}`);
      return [200, sessaoPara({ id, email })];
    }
    if (tipo === "refresh_token") {
      const u = usuarioPorId(String(b.refresh_token ?? "").slice(4));
      return u ? [200, sessaoPara(u)] : [400, { error_description: "invalid refresh token" }];
    }
  }
  if (url.pathname === "/sb/auth/v1/logout") return [204, null];
  if (url.pathname === "/sb/auth/v1/user") {
    const papel = papelDaRequisicao(req);
    if (papel.role !== "authenticated") return [401, { msg: "token inválido" }];
    const u = { id: String(papel.claims.sub), email: String(papel.claims.email) };
    if (req.method === "PUT") {
      if (String(b.password ?? "").length < 6) return [422, { msg: "Password should be at least 6 characters" }];
      senhas.set(u.email.toLowerCase(), b.password);
    }
    return [200, u];
  }
  if (url.pathname === "/sb/auth/v1/recover") return [200, {}];
  if (url.pathname === "/sb/auth/v1/admin/users" && req.method === "POST") {
    if (papelDaRequisicao(req).role !== "service_role") return [401, { msg: "não autorizado" }];
    if (senhas.has(String(b.email).toLowerCase())) return [422, { msg: "User already registered" }];
    const id = criarConta(b.email, b.password, b.user_metadata?.nome ?? "");
    return [200, { id, email: b.email }];
  }
  const del = /^\/sb\/auth\/v1\/admin\/users\/(.+)$/.exec(url.pathname);
  if (del && req.method === "DELETE") {
    sqlServico(`delete from auth.users where id = ${lit(del[1])}`);
    return [200, {}];
  }
  return [404, { msg: "rota de auth" }];
}

// ------------------------------------------------------------------ funções do Netlify
type Funcao = (req: Request, ctx: { params?: Record<string, string>; ip?: string }) => Promise<Response>;
const funcoes: { re: RegExp; nomes: string[]; arquivo: string; mod?: Funcao }[] = [
  { re: /^\/api\/publico\/([^/]+)$/, nomes: ["slug"], arquivo: "publico-leitura" },
  { re: /^\/api\/publico\/([^/]+)\/([^/]+)$/, nomes: ["slug", "acao"], arquivo: "publico-escrita" },
  { re: /^\/api\/convite\/aceitar$/, nomes: [], arquivo: "convite" },
];

async function funcaoNetlify(req: IncomingMessage, caminho: string, corpo: string): Promise<Response | null> {
  const url = new URL(caminho, BASE);
  for (const f of funcoes) {
    const m = f.re.exec(url.pathname);
    if (!m) continue;
    if (!f.mod) f.mod = (await import(join(process.cwd(), "netlify/functions", `${f.arquivo}.ts`))).default as Funcao;
    const params = Object.fromEntries(f.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const pedido = new Request(url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method ?? "") ? undefined : corpo });
    return f.mod(pedido, { params, ip: "127.0.0.1" });
  }
  return null;
}

// ------------------------------------------------------------------ servidor
const TIPOS: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((ok) => {
    const partes: Buffer[] = [];
    req.on("data", (c) => partes.push(c));
    req.on("end", () => ok(Buffer.concat(partes).toString("utf8")));
  });
}

function responder(res: ServerResponse, status: number, dados: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(status === 204 ? "" : JSON.stringify(dados));
}

export function iniciar(): Promise<void> {
  for (const n of sqlServico(`select string_agg(proname, ',') from pg_proc where pronamespace = 'public'::regnamespace and proretset`).split(",")) {
    if (n) funcoesConjunto.add(n);
  }
  criarConta("plataforma@teste.com", "senha-plataforma", "Plataforma", true);

  const servidor = createServer(async (req, res) => {
    const caminho = req.url ?? "/";
    const corpo = await lerCorpo(req);
    try {
      if (caminho.startsWith("/sb/rest/")) {
        const [s, d] = await rest(req, caminho, corpo);
        return responder(res, s, d);
      }
      if (caminho.startsWith("/sb/auth/")) {
        const [s, d] = await auth(req, caminho, corpo);
        return responder(res, s, d);
      }
      if (caminho.startsWith("/sb/storage/")) return responder(res, 200, { Key: caminho });
      if (caminho.startsWith("/api/")) {
        const r = await funcaoNetlify(req, caminho, corpo);
        if (!r) return responder(res, 404, { erro: "função não encontrada" });
        res.writeHead(r.status, Object.fromEntries(r.headers));
        return res.end(await r.text());
      }
      // arquivos do app (SPA)
      const limpo = new URL(caminho, BASE).pathname;
      let arquivo = join(PASTA, limpo);
      if (!existsSync(arquivo) || statSync(arquivo).isDirectory()) arquivo = join(PASTA, "index.html");
      res.writeHead(200, { "Content-Type": TIPOS[extname(arquivo)] ?? "application/octet-stream" });
      res.end(readFileSync(arquivo));
    } catch (e) {
      const err = e as ErroSql;
      const status = err.codigo === "42501" ? 403 : err.codigo === "PGRST" ? 400 : 400;
      responder(res, status, { message: err.message, code: err.codigo });
    }
  });
  return new Promise((ok) => servidor.listen(PORTA, () => ok()));
}

iniciar().then(() => console.log(`pronto em ${BASE}`));
