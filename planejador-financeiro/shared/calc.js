// Motor de cálculo determinístico do planejador. Funções puras: recebem o estado
// (dados do usuário) e a data de hoje, e devolvem números em centavos inteiros.
// As fórmulas estão documentadas em docs/FORMULAS.md e validadas em tests/calc.test.mjs.

import {
  addDays, diffDays, addMonths, startOfMonth, endOfMonth, monthKey, birthdayAtAge, parts,
  fromParts, daysInMonth,
} from './dates.js';
import { occurrenceDates, nextOccurrence, monthlyEquivalent, FREQUENCIAS } from './recurrence.js';

export const DIAS_POR_MES = 365.25 / 12; // 30,4375
export const LOOKBACK_DIAS = 62; // ocorrências recorrentes não pagas mais antigas que isso são ignoradas

const ceil = Math.ceil;

// ---------------------------------------------------------------- saldos

// Efeito de uma movimentação realizada no saldo de cada conta.
export function txEffects(t) {
  if (t.status !== 'realizado') return [];
  const a = t.amount_cents;
  switch (t.kind) {
    case 'receita': return [[t.account_id, a]];
    case 'reembolso': return [[t.account_id, a]];
    case 'despesa': return [[t.account_id, -a]];
    case 'ajuste': return [[t.account_id, a]];
    case 'transferencia': return [[t.account_id, -a], [t.to_account_id, a]];
    default: return [];
  }
}

export function accountBalances(state) {
  const bal = new Map();
  for (const acc of state.accounts) bal.set(acc.id, acc.initial_cents || 0);
  for (const t of state.transactions) {
    for (const [id, v] of txEffects(t)) if (bal.has(id)) bal.set(id, bal.get(id) + v);
  }
  return bal;
}

// Dinheiro destinado a metas, por conta e por meta. Cada contribuição pertence a
// exatamente um par (meta, conta), então nenhum centavo é contado em duas metas.
export function allocations(state) {
  const byAccount = new Map();
  const byGoal = new Map();
  const byGoalAccount = new Map();
  for (const c of state.contributions) {
    byAccount.set(c.account_id, (byAccount.get(c.account_id) || 0) + c.amount_cents);
    byGoal.set(c.goal_id, (byGoal.get(c.goal_id) || 0) + c.amount_cents);
    const k = `${c.goal_id}|${c.account_id}`;
    byGoalAccount.set(k, (byGoalAccount.get(k) || 0) + c.amount_cents);
  }
  return { byAccount, byGoal, byGoalAccount };
}

export function accountsSummary(state) {
  const bal = accountBalances(state);
  const alloc = allocations(state);
  const lastTx = new Map();
  for (const t of state.transactions) {
    if (t.status !== 'realizado') continue;
    for (const id of [t.account_id, t.to_account_id]) {
      if (!id) continue;
      const ts = t.created_at || t.date;
      if (!lastTx.has(id) || ts > lastTx.get(id)) lastTx.set(id, ts);
    }
  }
  const list = state.accounts.filter((a) => !a.archived).map((a) => {
    const balance = bal.get(a.id) || 0;
    const allocated = alloc.byAccount.get(a.id) || 0;
    const lu = [a.updated_at, lastTx.get(a.id)].filter(Boolean).sort().pop() || null;
    return { ...a, balance, allocated, unallocated: balance - allocated, last_update: lu };
  });
  const totals = { gastar: 0, reservado: 0, investido: 0, indisponivel: 0, total: 0, separadoMetas: 0 };
  for (const a of list) {
    totals.total += a.balance;
    totals[a.purpose] += a.balance;
    if (a.liquidity === 'bloqueada') totals.indisponivel += a.balance;
    totals.separadoMetas += a.allocated;
  }
  return { list, totals };
}

// ---------------------------------------------------------------- recorrências

