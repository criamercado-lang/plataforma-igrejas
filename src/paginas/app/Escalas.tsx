import { useEffect, useState } from "react";
import { eq, listar } from "../../lib/api";
import { formatarCurta, hojeNoFuso, somarDias } from "../../lib/escala";
import { aoClicarLink, navegar } from "../../lib/rotas";
import type { EscalaDb } from "../../lib/tipos";
import { Aviso, Carregando, Folha } from "../../ui";
import { useEquipe } from "./AreaEquipe";
import { criarEscala } from "./dadosEscala";

export default function Escalas() {
  const { igreja, gestor, usuarioId } = useEquipe();
  const [escalas, setEscalas] = useState<EscalaDb[] | null>(null);
  const [contagens, setContagens] = useState<{ voluntarios: number; funcoes: number } | null>(null);
  const [erro, setErro] = useState("");
  const [nova, setNova] = useState(false);

  useEffect(() => {
    setEscalas(null);
    Promise.all([
      listar<EscalaDb>("schedules", { select: "id,church_id,inicio,fim,status,enviada_em", church_id: eq(igreja.id), order: "inicio.desc" }),
      listar<{ id: string }>("volunteers", { select: "id", church_id: eq(igreja.id), ativo: eq(true) }),
      listar<{ id: string }>("ministry_roles", { select: "id", church_id: eq(igreja.id) }),
    ])
      .then(([e, v, f]) => {
        setEscalas(e);
        setContagens({ voluntarios: v.length, funcoes: f.length });
      })
      .catch((e) => setErro((e as Error).message));
  }, [igreja.id]);

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!escalas || !contagens) return <Carregando />;

  const faltaConfigurar = (igreja.cultos_fixos ?? []).length === 0 || contagens.funcoes === 0;
  const hoje = hojeNoFuso(igreja.fuso_horario);

  return (
    <>
      <div className="linha-flex entre">
        <h1>Escalas da mídia</h1>
        {gestor && !faltaConfigurar && (
          <button className="botao pequeno" onClick={() => setNova(true)}>+ Nova escala</button>
        )}
      </div>

      {faltaConfigurar && (
        <div className="cartao">
          <h2>Primeiro passo</h2>
          <p className="suave">
            Para montar escalas, cadastre os <strong>cultos fixos da semana</strong> e as <strong>funções da mídia</strong> (Stories, Projeção, Fotos…).
          </p>
          {gestor ? (
            <a className="botao" href="/app/ajustes" onClick={aoClicarLink}>Ir para Ajustes</a>
          ) : (
            <p className="pequeno suave">Peça ao líder de comunicação para configurar.</p>
          )}
        </div>
      )}

      {!faltaConfigurar && contagens.voluntarios === 0 && (
        <div className="cartao">
          <h2>Ainda não há voluntários</h2>
          <p className="suave">Envie o link da escala no grupo da mídia para cada pessoa marcar quando pode servir.</p>
          <a className="botao secundario" href="/app/voluntarios" onClick={aoClicarLink}>Ver o link da escala</a>
        </div>
      )}

      {escalas.length === 0 && !faltaConfigurar && (
        <div className="vazio">Nenhuma escala ainda. {gestor ? "Toque em “Nova escala” para montar os próximos 15 dias." : ""}</div>
      )}

      {escalas.length > 0 && (
        <div className="cartao sem-padding">
          {escalas.map((e) => (
            <a
              key={e.id}
              className="item-lista"
              href={`/app/escalas/${e.id}`}
              onClick={aoClicarLink}
              style={{ textDecoration: "none", color: "var(--texto)" }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{formatarCurta(e.inicio)} a {formatarCurta(e.fim)}</div>
                <div className="pequeno suave">{e.fim < hoje ? "Período encerrado" : e.inicio <= hoje ? "Em andamento" : "Próxima"}</div>
              </div>
              <span className={`selo${e.status === "enviada" ? " ok" : ""}`}>{e.status === "enviada" ? "Enviada" : "Rascunho"}</span>
            </a>
          ))}
        </div>
      )}

      {nova && (
        <NovaEscala
          sugestaoInicio={escalas[0] && escalas[0].fim >= hoje ? somarDias(escalas[0].fim, 1) : hoje}
          aoFechar={() => setNova(false)}
          aoCriar={async (inicio, fim) => {
            const id = await criarEscala(igreja, inicio, fim, usuarioId);
            navegar(`/app/escalas/${id}`);
          }}
        />
      )}
    </>
  );
}

function NovaEscala(props: { sugestaoInicio: string; aoFechar: () => void; aoCriar: (inicio: string, fim: string) => Promise<void> }) {
  const [inicio, setInicio] = useState(props.sugestaoInicio);
  const [fim, setFim] = useState(somarDias(props.sugestaoInicio, 14));
  const [erro, setErro] = useState("");
  const [criando, setCriando] = useState(false);

  const criar = async () => {
    setErro("");
    if (!inicio || !fim || fim < inicio) return setErro("Confira as datas.");
    if (fim > somarDias(inicio, 62)) return setErro("O período pode ter no máximo 2 meses.");
    setCriando(true);
    try {
      await props.aoCriar(inicio, fim);
    } catch (e) {
      setErro((e as Error).message);
      setCriando(false);
    }
  };

  return (
    <Folha titulo="Nova escala" aoFechar={props.aoFechar}>
      <p className="suave">A escala já abre montada com quem está disponível. Depois você troca qualquer nome.</p>
      <div className="grade-2">
        <label className="campo">
          Início
          <input type="date" value={inicio} onChange={(e) => { setInicio(e.target.value); if (e.target.value) setFim(somarDias(e.target.value, 14)); }} />
        </label>
        <label className="campo">
          Fim
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </label>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button className="botao largo" onClick={criar} disabled={criando}>{criando ? "Montando…" : "Montar escala"}</button>
    </Folha>
  );
}
