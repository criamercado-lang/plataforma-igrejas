# Plataforma de comunicação para igrejas · Fase 1 (Base + Escalas)

App web, pensado para celular, que organiza a escala de mídia de cada igreja.
Várias igrejas na mesma plataforma, cada uma com seus dados separados no banco.

- **Página pública** `/{igreja}`: o voluntário vê o calendário e marca quando pode servir, sem criar conta.
- **Área da equipe** `/app`: escalas, voluntários, equipe e ajustes.
- **Convite** `/convite/{código}`: a pessoa cria a senha e entra na equipe com o papel definido.
- **Eventos** `/app/eventos`: modelo de campanha → revisar plano → tarefas com responsável e prazo.
- **Tarefas** `/app/tarefas`: cada pessoa vê as suas, marca o andamento e cola o link do material.
- **Plataforma** `/app/plataforma`: quem administra a plataforma cria igrejas e o convite do admin geral.

O app só organiza e controla. Artes, fotos e vídeos ficam no Canva, Drive ou Instagram.
O único arquivo enviado é o logo da igreja.

## Estrutura

| Pasta | O que tem |
| --- | --- |
| `src/` | Telas em React (Vite), sem bibliotecas além do React |
| `src/lib/escala/` | Regras de disponibilidade, escala automática e mensagem do WhatsApp |
| `netlify/functions/` | Página pública (ler e salvar) e aceite de convite, com a chave secreta |
| `netlify/edge-functions/og.ts` | Prévia do link no WhatsApp com nome e logo de cada igreja |
| `supabase/migrations/` | Tabelas, regras de segurança (RLS) e funções do banco |
| `tests/` | Testes do banco, das regras da escala e do fluxo no navegador |

## Como colocar no ar

### 1. Supabase
1. Crie um projeto em supabase.com.
2. No **SQL Editor**, rode os arquivos de `supabase/migrations/` **na ordem do nome** (um por vez).
   Com a Supabase CLI: `supabase link` e depois `supabase db push`.
3. Em **Authentication › Users › Add user**, crie a sua conta (marque *Auto Confirm User*).
4. No **SQL Editor**, torne essa conta administradora da plataforma:
   ```sql
   insert into public.platform_admins (user_id)
   select id from auth.users where email = 'seu-email@exemplo.com';
   ```
5. Em **Authentication › URL Configuration**, coloque o endereço do site do Netlify em *Site URL*
   (usado no e-mail de "esqueci a senha").
6. Em **Project Settings › API**, copie a *Project URL*, a chave *anon* e a chave *service_role*.

### 2. Netlify
1. Suba esta pasta para um repositório no GitHub e ligue o repositório a um site no Netlify.
2. O `netlify.toml` já define: comando `npm run build`, pasta `dist`, funções e redirecionamentos.
3. Em **Site configuration › Environment variables**, cadastre:

| Variável | Valor | Onde é usada |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Project URL | navegador e prévia do link |
| `VITE_SUPABASE_ANON_KEY` | chave anon | navegador e prévia do link |
| `SUPABASE_URL` | Project URL | funções do servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service_role (secreta) | funções do servidor |
| `VITE_TURNSTILE_SITE_KEY` | Site Key do Cloudflare Turnstile (opcional) | quadradinho "não sou um robô" |
| `TURNSTILE_SECRET_KEY` | Secret Key do Turnstile (opcional, secreta) | conferência no servidor |

As duas do Turnstile andam juntas: cadastre as duas ou nenhuma.

4. Publique (Deploys › Trigger deploy).

### 3. Primeiro uso
1. Entre em `/app` com a conta do passo 1.3 e toque em **Criar igreja**.
2. Envie o link do convite para o líder da igreja.
3. O líder entra, vai em **Ajustes** e cadastra cultos fixos, funções da mídia, cor e logo.
4. O líder copia o link da escala (em **Voluntários**) e manda no grupo da mídia.
5. Com as disponibilidades preenchidas, o líder toca em **+ Nova escala**, confere e envia no grupo.

## Regras da escala (resumo)
- Disponível: não bloqueou a data, não é dia de trabalho no 12x36 e costuma servir naquele culto.
  Em evento especial, basta não ter bloqueado e não estar trabalhando. "Só datas": só nas datas escolhidas.
- 12x36: a pessoa informa um dia em que trabalhou e o sistema alterna a partir dele (sem erro na virada do mês).
- Intervalo mínimo: 7 dias (toda semana / só datas) ou 14 dias (de 15 em 15), e no máximo 2 vezes no mês para "de 15 em 15".
- Nunca a mesma pessoa duas vezes no mesmo dia nem em duas funções no mesmo culto.
- Quem foi menos escalado entra primeiro; empate é sorteado.
- Se faltar gente, o intervalo é relaxado (aparece como aviso). Se ainda faltar, a vaga fica marcada como faltando.

## Segurança
- Cada tabela tem RLS por igreja e por papel; os testes conferem isso direto no banco, não só na tela.
- Telefones nunca saem na página pública e só admin e líder os veem.
- Na página pública, o cadastro só abre no mesmo celular (código guardado no aparelho).
  Em outro celular, a pessoa precisa digitar o nome completo, e a mudança fica no histórico.
- A chave service_role fica só nas funções do Netlify.

## Testes
Precisa de Postgres 16 e Node 22.
```bash
# banco: segurança entre igrejas, papéis, página pública
PGHOST=/tmp PGPORT=54329 PGUSER=postgres tests/db/run.sh
# regras da escala
npx tsx --test tests/*.test.ts
# fluxo completo no navegador (servidor de teste imita o Supabase sobre o Postgres)
tests/e2e/preparar.sh /tmp/build && npx tsx tests/e2e/servidor.ts /tmp/build &
node tests/e2e/fluxo.mjs /tmp/prints
```

## Pendências conhecidas
- Importar os voluntários do app atual (Floot): depende de exportar a lista de lá.
- Fase 2 (eventos, plano e tarefas) pronta, sem aprovação de arte. Fases seguintes: aprovação, calendário editorial, painel e IA.
