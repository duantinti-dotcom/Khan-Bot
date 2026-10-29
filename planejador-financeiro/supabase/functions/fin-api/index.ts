// Entrada da Edge Function no Supabase. A lógica fica em server/api.js (compartilhada com os testes),
// importada de um commit fixo do repositório para a versão publicada ser exatamente a testada.
// Ao publicar uma nova versão do servidor, troque o hash do commit abaixo e reimplante a função.
// IA opcional: com o segredo ANTHROPIC_API_KEY configurado, o assistente usa o SDK oficial da Anthropic.
import postgres from 'npm:postgres@3.4.5';
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { createApi, PG_TYPES } from 'https://cdn.jsdelivr.net/gh/duantinti-dotcom/Khan-Bot@788cb9353c989973f3ba01206b12b7327710c4e0/planejador-financeiro/server/api.js';
import { createAiAdvisor } from 'https://cdn.jsdelivr.net/gh/duantinti-dotcom/Khan-Bot@788cb9353c989973f3ba01206b12b7327710c4e0/planejador-financeiro/server/ai.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, {
  types: PG_TYPES,
  prepare: false,
  max: 3,
  idle_timeout: 20,
  onnotice: () => {},
});

const key = Deno.env.get('ANTHROPIC_API_KEY');
const ai = key ? createAiAdvisor(new Anthropic({ apiKey: key })) : null;

const handle = createApi({ sql, secureCookies: true, ai });

Deno.serve((req: Request) => handle(req));
