// Página pública da escala: /{igreja} (calendário + formulário) e /{igreja}/calendario (só calendário).
// Sem conta. O aparelho guarda um código para reconhecer a pessoa da próxima vez.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import {
  DIAS_LONGOS,
  NOME_TURNO,
  diaDaSemana,
  diferencaDias,
  eDiaDeTrabalho,
  formatarCurta,
  hojeNoFuso,
  somarDias,
  versiculoDoPeriodo,
  type CultoCostume,
  type Frequencia,
  type Turno,
} from "../lib/escala";
import type { Igreja } from "../lib/tipos";
import { aoClicarLink } from "../lib/rotas";
import { Aviso, Carregando, Folha, Icone, Logo, aplicarCor, formatarTelefone } from "../ui";
import { CalendarioMes, mesSeguinte, nomeMes } from "./CalendarioMes";
import { CHAVE_TURNSTILE, Turnstile } from "../Turnstile";

interface CultoPublico {
  id: string;
  data: string;
  turno: Turno;
  nome: string;
  tipo: "culto" | "evento";
  eu_escalado: boolean;
  escalados: { funcao: string; nomes: string[] }[];
}

interface Eu {
  id: string;
  nome: string;
  frequencia: Frequencia;
  escala_12x36_ref: string | null;
  cultos_costume: CultoCostume[];
  datas_bloqueadas: string[];
  datas_escolhidas: string[];
  observacao: string | null;
  disponibilidade_atualizada_em: string | null;
}

interface Formulario {
  nome: string;
  telefone: string;
  frequencia: Frequencia | "";
  trabalha12: "nao" | "sim" | "";
  ref12: string;
  cultos: CultoCostume[];
  bloqueadas: string[];
  escolhidas: string[];
  observacao: string;
}

const MENSAGENS_ERRO: Record<string, string> = {
  nome_invalido: "Informe seu nome (pelo menos 2 letras).",
  telefone_invalido: "WhatsApp inválido. Use o DDD e o número.",
  frequencia_invalida: "Escolha com que frequência você pode servir.",
  dados_invalidos: "Confira os dados preenchidos.",
  data_12x36_invalida: "Confira o dia em que você trabalhou (12x36).",
  cultos_invalidos: "Confira os cultos marcados.",
  datas_demais: "Datas demais marcadas.",
  observacao_longa: "A observação pode ter até 500 caracteres.",
  precisa_confirmar_nome: "O nome não confere com o cadastro deste número.",
  identifique_se: "Preencha seus dados abaixo antes de marcar que não pode.",
  data_passada: "Essa data já passou.",
};

// ---------------------------------------------------------------- aparelho
const chave = (slug: string, k: string) => `escala:${slug}:${k}`;
function lerLocal(slug: string, k: string): string {
  try {
    return localStorage.getItem(chave(slug, k)) ?? "";
  } catch {
    return "";
  }
}
function gravarLocal(slug: string, k: string, v: string) {
  try {
    localStorage.setItem(chave(slug, k), v);
  } catch {
    /* sem armazenamento: o código vale só nesta visita */
  }
}

function formVazio(slug: string): Formulario {
  return {
    nome: lerLocal(slug, "nome"),
    telefone: formatarTelefone(lerLocal(slug, "telefone")),
    frequencia: "",
    trabalha12: "",
    ref12: "",
    cultos: [],
    bloqueadas: [],
    escolhidas: [],
    observacao: "",
  };
}

function formDe(eu: Eu, base: Formulario): Formulario {
  return {
    ...base,
    nome: eu.nome,
    frequencia: eu.frequencia,
    trabalha12: eu.frequencia === "datas" ? "" : eu.escala_12x36_ref ? "sim" : "nao",
    ref12: eu.escala_12x36_ref ?? "",
    cultos: eu.cultos_costume ?? [],
    bloqueadas: eu.datas_bloqueadas ?? [],
    escolhidas: eu.datas_escolhidas ?? [],
    observacao: eu.observacao ?? "",
  };
}

const primeiroDia = (mes: string) => `${mes}-01`;
const ultimoDia = (mes: string) => somarDias(primeiroDia(mesSeguinte(mes, 1)), -1);

