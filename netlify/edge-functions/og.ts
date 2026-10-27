// Prévia do link no WhatsApp com o nome e o logo de cada igreja.
// O WhatsApp não executa JavaScript, então a página /{igreja} precisa
// sair do servidor já com as tags Open Graph da igreja.

declare const Netlify: { env: { get(nome: string): string | undefined } } | undefined;

const RESERVADOS = new Set(["app", "api", "assets", "convite", "favicon.ico", "og-padrao.png", "robots.txt"]);

function lerEnv(nome: string): string | undefined {
  try {
    if (typeof Netlify !== "undefined") return Netlify.env.get(nome);
  } catch {
    /* fora do Netlify */
  }
  return (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[nome];
}

export function escaparHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function slugDoCaminho(caminho: string): string | null {
  const partes = caminho.split("/").filter(Boolean);
  if (partes.length === 0 || partes.length > 2) return null;
  if (partes.length === 2 && partes[1] !== "calendario") return null;
  const slug = partes[0].toLowerCase();
  if (RESERVADOS.has(slug) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  return slug;
}

export function montarTags(igreja: { nome: string; logo_path?: string | null }, urlPagina: string, supabaseUrl: string): string {
  const titulo = `Escala da Mídia · ${igreja.nome}`;
  const descricao = `Veja a escala e marque quando você pode servir na mídia da ${igreja.nome}.`;
  const imagem = igreja.logo_path
    ? `${supabaseUrl}/storage/v1/object/public/logos/${igreja.logo_path.split("/").map(encodeURIComponent).join("/")}`
    : new URL("/og-padrao.png", urlPagina).toString();
  const t = escaparHtml(titulo);
  const d = escaparHtml(descricao);
  const i = escaparHtml(imagem);
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:image" content="${i}">`,
    `<meta property="og:url" content="${escaparHtml(urlPagina)}">`,
    `<meta name="twitter:card" content="summary">`,
  ].join("\n    ");
}

export default async (req: Request, context: { next: () => Promise<Response> }) => {
  const resposta = await context.next();
  try {
    const url = new URL(req.url);
    const slug = slugDoCaminho(url.pathname);
    const tipo = resposta.headers.get("content-type") ?? "";
    if (!slug || !tipo.includes("text/html")) return resposta;

    const supabaseUrl = (lerEnv("VITE_SUPABASE_URL") ?? "").replace(/\/$/, "");
    const anon = lerEnv("VITE_SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anon) return resposta;

    const r = await fetch(`${supabaseUrl}/rest/v1/rpc/public_church`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: slug }),
    });
    if (!r.ok) return resposta;
    const igreja = (await r.json()) as { nome: string; logo_path?: string | null } | null;
    if (!igreja) return resposta;

    const html = await resposta.text();
    const novo = html.replace(
      /<!--og:inicio-->[\s\S]*?<!--og:fim-->/,
      `<!--og:inicio-->\n    ${montarTags(igreja, url.toString(), supabaseUrl)}\n    <!--og:fim-->`,
    );
    const headers = new Headers(resposta.headers);
    headers.delete("content-length");
    return new Response(novo, { status: resposta.status, headers });
  } catch {
    return resposta;
  }
};

export const config = {
  path: "/*",
  excludedPath: ["/app", "/app/*", "/api/*", "/assets/*", "/convite/*"],
};
