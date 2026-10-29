// API do planejador. Recebe um Request web padrão e devolve um Response.
// Roda como Supabase Edge Function (Deno) em produção e em Node nos testes;
// a conexão Postgres (biblioteca `postgres`) é injetada por quem cria a API.

import { HttpError, pick, SPECS, REQUIRED, T, isUUID, validateUsername, validatePassword } from './validate.js';
import {
  hashPassword, verifyPassword, DUMMY_HASH, randomToken, sha256Hex, recoveryCode, normalizeRecoveryCode,
} from './crypto.js';
import { todayISO, addDays } from '../shared/dates.js';
import { splitProportional } from '../shared/money.js';
import { spendable } from '../shared/calc.js';
import { suggestBudget, itemKey } from '../shared/budget.js';
import { ask as askRules } from '../shared/assistant.js';
import { buildAiContext } from './ai.js';

const SESSION_DAYS = 30;
const LOGIN_WINDOW_MIN = 15;
const MAX_FAILS_PER_USER = 5;
const MAX_FAILS_PER_IP = 30;
const MAX_SIGNUPS_PER_IP_HOUR = 10;

export const DEFAULT_CATEGORIES = [
  { name: 'Namoro e passeios', color: '#a3648b', icon: '💞', essential: false },
  { name: 'Patinete', color: '#7468a8', icon: '🛴', essential: false },
  { name: 'Uber e outros transportes', color: '#5b8bb5', icon: '🚗', essential: true },
  { name: 'Alimentação', color: '#3f7d6e', icon: '🍽️', essential: true },
  { name: 'Assinaturas e ferramentas de IA', color: '#4f9aa0', icon: '🤖', essential: false },
  { name: 'Compras', color: '#c48a3c', icon: '🛍️', essential: false },
  { name: 'Estudos', color: '#2347c6', icon: '📚', essential: true },
  { name: 'Saúde', color: '#c0675a', icon: '🩺', essential: true },
  { name: 'Outros', color: '#7c7f88', icon: '•', essential: false },
];

const TABLES = {
  accounts: 'accounts', categories: 'categories', recurrences: 'recurrences',
  transactions: 'transactions', goals: 'goals', contributions: 'contributions',
};

