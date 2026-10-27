// Tela aberta pelo link do e-mail "esqueci a senha": a pessoa cria uma senha nova.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { entrarPeloLink, trocarSenha } from "../../lib/api";
import { navegar } from "../../lib/rotas";
import { Aviso, Carregando, toast } from "../../ui";

export default function NovaSenha({ aoConcluir }: { aoConcluir: () => void }) {
  const [pronto, setPronto] = useState(false);
  const [erroLink, setErroLink] = useState("");
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const iniciado = useRef(false);
  useEffect(() => {
    if (iniciado.current) return; // o link só pode ser lido uma vez
    iniciado.current = true;
    entrarPeloLink()
      .then(() => setPronto(true))
      .catch((e) => setErroLink((e as Error).message));
  }, []);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    if (senha !== repetir) return setErro("As duas senhas não são iguais.");
    setSalvando(true);
    try {
      await trocarSenha(senha);
      toast("Senha alterada.");
      aoConcluir();
      navegar("/app", true);
    } catch (err) {
      setErro((err as Error).message);
      setSalvando(false);
    }
  };

  if (erroLink) {
    return (
      <main className="tela" style={{ paddingTop: 40 }}>
        <h1>Criar nova senha</h1>
        <Aviso tipo="erro">{erroLink}</Aviso>
        <button className="botao largo" onClick={() => { aoConcluir(); navegar("/app", true); }}>Voltar para o login</button>
      </main>
    );
  }
  if (!pronto) return <Carregando />;

  return (
    <main className="tela" style={{ paddingTop: 40 }}>
      <h1>Criar nova senha</h1>
      <form className="cartao" onSubmit={salvar} noValidate>
        <label className="campo">
          Nova senha
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
          <span className="ajuda">Pelo menos 8 caracteres.</span>
        </label>
        <label className="campo">
          Repita a senha
          <input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" />
        </label>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button className="botao largo" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar nova senha"}</button>
      </form>
    </main>
  );
}
