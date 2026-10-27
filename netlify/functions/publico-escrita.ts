// POST /api/publico/:slug/buscar     { telefone }
// POST /api/publico/:slug/salvar     { dados, confirmar_nome?, robo? }
// POST /api/publico/:slug/nao-posso  { data }
// O código do aparelho vai no cabeçalho X-Device-Token.
// Limite: 30 envios por minuto por IP (regra de rate limit do Netlify).
import { ErroApi, SLUG_RE, TOKEN_RE, conferirRobo, erro, json, lerJson, rpc } from "../lib/supabase";

type Corpo = {
  telefone?: string;
  dados?: Record<string, unknown>;
  confirmar_nome?: string;
  data?: string;
  robo?: string;
};

export default async (req: Request, context: { params?: Record<string, string>; ip?: string }) => {
  try {
    if (req.method !== "POST") throw new ErroApi(405, "Método não permitido");
    const slug = (context.params?.slug ?? "").toLowerCase();
    const acao = context.params?.acao ?? "";
    if (!SLUG_RE.test(slug)) throw new ErroApi(404, "Igreja não encontrada");

    const tokenBruto = req.headers.get("x-device-token") ?? "";
    const token = TOKEN_RE.test(tokenBruto) ? tokenBruto : null;
    const corpo = await lerJson<Corpo>(req);

    if (acao === "buscar") {
      const telefone = String(corpo.telefone ?? "").slice(0, 30);
      return json(await rpc("public_volunteer_lookup", { p_slug: slug, p_telefone: telefone, p_device_token: token }));
    }

    if (acao === "salvar") {
      await conferirRobo(corpo.robo, context.ip);
      if (!corpo.dados || typeof corpo.dados !== "object") throw new ErroApi(400, "Dados inválidos");
      return json(
        await rpc("public_volunteer_save", {
          p_slug: slug,
          p_dados: corpo.dados,
          p_device_token: token,
          p_confirmar_nome: corpo.confirmar_nome ? String(corpo.confirmar_nome).slice(0, 120) : null,
        }),
      );
    }

    if (acao === "nao-posso") {
      if (!token) return json({ ok: false, erro: "identifique_se" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(corpo.data ?? ""))) throw new ErroApi(400, "Data inválida");
      return json(await rpc("public_volunteer_nao_posso", { p_slug: slug, p_device_token: token, p_data: corpo.data }));
    }

    throw new ErroApi(404, "Ação não encontrada");
  } catch (e) {
    return erro(e);
  }
};

export const config = {
  path: "/api/publico/:slug/:acao",
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
