// Testes do motor de cálculo com exemplos conferidos à mão (ver docs/FORMULAS.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../shared/dates.js';
import { parseBRL, formatBRL, splitProportional } from '../shared/money.js';
import { parseGoalText } from '../shared/parse.js';
import * as C from '../shared/calc.js';

const TODAY = '2026-10-29';

function baseState() {
  return {
    profile: { created_at: '2026-09-01', birth_date: '2009-03-10', budget_mode: 'fim_do_mes', include_planned_contributions: true },
    accounts: [
      { id: 'cc', name: 'Conta corrente', purpose: 'gastar', liquidity: 'imediata', initial_cents: 50000, balance_known: true },
      { id: 'cx', name: 'Caixinha', purpose: 'reservado', liquidity: 'imediata', initial_cents: 0, balance_known: true },
    ],
    categories: [
      { id: 'lazer', name: 'Namoro e passeios', essential: false, monthly_limit_cents: 20000 },
      { id: 'alim', name: 'Alimentação', essential: true },
      { id: 'ass', name: 'Assinaturas', essential: false },
    ],
    transactions: [
      { id: 't1', kind: 'receita', amount_cents: 2000, date: '2026-10-20', account_id: 'cc', status: 'realizado' },
      { id: 't2', kind: 'receita', amount_cents: 15000, date: '2026-11-05', account_id: 'cc', status: 'previsto' },
      { id: 't3', kind: 'despesa', amount_cents: 3000, date: '2026-10-21', account_id: 'cc', category_id: 'lazer', status: 'realizado' },
      { id: 't4', kind: 'transferencia', amount_cents: 5000, date: '2026-10-22', account_id: 'cc', to_account_id: 'cx', status: 'realizado' },
      { id: 't5', kind: 'despesa', amount_cents: 4000, date: '2026-10-30', account_id: 'cc', category_id: 'ass', description: 'Spotify', status: 'previsto' },
      { id: 't6', kind: 'despesa', amount_cents: 2500, date: '2026-11-10', account_id: 'cc', category_id: 'ass', status: 'previsto' },
    ],
    recurrences: [],
    goals: [
      { id: 'g1', kind: 'meta', name: 'R$10 mil aos 20', target_cents: 1000000, priority: 1, target_type: 'idade', target_age: 20, plan_amount_cents: 10000, plan_frequency: 'mensal', created_at: '2026-09-01', baseline_cents: 5000 },
    ],
    contributions: [
      { id: 'c1', goal_id: 'g1', account_id: 'cx', amount_cents: 5000, date: '2026-09-01', source: 'inicial' },
      { id: 'c2', goal_id: 'g1', account_id: 'cc', amount_cents: 3000, date: '2026-10-25', source: 'aporte' },
    ],
  };
}

test('datas: aniversário, idade e 29 de fevereiro', () => {
  assert.equal(D.birthdayAtAge('2009-03-10', 20), '2029-03-10');
  assert.equal(D.birthdayAtAge('2008-02-29', 21), '2029-02-28');
  assert.equal(D.birthdayAtAge('2008-02-29', 20), '2028-02-29');
  assert.equal(D.ageOn('2009-03-10', TODAY), 17);
  assert.equal(D.ageOn('2009-10-29', TODAY), 17);
  assert.equal(D.ageOn('2009-10-30', TODAY), 16);
  assert.equal(D.diffDays(TODAY, '2029-03-10'), 863);
  assert.equal(D.addMonths('2026-01-31', 1), '2026-02-28');
  assert.deepEqual(D.monthsAndDays('2026-10-29', '2029-03-10'), { months: 28, days: 10 });
  assert.equal(D.todayISO('America/Sao_Paulo', new Date('2026-10-30T02:30:00Z')), '2026-10-29');
});

test('dinheiro: leitura em formato brasileiro e divisão sem perder centavos', () => {
  assert.equal(parseBRL('20'), 2000);
  assert.equal(parseBRL('20,5'), 2050);
  assert.equal(parseBRL('1.234,56'), 123456);
  assert.equal(parseBRL('R$ 10.000'), 1000000);
  assert.equal(parseBRL('12.50'), 1250);
  assert.equal(parseBRL('0,01'), 1);
  assert.equal(parseBRL('-15,00'), -1500);
  assert.equal(parseBRL('abc'), null);
  assert.equal(parseBRL('1,234,5'), null);
  assert.equal(formatBRL(123456), 'R$ 1.234,56');
  assert.deepEqual(splitProportional(100, [1, 1, 1]), [34, 33, 33]);
});

