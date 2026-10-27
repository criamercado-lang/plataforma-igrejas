// Área logada da equipe (/app). Carrega as igrejas da pessoa e o papel em cada uma.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { aoMudarSessao, emLista, eq, listar, rpc, sair, sessaoAtual, type Sessao } from "../../lib/api";
import { aoClicarLink, navegar } from "../../lib/rotas";
import { NOME_PAPEL, type Igreja, type Papel } from "../../lib/tipos";
import { Aviso, Carregando, Icone, Logo, aplicarCor } from "../../ui";
import Login from "./Login";
import Escalas from "./Escalas";
import EditorEscala from "./EditorEscala";
import Voluntarios from "./Voluntarios";
import Equipe from "./Equipe";
import Ajustes from "./Ajustes";
import Plataforma from "./Plataforma";
import Eventos from "./Eventos";
import EventoPagina from "./EventoPagina";
import PlanoEvento from "./PlanoEvento";
import Tarefas from "./Tarefas";
import Mais from "./Mais";

interface Contexto {
  igreja: Igreja;
  papel: Papel;
  gestor: boolean;
  admin: boolean;
  usuarioId: string;
  recarregarIgreja: () => Promise<void>;
}

const Ctx = createContext<Contexto | null>(null);
export const useEquipe = () => useContext(Ctx)!;

const CHAVE_IGREJA = "igreja-atual";

export default function AreaEquipe({ caminho }: { caminho: string }) {
  const [sessao, setSessao] = useState<Sessao | null>(sessaoAtual());
  const [igrejas, setIgrejas] = useState<(Igreja & { papel: Papel })[] | null>(null);
  const [atualId, setAtualId] = useState<string>(() => {
    try {
      return localStorage.getItem(CHAVE_IGREJA) ?? "";
    } catch {
      return "";
    }
  });
  const [plataforma, setPlataforma] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => aoMudarSessao(setSessao), []);

  const carregar = useCallback(async () => {
    if (!sessaoAtual()) return;
    setErro("");
    try {
      const membros = await listar<{ church_id: string; papel: Papel }>("memberships", {
        select: "church_id,papel",
        user_id: eq(sessaoAtual()!.user.id),
      });
      const lista = membros.length
        ? await listar<Igreja>("churches", {
            select: "id,nome,slug,logo_path,cor_principal,fuso_horario,cultos_fixos,versiculos",
            id: emLista(membros.map((m) => m.church_id)),
            order: "nome.asc",
          })
        : [];
      setIgrejas(lista.map((i) => ({ ...i, papel: membros.find((m) => m.church_id === i.id)!.papel })));
      setPlataforma(await rpc<boolean>("is_platform_admin"));
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (sessao) carregar();
    else setIgrejas(null);
  }, [sessao, carregar]);

  if (!sessao) {
    return (
      <main className="tela" style={{ paddingTop: 40 }}>
        <h1>Área da equipe</h1>
        <Login />
      </main>
    );
  }
  if (erro) return <main className="tela"><Aviso tipo="erro">{erro}</Aviso><button className="botao" onClick={carregar}>Tentar de novo</button></main>;
  if (!igrejas) return <Carregando />;

  const sub = caminho.replace(/^\/app\/?/, "");

  if (sub.startsWith("plataforma") && plataforma) return <Plataforma />;

  if (igrejas.length === 0) {
    return (
      <main className="tela" style={{ paddingTop: 40 }}>
        <h1>Você ainda não está em nenhuma equipe</h1>
        <p className="suave">Peça ao líder de comunicação da sua igreja um convite para {sessao.user.email}.</p>
        {plataforma && <a className="botao largo" href="/app/plataforma" onClick={aoClicarLink}>Criar igreja (plataforma)</a>}
        <button className="botao secundario" onClick={() => sair()}>Sair</button>
      </main>
    );
  }

  const igreja = igrejas.find((i) => i.id === atualId) ?? igrejas[0];
  aplicarCor(igreja.cor_principal);

  const trocarIgreja = (id: string) => {
    setAtualId(id);
    try {
      localStorage.setItem(CHAVE_IGREJA, id);
    } catch {
      /* ok */
    }
    navegar("/app");
  };

  const contexto: Contexto = {
    igreja,
    papel: igreja.papel,
    gestor: igreja.papel === "admin" || igreja.papel === "lider",
    admin: igreja.papel === "admin",
    usuarioId: sessao.user.id,
    recarregarIgreja: carregar,
  };

  let pagina;
  const m = /^escalas\/([0-9a-f-]{36})$/.exec(sub);
  const ev = /^eventos\/([0-9a-f-]{36})(\/plano)?$/.exec(sub);
  if (m) pagina = <EditorEscala key={m[1]} id={m[1]} />;
  else if (ev && ev[2]) pagina = <PlanoEvento key={ev[1]} id={ev[1]} />;
  else if (ev) pagina = <EventoPagina key={ev[1]} id={ev[1]} />;
  else if (sub === "eventos") pagina = <Eventos />;
  else if (sub === "tarefas") pagina = <Tarefas />;
  else if (sub === "mais") pagina = <Mais plataforma={plataforma} />;
  else if (sub === "voluntarios") pagina = <Voluntarios />;
  else if (sub === "equipe") pagina = <Equipe />;
  else if (sub === "ajustes") pagina = <Ajustes plataforma={plataforma} />;
  else pagina = <Escalas />;

  const itens = [
    { href: "/app", rotulo: "Escalas", icone: "calendario", ativo: sub === "" || sub.startsWith("escalas") },
    { href: "/app/eventos", rotulo: "Eventos", icone: "megafone", ativo: sub.startsWith("eventos") },
    { href: "/app/tarefas", rotulo: "Tarefas", icone: "tarefas", ativo: sub === "tarefas" },
    { href: "/app/voluntarios", rotulo: "Voluntários", icone: "pessoas", ativo: sub === "voluntarios" },
    { href: "/app/mais", rotulo: "Mais", icone: "pontos", ativo: ["mais", "equipe", "ajustes"].includes(sub) },
  ];

  return (
    <Ctx.Provider value={contexto}>
      <header className="cabecalho">
        <Logo nome={igreja.nome} logoPath={igreja.logo_path} />
        {igrejas.length > 1 ? (
          <label style={{ flex: 1, minWidth: 0 }}>
            <span className="oculto-leitor">Igreja</span>
            <select
              value={igreja.id}
              onChange={(e) => trocarIgreja(e.target.value)}
              style={{ border: 0, background: "transparent", fontWeight: 600, fontSize: 15, maxWidth: "100%" }}
            >
              {igrejas.map((i) => (
                <option key={i.id} value={i.id}>{i.nome}</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="nome-igreja">{igreja.nome}</div>
        )}
        <span className="selo" title="Seu papel nesta igreja">{NOME_PAPEL[igreja.papel]}</span>
      </header>
      <main className="tela tela-com-menu">{pagina}</main>
      <nav className="menu" aria-label="Menu" style={{ ["--itens" as string]: itens.length }}>
        {itens.map((i) => (
          <a key={i.href} href={i.href} onClick={aoClicarLink} aria-current={i.ativo ? "page" : undefined}>
            <Icone nome={i.icone} tamanho={22} />
            {i.rotulo}
          </a>
        ))}
      </nav>
    </Ctx.Provider>
  );
}
