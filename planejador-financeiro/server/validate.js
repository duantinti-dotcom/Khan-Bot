// Validação de entrada no servidor. Cada recurso declara seus campos permitidos;
// qualquer campo fora da lista é ignorado (o cliente nunca escolhe user_id, id etc.).

import { isISODate } from '../shared/dates.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const T = {
  str: (min = 0, max = 200) => (v, k) => {
    if (typeof v !== 'string') throw new HttpError(400, `Campo "${k}" inválido.`);
    const s = v.trim();
    if (s.length < min || s.length > max) throw new HttpError(400, `Campo "${k}" deve ter entre ${min} e ${max} caracteres.`);
    return s;
  },
  int: (min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => (v, k) => {
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) throw new HttpError(400, `Campo "${k}" inválido.`);
    return v;
  },
  bool: () => (v, k) => {
    if (typeof v !== 'boolean') throw new HttpError(400, `Campo "${k}" inválido.`);
    return v;
  },
  date: () => (v, k) => {
    if (!isISODate(v)) throw new HttpError(400, `Data inválida em "${k}".`);
    return v;
  },
  uuid: () => (v, k) => {
    if (typeof v !== 'string' || !UUID.test(v)) throw new HttpError(400, `Referência inválida em "${k}".`);
    return v.toLowerCase();
  },
  enum: (...vals) => (v, k) => {
    if (!vals.includes(v)) throw new HttpError(400, `Valor inválido em "${k}".`);
    return v;
  },
  color: () => (v, k) => {
    if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) throw new HttpError(400, `Cor inválida em "${k}".`);
    return v;
  },
  numeric: (min, max) => (v, k) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new HttpError(400, `Campo "${k}" inválido.`);
    return v;
  },
};

export function isUUID(v) {
  return typeof v === 'string' && UUID.test(v);
}

// spec: { campo: [validador, aceitaNull] }
export function pick(body, spec, { partial = false, required = [] } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Corpo da requisição inválido.');
  const out = {};
  for (const [k, [fn, nullable]] of Object.entries(spec)) {
    if (!(k in body) || body[k] === undefined) continue;
    const v = body[k];
    if (v === null || v === '') {
      if (nullable) { out[k] = null; continue; }
      throw new HttpError(400, `Campo "${k}" é obrigatório.`);
    }
    out[k] = fn(v, k);
  }
  if (!partial) for (const k of required) if (out[k] === undefined || out[k] === null) throw new HttpError(400, `Campo "${k}" é obrigatório.`);
  return out;
}

const MAX_CENTS = 100_000_000_000; // R$ 1 bilhão

export const SPECS = {
  accounts: {
    name: [T.str(1, 60)], kind: [T.enum('corrente', 'dinheiro', 'caixinha', 'poupanca', 'tesouro', 'cdb', 'outros')],
    institution: [T.str(0, 60), true], purpose: [T.enum('gastar', 'reservado', 'investido')],
    liquidity: [T.enum('imediata', 'curta', 'bloqueada')], maturity_date: [T.date(), true],
    est_yield_note: [T.str(0, 120), true], initial_cents: [T.int(-MAX_CENTS, MAX_CENTS)],
    balance_known: [T.bool()], archived: [T.bool()],
  },
  categories: {
    name: [T.str(1, 40)], color: [T.color()], icon: [T.str(0, 8), true],
    monthly_limit_cents: [T.int(0, MAX_CENTS), true], essential: [T.bool()], archived: [T.bool()], sort: [T.int(0, 1000)],
  },
  recurrences: {
    kind: [T.enum('receita', 'despesa')], amount_cents: [T.int(1, MAX_CENTS)], account_id: [T.uuid(), true],
    category_id: [T.uuid(), true], description: [T.str(1, 80)], frequency: [T.enum('semanal', 'quinzenal', 'mensal', 'anual')],
    day_of_month: [T.int(1, 31), true], start_date: [T.date()], end_date: [T.date(), true], active: [T.bool()],
    is_main_income: [T.bool()], note: [T.str(0, 500), true],
  },
  transactions: {
    kind: [T.enum('receita', 'despesa', 'transferencia', 'reembolso')], amount_cents: [T.int(1, MAX_CENTS)],
    date: [T.date()], account_id: [T.uuid(), true], to_account_id: [T.uuid(), true], category_id: [T.uuid(), true],
    description: [T.str(0, 80), true], status: [T.enum('realizado', 'previsto', 'cancelado')],
    refund_of: [T.uuid(), true], note: [T.str(0, 500), true],
  },
  goals: {
    kind: [T.enum('meta', 'reserva')], name: [T.str(1, 60)], target_cents: [T.int(1, MAX_CENTS)], priority: [T.int(1, 3)],
    target_type: [T.enum('idade', 'data')], target_age: [T.int(1, 120), true], target_date: [T.date(), true],
    real_terms: [T.bool()], plan_amount_cents: [T.int(1, MAX_CENTS), true], plan_frequency: [T.enum('semanal', 'quinzenal', 'mensal'), true],
    plan_day: [T.int(1, 31), true], place_account_id: [T.uuid(), true], place_note: [T.str(0, 120), true],
    note: [T.str(0, 500), true], archived: [T.bool()],
  },
  contributions: {
    goal_id: [T.uuid()], account_id: [T.uuid()], amount_cents: [T.int(-MAX_CENTS, MAX_CENTS)], date: [T.date()],
    source: [T.enum('aporte', 'divisao', 'resgate', 'ajuste')], note: [T.str(0, 200), true],
  },
  profile: {
    display_name: [T.str(0, 40), true], birth_date: [T.date(), true], onboarding_done: [T.bool()],
    budget_mode: [T.enum('proxima_renda', 'fim_do_mes')], include_planned_contributions: [T.bool()],
    has_variable_income: [T.bool(), true], variable_income_estimate_cents: [T.int(0, MAX_CENTS), true],
    risk_tolerance: [T.enum('baixa', 'media', 'alta'), true], theme: [T.enum('escuro', 'claro', 'sistema')],
    sim_yield_annual: [T.numeric(-0.5, 2), true], sim_inflation_annual: [T.numeric(-0.5, 2), true],
  },
};

export const REQUIRED = {
  accounts: ['name', 'kind', 'purpose', 'liquidity'],
  categories: ['name'],
  recurrences: ['kind', 'amount_cents', 'description', 'frequency', 'start_date'],
  transactions: ['kind', 'amount_cents', 'date', 'status'],
  goals: ['name', 'target_cents', 'target_type'],
  contributions: ['goal_id', 'account_id', 'amount_cents', 'date'],
};

export function validateUsername(u) {
  if (typeof u !== 'string' || !/^[A-Za-z0-9._-]{3,30}$/.test(u.trim())) {
    throw new HttpError(400, 'O nome de usuário deve ter de 3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado.');
  }
  return u.trim();
}

export function validatePassword(p, username) {
  if (typeof p !== 'string' || p.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
  if (p.length > 200) throw new HttpError(400, 'Senha longa demais.');
  if (username && p.toLowerCase() === username.toLowerCase()) throw new HttpError(400, 'A senha não pode ser igual ao nome de usuário.');
  if (/^(.)\1+$/.test(p) || ['12345678', '123456789', 'senha123', 'password', '11111111', 'abcdefgh'].includes(p.toLowerCase())) {
    throw new HttpError(400, 'Essa senha é fácil demais de adivinhar. Escolha outra.');
  }
  return p;
}