test('frase de meta é interpretada', () => {
  assert.deepEqual(parseGoalText('Quero ter R$10.000 quando completar 20 anos'), { target_cents: 1000000, target_type: 'idade', target_age: 20 });
  const b = parseGoalText('juntar 3 mil para uma viagem até dezembro de 2027');
  assert.equal(b.target_cents, 300000);
  assert.equal(b.target_date, '2027-12-31');
  assert.equal(b.name, 'Viagem');
  assert.equal(parseGoalText('R$ 800 até 15/03/2027').target_date, '2027-03-15');
});

test('saldos: só dinheiro recebido conta; transferência não cria receita', () => {
  const s = baseState();
  const bal = C.accountBalances(s);
  assert.equal(bal.get('cc'), 44000); // 500 + 20 − 30 − 50
  assert.equal(bal.get('cx'), 5000);
  const series = C.monthlySeries(s, TODAY, 2);
  const out = series.find((x) => x.key === '2026-10');
  assert.equal(out.income, 2000); // a transferência de 50 e a receita prevista de 150 não entram
  assert.equal(out.expenses, 3000);
});

test('quanto posso gastar: sem contar duas vezes o que já foi separado ou pago', () => {
  const sp = C.spendable(baseState(), TODAY);
  assert.equal(sp.saldoBase, 44000);
  assert.equal(sp.separado, 3000); // só o que está separado em contas de gasto
  assert.equal(sp.compromissos, 4000); // só a conta que vence até 31/10
  assert.equal(sp.livre, 37000);
  assert.equal(sp.aportesPendentes, 7000); // plano 100 − 30 já aportados no mês
  assert.equal(sp.livreFinal, 30000);
  assert.equal(sp.days, 3);
  assert.equal(sp.daily, 10000);
  assert.equal(sp.weekly, 30000);
  assert.equal(sp.incomesTotal, 0); // a receita prevista é em 05/11, fora do período
  assert.equal(sp.totals.reservado, 5000);
});

test('orçamento negativo mostra déficit em vez de zero', () => {
  const s = baseState();
  s.transactions.push({ id: 'big', kind: 'despesa', amount_cents: 60000, date: '2026-10-31', account_id: 'cc', status: 'previsto', description: 'Conserto' });
  const sp = C.spendable(s, TODAY);
  assert.equal(sp.livre, 37000 - 60000);
  assert.equal(sp.livreFinal, -30000);
  assert.equal(sp.deficit, 30000);
  assert.equal(sp.daily, 0);
  assert.ok(C.deficitOptions(sp, s).length > 0);
});

test('meta por idade: prazo pelo aniversário e valores por mês/semana', () => {
  const s = baseState();
  const m = C.goalMetrics(s.goals[0], s, TODAY);
  assert.equal(m.deadline, '2029-03-10');
  assert.equal(m.daysLeft, 863);
  assert.equal(m.current, 8000);
  assert.equal(m.remaining, 992000);
  assert.equal(m.perMonth, 34988); // ceil(992000 × 30,4375 / 863)
  assert.equal(m.perWeek, 8047); // ceil(992000 × 7 / 863)
  assert.equal(m.contributedThisMonth, 3000);
  assert.equal(m.planMonthly, 10000);
  assert.equal(m.status, 'atrasada');
  assert.equal(m.planEnough, false);
});

