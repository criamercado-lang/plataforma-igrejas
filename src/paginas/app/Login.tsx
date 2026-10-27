import { useState } from "react";
import { entrar, erroDoLink, esqueciSenha } from "../../lib/api";
import { Aviso } from "../../ui";

export default function Login({ emailFixo, titulo, aoEntrar }: { emailFixo?: string; titulo?: string; aoEntrar?: () => void }) {
  const [email, setEmail] = useState(emailFixo ?? "");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(() => erroDoLink() ?? "");
  const [info, setInfo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pedindo, setPedindo] = useState(false);
  const [pedido, setPedido] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setInfo("");
    if (!email.includes("@") || senha.length < 1) {
      setErro("Informe o e-mail e a senha.");
      return;
    }
    setEnviando(true);
    try {
      await entrar(email, senha);
      aoEntrar?.();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const recuperar = async () => {
    setErro("");
    if (!email.includes("@")) {
      setErro("Digite seu e-mail primeiro.");
      return;
    }
    if (pedindo) return;
    setPedindo(true);
    try {
      await esqueciSenha(email);
      setPedido(true);
      setInfo("Enviamos um link para criar uma nova senha. Abra o e-mail mais recente (veja também o spam). Pode levar alguns minutos.");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setPedindo(false);
    }
  };

  return (
    <form className="cartao" onSubmit={enviar} noValidate>
      <h2>{titulo ?? "Entrar na área da equipe"}</h2>
      <label className="campo">
        E-mail
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={!!emailFixo} autoComplete="email" />
      </label>
      <label className="campo">
        Senha
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
      </label>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {info && <Aviso tipo="ok">{info}</Aviso>}
      <button className="botao largo" type="submit" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
      {!pedido && (
        <button type="button" className="botao secundario pequeno" onClick={recuperar} disabled={pedindo} style={{ alignSelf: "center" }}>
          {pedindo ? "Enviando…" : "Esqueci a senha"}
        </button>
      )}
    </form>
  );
}