// ---------------------------------------------------------------- página
export default function PaginaEscala({ slug, soCalendario }: { slug: string; soCalendario: boolean }) {
  const [igreja, setIgreja] = useState<Igreja | null>(null);
  const [naoExiste, setNaoExiste] = useState(false);
  const [erroCarga, setErroCarga] = useState("");
  const [mes, setMes] = useState("");
  const [cultos, setCultos] = useState<CultoPublico[]>([]);
  const [eu, setEu] = useState<Eu | null>(null);
  const [token, setToken] = useState(() => lerLocal(slug, "token"));
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [form, setForm] = useState<Formulario>(() => formVazio(slug));
  const [carregando, setCarregando] = useState(true);

  const hoje = useMemo(() => hojeNoFuso(igreja?.fuso_horario), [igreja]);

  const carregar = useCallback(
    async (m: string) => {
      setCarregando(true);
      setErroCarga("");
      try {
        const r = await api<{ igreja: Igreja; calendario: { cultos: CultoPublico[]; eu: Eu | null } }>(
          `/api/publico/${encodeURIComponent(slug)}?inicio=${primeiroDia(m)}&fim=${ultimoDia(m)}`,
          { headers: token ? { "X-Device-Token": token } : {} },
        );
        setIgreja(r.igreja);
        aplicarCor(r.igreja.cor_principal);
        document.title = `Escala da Mídia · ${r.igreja.nome}`;
        setCultos(r.calendario.cultos);
        if (r.calendario.eu) {
          setEu(r.calendario.eu);
          setForm((f) => (f.frequencia ? f : formDe(r.calendario.eu!, f)));
        }
      } catch (e) {
        const err = e as { status?: number; message: string };
        if (err.status === 404) setNaoExiste(true);
        else setErroCarga(err.message);
      } finally {
        setCarregando(false);
      }
    },
    [slug, token],
  );

  useEffect(() => {
    const m = hojeNoFuso().slice(0, 7);
    setMes(m);
    carregar(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trocarMes = (delta: number) => {
    const m = mesSeguinte(mes, delta);
    setMes(m);
    carregar(m);
  };

  if (naoExiste) {
    return (
      <main className="tela">
        <h1>Página não encontrada</h1>
        <p className="suave">Confira o link que você recebeu da sua igreja.</p>
      </main>
    );
  }
  if (!igreja) return erroCarga ? <main className="tela"><Aviso tipo="erro">{erroCarga}</Aviso></main> : <Carregando />;

  if (salvo && eu) {
    const v = versiculoDoPeriodo(igreja.versiculos ?? [], hoje);
    return (
      <main className="tela" style={{ minHeight: "100dvh", justifyContent: "center", gap: 22 }}>
        <div className="logo grande" style={{ background: "var(--cor)" }} aria-hidden="true">
          <Icone nome="certo" tamanho={30} />
        </div>
        <div className="empilha" style={{ gap: 8 }}>
          <h1 style={{ fontSize: 28 }}>Pronto, {eu.nome.split(" ")[0]}!</h1>
          <p style={{ color: "var(--texto-2)" }}>Sua disponibilidade foi salva. O líder usa essas informações para montar a próxima escala.</p>
        </div>
        <ResumoEu eu={eu} />
        {v && (
          <figure className="cartao" style={{ margin: 0 }}>
            <blockquote style={{ margin: 0, fontSize: 17, fontStyle: "italic" }}>“{v.texto}”</blockquote>
            <figcaption className="suave pequeno">{v.referencia}</figcaption>
          </figure>
        )}
        <button className="botao largo secundario" onClick={() => { setSalvo(false); carregar(mes); }}>
          Ver a escala no calendário
        </button>
      </main>
    );
  }

  const cultosPorDia = new Map<string, CultoPublico[]>();
  for (const c of cultos) cultosPorDia.set(c.data, [...(cultosPorDia.get(c.data) ?? []), c]);
  const meusDias = cultos.filter((c) => c.eu_escalado).map((c) => c.data);
  const v = versiculoDoPeriodo(igreja.versiculos ?? [], primeiroDia(mes || hoje.slice(0, 7)));

  return (
    <>
      <header className="cabecalho">
        <Logo nome={igreja.nome} logoPath={igreja.logo_path} />
        <div className="nome-igreja">{igreja.nome}</div>
        <a href="/app" onClick={aoClicarLink} style={{ fontSize: 14, fontWeight: 600, textDecoration: "none", padding: "12px 0" }}>
          Equipe
        </a>
      </header>
      <main className="tela">
        <div className="empilha" style={{ gap: 6 }}>
          <div className="pequeno suave" style={{ fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Mídia</div>
          <h1>{soCalendario ? "Escala da mídia" : "Quando você pode servir?"}</h1>
          {!soCalendario && <p className="suave">Veja a escala no calendário e marque quando pode servir. Mudou algo? Volte aqui e atualize.</p>}
        </div>

        {eu && (
          <div className="cartao" style={{ padding: "12px 14px" }}>
            <div>
              Olá, <strong>{eu.nome.split(" ")[0]}</strong>.{" "}
              {meusDias.length > 0
                ? <>Você está escalado em <strong>{meusDias.length} {meusDias.length === 1 ? "dia" : "dias"}</strong> de {nomeMes(mes).toLowerCase()}.</>
                : <>Você não está escalado em {nomeMes(mes).toLowerCase()}.</>}
            </div>
          </div>
        )}

        <section className="cartao" aria-label="Calendário da escala">
          <CalendarioMes
            mes={mes}
            hoje={hoje}
            aoMudarMes={trocarMes}
            carregando={carregando}
            celula={(data) => {
              const doDia = cultosPorDia.get(data) ?? [];
              const escalado = doDia.some((c) => c.eu_escalado);
              const bloqueado = !!eu && (eu.datas_bloqueadas.includes(data) || eDiaDeTrabalho(eu, data));
              const evento = doDia.some((c) => c.tipo === "evento");
              return {
                classe: `${doDia.length ? "tem-culto" : ""} ${escalado ? "escalado" : ""} ${bloqueado && !escalado ? "riscado" : ""}`,
                ponto: doDia.length ? (escalado ? "#fff" : evento ? "var(--evento)" : "var(--culto)") : null,
                rotulo: `${doDia.length ? `${doDia.length} culto(s)` : "sem culto"}${escalado ? ", você está escalado" : ""}${bloqueado ? ", não pode" : ""}`,
                clicavel: doDia.length > 0,
              };
            }}
            aoTocarDia={setDiaAberto}
          />
          <div className="legenda">
            <span><span className="ponto" />culto</span>
            <span><span className="ponto evento" />evento especial</span>
            {eu && <span><span style={{ width: 14, height: 14, borderRadius: 4, background: "var(--cor)" }} />você está escalado</span>}
            {eu && <span><span style={{ textDecoration: "line-through" }}>15</span>não pode</span>}
          </div>
        </section>

        {erroCarga && <Aviso tipo="erro">{erroCarga}</Aviso>}

        {v && (
          <figure style={{ margin: 0, padding: "0 4px", color: "var(--texto-2)" }}>
            <blockquote style={{ margin: 0, fontStyle: "italic" }}>“{v.texto}”</blockquote>
            <figcaption className="pequeno suave" style={{ marginTop: 4 }}>{v.referencia}</figcaption>
          </figure>
        )}

        {soCalendario ? (
          <a className="botao largo" href={`/${slug}`} onClick={aoClicarLink}>Marcar minha disponibilidade</a>
        ) : (
          <FormularioDisponibilidade
            slug={slug}
            igreja={igreja}
            hoje={hoje}
            form={form}
            setForm={setForm}
            eu={eu}
            token={token}
            aoSalvar={(novoEu, novoToken) => {
              setEu(novoEu);
              if (novoToken) {
                setToken(novoToken);
                gravarLocal(slug, "token", novoToken);
              }
              gravarLocal(slug, "nome", novoEu.nome);
              gravarLocal(slug, "telefone", form.telefone.replace(/\D/g, ""));
              setSalvo(true);
              window.scrollTo(0, 0);
            }}
            aoEncontrar={(achado) => {
              setEu(achado);
              setForm((f) => formDe(achado, f));
            }}
          />
        )}
      </main>

      {diaAberto && (
        <FolhaDia
          slug={slug}
          data={diaAberto}
          cultos={cultosPorDia.get(diaAberto) ?? []}
          podeMarcar={!!eu && !!token && diaAberto >= hoje}
          bloqueado={!!eu && eu.datas_bloqueadas.includes(diaAberto)}
          token={token}
          aoFechar={() => setDiaAberto(null)}
          aoMarcar={(novoEu) => {
            setEu(novoEu);
            setForm((f) => ({ ...f, bloqueadas: novoEu.datas_bloqueadas, escolhidas: novoEu.datas_escolhidas }));
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- dia tocado
function FolhaDia(props: {
  slug: string;
  data: string;
  cultos: CultoPublico[];
  podeMarcar: boolean;
  bloqueado: boolean;
  token: string;
  aoFechar: () => void;
  aoMarcar: (eu: Eu) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "alerta"; texto: string } | null>(null);
  const titulo = `${DIAS_LONGOS[diaDaSemana(props.data)]}, ${formatarCurta(props.data)}`;

  const naoPosso = async () => {
    setEnviando(true);
    setMsg(null);
    try {
      const r = await api<{ ok: boolean; erro?: string; estava_escalado?: boolean; voluntario?: Eu }>(
        `/api/publico/${encodeURIComponent(props.slug)}/nao-posso`,
        { method: "POST", headers: { "Content-Type": "application/json", "X-Device-Token": props.token }, body: JSON.stringify({ data: props.data }) },
      );
      if (!r.ok) {
        setMsg({ tipo: "erro", texto: MENSAGENS_ERRO[r.erro ?? ""] ?? "Não foi possível marcar." });
        return;
      }
      props.aoMarcar(r.voluntario!);
      setMsg(
        r.estava_escalado
          ? { tipo: "alerta", texto: "Pronto. Você estava escalado neste dia: o líder vai ver o aviso para trocar você. Avise também no grupo." }
          : { tipo: "ok", texto: "Pronto. Esta data ficou marcada como “não posso”." },
      );
    } catch (e) {
      setMsg({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Folha titulo={titulo} aoFechar={props.aoFechar}>
      {props.cultos.map((c) => (
        <div key={c.id} className="cartao sem-padding">
          <div className="linha-flex" style={{ padding: "14px 16px", background: "#fafaf8", borderBottom: "1px solid var(--linha)" }}>
            <span className={`ponto${c.tipo === "evento" ? " evento" : ""}`} />
            <strong style={{ flex: 1 }}>{c.nome}</strong>
            <span className="suave pequeno">{NOME_TURNO[c.turno]}</span>
          </div>
          <dl style={{ margin: 0, padding: "4px 16px 8px" }}>
            {c.escalados.length === 0 && <div className="suave pequeno" style={{ padding: "10px 0" }}>A escala deste culto ainda não foi enviada.</div>}
            {c.escalados.map((f) => (
              <div key={f.funcao} className="linha-flex entre" style={{ padding: "10px 0", borderTop: "1px solid var(--linha-2)" }}>
                <dt className="suave">{f.funcao}</dt>
                <dd style={{ margin: 0, fontWeight: 600, textAlign: "right" }}>{f.nomes.join(", ")}</dd>
              </div>
            ))}
          </dl>
          {c.eu_escalado && <div className="selo cor" style={{ margin: "0 16px 12px", alignSelf: "flex-start" }}>você está escalado</div>}
        </div>
      ))}
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      {props.podeMarcar && !props.bloqueado && !msg && (
        <div className="empilha" style={{ gap: 8 }}>
          <button className="botao largo perigo" onClick={naoPosso} disabled={enviando}>
            {enviando ? "Marcando…" : "Não posso neste dia"}
          </button>
          <p className="pequeno suave" style={{ textAlign: "center" }}>
            A data fica bloqueada e o líder vê o aviso para trocar você na escala. Se puder, avise também no grupo.
          </p>
        </div>
      )}
      {props.bloqueado && !msg && <Aviso tipo="info">Você já marcou que não pode neste dia.</Aviso>}
      {!props.podeMarcar && !props.bloqueado && props.data >= hojeNoFuso() && (
        <p className="pequeno suave">Para marcar que não pode, preencha seus dados no formulário da página.</p>
      )}
    </Folha>
  );
}

// ---------------------------------------------------------------- resumo
function ResumoEu({ eu }: { eu: Eu }) {
  const futuras = eu.datas_bloqueadas.filter((d) => d >= hojeNoFuso());
  const escolhidas = eu.datas_escolhidas.filter((d) => d >= hojeNoFuso());
  const nomesFreq: Record<Frequencia, string> = { semanal: "Toda semana", quinzenal: "De 15 em 15 dias", datas: "Só datas escolhidas" };
  return (
    <div className="cartao" style={{ gap: 10, fontSize: 15 }}>
      <div className="linha-flex entre"><span className="suave">Frequência</span><strong>{nomesFreq[eu.frequencia]}</strong></div>
      {eu.frequencia !== "datas" && (
        <div className="linha-flex entre" style={{ alignItems: "flex-start" }}>
          <span className="suave">Cultos</span>
          <strong style={{ textAlign: "right" }}>{eu.cultos_costume.map((c) => `${DIAS_LONGOS[c.dia]} · ${NOME_TURNO[c.turno]}`).join(", ") || "—"}</strong>
        </div>
      )}
      {eu.frequencia === "datas" && (
        <div className="linha-flex entre"><span className="suave">Datas</span><strong>{escolhidas.map(formatarCurta).join(", ") || "—"}</strong></div>
      )}
      <div className="linha-flex entre"><span className="suave">Não pode</span><strong>{futuras.map(formatarCurta).join(", ") || "—"}</strong></div>
    </div>
  );
}

// ---------------------------------------------------------------- formulário
function FormularioDisponibilidade(props: {
  slug: string;
  igreja: Igreja;
  hoje: string;
  form: Formulario;
  setForm: (f: (f: Formulario) => Formulario) => void;
  eu: Eu | null;
  token: string;
  aoSalvar: (eu: Eu, token: string | null) => void;
  aoEncontrar: (eu: Eu) => void;
}) {
  const { form, setForm, igreja, hoje } = props;
  const [precisaNome, setPrecisaNome] = useState(false);
  const [nomeConfirmado, setNomeConfirmado] = useState("");
  const [erro, setErro] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [mesDatas, setMesDatas] = useState(hoje.slice(0, 7));
  const [telefoneBuscado, setTelefoneBuscado] = useState(form.telefone.replace(/\D/g, ""));
  const [robo, setRobo] = useState("");
  const [versaoRobo, setVersaoRobo] = useState(0);

  const muda = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setForm((f) => ({ ...f, [k]: v }));
  const soDatas = form.frequencia === "datas";

  const desatualizado =
    props.eu?.disponibilidade_atualizada_em &&
    diferencaDias(props.eu.disponibilidade_atualizada_em.slice(0, 10), hoje) > 30;

  const buscar = async () => {
    const digitos = form.telefone.replace(/\D/g, "");
    if (digitos.length < 10 || digitos === telefoneBuscado) return;
    setTelefoneBuscado(digitos);
    try {
      const r = await api<{ encontrado: boolean; voluntario?: Eu; precisa_confirmar_nome?: boolean }>(
        `/api/publico/${encodeURIComponent(props.slug)}/buscar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(props.token ? { "X-Device-Token": props.token } : {}) },
          body: JSON.stringify({ telefone: digitos }),
        },
      );
      if (r.voluntario) {
        props.aoEncontrar(r.voluntario);
        setPrecisaNome(false);
      } else setPrecisaNome(!!r.precisa_confirmar_nome);
    } catch {
      /* a busca é só uma ajuda; o salvar confere de novo */
    }
  };

  const alternarData = (lista: "bloqueadas" | "escolhidas", data: string) =>
    setForm((f) => ({
      ...f,
      [lista]: f[lista].includes(data) ? f[lista].filter((d) => d !== data) : [...f[lista], data].sort(),
    }));

  const alternarCulto = (c: CultoCostume) =>
    setForm((f) => ({
      ...f,
      cultos: f.cultos.some((x) => x.dia === c.dia && x.turno === c.turno)
        ? f.cultos.filter((x) => !(x.dia === c.dia && x.turno === c.turno))
        : [...f.cultos, c],
    }));

  const validar = (): boolean => {
    const e: Record<string, string> = {};
    if (form.nome.trim().length < 2) e.nome = "Informe seu nome.";
    const dig = form.telefone.replace(/\D/g, "");
    if (dig.length < 10 || dig.length > 13) e.telefone = "Informe o WhatsApp com DDD.";
    if (!form.frequencia) e.frequencia = "Escolha uma opção.";
    if (form.frequencia && !soDatas && !form.trabalha12) e.trabalha12 = "Responda se trabalha em 12x36.";
    if (form.trabalha12 === "sim" && !soDatas && !form.ref12) e.ref12 = "Informe um dia em que você trabalhou.";
    if (form.frequencia && !soDatas && form.cultos.length === 0 && (igreja.cultos_fixos ?? []).length > 0) e.cultos = "Marque pelo menos um culto.";
    if (soDatas && form.escolhidas.filter((d) => d >= hoje).length === 0) e.datas = "Marque pelo menos uma data em que pode servir.";
    if (precisaNome && nomeConfirmado.trim().length < 2) e.confirmar = "Digite seu nome completo como está no cadastro.";
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const salvar = async () => {
    setErro("");
    if (!validar()) {
      setErro("Confira os campos marcados.");
      return;
    }
    if (CHAVE_TURNSTILE && !robo) {
      setErro("Aguarde a verificação de segurança terminar e toque em salvar de novo.");
      return;
    }
    setSalvando(true);
    try {
      const dados = {
        nome: form.nome.trim(),
        telefone: form.telefone.replace(/\D/g, ""),
        frequencia: form.frequencia,
        escala_12x36_ref: !soDatas && form.trabalha12 === "sim" ? form.ref12 : null,
        cultos_costume: soDatas ? [] : form.cultos,
        datas_bloqueadas: form.bloqueadas,
        datas_escolhidas: soDatas ? form.escolhidas : [],
        observacao: form.observacao.trim(),
      };
      const r = await api<{ ok: boolean; erro?: string; device_token?: string | null; voluntario?: Eu }>(
        `/api/publico/${encodeURIComponent(props.slug)}/salvar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(props.token ? { "X-Device-Token": props.token } : {}) },
          body: JSON.stringify({ dados, confirmar_nome: precisaNome ? nomeConfirmado : undefined, robo: robo || undefined }),
        },
      );
      if (!r.ok) {
        if (r.erro === "precisa_confirmar_nome") {
          setPrecisaNome(true);
          setErro(nomeConfirmado ? MENSAGENS_ERRO.precisa_confirmar_nome : "Este número já tem cadastro. Confirme seu nome completo.");
        } else setErro(MENSAGENS_ERRO[r.erro ?? ""] ?? "Não foi possível salvar. Confira os dados.");
        return;
      }
      props.aoSalvar(r.voluntario!, r.device_token ?? null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
      if (CHAVE_TURNSTILE) setVersaoRobo((v) => v + 1); // cada código vale um envio
    }
  };

  const cultosFixos = igreja.cultos_fixos ?? [];
  const exemplo12 = form.ref12
    ? [0, 1, 2, 3, 4].map((i) => {
        const d = somarDias(form.ref12, i);
        return { d, trabalho: eDiaDeTrabalho({ escala_12x36_ref: form.ref12, frequencia: "semanal" }, d) };
      })
    : [];

  return (
    <form
      className="empilha"
      style={{ gap: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
      noValidate
    >
      {desatualizado && (
        <Aviso tipo="alerta">Faz mais de 30 dias que você não confere suas datas. Veja se o próximo mês está certo antes de salvar.</Aviso>
      )}

      <section className="cartao">
        <h2><span className="num">1</span>Quem é você?</h2>
        <label className="campo">
          Seu nome
          <input value={form.nome} onChange={(e) => muda("nome", e.target.value)} autoComplete="name" maxLength={80} aria-invalid={!!erros.nome} />
          {erros.nome && <span className="erro-campo">{erros.nome}</span>}
        </label>
        <label className="campo">
          Seu WhatsApp
          <input
            value={form.telefone}
            onChange={(e) => muda("telefone", formatarTelefone(e.target.value))}
            onBlur={buscar}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(32) 99999-9999"
            aria-invalid={!!erros.telefone}
          />
          <span className="ajuda">Seu número não aparece para ninguém na escala.</span>
          {erros.telefone && <span className="erro-campo">{erros.telefone}</span>}
        </label>
        {precisaNome && (
          <div className="aviso info empilha" style={{ gap: 12 }}>
            <div className="linha-flex" style={{ alignItems: "flex-start" }}>
              <span style={{ color: "var(--cor)" }}><Icone nome="cadeado" /></span>
              <span>Este número já tem cadastro. Para proteger os dados, digite seu <strong>nome completo</strong> como está cadastrado. Ao salvar, o que você marcar agora substitui o cadastro.</span>
            </div>
            <label className="campo">
              Nome completo
              <input value={nomeConfirmado} onChange={(e) => setNomeConfirmado(e.target.value)} aria-invalid={!!erros.confirmar} />
              <span className="ajuda">Maiúsculas e acentos não importam.</span>
              {erros.confirmar && <span className="erro-campo">{erros.confirmar}</span>}
            </label>
          </div>
        )}
      </section>

      <section className="cartao" role="radiogroup" aria-labelledby="t-freq">
        <h2 id="t-freq"><span className="num">2</span>Com que frequência você pode servir?</h2>
        {(
          [
            ["semanal", "Toda semana", "Até 1 vez por semana, nos cultos que eu marcar"],
            ["quinzenal", "De 15 em 15 dias", "No máximo 2 vezes no mês"],
            ["datas", "Só em datas que eu escolher", "Vou marcar os dias no calendário"],
          ] as const
        ).map(([v, t, d]) => (
          <label key={v} className={`opcao${form.frequencia === v ? " marcada" : ""}`}>
            <input type="radio" name="frequencia" checked={form.frequencia === v} onChange={() => muda("frequencia", v)} />
            <span><span className="titulo-opcao">{t}</span><span className="desc-opcao">{d}</span></span>
          </label>
        ))}
        {erros.frequencia && <span className="erro-campo pequeno" style={{ color: "var(--erro-texto)", fontWeight: 600 }}>{erros.frequencia}</span>}
      </section>

      {form.frequencia && !soDatas && (
        <section className="cartao">
          <h2><span className="num">3</span>Você trabalha em escala 12x36?</h2>
          <div className="grade-2">
            {(["nao", "sim"] as const).map((v) => (
              <label key={v} className={`opcao${form.trabalha12 === v ? " marcada" : ""}`} style={{ alignItems: "center" }}>
                <input type="radio" name="t12" checked={form.trabalha12 === v} onChange={() => muda("trabalha12", v)} />
                <span className="titulo-opcao">{v === "sim" ? "Sim" : "Não"}</span>
              </label>
            ))}
          </div>
          {erros.trabalha12 && <span className="erro-campo pequeno" style={{ color: "var(--erro-texto)", fontWeight: 600 }}>{erros.trabalha12}</span>}
          {form.trabalha12 === "sim" && (
            <>
              <label className="campo">
                Um dia em que você trabalhou
                <input type="date" value={form.ref12} onChange={(e) => muda("ref12", e.target.value)} aria-invalid={!!erros.ref12} />
                {erros.ref12 && <span className="erro-campo">{erros.ref12}</span>}
              </label>
              {exemplo12.length > 0 && (
                <div style={{ background: "var(--fundo)", borderRadius: 12, padding: "12px 14px" }} className="empilha">
                  <div className="pequeno suave">O sistema alterna a partir desse dia:</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6, textAlign: "center", fontSize: 12 }}>
                    {exemplo12.map(({ d, trabalho }) => (
                      <div key={d} style={{ padding: "6px 0", borderRadius: 8, background: trabalho ? "#e9e8e3" : "#fff", border: trabalho ? 0 : "1px solid var(--linha)" }}>
                        <div style={{ fontWeight: 700 }}>{formatarCurta(d)}</div>
                        <div className="suave">{trabalho ? "trabalho" : "folga"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {form.frequencia && !soDatas && cultosFixos.length > 0 && (
        <section className="cartao">
          <h2><span className="num">4</span>Em quais cultos você costuma poder?</h2>
          {cultosFixos.map((c) => {
            const marcado = form.cultos.some((x) => x.dia === c.dia && x.turno === c.turno);
            return (
              <label key={`${c.dia}-${c.turno}`} className={`opcao${marcado ? " marcada" : ""}`} style={{ alignItems: "center" }}>
                <input type="checkbox" checked={marcado} onChange={() => alternarCulto({ dia: c.dia, turno: c.turno })} />
                <span><span className="titulo-opcao">{DIAS_LONGOS[c.dia]} · {NOME_TURNO[c.turno]}</span><span className="desc-opcao">{c.nome}</span></span>
              </label>
            );
          })}
          {erros.cultos && <span className="erro-campo pequeno" style={{ color: "var(--erro-texto)", fontWeight: 600 }}>{erros.cultos}</span>}
          <p className="pequeno suave">Em eventos especiais, você pode ser chamado mesmo fora desses cultos, se não tiver bloqueado a data.</p>
        </section>
      )}

      {form.frequencia && (
        <section className="cartao">
          <h2><span className="num">{soDatas ? 3 : 5}</span>{soDatas ? "Datas em que você pode servir" : "Datas em que você não pode"}</h2>
          <p className="pequeno suave">Toque nos dias para marcar ou desmarcar.</p>
          <CalendarioMes
            mes={mesDatas}
            hoje={hoje}
            aoMudarMes={(d) => setMesDatas(mesSeguinte(mesDatas, d))}
            celula={(data) => {
              const lista = soDatas ? form.escolhidas : form.bloqueadas;
              const marcado = lista.includes(data);
              const passado = data < hoje;
              return {
                classe: `${marcado ? (soDatas ? "escolhido-sel" : "bloqueado-sel") : ""} ${passado ? "passado" : ""}`,
                ponto: null,
                rotulo: marcado ? (soDatas ? "pode servir" : "não pode") : "",
                clicavel: !passado,
                pressionado: marcado,
              };
            }}
            aoTocarDia={(d) => alternarData(soDatas ? "escolhidas" : "bloqueadas", d)}
          />
          <div className="chips">
            {(soDatas ? form.escolhidas : form.bloqueadas)
              .filter((d) => d >= hoje)
              .map((d) => (
                <button
                  type="button"
                  key={d}
                  className="chip"
                  style={soDatas ? {} : { background: "var(--erro-fundo)", color: "var(--erro-texto)", border: 0 }}
                  onClick={() => alternarData(soDatas ? "escolhidas" : "bloqueadas", d)}
                  aria-label={`Desmarcar ${formatarCurta(d)}`}
                >
                  {DIAS_LONGOS[diaDaSemana(d)].slice(0, 3)} {formatarCurta(d)} ×
                </button>
              ))}
          </div>
          {erros.datas && <span className="erro-campo pequeno" style={{ color: "var(--erro-texto)", fontWeight: 600 }}>{erros.datas}</span>}
        </section>
      )}

      {form.frequencia && (
        <section className="cartao">
          <h2><span className="num">{soDatas ? 4 : 6}</span>Observação</h2>
          <label className="campo">
            Algo que o líder precisa saber? (opcional)
            <textarea value={form.observacao} onChange={(e) => muda("observacao", e.target.value)} maxLength={500} rows={3} />
          </label>
        </section>
      )}

      <p className="pequeno suave">
        Seu nome e WhatsApp são usados só para organizar a escala da mídia. Para apagar seu cadastro, fale com o líder de comunicação.
      </p>
      <Turnstile aoMudar={setRobo} versao={versaoRobo} />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button className="botao largo" type="submit" disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar minha disponibilidade"}
      </button>
    </form>
  );
}
