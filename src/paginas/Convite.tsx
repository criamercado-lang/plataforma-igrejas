// /convite/{token}: entrar na equipe de comunicação de uma igreja.
import { useEffect, useState } from "react";
import { api, entrar, rpc, sessaoAtual, sair } from "../lib/api";
import { navegar } from "../lib/rotas";
import { NOME_PAPEL, type Papel } from "../lib/tipos";
import { Aviso, Carregando, Logo, aplicarCor } from "../ui";
import Login from "./app/Login";

interface Info {
  valido: boolean;
  motivo?: "nao_encontrado" | "ja_aceito" | "expirado";
  email?: string;
  papel?: Papel;
  igreja?: string;
  slug?: string;
  logo_path?: string | null;
  cor_principal?: string;
  conta_existe?: boolean;
}

const MOTIVOS = {
  nao_encontrado: "Convite não encontrado. Confira o link.",
  ja_aceito: "Este convite já foi usado. Se a conta é sua, é só entrar.",
  expirado: "Este convite expirou. Peça um novo ao líder.",
};

export default function Convite({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    rpc<Info>("invite_info", { p_token: token })
      .then((i) => {
        setInfo(i);
        if (i.cor_principal) aplicarCor(i.cor_principal);
      })
      .catch((e) => setErro((e as Error).message));
  }, [token]);

  const aceitarLogado = async () => {
    setErro("");
    try {
      await rpc("accept_invite", { p_token: token });
      navegar("/app", true);
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const criarConta = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (nome.trim().length < 2) return setErro("Informe seu nome.");
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    setEnviando(true);
    try {
      const r = await api<{ ok: boolean; email: string }>("/api/convite/aceitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, nome: nome.trim(), senha }),
      });
      await entrar(r.email, senha);
      navegar("/app", true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  if (!info) return erro ? <main className="tela"><Aviso tipo="erro">{erro}</Aviso></main> : <Carregando />;

  const sessao = sessaoAtual();
  const logadoComOutro = sessao && info.email && sessao.user.email.toLowerCase() !== info.email.toLowerCase();

  return (
    <main className="tela" style={{ paddingTop: 32, gap: 20 }}>
      <div className="empilha" style={{ alignItems: "center", textAlign: "center", gap: 12 }}>
        <Logo nome={info.igreja ?? "?"} logoPath={info.logo_path} grande />
        <h1>Você foi convidado para a equipe de comunicação</h1>
        {info.igreja && (
          <p className="suave">
            {info.igreja} · <strong style={{ color: "var(--texto)" }}>{info.papel ? NOME_PAPEL[info.papel] : ""}</strong>
          </p>
        )}
      </div>

      {!info.valido && <Aviso tipo={info.motivo === "ja_aceito" ? "info" : "erro"}>{MOTIVOS[info.motivo ?? "nao_encontrado"]}</Aviso>}
      {!info.valido && info.motivo === "ja_aceito" && <button className="botao largo" onClick={() => navegar("/app")}>Entrar</button>}

      {info.valido && logadoComOutro && (
        <Aviso tipo="alerta">
          Você está conectado como {sessao!.user.email}, mas o convite é para {info.email}.{" "}
          <button className="botao secundario pequeno" onClick={() => sair().then(() => location.reload())}>Sair e continuar</button>
        </Aviso>
      )}

      {info.valido && !logadoComOutro && sessao && (
        <div className="cartao">
          <p>Conectado como <strong>{sessao.user.email}</strong>.</p>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <button className="botao largo" onClick={aceitarLogado}>Aceitar e entrar na equipe</button>
        </div>
      )}

      {info.valido && !sessao && info.conta_existe && (
        <>
          <Login emailFixo={info.email} titulo="Você já tem conta. Entre para aceitar." aoEntrar={aceitarLogado} />
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
        </>
      )}

      {info.valido && !sessao && !info.conta_existe && (
        <form className="cartao" onSubmit={criarConta} noValidate>
          <p className="suave pequeno">Crie sua senha para entrar.</p>
          <label className="campo">
            E-mail
            <input value={info.email} readOnly style={{ background: "var(--fundo)", color: "var(--suave)" }} />
          </label>
          <label className="campo">
            Seu nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como a equipe vai ver você" autoComplete="name" maxLength={80} />
          </label>
          <label className="campo">
            Senha
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
            <span className="ajuda">Pelo menos 8 caracteres.</span>
          </label>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <button className="botao largo" type="submit" disabled={enviando}>{enviando ? "Entrando…" : "Entrar na equipe"}</button>
        </form>
      )}

      {info.valido && <p className="pequeno suave" style={{ textAlign: "center" }}>Convite válido por 7 dias. Se expirar, peça um novo ao líder.</p>}
    </main>
  );
}