test('metas: atingida, vencida, prazo curto e sem data de nascimento', () => {
  const s = baseState();
  const g = { id: 'g2', name: 'x', target_cents: 5000, target_type: 'data', target_date: '2027-01-01', created_at: '2026-10-01', baseline_cents: 0 };
  s.goals.push(g);
  s.contributions.push({ goal_id: 'g2', account_id: 'cx', amount_cents: 6000, date: '2026-10-02', source: 'aporte' });
  assert.equal(C.goalMetrics(g, s, TODAY).status, 'atingida');
  assert.equal(C.goalMetrics(g, s, TODAY).perMonth, 0);

  const v = { ...g, id: 'g3', target_date: '2026-10-01' };
  s.goals.push(v);
  const mv = C.goalMetrics(v, s, TODAY);
  assert.equal(mv.status, 'vencida');
  assert.equal(mv.remaining, 5000);
  assert.equal(mv.perMonth, null);

  const curto = { ...g, id: 'g4', target_date: '2026-11-08' };
  const mc = C.goalMetrics(curto, s, TODAY);
  assert.equal(mc.daysLeft, 10);
  assert.equal(mc.shortDeadline, true);
  assert.equal(mc.perMonth, 5000);
  assert.equal(mc.perWeek, 3500); // ceil(5000 / (10/7))

  const semNasc = { ...baseState(), profile: { created_at: '2026-09-01' } };
  assert.equal(C.goalMetrics(semNasc.goals[0], semNasc, TODAY).status, 'sem_prazo');
});

test('posso comprar isso? não registra nada e aponta o que seria afetado', () => {
  const s = baseState();
  const before = JSON.stringify(s);
  const a = C.canIBuy(s, TODAY, 35000);
  assert.equal(a.after, -5000);
  assert.equal(a.verdict, 'afeta_metas');
  assert.equal(a.affectedGoals[0].uncovered, 5000);
  const b = C.canIBuy(s, TODAY, 40000);
  assert.equal(b.verdict, 'nao_cabe');
  assert.equal(b.affectedBills.length, 1);
  assert.equal(JSON.stringify(s), before);
  const ok = C.canIBuy(s, TODAY, 1000);
  assert.equal(ok.verdict, 'cabe');
  assert.ok(ok.goalImpact.delayDays > 0);
});

