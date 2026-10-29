// Testes de "Organizar meu dinheiro", uso do orçamento, projeção e assistente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../shared/calc.js';
import * as B from '../shared/budget.js';
import { ask } from '../shared/assistant.js';

const TODAY = '2026-10-29'; // quinta-feira

function state() {
  return {
    profile: { created_at: '2026-07-01', birth_date: '2009-03-10', budget_mode: 'fim_do_mes', include_planned_contributions: true },
    accounts: [
      { id: 'cc', name: 'Conta', purpose: 'gastar', liquidity: 'imediata', initial_cents: 100000, balance_known: true },
      { id: 'cx', name: 'Caixinha', purpose: 'reservado', liquidity: 'imediata', initial_cents: 0, balance_known: true },
    ],
    categories: [
      { id: 'alim', name: 'Alimentação', essential: true, icon: '🍽️' },
      { id: 'uber', name: 'Uber', essential: true, icon: '🚗' },
      { id: 'namoro', name: 'Namoro e passeios', essential: false, icon: '💞' },
      { id: 'compras', name: 'Compras', essential: false, icon: '🛍️' },
      { id: 'velha', name: 'Antiga', essential: false, archived: true },
    ],
    // Histórico: 90 dias. Alimentação R$ 900 (R$10/dia), Uber R$ 450 (R$5/dia), Namoro R$ 900 (R$10/dia).
    transactions: [
      { id: 'h1', kind: 'despesa', amount_cents: 90000, date: '2026-09-15', account_id: 'cc', category_id: 'alim', status: 'realizado', created_at: '2026-09-15T12:00:00Z' },
      { id: 'h2', kind: 'despesa', amount_cents: 45000, date: '2026-09-20', account_id: 'cc', category_id: 'uber', status: 'realizado', created_at: '2026-09-20T12:00:00Z' },
      { id: 'h3', kind: 'despesa', amount_cents: 90000, date: '2026-10-01', account_id: 'cc', category_id: 'namoro', status: 'realizado', created_at: '2026-10-01T12:00:00Z' },
      { id: 'in', kind: 'receita', amount_cents: 225000, date: '2026-09-01', account_id: 'cc', status: 'realizado', created_at: '2026-09-01T12:00:00Z' },
      { id: 'bill', kind: 'despesa', amount_cents: 5000, date: '2026-10-30', account_id: 'cc', category_id: 'compras', status: 'previsto', description: 'Celular', created_at: '2026-10-01T12:00:00Z' },
    ],
    recurrences: [],
    goals: [{ id: 'g', kind: 'meta', name: 'Meta dos 20', target_cents: 1000000, priority: 1, target_type: 'data', target_date: '2027-10-29', plan_amount_cents: 20000, plan_frequency: 'mensal', created_at: '2026-09-01', created_ts: '2026-09-01T00:00:00Z', baseline_cents: 0 }],
    contributions: [],
    plan: null,
  };
}

test('sugestão usa histórico real, prioriza essenciais e nunca passa do disponível', () => {
  const s = state();
  // Saldo 1000 + 2250 − 900 − 450 − 900 = 1000,00; conta de 50 até 31/10 → disponível 950.
  const r = B.suggestBudget(s, TODAY);
  assert.equal(r.available, 95000);
  assert.equal(r.days, 3);
  const by = Object.fromEntries(r.items.map((i) => [i.key, i]));
  assert.equal(by['categoria:alim'].need, 3000); // R$10/dia × 3
  assert.equal(by['categoria:uber'].need, 1500);
  assert.equal(by['categoria:namoro'].need, 3000);
  assert.equal(by['meta:g'].need, 20000);
  assert.equal(by['categoria:alim'].amount, 3000);
  assert.equal(by['meta:g'].amount, 20000);
  assert.ok(!r.items.some((i) => i.id === 'velha')); // arquivada fica fora
  assert.equal(r.distributed + r.livre, r.pool);
  assert.equal(r.livre, 95000 - 3000 - 1500 - 3000 - 20000);
  assert.equal(r.totalShort, 0);
});

test('com pouco dinheiro: essenciais primeiro, mostra o que falta e respeita valores fixados', () => {
  const s = state();
  s.accounts[0].initial_cents = 10000; // saldo 100,00 (entradas e gastos se anulam) → disponível 50,00
  const r = B.suggestBudget(s, TODAY);
  assert.equal(r.available, 5000);
  const by = Object.fromEntries(r.items.map((i) => [i.key, i]));
  assert.equal(by['categoria:alim'].amount + by['categoria:uber'].amount, 4500);
  assert.equal(by['meta:g'].amount, 500);
  assert.equal(by['categoria:namoro'].amount, 0);
  assert.equal(r.distributed, 5000);
  assert.equal(r.totalShort, 3000 + 19500);

  const l = B.suggestBudget(s, TODAY, { locked: { 'categoria:namoro': 2000 } });
  const lb = Object.fromEntries(l.items.map((i) => [i.key, i]));
  assert.equal(lb['categoria:namoro'].amount, 2000);
  assert.equal(l.distributed, 5000);
  assert.equal(lb['categoria:alim'].amount + lb['categoria:uber'].amount, 3000);

  const over = B.suggestBudget(s, TODAY, { locked: { 'categoria:namoro': 9000 } });
  assert.equal(over.overLocked, 4000);

  s.accounts[0].initial_cents = 0; // saldo 0, conta de 50 → disponível negativo
  const neg = B.suggestBudget(s, TODAY);
  assert.equal(neg.available, -5000);
  assert.equal(neg.distributed, 0);
  assert.ok(neg.totalShort >= 5000);
});

