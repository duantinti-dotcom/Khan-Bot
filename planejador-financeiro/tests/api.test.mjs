// Testes de integração da API contra um Postgres real.
// Requer TEST_DATABASE_URL (um banco descartável: o esquema "fin" é recriado).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { createApi, PG_TYPES } from '../server/api.js';
import * as C from '../shared/calc.js';
import { addDays } from '../shared/dates.js';

const DB = process.env.TEST_DATABASE_URL;
let sql, handle, TODAY, MIGRATED;

before(async () => {
  if (!DB) return;
  sql = postgres(DB, { types: PG_TYPES, onnotice: () => {} });
  await sql.unsafe('DROP SCHEMA IF EXISTS fin CASCADE');
  // Simula o banco em produção: aplica a migração 001, grava dados antigos e só então aplica a 002 (duas vezes).
  const mig = (n) => readFile(new URL(`../server/migrations/${n}`, import.meta.url), 'utf8');
  await sql.unsafe(await mig('001_esquema_inicial.sql'));
  const [u] = await sql`INSERT INTO fin.users (username, username_lower, pass_hash) VALUES ('Antigo', 'antigo', 'x') RETURNING id`;
  await sql`INSERT INTO fin.profiles (user_id) VALUES (${u.id})`;
  const [a] = await sql`INSERT INTO fin.accounts (user_id, name, kind, purpose, liquidity, initial_cents) VALUES (${u.id}, 'C', 'corrente', 'gastar', 'imediata', 12345) RETURNING id`;
  await sql`INSERT INTO fin.recurrences (user_id, kind, amount_cents, description, frequency, day_of_month, start_date, account_id) VALUES (${u.id}, 'despesa', 999, 'Spotify', 'mensal', 10, '2026-10-01', ${a.id})`;
  await sql`INSERT INTO fin.transactions (user_id, kind, amount_cents, date, account_id, status) VALUES (${u.id}, 'receita', 500, '2026-10-01', ${a.id}, 'realizado')`;
  await sql.unsafe(await mig('002_orcamento_e_estimativas.sql'));
  await sql.unsafe(await mig('002_orcamento_e_estimativas.sql'));
  MIGRATED = await sql`SELECT (SELECT count(*)::int FROM fin.users) AS users, (SELECT initial_cents FROM fin.accounts) AS bal,
    (SELECT estimated FROM fin.recurrences) AS est, (SELECT count(*)::int FROM fin.transactions) AS txs`;
  handle = createApi({ sql, secureCookies: true });
  TODAY = (await (await handle(new Request('http://x/api/health'))).json()).today;
});
after(async () => { if (sql) await sql.end(); });

