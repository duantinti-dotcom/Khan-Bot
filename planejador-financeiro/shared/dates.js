// Datas são sempre strings ISO "AAAA-MM-DD" (sem hora), calculadas no fuso de São Paulo.
// Toda aritmética é feita em UTC para não sofrer com horário de verão.

export const TZ = 'America/Sao_Paulo';
const DAY_MS = 86400000;

export function todayISO(tz = TZ, now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return p; // en-CA já formata como AAAA-MM-DD
}

export function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function parts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function fromParts(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toUTC(iso) {
  const { y, m, d } = parts(iso);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  const dt = new Date(ms);
  return fromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(iso, n) {
  return fromUTC(toUTC(iso) + n * DAY_MS);
}

// Diferença em dias corridos: b - a.
export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

// Soma meses mantendo o dia desejado; se o mês não tiver esse dia, usa o último dia do mês.
export function addMonths(iso, n, preferredDay) {
  const { y, m, d } = parts(iso);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(preferredDay ?? d, daysInMonth(ny, nm));
  return fromParts(ny, nm, day);
}

export function startOfMonth(iso) {
  const { y, m } = parts(iso);
  return fromParts(y, m, 1);
}

export function endOfMonth(iso) {
  const { y, m } = parts(iso);
  return fromParts(y, m, daysInMonth(y, m));
}

export function monthKey(iso) {
  return iso.slice(0, 7);
}

// Data em que a pessoa completa `age` anos. Nascidos em 29/02 fazem aniversário em 28/02 nos anos não bissextos.
export function birthdayAtAge(birthISO, age) {
  const { y, m, d } = parts(birthISO);
  const ty = y + age;
  return fromParts(ty, m, Math.min(d, daysInMonth(ty, m)));
}

// Idade completa (em anos) numa data, considerando se o aniversário já passou.
export function ageOn(birthISO, onISO) {
  const b = parts(birthISO);
  const o = parts(onISO);
  let age = o.y - b.y;
  const bdayThisYear = birthdayAtAge(birthISO, age);
  if (onISO < bdayThisYear) age -= 1;
  return age;
}

// Diferença em meses completos + dias restantes, contando pelo calendário.
export function monthsAndDays(fromISO, toISO) {
  if (toISO <= fromISO) return { months: 0, days: 0 };
  const f = parts(fromISO);
  let months = 0;
  while (addMonths(fromISO, months + 1, f.d) <= toISO) months++;
  const anchor = addMonths(fromISO, months, f.d);
  return { months, days: diffDays(anchor, toISO) };
}

export function formatBR(iso) {
  if (!iso) return '';
  const { y, m, d } = parts(iso);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function formatShortBR(iso) {
  const { m, d } = parts(iso);
  return `${d} ${MESES[m - 1]}`;
}

export function monthLabel(key, long = false) {
  const [y, m] = key.split('-').map(Number);
  return long ? `${MESES_LONGOS[m - 1]} de ${y}` : `${MESES[m - 1]}/${String(y).slice(2)}`;
}

export function weekdayShort(iso) {
  const dow = new Date(toUTC(iso)).getUTCDay();
  return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dow];
}

export function dayOfWeek(iso) {
  return new Date(toUTC(iso)).getUTCDay();
}

// "em 3 dias", "hoje", "há 2 dias"
export function relativeDays(fromISO, toISO) {
  const n = diffDays(fromISO, toISO);
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
}

export function describeDuration(fromISO, toISO) {
  const { months, days } = monthsAndDays(fromISO, toISO);
  const anos = Math.floor(months / 12);
  const meses = months % 12;
  const out = [];
  if (anos) out.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`);
  if (meses) out.push(`${meses} ${meses === 1 ? 'mês' : 'meses'}`);
  if (days || out.length === 0) out.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);
  return out.join(', ').replace(/, ([^,]*)$/, ' e $1');
}