test('categoria pode virar essencial só na simulação', () => {
  const r = B.suggestBudget(state(), TODAY, { essential: { namoro: true } });
  assert.equal(r.items.find((i) => i.id === 'namoro').stage, 1);
});

test('plano não desconta saldo; gasto reduz o saldo uma vez e consome o orçamento', () => {
  const s = state();
  const before = C.spendable(s, TODAY);
  s.plan = { id: 'p', created_at: '2026-10-29T10:00:00Z', period_start: TODAY, period_end: '2026-10-31', available_cents: 95000,
    items: [{ type: 'categoria', ref_id: 'namoro', amount_cents: 6000, locked: false }, { type: 'meta', ref_id: 'g', amount_cents: 20000, locked: false }] };
  assert.equal(C.spendable(s, TODAY).livreFinal, before.livreFinal);
  s.transactions.push({ id: 'cinema', kind: 'despesa', amount_cents: 3500, date: TODAY, account_id: 'cc', category_id: 'namoro', status: 'realizado', created_at: '2026-10-29T15:00:00Z' });
  const after = C.spendable(s, TODAY);
  assert.equal(before.saldoBase - after.saldoBase, 3500);
  const u = B.budgetUsage(s, s.plan);
  const nam = u.items.find((i) => i.ref_id === 'namoro');
  assert.equal(nam.used, 3500);
  assert.equal(nam.left, 2500);
  // Gasto antigo (antes do plano) não consome o orçamento.
  assert.equal(u.items.find((i) => i.ref_id === 'namoro').used, 3500);
  assert.deepEqual(B.planStale(s, s.plan, TODAY), []);
  s.transactions.push({ id: 'pix', kind: 'receita', amount_cents: 2000, date: TODAY, account_id: 'cc', status: 'realizado', created_at: '2026-10-29T16:00:00Z' });
  assert.equal(B.planStale(s, s.plan, TODAY).length, 1);
  assert.equal(B.planStale(s, s.plan, '2026-11-01').length, 2);
});

test('projeção soma receitas previstas e tira contas, separada do saldo atual', () => {
  const s = state();
  s.transactions.push({ id: 'prev', kind: 'receita', amount_cents: 30000, date: '2026-11-03', account_id: 'cc', status: 'previsto' });
  const p = B.projection(s, TODAY, '2026-11-05');
  assert.equal(p.start, 100000);
  assert.equal(p.days.find((d) => d.date === '2026-10-30').balance, 95000);
  assert.equal(p.days.find((d) => d.date === '2026-11-03').balance, 125000);
  assert.equal(C.accountBalances(s).get('cc'), 100000);
});

test('assistente responde com dados reais e período', () => {
  const s = state();
  const w = ask(s, TODAY, 'fimdesemana');
  const sp = C.spendable(s, TODAY);
  assert.ok(w.value <= sp.livreFinal);
  assert.equal(w.value, Math.min(sp.livreFinal, sp.daily * 2));
  assert.match(w.period, /31\/10\/2026/);
  assert.equal(ask(s, TODAY, 'possogastar').needs, 'amount');
  const big = ask(s, TODAY, 'possogastar', { amount: 900000 });
  assert.equal(big.verdict, 'nao_cabe');
  const rec = ask(s, TODAY, 'recebi', { amount: 10000 });
  assert.equal(rec.action.type, 'apply');
  const body = rec.action.request.body;
  assert.equal(body.items[0].amount_cents, 10000);
  assert.ok(body.contributions.reduce((x, c) => x + c.amount_cents, 0) <= 10000);
  const pas = ask(s, TODAY, 'passeios');
  assert.equal(pas.value, B.suggestBudget(s, TODAY).items.find((i) => i.id === 'namoro').amount);
  assert.ok(ask(s, TODAY, 'ajustar').answer.length > 0);
  // Sem despesas fixas cadastradas, o assistente avisa discretamente.
  assert.ok(w.caveats.some((c) => c.includes('despesa fixa')));
});

test('comparação mensal por categoria', () => {
  const r = B.monthCompare(state(), '2026-10', '2026-09');
  assert.equal(r.cur.expenses, 90000);
  assert.equal(r.prev.expenses, 135000);
  assert.equal(r.rows.find((x) => x.category_id === 'alim').delta, -90000);
});

test('renda futura comprometida', () => {
  const s = state();
  s.recurrences.push({ id: 'm', kind: 'receita', amount_cents: 50000, frequency: 'mensal', day_of_month: 5, start_date: '2026-09-05', active: true, account_id: 'cc' });
  s.recurrences.push({ id: 's', kind: 'despesa', amount_cents: 2190, frequency: 'mensal', day_of_month: 10, start_date: '2026-09-10', active: true, account_id: 'cc' });
  const c = B.incomeCommitment(s, TODAY, 30);
  assert.equal(c.income, 50000);
  assert.equal(c.bills, 5000 + 2190);
});

test('sem histórico, a sugestão usa o limite mensal proporcional ao período', () => {
  const s = state();
  s.categories.push({ id: 'pat', name: 'Patinete', essential: false, monthly_limit_cents: 6000 });
  const it = B.suggestBudget(s, TODAY).items.find((i) => i.id === 'pat');
  assert.equal(it.need, 600); // 60 × 3/30
});
