// Tarefas da equipe (/app/tarefas) e a folha de detalhe usada também na página do evento.
import { useCallback, useEffect, useState } from "react";
import { apagar, atualizar, eq, inserir, listar, rpc } from "../../lib/api";
import { diferencaDias, formatarComDia, hojeNoFuso, somarDias } from "../../lib/escala";
import { ETAPAS, NOME_TIPO, type MembroEquipe, type TipoTarefa } from "../../lib/eventos/modelos";
import { aoClicarLink } from "../../lib/rotas";
import { COLUNAS_TAREFA, NOME_STATUS_TAREFA, type EventoDb, type StatusTarefa, type TarefaDb } from "../../lib/tipos";
import { Aviso, Carregando, Folha, Icone, confirmar, toast } from "../../ui";
import { useEquipe } from "./AreaEquipe";
import { carregarEquipe, nomeDe } from "./dadosEquipe";

const STATUS: StatusTarefa[] = ["a_fazer", "fazendo", "feito"];

export function seloPrazo(t: Pick<TarefaDb, "prazo" | "status">, hoje: string) {
  if (t.status === "feito") return <span className="selo ok">Feito</span>;
  if (!t.prazo) return <span className="selo">{NOME_STATUS_TAREFA[t.status]}</span>;
  const d = diferencaDias(hoje, t.prazo);
  if (d < 0) return <span className="selo" style={{ background: "var(--erro-fundo)", color: "var(--erro-texto)" }}>Atrasada</span>;
  if (d === 0) return <span className="selo alerta">Hoje</span>;
  if (d === 1) return <span className="selo alerta">Amanhã</span>;
  return <span className="selo">{t.status === "fazendo" ? "Fazendo · " : ""}{formatarComDia(t.prazo)}</span>;
}

