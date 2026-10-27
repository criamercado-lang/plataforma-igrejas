import { useEffect, useRef, useState, type ReactNode } from "react";
import { urlLogo } from "./lib/api";

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => p.length > 2 || /^[A-ZÀ-Ú]/.test(p));
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? partes[0]?.[1] ?? "")).toUpperCase();
}

export function Logo({ nome, logoPath, grande }: { nome: string; logoPath?: string | null; grande?: boolean }) {
  const url = urlLogo(logoPath);
  const [falhou, setFalhou] = useState(false);
  return (
    <div className={`logo${grande ? " grande" : ""}`} aria-hidden="true">
      {url && !falhou ? <img src={url} alt="" onError={() => setFalhou(true)} /> : iniciais(nome)}
    </div>
  );
}

export function Icone({ nome, tamanho = 20 }: { nome: string; tamanho?: number }) {
  const caminhos: Record<string, ReactNode> = {
    voltar: <path d="M15 6l-6 6 6 6" />,
    avancar: <path d="M9 6l6 6-6 6" />,
    fechar: <path d="M6 6l12 12M18 6L6 18" />,
    calendario: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
    pessoas: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
      </>
    ),
    escudo: <path d="M12 3l8 4v5c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V7z" />,
    ajustes: (
      <>
        <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="10" cy="17" r="2" />
      </>
    ),
    refazer: (
      <>
        <path d="M4 4v6h6M20 20v-6h-6" />
        <path d="M20 10a8 8 0 0 0-14-4L4 10M4 14a8 8 0 0 0 14 4l2-4" />
      </>
    ),
    whatsapp: <path d="M4 20l1.4-4A8 8 0 1 1 8 18.6z" />,
    alerta: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 17h.01" />
      </>
    ),
    cadeado: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
    certo: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    mais: <path d="M12 5v14M5 12h14" />,
    menos: <path d="M5 12h14" />,
    copiar: (
      <>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V5a1 1 0 0 1 1-1h10" />
      </>
    ),
    sair: <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H4" />,
    lixo: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
    megafone: <path d="M3 10v4h3l6 4V6L6 10zM16 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />,
    tarefas: (
      <>
        <path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17" />
        <path d="M11 6h9M11 12h9M11 18h9" />
      </>
    ),
    pontos: (
      <>
        <circle cx="5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
      </>
    ),
    link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
    cima: <path d="M6 15l6-6 6 6" />,
    baixo: <path d="M6 9l6 6 6-6" />,
  };
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {caminhos[nome]}
    </svg>
  );
}

export function Folha({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = "";
      anterior?.focus?.();
    };
  }, [aoFechar]);
  return (
    <div className="fundo-folha" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="folha" role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} ref={ref}>
        <div className="alca" />
        <div className="linha-flex entre">
          <h2 style={{ fontSize: 20 }}>{titulo}</h2>
          <button className="icone-botao" style={{ background: "#f1f0ec" }} onClick={aoFechar} aria-label="Fechar">
            <Icone nome="fechar" tamanho={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "alerta" | "erro" | "ok"; children: ReactNode }) {
  return (
    <div className={`aviso ${tipo}`} role={tipo === "erro" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="carregando" role="status" aria-live="polite">
      {texto}
    </div>
  );
}

// Mensagem rápida no rodapé
let mostrarToast: (t: string) => void = () => {};
export function toast(texto: string) {
  mostrarToast(texto);
}
export function Toast() {
  const [texto, setTexto] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    mostrarToast = (t) => {
      setTexto(t);
      clearTimeout(timer);
      timer = setTimeout(() => setTexto(null), 2800);
    };
    return () => clearTimeout(timer);
  }, []);
  return texto ? (
    <div className="toast" role="status" aria-live="polite">
      {texto}
    </div>
  ) : null;
}

export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = texto;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** Confirmação antes de apagar ou desfazer algo. */
export function confirmar(mensagem: string): boolean {
  return window.confirm(mensagem);
}

/** Aplica a cor da igreja na interface. */
export function aplicarCor(cor: string | null | undefined) {
  const c = cor && /^#[0-9a-f]{6}$/i.test(cor) ? cor : "#7A2E3B";
  const raiz = document.documentElement.style;
  raiz.setProperty("--cor", c);
  raiz.setProperty("--cor-escura", `color-mix(in srgb, ${c} 78%, black)`);
  raiz.setProperty("--cor-clara", `color-mix(in srgb, ${c} 7%, white)`);
  raiz.setProperty("--cor-borda", `color-mix(in srgb, ${c} 25%, white)`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", c);
}

export function formatarTelefone(v: string): string {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
