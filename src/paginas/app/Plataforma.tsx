// Administração da plataforma (você, no curso): criar a igreja e o convite do admin geral.
import { useEffect, useState } from "react";
import { listar, rpc } from "../../lib/api";
import { aoClicarLink } from "../../lib/rotas";
import { Aviso, copiarTexto, toast } from "../../ui";

function sugerirSlug(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function Plataforma() {
  const [igrejas, setIgrejas] = useState<{ id: string; nome: string; slug: string }[]>([]);
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [criado, setCriado] = useState<{ nome: string; link: string; email: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = () => listar<{ id: string; nome: string; slug: string }>("churches", { select: "id,nome,slug", order: "nome.asc" }).then(setIgrejas);
  useEffect(() => {
    carregar().catch((e) => setErro((e as Error).message));
  }, []);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (nome.trim().length < 2) return setErro("Informe o nome da igreja.");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2) return setErro("Endereço inválido: use letras minúsculas, números e hífen.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErro("Informe o e-mail do admin geral.");
    setEnviando(true);
    try {
      const r = await rpc<{ church_id: string; convite_token: string }>("platform_create_church", {
        p_nome: nome.trim(),
        p_slug: slug,
        p_admin_email: email.trim(),
      });
      setCriado({ nome: nome.trim(), link: `${location.origin}/convite/${r.convite_token}`, email: email.trim().toLowerCase() });
      setNome("");
      setSlug("");
      setSlugEditado(false);
      setEmail("");
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="tela">
      <a href="/app" onClick={aoClicarLink}>← Voltar</a>
      <h1>Plataforma</h1>
      <form className="cartao" onSubmit={criar} noValidate>
        <h2 style={{ fontSize: 16 }}>Criar igreja</h2>
        <label className="campo">
          Nome da igreja
          <input value={nome} onChange={(e) => { setNome(e.target.value); if (!slugEditado) setSlug(sugerirSlug(e.target.value)); }} maxLength={80} />
        </label>
        <label className="campo">
          Endereço do link
          <input value={slug} onChange={(e) => { setSlug(e.target.value.toLowerCase()); setSlugEditado(true); }} maxLength={60} />
          <span className="ajuda">{location.host}/{slug || "endereco"}</span>
        </label>
        <label className="campo">
          E-mail do admin geral (líder da igreja)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button className="botao" type="submit" disabled={enviando}>{enviando ? "Criando…" : "Criar igreja e convite"}</button>
      </form>

      {criado && (
        <div className="aviso ok empilha" style={{ gap: 10 }}>
          <div><strong>{criado.nome}</strong> criada. Envie este convite para {criado.email} (vale 7 dias):</div>
          <div className="pequeno" style={{ wordBreak: "break-all" }}>{criado.link}</div>
          <button className="botao secundario pequeno" onClick={async () => (await copiarTexto(criado.link)) && toast("Link copiado.")}>Copiar link</button>
        </div>
      )}

      <section className="cartao sem-padding">
        <h2 style={{ padding: "14px 16px 6px", fontSize: 16 }}>Igrejas ({igrejas.length})</h2>
        {igrejas.map((i) => (
          <div key={i.id} className="item-lista">
            <span style={{ flex: 1, fontWeight: 600 }}>{i.nome}</span>
            <a href={`/${i.slug}`} target="_blank" rel="noopener noreferrer" className="pequeno">/{i.slug}</a>
          </div>
        ))}
        {igrejas.length === 0 && <div className="vazio">Nenhuma igreja ainda.</div>}
      </section>
    </main>
  );
}