export function LinhaTarefa(props: { t: TarefaDb; equipe: MembroEquipe[]; hoje: string; evento?: string; aoAbrir: () => void }) {
  const { t } = props;
  return (
    <button
      className="item-lista"
      onClick={props.aoAbrir}
      style={{ width: "100%", background: "none", border: 0, borderTop: "1px solid var(--linha-2)", textAlign: "left", cursor: "pointer" }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 22, height: 22, borderRadius: 7, flex: "none",
          border: t.status === "feito" ? "0" : "2px solid var(--campo)",
          background: t.status === "feito" ? "var(--ok)" : t.status === "fazendo" ? "var(--alerta-fundo)" : "#fff",
          color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {t.status === "feito" && <Icone nome="certo" tamanho={14} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 600, textDecoration: t.status === "feito" ? "line-through" : undefined, color: t.status === "feito" ? "var(--suave)" : undefined }}>
          {t.titulo}
        </span>
        <span className="pequeno suave" style={{ display: "block" }}>
          {NOME_TIPO[t.tipo as TipoTarefa] ?? t.tipo} · {nomeDe(props.equipe, t.responsavel_id)}
          {props.evento ? ` · ${props.evento}` : ""}
          {t.link ? " · com link" : ""}
        </span>
      </span>
      {seloPrazo(t, props.hoje)}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Página de tarefas
// ---------------------------------------------------------------------------
export default function Tarefas() {
  const { igreja, gestor, usuarioId } = useEquipe();
  const hoje = hojeNoFuso(igreja.fuso_horario);
  const [tarefas, setTarefas] = useState<TarefaDb[] | null>(null);
  const [eventos, setEventos] = useState<Pick<EventoDb, "id" | "nome">[]>([]);
  const [equipe, setEquipe] = useState<MembroEquipe[]>([]);
  const [filtro, setFiltro] = useState<"minhas" | "todas">(gestor ? "todas" : "minhas");
  const [aberta, setAberta] = useState<TarefaDb | "nova" | null>(null);
  const [verFeitas, setVerFeitas] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const [t, e, eq_] = await Promise.all([
        listar<TarefaDb>("tasks", { select: COLUNAS_TAREFA, church_id: eq(igreja.id), order: "prazo.asc.nullslast,ordem.asc" }),
        listar<Pick<EventoDb, "id" | "nome">>("events", { select: "id,nome", church_id: eq(igreja.id) }),
        carregarEquipe(igreja.id),
      ]);
      setTarefas(t);
      setEventos(e);
      setEquipe(eq_);
    } catch (err) {
      setErro((err as Error).message);
    }
  }, [igreja.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!tarefas) return <Carregando />;

  const visiveis = filtro === "minhas" ? tarefas.filter((t) => t.responsavel_id === usuarioId) : tarefas;
  const abertas = visiveis.filter((t) => t.status !== "feito");
  const atrasadas = abertas.filter((t) => t.prazo && t.prazo < hoje);
  const semana = abertas.filter((t) => t.prazo && t.prazo >= hoje && t.prazo <= somarDias(hoje, 7));
  const depois = abertas.filter((t) => !t.prazo || t.prazo > somarDias(hoje, 7));
  const feitas = visiveis.filter((t) => t.status === "feito").sort((a, b) => (b.concluida_em ?? "").localeCompare(a.concluida_em ?? ""));
  const nomeEvento = (id: string | null) => eventos.find((e) => e.id === id)?.nome;

  const grupo = (titulo: string, lista: TarefaDb[]) =>
    lista.length > 0 && (
      <section className="cartao sem-padding">
        <h2 style={{ padding: "14px 16px 4px" }}>{titulo} <span className="pequeno suave">· {lista.length}</span></h2>
        {lista.map((t) => (
          <LinhaTarefa key={t.id} t={t} equipe={equipe} hoje={hoje} evento={nomeEvento(t.event_id)} aoAbrir={() => setAberta(t)} />
        ))}
      </section>
    );

  return (
    <>
      <div className="linha-flex entre">
        <h1>Tarefas</h1>
        {gestor && <button className="botao pequeno" onClick={() => setAberta("nova")}>+ Tarefa</button>}
      </div>
      <div className="chips" role="group" aria-label="Filtro">
        <button className={`chip${filtro === "minhas" ? " marcado" : ""}`} aria-pressed={filtro === "minhas"} onClick={() => setFiltro("minhas")}>
          Minhas
        </button>
        <button className={`chip${filtro === "todas" ? " marcado" : ""}`} aria-pressed={filtro === "todas"} onClick={() => setFiltro("todas")}>
          Todas da equipe
        </button>
      </div>

      {abertas.length === 0 && (
        <div className="vazio">
          {filtro === "minhas" ? "Nenhuma tarefa com você agora." : "Nenhuma tarefa aberta."}
          {gestor && <a href="/app/eventos" onClick={aoClicarLink}>As tarefas nascem do plano de cada evento.</a>}
        </div>
      )}
      {grupo("Atrasadas", atrasadas)}
      {grupo("Próximos 7 dias", semana)}
      {grupo("Depois", depois)}

      {feitas.length > 0 && (
        <>
          <button className="botao tracejado" onClick={() => setVerFeitas((v) => !v)}>
            {verFeitas ? "Esconder feitas" : `Ver feitas (${feitas.length})`}
          </button>
          {verFeitas && grupo("Feitas", feitas.slice(0, 50))}
        </>
      )}

      {aberta && (
        <FolhaTarefa
          tarefa={aberta === "nova" ? null : aberta}
          equipe={equipe}
          eventos={eventos}
          aoFechar={() => setAberta(null)}
          aoMudar={() => {
            setAberta(null);
            carregar();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Folha de detalhe / edição
// ---------------------------------------------------------------------------
export function FolhaTarefa(props: {
  tarefa: TarefaDb | null;
  equipe: MembroEquipe[];
  eventos?: Pick<EventoDb, "id" | "nome">[];
  eventoFixo?: string;
  aoFechar: () => void;
  aoMudar: () => void;
}) {
  const { igreja, gestor, usuarioId } = useEquipe();
  const t = props.tarefa;
  const hoje = hojeNoFuso(igreja.fuso_horario);
  const podeAndamento = gestor || (t?.responsavel_id === usuarioId && !!t);
  const [status, setStatus] = useState<StatusTarefa>(t?.status ?? "a_fazer");
  const [link, setLink] = useState(t?.link ?? "");
  const [titulo, setTitulo] = useState(t?.titulo ?? "");
  const [tipo, setTipo] = useState(t?.tipo ?? "post");
  const [etapa, setEtapa] = useState(t?.etapa ?? "Divulgação");
  const [prazo, setPrazo] = useState(t?.prazo ?? somarDias(hoje, 3));
  const [publicar, setPublicar] = useState(t?.publicar_em ?? "");
  const [resp, setResp] = useState(t?.responsavel_id ?? "");
  const [descricao, setDescricao] = useState(t?.descricao ?? "");
  const [evento, setEvento] = useState(t?.event_id ?? props.eventoFixo ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const nomeEvento = props.eventos?.find((e) => e.id === t?.event_id)?.nome;

  const salvar = async () => {
    setErro("");
    const l = link.trim();
    if (l && !/^https?:\/\//i.test(l)) return setErro("O link precisa começar com https:// (Canva, Drive, Instagram…).");
    if (gestor && titulo.trim().length < 2) return setErro("Dê um título à tarefa.");
    if (gestor && publicar && prazo && publicar < prazo) return setErro("A publicação não pode ser antes do prazo de produção.");
    setSalvando(true);
    try {
      if (gestor) {
        const dados = {
          titulo: titulo.trim(),
          tipo,
          etapa,
          prazo: prazo || null,
          publicar_em: publicar || null,
          responsavel_id: resp || null,
          descricao: descricao.trim() || null,
          status,
          link: l || null,
        };
        if (t) await atualizar("tasks", { id: eq(t.id) }, dados);
        else await inserir("tasks", { ...dados, church_id: igreja.id, event_id: evento || null, criado_por: usuarioId });
      } else if (t) {
        await rpc("update_task_progress", { p_task: t.id, p_status: status, p_link: l || null });
      }
      toast(t ? "Tarefa salva." : "Tarefa criada.");
      props.aoMudar();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!t || !confirmar(`Apagar a tarefa “${t.titulo}”?`)) return;
    try {
      await apagar("tasks", { id: eq(t.id) });
      toast("Tarefa apagada.");
      props.aoMudar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  return (
    <Folha titulo={t ? (gestor ? "Editar tarefa" : t.titulo) : "Nova tarefa"} aoFechar={props.aoFechar}>
      {t && !gestor && (
        <div className="empilha" style={{ gap: 4 }}>
          <div className="pequeno suave">
            {NOME_TIPO[t.tipo as TipoTarefa] ?? t.tipo} · {t.etapa}
            {nomeEvento ? ` · ${nomeEvento}` : ""}
          </div>
          <div className="pequeno">
            {t.prazo && <>Produção até <strong>{formatarComDia(t.prazo)}</strong></>}
            {t.publicar_em && <> · publicar <strong>{formatarComDia(t.publicar_em)}</strong></>}
          </div>
          <div className="pequeno suave">Responsável: {nomeDe(props.equipe, t.responsavel_id)}</div>
          {t.descricao && <p className="pequeno" style={{ whiteSpace: "pre-line", marginTop: 6 }}>{t.descricao}</p>}
        </div>
      )}

      {gestor && (
        <>
          <label className="campo">
            Título
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} />
          </label>
          {!t && props.eventos && !props.eventoFixo && (
            <label className="campo">
              Evento
              <select value={evento} onChange={(e) => setEvento(e.target.value)}>
                <option value="">Sem evento (tarefa avulsa)</option>
                {props.eventos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </label>
          )}
          <div className="grade-2">
            <label className="campo">
              Tipo
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {Object.entries(NOME_TIPO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            </label>
            <label className="campo">
              Etapa
              <select value={etapa} onChange={(e) => setEtapa(e.target.value)}>
                {ETAPAS.map((e) => <option key={e}>{e}</option>)}
              </select>
            </label>
          </div>
          <div className="grade-2">
            <label className="campo">
              Prazo de produção
              <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </label>
            <label className="campo">
              Publicar em
              <input type="date" value={publicar} onChange={(e) => setPublicar(e.target.value)} />
            </label>
          </div>
          <label className="campo">
            Responsável
            <select value={resp} onChange={(e) => setResp(e.target.value)}>
              <option value="">Sem responsável</option>
              {props.equipe.map((m) => <option key={m.user_id} value={m.user_id}>{m.nome}</option>)}
            </select>
          </label>
          <label className="campo">
            Orientações
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={1000} rows={3} />
          </label>
        </>
      )}

      {(podeAndamento || !t) && (
        <>
          <div className="empilha" style={{ gap: 6 }}>
            <div className="campo" style={{ gap: 0 }}>Andamento</div>
            <div className="chips" role="radiogroup" aria-label="Andamento">
              {STATUS.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={status === s} className={`chip${status === s ? " marcado" : ""}`} onClick={() => setStatus(s)}>
                  {NOME_STATUS_TAREFA[s]}
                </button>
              ))}
            </div>
          </div>
          <label className="campo">
            Link do material
            <input value={link} onChange={(e) => setLink(e.target.value)} inputMode="url" placeholder="https://canva.com/… ou link da pasta no Drive" maxLength={500} />
            <span className="ajuda">O app guarda só o link. A arte, a foto ou o vídeo ficam no Canva, Drive ou Instagram.</span>
          </label>
        </>
      )}
      {t && !podeAndamento && (
        <Aviso>Só {nomeDe(props.equipe, t.responsavel_id) === "Sem responsável" ? "o líder" : `${nomeDe(props.equipe, t.responsavel_id)} ou o líder`} atualiza esta tarefa.</Aviso>
      )}
      {t?.link && (
        <a className="botao secundario" href={t.link} target="_blank" rel="noopener noreferrer">
          <Icone nome="link" tamanho={18} /> Abrir material
        </a>
      )}

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {(podeAndamento || !t) && (
        <button className="botao largo" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : t ? "Salvar" : "Criar tarefa"}</button>
      )}
      {gestor && t && (
        <button className="botao perigo" onClick={excluir}><Icone nome="lixo" tamanho={18} /> Apagar tarefa</button>
      )}
    </Folha>
  );
}
