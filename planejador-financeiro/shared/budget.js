// "Organizar meu dinheiro": sugere quanto destinar a cada categoria e meta usando só os dados
// da pessoa (saldo, contas até a próxima renda, histórico de gastos, metas). Sem percentuais fixos.
// Um plano é planejamento: não desconta saldo nem vira despesa. O gasto registrado reduz o saldo
// (uma vez) e é comparado ao valor planejado da categoria (sem descontar de novo).

import { addDays, diffDays, formatBR, startOfMonth } from './dates.js';
import { occurrenceDates } from './recurrence.js';
import { splitProportional } from './money.js';
import {
  spendable, historyWindow, goalMetrics, activeGoals, sortGoals, pendingExpenses, expectedIncome, accountsSummary,
} from './calc.js';

const ts = (x) => (x ? Date.parse(x) : 0);

// Gasto médio por dia de cada categoria (só gastos avulsos: contas fixas e parcelas já entram como compromissos).
export function categoryDaily(state, today) {
  const w = historyWindow(state, today);
  const map = new Map();
  for (const t of state.transactions) {
    if (t.status !== 'realizado' || t.date <= w.from || t.date > today || !t.category_id) continue;
    if (t.kind === 'despesa' && !t.recurrence_id && !t.installment_group) map.set(t.category_id, (map.get(t.category_id) || 0) + t.amount_cents);
    if (t.kind === 'reembolso') map.set(t.category_id, (map.get(t.category_id) || 0) - t.amount_cents);
  }
  const out = new Map();
  for (const [k, v] of map) out.set(k, Math.max(0, v) / w.days);
  return { daily: out, window: w };
}

export const itemKey = (type, id) => `${type}:${id}`;

export const STYLES = {
  equilibrado: { label: 'Equilibrado', desc: 'Contas e necessidades primeiro, depois metas, depois lazer.' },
  lazer: { label: 'Mais para viver', desc: 'Necessidades primeiro, depois lazer e passeios, depois metas.' },
  guardar: { label: 'Guardar mais', desc: 'Necessidades primeiro, metas completas, lazer um pouco menor e parte da sobra para a meta.' },
};

const TRANSPORTE = /uber|99|t[aá]xi|transporte|[oô]nibus|metr[oô]|corrida/i;
const LAZER_RE = /namor|passeio|lazer|sa[ií]da|rol[eê]|divers|cinema|bar/i;

// Início do ciclo atual: último recebimento da renda principal (ou dia 1 do mês).
export function cycleStart(state, today) {
  const sp = spendable(state, today, { includePlanned: false });
  if (sp.period.nextIncome) {
    const inc = state.recurrences.filter((r) => r.active && r.kind === 'receita');
    const main = inc.filter((r) => r.is_main_income);
    let last = null;
    for (const r of (main.length ? main : inc)) {
      const occ = occurrenceDates(r, addDays(today, -62), today);
      const d = occ[occ.length - 1];
      if (d && (!last || d > last)) last = d;
    }
    if (last) return last;
  }
  return startOfMonth(today);
}

// Gasto por categoria desde o início do ciclo (pagos − reembolsos), para mostrar "já gastei".
export function spentSince(state, from, today) {
  const by = new Map();
  for (const t of state.transactions) {
    if (t.status !== 'realizado' || t.date < from || t.date > today || !t.category_id) continue;
    const v = t.kind === 'despesa' ? t.amount_cents : t.kind === 'reembolso' ? -t.amount_cents : 0;
    if (v) by.set(t.category_id, (by.get(t.category_id) || 0) + v);
  }
  return by;
}

// Perguntas práticas quando falta histórico para estimar uma categoria.
export function budgetQuestions(state, today) {
  const { daily, window } = categoryDaily(state, today);
  const out = [];
  for (const c of state.categories.filter((x) => !x.archived)) {
    if (c.estimate_weekly_cents != null) continue;
    const hasHistory = (daily.get(c.id) || 0) > 0 && !window.short;
    if (hasHistory) continue;
    if (TRANSPORTE.test(c.name)) out.push({ category: c, kind: 'viagens', text: `Quantas vezes por semana você usa ${c.name} e quanto custa em média cada viagem?` });
    else if (LAZER_RE.test(c.name)) out.push({ category: c, kind: 'semanal', text: `Quanto você quer reservar por semana para “${c.name}”?` });
    else out.push({ category: c, kind: 'semanal', text: `Quanto você costuma gastar por semana com “${c.name}”? (0 se não usa)` });
  }
  const noBills = !state.recurrences.some((r) => r.kind === 'despesa' && r.active);
  return { categories: out, noBills, short: window.short };
}