function client(ip = '10.0.0.1') {
  let cookie = '';
  async function call(method, path, body, { csrf = true, raw = false } = {}) {
    const headers = { 'x-forwarded-for': ip, 'content-type': 'application/json' };
    if (csrf) headers['x-fin-csrf'] = '1';
    if (cookie) headers.cookie = cookie;
    const res = await handle(new Request(`https://app.test/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
    const sc = res.headers.get('set-cookie');
    if (sc) {
      const v = sc.split(';')[0];
      cookie = v.endsWith('=') ? '' : v;
    }
    if (raw) return res;
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, setCookie: sc };
  }
  return { call, get cookie() { return cookie; }, set cookie(v) { cookie = v; } };
}

const skip = !DB && 'defina TEST_DATABASE_URL';

async function state(c) {
  const r = await c.call('GET', '/data');
  assert.equal(r.status, 200);
  return r.data;
}

test('cadastro, login, sessão, sair e nome único sem diferenciar maiúsculas', { skip }, async () => {
  const a = client();
  const r = await a.call('POST', '/auth/signup', { username: 'Alice_17', password: 'minhasenha-forte' });
  assert.equal(r.status, 201);
  assert.equal(r.data.recoveryCodes.length, 8);
  assert.match(r.setCookie, /__Host-fin_sess=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure/);
  assert.equal((await a.call('GET', '/auth/me')).data.user.username, 'Alice_17');

  const dup = await client('10.0.0.9').call('POST', '/auth/signup', { username: 'alice_17', password: 'outrasenha-forte' });
  assert.equal(dup.status, 409);

  const d = await state(a);
  assert.equal(d.categories.length, 9);
  assert.equal(d.accounts.length, 0);
  assert.equal(d.profile.birth_date, null); // desconhecido, não zero

  await a.call('POST', '/auth/logout');
  assert.equal((await a.call('GET', '/auth/me')).data.user, null);
  assert.equal((await a.call('GET', '/data')).status, 401);
  const ok = await a.call('POST', '/auth/login', { username: 'ALICE_17', password: 'minhasenha-forte' });
  assert.equal(ok.status, 200);
  assert.equal((await a.call('GET', '/data')).status, 200);
});

test('senha fraca e usuário inválido são recusados', { skip }, async () => {
  const c = client('10.0.0.50');
  assert.equal((await c.call('POST', '/auth/signup', { username: 'ab', password: 'minhasenha-forte' })).status, 400);
  assert.equal((await c.call('POST', '/auth/signup', { username: 'carlos', password: '1234' })).status, 400);
  assert.equal((await c.call('POST', '/auth/signup', { username: 'carlos', password: 'carlos' })).status, 400);
});

test('limite de tentativas de login', { skip }, async () => {
  const c = client('10.0.0.2');
  await c.call('POST', '/auth/signup', { username: 'bruteme', password: 'senha-certa-123' });
  await c.call('POST', '/auth/logout');
  for (let i = 0; i < 5; i++) assert.equal((await c.call('POST', '/auth/login', { username: 'bruteme', password: 'errada' + i })).status, 401);
  const blocked = await c.call('POST', '/auth/login', { username: 'bruteme', password: 'senha-certa-123' });
  assert.equal(blocked.status, 429);
});

test('proteção CSRF: escrita sem cabeçalho é recusada', { skip }, async () => {
  const c = client('10.0.0.3');
  const r = await c.call('POST', '/auth/signup', { username: 'csrfuser', password: 'senha-certa-123' }, { csrf: false });
  assert.equal(r.status, 403);
});

test('isolamento entre usuários', { skip }, async () => {
  const a = client('10.0.1.1');
  const b = client('10.0.1.2');
  await a.call('POST', '/auth/signup', { username: 'ana', password: 'senha-da-ana-1' });
  await b.call('POST', '/auth/signup', { username: 'beto', password: 'senha-do-beto-1' });
  const acc = await a.call('POST', '/accounts', { name: 'Nubank', kind: 'corrente', purpose: 'gastar', liquidity: 'imediata', initial_cents: 10000 });
  assert.equal(acc.status, 201);
  const aid = acc.data.id;
  const aData = await state(a);
  const aCat = aData.categories[0].id;

  // Beto tenta ler, editar, apagar e referenciar dados da Ana.
  assert.equal((await b.call('PUT', `/accounts/${aid}`, { name: 'hack' })).status, 404);
  assert.equal((await b.call('DELETE', `/accounts/${aid}`)).status, 404);
  assert.equal((await b.call('POST', `/accounts/${aid}/reconcile`, { balance_cents: 0 })).status, 404);
  const bt = await b.call('POST', '/transactions', { kind: 'despesa', amount_cents: 100, date: TODAY, account_id: aid, category_id: aCat, status: 'realizado' });
  assert.equal(bt.status, 400);
  const bAcc = await b.call('POST', '/accounts', { name: 'Carteira', kind: 'dinheiro', purpose: 'gastar', liquidity: 'imediata', initial_cents: 0 });
  const tr = await b.call('POST', '/transactions', { kind: 'transferencia', amount_cents: 100, date: TODAY, account_id: bAcc.data.id, to_account_id: aid, status: 'realizado' });
  assert.equal(tr.status, 400);
  const goalA = await a.call('POST', '/goals', { name: 'Meta da Ana', target_cents: 100000, target_type: 'data', target_date: addDays(TODAY, 365) });
  assert.equal((await b.call('POST', '/contributions', { goal_id: goalA.data.id, account_id: bAcc.data.id, amount_cents: 100, date: TODAY })).status, 400);
  // O campo user_id enviado pelo cliente é ignorado.
  await b.call('POST', '/accounts', { name: 'X', kind: 'outros', purpose: 'gastar', liquidity: 'imediata', initial_cents: 1, user_id: aData.user.id });

  const bData = await state(b);
  assert.ok(bData.accounts.every((x) => x.id !== aid));
  assert.equal(bData.goals.length, 0);
  const aAfter = await state(a);
  assert.equal(aAfter.accounts.length, 1);
  assert.equal(aAfter.accounts[0].name, 'Nubank');
  assert.equal(aAfter.transactions.length, 0);
});

test('fluxo financeiro completo: entradas picadas, despesas, transferência, metas e recorrência', { skip }, async () => {
  const c = client('10.0.2.1');
  await c.call('POST', '/auth/signup', { username: 'fluxo', password: 'senha-fluxo-123' });
  await c.call('PUT', '/profile', { display_name: 'Fê', birth_date: '2009-03-10', budget_mode: 'fim_do_mes' });
  const cc = (await c.call('POST', '/accounts', { name: 'Conta', kind: 'corrente', purpose: 'gastar', liquidity: 'imediata', initial_cents: 5000 })).data.id;
  const cx = (await c.call('POST', '/accounts', { name: 'Caixinha', kind: 'caixinha', purpose: 'reservado', liquidity: 'imediata', initial_cents: 0 })).data.id;
  let d = await state(c);
  const cat = d.categories.find((x) => x.name === 'Patinete').id;

  // Dinheiro picado: R$20 hoje (recebido), R$150 amanhã e R$80 depois (previstos), em lote.
  const batch = await c.call('POST', '/transactions', { items: [
    { kind: 'receita', amount_cents: 2000, date: TODAY, account_id: cc, status: 'realizado', description: 'Pix da tia' },
    { kind: 'receita', amount_cents: 15000, date: addDays(TODAY, 1), account_id: cc, status: 'previsto', description: 'Freela' },
    { kind: 'receita', amount_cents: 8000, date: addDays(TODAY, 2), account_id: cc, status: 'previsto', description: 'Venda' },
  ] });
  assert.equal(batch.status, 201);
  // Valor "recebido" com data futura é recusado.
  assert.equal((await c.call('POST', '/transactions', { kind: 'receita', amount_cents: 100, date: addDays(TODAY, 3), account_id: cc, status: 'realizado' })).status, 400);

  d = await state(c);
  let bal = C.accountBalances(d);
  assert.equal(bal.get(cc), 7000); // 50 + 20; previstos não entram

  // Despesa pendente e depois paga.
  const exp = await c.call('POST', '/transactions', { kind: 'despesa', amount_cents: 1200, date: TODAY, account_id: cc, category_id: cat, status: 'previsto', description: 'Patinete' });
  d = await state(c);
  assert.equal(C.accountBalances(d).get(cc), 7000);
  assert.equal(C.spendable(d, TODAY).compromissos, 1200);
  await c.call('PUT', `/transactions/${exp.data.id}`, { status: 'realizado' });
  d = await state(c);
  assert.equal(C.accountBalances(d).get(cc), 5800);
  assert.equal(C.spendable(d, TODAY).compromissos, 0);

  // Transferência para a caixinha: não vira receita nem despesa.
  await c.call('POST', '/transactions', { kind: 'transferencia', amount_cents: 3000, date: TODAY, account_id: cc, to_account_id: cx, status: 'realizado' });
  d = await state(c);
  bal = C.accountBalances(d);
  assert.equal(bal.get(cc), 2800);
  assert.equal(bal.get(cx), 3000);
  const month = C.monthlySeries(d, TODAY, 1)[0];
  assert.equal(month.income, 2000);
  assert.equal(month.expenses, 1200);

  // Meta por idade com valor inicial já guardado na caixinha.
  const g = await c.call('POST', '/goals', { name: '10 mil aos 20', target_cents: 1000000, target_type: 'idade', target_age: 20, priority: 1, plan_amount_cents: 20000, plan_frequency: 'mensal', initial: { amount_cents: 2500, account_id: cx } });
  assert.equal(g.status, 201);
  // Não dá para destinar mais do que a conta tem (3000 na caixinha, 2500 já destinados).
  const over = await c.call('POST', '/contributions', { goal_id: g.data.id, account_id: cx, amount_cents: 600, date: TODAY });
  assert.equal(over.status, 409);
  assert.equal(over.data.code, 'ALLOCATION_EXCEEDS');
  // Segunda meta usando o restante da mesma conta: permitido até o saldo.
  const g2 = await c.call('POST', '/goals', { name: 'Reserva', kind: 'reserva', target_cents: 50000, target_type: 'data', target_date: addDays(TODAY, 300), priority: 2 });
  assert.equal((await c.call('POST', '/contributions', { goal_id: g2.data.id, account_id: cx, amount_cents: 500, date: TODAY })).status, 201);
  assert.equal((await c.call('POST', '/contributions', { goal_id: g2.data.id, account_id: cx, amount_cents: 1, date: TODAY })).status, 409);
  // Aporte separado na própria conta corrente reduz o "livre".
  assert.equal((await c.call('POST', '/contributions', { goal_id: g.data.id, account_id: cc, amount_cents: 800, date: TODAY })).status, 201);
  d = await state(c);
  const sp = C.spendable(d, TODAY, { includePlanned: false });
  assert.equal(sp.saldoBase, 2800);
  assert.equal(sp.separado, 800);
  assert.equal(sp.livre, 2000);
  const m = C.goalMetrics(d.goals.find((x) => x.id === g.data.id), d, TODAY);
  assert.equal(m.current, 3300);
  assert.equal(m.deadline, '2029-03-10');

  // Gasto que invadiria o dinheiro da meta: bloqueado, a menos que a pessoa aceite resgatar.
  const big = { kind: 'despesa', amount_cents: 2500, date: TODAY, account_id: cc, category_id: cat, status: 'realizado', description: 'Grande' };
  const blocked = await c.call('POST', '/transactions', big);
  assert.equal(blocked.status, 409);
  const allowed = await c.call('POST', '/transactions', { ...big, withdraw_from_goals: true });
  assert.equal(allowed.status, 201);
  d = await state(c);
  const alloc = C.allocations(d);
  assert.equal(C.accountBalances(d).get(cc), 300);
  assert.equal(alloc.byAccount.get(cc), 300);
  assert.ok(d.contributions.some((x) => x.source === 'resgate' && x.amount_cents === -500));

  // Recorrência mensal: pagar a ocorrência não duplica, nem se repetido.
  const rec = await c.call('POST', '/recurrences', { kind: 'despesa', amount_cents: 2190, description: 'Spotify', frequency: 'mensal', day_of_month: Number(TODAY.slice(8)), start_date: TODAY, account_id: cc, category_id: cat });
  assert.equal(rec.status, 201);
  d = await state(c);
  assert.equal(C.virtualOccurrences(d, TODAY, TODAY).length, 1);
  assert.equal((await c.call('POST', `/recurrences/${rec.data.id}/occurrence`, { occurrence_date: TODAY, action: 'realizar', withdraw_from_goals: true })).status, 201);
  assert.equal((await c.call('POST', `/recurrences/${rec.data.id}/occurrence`, { occurrence_date: TODAY, action: 'realizar' })).status, 409);
  d = await state(c);
  assert.equal(C.virtualOccurrences(d, TODAY, TODAY).length, 0);
  assert.equal(d.transactions.filter((t) => t.recurrence_id === rec.data.id).length, 1);

  // Alterar as próximas: a partir do mês que vem passa a custar 2490.
  const next = C.occurrenceDates(d.recurrences[0], addDays(TODAY, 1), addDays(TODAY, 40))[0];
  const sp2 = await c.call('POST', `/recurrences/${rec.data.id}/split`, { from_date: next, changes: { amount_cents: 2490 } });
  assert.equal(sp2.status, 200);
  d = await state(c);
  const occ = C.virtualOccurrences(d, addDays(TODAY, -1), addDays(TODAY, 70));
  assert.equal(occ[0].amount_cents, 2490);
  assert.equal(new Set(occ.map((o) => o.date)).size, occ.length);

  // Parcelado em 3x: centavos distribuídos sem perda.
  const inst = await c.call('POST', '/transactions/installments', { description: 'Fone', total_cents: 10000, n: 3, first_date: TODAY, account_id: cc, category_id: cat, first_paid: false });
  assert.equal(inst.status, 201);
  d = await state(c);
  const parts = d.transactions.filter((t) => t.installment_group === inst.data.group);
  assert.deepEqual(parts.map((p) => p.amount_cents).sort(), [3333, 3333, 3334]);

  // Atualizar saldo gera ajuste com a diferença.
  const rc = await c.call('POST', `/accounts/${cx}/reconcile`, { balance_cents: 4000 });
  assert.equal(rc.data.diff, 1000);
  d = await state(c);
  assert.equal(C.accountBalances(d).get(cx), 4000);

  // Exportação.
  const ex = await c.call('GET', '/export');
  assert.equal(ex.status, 200);
  assert.ok(ex.data.transactions.length > 5);
  const csv = await c.call('GET', '/export?format=csv', undefined, { raw: true });
  assert.match(await csv.text(), /data;tipo;status;valor/);
});

test('recuperação de acesso, troca de senha e exclusão da conta', { skip }, async () => {
  const c = client('10.0.3.1');
  const s = await c.call('POST', '/auth/signup', { username: 'esqueci', password: 'senha-antiga-1' });
  const code = s.data.recoveryCodes[0];
  const other = client('10.0.3.1');
  await other.call('POST', '/auth/login', { username: 'esqueci', password: 'senha-antiga-1' });

  const anon = client('10.0.3.2');
  assert.equal((await anon.call('POST', '/auth/recover', { username: 'esqueci', code: 'AAAA-AAAA-AAAA-AAAA', password: 'senha-nova-123' })).status, 401);
  const rec = await anon.call('POST', '/auth/recover', { username: 'Esqueci', code: code.toLowerCase(), password: 'senha-nova-123' });
  assert.equal(rec.status, 200);
  assert.equal(rec.data.remainingCodes, 7);
  // Sessões antigas foram encerradas; código não pode ser reutilizado.
  assert.equal((await c.call('GET', '/data')).status, 401);
  assert.equal((await other.call('GET', '/data')).status, 401);
  assert.equal((await client('10.0.3.3').call('POST', '/auth/recover', { username: 'esqueci', code, password: 'outra-senha-123' })).status, 401);
  assert.equal((await client('10.0.3.4').call('POST', '/auth/login', { username: 'esqueci', password: 'senha-antiga-1' })).status, 401);

  // Troca de senha encerra as outras sessões e mantém a atual.
  const second = client('10.0.3.5');
  await second.call('POST', '/auth/login', { username: 'esqueci', password: 'senha-nova-123' });
  assert.equal((await anon.call('POST', '/auth/password', { current: 'errada', next: 'senha-trocada-1' })).status, 400);
  assert.equal((await anon.call('POST', '/auth/password', { current: 'senha-nova-123', next: 'senha-trocada-1' })).status, 200);
  assert.equal((await anon.call('GET', '/data')).status, 200);
  assert.equal((await second.call('GET', '/data')).status, 401);

  // Novos códigos.
  const nc = await anon.call('POST', '/auth/recovery-codes', { password: 'senha-trocada-1' });
  assert.equal(nc.data.recoveryCodes.length, 8);

  // Exclusão exige confirmação.
  await anon.call('POST', '/accounts', { name: 'C', kind: 'corrente', purpose: 'gastar', liquidity: 'imediata', initial_cents: 100 });
  assert.equal((await anon.call('POST', '/account/delete', { password: 'senha-trocada-1', confirm_username: 'outro' })).status, 400);
  assert.equal((await anon.call('POST', '/account/delete', { password: 'senha-trocada-1', confirm_username: 'ESQUECI' })).status, 200);
  const left = await sql`SELECT (SELECT count(*) FROM fin.users WHERE username_lower = 'esqueci')::int AS u`;
  assert.equal(left[0].u, 0);
  assert.equal((await anon.call('GET', '/data')).status, 401);
});

test('migração 002 preserva dados existentes e é idempotente', { skip }, async () => {
  assert.deepEqual(MIGRATED[0], { users: 1, bal: 12345, est: false, txs: 1 });
});

test('categorias: criar, editar, reordenar e arquivar preservando histórico', { skip }, async () => {
  const c = client('10.0.4.1');
  await c.call('POST', '/auth/signup', { username: 'catuser', password: 'senha-cat-123' });
  const acc = (await c.call('POST', '/accounts', { name: 'C', kind: 'corrente', purpose: 'gastar', liquidity: 'imediata', initial_cents: 10000 })).data.id;
  const nova = await c.call('POST', '/categories', { name: 'Namorada', icon: '💖', color: '#ff66aa', monthly_limit_cents: 20000, essential: false });
  assert.equal(nova.status, 201);
  await c.call('POST', '/transactions', { kind: 'despesa', amount_cents: 1500, date: TODAY, account_id: acc, category_id: nova.data.id, status: 'realizado' });
  assert.equal((await c.call('PUT', `/categories/${nova.data.id}`, { name: 'Namorada e passeios', color: '#22d3ee', icon: '🌹' })).status, 200);
  let d = await state(c);
  const ids = d.categories.map((x) => x.id).reverse();
  assert.equal((await c.call('PUT', '/categories/order', { ids })).status, 200);
  assert.equal((await c.call('PUT', `/categories/${nova.data.id}`, { archived: true })).status, 200);
  d = await state(c);
  assert.deepEqual(d.categories.map((x) => x.id), ids);
  const cat = d.categories.find((x) => x.id === nova.data.id);
  assert.equal(cat.archived, true);
  assert.equal(cat.name, 'Namorada e passeios');
  assert.equal(d.transactions[0].category_id, nova.data.id); // histórico mantido
  // Outro usuário não reordena categorias alheias.
  const o = client('10.0.4.2');
  await o.call('POST', '/auth/signup', { username: 'catoutro', password: 'senha-cat-456' });
  await o.call('PUT', '/categories/order', { ids: [nova.data.id] });
  d = await state(c);
  assert.deepEqual(d.categories.map((x) => x.id), ids);
});

test('várias rendas, despesas estimadas e confirmação de recebimento sem duplicar', { skip }, async () => {
  const c = client('10.0.5.1');
  await c.call('POST', '/auth/signup', { username: 'rendas', password: 'senha-rendas-1' });
  const acc = (await c.call('POST', '/accounts', { name: 'C', kind: 'corrente', purpose: 'gastar', liquidity: 'imediata', initial_cents: 0 })).data.id;
  const r1 = await c.call('POST', '/recurrences', { kind: 'receita', amount_cents: 40000, description: 'Mesada', frequency: 'mensal', day_of_month: Number(TODAY.slice(8)), start_date: TODAY, account_id: acc, is_main_income: true });
  const r2 = await c.call('POST', '/recurrences', { kind: 'receita', amount_cents: 5000, description: 'Freela', frequency: 'semanal', start_date: TODAY, account_id: acc });
  const r3 = await c.call('POST', '/recurrences', { kind: 'despesa', amount_cents: 8000, description: 'Celular', frequency: 'mensal', day_of_month: 20, start_date: TODAY, account_id: acc, estimated: true });
  assert.equal(r1.status + r2.status + r3.status, 603);
  let d = await state(c);
  assert.equal(d.recurrences.filter((r) => r.kind === 'receita').length, 2);
  assert.equal(d.recurrences.find((r) => r.id === r3.data.id).estimated, true);
  // Recebimento previsto de hoje: confirmar duas vezes não duplica.
  assert.equal((await c.call('POST', `/recurrences/${r1.data.id}/occurrence`, { occurrence_date: TODAY, action: 'realizar' })).status, 201);
  assert.equal((await c.call('POST', `/recurrences/${r1.data.id}/occurrence`, { occurrence_date: TODAY, action: 'realizar' })).status, 409);
  // Entrada avulsa prevista confirmada atualiza o mesmo registro.
  const prev = await c.call('POST', '/transactions', { kind: 'receita', amount_cents: 2000, date: TODAY, account_id: acc, status: 'previsto', description: 'Pix' });
  assert.equal((await c.call('PUT', `/transactions/${prev.data.id}`, { status: 'realizado' })).status, 200);
  d = await state(c);
  assert.equal(d.transactions.filter((t) => t.kind === 'receita').length, 2);
  assert.equal(C.accountBalances(d).get(acc), 42000);
});

test('plano de distribuição: não passa do disponível, não desconta saldo, isolado por usuário', { skip }, async () => {
  const c = client('10.0.6.1');
  await c.call('POST', '/auth/signup', { username: 'planner', password: 'senha-plan-123' });
  const acc = (await c.call('POST', '/accounts', { name: 'C', kind: 'corrente', purpose: 'gastar', liquidity: 'imediata', initial_cents: 30000 })).data.id;
  let d = await state(c);
  const cat = d.categories[0].id;
  const over = await c.call('POST', '/plans', { items: [{ type: 'categoria', ref_id: cat, amount_cents: 30001 }] });
  assert.equal(over.status, 409);
  assert.equal(over.data.code, 'PLAN_EXCEEDS');
  const ok = await c.call('POST', '/plans', { items: [{ type: 'categoria', ref_id: cat, amount_cents: 12000, locked: true }] });
  assert.equal(ok.status, 201);
  d = await state(c);
  assert.equal(d.plan.items[0].amount_cents, 12000);
  assert.equal(d.plan.available_cents, 30000);
  assert.equal(C.accountBalances(d).get(acc), 30000); // plano não é despesa
  // Substituir o plano desativa o anterior.
  await c.call('POST', '/plans', { items: [{ type: 'categoria', ref_id: cat, amount_cents: 5000 }] });
  d = await state(c);
  assert.equal(d.plan.items[0].amount_cents, 5000);
  // Outro usuário não pode usar categoria alheia nem vê o plano.
  const o = client('10.0.6.2');
  await o.call('POST', '/auth/signup', { username: 'planoutro', password: 'senha-plan-456' });
  await o.call('POST', '/accounts', { name: 'C', kind: 'corrente', purpose: 'gastar', liquidity: 'imediata', initial_cents: 99999 });
  assert.equal((await o.call('POST', '/plans', { items: [{ type: 'categoria', ref_id: cat, amount_cents: 1 }] })).status, 400);
  assert.equal((await state(o)).plan, null);
  assert.equal((await c.call('DELETE', '/plans/active')).status, 200);
  assert.equal((await state(c)).plan, null);
});
