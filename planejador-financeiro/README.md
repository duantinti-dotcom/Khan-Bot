# Órbita — planejador financeiro pessoal

App web para registrar entradas (inclusive valores pequenos e irregulares), despesas, contas e metas, e responder:
quanto posso gastar agora, quanto separar para as próximas contas e quanto guardar para cada meta.

## Arquitetura

| Parte | Tecnologia | Onde roda |
|---|---|---|
| Interface | React 18 + Vite (`web/`) | Vercel (site estático) |
| API | `server/api.js` (Web `Request`/`Response`) | Supabase Edge Function `fin-api` (Deno) |
| Banco | PostgreSQL, esquema isolado `fin` (`server/migrations/`, todas juntas em `server/schema.sql`) | Supabase |
| Cálculos | `shared/calc.js`, `shared/budget.js`, `shared/assistant.js` (puros, determinísticos) | navegador, API e testes |
| IA (opcional) | `server/ai.js` com o SDK oficial da Anthropic; recebe só números calculados | Edge Function |

O Vercel repassa `/api/*` para a Edge Function, então site e API ficam no mesmo domínio e a sessão usa cookie
`__Host-` HttpOnly, Secure, SameSite=Lax. O navegador não guarda dados financeiros.

### Segurança
- Senhas com PBKDF2-HMAC-SHA256 (310.000 iterações, sal aleatório); comparação em tempo constante.
- Sessão: token aleatório de 256 bits; o banco guarda só o SHA-256. Expira em 30 dias sem uso.
- Limite de tentativas: 5 falhas por usuário e 30 por IP a cada 15 minutos; 10 cadastros por IP por hora.
- Recuperação: 8 códigos de uso único (≈79 bits cada) mostrados só no cadastro; usar um encerra todas as sessões.
- Autorização no servidor em toda rota; chaves estrangeiras compostas `(user_id, id)` impedem referenciar dados de outra conta.
- CSRF: escrita exige o cabeçalho `x-fin-csrf`, que navegadores não enviam entre sites sem CORS.
- O esquema `fin` não é exposto pela API pública do Supabase (RLS ligado e permissões revogadas de `anon`/`authenticated`).

## Desenvolvimento

```bash
npm ci
# Postgres local descartável:
psql "$DATABASE_URL" -f server/schema.sql
DATABASE_URL=postgres://... npm run dev:api   # API + site compilado em http://localhost:8787
npm run build                                 # compila web/dist
TEST_DATABASE_URL=postgres://... npm test     # cálculo + integração da API (recria o esquema fin!)
npm run test:e2e -- http://localhost:8787 ./shots   # navegador (Playwright)
```

## Publicação

1. Banco novo: aplicar `server/schema.sql`. Banco existente: aplicar só as migrações novas de `server/migrations/` (são aditivas).
2. Publicar `supabase/functions/fin-api` com `verify_jwt = false` (a função faz a própria autenticação).
   Ela usa a variável `SUPABASE_DB_URL`, já fornecida pelo Supabase.
   IA (opcional): cadastrar o segredo `ANTHROPIC_API_KEY` em Supabase › Edge Functions › Secrets. Não precisa
   publicar de novo; sem a chave, o assistente funciona só com os cálculos por regras.
3. Publicar este diretório no Vercel (`vercel.json` define build e o repasse de `/api`).

Fórmulas: [docs/FORMULAS.md](docs/FORMULAS.md).

## Publicação atual

- Site: https://orbita-planejador.vercel.app (projeto Vercel `orbita-planejador`, time `lume-studio`).
- `deploy/vercel/` contém exatamente os arquivos enviados ao Vercel: a página carrega o JS/CSS compilados
  (`web/dist`, versionados neste repositório) pelo jsDelivr, fixados por commit e com hash de integridade (SRI).
  Isso é necessário porque a conta Vercel ainda não está conectada ao GitHub; conectando, dá para usar o
  `vercel.json` da raiz e compilar no próprio Vercel.
- API: Edge Function `fin-api` no projeto Supabase `uzrsxpvpbfjmfipciylj`, esquema isolado `fin`.
