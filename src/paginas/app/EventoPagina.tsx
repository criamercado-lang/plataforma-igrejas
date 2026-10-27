// Página do evento (/app/eventos/:id): dados, progresso da campanha, tarefas por etapa e escala.
import { useCallback, useEffect, useState } from "react";
import { apagar, atualizar, eq, listar } from "../../lib/api";
import { NOME_TURNO, diferencaDias, formatarComDia, hojeNoFuso, type Turno } from "../../lib/escala";
import { ETAPAS, modeloPorId, type MembroEquipe } from "../../lib/eventos/modelos";
import { aoClicarLink, navegar } from "../../lib/rotas";
import { COLUNAS_EVENTO, COLUNAS_TAREFA, NOME_STATUS_EVENTO, type EventoDb, type StatusEvento, type TarefaDb } from "../../lib/tipos";
import { Aviso, Carregando, Folha, Icone, confirmar, toast } from "../../ui";
import { useEquipe } from "./AreaEquipe";
import { carregarEquipe } from "./dadosEquipe";
import { FormularioEvento, periodoEvento } from "./Eventos";
import { FolhaTarefa, LinhaTarefa } from "./Tarefas";

interface CultoEvento {
  id: string;
  data: string;
  turno: Turno;
}

export default function EventoPagina({ id }: { id: string }) {
  const { igreja, gestor } = useEquipe();
  const hoje = hojeNoFuso(igreja.fuso_horario);
  const [evento, setEvento] = useState<EventoDb | null>(null);
  const [tarefas, setTarefas] = useState<TarefaDb[]>([]);
  const [equipe, setEquipe] = useState<MembroEquipe[]>([]);
  const [cultos, setCultos] = useState<(CultoEvento & { escalados: number })[]>([]);
  const [erro, setErro] = useState("");
  const [erroAcao, setErroAcao] = useState("");
  const [aberta, setAberta] = useState<TarefaDb | "nova" | null>(null);
  const [editando, setEditando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [[ev], ts, eq_, cs] = await Promise.all([
        listar<EventoDb>("events", { select: COLUNAS_EVENTO, id: eq(id) }),
        listar<TarefaDb>("tasks", { select: COLUNAS_TAREFA, event_id: eq(id), order: "prazo.asc,ordem.asc" }),
        carregarEquipe(igreja.id),
        listar<CultoEvento>("services", { select: "id,data,turno", event_id: eq(id), order: "data.asc" }),
      ]);
      if (!ev) throw new Error("Evento não encontrado");
      const atrib = cs.length
        ? await listar<{ service_id: string; schedule_id: string }>("assignments", {
            select: "service_id,schedule_id",
            service_id: `in.(${cs.map((c) => c.id).join(",")})`,
          })
        : [];
      setEvento(ev);
      setTarefas(ts);
      setEquipe(eq_);
      setCultos(cs.map((c) => ({ ...c, escalados: atrib.filter((a) => a.service_id === c.id).length })));
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [id, igreja.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!evento) return <Carregando />;

  const feitas = tarefas.filter((t) => t.status === "feito").length;
  const fazendo = tarefas.filter((t) => t.status === "fazendo").length;
  const atrasadas = tarefas.filter((t) => t.status !== "feito" && t.prazo && t.prazo < hoje).length;
  const faltam = diferencaDias(hoje, evento.data_inicio);
  const pct = tarefas.length ? Math.round((feitas / tarefas.length) * 100) : 0;

  const mudarStatus = async (s: StatusEvento) => {
    try {
      await atualizar("events", { id: eq(evento.id) }, { status: s });
      toast(`Evento marcado como “${NOME_STATUS_EVENTO[s].toLowerCase()}”.`);
      carregar();
    } catch (e) {
      setErroAcao((e as Error).message);
    }
  };

  const excluir = async () => {
    if (!confirmar(`Apagar “${evento.nome}” e as ${tarefas.length} tarefas dele? Os dias do evento saem da escala se ninguém estiver escalado.`)) return;
    try {
      await apagar("events", { id: eq(evento.id) });
      toast("Evento apagado.");
      navegar("/app/eventos");
    } catch (e) {
      setErroAcao((e as Error).message);
    }
  };

  const info: [string, string | null][] = [
    ["Quando", periodoEvento(evento) + (evento.horario ? ` · ${evento.horario}` : "")],
    ["Local", evento.local],
    ["Tema", evento.tema],
    ["Versículo", evento.versiculo],
    ["Convidados", evento.convidados],
    ["Objetivo", evento.objetivo],
    ["Canais", evento.canais.length ? evento.canais.join(", ") : null],
  ];

  return (
    <>
      <a href="/app/eventos" onClick={aoClicarLink} className="linha-flex pequeno" style={{ gap: 4, textDecoration: "none" }}>
        <Icone nome="voltar" tamanho={18} /> Eventos
      </a>
      <div className="empilha" style={{ gap: 6 }}>
        <div className="linha-flex" style={{ gap: 6, flexWrap: "wrap" }}>
          <span className="selo">{modeloPorId(evento.modelo).nome}</span>
          <span className={`selo${evento.status === "divulgacao" ? " evento" : evento.status === "realizado" ? " ok" : ""}`}>{NOME_STATUS_EVENTO[evento.status]}</span>
          {faltam > 0 && evento.status !== "cancelado" && <span className="selo alerta">faltam {faltam} dias</span>}
        </div>
        <h1>{evento.nome}</h1>
      </div>

      <section className="cartao">
        {info.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <div className="pequeno suave" style={{ fontWeight: 600 }}>{k}</div>
            <div>{v}</div>
          </div>
        ))}
        {gestor && <button className="botao secundario pequeno" onClick={() => setEditando(true)}>Editar dados do evento</button>}
      </section>

      <section className="cartao">
        <div className="linha-flex entre">
          <h2>Progresso da campanha</h2>
          <strong>{feitas} de {tarefas.length}</strong>
        </div>
        {tarefas.length > 0 ? (
          <>
            <div style={{ height: 10, borderRadius: 99, background: "var(--cinza)", overflow: "hidden" }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tarefas prontas">
              <div style={{ width: `${pct}%`, height: "100%", background: "var(--ok)" }} />
            </div>
            <div className="numeros">
              <div><strong>{feitas}</strong><span>prontas</span></div>
              <div className={fazendo ? "medio" : ""}><strong>{fazendo}</strong><span>em produção</span></div>
              <div className={atrasadas ? "ruim" : ""}><strong>{atrasadas}</strong><span>atrasadas</span></div>
            </div>
          </>
        ) : (
          <p className="suave">O plano ainda não foi confirmado.</p>
        )}
        {gestor && (
          <a className="botao" href={`/app/eventos/${evento.id}/plano`} onClick={aoClicarLink}>
            {tarefas.length ? "Revisar plano" : "Revisar plano e criar tarefas"}
          </a>
        )}
      </section>

      {ETAPAS.map((etapa) => {
        const doGrupo = tarefas.filter((t) => t.etapa === etapa);
        if (!doGrupo.length) return null;
        return (
          <section key={etapa} className="cartao sem-padding">
            <h2 style={{ padding: "14px 16px 4px" }}>{etapa} <span className="pequeno suave">· {doGrupo.filter((t) => t.status === "feito").length}/{doGrupo.length}</span></h2>
            {doGrupo.map((t) => <LinhaTarefa key={t.id} t={t} equipe={equipe} hoje={hoje} aoAbrir={() => setAberta(t)} />)}
          </section>
        );
      })}
      {(() => {
        const outras = tarefas.filter((t) => !(ETAPAS as readonly string[]).includes(t.etapa));
        return outras.length > 0 ? (
          <section className="cartao sem-padding">
            <h2 style={{ padding: "14px 16px 4px" }}>Outras</h2>
            {outras.map((t) => <LinhaTarefa key={t.id} t={t} equipe={equipe} hoje={hoje} aoAbrir={() => setAberta(t)} />)}
          </section>
        ) : null;
      })()}
      {gestor && tarefas.length > 0 && <button className="botao tracejado" onClick={() => setAberta("nova")}>+ Tarefa neste evento</button>}

      <section className="cartao">
        <h2>Escala de mídia nos dias do evento</h2>
        {cultos.length === 0 ? (
          <p className="suave">Nenhum dia do evento está na escala.{gestor ? " Edite o evento para marcar os dias." : ""}</p>
        ) : (
          cultos.map((c) => (
            <div key={c.id} className="linha-flex entre">
              <span><strong>{formatarComDia(c.data)}</strong> · {NOME_TURNO[c.turno]}</span>
              {c.escalados > 0 ? <span className="selo ok">{c.escalados} escalados</span> : <span className="selo alerta">escala ainda não montada</span>}
            </div>
          ))
        )}
        {cultos.length > 0 && <a href="/app" onClick={aoClicarLink} className="pequeno">Ir para as escalas</a>}
      </section>

      {gestor && (
        <section className="empilha">
          {erroAcao && <Aviso tipo="erro">{erroAcao}</Aviso>}
          {evento.status !== "realizado" && evento.data_inicio <= hoje && (
            <button className="botao secundario" onClick={() => mudarStatus("realizado")}>Marcar como realizado</button>
          )}
          {evento.status !== "cancelado" ? (
            <button className="botao secundario" onClick={() => mudarStatus("cancelado")}>Cancelar evento</button>
          ) : (
            <button className="botao secundario" onClick={() => mudarStatus("divulgacao")}>Reativar evento</button>
          )}
          <button className="botao perigo" onClick={excluir}><Icone nome="lixo" tamanho={18} /> Apagar evento</button>
        </section>
      )}

      {editando && (
        <Folha titulo="Editar evento" aoFechar={() => setEditando(false)}>
          <FormularioEvento
            igreja={igreja}
            eventoId={evento.id}
            inicial={{
              ...evento,
              horario: evento.horario ?? "",
              local: evento.local ?? "",
              tema: evento.tema ?? "",
              versiculo: evento.versiculo ?? "",
              convidados: evento.convidados ?? "",
              objetivo: evento.objetivo ?? "",
            }}
            aoSalvar={() => {
              setEditando(false);
              toast("Evento salvo.");
              carregar();
            }}
          />
        </Folha>
      )}

      {aberta && (
        <FolhaTarefa
          tarefa={aberta === "nova" ? null : aberta}
          equipe={equipe}
          eventos={[{ id: evento.id, nome: evento.nome }]}
          eventoFixo={evento.id}
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
