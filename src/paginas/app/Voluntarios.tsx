import { useEffect, useState } from "react";
import { apagar, atualizar, eq, inserir, listar, rpc } from "../../lib/api";
import {
  DIAS_LONGOS,
  NOME_FREQUENCIA,
  NOME_TURNO,
  diferencaDias,
  formatarCurta,
  hojeNoFuso,
  type CultoCostume,
  type Frequencia,
} from "../../lib/escala";
import { COLUNAS_VOLUNTARIO, type VoluntarioDb } from "../../lib/tipos";
import { Aviso, Carregando, Folha, Icone, confirmar, copiarTexto, formatarTelefone, iniciais, toast } from "../../ui";
import { useEquipe } from "./AreaEquipe";

export default function Voluntarios() {
  const { igreja, gestor } = useEquipe();
  const [lista, setLista] = useState<VoluntarioDb[] | null>(null);
  const [telefones, setTelefones] = useState<Map<string, string> | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "atrasados">("todos");
  const [aberto, setAberto] = useState<VoluntarioDb | null>(null);
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState("");
  const hoje = hojeNoFuso(igreja.fuso_horario);
  const link = `${location.origin}/${igreja.slug}`;

  const carregar = () =>
    listar<VoluntarioDb>("volunteers", { select: COLUNAS_VOLUNTARIO, church_id: eq(igreja.id), order: "nome.asc" })
      .then(setLista)
      .catch((e) => setErro((e as Error).message));

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [igreja.id]);

  if (erro && !lista) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!lista) return <Carregando />;

  const atrasado = (v: VoluntarioDb) =>
    !v.disponibilidade_atualizada_em || diferencaDias(v.disponibilidade_atualizada_em.slice(0, 10), hoje) > 30;
  const nAtrasados = lista.filter((v) => v.ativo && atrasado(v)).length;
  const termo = busca.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const visiveis = lista
    .filter((v) => !termo || v.nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(termo))
    .filter((v) => filtro === "todos" || (v.ativo && atrasado(v)));

  const verTelefones = async () => {
    try {
      const r = await rpc<{ id: string; telefone: string }[]>("volunteer_contacts", { p_church: igreja.id });
      setTelefones(new Map(r.map((x) => [x.id, x.telefone])));
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <>
      <div className="linha-flex entre">
        <h1>Voluntários</h1>
        <span className="suave pequeno">{lista.length} {lista.length === 1 ? "cadastrado" : "cadastrados"}</span>
      </div>

      <div className="cartao" style={{ padding: "12px 14px", flexDirection: "row", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
          <div style={{ fontWeight: 600 }}>Link da escala</div>
          <div className="suave" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.replace(/^https?:\/\//, "")}</div>
        </div>
        <button className="botao secundario pequeno" onClick={async () => (await copiarTexto(link)) && toast("Link copiado.")}>
          Copiar
        </button>
      </div>

      <label className="campo">
        <span className="oculto-leitor">Buscar voluntário</span>
        <input placeholder="Buscar pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </label>
      <div className="chips">
        <button className={`chip${filtro === "todos" ? " marcado" : ""}`} onClick={() => setFiltro("todos")}>Todos</button>
        <button className={`chip${filtro === "atrasados" ? " marcado" : ""}`} onClick={() => setFiltro("atrasados")}>
          Sem atualizar há 30 dias ({nAtrasados})
        </button>
        {gestor && <button className="chip" onClick={() => setNovo(true)}>+ Adicionar</button>}
      </div>

      {lista.length === 0 ? (
        <div className="vazio">
          Ninguém cadastrado ainda. Copie o link acima e envie no grupo da mídia: cada pessoa marca quando pode servir.
        </div>
      ) : (
        <ul className="cartao sem-padding" style={{ listStyle: "none", margin: 0 }}>
          {visiveis.map((v) => (
            <li key={v.id}>
              <button className="item-lista" style={{ width: "100%", border: 0, background: "none", textAlign: "left", cursor: "pointer" }} onClick={() => setAberto(v)}>
                <div className="logo" style={{ background: "var(--cinza)", color: "var(--texto-2)", opacity: v.ativo ? 1 : 0.5 }}>{iniciais(v.nome)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{v.nome}{!v.ativo && <span className="selo" style={{ marginLeft: 8 }}>inativo</span>}</div>
                  <div className="pequeno suave">{resumo(v)}</div>
                  {v.ativo && atrasado(v) && <div className="pequeno" style={{ color: "var(--alerta-texto)", fontWeight: 600 }}>Sem atualizar há mais de 30 dias</div>}
                </div>
                <Icone nome="avancar" tamanho={18} />
              </button>
            </li>
          ))}
          {visiveis.length === 0 && <li className="vazio">Ninguém encontrado.</li>}
        </ul>
      )}

      <p className="pequeno suave">Telefones aparecem só para admin e líder, dentro do cadastro de cada pessoa.</p>

      {aberto && (
        <Folha titulo={aberto.nome} aoFechar={() => setAberto(null)}>
          <Detalhe
            v={aberto}
            hoje={hoje}
            gestor={gestor}
            telefone={telefones?.get(aberto.id)}
            aoVerTelefone={verTelefones}
            aoMudar={(v) => {
              setLista(lista.map((x) => (x.id === v.id ? v : x)));
              setAberto(v);
            }}
            aoApagar={() => {
              setLista(lista.filter((x) => x.id !== aberto.id));
              setAberto(null);
            }}
          />
        </Folha>
      )}
      {novo && (
        <NovoVoluntario
          churchId={igreja.id}
          cultos={igreja.cultos_fixos ?? []}
          aoFechar={() => setNovo(false)}
          aoCriar={() => {
            setNovo(false);
            carregar();
            toast("Voluntário adicionado.");
          }}
        />
      )}
    </>
  );
}

function resumo(v: VoluntarioDb): string {
  const partes = [NOME_FREQUENCIA[v.frequencia]];
  if (v.frequencia !== "datas" && v.cultos_costume?.length)
    partes.push(v.cultos_costume.map((c) => `${DIAS_LONGOS[c.dia].slice(0, 3)} ${NOME_TURNO[c.turno].toLowerCase()}`).join(", "));
  if (v.escala_12x36_ref) partes.push("12x36");
  return partes.join(" · ");
}

function Detalhe(props: {
  v: VoluntarioDb;
  hoje: string;
  gestor: boolean;
  telefone?: string;
  aoVerTelefone: () => void;
  aoMudar: (v: VoluntarioDb) => void;
  aoApagar: () => void;
}) {
  const { v } = props;
  const [ocupado, setOcupado] = useState(false);
  const bloqueadas = (v.datas_bloqueadas ?? []).filter((d) => d >= props.hoje);
  const escolhidas = (v.datas_escolhidas ?? []).filter((d) => d >= props.hoje);

  const alternarAtivo = async () => {
    setOcupado(true);
    try {
      const [novo] = await atualizar<VoluntarioDb>("volunteers", { id: eq(v.id) }, { ativo: !v.ativo }, COLUNAS_VOLUNTARIO);
      props.aoMudar(novo);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const apagarCadastro = async () => {
    if (!confirmar(`Apagar o cadastro de ${v.nome}? A pessoa sai das escalas e os dados são apagados. Isso não pode ser desfeito.`)) return;
    setOcupado(true);
    try {
      await apagar("volunteers", { id: eq(v.id) });
      toast("Cadastro apagado.");
      props.aoApagar();
    } catch (e) {
      toast((e as Error).message);
      setOcupado(false);
    }
  };

  const linhas: [string, string][] = [
    ["Frequência", NOME_FREQUENCIA[v.frequencia]],
    ...(v.frequencia !== "datas"
      ? ([["Cultos", v.cultos_costume.map((c) => `${DIAS_LONGOS[c.dia]} · ${NOME_TURNO[c.turno]}`).join(", ") || "—"]] as [string, string][])
      : ([["Datas em que pode", escolhidas.map(formatarCurta).join(", ") || "—"]] as [string, string][])),
    ["12x36", v.escala_12x36_ref ? `sim (trabalhou em ${formatarCurta(v.escala_12x36_ref)})` : "não"],
    ["Não pode", bloqueadas.map(formatarCurta).join(", ") || "—"],
    ["Observação", v.observacao || "—"],
    ["Atualizou", v.disponibilidade_atualizada_em ? new Date(v.disponibilidade_atualizada_em).toLocaleDateString("pt-BR") : "nunca pelo link"],
  ];

  return (
    <>
      <dl className="cartao" style={{ margin: 0, gap: 8 }}>
        {linhas.map(([k, val]) => (
          <div key={k} className="linha-flex entre" style={{ alignItems: "flex-start", fontSize: 15 }}>
            <dt className="suave">{k}</dt>
            <dd style={{ margin: 0, fontWeight: 600, textAlign: "right" }}>{val}</dd>
          </div>
        ))}
      </dl>
      {props.gestor && (
        <div className="empilha" style={{ gap: 8 }}>
          {props.telefone ? (
            <div className="linha-flex entre cartao" style={{ padding: "10px 14px" }}>
              <span>WhatsApp: <strong>{formatarTelefone(props.telefone)}</strong></span>
              <a className="botao secundario pequeno" href={`https://wa.me/${props.telefone}`} target="_blank" rel="noopener noreferrer">Conversar</a>
            </div>
          ) : (
            <button className="botao secundario" onClick={props.aoVerTelefone}>Ver WhatsApp</button>
          )}
          <button className="botao secundario" onClick={alternarAtivo} disabled={ocupado}>
            {v.ativo ? "Marcar como inativo (sai das escalas automáticas)" : "Reativar"}
          </button>
          <button className="botao perigo" onClick={apagarCadastro} disabled={ocupado}>
            <Icone nome="lixo" tamanho={18} /> Apagar cadastro
          </button>
        </div>
      )}
    </>
  );
}

function NovoVoluntario(props: { churchId: string; cultos: { dia: number; turno: CultoCostume["turno"]; nome: string }[]; aoFechar: () => void; aoCriar: () => void }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [frequencia, setFrequencia] = useState<Frequencia>("semanal");
  const [cultos, setCultos] = useState<CultoCostume[]>([]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setErro("");
    const dig = telefone.replace(/\D/g, "");
    if (nome.trim().length < 2) return setErro("Informe o nome.");
    if (dig.length < 10 || dig.length > 11) return setErro("Informe o WhatsApp com DDD.");
    setSalvando(true);
    try {
      await inserir("volunteers", {
        church_id: props.churchId,
        nome: nome.trim(),
        telefone: `55${dig}`,
        frequencia,
        cultos_costume: frequencia === "datas" ? [] : cultos,
      });
      props.aoCriar();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  };

  return (
    <Folha titulo="Adicionar voluntário" aoFechar={props.aoFechar}>
      <p className="pequeno suave">O ideal é a própria pessoa preencher pelo link. Use isto para quem não consegue.</p>
      <label className="campo">Nome<input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} /></label>
      <label className="campo">WhatsApp<input value={telefone} onChange={(e) => setTelefone(formatarTelefone(e.target.value))} inputMode="tel" /></label>
      <label className="campo">
        Frequência
        <select value={frequencia} onChange={(e) => setFrequencia(e.target.value as Frequencia)}>
          {(Object.keys(NOME_FREQUENCIA) as Frequencia[]).map((f) => <option key={f} value={f}>{NOME_FREQUENCIA[f]}</option>)}
        </select>
      </label>
      {frequencia !== "datas" && props.cultos.map((c) => {
        const marcado = cultos.some((x) => x.dia === c.dia && x.turno === c.turno);
        return (
          <label key={`${c.dia}-${c.turno}`} className="check">
            <input
              type="checkbox"
              checked={marcado}
              onChange={() =>
                setCultos(marcado ? cultos.filter((x) => !(x.dia === c.dia && x.turno === c.turno)) : [...cultos, { dia: c.dia, turno: c.turno }])
              }
            />
            {DIAS_LONGOS[c.dia]} · {NOME_TURNO[c.turno]} — {c.nome}
          </label>
        );
      })}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button className="botao largo" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Adicionar"}</button>
    </Folha>
  );
}