// Sugestão de distribuição.
// opts.locked: { [chave]: centavos } valores que a pessoa fixou.
// opts.essential: { [categoryId]: boolean } sobrescreve essencial/flexível só nesta simulação.
// opts.style: 'equilibrado' | 'lazer' | 'guardar' (ordem de prioridade depois das necessidades).
export function suggestBudget(state, today, opts = {}) {
  const locked = opts.locked || {};
  const essOverride = opts.essential || {};
  const style = STYLES[opts.style] ? opts.style : (STYLES[state.profile?.budget_style] ? state.profile.budget_style : 'equilibrado');
  const sp = spendable(state, today, { includePlanned: false });
  const available = sp.livre + (opts.extra || 0);
  const pool = Math.max(0, available);
  const days = sp.days;
  const { daily, window } = categoryDaily(state, today);
  const start = cycleStart(state, today);
  const spent = spentSince(state, start, today);

  const items = [];
  for (const c of state.categories.filter((x) => !x.archived)) {
    const avg = daily.get(c.id) || 0;
    const est = c.estimate_weekly_cents;
    // Fonte do valor necessário, nesta ordem: estimativa informada (quando há pouco histórico ou nenhum),
    // média do histórico, limite mensal proporcional, ou nada (a pessoa define).
    let need = 0, source = 'nada', reason;
    if (est != null && (window.short || !avg)) {
      need = Math.round((est * days) / 7); source = 'estimativa';
      reason = `Estimativa sua: ${c.estimate_note || `${fmt(est)} por semana`} → ${fmt(need)} para ${days} dia(s).`;
    } else if (avg) {
      need = Math.round(avg * days); source = 'historico';
      reason = `Você gasta em média ${fmt(Math.round(avg))} por dia aqui (últimos ${window.days} dias) × ${days} dia(s).`;
    } else if (c.monthly_limit_cents) {
      need = Math.round((c.monthly_limit_cents * days) / 30); source = 'limite';
      reason = `Sem histórico; usei seu limite de ${fmt(c.monthly_limit_cents)}/mês proporcional a ${days} dia(s).`;
    } else {
      reason = 'Sem gastos registrados nem estimativa: responda a pergunta ao lado ou defina um valor.';
    }
    const essential = essOverride[c.id] ?? c.essential;
    items.push({
      key: itemKey('categoria', c.id), type: 'categoria', id: c.id, name: c.name, icon: c.icon, color: c.color, essential,
      need, source, stage: essential ? 1 : (style === 'lazer' ? 2 : 3), reason, spent: Math.max(0, spent.get(c.id) || 0),
    });
  }
  const gm = sortGoals(activeGoals(state).map((g) => goalMetrics(g, state, today)))
    .filter((m) => m.status !== 'atingida' && m.status !== 'vencida');
  for (const m of gm) {
    items.push({
      key: itemKey('meta', m.goal.id), type: 'meta', id: m.goal.id, name: m.goal.name, icon: m.goal.kind === 'reserva' ? '🛟' : '🎯',
      essential: false, need: m.pendingThisMonth, stage: style === 'lazer' ? 3 : 2, kind: m.goal.kind, metrics: m, spent: m.contributedThisMonth,
      reason: m.pendingThisMonth > 0 ? `Falta guardar ${fmt(m.pendingThisMonth)} neste mês para seguir o plano da meta.` : 'O aporte deste mês já foi feito.',
    });
  }

  // Valores fixados primeiro.
  let lockedSum = 0;
  for (const it of items) {
    if (locked[it.key] != null) { it.amount = Math.max(0, locked[it.key]); it.locked = true; lockedSum += it.amount; }
  }
  const overLocked = Math.max(0, lockedSum - pool);
  let rem = Math.max(0, pool - lockedSum);

  const free = items.filter((i) => !i.locked);
  const fundGroup = (group, proportional, factor = 1) => {
    const needOf = (i) => Math.round(i.need * factor);
    const need = group.reduce((s, i) => s + needOf(i), 0);
    if (need <= rem) { for (const i of group) i.amount = needOf(i); rem -= need; return; }
    if (proportional) {
      const parts = splitProportional(rem, group.map(needOf));
      group.forEach((i, k) => { i.amount = parts[k]; });
      rem = 0;
    } else {
      for (const i of group) { i.amount = Math.min(needOf(i), rem); rem -= i.amount; }
    }
  };
  // Necessidades sempre primeiro. Depois a ordem do estilo escolhido.
  fundGroup(free.filter((i) => i.stage === 1), true);
  if (style === 'lazer') {
    fundGroup(free.filter((i) => i.stage === 2), true);
    fundGroup(free.filter((i) => i.stage === 3), false);
  } else if (style === 'guardar') {
    fundGroup(free.filter((i) => i.stage === 2), false);
    fundGroup(free.filter((i) => i.stage === 3), true, 0.75);
  } else {
    fundGroup(free.filter((i) => i.stage === 2), false);
    fundGroup(free.filter((i) => i.stage === 3), true);
  }
  for (const i of items) i.amount = i.amount || 0;
  // "Guardar mais": metade do que sobrar vai para a primeira meta, como aporte extra.
  if (style === 'guardar' && rem > 0) {
    const g = free.find((i) => i.type === 'meta');
    if (g) {
      const extra = Math.floor(rem / 2);
      g.amount += extra; g.extra = extra; rem -= extra;
      if (extra) g.reason += ` Mais ${fmt(extra)} extra para adiantar a meta.`;
    }
  }
  for (const i of items) {
    i.short = i.locked ? 0 : Math.max(0, i.need - i.amount);
    i.left = i.amount; // quanto ainda pode gastar/guardar neste período segundo a sugestão
    if (i.type === 'meta' && i.metrics) i.effect = goalEffect(i, i.metrics);
  }
  const distributed = items.reduce((s, i) => s + i.amount, 0);
  const livre = pool - distributed;
  const totalNeed = items.reduce((s, i) => s + i.need, 0);
  const totalShort = items.reduce((s, i) => s + i.short, 0) + Math.max(0, -available);
  return {
    sp, period: sp.period, cycleStart: start, days, available, pool, items, distributed, livre, lockedSum, overLocked, totalNeed, totalShort,
    style, window, essentialShort: items.filter((i) => i.stage === 1 && i.short > 0).reduce((s, i) => s + i.short, 0),
  };
}

