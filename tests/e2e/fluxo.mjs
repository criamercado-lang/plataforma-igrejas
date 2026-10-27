// Teste no navegador (celular 390x844) contra o servidor de teste local.
// Uso: node tests/e2e/fluxo.mjs <pasta-para-prints>
import { chromium } from "playwright";

const BASE = "http://localhost:8787";
const PRINTS = process.argv[2] ?? ".";
let n = 0;
const passos = [];

function ok(cond, texto) {
  if (!cond) throw new Error(`FALHOU: ${texto}`);
  passos.push(texto);
  console.log(`ok  ${texto}`);
}

async function print(page, nome) {
  n += 1;
  await page.screenshot({ path: `${PRINTS}/${String(n).padStart(2, "0")}-${nome}.png`, fullPage: true });
}

const navegador = await chromium.launch();
const erros = [];
function novaPagina(ctx) {
  return ctx.newPage().then((p) => {
    p.on("pageerror", (e) => erros.push(`${p.url()}: ${e.message}`));
    p.on("console", (m) => { if (m.type() === "error") erros.push(`${p.url()}: ${m.text()}`); });
    return p;
  });
}
const celular = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pt-BR", timezoneId: "America/Sao_Paulo" };

try {
  // 1. Plataforma cria a igreja --------------------------------------------------
  const ctxPlat = await navegador.newContext(celular);
  const plat = await novaPagina(ctxPlat);
  await plat.goto(`${BASE}/app`);
  await plat.getByLabel("E-mail").fill("plataforma@teste.com");
  await plat.getByLabel("Senha").fill("senha-plataforma");
  await plat.getByRole("button", { name: "Entrar" }).click();
  await plat.getByText("Você ainda não está em nenhuma equipe").waitFor();
  ok(true, "plataforma entra e vê que ainda não está em equipe");
  await plat.getByRole("link", { name: /Criar igreja/ }).click();
  await plat.getByLabel("Nome da igreja").fill("AD Vida com Cristo");
  ok((await plat.getByLabel("Endereço do link").inputValue()) === "ad-vida-com-cristo", "endereço sugerido a partir do nome");
  await plat.getByLabel("Endereço do link").fill("advicc");
  await plat.getByLabel(/E-mail do admin/).fill("lider@igreja.com");
  await plat.getByRole("button", { name: "Criar igreja e convite" }).click();
  const linkConvite = (await plat.locator("text=/\\/convite\\//").first().textContent()).trim();
  ok(linkConvite.includes("/convite/"), "igreja criada e link de convite gerado");
  await print(plat, "plataforma");

  // 2. Líder aceita o convite criando a conta -----------------------------------
  const ctxLider = await navegador.newContext(celular);
  const lider = await novaPagina(ctxLider);
  await lider.goto(linkConvite);
  await lider.getByText("Você foi convidado para a equipe de comunicação").waitFor();
  await print(lider, "convite");
  await lider.getByLabel("Seu nome").fill("Lia Líder");
  await lider.getByLabel("Senha").fill("senha-lider-123");
  await lider.getByRole("button", { name: "Entrar na equipe" }).click();
  await lider.waitForURL(/\/app/);
  await lider.getByText("Primeiro passo").waitFor({ timeout: 10000 });
  ok(true, "líder cria a conta pelo convite e cai na área da equipe");
  await print(lider, "primeiro-passo");

  // 3. Ajustes: cultos fixos e funções ---------------------------------------------
  await lider.getByRole("link", { name: "Ir para Ajustes" }).click();
  await lider.getByRole("button", { name: "+ Adicionar culto fixo" }).click();
  await lider.getByLabel("Nome do culto").nth(0).fill("Culto da Família");
  await lider.getByRole("button", { name: "+ Adicionar culto fixo" }).click();
  await lider.getByLabel("Dia").nth(1).selectOption("3");
  await lider.getByLabel("Nome do culto").nth(1).fill("Culto de Ensino");
  await lider.getByRole("button", { name: "Salvar configurações" }).click();
  await lider.getByRole("button", { name: "Configurações salvas" }).waitFor();
  ok(true, "líder cadastra os cultos fixos (domingo e quarta à noite)");
  for (const f of ["Stories", "Projeção", "Fotos"]) {
    await lider.getByLabel("Nova função").fill(f);
    await lider.getByRole("button", { name: "Adicionar", exact: true }).click();
    await lider.getByRole("button", { name: `Remover ${f}` }).waitFor();
  }
  await lider.getByRole("button", { name: "Mais uma pessoa em Fotos" }).click();
  await lider.getByLabel("2 por culto").waitFor();
  ok(true, "líder cadastra as funções e define 2 pessoas em Fotos");
  await print(lider, "ajustes");

  // 4. Voluntários preenchem pelo link (cada um no seu celular) ---------------------
  async function preencher(dados) {
    const ctx = await navegador.newContext(celular);
    const p = await novaPagina(ctx);
    await p.goto(`${BASE}/advicc`);
    await p.getByRole("heading", { name: "Quando você pode servir?" }).waitFor();
    await p.getByLabel("Seu nome").fill(dados.nome);
    await p.getByLabel("Seu WhatsApp").fill(dados.tel);
    await p.getByLabel("Seu WhatsApp").blur();
    await p.getByRole("radio", { name: new RegExp(dados.freq) }).check();
    if (dados.freq !== "Só em datas") {
      await p.getByRole("radio", { name: dados.ref12 ? "Sim" : "Não", exact: true }).check();
      if (dados.ref12) await p.getByLabel("Um dia em que você trabalhou").fill(dados.ref12);
      for (const c of dados.cultos) await p.getByRole("checkbox", { name: new RegExp(c) }).check();
    }
    if (dados.datas?.length) {
      const sec = p.locator("section.cartao", { has: p.getByRole("heading", { name: /Datas em que você/ }) });
      await sec.getByRole("button", { name: "Próximo mês" }).click();
      for (const d of dados.datas) await sec.getByRole("button", { name: new RegExp(`^${d}(,|$)`) }).click();
    }
    await p.getByRole("button", { name: "Salvar minha disponibilidade" }).click();
    await p.getByRole("heading", { name: `Pronto, ${dados.nome.split(" ")[0]}!` }).waitFor();
    return { ctx, p };
  }

  const maria = await preencher({ nome: "Maria Souza", tel: "32999990001", freq: "Toda semana", cultos: ["Domingo", "Quarta"] });
  await print(maria.p, "maria-salvo");
  const joao = await preencher({ nome: "João da Silva", tel: "32999990002", freq: "Toda semana", ref12: "2026-10-30", cultos: ["Domingo"], datas: ["15"] });
  await preencher({ nome: "Ana Lima", tel: "32999990003", freq: "De 15 em 15", cultos: ["Domingo", "Quarta"] });
  await preencher({ nome: "Pedro Alves", tel: "32999990004", freq: "Só em datas", datas: ["4", "8"] });
  await preencher({ nome: "Carla Dias", tel: "32999990005", freq: "Toda semana", cultos: ["Domingo", "Quarta"] });
  await preencher({ nome: "Lucas Rocha", tel: "32999990006", freq: "Toda semana", cultos: ["Domingo", "Quarta"] });
  ok(true, "6 voluntários preenchem a disponibilidade pelo link público");

  // João volta no mesmo celular: cadastro abre direto
  await joao.p.getByRole("button", { name: /Voltar|Atualizar|calend/i }).first().click().catch(() => {});
  await joao.p.goto(`${BASE}/advicc`);
  ok((await joao.p.getByLabel("Seu nome").inputValue()) === "João da Silva", "no mesmo celular, o cadastro do João abre direto");

  // João em outro celular: precisa confirmar o nome
  const outro = await novaPagina(await navegador.newContext(celular));
  await outro.goto(`${BASE}/advicc`);
  await outro.getByLabel("Seu nome").fill("Invasor");
  await outro.getByLabel("Seu WhatsApp").fill("32999990002");
  await outro.getByLabel("Seu WhatsApp").blur();
  await outro.getByLabel("Nome completo").waitFor();
  ok(true, "em outro celular, o número já cadastrado pede o nome completo");
  await print(outro, "outro-aparelho");
  await outro.getByRole("radio", { name: /Toda semana/ }).check();
  await outro.getByRole("radio", { name: "Não", exact: true }).check();
  await outro.getByRole("checkbox", { name: /Domingo/ }).check();
  await outro.getByLabel("Nome completo").fill("Fulano");
  await outro.getByRole("button", { name: "Salvar minha disponibilidade" }).click();
  await outro.getByText(/nome não confere|não confere/i).waitFor();
  ok(true, "com nome errado, não altera o cadastro de outra pessoa");

  // 5. Líder monta a escala --------------------------------------------------------
  await lider.goto(`${BASE}/app`);
  await lider.getByRole("button", { name: "+ Nova escala" }).click();
  await lider.getByLabel("Início").fill("2026-11-01");
  ok((await lider.getByLabel("Fim").inputValue()) === "2026-11-15", "nova escala sugere 15 dias");
  await lider.getByRole("button", { name: "Montar escala" }).click();
  await lider.waitForURL(/\/app\/escalas\/[0-9a-f-]{36}/);
  await lider.getByText("Quantas vezes cada um foi escalado").waitFor();
  await print(lider, "escala-montada");
  await lider.getByRole("button", { name: /Enviar escala no grupo/ }).click();
  const texto = await lider.locator("pre").textContent();
  console.log("\n--- mensagem gerada ---\n" + texto + "\n-----------------------");
  ok(texto.includes("*Escala da Mídia · AD Vida com Cristo*"), "mensagem do WhatsApp com o nome da igreja");
  ok(texto.includes("01/11 a 15/11"), "mensagem com o período");
  ok((texto.match(/\*(Dom|Qua) /g) ?? []).length === 5, "5 cultos no período (3 domingos e 2 quartas)");
  const blocos = texto.split("\n\n");
  const dia = (d) => blocos.find((b) => b.includes(d)) ?? "";
  ok(!dia("Dom 15/11").includes("João"), "João não entra em 15/11 (bloqueou a data)");
  ok(!dia("Dom 01/11").includes("João"), "João não entra em 01/11 (dia de trabalho no 12x36)");
  ok(!dia("Dom 01/11").includes("Pedro") && dia("Qua 04/11").length > 0, "Pedro (só datas) não entra em 01/11");
  ok(texto.includes("Calendário e disponibilidade: http://localhost:8787/advicc"), "mensagem com o link do calendário");
  await print(lider, "enviar");
  await ctxLider.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await lider.getByRole("button", { name: "Copiar texto" }).click();
  await lider.getByText("A escala está publicada no calendário público.").waitFor();
  ok(true, "ao copiar o texto, a escala é publicada");

  // 6. Calendário público e "Não posso" --------------------------------------------
  await maria.p.goto(`${BASE}/advicc`);
  await maria.p.getByText(/Você (está|não está) escalad/).waitFor();
  const cal = maria.p.locator("section[aria-label='Calendário da escala']");
  await cal.getByRole("button", { name: "Próximo mês" }).click();
  const meus = cal.getByRole("button", { name: /você está escalado/ });
  await meus.first().waitFor();
  const qtd = await meus.count();
  ok(qtd >= 1, `Maria vê ${qtd} dia(s) em que está escalada no calendário`);
  await print(maria.p, "maria-calendario");
  await meus.first().click();
  await maria.p.getByRole("button", { name: "Não posso neste dia" }).waitFor();
  ok(!(await maria.p.locator(".folha").textContent()).match(/\d{8,}/), "detalhe do dia não mostra telefones");
  await print(maria.p, "maria-dia");
  await maria.p.getByRole("button", { name: "Não posso neste dia" }).click();
  await maria.p.getByText(/líder|avis/i).first().waitFor();
  ok(true, "Maria marca 'Não posso' num dia em que estava escalada");

  await lider.reload();
  await lider.getByText(/marcou que não pode/).first().waitFor();
  ok(true, "na escala, o líder vê o aviso de que Maria não pode");

  // 7. Equipe: convite de designer e permissões na tela ------------------------------
  await lider.goto(`${BASE}/app/equipe`);
  await lider.getByLabel("E-mail").fill("dan@igreja.com");
  await lider.getByLabel("Papel").selectOption("designer");
  await lider.getByRole("button", { name: /Gerar convite|Convidar/ }).click();
  const hrefWa = await lider.getByRole("link", { name: "Enviar no WhatsApp" }).getAttribute("href");
  const linkDan = decodeURIComponent(hrefWa.split("text=")[1]).match(/https?:\/\/\S+\/convite\/[a-f0-9]+/)[0];
  ok(linkDan.includes("/convite/"), "líder gera convite para um designer");
  await print(lider, "equipe");
  const dan = await novaPagina(await navegador.newContext(celular));
  await dan.goto(linkDan);
  await dan.getByLabel("Seu nome").fill("Dan Designer");
  await dan.getByLabel("Senha").fill("senha-dan-1234");
  await dan.getByRole("button", { name: "Entrar na equipe" }).click();
  await dan.waitForURL(/\/app/);
  await dan.getByRole("heading", { name: "Escalas da mídia" }).waitFor();
  ok((await dan.getByRole("button", { name: "+ Nova escala" }).count()) === 0, "designer não vê o botão de montar escala");
  await dan.goto(`${BASE}/app/voluntarios`);
  await dan.getByText("Maria Souza").waitFor();
  ok(!(await dan.locator("main").textContent()).includes("99999"), "designer vê os voluntários sem telefone");
  await print(dan, "designer-voluntarios");

  // 8. Esqueci a senha: link do e-mail abre a tela de nova senha ----------------------
  const sessaoDan = JSON.parse(await dan.evaluate(() => localStorage.getItem("sessao-equipe")));
  const recup = await novaPagina(await navegador.newContext(celular));
  await recup.goto(`${BASE}/app#access_token=${sessaoDan.access_token}&refresh_token=${sessaoDan.refresh_token}&expires_in=3600&type=recovery`);
  await recup.getByRole("heading", { name: "Criar nova senha" }).waitFor();
  await recup.getByLabel("Nova senha").fill("nova-senha-dan");
  await recup.getByLabel("Repita a senha").fill("nova-senha-dan");
  await recup.getByRole("button", { name: "Salvar nova senha" }).click();
  await recup.getByRole("heading", { name: "Escalas da mídia" }).waitFor();
  ok(!recup.url().includes("access_token"), "link de recuperação some da barra de endereço");
  const relog = await novaPagina(await navegador.newContext(celular));
  await relog.goto(`${BASE}/app`);
  await relog.getByLabel("E-mail").fill("dan@igreja.com");
  await relog.getByLabel("Senha").fill("nova-senha-dan");
  await relog.getByRole("button", { name: "Entrar" }).click();
  await relog.getByRole("heading", { name: "Escalas da mídia" }).waitFor();
  ok(true, "esqueci a senha: cria a nova senha pelo link e entra com ela");

  // 9. Fase 2: evento, plano revisado e tarefas -----------------------------------------
  const diaSP = (mais) => {
    const d = new Date(Date.now() + mais * 86400000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  };
  await lider.goto(`${BASE}/app/eventos`);
  await lider.getByRole("heading", { name: "Eventos" }).waitFor();
  ok((await lider.getByText("Datas comemorativas").count()) === 1, "eventos: líder vê sugestões de datas comemorativas");
  await lider.getByRole("button", { name: "+ Novo evento" }).click();
  await lider.getByText("Conferência / evento grande").click();
  await lider.getByLabel("Nome do evento").fill("Conferência Avivados");
  await lider.getByLabel("Início").fill(diaSP(10));
  await lider.getByLabel("Fim").fill(diaSP(11));
  await lider.getByLabel("Local").fill("Templo sede");
  await print(lider, "novo-evento");
  await lider.getByRole("button", { name: "Criar evento e revisar plano" }).click();
  await lider.getByRole("heading", { name: "Revisar plano de divulgação" }).waitFor();
  ok((await lider.getByText(/itens com prazo vencido/).count()) === 1, "plano avisa itens com prazo vencido (evento com pouco tempo)");
  await print(lider, "plano-vencidos");
  await lider.getByRole("button", { name: /Confirmar e criar/ }).click();
  await lider.getByText(/Resolva os itens com prazo vencido/).waitFor();
  ok(true, "não deixa confirmar com prazo vencido");
  while ((await lider.getByRole("button", { name: "Fazer hoje" }).count()) > 0) {
    await lider.getByRole("button", { name: "Fazer hoje" }).first().click();
  }
  await print(lider, "plano-resolvido");
  const botaoCriar = lider.getByRole("button", { name: /Confirmar e criar \d+ tarefas/ });
  const total = Number((await botaoCriar.textContent()).match(/\d+/)[0]);
  await botaoCriar.click();
  await lider.getByRole("heading", { name: "Conferência Avivados" }).waitFor();
  await lider.getByText(`0 de ${total}`).waitFor();
  ok(total === 18, `plano confirmado cria ${total} tarefas`);
  ok((await lider.getByText("escala ainda não montada").count()) >= 1, "dias do evento aparecem na escala de mídia");
  await print(lider, "evento");

  await lider.goto(`${BASE}/app/eventos/${lider.url().split("/eventos/")[1]}/plano`);
  await lider.getByText("Nenhum item para criar.").waitFor();
  ok(true, "gerar o plano de novo não duplica tarefas");

  await dan.goto(`${BASE}/app/tarefas`);
  await dan.getByRole("heading", { name: "Tarefas" }).waitFor();
  const minhas = await dan.locator("main .item-lista").count();
  ok(minhas > 0, `designer vê as tarefas dele (${minhas})`);
  ok((await dan.getByRole("button", { name: "+ Tarefa" }).count()) === 0, "designer não cria tarefa");
  await dan.locator("main .item-lista").first().click();
  await dan.getByRole("radio", { name: "Feito" }).click();
  await dan.getByLabel("Link do material").fill("javascript:alert(1)");
  await dan.getByRole("button", { name: "Salvar" }).click();
  await dan.getByText(/precisa começar com https/).waitFor();
  ok(true, "link que não é https é recusado na tela");
  await dan.getByLabel("Link do material").fill("https://www.canva.com/design/abc");
  await print(dan, "tarefa");
  await dan.getByRole("button", { name: "Salvar" }).click();
  await dan.getByText("Tarefa salva.").waitFor();
  ok(true, "designer marca a tarefa como feita com o link do Canva");

  await lider.goto(lider.url().replace(/\/plano$/, ""));
  await lider.getByText(`1 de ${total}`).waitFor();
  ok(true, "progresso da campanha atualiza no evento");
  await lider.goto(`${BASE}/app/mais`);
  await lider.getByRole("link", { name: /Equipe/ }).waitFor();
  ok(true, "menu Mais leva para Equipe e Ajustes");

  console.log(`\nRESULTADO: ${passos.length} verificações ok`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  const reais = erros.filter((e) => !e.includes("ERR_TUNNEL_CONNECTION_FAILED"));
  if (reais.length) console.log("\nERROS NO NAVEGADOR:\n" + reais.join("\n"));
  await navegador.close();
}
