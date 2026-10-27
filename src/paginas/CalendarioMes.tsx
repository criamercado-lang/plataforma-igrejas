import { deDia, diaDaSemana, paraDia, somarDias } from "../lib/escala";
import { Icone } from "../ui";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function nomeMes(mes: string): string {
  const m = Number(mes.split("-")[1]);
  return MESES[m - 1] ?? "";
}

export function mesSeguinte(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export interface InfoCelula {
  classe: string;
  ponto: string | null;
  rotulo: string;
  clicavel: boolean;
  pressionado?: boolean;
}

export function CalendarioMes(props: {
  mes: string;
  hoje: string;
  aoMudarMes: (delta: number) => void;
  celula: (data: string) => InfoCelula;
  aoTocarDia: (data: string) => void;
  carregando?: boolean;
}) {
  if (!props.mes) return null;
  const primeiro = `${props.mes}-01`;
  const ultimo = somarDias(`${mesSeguinte(props.mes, 1)}-01`, -1);
  const vazios = diaDaSemana(primeiro);
  const dias: string[] = [];
  for (let d = paraDia(primeiro); d <= paraDia(ultimo); d++) dias.push(deDia(d));
  const [ano] = props.mes.split("-");

  return (
    <div className="empilha" style={{ gap: 8 }} aria-busy={props.carregando}>
      <div className="cal-cab">
        <button type="button" className="icone-botao" onClick={() => props.aoMudarMes(-1)} aria-label="Mês anterior">
          <Icone nome="voltar" />
        </button>
        <div style={{ fontSize: 17, fontWeight: 700 }} aria-live="polite">
          {nomeMes(props.mes)} {ano}
        </div>
        <button type="button" className="icone-botao" onClick={() => props.aoMudarMes(1)} aria-label="Próximo mês">
          <Icone nome="avancar" />
        </button>
      </div>
      <div className="cal-semana" aria-hidden="true">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="cal-grade" style={{ opacity: props.carregando ? 0.5 : 1 }}>
        {Array.from({ length: vazios }, (_, i) => (
          <div key={`v${i}`} />
        ))}
        {dias.map((data) => {
          const info = props.celula(data);
          const n = Number(data.slice(8));
          return (
            <button
              type="button"
              key={data}
              className={`cal-dia ${info.classe} ${data === props.hoje ? "hoje" : ""}`}
              disabled={!info.clicavel}
              aria-pressed={info.pressionado}
              aria-label={`${n}${info.rotulo ? `, ${info.rotulo}` : ""}`}
              onClick={() => props.aoTocarDia(data)}
            >
              <span>{n}</span>
              <span className="p" style={{ background: info.ponto ?? "transparent" }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