// Como o valor proposto para uma meta afeta o prazo.
function goalEffect(item, m) {
  if (m.status === 'sem_prazo' || !m.deadline) return 'Sem prazo calculável: informe a data de nascimento ou uma data.';
  const ref = m.planMonthly || m.perMonth || 0;
  if (item.amount >= item.need) {
    if (item.extra && ref > 0) return `Mantém o plano e adianta a meta em cerca de ${Math.ceil((item.extra / ref) * 30.4375)} dia(s).`;
    return 'Mantém a meta no ritmo planejado.';
  }
  const miss = item.need - item.amount;
  return ref > 0 ? `Faltam ${fmt(miss)} do aporte do mês: a meta atrasa cerca de ${Math.ceil((miss / ref) * 30.4375)} dia(s) se não compensar depois.` : `Faltam ${fmt(miss)} do aporte do mês.`;
}

// Dinheiro novo (entrada picada): sugere onde colocar SÓ o valor que entrou, sem reservar de novo o que
// o plano atual já cobre. Base = plano salvo (ou, sem plano, a divisão sugerida antes desta entrada).
export function splitNewIncome(state, today, amount, opts = {}) {
  const before = suggestBudget(state, today, { ...opts, extra: -(opts.alreadyCounted || 0) });
  const planned = new Map();
  if (state.plan) for (const i of state.plan.items) planned.set(itemKey(i.type, i.ref_id), i.amount_cents);
  else for (const i of before.items) planned.set(i.key, i.amount);
  let rem = amount;
  const adds = [];
  const give = (i, v, why) => { if (v > 0) { adds.push({ key: i.key, type: i.type, id: i.id, name: i.name, icon: i.icon, amount: v, reason: why }); rem -= v; } };
  // 0. Se o saldo já estava curto para as contas, o dinheiro novo cobre isso primeiro.
  const billGap = Math.min(rem, Math.max(0, -before.available));
  rem -= billGap;
  const gapOf = (i) => Math.max(0, i.need - (planned.get(i.key) || 0));
  const order = [
    ...before.items.filter((i) => i.stage === 1),
    ...before.items.filter((i) => i.type === 'meta'),
    ...before.items.filter((i) => i.type === 'categoria' && i.stage !== 1),
  ];
  for (const i of order) {
    if (rem <= 0) break;
    const gap = gapOf(i);
    if (!gap) continue;
    const v = Math.min(gap, rem);
    give(i, v, i.type === 'meta' ? `Completa o aporte que faltava (${fmt(gap)}).` : i.stage === 1 ? `Necessidade ainda descoberta no plano (${fmt(gap)}).` : `Completa o valor de costume que ficou faltando (${fmt(gap)}).`);
  }
  return { amount, billGap, adds, livre: rem, base: state.plan ? 'plano' : 'sugestao', planned };
}
// Quanto do plano salvo já foi usado (gastos e aportes registrados depois de criar o plano).
export function budgetUsage(state, plan) {
  if (!plan) return null;
  const since = ts(plan.created_at);
  const cats = new Map(state.categories.map((c) => [c.id, c]));
  const goals = new Map(state.goals.map((g) => [g.id, g]));
  const after = state.transactions.filter((t) => t.status === 'realizado' && ts(t.created_at) >= since);
  const spentBy = new Map();
  let unplanned = 0;
  const planned = new Set(plan.items.filter((i) => i.type === 'categoria').map((i) => i.ref_id));
  for (const t of after) {
    const v = t.kind === 'despesa' ? t.amount_cents : t.kind === 'reembolso' ? -t.amount_cents : 0;
    if (!v) continue;
    if (t.category_id && planned.has(t.category_id)) spentBy.set(t.category_id, (spentBy.get(t.category_id) || 0) + v);
    else if (t.kind === 'despesa' && !t.recurrence_id && !t.installment_group) unplanned += v;
  }
  const savedBy = new Map();
  for (const c of state.contributions) if (ts(c.created_at) >= since) savedBy.set(c.goal_id, (savedBy.get(c.goal_id) || 0) + c.amount_cents);
  const items = plan.items.map((i) => {
    if (i.type === 'categoria') {
      const c = cats.get(i.ref_id);
      const used = Math.max(0, spentBy.get(i.ref_id) || 0);
      return { ...i, name: c?.name || 'Categoria removida', icon: c?.icon, color: c?.color, archived: !!c?.archived, used, left: i.amount_cents - used };
    }
    const g = goals.get(i.ref_id);
    const used = Math.max(0, savedBy.get(i.ref_id) || 0);
    return { ...i, name: g?.name || 'Meta removida', icon: g?.kind === 'reserva' ? '🛟' : '🎯', used, left: i.amount_cents - used };
  });
  const catItems = items.filter((i) => i.type === 'categoria');
  return {
    items, unplanned,
    plannedSpend: catItems.reduce((s, i) => s + i.amount_cents, 0),
    spent: catItems.reduce((s, i) => s + i.used, 0),
  };
}

