// GET /api/publico/:slug?inicio=AAAA-MM-DD&fim=AAAA-MM-DD
// Dados públicos da igreja + calendário da escala (só escalas enviadas, sem telefones).
// O código do aparelho vem no cabeçalho X-Device-Token (para marcar "você está escalado").
import { ErroApi, SLUG_RE, TOKEN_RE, erro, json, rpc } from "../lib/supabase";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async (req: Request, context: { params?: Record<string, string> }) => {
  try {
    if (req.method !== "GET") throw new ErroApi(405, "Método não permitido");
    const slug = (context.params?.slug ?? "").toLowerCase();
    if (!SLUG_RE.test(slug)) throw new ErroApi(404, "Igreja não encontrada");

    const url = new URL(req.url);
    const inicio = url.searchParams.get("inicio") ?? "";
    const fim = url.searchParams.get("fim") ?? "";
    if (!DATA_RE.test(inicio) || !DATA_RE.test(fim)) throw new ErroApi(400, "Período inválido");

    const token = req.headers.get("x-device-token") ?? "";
    const igreja = await rpc<Record<string, unknown> | null>("public_church", { p_slug: slug });
    if (!igreja) throw new ErroApi(404, "Igreja não encontrada");

    const calendario = await rpc("public_calendar", {
      p_slug: slug,
      p_inicio: inicio,
      p_fim: fim,
      p_device_token: TOKEN_RE.test(token) ? token : null,
    });
    return json({ igreja, calendario });
  } catch (e) {
    return erro(e);
  }
};

export const config = {
  path: "/api/publico/:slug",
};
