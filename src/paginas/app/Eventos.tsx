// Eventos da igreja: lista, datas comemorativas e cadastro (criar / editar).
import { useEffect, useMemo, useState } from "react";
import { eq, listar, rpc } from "../../lib/api";
import { DIAS_LONGOS, NOME_TURNO, TURNOS, formatarComDia, formatarCurta, hojeNoFuso, intervalo, diaDaSemana, diferencaDias, type Turno } from "../../lib/escala";
import { MODELOS, modeloPorId, proximasDatas } from "../../lib/eventos/modelos";
import { aoClicarLink, navegar } from "../../lib/rotas";
import { COLUNAS_EVENTO, NOME_STATUS_EVENTO, type EventoDb, type Igreja, type TarefaDb } from "../../lib/tipos";
import { Aviso, Carregando, Folha } from "../../ui";
import { useEquipe } from "./AreaEquipe";

export function periodoEvento(e: Pick<EventoDb, "data_inicio" | "data_fim">): string {
  return e.data_inicio === e.data_fim
    ? formatarComDia(e.data_inicio)
    : `${formatarComDia(e.data_inicio)} a ${formatarComDia(e.data_fim)}`;
}

export default function Eventos() {
  const { igreja, gestor } = useEquipe();
  const [eventos, setEventos] = useState<EventoDb[] | null>(null);
  const [tarefas, setTarefas] = useState<Pick<TarefaDb, "event_id" | "status">[]>([]);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState<Partial<FormEvento> | null>(null);
  const [verPassados, setVerPassados] = useState(false);
  const hoje = hojeNoFuso(igreja.fuso_horario);

  useEffect(() => {
    setEventos(null);
    Promise.all([
      listar<EventoDb>("events", { select: COLUNAS_EVENTO, church_id: eq(igreja.id), order: "data_inicio.asc" }),
      listar<Pick<TarefaDb, "event_id" | "status">>("tasks", { select: "event_id,status", church_id: eq(igreja.id), event_id: "not.is.null" }),
    ])
      .then(([e, t]) => {
        setEventos(e);
        setTarefas(t);
      })
      .catch((e) => setErro((e as Error).message));
  }, [igreja.id]);

  const sugestoes = useMemo(() => {
    const ja = new Set((eventos ?? []).map((e) => e.data_inicio));
    return proximasDatas(hoje).filter((d) => !ja.has(d.data)).slice(0, 4);
  }, [eventos, hoje]);

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!eventos) return <Carregando />;

  const proximos = eventos.filter((e) => e.data_fim >= hoje && e.status !== "cancelado");
  const passados = eventos.filter((e) => e.data_fim < hoje || e.status === "cancelado").reverse();

  const cartao = (e: EventoDb) => {
    const ts = tarefas.filter((t) => t.event_id === e.id);
    const feitas = ts.filter((t) => t.status === "feito").length;
    const faltam = diferencaDias(hoje, e.data_inicio);
    return (
      <a key={e.id} className="item-lista" href={`/app/eventos/${e.id}`} onClick={aoClicarLink} style={{ textDecoration: "none", color: "var(--texto)" }}>
        <span className="ponto evento" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{e.nome}</div>
          <div className="pequeno suave">
            {periodoEvento(e)}
            {faltam > 0 && e.data_fim >= hoje ? ` · faltam ${faltam} dias` : faltam === 0 ? " · é hoje" : ""}
            {ts.length > 0 && ` · ${feitas} de ${ts.length} prontas`}
          </div>
        </div>
        <span className={`selo${e.status === "divulgacao" ? " evento" : e.status === "realizado" ? " ok" : ""}`}>{NOME_STATUS_EVENTO[e.status]}</span>
      </a>
    );
  };

  return (
    <>
      <div className="linha-flex entre">
        <h1>Eventos</h1>
        {gestor && <button className="botao pequeno" onClick={() => setNovo({})}>+ Novo evento</button>}
      </div>

      {proximos.length === 0 ? (
        <div className="vazio">Nenhum evento pela frente. {gestor ? "Cadastre um evento ou escolha uma data abaixo." : ""}</div>
      ) : (
        <div className="cartao sem-padding">{proximos.map(cartao)}</div>
      )}

      {gestor && sugestoes.length > 0 && (
        <section className="cartao">
          <h2>Datas comemorativas</h2>
          <p className="pequeno suave">Nada entra no calendário sozinho. Escolha a data, confirme e revise o plano.</p>
          <div className="empilha" style={{ gap: 8 }}>
            {sugestoes.map((s) => (
              <button
                key={s.nome + s.data}
                className="botao secundario"
                style={{ justifyContent: "space-between" }}
                onClick={() => setNovo({ nome: s.nome, modelo: s.modelo, data_inicio: s.data, data_fim: s.data })}
              >
                <span>{s.nome}</span>
                <span className="pequeno suave">{formatarComDia(s.data)} · faltam {diferencaDias(hoje, s.data)} dias</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {passados.length > 0 && (
        <>
          <button className="botao tracejado" onClick={() => setVerPassados((v) => !v)}>
            {verPassados ? "Esconder eventos passados" : `Ver eventos passados (${passados.length})`}
          </button>
          {verPassados && <div className="cartao sem-padding">{passados.map(cartao)}</div>}
        </>
      )}

      {novo && (
        <Folha titulo="Novo evento" aoFechar={() => setNovo(null)}>
          <FormularioEvento
            igreja={igreja}
            inicial={novo}
            aoSalvar={(id) => navegar(`/app/eventos/${id}/plano`)}
          />
        </Folha>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Formulário (novo e editar)
// ---------------------------------------------------------------------------
export interface FormEvento {
  nome: string;
  modelo: string;
  data_inicio: string;
  data_fim: string;
  dias: { data: string; turno: Turno }[];
  horario: string;
  local: string;
  tema: string;
  versiculo: string;
  convidados: string;
  objetivo: string;
  canais: string[];
}

const CANAIS = ["Instagram", "WhatsApp", "Aviso no culto", "YouTube", "Telão"];

/** Dias da escala sugeridos: os cultos fixos daquele dia da semana, ou a noite. */
function diasSugeridos(igreja: Igreja, inicio: string, fim: string): { data: string; turno: Turno }[] {
  if (!inicio || !fim || fim < inicio || diferencaDias(inicio, fim) > 31) return [];
  return intervalo(inicio, fim).flatMap((data) => {
    const fixos = (igreja.cultos_fixos ?? []).filter((c) => c.dia === diaDaSemana(data));
    return fixos.length ? fixos.map((c) => ({ data, turno: c.turno })) : [{ data, turno: "noite" as Turno }];
  });
}

export function FormularioEvento(props: {
  igreja: Igreja;
  eventoId?: string;
  inicial: Partial<FormEvento>;
  aoSalvar: (id: string) => void;
}) {
  const { igreja } = props;
  const editando = !!props.eventoId;
  const [f, setF] = useState<FormEvento>(() => {
    const ini = props.inicial;
    const inicio = ini.data_inicio ?? "";
    const fim = ini.data_fim ?? inicio;
    return {
      nome: ini.nome ?? "",
      modelo: ini.modelo ?? "culto_especial",
      data_inicio: inicio,
      data_fim: fim,
      dias: ini.dias ?? diasSugeridos(igreja, inicio, fim),
      horario: ini.horario ?? "",
      local: ini.local ?? "",
      tema: ini.tema ?? "",
      versiculo: ini.versiculo ?? "",
      convidados: ini.convidados ?? "",
      objetivo: ini.objetivo ?? "",
      canais: ini.canais ?? ["Instagram", "WhatsApp", "Aviso no culto"],
    };
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const muda = <K extends keyof FormEvento>(k: K, v: FormEvento[K]) => setF((x) => ({ ...x, [k]: v }));

  const mudaDatas = (inicio: string, fim: string) =>
    setF((x) => ({ ...x, data_inicio: inicio, data_fim: fim, dias: diasSugeridos(igreja, inicio, fim) }));

  const temDia = (data: string, turno: Turno) => f.dias.some((d) => d.data === data && d.turno === turno);
  const alternarDia = (data: string, turno: Turno) =>
    muda("dias", temDia(data, turno) ? f.dias.filter((d) => !(d.data === data && d.turno === turno)) : [...f.dias, { data, turno }]);

  const datasDoEvento = f.data_inicio && f.data_fim >= f.data_inicio && diferencaDias(f.data_inicio, f.data_fim) <= 31
    ? intervalo(f.data_inicio, f.data_fim)
    : [];
  const modelo = modeloPorId(f.modelo);
  const hoje = hojeNoFuso(igreja.fuso_horario);
  const pouco = f.data_inicio && !editando ? diferencaDias(hoje, f.data_inicio) < modelo.antecedencia : false;

  const salvar = async () => {
    setErro("");
    if (f.nome.trim().length < 2) return setErro("Dê um nome ao evento.");
    if (!f.data_inicio) return setErro("Informe a data do evento.");
    if (f.data_fim < f.data_inicio) return setErro("A data final não pode ser antes do início.");
    if (diferencaDias(f.data_inicio, f.data_fim) > 31) return setErro("O evento pode durar no máximo 1 mês.");
    setSalvando(true);
    try {
      const id = await rpc<string>("save_event", { p_church: igreja.id, p_id: props.eventoId ?? null, p_dados: f });
      props.aoSalvar(id);
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  };

  return (
    <div className="empilha" style={{ gap: 14 }}>
      {!editando && (
        <div className="empilha" role="radiogroup" aria-label="Modelo de campanha" style={{ gap: 8 }}>
          <div className="campo" style={{ gap: 0 }}>Modelo de campanha</div>
          {MODELOS.map((m) => (
            <label key={m.id} className={`opcao${f.modelo === m.id ? " marcada" : ""}`}>
              <input type="radio" name="modelo" checked={f.modelo === m.id} onChange={() => muda("modelo", m.id)} />
              <span>
                <span className="titulo-opcao">{m.nome}</span>
                <span className="desc-opcao">{m.resumo} {m.itens.length} itens.</span>
              </span>
            </label>
          ))}
        </div>
      )}

      <label className="campo">
        Nome do evento
        <input value={f.nome} onChange={(e) => muda("nome", e.target.value)} maxLength={120} placeholder="Ex.: Conferência de Jovens" />
      </label>
      <div className="grade-2">
        <label className="campo">
          Início
          <input type="date" value={f.data_inicio} onChange={(e) => mudaDatas(e.target.value, f.data_fim < e.target.value || !f.data_fim ? e.target.value : f.data_fim)} />
        </label>
        <label className="campo">
          Fim
          <input type="date" value={f.data_fim} min={f.data_inicio} onChange={(e) => mudaDatas(f.data_inicio, e.target.value)} />
        </label>
      </div>
      {pouco && (
        <Aviso tipo="alerta">
          O ideal para este modelo é começar {modelo.antecedencia} dias antes. Os itens com prazo vencido aparecem marcados no plano para você decidir.
        </Aviso>
      )}

      {datasDoEvento.length > 0 && (
        <div className="empilha" style={{ gap: 8 }}>
          <div className="campo" style={{ gap: 2 }}>
            Dias na escala da mídia
            <span className="ajuda">Esses cultos entram na escala com o nome do evento.</span>
          </div>
          {datasDoEvento.map((data) => (
            <div key={data} className="linha-flex" style={{ flexWrap: "wrap", gap: 6 }}>
              <span className="pequeno" style={{ width: 92, fontWeight: 600 }} title={DIAS_LONGOS[diaDaSemana(data)]}>{formatarComDia(data)}</span>
              {TURNOS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`chip${temDia(data, t) ? " marcado" : ""}`}
                  aria-pressed={temDia(data, t)}
                  onClick={() => alternarDia(data, t)}
                >
                  {NOME_TURNO[t]}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="grade-2">
        <label className="campo">
          Horário
          <input value={f.horario} onChange={(e) => muda("horario", e.target.value)} maxLength={60} placeholder="19h30" />
        </label>
        <label className="campo">
          Local
          <input value={f.local} onChange={(e) => muda("local", e.target.value)} maxLength={120} placeholder="Templo sede" />
        </label>
      </div>
      <label className="campo">
        Tema
        <input value={f.tema} onChange={(e) => muda("tema", e.target.value)} maxLength={200} />
      </label>
      <label className="campo">
        Versículo
        <input value={f.versiculo} onChange={(e) => muda("versiculo", e.target.value)} maxLength={300} placeholder="Referência ou texto" />
      </label>
      <label className="campo">
        Convidados
        <input value={f.convidados} onChange={(e) => muda("convidados", e.target.value)} maxLength={300} />
        <span className="ajuda">Só divulgue quem já confirmou.</span>
      </label>
      <label className="campo">
        Objetivo da comunicação
        <textarea value={f.objetivo} onChange={(e) => muda("objetivo", e.target.value)} maxLength={500} rows={2} placeholder="Ex.: levar os jovens a convidar um amigo" />
      </label>
      <div className="empilha" style={{ gap: 6 }}>
        <div className="campo" style={{ gap: 0 }}>Canais</div>
        <div className="chips">
          {CANAIS.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip${f.canais.includes(c) ? " marcado" : ""}`}
              aria-pressed={f.canais.includes(c)}
              onClick={() => muda("canais", f.canais.includes(c) ? f.canais.filter((x) => x !== c) : [...f.canais, c])}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button className="botao largo" onClick={salvar} disabled={salvando}>
        {salvando ? "Salvando…" : editando ? "Salvar evento" : "Criar evento e revisar plano"}
      </button>
      {!editando && f.data_inicio && (
        <p className="pequeno suave" style={{ textAlign: "center" }}>
          Nenhuma tarefa é criada antes de você revisar o plano · {formatarCurta(f.data_inicio)}
        </p>
      )}
    </div>
  );
}
