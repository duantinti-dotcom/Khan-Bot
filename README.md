# VÉRTICE AUTOMOTIVE — Site + Painel administrativo

Produto de demonstração da **Lume Studio®** para oficinas mecânicas: um site público premium integrado a um painel administrativo com login, gestão de orçamentos, clientes, serviços, galeria, avaliações, perguntas frequentes e conteúdo do site.

> A VÉRTICE AUTOMOTIVE é uma oficina **fictícia**. Telefone, e-mail, endereço e horários padrão são demonstrativos e aparecem sinalizados no site enquanto o “modo demonstração” estiver ativo (Painel → Configurações).

---

## Sumário

1. [Stack](#stack)
2. [Funcionalidades](#funcionalidades)
3. [Estrutura do projeto](#estrutura-do-projeto)
4. [Rodando localmente](#rodando-localmente)
5. [Variáveis de ambiente](#variáveis-de-ambiente)
6. [Banco de dados (Supabase)](#banco-de-dados-supabase)
7. [Primeiro administrador](#primeiro-administrador)
8. [WhatsApp](#whatsapp)
9. [Publicação](#publicação)
10. [Testes](#testes)
11. [Segurança](#segurança)
12. [Personalizando para outra oficina](#personalizando-para-outra-oficina)
13. [Status e limitações conhecidas](#status-e-limitações-conhecidas)

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend | React 19 + Vite 8 + TypeScript |
| Estilo | Tailwind CSS 4 (tokens em `src/index.css`), fontes Archivo e Inter auto-hospedadas |
| Ícones | lucide-react |
| Validação | zod (cliente) + validação no banco (servidor) |
| Backend | Supabase: Postgres + RLS, Auth (e-mail/senha), Storage |
| Testes | Vitest (unidade), Playwright (ponta a ponta), script de RLS (`scripts/test-rls.mjs`) |

O painel é carregado sob demanda (code splitting): quem visita o site não baixa o código administrativo.

## Funcionalidades

**Site público** (`/`)

- Cabeçalho fixo com menu desktop/celular e destaque da seção ativa; botão “Solicitar orçamento”.
- Hero, faixa de serviços, diferenciais, catálogo de serviços (com filtro por categoria e preço só quando cadastrado), a oficina, galeria com visualização ampliada (teclado, setas e gesto de deslizar), avaliações (estado vazio elegante quando não há avaliações reais), perguntas frequentes, contato com mapa/rotas (só com endereço real), chamada final e rodapé com links legais.
- Política de privacidade (`/privacidade`) e termos de uso (`/termos`) gerados a partir dos dados da oficina.
- Tudo vem do banco e é editável pelo painel. Sem Supabase configurado, o site funciona em modo offline de demonstração (sem simular gravação).

**Solicitação de orçamento** (sem agendamento automático)

1. Formulário com validação e máscara de telefone; serviço pré-selecionado ao clicar em um card.
2. Resumo para conferência.
3. Envio: a solicitação é **gravada no banco** pela função `submit_quote_request` (validação no servidor + limites anti-abuso) e recebe um número (ex.: `VA-00012`).
4. O cliente pode abrir o WhatsApp com a mensagem já formatada — a interface deixa claro que **abrir o WhatsApp não envia a mensagem**.
5. Data e período são apenas **preferência**; a oficina confirma manualmente.
6. Fotos opcionais (até 5 × 5 MB) vão para um bucket **privado**.

**Painel** (`/admin`)

| Página | O que faz |
| --- | --- |
| Login | E-mail/senha (Supabase Auth), mostrar/ocultar senha, erros claros, recuperação e redefinição de senha |
| Visão geral | Indicadores calculados no banco (total, novas, em contato, aprovadas, concluídas), gráfico por dia (7/30/90 dias), serviços mais solicitados, recentes e atalhos |
| Orçamentos | Busca (nome, telefone, veículo, nº), filtros por status e data, ordenação, paginação, tabela no desktop e cartões no celular, detalhe com fotos, troca de status com transições válidas, histórico, observações internas, WhatsApp/ligação, exclusão |
| Clientes | Um cadastro por telefone, veículos informados, histórico de pedidos, busca, WhatsApp |
| Serviços | CRUD completo, ícone, categoria, preço opcional, imagem, ativar/desativar, ordenação, exclusão preservando o histórico |
| Galeria | Upload múltiplo, legenda, texto alternativo, categoria, visibilidade, ordenação, substituição e remoção |
| Avaliações | CRUD com nota, data, origem, visibilidade, confirmação de autorização e selo para conteúdo demonstrativo |
| Perguntas frequentes | CRUD, ativação e ordenação |
| Conteúdo do site | Nome, logotipo, cor principal, hero, diferenciais, “a oficina”, títulos das seções, chamada final |
| Configurações | Dados comerciais, modo demonstração, contato/endereço, WhatsApp, horários, redes sociais, links externos, SEO, exibição |

Status de orçamento: **Novo → Em contato → Em avaliação → Aguardando aprovação → Aprovado → Em execução → Concluído** (+ Cancelado). “Aprovado” (orçamento aceito) é diferente de “Concluído” (serviço finalizado); o banco impede pular etapas.

## Estrutura do projeto

```
src/
  config/brand.ts          ← dados padrão da oficina (o que muda por cliente)
  lib/                     ← utilitários: settings, telefone, WhatsApp, status, SEO, erros…
  data/public.ts           ← leitura pública + envio de orçamento
  data/admin.ts            ← operações do painel (todas sujeitas à RLS)
  context/                 ← dados do site, autenticação
  components/ui|brand      ← componentes compartilhados (botões, campos, modal, feedback…)
  site/                    ← site público (layout, seções, formulário, páginas legais)
  admin/                   ← painel (layout, páginas, componentes)
supabase/
  migrations/              ← schema, RLS, funções, storage e conteúdo inicial (versionados)
  config.toml              ← configuração do Supabase local
scripts/
  create-admin.mjs         ← cria/promove administrador (usa service_role, só local)
  test-rls.mjs             ← 50 verificações de segurança/integração no banco
tests/e2e/                 ← testes Playwright
```

## Rodando localmente

Pré-requisitos: Node 20+, Docker (para o Supabase local).

```bash
npm install
npx supabase start            # sobe Postgres/Auth/Storage locais e aplica as migrations
npx supabase status -o env    # mostra API_URL, ANON_KEY e SERVICE_ROLE_KEY locais
```

Crie `.env.local` com os valores **locais**:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<ANON_KEY ou PUBLISHABLE_KEY local>
VITE_SITE_URL=http://localhost:5173
```

```bash
npm run dev       # http://localhost:5173  (painel em /admin)
npm run build     # build de produção em dist/
npm run preview   # serve o build em http://localhost:4173
```

E-mails locais (recuperação de senha) aparecem no Mailpit: http://127.0.0.1:54324.

## Variáveis de ambiente

Veja `.env.example`.

| Variável | Onde | Descrição |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | frontend | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | frontend | Chave **pública** (anon ou publishable) |
| `VITE_SITE_URL` | frontend | URL pública do site (SEO e link de redefinição de senha) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | **somente** scripts locais | Criação de administrador. Nunca em variáveis `VITE_` nem no repositório |

## Banco de dados (Supabase)

1. Crie um projeto em https://supabase.com (região recomendada: `sa-east-1`).
2. Aplique as migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-do-projeto>
   npx supabase db push
   ```
   (Alternativa: colar os arquivos de `supabase/migrations/` em ordem no SQL Editor.)
3. **Authentication → Sign In / Providers**: mantenha Email habilitado e **desative “Allow new users to sign up”** (administradores são criados manualmente).
4. **Authentication → URL Configuration**: Site URL = URL do site; adicione `https://seu-dominio/admin/redefinir-senha` em Redirect URLs.
5. **Authentication → Emails → SMTP**: configure um SMTP próprio para a recuperação de senha funcionar em produção (o SMTP padrão do Supabase tem limite baixo).
6. Senha mínima recomendada: 10 caracteres (Authentication → Policies).

Tabelas: `profiles`, `site_settings`, `services`, `customers`, `quote_requests`, `quote_status_history`, `quote_notes`, `gallery_images`, `reviews`, `faqs` + schema `private` (sal para anonimizar IPs). Buckets: `media` (público, só admin grava) e `quote-photos` (privado).

## Primeiro administrador

Não existe senha administrativa padrão. Crie o primeiro acesso no **seu computador**:

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role — não commitar> \
node scripts/create-admin.mjs dono@oficina.com.br "Nome do Responsável"
```

A senha é pedida no terminal. O script cria o usuário (ou atualiza a senha, se já existir) e grava `profiles.role = 'admin'`.

Alternativa pelo painel do Supabase: crie o usuário em *Authentication → Users* e rode no SQL Editor:

```sql
insert into public.profiles (id, full_name, role)
select id, 'Nome do Responsável', 'admin' from auth.users where email = 'dono@oficina.com.br';
```

Para revogar um acesso: `update public.profiles set active = false where id = '<uuid>';`

## WhatsApp

Painel → **Configurações → WhatsApp**: informe o número com DDI e DDD (ex.: `5511912345678`). Use “Testar link” para conferir.

- Sem número configurado, o site abre o WhatsApp para o visitante escolher o contato (nunca usa número inventado).
- O link `wa.me` apenas **abre** a conversa com a mensagem pronta; o envio depende do cliente.
- Não há API oficial do WhatsApp Business integrada (envio automático exigiria conta Meta e servidor próprio).

## Publicação

O build é estático (`dist/`). Arquivos prontos:

- **Netlify**: `netlify.toml` (build, SPA, cabeçalhos de segurança, `noindex` em `/admin`).
- **Vercel**: `vercel.json` (mesmas regras).

Passos: conectar o repositório → definir `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_SITE_URL` → publicar → atualizar Site URL/Redirect URLs no Supabase → criar o administrador → no painel, desativar o modo demonstração e preencher os dados reais.

## Testes

```bash
npm run lint        # oxlint
npm run typecheck   # TypeScript
npm test            # Vitest: WhatsApp, telefone, validação, status, settings

# Segurança do banco (Supabase local rodando)
eval "$(npx supabase status -o env)"
SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY npm run db:test

# Ponta a ponta (Supabase local + admin criado com create-admin.mjs).
# A service key local é usada só para zerar o limite anti-abuso por IP antes da suíte.
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run test:e2e
```

## Segurança

- **RLS em todas as tabelas.** Visitantes leem apenas conteúdo público ativo (serviços, FAQ, avaliações visíveis, galeria visível, configurações do site). Clientes, pedidos, notas e histórico são legíveis só por administradores.
- **Pedidos públicos** entram exclusivamente pela função `submit_quote_request` (`security definer`): valida todos os campos, só aceita serviços ativos e fotos já enviadas à pasta `pending/`, limita abuso (3 pedidos/30 min por telefone, 20/h por IP anonimizado com sal, 60/10 min no total) e tem campo-armadilha contra robôs. Visitantes não têm `INSERT` direto em nenhuma tabela.
- **Administrador** = usuário autenticado com `profiles.role = 'admin'` e `active = true` (`public.is_admin()`). O papel não pode ser alterado pela API. Cadastro público desativado.
- **Integridade:** a API só permite alterar o `status` de um pedido (não os dados enviados pelo cliente); transições inválidas são recusadas pelo banco; cada mudança gera histórico.
- **Arquivos:** fotos de clientes em bucket privado (visitante só pode enviar, nunca listar/ler), acesso do painel por links temporários de 10 min; tipos e tamanhos limitados no bucket.
- **Segredos:** apenas a chave pública vai para o navegador. `.env*` está no `.gitignore`.
- O painel recebe `noindex` (meta + cabeçalho) e `robots.txt` bloqueia `/admin`.

Resultados no Supabase local: `scripts/test-rls.mjs` **50/50** verificações aprovadas; Playwright **9/9** cenários (site, formulário, painel, serviços, conteúdo, logout, celular 360 px). A recuperação de senha também foi validada ponta a ponta com o Mailpit local.

## Personalizando para outra oficina

1. `src/config/brand.ts` — nome, textos, contatos, horários, cor e imagens padrão.
2. `supabase/migrations/20261016000002_initial_content.sql` — serviços, FAQ e galeria iniciais.
3. `public/` — `favicon.svg`, `og-image.png`, `apple-touch-icon.png`, `site.webmanifest`; `index.html` — título/descrição iniciais.
4. Novo projeto Supabase + deploy por oficina.

Depois da entrega, o próprio proprietário ajusta tudo pelo painel.

**Multiempresa:** esta versão é de **instância única** (um banco por oficina). Para atender várias oficinas no mesmo banco seria preciso adicionar `workshop_id` a todas as tabelas, vincular administradores a oficinas, reescrever as políticas RLS e separar os arquivos por oficina — isso **não** está implementado.

## Status e limitações conhecidas

- **Supabase em nuvem:** projeto `vertice-automotive` (ref `wvfrgfgkyejlvevqxlyy`, região `sa-east-1`, plano gratuito) criado com as migrations aplicadas. Para liberar a vaga gratuita, o projeto da barbearia foi **pausado** (pode ser reativado em até 90 dias pelo painel do Supabase, com os dados preservados). Ainda é preciso, no painel do Supabase: desativar novos cadastros, configurar Site URL/Redirect URLs e criar o primeiro administrador.
- **Fotos demonstrativas** apontam para o Unsplash (licença livre) e devem ser substituídas por fotos reais pelo painel. Se uma imagem não carregar, o site exibe um fundo neutro da marca.
- **Fotos de clientes:** arquivos enviados e não vinculados a um pedido (ex.: formulário abandonado) permanecem na pasta `pending/` do bucket privado; recomenda-se limpeza periódica pelo painel do Supabase.
- O limite por IP depende do cabeçalho `x-forwarded-for` repassado pela infraestrutura do Supabase.
- Os textos de política de privacidade e termos são modelos e devem ser revisados juridicamente.