// Ocorrências ainda não lançadas de cada recorrência, entre `from` e `to`.
// Uma ocorrência deixa de ser "virtual" quando existe uma movimentação com o
// mesmo (recurrence_id, occurrence_date) — paga, editada ou cancelada.
export function virtualOccurrences(state, from, to) {
  const materialized = new Set();
  for (const t of state.transactions) {
    if (t.recurrence_id && t.occurrence_date) materialized.add(`${t.recurrence_id}|${t.occurrence_date}`);
  }
  const out = [];
  for (const r of state.recurrences) {
    if (!r.active) continue;
    for (const d of occurrenceDates(r, from, to)) {
      if (materialized.has(`${r.id}|${d}`)) continue;
      out.push({
        virtual: true,
        id: `v:${r.id}:${d}`,
        recurrence_id: r.id,
        occurrence_date: d,
        date: d,
        kind: r.kind,
        amount_cents: r.amount_cents,
        account_id: r.account_id,
        category_id: r.category_id,
        description: r.description,
        status: 'previsto',
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Todas as despesas a pagar (pendentes) até `until`, incluindo atrasadas recentes.
export function pendingExpenses(state, today, until) {
  const from = addDays(today, -LOOKBACK_DIAS);
  const real = state.transactions.filter((t) => t.kind === 'despesa' && t.status === 'previsto' && t.date <= until);
  const virt = virtualOccurrences(state, from, until).filter((o) => o.kind === 'despesa');
  return [...real, ...virt].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function expectedIncome(state, today, until) {
  const real = state.transactions.filter((t) => t.kind === 'receita' && t.status === 'previsto' && t.date <= until);
  const virt = virtualOccurrences(state, addDays(today, -LOOKBACK_DIAS), until).filter((o) => o.kind === 'receita');
  return [...real, ...virt].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------------------------------------------------------------- período do orçamento

export function budgetPeriod(state, today) {
  const mode = state.profile?.budget_mode || 'proxima_renda';
  if (mode === 'proxima_renda') {
    const incomes = state.recurrences.filter((r) => r.active && r.kind === 'receita');
    const main = incomes.filter((r) => r.is_main_income);
    const pool = main.length ? main : incomes;
    let next = null;
    for (const r of pool) {
      const n = nextOccurrence(r, today);
      if (n && (!next || n < next)) next = n;
    }
    if (next) {
      return { end: addDays(next, -1), reason: 'proxima_renda', nextIncome: next, days: diffDays(today, next) };
    }
  }
  const end = endOfMonth(today);
  return { end, reason: mode === 'proxima_renda' ? 'sem_renda_fixa' : 'fim_do_mes', nextIncome: null, days: diffDays(today, end) + 1 };
}

// ---------------------------------------------------------------- metas

export function goalDeadline(goal, profile) {
  if (goal.target_type === 'data') return goal.target_date || null;
  if (goal.target_type === 'idade') {
    if (!profile?.birth_date || goal.target_age == null) return null;
    return birthdayAtAge(profile.birth_date, goal.target_age);
  }
  return null;
}

export function planMonthly(goal) {
  if (!goal.plan_amount_cents || !goal.plan_frequency) return 0;
  return monthlyEquivalent(goal.plan_amount_cents, goal.plan_frequency);
}

// Datas dos aportes planejados de uma meta, ancoradas na data de criação (ou no dia escolhido).
export function planDates(goal, from, to) {
  if (!goal.plan_amount_cents || !goal.plan_frequency) return [];
  const rec = {
    frequency: goal.plan_frequency,
    start_date: goal.created_at,
    day_of_month: goal.plan_day || parts(goal.created_at).d,
  };
  return occurrenceDates(rec, from, to);
}

function contributionsOf(state, goalId) {
  return state.contributions.filter((c) => c.goal_id === goalId).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function firstMonthFactor(goal, today) {
  const ms = startOfMonth(today);
  if (!goal.created_at || goal.created_at <= ms) return 1;
  const end = endOfMonth(today);
  return (diffDays(goal.created_at, end) + 1) / parts(end).d;
}

export function goalMetrics(goal, state, today) {
  const profile = state.profile || {};
  const contribs = contributionsOf(state, goal.id);
  const current = contribs.reduce((s, c) => s + c.amount_cents, 0);
  const target = goal.target_cents;
  const remaining = Math.max(0, target - current);
  const progress = target > 0 ? Math.min(1, Math.max(0, current / target)) : 0;
  const deadline = goalDeadline(goal, profile);
  const monthStart = startOfMonth(today);
  const contributedThisMonth = contribs.filter((c) => c.date >= monthStart && c.date <= today && c.source !== 'inicial')
    .reduce((s, c) => s + c.amount_cents, 0);

  // Ritmo real: aportes (sem o valor inicial) dos últimos 90 dias, ou desde a criação se a meta for mais nova.
  const ageDays = Math.max(0, diffDays(goal.created_at, today));
  const windowDays = Math.min(90, Math.max(30, ageDays));
  const windowStart = addDays(today, -windowDays);
  const paceSum = contribs.filter((c) => c.date > windowStart && c.date <= today && c.source !== 'inicial')
    .reduce((s, c) => s + c.amount_cents, 0);
  const paceMonthly = Math.round(paceSum / (windowDays / DIAS_POR_MES));
  const planM = Math.round(planMonthly(goal));

  const base = {
    goal, current, target, remaining, progress, deadline, contributions: contribs,
    contributedThisMonth, paceMonthly, planMonthly: planM, windowDays,
  };

  if (current >= target && target > 0) {
    return { ...base, status: 'atingida', daysLeft: deadline ? diffDays(today, deadline) : null, perMonth: 0, perWeek: 0, monthTarget: 0, pendingThisMonth: 0, nextPlanned: [] };
  }
  if (!deadline) {
    const mt = Math.round(planM * firstMonthFactor(goal, today));
    return { ...base, status: 'sem_prazo', daysLeft: null, perMonth: null, perWeek: null, monthTarget: mt, pendingThisMonth: Math.max(0, mt - contributedThisMonth), nextPlanned: planDates(goal, today, addDays(today, 120)).slice(0, 3) };
  }
  const daysLeft = diffDays(today, deadline);
  if (daysLeft < 0) {
    return { ...base, status: 'vencida', daysLeft, perMonth: null, perWeek: null, monthTarget: 0, pendingThisMonth: 0, nextPlanned: [] };
  }
  // Quanto guardar: o que falta dividido pelos meses/semanas restantes até o prazo.
  // Se falta menos de 1 mês (ou 1 semana), o valor inteiro precisa entrar nesse período.
  const monthsLeft = daysLeft / DIAS_POR_MES;
  const weeksLeft = daysLeft / 7;
  const perMonth = monthsLeft >= 1 ? ceil(remaining / monthsLeft) : remaining;
  const perWeek = weeksLeft >= 1 ? ceil(remaining / weeksLeft) : remaining;
  const shortDeadline = daysLeft < 31;

  // Projeções sem rendimento: saldo atual + ritmo mensal × meses restantes.
  const projPace = current + Math.round(paceMonthly * monthsLeft);
  const projPlan = current + Math.round(planM * monthsLeft);
  const paceDate = paceMonthly > 0 ? addDays(today, ceil((remaining / paceMonthly) * DIAS_POR_MES)) : null;
  const planDate = planM > 0 ? addDays(today, ceil((remaining / planM) * DIAS_POR_MES)) : null;

  // Situação: compara o valor atual com uma trajetória linear entre a criação e o prazo.
  const start = goal.created_at;
  const totalDays = Math.max(1, diffDays(start, deadline));
  const elapsed = Math.min(totalDays, Math.max(0, diffDays(start, today)));
  const baseline = goal.baseline_cents || 0;
  const expectedNow = Math.round(baseline + (target - baseline) * (elapsed / totalDays));
  const tol = Math.max(100, Math.round((target - baseline) * 0.02));
  let status = 'no_plano';
  if (current >= expectedNow + tol) status = 'adiantada';
  else if (current < expectedNow - tol) status = 'atrasada';

  // No mês em que a meta foi criada, o aporte esperado é proporcional aos dias restantes do mês.
  const monthTarget = Math.round((planM > 0 ? planM : perMonth) * firstMonthFactor(goal, today));
  const pendingThisMonth = Math.max(0, monthTarget - contributedThisMonth);
  const nextPlanned = planDates(goal, today, addDays(today, 120)).slice(0, 3);

  return {
    ...base, status, daysLeft, monthsLeft, weeksLeft, perMonth, perWeek, shortDeadline,
    projPace, projPlan, paceDate, planDate, expectedNow, monthTarget, pendingThisMonth, nextPlanned,
    planEnough: planM > 0 ? projPlan >= target : null,
  };
}

export function activeGoals(state) {
  return state.goals.filter((g) => !g.archived);
}

export function sortGoals(metricsList) {
  return [...metricsList].sort((a, b) => {
    const pa = a.goal.priority || 2, pb = b.goal.priority || 2;
    if (pa !== pb) return pa - pb;
    const da = a.deadline || '9999-12-31', db = b.deadline || '9999-12-31';
    return da < db ? -1 : da > db ? 1 : 0;
  });
}

export function mainGoal(state, today) {
  const ms = sortGoals(activeGoals(state).filter((g) => g.kind !== 'reserva').map((g) => goalMetrics(g, state, today)));
  return ms.find((m) => m.status !== 'atingida') || ms[0] || null;
}

// ---------------------------------------------------------------- quanto posso gastar

export function spendable(state, today, opts = {}) {
  const includePlanned = opts.includePlanned ?? (state.profile?.include_planned_contributions ?? true);
  const { list, totals } = accountsSummary(state);
  const spendAccounts = list.filter((a) => a.purpose === 'gastar');
  const saldoBase = spendAccounts.reduce((s, a) => s + a.balance, 0);
  const separado = spendAccounts.reduce((s, a) => s + Math.max(0, a.allocated), 0);
  const period = budgetPeriod(state, today);
  const bills = pendingExpenses(state, today, period.end);
  const compromissos = bills.reduce((s, b) => s + b.amount_cents, 0);
  const overdue = bills.filter((b) => b.date < today);

  const goalsM = activeGoals(state).map((g) => goalMetrics(g, state, today));
  const aportesList = goalsM.filter((m) => m.pendingThisMonth > 0 && m.status !== 'vencida')
    .map((m) => ({ goal_id: m.goal.id, name: m.goal.name, amount: m.pendingThisMonth }));
  const aportesPendentes = aportesList.reduce((s, a) => s + a.amount, 0);

  const livre = saldoBase - separado - compromissos;
  const livreFinal = livre - (includePlanned ? aportesPendentes : 0);
  const days = Math.max(1, diffDays(today, period.end) + 1);
  const daily = livreFinal > 0 ? Math.floor(livreFinal / days) : 0;
  const weekly = livreFinal > 0 ? Math.min(livreFinal, daily * 7) : 0;

  const incomes = expectedIncome(state, today, period.end);
  const unknown = spendAccounts.filter((a) => a.balance_known === false);

  // Gasto variável médio por dia nos últimos 30 dias, para detectar orçamento apertado.
  const from30 = addDays(today, -30);
  const recentVar = state.transactions.filter((t) => t.kind === 'despesa' && t.status === 'realizado' && !t.recurrence_id && !t.installment_group && t.date > from30 && t.date <= today)
    .reduce((s, t) => s + t.amount_cents, 0);
  const avgDaily = Math.round(recentVar / 30);
  const tight = livreFinal >= 0 && avgDaily > 0 && daily < avgDaily * 0.7;

  return {
    today, period, days, saldoBase, separado, compromissos, bills, overdue,
    aportesPendentes, aportesList, includePlanned, livre, livreFinal, daily, weekly,
    incomes, incomesTotal: incomes.reduce((s, i) => s + i.amount_cents, 0),
    totals, unknown, spendAccounts, avgDaily, tight, deficit: livreFinal < 0 ? -livreFinal : 0,
    hasAccounts: spendAccounts.length > 0,
  };
}

export function deficitOptions(sp, state) {
  if (sp.livreFinal >= 0) return [];
  const opts = [];
  const def = -sp.livreFinal;
  if (sp.includePlanned && sp.aportesPendentes > 0) {
    const cover = Math.min(def, sp.aportesPendentes);
    opts.push(`Adiar parte dos aportes planejados deste mês (até ${fmt(cover)}) reduz o déficit sem mexer nas contas.`);
  }
  if (sp.incomesTotal > 0) {
    opts.push(`Há ${fmt(sp.incomesTotal)} em receitas previstas até ${br(sp.period.end)}. Elas não entram no cálculo até você confirmar o recebimento.`);
  }
  const reserve = state.goals.find((g) => g.kind === 'reserva' && !g.archived);
  if (reserve && sp.separado > 0) opts.push('Se for uma emergência real, usar a reserva para imprevistos é o papel dela — registre o resgate em "Guardei".');
  const movable = sp.bills.filter((b) => b.date > sp.today);
  if (movable.length) opts.push(`Verifique se alguma conta futura (ex.: ${movable[0].description || 'próxima conta'}) pode ser negociada ou paga depois da próxima entrada.`);
  opts.push('Pausar gastos livres até a próxima entrada e registrar qualquer valor extra que você receber.');
  return opts;
}

function fmt(c) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' '); }
function br(iso) { const { y, m, d } = parts(iso); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`; }

// ---------------------------------------------------------------- posso comprar isso?

export function canIBuy(state, today, amount, opts = {}) {
  const sp = spendable(state, today, opts);
  const after = sp.livreFinal - amount;
  const afterBeforeGoals = sp.livre - amount;
  // Contas que ficariam sem dinheiro: percorre os compromissos em ordem de vencimento.
  let available = sp.saldoBase - sp.separado - amount;
  const affectedBills = [];
  for (const b of sp.bills) {
    available -= b.amount_cents;
    if (available < 0) affectedBills.push(b);
  }
  const affectedGoals = [];
  if (sp.includePlanned && afterBeforeGoals < sp.aportesPendentes) {
    let room = Math.max(0, afterBeforeGoals);
    for (const a of sp.aportesList) {
      if (room >= a.amount) { room -= a.amount; continue; }
      affectedGoals.push({ ...a, uncovered: a.amount - room });
      room = 0;
    }
  }
  const mg = mainGoal(state, today);
  let goalImpact = null;
  if (mg && mg.status !== 'atingida') {
    const ref = mg.planMonthly || mg.paceMonthly || mg.perMonth || 0;
    goalImpact = {
      name: mg.goal.name,
      shareOfRemaining: mg.remaining > 0 ? amount / mg.remaining : 0,
      delayDays: ref > 0 ? Math.ceil((amount / ref) * DIAS_POR_MES) : null,
    };
  }
  const newDaily = after > 0 ? Math.floor(after / sp.days) : 0;
  let verdict = 'cabe';
  if (afterBeforeGoals < 0) verdict = 'nao_cabe';
  else if (after < 0) verdict = 'afeta_metas';
  else if (sp.daily > 0 && newDaily < sp.daily * 0.5) verdict = 'apertado';
  return { sp, amount, after, newDaily, affectedBills, affectedGoals, goalImpact, verdict };
}

// ---------------------------------------------------------------- capacidade mensal

export function historyWindow(state, today) {
  const created = state.profile?.created_at || today;
  const age = Math.max(0, diffDays(created, today));
  const days = Math.min(90, Math.max(30, age));
  return { from: addDays(today, -days), days, months: days / DIAS_POR_MES, short: age < 60 };
}

export function monthlyCapacity(state, today) {
  const w = historyWindow(state, today);
  const inWin = (t) => t.date > w.from && t.date <= today && t.status === 'realizado';
  const recInc = state.recurrences.filter((r) => r.active && r.kind === 'receita');
  const recExp = state.recurrences.filter((r) => r.active && r.kind === 'despesa');
  const incomeFixed = Math.round(recInc.reduce((s, r) => s + monthlyEquivalent(r.amount_cents, r.frequency), 0));
  const varIncomeHist = state.transactions.filter((t) => t.kind === 'receita' && !t.recurrence_id && inWin(t)).reduce((s, t) => s + t.amount_cents, 0);
  let incomeVariable = Math.round(varIncomeHist / w.months);
  let incomeVariableSource = 'historico';
  const est = state.profile?.variable_income_estimate_cents;
  if (w.short && est != null && est > incomeVariable) { incomeVariable = est; incomeVariableSource = 'estimativa'; }
  const expensesFixed = Math.round(recExp.reduce((s, r) => s + monthlyEquivalent(r.amount_cents, r.frequency), 0));
  const next30 = addDays(today, 30);
  const installments = state.transactions.filter((t) => t.kind === 'despesa' && t.installment_group && t.status === 'previsto' && t.date > today && t.date <= next30)
    .reduce((s, t) => s + t.amount_cents, 0);
  const varExp = state.transactions.filter((t) => t.kind === 'despesa' && !t.recurrence_id && !t.installment_group && inWin(t)).reduce((s, t) => s + t.amount_cents, 0);
  const refunds = state.transactions.filter((t) => t.kind === 'reembolso' && inWin(t)).reduce((s, t) => s + t.amount_cents, 0);
  const expensesVariable = Math.max(0, Math.round((varExp - refunds) / w.months));
  const income = incomeFixed + incomeVariable;
  const expenses = expensesFixed + installments + expensesVariable;
  const incomeKnown = recInc.length > 0 || varIncomeHist > 0 || (est != null);

  // Média mensal por categoria (recorrentes + variáveis − reembolsos), usada nas sugestões.
  const byCat = new Map();
  for (const r of recExp) byCat.set(r.category_id, (byCat.get(r.category_id) || 0) + monthlyEquivalent(r.amount_cents, r.frequency));
  for (const t of state.transactions) {
    if (!inWin(t) || t.recurrence_id) continue;
    if (t.kind === 'despesa' && !t.installment_group) byCat.set(t.category_id, (byCat.get(t.category_id) || 0) + t.amount_cents / w.months);
    if (t.kind === 'reembolso') byCat.set(t.category_id, (byCat.get(t.category_id) || 0) - t.amount_cents / w.months);
  }
  const categoryAvg = [...byCat.entries()].map(([id, v]) => ({ category_id: id, monthly: Math.max(0, Math.round(v)) }))
    .filter((c) => c.monthly > 0).sort((a, b) => b.monthly - a.monthly);

  return {
    window: w, incomeFixed, incomeVariable, incomeVariableSource, income, incomeKnown,
    expensesFixed, installments, expensesVariable, expenses, capacity: income - expenses, categoryAvg,
  };
}

// Distribui a capacidade mensal entre as metas por prioridade e prazo.
export function allocateCapacity(metricsList, capacity) {
  let left = Math.max(0, capacity);
  return sortGoals(metricsList).map((m) => {
    const need = m.status === 'atingida' || m.status === 'vencida' ? 0 : (m.perMonth ?? m.planMonthly ?? 0);
    const got = Math.min(need, left);
    left -= got;
    return { m, need, got, fits: got >= need };
  });
}

// ---------------------------------------------------------------- divisão de uma entrada

export function suggestSplit(state, today, amount, opts = {}) {
  const sp = spendable(state, today, { includePlanned: false });
  const explain = [];
  // O dinheiro já entrou no saldo. "Antes" = como estava sem esta entrada.
  const freeBefore = sp.saldoBase - (opts.countedInBase || 0) - sp.separado;
  let rest = amount;
  // 1. Contas: o que faltava para cobrir os compromissos até o fim do período.
  const gapBills = Math.max(0, sp.compromissos - Math.max(0, freeBefore));
  const contas = Math.min(rest, gapBills);
  rest -= contas;
  if (contas > 0) explain.push(`${fmt(contas)} completam as contas previstas até ${br(sp.period.end)}.`);
  else if (sp.compromissos > 0) explain.push(`As contas até ${br(sp.period.end)} (${fmt(sp.compromissos)}) já estavam cobertas pelo seu saldo.`);

  // 2. Reserva para imprevistos: prioridade enquanto estiver abaixo da metade do alvo.
  const reserveGoal = state.goals.find((g) => g.kind === 'reserva' && !g.archived);
  let reserva = 0;
  if (reserveGoal && rest > 0) {
    const m = goalMetrics(reserveGoal, state, today);
    if (m.remaining > 0) {
      const share = m.progress < 0.5 ? 0.2 : 0.1;
      reserva = Math.min(m.remaining, Math.round(rest * share));
      if (reserva > 0) explain.push(`${fmt(reserva)} para a reserva (${Math.round(m.progress * 100)}% do alvo hoje${m.progress < 0.5 ? ', ainda baixa' : ''}).`);
    }
  } else if (!reserveGoal) {
    explain.push('Você ainda não tem uma reserva para imprevistos. Crie uma em "Minhas metas" para incluí-la na divisão.');
  }
  rest -= reserva;

  // 3. Metas: o que falta do aporte deste mês, por prioridade, sem passar de metade do que sobrou.
  const metas = [];
  if (rest > 0) {
    const ms = sortGoals(activeGoals(state).filter((g) => g.kind !== 'reserva').map((g) => goalMetrics(g, state, today)))
      .filter((m) => m.pendingThisMonth > 0 && m.status !== 'vencida' && m.status !== 'atingida');
    let cap = Math.floor(rest * 0.5);
    for (const m of ms) {
      if (cap <= 0) break;
      const v = Math.min(cap, m.pendingThisMonth);
      metas.push({ goal_id: m.goal.id, name: m.goal.name, amount: v, pending: m.pendingThisMonth });
      cap -= v;
    }
    const tot = metas.reduce((s, x) => s + x.amount, 0);
    if (tot > 0) explain.push(`${fmt(tot)} vão para metas com aporte pendente neste mês (limitado a metade do que sobrou, para você não ficar sem dinheiro no dia a dia).`);
    rest -= tot;
  }
  const livre = rest;
  explain.push(`${fmt(livre)} ficam livres para gastar.`);
  return { amount, contas, reserva, reserveGoal: reserveGoal || null, metas, livre, explain, period: sp.period };
}

// ---------------------------------------------------------------- categorias e séries

export function categoryMonth(state, today, key = monthKey(today)) {
  const from = `${key}-01`;
  const to = endOfMonth(from);
  const virt = virtualOccurrences(state, from, to).filter((o) => o.kind === 'despesa');
  return state.categories.filter((c) => !c.archived).map((c) => {
    let spent = 0, pending = 0;
    for (const t of state.transactions) {
      if (t.category_id !== c.id || t.date < from || t.date > to) continue;
      if (t.kind === 'despesa' && t.status === 'realizado') spent += t.amount_cents;
      if (t.kind === 'despesa' && t.status === 'previsto') pending += t.amount_cents;
      if (t.kind === 'reembolso' && t.status === 'realizado') spent -= t.amount_cents;
    }
    for (const v of virt) if (v.category_id === c.id) pending += v.amount_cents;
    const limit = c.monthly_limit_cents ?? null;
    const planned = spent + pending;
    return { category: c, spent, pending, planned, limit, ratio: limit ? planned / limit : null, over: limit != null && planned > limit };
  });
}

export function monthlySeries(state, today, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const first = addMonths(startOfMonth(today), -i, 1);
    const last = endOfMonth(first);
    let inc = 0, exp = 0, saved = 0;
    for (const t of state.transactions) {
      if (t.status !== 'realizado' || t.date < first || t.date > last) continue;
      if (t.kind === 'receita') inc += t.amount_cents;
      if (t.kind === 'despesa') exp += t.amount_cents;
      if (t.kind === 'reembolso') exp -= t.amount_cents;
    }
    for (const c of state.contributions) if (c.date >= first && c.date <= last && c.source !== 'inicial') saved += c.amount_cents;
    out.push({ key: monthKey(first), income: inc, expenses: Math.max(0, exp), saved });
  }
  return out;
}

export function goalSeries(m, today) {
  const pts = [];
  let acc = 0;
  for (const c of m.contributions) { acc += c.amount_cents; pts.push({ date: c.date, value: acc }); }
  if (!pts.length || pts[pts.length - 1].date < today) pts.push({ date: today, value: acc });
  return pts;
}

// ---------------------------------------------------------------- simulações opcionais

// Converte taxa anual efetiva em mensal equivalente: (1 + a)^(1/12) − 1.
export function annualToMonthly(annual) {
  return Math.pow(1 + annual, 1 / 12) - 1;
}

// IR regressivo de renda fixa sobre o rendimento, pelo prazo de cada aporte (em dias).
export function irRate(days) {
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.2;
  if (days <= 720) return 0.175;
  return 0.15;
}

// Simula mês a mês: saldo inicial + aporte mensal, com rendimento anual e inflação
// opcionais (premissas do usuário). Retorna valores BRUTOS e uma estimativa de IR.
export function simulate({ initial, monthly, months, annualRate = 0, annualInflation = 0, taxed = true }) {
  const r = annualToMonthly(annualRate);
  const inf = annualToMonthly(annualInflation);
  const n = Math.max(0, Math.floor(months));
  // Cada "lote" (inicial e cada aporte) rende de forma separada para estimar o IR pelo prazo.
  const lots = [{ principal: initial, value: initial, age: 0 }];
  const series = [];
  for (let k = 1; k <= n; k++) {
    for (const lot of lots) { lot.value *= 1 + r; lot.age += 1; }
    if (monthly) lots.push({ principal: monthly, value: monthly, age: 0 });
    const gross = lots.reduce((s, l) => s + l.value, 0);
    const invested = lots.reduce((s, l) => s + l.principal, 0);
    const tax = taxed ? lots.reduce((s, l) => s + Math.max(0, l.value - l.principal) * irRate(l.age * DIAS_POR_MES), 0) : 0;
    const deflator = Math.pow(1 + inf, k);
    series.push({ month: k, gross: Math.round(gross), invested: Math.round(invested), tax: Math.round(tax), net: Math.round(gross - tax), real: Math.round((gross - tax) / deflator) });
  }
  const last = series[series.length - 1] || { gross: initial, invested: initial, tax: 0, net: initial, real: initial };
  return { monthlyRate: r, monthlyInflation: inf, series, final: last };
}

// Aporte mensal necessário para chegar a `target` em `months` meses com taxa mensal r:
// PMT = (FV − PV·(1+r)^n) · r / ((1+r)^n − 1). Sem rendimento: (FV − PV) / n.
export function requiredMonthly(target, initial, months, monthlyRate = 0) {
  if (months <= 0) return Math.max(0, target - initial);
  if (!monthlyRate) return Math.max(0, Math.ceil((target - initial) / months));
  const g = Math.pow(1 + monthlyRate, months);
  return Math.max(0, Math.ceil(((target - initial * g) * monthlyRate) / (g - 1)));
}

// Valor nominal necessário no futuro para manter o poder de compra de hoje.
export function inflate(cents, annualInflation, years) {
  return Math.round(cents * Math.pow(1 + annualInflation, years));
}

// ---------------------------------------------------------------- planejador

export function planner(state, today, input = {}) {
  const cap = monthlyCapacity(state, today);
  const goalsM = sortGoals(activeGoals(state).map((g) => goalMetrics(g, state, today)));
  const alloc = allocateCapacity(goalsM, cap.capacity);
  const sp = spendable(state, today);
  const cats = new Map(state.categories.map((c) => [c.id, c]));
  const msgs = [];

  if (!state.accounts.length) msgs.push({ tone: 'info', text: 'Cadastre onde está o seu dinheiro em "Meu dinheiro" para o app calcular quanto está livre.' });
  if (sp.unknown.length) msgs.push({ tone: 'warn', text: `O saldo de ${sp.unknown.map((a) => a.name).join(', ')} está marcado como desconhecido; os valores livres podem estar errados até você informar.` });
  if (sp.hasAccounts) {
    if (sp.livreFinal >= 0) msgs.push({ tone: 'ok', text: `Depois das contas previstas até ${br(sp.period.end)}${sp.includePlanned && sp.aportesPendentes ? ' e dos aportes planejados' : ''}, você tem ${fmt(sp.livreFinal)} livres — cerca de ${fmt(sp.daily)} por dia.` });
    else msgs.push({ tone: 'bad', text: `Faltam ${fmt(-sp.livreFinal)} para cobrir as contas${sp.includePlanned && sp.aportesPendentes ? ' e aportes' : ''} até ${br(sp.period.end)}.` });
  }
  if (sp.overdue.length) msgs.push({ tone: 'bad', text: `${sp.overdue.length} conta(s) vencida(s) e não marcada(s) como paga(s): ${fmt(sp.overdue.reduce((s, b) => s + b.amount_cents, 0))}.` });

  for (const a of alloc) {
    const m = a.m;
    const name = m.goal.name;
    if (m.status === 'atingida') { msgs.push({ tone: 'ok', text: `Meta "${name}" atingida! Você pode arquivá-la ou aumentar o valor.` }); continue; }
    if (m.status === 'vencida') { msgs.push({ tone: 'bad', text: `O prazo de "${name}" passou e faltam ${fmt(m.remaining)}. Defina um novo prazo para recalcular.` }); continue; }
    if (m.status === 'sem_prazo') { msgs.push({ tone: 'warn', text: `"${name}" usa idade como prazo; informe sua data de nascimento em "Minha conta".` }); continue; }
    if (m.pendingThisMonth > 0) msgs.push({ tone: 'info', text: `Para "${name}", faltam ${fmt(m.pendingThisMonth)} de aporte neste mês.` });
    if (cap.incomeKnown && !a.fits) {
      msgs.push({ tone: 'warn', text: `"${name}" precisa de ${fmt(a.need)}/mês, mas a sobra mensal estimada que chega até ela é ${fmt(a.got)}. Simule outro prazo ou valor abaixo.` });
    }
  }
  if (!cap.incomeKnown) msgs.push({ tone: 'warn', text: 'Ainda não há renda registrada. Registre o que recebe (mesmo valores pequenos) em "Recebi" para o plano saber o que cabe.' });

  // Sugestões de redução: só categorias não essenciais, no máximo 25% da média, mantendo espaço para lazer.
  const totalNeed = alloc.reduce((s, a) => s + a.need, 0);
  const gap = Math.max(0, totalNeed - Math.max(0, cap.capacity));
  const suggestions = [];
  if (gap > 0) {
    let left = gap;
    for (const ca of cap.categoryAvg) {
      const c = cats.get(ca.category_id);
      if (!c || c.essential) continue;
      const cut = Math.min(left, Math.round(ca.monthly * 0.25));
      if (cut < 500) continue;
      suggestions.push({ category_id: c.id, name: c.name, avg: ca.monthly, cut, share: cut / gap });
      left -= cut;
      if (left <= 0) break;
    }
    for (const s of suggestions) msgs.push({ tone: 'info', text: `Reduzir ${fmt(s.cut)}/mês em "${s.name}" (média atual ${fmt(s.avg)}) diminuiria ${Math.round(s.share * 100)}% da diferença das metas.` });
  }

  // Cenários
  const goalId = input.goalId || goalsM.find((m) => m.status !== 'atingida' && m.goal.kind !== 'reserva')?.goal.id;
  const gm = goalsM.find((m) => m.goal.id === goalId) || null;
  // Metas que vêm antes na fila (prioridade e prazo) consomem a sobra primeiro.
  const idx = alloc.findIndex((a) => a.m.goal.id === goalId);
  const otherNeed = alloc.slice(0, Math.max(0, idx)).reduce((s, a) => s + a.need, 0);
  const scen = (capacity) => {
    if (!gm || gm.status === 'atingida' || gm.status === 'vencida' || gm.status === 'sem_prazo') return null;
    const avail = Math.max(0, capacity - otherNeed);
    const monthsToGoal = avail > 0 ? gm.remaining / avail : null;
    return {
      capacity, avail, need: gm.perMonth, fits: avail >= gm.perMonth,
      finishDate: monthsToGoal != null ? addDays(today, ceil(monthsToGoal * DIAS_POR_MES)) : null,
      atDeadline: gm.current + Math.round(avail * gm.monthsLeft),
    };
  };
  const reductions = input.reductions || {};
  const reductionTotal = Object.values(reductions).reduce((s, v) => s + (v || 0), 0);
  let alterar = null;
  if (gm && (input.newTarget || input.newDeadline)) {
    const target = input.newTarget ?? gm.target;
    const deadline = input.newDeadline ?? gm.deadline;
    const dl = deadline ? diffDays(today, deadline) : null;
    const remaining = Math.max(0, target - gm.current);
    const mLeft = dl != null ? dl / DIAS_POR_MES : null;
    const need = dl == null || dl < 0 ? null : (mLeft >= 1 ? ceil(remaining / mLeft) : remaining);
    const avail = Math.max(0, cap.capacity - otherNeed);
    alterar = { target, deadline, remaining, need, fits: need != null && avail >= need, avail, invalid: dl == null || dl < 0 };
  }
  return {
    cap, goalsM, alloc, sp, msgs, suggestions, gap, goal: gm,
    scenarios: {
      manter: scen(cap.capacity),
      reduzir: reductionTotal > 0 ? { ...scen(cap.capacity + reductionTotal), reductionTotal } : null,
      alterar,
    },
  };
}

// ---------------------------------------------------------------- alertas

export function alerts(state, today) {
  const sp = spendable(state, today);
  const out = [];
  for (const b of sp.bills) {
    const d = diffDays(today, b.date);
    if (d < 0) out.push({ tone: 'bad', text: `${b.description || 'Conta'} venceu em ${br(b.date)} (${fmt(b.amount_cents)}).`, ref: b });
    else if (d <= 3) out.push({ tone: 'warn', text: `${b.description || 'Conta'} vence ${d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`} (${fmt(b.amount_cents)}).`, ref: b });
  }
  for (const c of categoryMonth(state, today)) {
    if (c.limit && c.over) out.push({ tone: 'bad', text: `"${c.category.name}" passou do limite do mês (${fmt(c.planned)} de ${fmt(c.limit)}).` });
    else if (c.limit && c.ratio >= 0.8) out.push({ tone: 'warn', text: `"${c.category.name}" já usou ${Math.round(c.ratio * 100)}% do limite do mês.` });
  }
  if (sp.hasAccounts && sp.livreFinal < 0) out.unshift({ tone: 'bad', text: `Orçamento negativo: faltam ${fmt(-sp.livreFinal)} até ${br(sp.period.end)}.` });
  else if (sp.tight) out.push({ tone: 'warn', text: `Orçamento apertado: o limite diário (${fmt(sp.daily)}) está abaixo do seu gasto médio recente (${fmt(sp.avgDaily)}/dia).` });
  return out;
}

export { FREQUENCIAS, monthlyEquivalent, occurrenceDates, nextOccurrence, fromParts, daysInMonth };