export function createApi({ sql, secureCookies = true, cookieName, tz = 'America/Sao_Paulo', now = () => new Date(), ai = null, aiDailyLimit = 40 }) {
  const COOKIE = cookieName || (secureCookies ? '__Host-fin_sess' : 'fin_sess');
  const today = () => todayISO(tz, now());

  // ------------------------------------------------------------ utilidades HTTP

  function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        ...headers,
      },
    });
  }

  function sessionCookie(token, maxAge) {
    const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
    if (secureCookies) parts.push('Secure');
    return parts.join('; ');
  }

  function readCookie(req) {
    const raw = req.headers.get('cookie') || '';
    for (const part of raw.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === COOKIE) return v.join('=');
    }
    return null;
  }

  function clientIp(req) {
    const xf = req.headers.get('x-forwarded-for');
    if (xf) return xf.split(',')[0].trim();
    return req.headers.get('x-real-ip') || 'desconhecido';
  }

  async function body(req) {
    const text = await req.text();
    if (text.length > 1_000_000) throw new HttpError(413, 'Requisição grande demais.');
    if (!text) return {};
    try { return JSON.parse(text); } catch { throw new HttpError(400, 'JSON inválido.'); }
  }

  // ------------------------------------------------------------ sessões

  async function createSession(tx, userId, req) {
    const token = randomToken(32);
    const hash = await sha256Hex(token);
    const ua = (req.headers.get('user-agent') || '').slice(0, 200);
    await tx`INSERT INTO fin.sessions (token_hash, user_id, expires_at, user_agent)
             VALUES (${hash}, ${userId}, now() + ${`${SESSION_DAYS} days`}::interval, ${ua})`;
    return sessionCookie(token, SESSION_DAYS * 86400);
  }

  async function currentUser(req) {
    const token = readCookie(req);
    if (!token || token.length > 100) return null;
    const hash = await sha256Hex(token);
    const rows = await sql`
      UPDATE fin.sessions s SET last_seen_at = now(),
        expires_at = GREATEST(s.expires_at, now() + ${`${SESSION_DAYS} days`}::interval)
      FROM fin.users u
      WHERE s.token_hash = ${hash} AND s.user_id = u.id AND s.expires_at > now()
      RETURNING u.id, u.username, s.token_hash`;
    return rows[0] || null;
  }

  async function requireUser(req) {
    const u = await currentUser(req);
    if (!u) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
    return u;
  }

  // ------------------------------------------------------------ limitação de tentativas

  async function recentFailures(key, minutes = LOGIN_WINDOW_MIN) {
    const r = await sql`SELECT count(*)::int AS n FROM fin.auth_attempts
      WHERE key = ${key} AND NOT success AND at > now() - ${`${minutes} minutes`}::interval`;
    return r[0].n;
  }

  async function guardLogin(userKey, ip) {
    const [u, i] = await Promise.all([recentFailures(userKey), recentFailures(`ip:${ip}`)]);
    if (u >= MAX_FAILS_PER_USER || i >= MAX_FAILS_PER_IP) {
      throw new HttpError(429, `Muitas tentativas. Aguarde ${LOGIN_WINDOW_MIN} minutos e tente de novo.`);
    }
  }

  async function recordAttempt(keys, success) {
    for (const key of keys) await sql`INSERT INTO fin.auth_attempts (key, success) VALUES (${key}, ${success})`;
    // Limpeza oportunista de registros antigos.
    if (Math.random() < 0.05) await sql`DELETE FROM fin.auth_attempts WHERE at < now() - interval '2 days'`;
  }

  async function newRecoveryCodes(tx, userId) {
    const codes = Array.from({ length: 8 }, recoveryCode);
    await tx`DELETE FROM fin.recovery_codes WHERE user_id = ${userId}`;
    for (const c of codes) {
      await tx`INSERT INTO fin.recovery_codes (user_id, code_hash) VALUES (${userId}, ${await sha256Hex(normalizeRecoveryCode(c))})`;
    }
    return codes;
  }

  // ------------------------------------------------------------ autenticação

  async function signup(req) {
    const b = await body(req);
    const username = validateUsername(b.username);
    const password = validatePassword(b.password, username);
    const ip = clientIp(req);
    const r = await sql`SELECT count(*)::int AS n FROM fin.auth_attempts WHERE key = ${`signup:${ip}`} AND at > now() - interval '1 hour'`;
    if (r[0].n >= MAX_SIGNUPS_PER_IP_HOUR) throw new HttpError(429, 'Muitos cadastros a partir desta rede. Tente mais tarde.');
    const hash = await hashPassword(password);
    let cookie, codes, user;
    try {
      await sql.begin(async (tx) => {
        [user] = await tx`INSERT INTO fin.users (username, username_lower, pass_hash)
          VALUES (${username}, ${username.toLowerCase()}, ${hash}) RETURNING id, username`;
        await tx`INSERT INTO fin.profiles (user_id, created_on) VALUES (${user.id}, ${today()})`;
        let i = 0;
        for (const c of DEFAULT_CATEGORIES) {
          await tx`INSERT INTO fin.categories (user_id, name, color, icon, essential, sort)
            VALUES (${user.id}, ${c.name}, ${c.color}, ${c.icon}, ${c.essential}, ${i++})`;
        }
        codes = await newRecoveryCodes(tx, user.id);
        cookie = await createSession(tx, user.id, req);
      });
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, 'Esse nome de usuário já está em uso.');
      throw e;
    }
    await recordAttempt([`signup:${ip}`], true);
    return json({ user, recoveryCodes: codes }, 201, { 'set-cookie': cookie });
  }

  async function login(req) {
    const b = await body(req);
    const username = typeof b.username === 'string' ? b.username.trim() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!username || !password) throw new HttpError(400, 'Informe usuário e senha.');
    const ip = clientIp(req);
    const ukey = `u:${username.toLowerCase()}`;
    await guardLogin(ukey, ip);
    const rows = await sql`SELECT id, username, pass_hash FROM fin.users WHERE username_lower = ${username.toLowerCase()}`;
    const u = rows[0];
    const ok = await verifyPassword(password, u ? u.pass_hash : DUMMY_HASH);
    if (!u || !ok) {
      await recordAttempt([ukey, `ip:${ip}`], false);
      throw new HttpError(401, 'Usuário ou senha incorretos.');
    }
    await recordAttempt([ukey], true);
    const cookie = await createSession(sql, u.id, req);
    return json({ user: { id: u.id, username: u.username } }, 200, { 'set-cookie': cookie });
  }

  async function logout(req) {
    const token = readCookie(req);
    if (token) await sql`DELETE FROM fin.sessions WHERE token_hash = ${await sha256Hex(token)}`;
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  }

  async function logoutAll(req, user) {
    await sql`DELETE FROM fin.sessions WHERE user_id = ${user.id}`;
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  }

  async function changePassword(req, user) {
    const b = await body(req);
    const [u] = await sql`SELECT pass_hash FROM fin.users WHERE id = ${user.id}`;
    const ip = clientIp(req);
    await guardLogin(`pw:${user.id}`, ip);
    if (!(await verifyPassword(String(b.current || ''), u.pass_hash))) {
      await recordAttempt([`pw:${user.id}`], false);
      throw new HttpError(400, 'Senha atual incorreta.');
    }
    const next = validatePassword(b.next, user.username);
    const hash = await hashPassword(next);
    await sql.begin(async (tx) => {
      await tx`UPDATE fin.users SET pass_hash = ${hash}, password_changed_at = now() WHERE id = ${user.id}`;
      // Encerra as outras sessões; mantém a atual.
      await tx`DELETE FROM fin.sessions WHERE user_id = ${user.id} AND token_hash <> ${user.token_hash}`;
    });
    return json({ ok: true });
  }

  async function recover(req) {
    const b = await body(req);
    const username = typeof b.username === 'string' ? b.username.trim() : '';
    const code = normalizeRecoveryCode(b.code);
    if (!username || code.length !== 16) throw new HttpError(400, 'Informe o usuário e um código de recuperação válido.');
    const ip = clientIp(req);
    const key = `r:${username.toLowerCase()}`;
    await guardLogin(key, ip);
    const [u] = await sql`SELECT id, username FROM fin.users WHERE username_lower = ${username.toLowerCase()}`;
    const codeHash = await sha256Hex(code);
    const match = u ? await sql`SELECT id FROM fin.recovery_codes WHERE user_id = ${u.id} AND code_hash = ${codeHash} AND used_at IS NULL` : [];
    if (!u || !match.length) {
      await recordAttempt([key, `ip:${ip}`], false);
      throw new HttpError(401, 'Usuário ou código de recuperação incorretos (ou código já usado).');
    }
    const password = validatePassword(b.password, u.username);
    const hash = await hashPassword(password);
    let cookie, remaining;
    await sql.begin(async (tx) => {
      await tx`UPDATE fin.recovery_codes SET used_at = now() WHERE id = ${match[0].id}`;
      await tx`UPDATE fin.users SET pass_hash = ${hash}, password_changed_at = now() WHERE id = ${u.id}`;
      await tx`DELETE FROM fin.sessions WHERE user_id = ${u.id}`;
      cookie = await createSession(tx, u.id, req);
      [{ n: remaining }] = await tx`SELECT count(*)::int AS n FROM fin.recovery_codes WHERE user_id = ${u.id} AND used_at IS NULL`;
    });
    await recordAttempt([key], true);
    return json({ user: { id: u.id, username: u.username }, remainingCodes: remaining }, 200, { 'set-cookie': cookie });
  }

  async function regenerateCodes(req, user) {
    const b = await body(req);
    const [u] = await sql`SELECT pass_hash FROM fin.users WHERE id = ${user.id}`;
    if (!(await verifyPassword(String(b.password || ''), u.pass_hash))) throw new HttpError(400, 'Senha incorreta.');
    let codes;
    await sql.begin(async (tx) => { codes = await newRecoveryCodes(tx, user.id); });
    return json({ recoveryCodes: codes });
  }

  async function me(req) {
    const u = await currentUser(req);
    if (!u) return json({ user: null });
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM fin.recovery_codes WHERE user_id = ${u.id} AND used_at IS NULL`;
    return json({ user: { id: u.id, username: u.username }, recoveryCodesLeft: n });
  }

  async function deleteAccount(req, user) {
    const b = await body(req);
    const [u] = await sql`SELECT pass_hash, username FROM fin.users WHERE id = ${user.id}`;
    if (String(b.confirm_username || '').toLowerCase() !== u.username.toLowerCase()) throw new HttpError(400, 'Digite seu nome de usuário para confirmar.');
    if (!(await verifyPassword(String(b.password || ''), u.pass_hash))) throw new HttpError(400, 'Senha incorreta.');
    await sql`DELETE FROM fin.users WHERE id = ${user.id}`; // ON DELETE CASCADE remove todos os dados
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  }

  // ------------------------------------------------------------ dados

  async function loadAll(userId) {
    const [profile] = await sql`SELECT display_name, birth_date, onboarding_done, budget_mode, include_planned_contributions,
      has_variable_income, variable_income_estimate_cents, risk_tolerance, theme, sim_yield_annual, sim_inflation_annual, budget_style,
      created_on AS created_at, updated_at FROM fin.profiles WHERE user_id = ${userId}`;
    const [accounts, categories, recurrences, transactions, goals, contributions] = await Promise.all([
      sql`SELECT id, name, kind, institution, purpose, liquidity, maturity_date, est_yield_note, initial_cents, balance_known,
          archived, created_at, updated_at FROM fin.accounts WHERE user_id = ${userId} ORDER BY created_at`,
      sql`SELECT id, name, color, icon, monthly_limit_cents, essential, archived, sort, estimate_weekly_cents, estimate_note FROM fin.categories WHERE user_id = ${userId} ORDER BY sort, name`,
      sql`SELECT id, kind, amount_cents, account_id, category_id, description, frequency, day_of_month, start_date, end_date,
          active, is_main_income, estimated, note, created_at FROM fin.recurrences WHERE user_id = ${userId} ORDER BY created_at`,
      sql`SELECT id, kind, amount_cents, date, account_id, to_account_id, category_id, description, status, recurrence_id,
          occurrence_date, installment_group, installment_no, installment_total, refund_of, note, created_at, updated_at
          FROM fin.transactions WHERE user_id = ${userId} ORDER BY date DESC, created_at DESC`,
      sql`SELECT id, kind, name, target_cents, priority, target_type, target_age, target_date, real_terms, plan_amount_cents,
          plan_frequency, plan_day, place_account_id, place_note, note, baseline_cents, created_on AS created_at, created_at AS created_ts, archived
          FROM fin.goals WHERE user_id = ${userId} ORDER BY priority, created_at`,
      sql`SELECT id, goal_id, account_id, amount_cents, date, source, note, created_at FROM fin.contributions
          WHERE user_id = ${userId} ORDER BY date, created_at`,
    ]);
    const [plan] = await sql`SELECT id, period_start, period_end, available_cents, items, created_at FROM fin.budget_plans
      WHERE user_id = ${userId} AND active ORDER BY created_at DESC LIMIT 1`;
    return { profile, accounts, categories, recurrences, transactions, goals, contributions, plan: plan || null };
  }

  async function getData(req, user) {
    const data = await loadAll(user.id);
    return json({ ...data, today: today(), user: { id: user.id, username: user.username } });
  }

  async function updateProfile(req, user) {
    const v = pick(await body(req), SPECS.profile, { partial: true });
    if (v.birth_date && v.birth_date > today()) throw new HttpError(400, 'A data de nascimento não pode estar no futuro.');
    if (!Object.keys(v).length) return json({ ok: true });
    await sql`UPDATE fin.profiles SET ${sql(v)}, updated_at = now() WHERE user_id = ${user.id}`;
    return json({ ok: true });
  }

  // Saldos e valores destinados a metas calculados no banco, para validar invariantes.
  async function accountState(tx, userId, ids) {
    if (!ids.length) return [];
    return tx`
      SELECT a.id, a.name,
        a.initial_cents + COALESCE((
          SELECT sum(CASE WHEN t.kind IN ('despesa') THEN -t.amount_cents
                          WHEN t.kind = 'transferencia' AND t.account_id = a.id THEN -t.amount_cents
                          ELSE t.amount_cents END)
          FROM fin.transactions t
          WHERE t.user_id = ${userId} AND t.status = 'realizado' AND (t.account_id = a.id OR (t.kind = 'transferencia' AND t.to_account_id = a.id))
        ), 0)::bigint AS balance,
        COALESCE((SELECT sum(c.amount_cents) FROM fin.contributions c WHERE c.user_id = ${userId} AND c.account_id = a.id), 0)::bigint AS allocated
      FROM fin.accounts a WHERE a.user_id = ${userId} AND a.id IN ${tx(ids)}`;
  }

  // Garante que o dinheiro destinado às metas em cada conta nunca passe do saldo da conta.
  // Se `withdraw` for verdadeiro, registra resgates automáticos (metas de menor prioridade primeiro).
  async function enforceAllocations(tx, userId, ids, withdraw) {
    const uniq = [...new Set(ids.filter(Boolean))];
    for (const a of await accountState(tx, userId, uniq)) {
      const limit = Math.max(0, a.balance);
      if (a.allocated <= limit) continue;
      if (!withdraw) {
        throw new HttpError(409, `Essa operação deixaria "${a.name}" com menos dinheiro (${brl(a.balance)}) do que o separado para metas (${brl(a.allocated)}).`, {
          code: 'ALLOCATION_EXCEEDS', account_id: a.id, balance: a.balance, allocated: a.allocated,
        });
      }
      let excess = a.allocated - limit;
      const per = await tx`SELECT c.goal_id, g.name, sum(c.amount_cents)::bigint AS v FROM fin.contributions c
        JOIN fin.goals g ON g.id = c.goal_id
        WHERE c.user_id = ${userId} AND c.account_id = ${a.id}
        GROUP BY c.goal_id, g.name, g.priority, g.kind HAVING sum(c.amount_cents) > 0
        ORDER BY g.priority DESC, (g.kind = 'reserva') DESC, sum(c.amount_cents) DESC`;
      for (const p of per) {
        if (excess <= 0) break;
        const take = Math.min(excess, p.v);
        await tx`INSERT INTO fin.contributions (user_id, goal_id, account_id, amount_cents, date, source, note)
          VALUES (${userId}, ${p.goal_id}, ${a.id}, ${-take}, ${today()}, 'resgate', 'Resgate automático para cobrir gasto')`;
        excess -= take;
      }
    }
  }

  async function lockUser(tx, userId) {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
  }

  function checkTransaction(v, existing) {
    const t = { ...(existing || {}), ...v };
    if (t.kind === 'transferencia') {
      if (!t.account_id || !t.to_account_id) throw new HttpError(400, 'Escolha a conta de origem e a de destino.');
      if (t.account_id === t.to_account_id) throw new HttpError(400, 'As contas de origem e destino devem ser diferentes.');
      t.category_id = null;
    } else {
      t.to_account_id = null;
    }
    if (t.status === 'realizado') {
      if (!t.account_id) throw new HttpError(400, 'Informe a conta.');
      if (t.date > today()) throw new HttpError(400, 'Um valor já recebido/pago não pode ter data futura. Marque como previsto.');
    }
    return t;
  }

  async function crudCreate(res, req, user) {
    const b = await body(req);
    if (res === 'transactions' && Array.isArray(b.items)) return batchTransactions(b, user);
    if (res === 'contributions' && Array.isArray(b.items)) return batchContributions(b, user);
    const v = pick(b, SPECS[res], { required: REQUIRED[res] });
    let row;
    await sql.begin(async (tx) => {
      await lockUser(tx, user.id);
      if (res === 'transactions') {
        const t = checkTransaction(v);
        v.to_account_id = t.to_account_id;
        if (t.kind === 'transferencia') v.category_id = null;
      }
      if (res === 'goals') {
        if (v.target_type === 'idade' && v.target_age == null) throw new HttpError(400, 'Informe a idade da meta.');
        if (v.target_type === 'data' && !v.target_date) throw new HttpError(400, 'Informe a data da meta.');
        if (v.target_type === 'idade') v.target_date = null; else v.target_age = null;
        v.created_on = today();
        const init = b.initial && b.initial.amount_cents ? pick(b.initial, { amount_cents: [T.int(1, 1e11)], account_id: [T.uuid()] }, { required: ['amount_cents', 'account_id'] }) : null;
        v.baseline_cents = init ? init.amount_cents : 0;
        [row] = await tx`INSERT INTO fin.goals ${tx({ ...v, user_id: user.id })} RETURNING id`;
        if (init) {
          await tx`INSERT INTO fin.contributions (user_id, goal_id, account_id, amount_cents, date, source, note)
            VALUES (${user.id}, ${row.id}, ${init.account_id}, ${init.amount_cents}, ${today()}, 'inicial', 'Valor que já estava guardado')`;
          await enforceAllocations(tx, user.id, [init.account_id], false);
        }
        return;
      }
      if (res === 'recurrences' && v.kind === 'despesa') v.is_main_income = false;
      if (res === 'contributions') v.source = v.source || (v.amount_cents < 0 ? 'resgate' : 'aporte');
      [row] = await tx`INSERT INTO ${tx('fin.' + TABLES[res])} ${tx({ ...v, user_id: user.id })} RETURNING id`;
      if (res === 'contributions') {
        await checkPairNonNegative(tx, user.id, v.goal_id, v.account_id);
        await enforceAllocations(tx, user.id, [v.account_id], false);
      }
      if (res === 'transactions') await enforceAllocations(tx, user.id, [v.account_id, v.to_account_id], !!b.withdraw_from_goals);
    });
    return json({ id: row.id }, 201);
  }

  async function checkPairNonNegative(tx, userId, goalId, accountId) {
    const [r] = await tx`SELECT COALESCE(sum(amount_cents), 0)::bigint AS v FROM fin.contributions
      WHERE user_id = ${userId} AND goal_id = ${goalId} AND account_id = ${accountId}`;
    if (r.v < 0) throw new HttpError(400, 'Não dá para resgatar mais do que essa meta tem nessa conta.');
  }

  async function batchContributions(b, user) {
    if (b.items.length > 50) throw new HttpError(400, 'Itens demais.');
    const items = b.items.map((it) => pick(it, SPECS.contributions, { required: REQUIRED.contributions }));
    const ids = [];
    await sql.begin(async (tx) => {
      await lockUser(tx, user.id);
      for (const v of items) {
        v.source = v.source || 'aporte';
        const [r] = await tx`INSERT INTO fin.contributions ${tx({ ...v, user_id: user.id })} RETURNING id`;
        ids.push(r.id);
        await checkPairNonNegative(tx, user.id, v.goal_id, v.account_id);
      }
      await enforceAllocations(tx, user.id, items.map((i) => i.account_id), false);
    });
    return json({ ids }, 201);
  }

  // Lote de movimentações (ex.: "Guardei" com transferência + aporte, ou várias entradas picadas).
  async function batchTransactions(b, user) {
    if (b.items.length > 60) throw new HttpError(400, 'Itens demais.');
    const items = b.items.map((it) => {
      const v = pick(it, SPECS.transactions, { required: REQUIRED.transactions });
      const t = checkTransaction(v);
      return clean({ ...v, to_account_id: t.to_account_id, category_id: t.kind === 'transferencia' ? null : v.category_id });
    });
    const contribs = Array.isArray(b.contributions) ? b.contributions.map((c) => pick(c, SPECS.contributions, { required: REQUIRED.contributions })) : [];
    const ids = [];
    await sql.begin(async (tx) => {
      await lockUser(tx, user.id);
      for (const v of items) {
        const [r] = await tx`INSERT INTO fin.transactions ${tx({ ...v, user_id: user.id })} RETURNING id`;
        ids.push(r.id);
      }
      for (const c of contribs) {
        c.source = c.source || 'aporte';
        await tx`INSERT INTO fin.contributions ${tx({ ...c, user_id: user.id })}`;
        await checkPairNonNegative(tx, user.id, c.goal_id, c.account_id);
      }
      await enforceAllocations(tx, user.id, [...items.flatMap((i) => [i.account_id, i.to_account_id]), ...contribs.map((c) => c.account_id)], !!b.withdraw_from_goals);
    });
    return json({ ids }, 201);
  }

  async function crudUpdate(res, id, req, user) {
    const b = await body(req);
    const v = pick(b, SPECS[res], { partial: true });
    if (!Object.keys(v).length) return json({ ok: true });
    await sql.begin(async (tx) => {
      await lockUser(tx, user.id);
      const table = tx('fin.' + TABLES[res]);
      const [old] = await tx`SELECT * FROM ${table} WHERE id = ${id} AND user_id = ${user.id} FOR UPDATE`;
      if (!old) throw new HttpError(404, 'Registro não encontrado.');
      if (res === 'transactions') {
        if (old.kind === 'ajuste') throw new HttpError(400, 'Ajustes de saldo não podem ser editados; registre um novo ajuste.');
        const t = checkTransaction(v, old);
        if ('to_account_id' in v || 'kind' in v) v.to_account_id = t.to_account_id;
        v.updated_at = new Date();
      }
      if (res === 'goals') {
        const g = { ...old, ...v };
        if (g.target_type === 'idade' && g.target_age == null) throw new HttpError(400, 'Informe a idade da meta.');
        if (g.target_type === 'data' && !g.target_date) throw new HttpError(400, 'Informe a data da meta.');
        if (g.target_type === 'idade') v.target_date = null; else v.target_age = null;
      }
      if (res === 'accounts') v.updated_at = new Date();
      if (res === 'contributions') throw new HttpError(400, 'Aportes não são editados: exclua e registre de novo.');
      await tx`UPDATE ${table} SET ${tx(v)} WHERE id = ${id} AND user_id = ${user.id}`;
      if (res === 'transactions') {
        await enforceAllocations(tx, user.id, [old.account_id, old.to_account_id, v.account_id, v.to_account_id], !!b.withdraw_from_goals);
      }
      if (res === 'accounts') await enforceAllocations(tx, user.id, [id], false);
    });
    return json({ ok: true });
  }

  async function crudDelete(res, id, req, user) {
    const url = new URL(req.url);
    await sql.begin(async (tx) => {
      await lockUser(tx, user.id);
      const table = tx('fin.' + TABLES[res]);
      const [old] = await tx`SELECT * FROM ${table} WHERE id = ${id} AND user_id = ${user.id}`;
      if (!old) throw new HttpError(404, 'Registro não encontrado.');
      if (res === 'transactions' && url.searchParams.get('scope') === 'group' && old.installment_group) {
        await tx`DELETE FROM fin.transactions WHERE user_id = ${user.id} AND installment_group = ${old.installment_group} AND status <> 'realizado'`;
      } else {
        await tx`DELETE FROM ${table} WHERE id = ${id} AND user_id = ${user.id}`;
      }
      if (res === 'transactions') await enforceAllocations(tx, user.id, [old.account_id, old.to_account_id], url.searchParams.get('withdraw') === '1');
      if (res === 'contributions') await checkPairNonNegative(tx, user.id, old.goal_id, old.account_id);
    });
    return json({ ok: true });
  }

  // Compras parceladas: grava as N parcelas uma única vez, com centavos distribuídos sem perda.
  async function installments(req, user) {
    const b = await body(req);
    const v = pick(b, {
      description: [T.str(1, 80)], total_cents: [T.int(2, 1e11)], n: [T.int(2, 72)], first_date: [T.date()],
      account_id: [T.uuid()], category_id: [T.uuid(), true], first_paid: [T.bool()], note: [T.str(0, 500), true],
    }, { required: ['description', 'total_cents', 'n', 'first_date', 'account_id'] });
    const parts = splitProportional(v.total_cents, Array(v.n).fill(1));
    const group = crypto.randomUUID();
    await sql.begin(async (tx) => {
      await lockUser(tx, user.id);
      for (let i = 0; i < v.n; i++) {
        const date = monthPlus(v.first_date, i);
        const paid = i === 0 && v.first_paid && date <= today();
        await tx`INSERT INTO fin.transactions (user_id, kind, amount_cents, date, account_id, category_id, description, status,
            installment_group, installment_no, installment_total, note)
          VALUES (${user.id}, 'despesa', ${parts[i]}, ${date}, ${v.account_id}, ${v.category_id ?? null},
            ${`${v.description} (${i + 1}/${v.n})`}, ${paid ? 'realizado' : 'previsto'}, ${group}, ${i + 1}, ${v.n}, ${v.note ?? null})`;
      }
      await enforceAllocations(tx, user.id, [v.account_id], !!b.withdraw_from_goals);
    });
    return json({ group }, 201);
  }

  // Ação sobre uma única ocorrência de recorrência: pagar/receber, editar ou pular.
  async function occurrence(req, user, recId) {
    const b = await body(req);
    const v = pick(b, {
      occurrence_date: [T.date()], action: [T.enum('realizar', 'editar', 'pular')], amount_cents: [T.int(1, 1e11)],
      date: [T.date()], account_id: [T.uuid(), true], description: [T.str(0, 80), true], note: [T.str(0, 500), true],
    }, { required: ['occurrence_date', 'action'] });
    let id;
    await sql.begin(async (tx) => {
      await lockUser(tx, user.id);
      const [rec] = await tx`SELECT * FROM fin.recurrences WHERE id = ${recId} AND user_id = ${user.id}`;
      if (!rec) throw new HttpError(404, 'Recorrência não encontrada.');
      const status = v.action === 'realizar' ? 'realizado' : v.action === 'pular' ? 'cancelado' : 'previsto';
      const date = v.date || (v.action === 'realizar' ? (v.occurrence_date > today() ? today() : v.occurrence_date) : v.occurrence_date);
      const t = checkTransaction({ kind: rec.kind, status, date, account_id: v.account_id ?? rec.account_id });
      const row = {
        user_id: user.id, kind: rec.kind, amount_cents: v.amount_cents ?? rec.amount_cents, date,
        account_id: t.account_id, category_id: rec.category_id, description: v.description || rec.description, status,
        recurrence_id: rec.id, occurrence_date: v.occurrence_date, note: v.note ?? null,
      };
      try {
        [{ id }] = await tx`INSERT INTO fin.transactions ${tx(row)} RETURNING id`;
      } catch (e) {
        if (e.code === '23505') throw new HttpError(409, 'Essa ocorrência já foi registrada. Edite-a no histórico.');
        throw e;
      }
      await enforceAllocations(tx, user.id, [row.account_id], !!b.withdraw_from_goals);
    });
    return json({ id }, 201);
  }

  // "Alterar as próximas": encerra a recorrência antes de `from_date` e cria outra com os novos dados.
  async function splitRecurrence(req, user, recId) {
    const b = await body(req);
    const from = T.date()(b.from_date, 'from_date');
    const changes = pick(b.changes || {}, SPECS.recurrences, { partial: true });
    let newId;
    await sql.begin(async (tx) => {
      await lockUser(tx, user.id);
      const [rec] = await tx`SELECT * FROM fin.recurrences WHERE id = ${recId} AND user_id = ${user.id} FOR UPDATE`;
      if (!rec) throw new HttpError(404, 'Recorrência não encontrada.');
      const startISO = isoDate(rec.start_date);
      if (from <= startISO) {
        if (Object.keys(changes).length) await tx`UPDATE fin.recurrences SET ${tx(changes)} WHERE id = ${recId}`;
        newId = recId;
        return;
      }
      await tx`UPDATE fin.recurrences SET end_date = ${addDays(from, -1)} WHERE id = ${recId}`;
      const { id: _i, user_id: _u, created_at: _c, ...base } = rec;
      const next = clean({ ...base, ...changes, start_date: from, user_id: user.id });
      if (next.end_date && isoDate(next.end_date) < from) next.end_date = null;
      [{ id: newId }] = await tx`INSERT INTO fin.recurrences ${tx(next)} RETURNING id`;
      // Ocorrências já lançadas a partir da data passam para a nova recorrência (evita duplicar).
      await tx`UPDATE fin.transactions SET recurrence_id = ${newId}
        WHERE user_id = ${user.id} AND recurrence_id = ${recId} AND occurrence_date >= ${from}`;
    });
    return json({ id: newId });
  }

  // "Atualizar saldo": registra um ajuste com a diferença, preservando o histórico.
  async function reconcile(req, user, accId) {
    const b = await body(req);
    const target = T.int(-1e11, 1e11)(b.balance_cents, 'balance_cents');
    let diff = 0;
    await sql.begin(async (tx) => {
      await lockUser(tx, user.id);
      const [a] = await accountState(tx, user.id, [accId]);
      if (!a) throw new HttpError(404, 'Conta não encontrada.');
      diff = target - a.balance;
      if (diff !== 0) {
        await tx`INSERT INTO fin.transactions (user_id, kind, amount_cents, date, account_id, description, status)
          VALUES (${user.id}, 'ajuste', ${diff}, ${today()}, ${accId}, 'Ajuste de saldo', 'realizado')`;
      }
      await tx`UPDATE fin.accounts SET balance_known = true, updated_at = now() WHERE id = ${accId} AND user_id = ${user.id}`;
      await enforceAllocations(tx, user.id, [accId], !!b.withdraw_from_goals);
    });
    return json({ ok: true, diff });
  }

  async function exportData(req, user) {
    const data = await loadAll(user.id);
    const [u] = await sql`SELECT username, created_at FROM fin.users WHERE id = ${user.id}`;
    const url = new URL(req.url);
    const stamp = today();
    if (url.searchParams.get('format') === 'csv') {
      const acc = new Map(data.accounts.map((a) => [a.id, a.name]));
      const cat = new Map(data.categories.map((c) => [c.id, c.name]));
      const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
      const lines = ['data;tipo;status;valor;conta;conta_destino;categoria;descricao;observacao'];
      for (const t of data.transactions) {
        lines.push([t.date, t.kind, t.status, (t.amount_cents / 100).toFixed(2).replace('.', ','), acc.get(t.account_id), acc.get(t.to_account_id), cat.get(t.category_id), t.description, t.note].map(esc).join(';'));
      }
      return new Response('﻿' + lines.join('\n'), {
        headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="movimentacoes-${stamp}.csv"`, 'cache-control': 'no-store' },
      });
    }
    return new Response(JSON.stringify({ exported_at: new Date().toISOString(), user: u, ...data }, null, 2), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="meus-dados-${stamp}.json"`, 'cache-control': 'no-store' },
    });
  }


  // Salva uma distribuição do dinheiro ("Organizar meu dinheiro"). É só planejamento: não cria
  // despesa nem desconta saldo. O servidor recalcula o dinheiro disponível com o mesmo código do app
  // e recusa distribuições que passem dele.
  async function savePlan(req, user) {
    const b = await body(req);
    if (!Array.isArray(b.items) || b.items.length > 200) throw new HttpError(400, 'Itens inválidos.');
    const items = b.items.map((it) => pick(it, {
      type: [T.enum('categoria', 'meta')], ref_id: [T.uuid()], amount_cents: [T.int(0, 1e11)], locked: [T.bool()],
    }, { required: ['type', 'ref_id', 'amount_cents'] }));
    const seen = new Set();
    for (const it of items) {
      const k = `${it.type}|${it.ref_id}`;
      if (seen.has(k)) throw new HttpError(400, 'Item repetido no plano.');
      seen.add(k);
      it.locked = !!it.locked;
    }
    let row;
    await sql.begin(async (tx) => {
      await lockUser(tx, user.id);
      const catIds = items.filter((i) => i.type === 'categoria').map((i) => i.ref_id);
      const goalIds = items.filter((i) => i.type === 'meta').map((i) => i.ref_id);
      if (catIds.length) {
        const ok = await tx`SELECT count(*)::int AS n FROM fin.categories WHERE user_id = ${user.id} AND id IN ${tx(catIds)}`;
        if (ok[0].n !== catIds.length) throw new HttpError(400, 'Categoria inválida no plano.');
      }
      if (goalIds.length) {
        const ok = await tx`SELECT count(*)::int AS n FROM fin.goals WHERE user_id = ${user.id} AND id IN ${tx(goalIds)}`;
        if (ok[0].n !== goalIds.length) throw new HttpError(400, 'Meta inválida no plano.');
      }
      const state = await loadAll(user.id);
      const sp = spendable(state, today(), { includePlanned: false });
      const available = Math.max(0, sp.livre);
      const total = items.reduce((s, i) => s + i.amount_cents, 0);
      if (total > available) {
        throw new HttpError(409, `A distribuição (${brl(total)}) passa do dinheiro disponível (${brl(available)}).`, { code: 'PLAN_EXCEEDS', available, total });
      }
      await tx`UPDATE fin.budget_plans SET active = false WHERE user_id = ${user.id} AND active`;
      [row] = await tx`INSERT INTO fin.budget_plans (user_id, period_start, period_end, available_cents, items)
        VALUES (${user.id}, ${today()}, ${sp.period.end < today() ? today() : sp.period.end}, ${available}, ${tx.json(items)})
        RETURNING id, available_cents`;
    });
    return json(row, 201);
  }

  async function discardPlan(req, user) {
    await sql`UPDATE fin.budget_plans SET active = false WHERE user_id = ${user.id} AND active`;
    return json({ ok: true });
  }

  async function reorderCategories(req, user) {
    const b = await body(req);
    if (!Array.isArray(b.ids) || b.ids.length > 300 || !b.ids.every(isUUID)) throw new HttpError(400, 'Lista inválida.');
    await sql.begin(async (tx) => {
      for (const [i, id] of b.ids.entries()) {
        await tx`UPDATE fin.categories SET sort = ${i} WHERE id = ${id} AND user_id = ${user.id}`;
      }
    });
    return json({ ok: true });
  }


  // ------------------------------------------------------------ assistente com IA

  async function aiStatus() {
    return json({ configured: !!ai });
  }

  async function aiAsk(req, user) {
    const b = await body(req);
    const question = typeof b.question === 'string' ? b.question.trim().slice(0, 500) : '';
    const shortcut = typeof b.shortcut === 'string' ? b.shortcut.slice(0, 30) : null;
    if (!question && !shortcut) throw new HttpError(400, 'Escreva sua pergunta.');
    const input = {
      amount: Number.isSafeInteger(b.amount_cents) && b.amount_cents > 0 ? b.amount_cents : undefined,
      categoryId: isUUID(b.category_id) ? b.category_id : undefined,
    };
    const style = ['equilibrado', 'lazer', 'guardar'].includes(b.style) ? b.style : undefined;
    const state = await loadAll(user.id);
    const t = today();
    const rules = shortcut ? askRules(state, t, shortcut, input) : null;
    const rulesText = rules && !rules.needs ? `${rules.answer} ${rules.reason || ''} ${rules.period || ''}`.trim() : null;
    if (!ai) return json({ configured: false, rules: rulesText });
    const key = `ai:${user.id}`;
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM fin.auth_attempts WHERE key = ${key} AND at > now() - interval '1 day'`;
    if (n >= aiDailyLimit) throw new HttpError(429, 'Limite diário de perguntas à IA atingido. O planejador numérico continua funcionando.');
    await sql`INSERT INTO fin.auth_attempts (key, success) VALUES (${key}, true)`;
    const context = buildAiContext(state, t, { style });
    let out;
    try {
      out = await ai({ context, question: question || rules?.answer || shortcut, rules: rulesText });
    } catch (e) {
      console.error('Falha na IA', e?.message);
      throw new HttpError(502, 'A IA não respondeu agora. Os cálculos do app continuam valendo.', { rules: rulesText });
    }
    // Ajustes propostos pela IA viram valores fixados e passam pelo mesmo cálculo do app.
    let proposal = null, note = null;
    if (out.ajustes.length) {
      const base = suggestBudget(state, t, { style });
      const byName = new Map(base.items.map((i) => [i.name.toLowerCase(), i]));
      const locked = {};
      for (const a of out.ajustes) {
        const it = byName.get(String(a.item || '').toLowerCase().trim());
        const cents = Math.round(Number(a.valor_reais) * 100);
        if (it && Number.isFinite(cents) && cents >= 0) locked[itemKey(it.type, it.id)] = cents;
      }
      if (Object.keys(locked).length) {
        const sug = suggestBudget(state, t, { style, locked });
        if (sug.overLocked > 0) note = `A proposta da IA passava ${(sug.overLocked / 100).toFixed(2).replace('.', ',')} reais do dinheiro disponível e foi descartada.`;
        else proposal = { locked, items: sug.items.map((i) => ({ key: i.key, name: i.name, amount: i.amount, locked: !!i.locked })), livre: sug.livre, distributed: sug.distributed };
      }
    }
    return json({ configured: true, model: out.model, rules: rulesText, texto: out.texto, pergunta: out.pergunta, proposal, note });
  }

  // ------------------------------------------------------------ roteamento

  async function route(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^.*?\/(?:fin-api|api)(?=\/|$)/, '') || '/';
    const m = req.method;
    // Proteção contra CSRF: escrita só com cabeçalho próprio (navegadores não o enviam entre sites sem CORS).
    if (m !== 'GET' && m !== 'HEAD' && req.headers.get('x-fin-csrf') !== '1') throw new HttpError(403, 'Requisição recusada.');

    if (path === '/health') return json({ ok: true, today: today() });
    if (path === '/auth/signup' && m === 'POST') return signup(req);
    if (path === '/auth/login' && m === 'POST') return login(req);
    if (path === '/auth/logout' && m === 'POST') return logout(req);
    if (path === '/auth/recover' && m === 'POST') return recover(req);
    if (path === '/auth/me' && m === 'GET') return me(req);

    const user = await requireUser(req);
    if (path === '/auth/logout-all' && m === 'POST') return logoutAll(req, user);
    if (path === '/auth/password' && m === 'POST') return changePassword(req, user);
    if (path === '/auth/recovery-codes' && m === 'POST') return regenerateCodes(req, user);
    if (path === '/account/delete' && m === 'POST') return deleteAccount(req, user);
    if (path === '/data' && m === 'GET') return getData(req, user);
    if (path === '/export' && m === 'GET') return exportData(req, user);
    if (path === '/profile' && m === 'PUT') return updateProfile(req, user);
    if (path === '/transactions/installments' && m === 'POST') return installments(req, user);
    if (path === '/plans' && m === 'POST') return savePlan(req, user);
    if (path === '/ai/status' && m === 'GET') return aiStatus();
    if (path === '/ai/ask' && m === 'POST') return aiAsk(req, user);
    if (path === '/plans/active' && m === 'DELETE') return discardPlan(req, user);
    if (path === '/categories/order' && m === 'PUT') return reorderCategories(req, user);

    let mm = path.match(/^\/recurrences\/([^/]+)\/(occurrence|split)$/);
    if (mm && m === 'POST') {
      if (!isUUID(mm[1])) throw new HttpError(404, 'Não encontrado.');
      return mm[2] === 'occurrence' ? occurrence(req, user, mm[1]) : splitRecurrence(req, user, mm[1]);
    }
    mm = path.match(/^\/accounts\/([^/]+)\/reconcile$/);
    if (mm && m === 'POST') {
      if (!isUUID(mm[1])) throw new HttpError(404, 'Não encontrado.');
      return reconcile(req, user, mm[1]);
    }
    mm = path.match(/^\/(accounts|categories|recurrences|transactions|goals|contributions)(?:\/([^/]+))?$/);
    if (mm) {
      const [, res, id] = mm;
      if (!id && m === 'POST') return crudCreate(res, req, user);
      if (id) {
        if (!isUUID(id)) throw new HttpError(404, 'Registro não encontrado.');
        if (m === 'PUT') return crudUpdate(res, id, req, user);
        if (m === 'DELETE') return crudDelete(res, id, req, user);
      }
    }
    throw new HttpError(404, 'Rota não encontrada.');
  }

  return async function handle(req) {
    try {
      return await route(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
      if (e && e.code === '23503') return json({ error: 'Referência inválida: conta, categoria ou meta não encontrada.' }, 400);
      if (e && e.code === '23514') return json({ error: 'Dados inválidos para esta operação.' }, 400);
      if (e && e.code === '23505') return json({ error: 'Registro duplicado.' }, 409);
      if (e && e.code === '22P02') return json({ error: 'Formato de dado inválido.' }, 400);
      console.error('Erro interno', e);
      return json({ error: 'Erro interno. Tente novamente.' }, 500);
    }
  };
}

// Remove chaves indefinidas antes de montar INSERT/UPDATE dinâmicos.
function clean(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

function brl(c) {
  return (Number(c) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');
}

function isoDate(d) {
  return typeof d === 'string' ? d : d.toISOString().slice(0, 10);
}

function monthPlus(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

// Tipos do Postgres: datas como "AAAA-MM-DD", BIGINT e NUMERIC como Number (centavos cabem com folga).
export const PG_TYPES = {
  date: { to: 1082, from: [1082], serialize: (x) => x, parse: (x) => x },
  bigint: { to: 20, from: [20], serialize: (x) => String(x), parse: (x) => Number(x) },
  numeric: { to: 1700, from: [1700], serialize: (x) => String(x), parse: (x) => Number(x) },
};
