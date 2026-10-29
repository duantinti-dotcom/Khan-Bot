// Assistente com IA (Claude) no servidor. Os números vêm sempre das funções do app (shared/*.js);
// a IA recebe só um resumo calculado — sem nome de usuário, senha, identificadores ou nomes de contas —
// explica e pode propor ajustes por categoria, que o servidor revalida antes de mostrar como proposta.

import { formatBR } from '../shared/dates.js';
import { suggestBudget, budgetUsage, completeness, STYLES } from '../shared/budget.js';

export const AI_MODEL = 'claude-opus-5-5';

const SYSTEM = `Você é o assistente financeiro do app Órbita, para uma pessoa jovem no Brasil.
Regras:
- Use somente os números do JSON "dados". Nunca invente saldos, rendimentos, gastos ou contas. Valores em reais (R$) com vírgula decimal.
- "recebimentos_previstos" ainda não entraram: nunca trate como dinheiro disponível agora.
- Contas para pagar e necessidades básicas vêm primeiro; depois metas e lazer, conforme o estilo escolhido. Gastar com namoro, passeios e diversão é normal e não é erro.
- Qualquer soma que você sugerir precisa caber em "pode_dividir" (dinheiro livre depois das contas). Se faltar dinheiro, diga quanto falta e dê alternativas práticas.
- Se faltar uma informação importante, faça UMA pergunta prática em "pergunta" (ex.: quantas viagens de Uber por semana e o custo médio). Senão, deixe "pergunta" vazio.
- Em "ajustes", proponha valores (em reais) só para categorias ou metas que existem em "itens", e só quando a pessoa pedir para mudar/redistribuir ou quando isso responder melhor à pergunta. O app recalcula o restante e a pessoa confirma antes de aplicar.
- Responda em português do Brasil, curto (até 90 palavras), direto, sem jargões e sem julgamentos. Diga o período considerado.`;

export const AI_SCHEMA = {
  type: 'object',
  properties: {
    texto: { type: 'string', description: 'Resposta curta para a pessoa.' },
    pergunta: { type: 'string', description: 'Uma pergunta prática se faltar informação; vazio se não precisar.' },
    ajustes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { item: { type: 'string', description: 'Nome exato do item em "itens".' }, valor_reais: { type: 'number' } },
        required: ['item', 'valor_reais'],
        additionalProperties: false,
      },
    },
  },
  required: ['texto', 'pergunta', 'ajustes'],
  additionalProperties: false,
};

const reais = (c) => Math.round(c) / 100;

// Resumo mínimo enviado à IA: só valores calculados e nomes de categorias/metas.
export function buildAiContext(state, today, opts = {}) {
  const sug = suggestBudget(state, today, opts);
  const sp = sug.sp;
  const usage = budgetUsage(state, state.plan);
  return {
    hoje: formatBR(today),
    periodo: { ate: formatBR(sug.period.end), dias: sug.days, proxima_renda: sug.period.nextIncome ? formatBR(sug.period.nextIncome) : null, ciclo_desde: formatBR(sug.cycleStart) },
    dinheiro: {
      disponivel_nas_contas: reais(sp.saldoBase),
      contas_para_pagar_no_periodo: reais(sp.compromissos),
      ja_separado_para_metas: reais(sp.separado),
      pode_dividir: reais(sug.available),
      recebimentos_previstos: reais(sp.incomesTotal),
    },
    estilo: STYLES[sug.style].label,
    itens: sug.items.map((i) => ({
      item: i.name, tipo: i.type === 'meta' ? 'meta' : i.essential ? 'essencial' : 'flexível',
      necessario_no_periodo: reais(i.need), sugestao_do_app: reais(i.amount), gasto_no_ciclo: reais(i.spent || 0),
      origem_do_calculo: i.source || 'meta', motivo: i.reason, ...(i.effect ? { efeito_na_meta: i.effect } : {}),
    })),
    sobra_livre: reais(sug.livre),
    falta_para_cobrir_tudo: reais(sug.totalShort),
    plano_salvo: usage ? usage.items.map((i) => ({ item: i.name, planejado: reais(i.amount_cents), usado: reais(i.used), resta: reais(i.left) })) : null,
    avisos: completeness(state, today),
  };
}

// Transforma o cliente do SDK oficial em uma função simples de consulta.
export function createAiAdvisor(client, { model = AI_MODEL } = {}) {
  return async function advise({ context, question, rules }) {
    const content = `dados = ${JSON.stringify(context)}\n${rules ? `\nResposta do planejador numérico do app (confiável): ${rules}\n` : ''}\nPergunta: ${question}`;
    const response = await client.beta.messages.create({
      model,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: AI_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal') throw new Error('A IA não pôde responder a essa pergunta.');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const parsed = JSON.parse(text);
    return {
      texto: String(parsed.texto || '').slice(0, 1500),
      pergunta: String(parsed.pergunta || '').slice(0, 300),
      ajustes: Array.isArray(parsed.ajustes) ? parsed.ajustes.slice(0, 30) : [],
      model: response.model,
    };
  };
}
