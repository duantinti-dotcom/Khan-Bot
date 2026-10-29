// Entrada da Edge Function no Supabase. A lógica fica em server/api.js (compartilhada com os testes).
import postgres from 'npm:postgres@3.4.5';
import { createApi, PG_TYPES } from './server/api.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, {
  types: PG_TYPES,
  prepare: false,
  max: 3,
  idle_timeout: 20,
  onnotice: () => {},
});

const handle = createApi({ sql, secureCookies: true });

Deno.serve((req: Request) => handle(req));
