// "Mais" no menu: Equipe, Ajustes e (para quem administra) a plataforma.
import { sair } from "../../lib/api";
import { aoClicarLink } from "../../lib/rotas";
import { Icone } from "../../ui";

export default function Mais({ plataforma }: { plataforma: boolean }) {
  const itens = [
    { href: "/app/equipe", rotulo: "Equipe", desc: "Quem faz parte e convites", icone: "escudo" },
    { href: "/app/ajustes", rotulo: "Ajustes", desc: "Cultos fixos, funções, cor e logo", icone: "ajustes" },
    ...(plataforma ? [{ href: "/app/plataforma", rotulo: "Plataforma", desc: "Criar igrejas", icone: "mais" }] : []),
  ];
  return (
    <>
      <h1>Mais</h1>
      <div className="cartao sem-padding">
        {itens.map((i) => (
          <a key={i.href} className="item-lista" href={i.href} onClick={aoClicarLink} style={{ textDecoration: "none", color: "var(--texto)" }}>
            <Icone nome={i.icone} />
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontWeight: 600 }}>{i.rotulo}</span>
              <span className="pequeno suave">{i.desc}</span>
            </span>
            <Icone nome="avancar" tamanho={18} />
          </a>
        ))}
      </div>
      <button className="botao secundario" onClick={() => sair()}>
        <Icone nome="sair" tamanho={18} /> Sair
      </button>
    </>
  );
}
