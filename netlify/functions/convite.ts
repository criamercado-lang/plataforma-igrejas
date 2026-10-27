// POST /api/convite/aceitar { token, nome, senha }
// Para quem ainda não tem conta: cria a conta (já confirmada, sem depender de e-mail)
// e entra na equipe da igreja com o papel do convite.
// Quem já tem conta entra pelo login e aceita no app (função accept_invite do banco).
import { ErroApi, TOKEN_RE, apagarUsuario, criarUsuario, erro, json, lerJson, rpc } from "../lib/supabase";

type Info = { valido: boolean; motivo?: string; email?: string; conta_existe?: boolean };

export default async (req: Request) => {
  try {
    if (req.method !== "POST") throw new ErroApi(405, "Método não permitido");
    const corpo = await lerJson<{ token?: string; nome?: string; senha?: string }>(req);
    const token = String(corpo.token ?? "");
    const nome = String(corpo.nome ?? "").trim().replace(/\s+/g, " ");
    const senha = String(corpo.senha ?? "");

    if (!TOKEN_RE.test(token)) throw new ErroApi(400, "Convite inválido");
    if (nome.length < 2 || nome.length > 80) throw new ErroApi(400, "Informe seu nome");
    if (senha.length < 8 || senha.length > 72) throw new ErroApi(400, "A senha precisa ter de 8 a 72 caracteres");

    const info = await rpc<Info>("invite_info", { p_token: token });
    if (!info.valido) {
      const motivos: Record<string, string> = {
        nao_encontrado: "Convite não encontrado",
        ja_aceito: "Este convite já foi usado",
        expirado: "Este convite expirou. Peça um novo ao líder.",
      };
      throw new ErroApi(400, motivos[info.motivo ?? ""] ?? "Convite inválido");
    }
    if (info.conta_existe) {
      throw new ErroApi(409, "Já existe uma conta com este e-mail. Entre com sua senha para aceitar o convite.");
    }

    const usuario = await criarUsuario(info.email!, senha, nome);
    try {
      await rpc("accept_invite_for_user", { p_token: token, p_user: usuario.id });
    } catch (e) {
      // não deixar conta solta se o aceite falhar
      await apagarUsuario(usuario.id);
      throw e;
    }
    return json({ ok: true, email: info.email });
  } catch (e) {
    return erro(e);
  }
};

export const config = {
  path: "/api/convite/aceitar",
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