// Motivos para o plano estar desatualizado (o app sugere recalcular, mas só troca com confirmação).
export function planStale(state, plan, today) {
  if (!plan) return [];
  const since = ts(plan.created_at);
  const out = [];
  if (today > plan.period_end) out.push(`O período do plano terminou em ${formatBR(plan.period_end)}.`);
  const inc = state.transactions.filter((t) => t.kind === 'receita' && t.status === 'realizado' && ts(t.created_at) > since)
    .reduce((s, t) => s + t.amount_cents, 0);
  if (inc > 0) out.push(`Você recebeu ${fmt(inc)} depois de montar o plano.`);
  const newBills = state.recurrences.filter((r) => r.kind === 'despesa' && ts(r.created_at) > since).length
    + state.transactions.filter((t) => t.kind === 'despesa' && t.status === 'previsto' && ts(t.created_at) > since).length;
  if (newBills) out.push(`${newBills} conta(s) nova(s) foram cadastradas.`);
  if (state.goals.some((g) => ts(g.created_ts) > since)) out.push('Há metas novas.');
  return out;
}

// ---------------------------------------------------------------- visões auxiliares

// Projeção do saldo das contas de gasto, dia a dia, até `until`. É separada do saldo atual:
// soma receitas previstas e subtrai contas a pagar nas datas em que devem acontecer.
export function projection(state, today, until) {
  const { list } = accountsSummary(state);
  const spendIds = new Set(list.filter((a) => a.purpose === 'gastar').map((a) => a.id));
  const start = list.filter((a) => a.purpose === 'gastar').reduce((s, a) => s + a.balance, 0);
  const events = new Map();
  const add = (d, v, it) => {
    const day = d < today ? today : d;
    const e = events.get(day) || { inflow: 0, outflow: 0, items: [] };
    if (v > 0) e.inflow += v; else e.outflow += -v;
    e.items.push(it);
    events.set(day, e);
  };
  for (const b of pendingExpenses(state, today, until)) add(b.date, -b.amount_cents, b);
  for (const i of expectedIncome(state, today, until)) if (!i.account_id || spendIds.has(i.account_id)) add(i.date, i.amount_cents, i);
  const days = [];
  let bal = start;
  for (let d = today; d <= until; d = addDays(d, 1)) {
    const e = events.get(d);
    if (e) bal += e.inflow - e.outflow;
    days.push({ date: d, balance: bal, inflow: e?.inflow || 0, outflow: e?.outflow || 0, items: e?.items || [] });
  }
  const min = days.reduce((m, x) => (x.balance < m.balance ? x : m), days[0] || { balance: start, date: today });
  return { start, days, min };
}

