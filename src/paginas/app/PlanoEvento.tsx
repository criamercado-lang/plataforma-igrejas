// Revisar o plano de divulgação antes de criar as tarefas (/app/eventos/:id/plano).
import { useEffect, useState } from "react";
import { eq, listar, rpc } from "../../lib/api";
import { diferencaDias, formatarComDia, hojeNoFuso, somarDias } from "../../lib/escala";
import { ETAPAS, NOME_TIPO, gerarPlano, modeloPorId, type ItemPlano, type MembroEquipe, type TipoTarefa } from "../../lib/eventos/modelos";
import { aoClicarLink, navegar } from "../../lib/rotas";
import { COLUNAS_EVENTO, type EventoDb } from "../../lib/tipos";
import { Aviso, Carregando, Folha, Icone, toast } from "../../ui";
import { useEquipe } from "./AreaEquipe";
import { carregarEquipe } from "./dadosEquipe";
import { periodoEvento } from "./Eventos";

export default function PlanoEvento({ id }: { id: string }) {
  const { igreja, gestor } = useEquipe();
  const hoje = hojeNoFuso(igreja.fuso_horario);
  const [evento, setEvento] = useState<EventoDb | null>(null);
  const [equipe, setEquipe] = useState<MembroEquipe[]>([]);
  const [itens, setItens] = useState<ItemPlano[] | null>(null);
  const [jaCriadas, setJaCriadas] = useState<Set<string>>(new Set());
  const [erroCarga, setErroCarga] = useState("");
  const [erro, setErro] = useState("");
  const [criando, setCriando] = useState(false);
  const [adicionar, setAdicionar] = useState(false);

  useEffect(() => {
    Promise.all([
      listar<EventoDb>("events", { select: COLUNAS_EVENTO, id: eq(id) }),
      carregarEquipe(igreja.id),
      listar<{ chave: string | null }>("tasks", { select: "chave", event_id: eq(id) }),
    ])
      .then(([[ev], eq_, ts]) => {
        if (!ev) throw new Error("Evento não encontrado");
        const criadas = new Set(ts.map((t) => t.chave ?? ""));
        setEvento(ev);
        setEquipe(eq_);
        setJaCriadas(criadas);
        setItens(gerarPlano(modeloPorId(ev.modelo), ev.data_inicio, hoje, eq_).filter((i) => !criadas.has(i.chave)));
      })
      .catch((e) => setErroCarga((e as Error).message));
  }, [id, igreja.id, hoje]);

  if (erroCarga) return <Aviso tipo="erro">{erroCarga}</Aviso>;
  if (!evento || !itens) return <Carregando />;
  if (!gestor) return <Aviso>Só admin e líder revisam o plano.</Aviso>;

  const modelo = modeloPorId(evento.modelo);
  const vencidos = itens.filter((i) => i.prazo < hoje);
  const muda = (chave: string, dados: Partial<ItemPlano>) =>
    setItens((l) => l!.map((i) => (i.chave === chave ? { ...i, ...dados } : i)));
  const remover = (chave: string) => setItens((l) => l!.filter((i) => i.chave !== chave));
  const reprogramar = (i: ItemPlano, data: string) =>
    muda(i.chave, { prazo: data, publicar_em: i.publicar_em && i.publicar_em < data ? data : i.publicar_em });

  const confirmarPlano = async () => {
    setErro("");
    if (vencidos.length) return setErro("Resolva os itens com prazo vencido: fazer hoje, amanhã ou remover.");
    setCriando(true);
    try {
      const n = await rpc<number>("create_event_tasks", {
        p_event: evento.id,
        p_tarefas: itens.map(({ vencido: _v, ...i }) => i),
      });
      toast(n === 1 ? "1 tarefa criada." : `${n} tarefas criadas.`);
      navegar(`/app/eventos/${evento.id}`);
    } catch (e) {
      setErro((e as Error).message);
      setCriando(false);
    }
  };

  const faltam = diferencaDias(hoje, evento.data_inicio);

  return (
    <>
      <a href={`/app/eventos/${evento.id}`} onClick={aoClicarLink} className="linha-flex pequeno" style={{ gap: 4, textDecoration: "none" }}>
        <Icone nome="voltar" tamanho={18} /> {evento.nome}
      </a>
      <h1>Revisar plano de divulgação</h1>
      <p className="suave">
        Modelo <strong>{modelo.nome}</strong> · {periodoEvento(evento)}
        {faltam > 0 ? ` · faltam ${faltam} dias` : ""}. Nada é criado antes de você confirmar.
      </p>

      {jaCriadas.size > 0 && (
        <Aviso>Este evento já tem {jaCriadas.size} tarefa(s). Aqui aparecem só os itens que ainda não foram criados.</Aviso>
      )}
      {vencidos.length > 0 && (
        <Aviso tipo="alerta">
          <strong>{vencidos.length} {vencidos.length === 1 ? "item com prazo vencido" : "itens com prazo vencido"}.</strong> O evento foi cadastrado com pouco tempo.
          Escolha fazer hoje, amanhã ou remover cada um.
        </Aviso>
      )}

      {ETAPAS.map((etapa) => {
        const doGrupo = itens.filter((i) => i.etapa === etapa).sort((a, b) => a.prazo.localeCompare(b.prazo) || a.ordem - b.ordem);
        if (!doGrupo.length) return null;
        return (
          <section key={etapa} className="cartao sem-padding">
            <h2 style={{ padding: "14px 16px 4px" }}>{etapa} <span className="pequeno suave">· {doGrupo.length}</span></h2>
            {doGrupo.map((i) => (
              <div key={i.chave} className="item-lista" style={{ alignItems: "flex-start", flexDirection: "column", gap: 8 }}>
                <div className="linha-flex entre" style={{ width: "100%", alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{i.titulo}</div>
                    <div className="pequeno suave">
                      {NOME_TIPO[i.tipo as TipoTarefa] ?? i.tipo} · produção até {formatarComDia(i.prazo)}
                      {i.publicar_em ? ` · publicar ${formatarComDia(i.publicar_em)}` : ""}
                    </div>
                  </div>
                  <button className="icone-botao" style={{ width: 36, height: 36 }} aria-label={`Remover ${i.titulo}`} onClick={() => remover(i.chave)}>
                    <Icone nome="fechar" tamanho={18} />
                  </button>
                </div>
                {i.prazo < hoje ? (
                  <div className="linha-flex" style={{ flexWrap: "wrap", gap: 6 }}>
                    <span className="selo alerta">prazo vencido: {formatarComDia(i.prazo)}</span>
                    <button className="chip" onClick={() => reprogramar(i, hoje)}>Fazer hoje</button>
                    <button className="chip" onClick={() => reprogramar(i, somarDias(hoje, 1))}>Amanhã</button>
                    <button className="chip" onClick={() => remover(i.chave)}>Remover</button>
                  </div>
                ) : null}
                <label className="campo" style={{ width: "100%", gap: 4 }}>
                  <span className="oculto-leitor">Responsável por {i.titulo}</span>
                  <select value={i.responsavel_id ?? ""} onChange={(e) => muda(i.chave, { responsavel_id: e.target.value || null })} style={{ minHeight: 42 }}>
                    <option value="">Sem responsável</option>
                    {equipe.map((m) => (
                      <option key={m.user_id} value={m.user_id}>{m.nome}</option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </section>
        );
      })}

      {itens.length === 0 && <div className="vazio">Nenhum item para criar.</div>}

      <button className="botao tracejado" onClick={() => setAdicionar(true)}>+ Adicionar item</button>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button className="botao largo" onClick={confirmarPlano} disabled={criando || itens.length === 0}>
        {criando ? "Criando…" : `Confirmar e criar ${itens.length} ${itens.length === 1 ? "tarefa" : "tarefas"}`}
      </button>
      <p className="pequeno suave" style={{ textAlign: "center" }}>Gerar de novo não duplica nada.</p>

      {adicionar && (
        <NovoItem
          hoje={hoje}
          padrao={evento.data_inicio < hoje ? hoje : somarDias(evento.data_inicio, -3)}
          equipe={equipe}
          aoFechar={() => setAdicionar(false)}
          aoAdicionar={(item) => {
            setItens((l) => [...l!, { ...item, ordem: l!.length + 100 }]);
            setAdicionar(false);
          }}
        />
      )}
    </>
  );
}

function NovoItem(props: {
  hoje: string;
  padrao: string;
  equipe: MembroEquipe[];
  aoFechar: () => void;
  aoAdicionar: (i: Omit<ItemPlano, "ordem">) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoTarefa>("post");
  const [etapa, setEtapa] = useState<(typeof ETAPAS)[number]>("Divulgação");
  const [prazo, setPrazo] = useState(props.padrao);
  const [resp, setResp] = useState("");
  const [erro, setErro] = useState("");

  const adicionar = () => {
    if (titulo.trim().length < 2) return setErro("Dê um título ao item.");
    if (!prazo || prazo < props.hoje) return setErro("O prazo precisa ser hoje ou depois.");
    props.aoAdicionar({
      chave: `extra-${Date.now().toString(36)}`,
      titulo: titulo.trim(),
      tipo,
      etapa,
      prazo,
      publicar_em: null,
      responsavel_id: resp || null,
      descricao: null,
      vencido: false,
    });
  };

  return (
    <Folha titulo="Adicionar item" aoFechar={props.aoFechar}>
      <label className="campo">
        O que precisa ser feito
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} placeholder="Ex.: Arte para o telão" />
      </label>
      <div className="grade-2">
        <label className="campo">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoTarefa)}>
            {Object.entries(NOME_TIPO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </label>
        <label className="campo">
          Etapa
          <select value={etapa} onChange={(e) => setEtapa(e.target.value as (typeof ETAPAS)[number])}>
            {ETAPAS.map((e) => <option key={e}>{e}</option>)}
          </select>
        </label>
      </div>
      <div className="grade-2">
        <label className="campo">
          Prazo
          <input type="date" value={prazo} min={props.hoje} onChange={(e) => setPrazo(e.target.value)} />
        </label>
        <label className="campo">
          Responsável
          <select value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">Sem responsável</option>
            {props.equipe.map((m) => <option key={m.user_id} value={m.user_id}>{m.nome}</option>)}
          </select>
        </label>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button className="botao largo" onClick={adicionar}>Adicionar ao plano</button>
    </Folha>
  );
}
