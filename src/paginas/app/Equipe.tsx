import { useEffect, useState } from "react";
import { apagar, atualizar, emLista, eq, listar, rpc } from "../../lib/api";
import { NOME_PAPEL, type Papel } from "../../lib/tipos";
import { Aviso, Carregando, confirmar, copiarTexto, iniciais, toast } from "../../ui";
import { useEquipe } from "./AreaEquipe";

interface Membro {
  id: string;
  user_id: string;
  papel: Papel;
  nome: string;
  email: string;
}
interface Convite {
  id: string;
  email: string;
  papel: Papel;
  expira_em: string;
}

const PAPEIS: Papel[] = ["admin", "lider", "aprovador", "designer", "social_media", "audiovisual"];

export default function Equipe() {
  const { igreja, gestor, admin, usuarioId } = useEquipe();
  const [membros, setMembros] = useState<Membro[] | null>(null);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [erro, setErro] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("designer");
  const [link, setLink] = useState<{ url: string; email: string; papel: Papel } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = async () => {
    try {
      const ms = await listar<{ id: string; user_id: string; papel: Papel }>("memberships", {
        select: "id,user_id,papel",
        church_id: eq(igreja.id),
      });
      const perfis = ms.length
        ? await listar<{ id: string; nome: string; email: string }>("profiles", { select: "id,nome,email", id: emLista(ms.map((m) => m.user_id)) })
        : [];
      setMembros(
        ms
          .map((m) => {
            const p = perfis.find((x) => x.id === m.user_id);
            return { ...m, nome: p?.nome || p?.email?.split("@")[0] || "—", email: p?.email ?? "" };
          })
          .sort((a, b) => PAPEIS.indexOf(a.papel) - PAPEIS.indexOf(b.papel) || a.nome.localeCompare(b.nome, "pt-BR")),
      );
      if (gestor) {
        setConvites(
          await listar<Convite>("invites", { select: "id,email,papel,expira_em", church_id: eq(igreja.id), aceito_em: "is.null", order: "created_at.desc" }),
        );
      }
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [igreja.id]);

  const convidar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErro("Informe um e-mail válido.");
    setEnviando(true);
    try {
      const token = await rpc<string>("create_invite", { p_church: igreja.id, p_email: email.trim(), p_papel: papel });
      setLink({ url: `${location.origin}/convite/${token}`, email: email.trim().toLowerCase(), papel });
      setEmail("");
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const mudarPapel = async (m: Membro, novo: Papel) => {
    try {
      await atualizar("memberships", { id: eq(m.id) }, { papel: novo });
      toast("Papel atualizado.");
      carregar();
    } catch (e) {
      toast((e as Error).message);
      carregar();
    }
  };

  const remover = async (m: Membro) => {
    const proprio = m.user_id === usuarioId;
    if (!confirmar(proprio ? "Sair da equipe desta igreja?" : `Tirar ${m.nome} da equipe?`)) return;
    try {
      await apagar("memberships", { id: eq(m.id) });
      if (proprio) location.href = "/app";
      else carregar();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const cancelar = async (c: Convite) => {
    if (!confirmar(`Cancelar o convite de ${c.email}?`)) return;
    try {
      await apagar("invites", { id: eq(c.id) });
      carregar();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  if (erro && !membros) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!membros) return <Carregando />;

  const mensagemConvite = link
    ? `Olá! Você foi convidado para a equipe de comunicação da ${igreja.nome} como ${NOME_PAPEL[link.papel]}. Entre por este link (vale 7 dias): ${link.url}`
    : "";
  const papeisPermitidos = admin ? PAPEIS : PAPEIS.filter((p) => p !== "admin");

  return (
    <>
      <h1>Equipe de comunicação</h1>

      {gestor && (
        <form className="cartao" onSubmit={convidar} noValidate>
          <h2 style={{ fontSize: 16 }}>Convidar alguém</h2>
          <label className="campo">E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></label>
          <label className="campo">
            Papel
            <select value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
              {papeisPermitidos.map((p) => <option key={p} value={p}>{NOME_PAPEL[p]}</option>)}
            </select>
          </label>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <button className="botao" type="submit" disabled={enviando}>{enviando ? "Gerando…" : "Gerar convite"}</button>
          {link && (
            <div className="aviso info empilha" style={{ gap: 10 }}>
              <div>Convite criado para <strong>{link.email}</strong> ({NOME_PAPEL[link.papel]}). Vale por 7 dias.</div>
              <div className="grade-2">
                <button type="button" className="botao secundario pequeno" onClick={async () => (await copiarTexto(link.url)) && toast("Link copiado.")}>Copiar link</button>
                <a className="botao secundario pequeno" href={`https://wa.me/?text=${encodeURIComponent(mensagemConvite)}`} target="_blank" rel="noopener noreferrer">Enviar no WhatsApp</a>
              </div>
            </div>
          )}
        </form>
      )}

      <section className="cartao sem-padding">
        <h2 style={{ padding: "14px 16px 6px", fontSize: 16 }}>Na equipe</h2>
        {membros.map((m) => (
          <div key={m.id} className="item-lista" style={{ flexWrap: "wrap" }}>
            <div className="logo" style={{ background: "var(--cinza)", color: "var(--texto-2)" }}>{iniciais(m.nome)}</div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontWeight: 600 }}>{m.nome}{m.user_id === usuarioId && <span className="suave pequeno"> (você)</span>}</div>
              <div className="pequeno suave">{m.email}</div>
            </div>
            {(admin || (gestor && m.papel !== "admin")) && m.user_id !== usuarioId ? (
              <label>
                <span className="oculto-leitor">Papel de {m.nome}</span>
                <select value={m.papel} onChange={(e) => mudarPapel(m, e.target.value as Papel)} style={{ minHeight: 40, borderRadius: 10, border: "1px solid var(--campo)", padding: "0 8px", background: "#fff" }}>
                  {(admin ? PAPEIS : papeisPermitidos).map((p) => <option key={p} value={p}>{NOME_PAPEL[p]}</option>)}
                </select>
              </label>
            ) : (
              <span className="selo">{NOME_PAPEL[m.papel]}</span>
            )}
            {((admin || (gestor && m.papel !== "admin")) && m.user_id !== usuarioId) || (m.user_id === usuarioId && !(m.papel === "admin" && membros.filter((x) => x.papel === "admin").length === 1)) ? (
              <button className="botao perigo pequeno" onClick={() => remover(m)}>{m.user_id === usuarioId ? "Sair" : "Tirar"}</button>
            ) : null}
          </div>
        ))}
      </section>

      {gestor && convites.length > 0 && (
        <section className="cartao sem-padding">
          <h2 style={{ padding: "14px 16px 6px", fontSize: 16 }}>Convites abertos</h2>
          {convites.map((c) => {
            const expirado = new Date(c.expira_em) < new Date();
            const dias = Math.max(0, Math.ceil((new Date(c.expira_em).getTime() - Date.now()) / 86400000));
            return (
              <div key={c.id} className="item-lista">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{c.email}</div>
                  <div className="pequeno suave">{NOME_PAPEL[c.papel]} · {expirado ? "expirado" : `expira em ${dias} ${dias === 1 ? "dia" : "dias"}`}</div>
                </div>
                <button className="botao perigo pequeno" onClick={() => cancelar(c)}>Cancelar</button>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