test('recorrências: dia 31 em fevereiro, sem duplicar ocorrência já lançada', () => {
  const rec = { id: 'r', kind: 'despesa', amount_cents: 1990, frequency: 'mensal', day_of_month: 31, start_date: '2026-01-31', active: true };
  assert.deepEqual(C.occurrenceDates(rec, '2026-01-01', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  const s = { ...baseState(), transactions: [], recurrences: [{ ...rec, day_of_month: 5, start_date: '2026-09-05' }] };
  s.transactions.push({ id: 'p', kind: 'despesa', amount_cents: 1990, date: '2026-10-05', account_id: 'cc', status: 'realizado', recurrence_id: 'r', occurrence_date: '2026-10-05' });
  const v1 = C.virtualOccurrences(s, '2026-09-01', '2026-11-30').map((o) => o.date);
  const v2 = C.virtualOccurrences(s, '2026-09-01', '2026-11-30').map((o) => o.date);
  assert.deepEqual(v1, ['2026-09-05', '2026-11-05']);
  assert.deepEqual(v1, v2);
  const sem = C.occurrenceDates({ frequency: 'semanal', start_date: '2026-10-01' }, '2026-10-01', '2026-10-31');
  assert.deepEqual(sem, ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29']);
});

test('período até a próxima renda fixa', () => {
  const s = baseState();
  s.profile.budget_mode = 'proxima_renda';
  s.recurrences.push({ id: 'sal', kind: 'receita', amount_cents: 80000, frequency: 'mensal', day_of_month: 5, start_date: '2026-09-05', active: true, account_id: 'cc' });
  const p = C.budgetPeriod(s, TODAY);
  assert.equal(p.nextIncome, '2026-11-05');
  assert.equal(p.end, '2026-11-04');
  const sp = C.spendable(s, TODAY);
  // Inclui a ocorrência de 05/10 do salário como prevista (não confirmada), mas ela não entra no saldo.
  assert.ok(sp.incomes.every((i) => i.status === 'previsto'));
  assert.equal(sp.saldoBase, 44000);
});

test('reembolso reduz o gasto da categoria sem virar renda', () => {
  const s = baseState();
  s.transactions.push({ id: 'rb', kind: 'reembolso', amount_cents: 1000, date: '2026-10-23', account_id: 'cc', category_id: 'lazer', status: 'realizado' });
  const lazer = C.categoryMonth(s, TODAY).find((c) => c.category.id === 'lazer');
  assert.equal(lazer.spent, 2000);
  const out = C.monthlySeries(s, TODAY, 1)[0];
  assert.equal(out.income, 2000);
  assert.equal(out.expenses, 2000);
  assert.equal(C.accountBalances(s).get('cc'), 45000);
});

test('simulações: taxa anual → mensal, aporte necessário e IR regressivo', () => {
  assert.ok(Math.abs(C.annualToMonthly(0.12682503013196977) - 0.01) < 1e-12);
  assert.equal(C.requiredMonthly(1200000, 0, 12, 0), 100000);
  assert.equal(C.requiredMonthly(1268250, 0, 12, 0.01), 100000);
  assert.equal(C.irRate(180), 0.225);
  assert.equal(C.irRate(181), 0.2);
  assert.equal(C.irRate(721), 0.15);
  const sim = C.simulate({ initial: 0, monthly: 100000, months: 12, annualRate: 0 });
  assert.equal(sim.final.gross, 1200000);
  assert.equal(sim.final.tax, 0);
  const sim2 = C.simulate({ initial: 100000, monthly: 0, months: 12, annualRate: 0.12682503013196977 });
  assert.equal(sim2.final.gross, 112683);
  assert.equal(sim2.final.tax, 2219); // 17,5% de R$ 126,825 // 12 meses ≈ 365 dias → faixa de 361 a 720 dias
  assert.equal(C.inflate(1000000, 0.04, 2), 1081600);
});

test('divisão sugerida de uma entrada fecha exatamente o valor recebido', () => {
  const s = baseState();
  s.goals.push({ id: 'res', kind: 'reserva', name: 'Reserva', target_cents: 100000, created_at: '2026-09-01', target_type: 'data', target_date: '2027-12-31' });
  const sp = C.suggestSplit(s, TODAY, 15000, { countedInBase: 15000 });
  const sum = sp.contas + sp.reserva + sp.metas.reduce((a, b) => a + b.amount, 0) + sp.livre;
  assert.equal(sum, 15000);
  assert.ok(sp.reserva > 0);
});

test('capacidade mensal e planejador sem renda registrada', () => {
  const s = baseState();
  s.transactions = s.transactions.filter((t) => t.kind !== 'receita');
  const p = C.planner(s, TODAY);
  assert.equal(p.cap.incomeKnown, false);
  assert.ok(p.msgs.some((m) => m.text.includes('Ainda não há renda registrada')));
  const s2 = baseState();
  s2.recurrences.push({ id: 'sal', kind: 'receita', amount_cents: 50000, frequency: 'mensal', day_of_month: 5, start_date: '2026-09-05', active: true });
  const p2 = C.planner(s2, TODAY, { reductions: { lazer: 5000 } });
  assert.equal(p2.cap.incomeFixed, 50000);
  assert.ok(p2.scenarios.manter);
  assert.equal(p2.scenarios.reduzir.capacity, p2.cap.capacity + 5000);
  const alt = C.planner(s2, TODAY, { newDeadline: '2026-10-01' }).scenarios.alterar;
  assert.equal(alt.invalid, true);
});

test('aporte do primeiro mês é proporcional aos dias restantes', () => {
  const s = baseState();
  const g = { ...s.goals[0], id: 'novo', created_at: '2026-10-28', plan_amount_cents: 31000 };
  s.goals = [g];
  s.contributions = [];
  const m = C.goalMetrics(g, s, TODAY);
  assert.equal(m.monthTarget, 4000); // 31000 × 4/31 (28 a 31 de outubro)
  assert.equal(C.goalMetrics({ ...g, created_at: '2026-09-15' }, s, TODAY).monthTarget, 31000);
});

test('cenário desconta metas que vêm antes na fila', () => {
  const s = baseState();
  s.recurrences.push({ id: 'sal', kind: 'receita', amount_cents: 100000, frequency: 'mensal', day_of_month: 5, start_date: '2026-09-05', active: true });
  s.goals.push({ id: 'res', kind: 'reserva', name: 'Reserva', target_cents: 120000, priority: 1, target_type: 'data', target_date: '2027-10-29', created_at: '2026-09-01', baseline_cents: 0 });
  const p = C.planner(s, TODAY, { goalId: 'g1' });
  const res = p.alloc.find((a) => a.m.goal.id === 'res');
  assert.equal(p.alloc[0].m.goal.id, 'res'); // mesma prioridade, prazo mais curto
  assert.equal(p.scenarios.manter.avail, p.cap.capacity - res.need);
});
