import { useState } from "react";
import { configurado, linkDeRecuperacao } from "./lib/api";
import { aoClicarLink, useCaminho } from "./lib/rotas";
import { Aviso, Toast } from "./ui";
import PaginaEscala from "./paginas/PaginaEscala";
import Convite from "./paginas/Convite";
import AreaEquipe from "./paginas/app/AreaEquipe";
import NovaSenha from "./paginas/app/NovaSenha";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export default function App() {
  const caminho = useCaminho();
  const [recuperacao, setRecuperacao] = useState(() => linkDeRecuperacao());
  const partes = caminho.split("/").filter(Boolean);

  if (!configurado) {
    return (
      <main className="tela">
        <Aviso tipo="erro">
          Faltam as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no Netlify. Cadastre e publique de novo.
        </Aviso>
      </main>
    );
  }

  let pagina;
  if (recuperacao && caminho.startsWith("/app")) pagina = <NovaSenha aoConcluir={() => setRecuperacao(false)} />;
  else if (partes[0] === "app") pagina = <AreaEquipe caminho={caminho} />;
  else if (partes[0] === "convite" && partes[1]) pagina = <Convite token={partes[1]} />;
  else if (partes.length >= 1 && partes.length <= 2 && SLUG.test(partes[0]) && (!partes[1] || partes[1] === "calendario")) {
    pagina = <PaginaEscala key={partes[0]} slug={partes[0]} soCalendario={partes[1] === "calendario"} />;
  } else if (partes.length === 0) {
    pagina = (
      <main className="tela" style={{ minHeight: "100dvh", justifyContent: "center" }}>
        <h1>Escala e Comunicação</h1>
        <p className="suave">Organização da comunicação da igreja. Voluntários entram pelo link da própria igreja.</p>
        <a className="botao largo" href="/app" onClick={aoClicarLink}>Entrar na área da equipe</a>
      </main>
    );
  } else {
    pagina = (
      <main className="tela">
        <h1>Página não encontrada</h1>
        <a href="/" onClick={aoClicarLink}>Voltar ao início</a>
      </main>
    );
  }

  return (
    <>
      {pagina}
      <Toast />
    </>
  );
}