// Quanto da renda prevista nos próximos dias já está comprometido com contas.
export function incomeCommitment(state, today, horizon = 30) {
  const until = addDays(today, horizon);
  const income = expectedIncome(state, today, until).filter((i) => i.date >= today).reduce((s, i) => s + i.amount_cents, 0);
  const bills = pendingExpenses(state, today, until).filter((b) => b.date >= today).reduce((s, b) => s + b.amount_cents, 0);
  return { income, bills, ratio: income > 0 ? bills / income : null, until };
}

// Avisos discretos de que a estimativa depende dos registros disponíveis.
export function completeness(state, today) {
  const out = [];
  const { list } = accountsSummary(state);
  if (!list.length) out.push('Nenhuma conta cadastrada.');
  if (list.some((a) => a.balance_known === false)) out.push('Há conta com saldo desconhecido.');
  if (!state.recurrences.some((r) => r.kind === 'despesa' && r.active)) out.push('Nenhuma despesa fixa cadastrada (assinaturas, celular…). Se você tem, cadastre para a conta ficar certa.');
  if (!state.recurrences.some((r) => r.kind === 'receita' && r.active) && !state.transactions.some((t) => t.kind === 'receita')) out.push('Nenhuma renda registrada.');
  const recent = [...state.transactions.map((t) => t.created_at), ...list.map((a) => a.updated_at)].filter(Boolean).map(ts);
  if (recent.length && Date.now() - Math.max(...recent) > 14 * 86400000) out.push('Nada foi registrado nas últimas 2 semanas; confira se os saldos estão em dia.');
  return out;
}

export function weeklyReview(state, today) {
  const sp = spendable(state, today);
  const soon = pendingExpenses(state, today, addDays(today, 7));
  const uncategorized = state.transactions.filter((t) => t.kind === 'despesa' && t.status === 'realizado' && !t.category_id && diffDays(t.date, today) <= 30);
  const goals = sortGoals(activeGoals(state).map((g) => goalMetrics(g, state, today)));
  const { list } = accountsSummary(state);
  const oldBalances = list.filter((a) => a.last_update && Date.now() - Date.parse(a.last_update) > 14 * 86400000);
  return { sp, overdue: soon.filter((b) => b.date < today), soon: soon.filter((b) => b.date >= today), uncategorized, goals, oldBalances };
}

// Fechamento de um mês e comparação com o anterior, por categoria (gastos pagos menos reembolsos).
export function monthCompare(state, monthKeyCur, monthKeyPrev) {
  const sum = (key) => {
    const by = new Map();
    let inc = 0, out = 0;
    for (const t of state.transactions) {
      if (t.status !== 'realizado' || t.date.slice(0, 7) !== key) continue;
      if (t.kind === 'receita') inc += t.amount_cents;
      if (t.kind === 'despesa') { out += t.amount_cents; by.set(t.category_id || null, (by.get(t.category_id || null) || 0) + t.amount_cents); }
      if (t.kind === 'reembolso') { out -= t.amount_cents; by.set(t.category_id || null, (by.get(t.category_id || null) || 0) - t.amount_cents); }
    }
    const saved = state.contributions.filter((c) => c.date.slice(0, 7) === key && c.source !== 'inicial').reduce((s, c) => s + c.amount_cents, 0);
    return { inc, out, saved, by };
  };
  const cur = sum(monthKeyCur), prev = sum(monthKeyPrev);
  const cats = new Map(state.categories.map((c) => [c.id, c]));
  const ids = new Set([...cur.by.keys(), ...prev.by.keys()]);
  const rows = [...ids].map((id) => ({
    category_id: id, name: id ? cats.get(id)?.name || 'Categoria' : 'Sem categoria', icon: id ? cats.get(id)?.icon : '•',
    cur: cur.by.get(id) || 0, prev: prev.by.get(id) || 0, delta: (cur.by.get(id) || 0) - (prev.by.get(id) || 0),
  })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { cur: { income: cur.inc, expenses: cur.out, saved: cur.saved }, prev: { income: prev.inc, expenses: prev.out, saved: prev.saved }, rows };
}

function fmt(c) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' '); }
