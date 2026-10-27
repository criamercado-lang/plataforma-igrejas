// Proteção contra robôs (Cloudflare Turnstile) na página pública.
// Só aparece se VITE_TURNSTILE_SITE_KEY estiver configurada no Netlify.
import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opcoes: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const CHAVE_TURNSTILE: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";

let carregando: Promise<TurnstileApi> | null = null;
function carregar(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  carregando ??= new Promise((ok, falha) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (window.turnstile ? ok(window.turnstile) : falha(new Error("Turnstile indisponível")));
    s.onerror = () => {
      carregando = null;
      falha(new Error("Não foi possível carregar a verificação"));
    };
    document.head.appendChild(s);
  });
  return carregando;
}

/**
 * Mostra o quadradinho "não sou um robô". `aoMudar` recebe o código (ou "" quando expira).
 * Mude `versao` para gerar um código novo (cada código vale para um único envio).
 */
export function Turnstile({ aoMudar, versao }: { aoMudar: (token: string) => void; versao: number }) {
  const caixa = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;

  useEffect(() => {
    if (!CHAVE_TURNSTILE || !caixa.current) return;
    let ativo = true;
    carregar()
      .then((t) => {
        if (!ativo || !caixa.current || id.current) return;
        id.current = t.render(caixa.current, {
          sitekey: CHAVE_TURNSTILE,
          language: "pt-br",
          appearance: "interaction-only",
          callback: (tok: string) => aoMudarRef.current(tok),
          "expired-callback": () => aoMudarRef.current(""),
          "error-callback": () => aoMudarRef.current(""),
        });
      })
      .catch(() => aoMudarRef.current(""));
    return () => {
      ativo = false;
      if (id.current) window.turnstile?.remove(id.current);
      id.current = null;
    };
  }, []);

  useEffect(() => {
    if (versao > 0 && id.current) {
      aoMudarRef.current("");
      window.turnstile?.reset(id.current);
    }
  }, [versao]);

  if (!CHAVE_TURNSTILE) return null;
  return <div ref={caixa} />;
}
