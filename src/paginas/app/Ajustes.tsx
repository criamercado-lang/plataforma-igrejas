import { useEffect, useState } from "react";
import { apagar, atualizar, enviarLogo, eq, inserir, listar, sair, sessaoAtual } from "../../lib/api";
import { DIAS_LONGOS, NOME_TURNO, TURNOS, type CultoFixo, type Turno, type Versiculo } from "../../lib/escala";
import { aoClicarLink } from "../../lib/rotas";
import type { FuncaoDb } from "../../lib/tipos";
import { Aviso, Carregando, Icone, Logo, aplicarCor, confirmar, toast } from "../../ui";
import { useEquipe } from "./AreaEquipe";

const CORES = ["#7A2E3B", "#B4532A", "#C45C0C", "#0F5C4A", "#2B2F3A"];

export default function Ajustes({ plataforma }: { plataforma: boolean }) {
  const { igreja, gestor, recarregarIgreja, usuarioId } = useEquipe();
  const [nome, setNome] = useState(igreja.nome);
  const [cor, setCor] = useState(igreja.cor_principal);
  const [cultos, setCultos] = useState<CultoFixo[]>(igreja.cultos_fixos ?? []);
  const [versiculos, setVersiculos] = useState<Versiculo[]>(igreja.versiculos ?? []);
  const [funcoes, setFuncoes] = useState<FuncaoDb[] | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [meuNome, setMeuNome] = useState("");

  useEffect(() => {
    setNome(igreja.nome);
    setCor(igreja.cor_principal);
    setCultos(igreja.cultos_fixos ?? []);
    setVersiculos(igreja.versiculos ?? []);
    listar<FuncaoDb>("ministry_roles", { select: "id,church_id,nome,ordem,pessoas_por_culto", church_id: eq(igreja.id), order: "ordem.asc,nome.asc" })
      .then(setFuncoes)
      .catch((e) => setErro((e as Error).message));
    listar<{ nome: string }>("profiles", { select: "nome", id: eq(usuarioId) }).then((p) => setMeuNome(p[0]?.nome ?? ""));
  }, [igreja, usuarioId]);

  // o banco devolve as chaves do JSON em outra ordem: comparar campo a campo
  const chaveCultos = (l: CultoFixo[]) => JSON.stringify(l.map((c) => [c.dia, c.turno, c.nome]));
  const chaveVersos = (l: Versiculo[]) => JSON.stringify(l.map((v) => [v.texto, v.referencia]));
  const mudou =
    nome !== igreja.nome ||
    cor.toLowerCase() !== igreja.cor_principal.toLowerCase() ||
    chaveCultos(cultos) !== chaveCultos(igreja.cultos_fixos ?? []) ||
    chaveVersos(versiculos) !== chaveVersos(igreja.versiculos ?? []);

  const salvarIgreja = async () => {
    setErro("");
    if (nome.trim().length < 2) return setErro("Informe o nome da igreja.");
    if (versiculos.some((v) => !v.texto.trim() || !v.referencia.trim())) return setErro("Cada versículo precisa do texto e da referência.");
    setSalvando(true);
    try {
      await atualizar("churches", { id: eq(igreja.id) }, { nome: nome.trim(), cor_principal: cor, cultos_fixos: cultos, versiculos });
      await recarregarIgreja();
      toast("Configurações salvas.");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const trocarLogo = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(arquivo.type)) return toast("Use PNG, JPG ou WebP.");
    if (arquivo.size > 2 * 1024 * 1024) return toast("O logo precisa ter até 2 MB.");
    try {
      const caminho = await enviarLogo(igreja.id, arquivo);
      await atualizar("churches", { id: eq(igreja.id) }, { logo_path: caminho });
      await recarregarIgreja();
      toast("Logo atualizado.");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  if (!funcoes) return erro ? <Aviso tipo="erro">{erro}</Aviso> : <Carregando />;

  return (
    <>
      <h1>Ajustes</h1>
      {!gestor && <Aviso tipo="info">Só o admin e o líder de comunicação alteram as configurações da igreja.</Aviso>}

      <section className="cartao">
        <h2 style={{ fontSize: 16 }}>Identidade</h2>
        <div className="linha-flex" style={{ gap: 14 }}>
          <Logo nome={igreja.nome} logoPath={igreja.logo_path} grande />
          {gestor && (
            <div className="empilha" style={{ gap: 6 }}>
              <label className="botao secundario pequeno" style={{ cursor: "pointer" }}>
                Trocar logo
                <input type="file" accept="image/png,image/jpeg,image/webp" className="oculto-leitor" onChange={(e) => trocarLogo(e.target.files?.[0])} />
              </label>
              <span className="pequeno suave">PNG, JPG ou WebP quadrado, até 2 MB. Aparece no link do WhatsApp.</span>
            </div>
          )}
        </div>
        <label className="campo">Nome da igreja<input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!gestor} maxLength={80} /></label>
        <div className="empilha" style={{ gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Cor principal</div>
          <div className="linha-flex" style={{ flexWrap: "wrap" }}>
            {CORES.map((c) => (
              <button
                key={c}
                type="button"
                disabled={!gestor}
                onClick={() => { setCor(c); aplicarCor(c); }}
                aria-label={`Cor ${c}`}
                aria-pressed={cor.toLowerCase() === c.toLowerCase()}
                style={{ width: 40, height: 40, borderRadius: "50%", background: c, cursor: "pointer", border: cor.toLowerCase() === c.toLowerCase() ? "3px solid #fff" : 0, outline: cor.toLowerCase() === c.toLowerCase() ? `2px solid ${c}` : "none" }}
              />
            ))}
            <label className="botao secundario pequeno" style={{ cursor: "pointer" }}>
              Outra
              <input type="color" value={cor} disabled={!gestor} onChange={(e) => { setCor(e.target.value.toUpperCase()); aplicarCor(e.target.value); }} className="oculto-leitor" />
            </label>
          </div>
        </div>
        <div className="pequeno suave">Link da escala: <strong style={{ color: "var(--texto)" }}>/{igreja.slug}</strong> (definido na criação)</div>
      </section>

      <section className="cartao">
        <h2 style={{ fontSize: 16 }}>Cultos fixos da semana</h2>
        {cultos.length === 0 && <p className="pequeno suave">Nenhum culto fixo. Adicione os cultos que a mídia cobre toda semana.</p>}
        {cultos.map((c, i) => (
          <div key={i} className="linha-flex" style={{ border: "1px solid var(--linha)", borderRadius: 12, padding: "8px 8px 8px 12px", flexWrap: "wrap" }}>
            <select aria-label="Dia" value={c.dia} disabled={!gestor} onChange={(e) => setCultos(cultos.map((x, j) => (j === i ? { ...x, dia: Number(e.target.value) } : x)))} style={{ minHeight: 40, borderRadius: 10, border: "1px solid var(--campo)", background: "#fff" }}>
              {DIAS_LONGOS.map((d, n) => <option key={n} value={n}>{d}</option>)}
            </select>
            <select aria-label="Turno" value={c.turno} disabled={!gestor} onChange={(e) => setCultos(cultos.map((x, j) => (j === i ? { ...x, turno: e.target.value as Turno } : x)))} style={{ minHeight: 40, borderRadius: 10, border: "1px solid var(--campo)", background: "#fff" }}>
              {TURNOS.map((t) => <option key={t} value={t}>{NOME_TURNO[t]}</option>)}
            </select>
            <input aria-label="Nome do culto" value={c.nome} disabled={!gestor} placeholder="Nome do culto" onChange={(e) => setCultos(cultos.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} style={{ flex: 1, minWidth: 120, minHeight: 40, borderRadius: 10, border: "1px solid var(--campo)", padding: "0 10px" }} />
            {gestor && (
              <button className="icone-botao" onClick={() => setCultos(cultos.filter((_, j) => j !== i))} aria-label="Remover culto fixo">
                <Icone nome="fechar" tamanho={18} />
              </button>
            )}
          </div>
        ))}
        {gestor && (
          <button className="botao tracejado" onClick={() => setCultos([...cultos, { dia: 0, turno: "noite", nome: "" }])}>+ Adicionar culto fixo</button>
        )}
        {cultos.some((c) => !c.nome.trim()) && <span className="pequeno" style={{ color: "var(--erro-texto)" }}>Dê um nome a cada culto.</span>}
      </section>

      <Funcoes funcoes={funcoes} setFuncoes={setFuncoes} churchId={igreja.id} gestor={gestor} />

      <section className="cartao">
        <h2 style={{ fontSize: 16 }}>Versículos de incentivo</h2>
        <p className="pequeno suave">Aparecem na confirmação do voluntário e na mensagem da escala, um por período.</p>
        {versiculos.map((v, i) => (
          <div key={i} className="empilha" style={{ border: "1px solid var(--linha)", borderRadius: 12, padding: 10, gap: 8 }}>
            <textarea aria-label="Texto do versículo" value={v.texto} disabled={!gestor} rows={2} onChange={(e) => setVersiculos(versiculos.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} style={{ border: "1px solid var(--campo)", borderRadius: 10, padding: 10, resize: "vertical" }} />
            <div className="linha-flex">
              <input aria-label="Referência" value={v.referencia} disabled={!gestor} placeholder="Referência (ex.: Salmos 100:2)" onChange={(e) => setVersiculos(versiculos.map((x, j) => (j === i ? { ...x, referencia: e.target.value } : x)))} style={{ flex: 1, minHeight: 40, borderRadius: 10, border: "1px solid var(--campo)", padding: "0 10px" }} />
              {gestor && <button className="icone-botao" onClick={() => setVersiculos(versiculos.filter((_, j) => j !== i))} aria-label="Remover versículo"><Icone nome="lixo" tamanho={18} /></button>}
            </div>
          </div>
        ))}
        {gestor && <button className="botao tracejado" onClick={() => setVersiculos([...versiculos, { texto: "", referencia: "" }])}>+ Adicionar versículo</button>}
      </section>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {gestor && (
        <button className="botao largo" onClick={salvarIgreja} disabled={salvando || !mudou || cultos.some((c) => !c.nome.trim())}>
          {salvando ? "Salvando…" : mudou ? "Salvar configurações" : "Configurações salvas"}
        </button>
      )}

      <section className="cartao">
        <h2 style={{ fontSize: 16 }}>Minha conta</h2>
        <label className="campo">
          Meu nome na equipe
          <input value={meuNome} onChange={(e) => setMeuNome(e.target.value)} maxLength={80} />
        </label>
        <div className="grade-2">
          <button
            className="botao secundario pequeno"
            onClick={async () => {
              try {
                await atualizar("profiles", { id: eq(usuarioId) }, { nome: meuNome.trim() });
                toast("Nome atualizado.");
              } catch (e) {
                toast((e as Error).message);
              }
            }}
          >
            Salvar nome
          </button>
          <button className="botao secundario pequeno" onClick={() => sair()}>
            <Icone nome="sair" tamanho={18} /> Sair
          </button>
        </div>
        <div className="pequeno suave">{sessaoAtual()?.user.email}</div>
        {plataforma && <a href="/app/plataforma" onClick={aoClicarLink}>Administração da plataforma (criar igrejas)</a>}
      </section>
    </>
  );
}

function Funcoes(props: { funcoes: FuncaoDb[]; setFuncoes: (f: FuncaoDb[]) => void; churchId: string; gestor: boolean }) {
  const { funcoes, setFuncoes, gestor } = props;
  const [nova, setNova] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const COLS = "id,church_id,nome,ordem,pessoas_por_culto";

  const agir = async (f: () => Promise<void>) => {
    setOcupado(true);
    try {
      await f();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const mudarPessoas = (f: FuncaoDb, delta: number) =>
    agir(async () => {
      const n = Math.max(0, Math.min(20, f.pessoas_por_culto + delta));
      const [x] = await atualizar<FuncaoDb>("ministry_roles", { id: eq(f.id) }, { pessoas_por_culto: n }, COLS);
      setFuncoes(funcoes.map((y) => (y.id === x.id ? x : y)));
    });

  const mover = (i: number, delta: number) =>
    agir(async () => {
      const lista = [...funcoes];
      const [item] = lista.splice(i, 1);
      lista.splice(i + delta, 0, item);
      await Promise.all(lista.map((f, ordem) => (f.ordem !== ordem ? atualizar("ministry_roles", { id: eq(f.id) }, { ordem }) : null)));
      setFuncoes(lista.map((f, ordem) => ({ ...f, ordem })));
    });

  const adicionar = () =>
    agir(async () => {
      if (nova.trim().length < 2) throw new Error("Informe o nome da função.");
      const [x] = await inserir<FuncaoDb>("ministry_roles", { church_id: props.churchId, nome: nova.trim(), ordem: funcoes.length, pessoas_por_culto: 1 }, COLS);
      setFuncoes([...funcoes, x]);
      setNova("");
    });

  const remover = (f: FuncaoDb) =>
    agir(async () => {
      if (!confirmar(`Remover a função ${f.nome}? Ela sai também das escalas já montadas.`)) return;
      await apagar("ministry_roles", { id: eq(f.id) });
      setFuncoes(funcoes.filter((x) => x.id !== f.id));
    });

  return (
    <section className="cartao">
      <h2 style={{ fontSize: 16 }}>Funções da mídia</h2>
      <p className="pequeno suave">Quantas pessoas cada função precisa por culto. Na escala, dá para mudar culto a culto.</p>
      {funcoes.length === 0 && <p className="pequeno suave">Nenhuma função ainda. Exemplos: Stories, Projeção, Fotos, Transmissão.</p>}
      {funcoes.map((f, i) => (
        <div key={f.id} className="linha-flex" style={{ border: "1px solid var(--linha)", borderRadius: 12, padding: "6px 6px 6px 12px" }}>
          <strong style={{ flex: 1 }}>{f.nome}</strong>
          {gestor && (
            <>
              <button className="icone-botao" style={{ width: 36, height: 36 }} onClick={() => mover(i, -1)} disabled={ocupado || i === 0} aria-label={`Subir ${f.nome}`}><Icone nome="cima" tamanho={16} /></button>
              <button className="icone-botao" style={{ width: 36, height: 36 }} onClick={() => mover(i, 1)} disabled={ocupado || i === funcoes.length - 1} aria-label={`Descer ${f.nome}`}><Icone nome="baixo" tamanho={16} /></button>
              <button className="icone-botao" style={{ width: 36, height: 36, border: "1px solid var(--campo)" }} onClick={() => mudarPessoas(f, -1)} disabled={ocupado || f.pessoas_por_culto === 0} aria-label={`Menos uma pessoa em ${f.nome}`}><Icone nome="menos" tamanho={16} /></button>
            </>
          )}
          <span style={{ width: 24, textAlign: "center", fontWeight: 700 }} aria-label={`${f.pessoas_por_culto} por culto`}>{f.pessoas_por_culto}</span>
          {gestor && (
            <>
              <button className="icone-botao" style={{ width: 36, height: 36, border: "1px solid var(--campo)" }} onClick={() => mudarPessoas(f, 1)} disabled={ocupado} aria-label={`Mais uma pessoa em ${f.nome}`}><Icone nome="mais" tamanho={16} /></button>
              <button className="icone-botao" style={{ width: 36, height: 36 }} onClick={() => remover(f)} disabled={ocupado} aria-label={`Remover ${f.nome}`}><Icone nome="lixo" tamanho={16} /></button>
            </>
          )}
        </div>
      ))}
      {gestor && (
        <div className="linha-flex">
          <input aria-label="Nova função" placeholder="Nova função (ex.: Stories)" value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => e.key === "Enter" && adicionar()} style={{ flex: 1, minHeight: 44, borderRadius: 12, border: "1px solid var(--campo)", padding: "0 12px" }} maxLength={40} />
          <button className="botao pequeno" onClick={adicionar} disabled={ocupado}>Adicionar</button>
        </div>
      )}
    </section>
  );
}
