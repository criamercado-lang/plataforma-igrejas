// Pessoas da equipe da igreja (nome + papel), usadas para escolher responsáveis.
import { emLista, eq, listar } from "../../lib/api";
import type { MembroEquipe } from "../../lib/eventos/modelos";
import type { Papel } from "../../lib/tipos";

export async function carregarEquipe(churchId: string): Promise<MembroEquipe[]> {
  const ms = await listar<{ user_id: string; papel: Papel }>("memberships", { select: "user_id,papel", church_id: eq(churchId) });
  if (!ms.length) return [];
  const perfis = await listar<{ id: string; nome: string; email: string }>("profiles", {
    select: "id,nome,email",
    id: emLista(ms.map((m) => m.user_id)),
  });
  return ms
    .map((m) => {
      const p = perfis.find((x) => x.id === m.user_id);
      return { user_id: m.user_id, papel: m.papel, nome: p?.nome || p?.email?.split("@")[0] || "—" };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function nomeDe(equipe: MembroEquipe[], id: string | null): string {
  if (!id) return "Sem responsável";
  return equipe.find((m) => m.user_id === id)?.nome ?? "Fora da equipe";
}
