// Entrada da Edge Function no Supabase. A lógica fica em server/api.js (compartilhada com os testes),
// importada de um commit fixo do repositório para a versão publicada ser exatamente a testada.
// Ao publicar uma nova versão do servidor, troque o hash do commit abaixo e reimplante a função.
import postgres from 'npm:postgres@3.4.5';
import { createApi, PG_TYPES } from 'https://cdn.jsdelivr.net/gh/duantinti-dotcom/Khan-Bot@5503c5fbae76c309edc26f5b378d87c6c1a89edf/planejador-financeiro/server/api.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, {
  types: PG_TYPES,
  prepare: false,
  max: 3,
  idle_timeout: 20,
  onnotice: () => {},
});

const handle = createApi({ sql, secureCookies: true });

Deno.serve((req: Request) => handle(req));
