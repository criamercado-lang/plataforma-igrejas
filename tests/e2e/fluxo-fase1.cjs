// Teste de ponta a ponta da fase 1 num navegador real (Chromium, tela de celular).
// Precisa do servidor local de testes rodando (bun dev/servidor.ts) com o banco recém-preparado.
// Uso: node tests/e2e/fluxo-fase1.cjs [pasta-para-prints]
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const BASE = process.env.BASE ?? "http://localhost:8888";
const PRINTS = process.argv[2] ?? path.join(__dirname, "prints");
fs.mkdirSync(PRINTS, { recursive: true });
const CEL = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pt-BR" };

let passo = 0;
const ok = (msg) => console.log(`ok ${++passo} - ${msg}`);
const print = (page, nome) => page.screenshot({ path: path.join(PRINTS, `${String(passo).padStart(2, "0")}-${nome}.png`), fullPage: true });

function hojeSP(delta = 0) {
  const d = new Date(Date.now() + delta * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

async function novaPagina(browser) {
  const ctx = await browser.newContext(CEL);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { throw new Error(`Erro de JavaScript na página: ${e.message}`); });
  page.on("dialog", (d) => d.accept());
  return { ctx, page };
}

async function preencherVoluntario(page, { nome, tel, freq, t12, ref12, cultos = [], datas = [] }) {
  await page.goto(`${BASE}/advicc`);
  await page.getByRole("heading", { name: "Quando você pode servir?" }).waitFor();
  await page.getByLabel("Seu nome").fill(nome);
  await page.getByLabel("Seu WhatsApp").fill(tel);
  await page.getByLabel("Seu WhatsApp").blur();
  await page.getByText(freq, { exact: true }).click();
  if (t12) {
    await page.locator("label.opcao", { hasText: t12 }).click();
    if (ref12) await page.getByLabel("Um dia em que você trabalhou").fill(ref12);
  }
  for (const c of cultos) await page.locator("label.opcao", { hasText: c }).click();
  for (const d of datas) await page.locator(".cal-grade").last().getByRole("button", { name: new RegExp(`^${Number(d.slice(8))}(,|$)`) }).click();
}

(async () => {
  const browser = await chromium.launch();
  try {
    // 1. Plataforma cria a igreja ------------------------------------------------
    const plat = await novaPagina(browser);
    await plat.page.goto(`${BASE}/app`);
    await plat.page.getByLabel("E-mail").fill("plataforma@teste.local");
    await plat.page.getByLabel("Senha").fill("teste1234");
    await plat.page.getByRole("button", { name: "Entrar", exact: true }).click();
    await plat.page.getByText("Você ainda não está em nenhuma equipe").waitFor();
    await plat.page.getByRole("link", { name: "Criar igreja (plataforma)" }).click();
    await plat.page.getByLabel("Nome da igreja").fill("AD Vida com Cristo");
    assert.equal(await plat.page.getByLabel("Endereço do link").inputValue(), "ad-vida-com-cristo");
    await plat.page.getByLabel("Endereço do link").fill("advicc");
    await plat.page.getByLabel(/E-mail do admin/).fill("lider@teste.local");
    await plat.page.getByRole("button", { name: "Criar igreja e convite" }).click();
    const linkAdmin = await plat.page.locator(".aviso.ok div.pequeno").textContent();
    assert.match(linkAdmin, /\/convite\/[a-f0-9]{64}$/);
    ok("plataforma cria a igreja e recebe o link do convite do admin");
    await print(plat.page, "plataforma");
    await plat.ctx.close();

    // 2. Líder aceita o convite e cria a conta -----------------------------------
    const lider = await novaPagina(browser);
    await lider.page.goto(linkAdmin.trim());
    await lider.page.getByText("Você foi convidado para a equipe de comunicação").waitFor();
    await print(lider.page, "convite");
    await lider.page.getByLabel("Seu nome").fill("Lia Líder");
    await lider.page.getByLabel("Senha").fill("curta");
    await lider.page.getByRole("button", { name: "Entrar na equipe" }).click();
    await lider.page.getByText("A senha precisa ter pelo menos 8 caracteres.").waitFor();
    await lider.page.getByLabel("Senha").fill("senhaforte123");
    await lider.page.getByRole("button", { name: "Entrar na equipe" }).click();
    await lider.page.getByRole("heading", { name: "Escalas da mídia" }).waitFor();
    await lider.page.getByText("Primeiro passo").waitFor();
    ok("líder cria a conta pelo convite e cai na área da equipe com o próximo passo explicado");

    // 3. Ajustes: cultos fixos e funções -----------------------------------------
    await lider.page.getByRole("link", { name: "Ir para Ajustes" }).click();
    await lider.page.getByRole("button", { name: "+ Adicionar culto fixo" }).click();
    await lider.page.getByLabel("Nome do culto").nth(0).fill("Culto da Família");
    await lider.page.getByRole("button", { name: "+ Adicionar culto fixo" }).click();
    await lider.page.getByLabel("Dia").nth(1).selectOption("3");
    await lider.page.getByLabel("Nome do culto").nth(1).fill("Culto de Ensino");
    await lider.page.getByRole("button", { name: "Salvar configurações" }).click();
    await lider.page.getByRole("button", { name: "Configurações salvas" }).waitFor();
    for (const f of ["Stories", "Projeção", "Fotos"]) {
      await lider.page.getByLabel("Nova função").fill(f);
      await lider.page.getByRole("button", { name: "Adicionar", exact: true }).click();
      await lider.page.locator("strong", { hasText: f }).waitFor();
    }
    await lider.page.getByRole("button", { name: "Mais uma pessoa em Fotos" }).click();
    await lider.page.getByLabel("2 por culto").waitFor();
    ok("líder cadastra cultos fixos (Dom e Qua à noite) e funções (Fotos com 2 pessoas)");
    await print(lider.page, "ajustes");

    // 4. Voluntários preenchem pelo link ------------------------------------------
    const vols = [];
    const domingo = (() => { for (let i = 1; i < 30; i++) { const d = hojeSP(i); if (new Date(d + "T12:00:00Z").getUTCDay() === 0) return d; } })();
    const quarta = (() => { for (let i = 1; i < 30; i++) { const d = hojeSP(i); if (new Date(d + "T12:00:00Z").getUTCDay() === 3) return d; } })();
    const pessoas = [
      { nome: "Maria Souza", tel: "32999990001", freq: "Toda semana", t12: "Não", cultos: ["Domingo · Noite", "Quarta · Noite"] },
      { nome: "João da Silva", tel: "32999990002", freq: "Toda semana", t12: "Sim", ref12: hojeSP(-1), cultos: ["Domingo · Noite", "Quarta · Noite"] },
      { nome: "Ana Paula", tel: "32999990003", freq: "De 15 em 15 dias", t12: "Não", cultos: ["Domingo · Noite"] },
      { nome: "Pedro Lima", tel: "32999990004", freq: "Toda semana", t12: "Não", cultos: ["Domingo · Noite", "Quarta · Noite"] },
      { nome: "Carla Dias", tel: "32999990005", freq: "Só em datas que eu escolher", datas: [domingo] },
    ];
    for (const p of pessoas) {
      const v = await novaPagina(browser);
      await preencherVoluntario(v.page, p);
      if (p.nome === "Maria Souza") await print(v.page, "formulario-preenchido");
      await v.page.getByRole("button", { name: "Salvar minha disponibilidade" }).click();
      await v.page.getByRole("heading", { name: `Pronto, ${p.nome.split(" ")[0]}!` }).waitFor();
      vols.push({ ...p, ...v });
    }
    await print(vols[0].page, "salvo");
    ok("5 voluntários marcam a disponibilidade pelo link público (frequências, 12x36 e só datas)");

    // validação no formulário
    const vazio = await novaPagina(browser);
    await vazio.page.goto(`${BASE}/advicc`);
    await vazio.page.getByRole("button", { name: "Salvar minha disponibilidade" }).click();
    await vazio.page.getByText("Confira os campos marcados.").waitFor();
    await vazio.page.getByText("Informe seu nome.").waitFor();
    ok("formulário vazio mostra o que falta, sem enviar");
    await vazio.ctx.close();

    // 5. Outro aparelho: precisa confirmar o nome ----------------------------------
    const outro = await novaPagina(browser);
    await outro.page.goto(`${BASE}/advicc`);
    await outro.page.getByLabel("Seu WhatsApp").fill("32999990002");
    await outro.page.getByLabel("Seu nome").fill("João da Silva");
    await outro.page.getByLabel("Nome completo").waitFor();
    assert.equal(await outro.page.getByText("Domingo · Noite").count(), 0, "nada do cadastro do João aparece antes de confirmar");
    await outro.page.getByText("Toda semana", { exact: true }).click();
    await outro.page.locator("label.opcao", { hasText: "Não" }).click();
    await outro.page.locator("label.opcao", { hasText: "Domingo · Noite" }).click();
    await outro.page.getByLabel("Nome completo").fill("Fulano");
    await outro.page.getByRole("button", { name: "Salvar minha disponibilidade" }).click();
    await outro.page.getByText("O nome não confere com o cadastro deste número.").waitFor();
    await print(outro.page, "outro-aparelho");
    await outro.page.getByLabel("Nome completo").fill("joao da silva");
    await outro.page.getByRole("button", { name: "Salvar minha disponibilidade" }).click();
    await outro.page.getByRole("heading", { name: "Pronto, João!" }).waitFor();
    ok("em outro aparelho, o cadastro só muda com o nome certo (sem acento/maiúsculas tudo bem)");
    await vols[1].ctx.close();
    vols[1] = { ...vols[1], ...outro };

    // 6. Líder monta a escala -------------------------------------------------------
    await lider.page.getByRole("link", { name: "Escalas" }).click();
    await lider.page.getByRole("button", { name: "+ Nova escala" }).click();
    await lider.page.getByLabel("Início").fill(hojeSP(1));
    await lider.page.getByRole("button", { name: "Montar escala" }).click();
    await lider.page.getByText("Toque num nome para trocar a pessoa.").waitFor();
    const nCultos = await lider.page.locator("article").count();
    assert.ok(nCultos >= 4 && nCultos <= 5, `esperava 4 ou 5 cultos em 15 dias, veio ${nCultos}`);
    ok(`escala de 15 dias abre montada com ${nCultos} cultos`);
    await print(lider.page, "escala-montada");

    // trocar uma pessoa
    const primeiroChip = lider.page.locator("article").first().locator(".chip:not(.falta)").first();
    const nomeAntes = (await primeiroChip.textContent()).trim();
    await primeiroChip.click();
    await lider.page.getByRole("dialog").waitFor();
    await print(lider.page, "trocar-pessoa");
    const opcao = lider.page.getByRole("dialog").locator("button.item-lista:not([disabled])").first();
    const nomeNovo = (await opcao.locator("div > div").first().textContent()).trim();
    await opcao.click();
    await lider.page.getByText("Há mudanças não salvas.").waitFor();
    assert.notEqual(nomeAntes, nomeNovo);
    await lider.page.getByRole("button", { name: "Salvar rascunho" }).click();
    await lider.page.getByRole("button", { name: "Tudo salvo" }).waitFor();
    ok(`líder troca ${nomeAntes} por ${nomeNovo} e salva o rascunho`);

    // − / +
    const valorFotos = async () => Number(await lider.page.locator("article").first().locator("[aria-label='Pessoas em Fotos'] span").textContent());
    const antes = await valorFotos();
    await lider.page.locator("article").first().getByRole("button", { name: "Mais uma pessoa em Fotos" }).click();
    await lider.page.waitForFunction(async (a) => true, antes);
    await lider.page.waitForTimeout(400);
    assert.equal(await valorFotos(), antes + 1);
    ok("botão + muda as pessoas da função naquele culto");

    // evento especial
    await lider.page.getByRole("button", { name: "+ Culto ou evento" }).click();
    const sabado = (() => { for (let i = 2; i < 15; i++) { const d = hojeSP(i); if (new Date(d + "T12:00:00Z").getUTCDay() === 6) return d; } })();
    await lider.page.getByLabel("Data").fill(sabado);
    await lider.page.getByLabel("Turno").selectOption("tarde");
    await lider.page.getByLabel("Nome", { exact: true }).fill("Conferência");
    await lider.page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await lider.page.locator("article", { hasText: "Conferência" }).waitFor();
    await lider.page.locator("article", { hasText: "Conferência" }).locator(".chip.falta").first().click();
    await lider.page.getByRole("dialog").locator("button.item-lista:not([disabled])").first().click();
    ok("líder adiciona um evento especial (sábado à tarde) e escala alguém nele");

    // enviar
    await lider.page.getByRole("button", { name: "Enviar escala no grupo" }).click();
    const previa = await lider.page.getByRole("dialog").locator("pre").textContent();
    assert.match(previa, /^\*Escala da Mídia · AD Vida com Cristo\*/);
    assert.match(previa, /Calendário e disponibilidade: http:\/\/localhost:8888\/advicc\/calendario/);
    assert.match(previa, /Colossenses 3:23|Provérbios 16:3/);
    assert.ok(!/3299999/.test(previa), "mensagem não tem telefones");
    await print(lider.page, "enviar");
    await lider.page.getByRole("button", { name: "Copiar texto" }).click();
    await lider.page.getByText("A escala está publicada no calendário público.").waitFor();
    await lider.page.getByRole("button", { name: "Fechar" }).click();
    await lider.page.locator(".selo.ok", { hasText: "Enviada" }).waitFor();
    ok("enviar gera o texto do WhatsApp (sem telefones, com versículo e link) e publica a escala");

    // 7. Voluntário vê a escala e usa "Não posso" ------------------------------------
    const textoEscala = previa;
    let alguem = vols.find((v) => textoEscala.includes(v.nome));
    assert.ok(alguem, "alguém dos voluntários está escalado");
    await alguem.page.goto(`${BASE}/advicc`);
    await alguem.page.getByText(/Você está escalado em|Você não está escalado/).waitFor();
    await print(alguem.page, "calendario-voluntario");
    const diaEscalado = alguem.page.locator(".cal-dia.escalado").first();
    if (await diaEscalado.count()) {
      await diaEscalado.click();
      await alguem.page.getByRole("dialog").getByText("você está escalado").waitFor();
      await print(alguem.page, "dia-escalado");
      await alguem.page.getByRole("button", { name: "Não posso neste dia" }).click();
      await alguem.page.getByText(/Você estava escalado neste dia/).waitFor();
      ok(`${alguem.nome} vê seus dias destacados e marca “Não posso” num dia em que estava escalado`);
    } else {
      ok(`${alguem.nome} está escalado só no mês seguinte (calendário carregou)`);
    }

    // líder vê o aviso
    await lider.page.reload();
    await lider.page.getByText("Toque num nome para trocar a pessoa.").waitFor();
    if (await diaEscalado.count() !== undefined) {
      const avisos = Number(await lider.page.locator(".numeros > div").nth(2).locator("strong").textContent());
      assert.ok(avisos >= 1, "líder vê aviso de pessoa indisponível");
      ok(`líder vê ${avisos} aviso(s) na escala depois do “Não posso”`);
    }

    // calendário público sem login, sem telefones
    const anonimo = await novaPagina(browser);
    await anonimo.page.goto(`${BASE}/advicc/calendario`);
    await anonimo.page.getByRole("heading", { name: "Escala da mídia" }).waitFor();
    const html = await anonimo.page.content();
    assert.ok(!/3299999/.test(html), "calendário público não mostra telefones");
    ok("calendário público abre sem login e não mostra telefones");

    // prévia do link (Open Graph) por igreja
    const og = await (await fetch(`${BASE}/advicc`)).text();
    assert.match(og, /<meta property="og:title" content="Escala da Mídia · AD Vida com Cristo">/);
    ok("link /advicc sai com título da igreja para a prévia do WhatsApp");

    // 8. Equipe: convidar designer ---------------------------------------------------
    await lider.page.getByRole("link", { name: "Equipe" }).click();
    await lider.page.getByLabel("E-mail").fill("dan@teste.local");
    await lider.page.getByLabel("Papel").selectOption("designer");
    assert.equal(await lider.page.getByLabel("Papel").locator("option[value=admin]").count(), 1, "admin pode convidar admin");
    await lider.page.getByRole("button", { name: "Gerar convite" }).click();
    await lider.page.getByText("Convite criado para").waitFor();
    await print(lider.page, "equipe");
    const linkDan = await lider.page.evaluate(() => navigator.clipboard ? null : null) ?? null;
    void linkDan;
    const convites = await (await fetch(`${BASE}/rest/v1/invites?select=email&email=eq.dan@teste.local`, { headers: { apikey: "x" } })).status;
    assert.equal(convites, 401, "visitante não lê convites");
    ok("líder gera convite de designer; visitante não consegue ler convites pela API");

    // aceitar como designer: pega o token pelo botão WhatsApp
    const href = await lider.page.getByRole("link", { name: "Enviar no WhatsApp" }).getAttribute("href");
    const urlConvite = decodeURIComponent(href).match(/https?:\/\/\S+\/convite\/[a-f0-9]{64}/)[0];
    const dan = await novaPagina(browser);
    await dan.page.goto(urlConvite);
    await dan.page.getByLabel("Seu nome").fill("Dan Designer");
    await dan.page.getByLabel("Senha").fill("senhaforte123");
    await dan.page.getByRole("button", { name: "Entrar na equipe" }).click();
    await dan.page.getByRole("heading", { name: "Escalas da mídia" }).waitFor();
    assert.equal(await dan.page.getByRole("button", { name: "+ Nova escala" }).count(), 0, "designer não vê o botão de nova escala");
    await dan.page.locator("a.item-lista").first().click();
    await dan.page.locator("article").first().waitFor();
    assert.equal(await dan.page.getByRole("button", { name: "Enviar escala no grupo" }).count(), 0);
    assert.ok(await dan.page.locator("article .chip").first().isDisabled(), "designer não troca pessoas");
    ok("designer entra pelo convite e vê a escala só para leitura");

    // designer tenta pela API (sem a tela)
    const sessaoDan = await dan.page.evaluate(() => JSON.parse(localStorage.getItem("sessao-equipe")));
    const anon = await dan.page.evaluate(() => document.querySelector("script[src*=main]") && "");
    void anon;
    const r = await fetch(`${BASE}/rest/v1/rpc/save_schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessaoDan.access_token}` },
      body: JSON.stringify({ p_schedule: "00000000-0000-0000-0000-000000000000", p_assignments: [] }),
    });
    assert.equal(r.status, 403);
    const tel = await fetch(`${BASE}/rest/v1/volunteers?select=telefone`, { headers: { Authorization: `Bearer ${sessaoDan.access_token}` } });
    assert.equal(tel.status, 403);
    ok("designer não salva escala nem lê telefones, mesmo chamando a API direto");

    // 9. Voluntários: telefone só para o líder, apagar cadastro --------------------
    await lider.page.getByRole("link", { name: "Voluntários" }).click();
    await lider.page.getByRole("button", { name: /Carla Dias/ }).click();
    await lider.page.getByRole("button", { name: "Ver WhatsApp" }).click();
    await lider.page.getByText("(32) 99999-0005").waitFor();
    await print(lider.page, "voluntario-detalhe");
    await lider.page.getByRole("button", { name: "Apagar cadastro" }).click();
    await lider.page.getByText("Cadastro apagado.").waitFor();
    assert.equal(await lider.page.getByRole("button", { name: /Carla Dias/ }).count(), 0);
    ok("líder vê o WhatsApp de um voluntário e apaga o cadastro (LGPD)");

    // 10. Recarregar mantém tudo ----------------------------------------------------
    await lider.page.reload();
    await lider.page.getByRole("heading", { name: "Voluntários" }).waitFor();
    assert.equal(await lider.page.locator("ul.cartao li").count(), 4);
    ok("depois de recarregar, a sessão continua e os dados estão lá");

    console.log(`\nTodos os ${passo} passos passaram. Prints em ${PRINTS}`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
