import { useEffect, useState, type MouseEvent } from "react";

// Roteador simples pelo caminho da URL (sem bibliotecas).
export function navegar(caminho: string, substituir = false) {
  if (caminho === location.pathname + location.search) return;
  if (substituir) history.replaceState(null, "", caminho);
  else history.pushState(null, "", caminho);
  window.dispatchEvent(new Event("rota"));
  window.scrollTo(0, 0);
}

export function useCaminho(): string {
  const [caminho, setCaminho] = useState(location.pathname);
  useEffect(() => {
    const f = () => setCaminho(location.pathname);
    window.addEventListener("popstate", f);
    window.addEventListener("rota", f);
    return () => {
      window.removeEventListener("popstate", f);
      window.removeEventListener("rota", f);
    };
  }, []);
  return caminho;
}

/** Para <a href> internos: navega sem recarregar a página. */
export function aoClicarLink(e: MouseEvent<HTMLAnchorElement>) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const href = e.currentTarget.getAttribute("href");
  if (!href || !href.startsWith("/")) return;
  e.preventDefault();
  navegar(href);
}
