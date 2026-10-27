import { useEffect, useMemo, useState } from "react";
import { apagar, atualizar, eq, inserir } from "../../lib/api";
import {
  NOME_TURNO,
  TURNOS,
  conferirEscala,
  formatarComDia,
  formatarCurta,
  linkWhatsApp,
  motivoIndisponivel,
  ordenarCultos,
  pessoasNecessarias,
  textoEscalaWhatsApp,
  type Atribuicao,
  type Culto,
  type Funcao,
  type Turno,
} from "../../lib/escala";
import { aoClicarLink, navegar } from "../../lib/rotas";
import { Aviso, Carregando, Folha, Icone, confirmar, copiarTexto, toast } from "../../ui";
import { useEquipe } from "./AreaEquipe";
import { carregarDados, montar, salvar, type DadosEscala } from "./dadosEscala";

type Troca = { culto: Culto; funcao: Funcao; atual: string | null };

export default function EditorEscala({ id }: { id: string }) {
  const { igreja, gestor } = useEquipe();
  const [dados, setDados] = useState<DadosEscala | null>(null);
  const [atrib, setAtrib] = useState<Atribuicao[]>([]);
  const [alterado, setAlterado] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [troca, setTroca] = useState<Troca | null>(null);
  const [enviar, setEnviar] = useState(false);
  const [novoCulto, setNovoCulto] = useState(false);

  useEffect(() => {
    carregarDados(id)
      .then((d) => {
        setDados(d);
        setAtrib(d.atribuicoes);
      })
      .catch((e) => setErro((e as Error).message));
  }, [id]);

  useEffect(() => {
    if (!alterado) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [alterado]);

  const avisos = useMemo(
    () => (dados ? conferirEscala(atrib, dados.cultos, dados.voluntarios, dados.anteriores) : []),
    [dados, atrib],
  );

  if (erro && !dados) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;

  const { escala, funcoes, voluntarios } = dados;
  const cultos = ordenarCultos(dados.cultos);
  const nomes = new Map(voluntarios.map((v) => [v.id, v.nome]));
  const avisoDe = (a: Atribuicao) =>
    avisos.find((x) => x.atribuicao.service_id === a.service_id && x.atribuicao.volunteer_id === a.volunteer_id && x.atribuicao.ministry_role_id === a.ministry_role_id)?.motivo;

  let faltando = 0;
  for (const c of cultos)
    for (const f of funcoes) faltando += Math.max(0, pessoasNecessarias(c, f) - atrib.filter((a) => a.service_id === c.id && a.ministry_role_id === f.id).length);

  const contagem = voluntarios
    .map((v) => ({ nome: v.nome, n: atrib.filter((a) => a.volunteer_id === v.id).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, "pt-BR"));

  const executar = async (f: () => Promise<void>) => {
    setErro("");
    setOcupado(true);
    try {
      await f();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const montarDeNovo = () => {
    if (atrib.length && !confirmar("Montar de novo substitui a escala atual, inclusive as trocas que você fez. Continuar?")) return;
    const r = montar({ ...dados, atribuicoes: [] });
    setAtrib(r.atribuicoes);
    setAlterado(true);
    toast(r.incompletos.length ? "Escala montada. Alguns cultos ficaram incompletos." : "Escala montada.");
  };

  const gravar = () =>
    executar(async () => {
      await salvar(escala.id, atrib);
      setAlterado(false);
      toast("Escala salva.");
    });

  const mudarPessoas = (culto: Culto, funcao: Funcao, delta: number) =>
    executar(async () => {
      const n = Math.max(0, Math.min(20, pessoasNecessarias(culto, funcao) + delta));
      const mapa = { ...culto.pessoas_por_funcao, [funcao.id]: n };
      await atualizar("services", { id: eq(culto.id) }, { pessoas_por_funcao: mapa });
      setDados({ ...dados, cultos: dados.cultos.map((c) => (c.id === culto.id ? { ...c, pessoas_por_funcao: mapa } : c)) });
    });

  const escolher = (t: Troca, volunteerId: string | null) => {
    let nova = atrib.filter((a) => !(t.atual && a.service_id === t.culto.id && a.ministry_role_id === t.funcao.id && a.volunteer_id === t.atual));
    if (volunteerId) nova = [...nova, { service_id: t.culto.id, ministry_role_id: t.funcao.id, volunteer_id: volunteerId }];
    setAtrib(nova);
    setAlterado(true);
    setTroca(null);
  };

  const removerCulto = (c: Culto) =>
    executar(async () => {
      if (!confirmar(`Remover ${c.nome} de ${formatarComDia(c.data)} da escala? Quem estava escalado nele sai também.`)) return;
      await apagar("services", { id: eq(c.id) });
      setDados({ ...dados, cultos: dados.cultos.filter((x) => x.id !== c.id) });
      setAtrib(atrib.filter((a) => a.service_id !== c.id));
    });

  const apagarEscala = () =>
    executar(async () => {
      if (!confirmar("Apagar esta escala? Os cultos continuam cadastrados, só as pessoas escaladas saem.")) return;
      await apagar("schedules", { id: eq(escala.id) });
      setAlterado(false);
      navegar("/app");
    });

  const texto = textoEscalaWhatsApp({
    igreja: igreja.nome,
    inicio: escala.inicio,
    fim: escala.fim,
    cultos,
    funcoes,
    atribuicoes: atrib,
    nomes,
    versiculos: igreja.versiculos ?? [],
    linkCalendario: `${location.origin}/${igreja.slug}/calendario`,
  });

  return (
    <>
      <div className="linha-flex" style={{ gap: 4 }}>
        <a href="/app" onClick={aoClicarLink} className="icone-botao" aria-label="Voltar para as escalas" style={{ marginLeft: -10, color: "var(--texto)" }}>
          <Icone nome="voltar" />
        </a>
        <div style={{ flex: 1 }}>
          <div className="pequeno suave">Escala da mídia</div>
          <h1 style={{ fontSize: 22 }}>{formatarCurta(escala.inicio)} a {formatarCurta(escala.fim)}</h1>
        </div>
        <span className={`selo${escala.status === "enviada" ? " ok" : ""}`}>{escala.status === "enviada" ? "Enviada" : "Rascunho"}</span>
      </div>

      <div className="numeros">
        <div><strong>{cultos.length}</strong><span>cultos</span></div>
        <div className={faltando ? "ruim" : ""}><strong>{faltando}</strong><span>{faltando === 1 ? "vaga faltando" : "vagas faltando"}</span></div>
        <div className={avisos.length ? "medio" : ""}><strong>{avisos.length}</strong><span>{avisos.length === 1 ? "aviso" : "avisos"}</span></div>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {alterado && <Aviso tipo="alerta">Há mudanças não salvas.</Aviso>}

      {gestor && (
        <div className="grade-2">
          <button className="botao secundario" onClick={montarDeNovo} disabled={ocupado}>
            <Icone nome="refazer" tamanho={18} /> Montar de novo
          </button>
          <button className="botao secundario" onClick={() => setNovoCulto(true)} disabled={ocupado}>
            + Culto ou evento
          </button>
        </div>
      )}
      {gestor && cultos.length > 0 && <p className="pequeno suave" style={{ marginTop: -4 }}>Toque num nome para trocar a pessoa.</p>}

      {cultos.length === 0 && (
        <div className="vazio">Nenhum culto neste período. {gestor ? "Adicione um culto ou evento." : ""}</div>
      )}

      {cultos.map((c) => (
        <article key={c.id} className="cartao sem-padding">
          <div className="linha-flex" style={{ padding: "10px 8px 10px 14px", background: "#fafaf8", borderBottom: "1px solid var(--linha)" }}>
            <span className={`ponto${c.tipo === "evento" ? " evento" : ""}`} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{formatarComDia(c.data)}</strong> <span className="suave">· {NOME_TURNO[c.turno]} · {c.nome}</span>
            </div>
            {c.tipo === "evento" && <span className="selo evento">evento</span>}
            {gestor && (
              <button className="icone-botao" onClick={() => removerCulto(c)} aria-label={`Remover ${c.nome} de ${formatarComDia(c.data)}`} disabled={ocupado}>
                <Icone nome="lixo" tamanho={18} />
              </button>
            )}
          </div>
          <div style={{ padding: "4px 14px 10px" }}>
            {funcoes.map((f) => {
              const doPapel = atrib.filter((a) => a.service_id === c.id && a.ministry_role_id === f.id);
              const precisa = pessoasNecessarias(c, f);
              const falta = Math.max(0, precisa - doPapel.length);
              const avisosLinha = doPapel.map((a) => ({ a, m: avisoDe(a) })).filter((x) => x.m);
              return (
                <div key={f.id} style={{ padding: "8px 0", borderTop: "1px solid var(--linha-2)" }}>
                  <div className="linha-flex" style={{ alignItems: "flex-start" }}>
                    <div style={{ width: 84, flex: "none", paddingTop: 7, fontSize: 14 }} className="suave">{f.nome}</div>
                    <div className="chips" style={{ flex: 1 }}>
                      {doPapel.map((a) => (
                        <button
                          key={a.volunteer_id}
                          className={`chip${avisoDe(a) ? " aviso-chip" : ""}`}
                          disabled={!gestor}
                          onClick={() => setTroca({ culto: c, funcao: f, atual: a.volunteer_id })}
                        >
                          {nomes.get(a.volunteer_id) ?? "?"}
                        </button>
                      ))}
                      {falta > 0 && (
                        <button className="chip falta" disabled={!gestor} onClick={() => setTroca({ culto: c, funcao: f, atual: null })}>
                          + falta {falta}
                        </button>
                      )}
                      {precisa === 0 && doPapel.length === 0 && <span className="pequeno suave" style={{ paddingTop: 8 }}>não precisa</span>}
                    </div>
                    {gestor && (
                      <div className="linha-flex" style={{ gap: 2 }} aria-label={`Pessoas em ${f.nome}`}>
                        <button className="icone-botao" style={{ width: 34, height: 34, border: "1px solid var(--campo)" }} onClick={() => mudarPessoas(c, f, -1)} disabled={ocupado || precisa === 0} aria-label={`Menos uma pessoa em ${f.nome}`}>
                          <Icone nome="menos" tamanho={16} />
                        </button>
                        <span style={{ width: 20, textAlign: "center", fontWeight: 700, fontSize: 14 }}>{precisa}</span>
                        <button className="icone-botao" style={{ width: 34, height: 34, border: "1px solid var(--campo)" }} onClick={() => mudarPessoas(c, f, 1)} disabled={ocupado} aria-label={`Mais uma pessoa em ${f.nome}`}>
                          <Icone nome="mais" tamanho={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  {avisosLinha.map((x) => (
                    <div key={x.a.volunteer_id} className="aviso alerta pequeno" style={{ marginTop: 6, padding: "8px 10px" }}>
                      {nomes.get(x.a.volunteer_id)}: {x.m}.
                    </div>
                  ))}
                </div>
              );
            })}
            {funcoes.length === 0 && <p className="pequeno suave" style={{ padding: "10px 0" }}>Cadastre as funções da mídia em Ajustes.</p>}
          </div>
        </article>
      ))}

      {contagem.length > 0 && (
        <section className="cartao">
          <h2 style={{ fontSize: 15 }}>Quantas vezes cada um foi escalado</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px 16px", fontSize: 14 }}>
            {contagem.map((k) => (
              <div key={k.nome} className="linha-flex entre" style={{ borderBottom: "1px solid var(--linha-2)", padding: "4px 0" }}>
                <span>{k.nome}</span>
                <strong>{k.n}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      {gestor && (
        <div className="empilha" style={{ gap: 8 }}>
          <button className="botao largo" onClick={() => setEnviar(true)} disabled={ocupado || cultos.length === 0}>
            <Icone nome="whatsapp" tamanho={20} /> Enviar escala no grupo
          </button>
          <button className="botao largo secundario" onClick={gravar} disabled={ocupado || !alterado}>
            {alterado ? "Salvar rascunho" : "Tudo salvo"}
          </button>
          <button className="botao perigo pequeno" style={{ alignSelf: "center", marginTop: 8 }} onClick={apagarEscala} disabled={ocupado}>
            Apagar esta escala
          </button>
        </div>
      )}

      {troca && (
        <FolhaTroca
          troca={troca}
          dados={dados}
          atrib={atrib}
          aoFechar={() => setTroca(null)}
          aoEscolher={(v) => escolher(troca, v)}
        />
      )}

      {enviar && (
        <FolhaEnviar
          texto={texto}
          faltando={faltando}
          jaEnviada={escala.status === "enviada"}
          aoFechar={() => setEnviar(false)}
          aoConfirmar={async () => {
            await salvar(escala.id, atrib);
            if (escala.status !== "enviada") {
              await atualizar("schedules", { id: eq(escala.id) }, { status: "enviada", enviada_em: new Date().toISOString() });
              setDados({ ...dados, escala: { ...escala, status: "enviada" } });
            }
            setAlterado(false);
          }}
        />
      )}

      {novoCulto && (
        <FolhaNovoCulto
          inicio={escala.inicio}
          fim={escala.fim}
          aoFechar={() => setNovoCulto(false)}
          aoCriar={async (c) => {
            const [novo] = await inserir<Culto>("services", { ...c, church_id: igreja.id }, "id,data,turno,nome,tipo,pessoas_por_funcao");
            setDados({ ...dados, cultos: [...dados.cultos, { ...novo, pessoas_por_funcao: novo.pessoas_por_funcao ?? {} }] });
            setNovoCulto(false);
            toast("Adicionado. Use “+ falta” para escalar as pessoas.");
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- trocar pessoa
function FolhaTroca(props: { troca: Troca; dados: DadosEscala; atrib: Atribuicao[]; aoFechar: () => void; aoEscolher: (v: string | null) => void }) {
  const { culto, funcao, atual } = props.troca;
  const noCulto = new Set(props.atrib.filter((a) => a.service_id === culto.id).map((a) => a.volunteer_id));
  const outrosDoDia = new Set(
    props.atrib
      .filter((a) => a.service_id !== culto.id && props.dados.cultos.find((c) => c.id === a.service_id)?.data === culto.data)
      .map((a) => a.volunteer_id),
  );
  const vezes = (id: string) => props.atrib.filter((a) => a.volunteer_id === id).length;

  const lista = props.dados.voluntarios
    .filter((v) => v.ativo && v.id !== atual)
    .map((v) => {
      let motivo = motivoIndisponivel(v, culto);
      if (!motivo && outrosDoDia.has(v.id)) motivo = "já está escalado em outro culto neste dia";
      return { v, motivo, aqui: noCulto.has(v.id) };
    })
    .sort((a, b) => Number(a.aqui) - Number(b.aqui) || Number(!!a.motivo) - Number(!!b.motivo) || vezes(a.v.id) - vezes(b.v.id) || a.v.nome.localeCompare(b.v.nome, "pt-BR"));

  const nomeAtual = atual ? props.dados.voluntarios.find((v) => v.id === atual)?.nome : null;

  return (
    <Folha titulo={`${funcao.nome} · ${formatarComDia(culto.data)}`} aoFechar={props.aoFechar}>
      {nomeAtual && (
        <div className="linha-flex entre cartao" style={{ padding: "10px 14px" }}>
          <span>Agora: <strong>{nomeAtual}</strong></span>
          <button className="botao perigo pequeno" onClick={() => props.aoEscolher(null)}>Tirar da escala</button>
        </div>
      )}
      <div className="cartao sem-padding">
        {lista.map(({ v, motivo, aqui }) => (
          <button
            key={v.id}
            className="item-lista"
            style={{ width: "100%", border: 0, background: "none", textAlign: "left", cursor: aqui ? "not-allowed" : "pointer", opacity: aqui ? 0.5 : 1 }}
            disabled={aqui}
            onClick={() => props.aoEscolher(v.id)}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{v.nome}</div>
              <div className="pequeno" style={{ color: aqui ? "var(--suave)" : motivo ? "var(--alerta-texto)" : "var(--ok)" }}>
                {aqui ? "já está neste culto" : motivo ? `Indisponível: ${motivo}` : "Disponível"}
                {v.observacao ? ` · “${v.observacao}”` : ""}
              </div>
            </div>
            <span className="pequeno suave">{vezes(v.id)}×</span>
          </button>
        ))}
        {lista.length === 0 && <div className="vazio">Nenhum voluntário ativo.</div>}
      </div>
      <p className="pequeno suave">Você pode escolher alguém indisponível; a escala mostra o aviso.</p>
    </Folha>
  );
}

// ---------------------------------------------------------------- enviar
function FolhaEnviar(props: { texto: string; faltando: number; jaEnviada: boolean; aoFechar: () => void; aoConfirmar: () => Promise<void> }) {
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState(false);

  const preparar = async () => {
    setErro("");
    try {
      await props.aoConfirmar();
      setFeito(true);
      return true;
    } catch (e) {
      setErro((e as Error).message);
      return false;
    }
  };

  return (
    <Folha titulo="Enviar no grupo" aoFechar={props.aoFechar}>
      {props.faltando > 0 && (
        <Aviso tipo="alerta">Ainda {props.faltando === 1 ? "falta 1 pessoa" : `faltam ${props.faltando} pessoas`}. Você pode enviar assim mesmo ou completar antes.</Aviso>
      )}
      <div className="pequeno suave" style={{ fontWeight: 600 }}>Prévia da mensagem</div>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 15, background: "#e9f5ec", borderRadius: "4px 16px 16px 16px", padding: "14px 16px" }}>
        {props.texto}
      </pre>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <a
        className="botao largo"
        href={linkWhatsApp(props.texto)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={async (e) => {
          if (feito) return;
          e.preventDefault();
          const janela = window.open("", "_blank");
          if (await preparar()) {
            if (janela) janela.location.href = linkWhatsApp(props.texto);
            else location.href = linkWhatsApp(props.texto);
          } else janela?.close();
        }}
      >
        <Icone nome="whatsapp" /> Abrir no WhatsApp
      </a>
      <button
        className="botao largo secundario"
        onClick={async () => {
          if ((feito || (await preparar())) && (await copiarTexto(props.texto))) toast("Texto copiado. Cole no grupo.");
        }}
      >
        <Icone nome="copiar" tamanho={18} /> Copiar texto
      </button>
      <p className="pequeno suave">
        {props.jaEnviada || feito
          ? "A escala está publicada no calendário público."
          : "Ao enviar, a escala sai de rascunho e aparece no calendário público. No WhatsApp, você escolhe o grupo."}
      </p>
    </Folha>
  );
}

// ---------------------------------------------------------------- novo culto/evento
function FolhaNovoCulto(props: {
  inicio: string;
  fim: string;
  aoFechar: () => void;
  aoCriar: (c: { data: string; turno: Turno; nome: string; tipo: "culto" | "evento" }) => Promise<void>;
}) {
  const [data, setData] = useState(props.inicio);
  const [turno, setTurno] = useState<Turno>("noite");
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"culto" | "evento">("evento");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const criar = async () => {
    setErro("");
    if (!data || data < props.inicio || data > props.fim) return setErro(`Escolha uma data entre ${formatarCurta(props.inicio)} e ${formatarCurta(props.fim)}.`);
    if (nome.trim().length < 2) return setErro("Dê um nome (ex.: Conferência, Culto especial).");
    setSalvando(true);
    try {
      await props.aoCriar({ data, turno, nome: nome.trim(), tipo });
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  };

  return (
    <Folha titulo="Adicionar culto ou evento" aoFechar={props.aoFechar}>
      <div className="grade-2">
        <label className="campo">
          Data
          <input type="date" value={data} min={props.inicio} max={props.fim} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="campo">
          Turno
          <select value={turno} onChange={(e) => setTurno(e.target.value as Turno)}>
            {TURNOS.map((t) => <option key={t} value={t}>{NOME_TURNO[t]}</option>)}
          </select>
        </label>
      </div>
      <label className="campo">
        Nome
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Conferência" maxLength={80} />
      </label>
      <div className="grade-2">
        {(["evento", "culto"] as const).map((t) => (
          <label key={t} className={`opcao${tipo === t ? " marcada" : ""}`} style={{ alignItems: "center" }}>
            <input type="radio" checked={tipo === t} onChange={() => setTipo(t)} />
            <span className="titulo-opcao">{t === "evento" ? "Evento especial" : "Culto"}</span>
          </label>
        ))}
      </div>
      <p className="pequeno suave">Em evento especial, entram todos que não bloquearam a data e não estão trabalhando, mesmo fora dos cultos de costume.</p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button className="botao largo" onClick={criar} disabled={salvando}>{salvando ? "Adicionando…" : "Adicionar"}</button>
    </Folha>
  );
}
