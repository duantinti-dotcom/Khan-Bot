// Valores monetários são inteiros em centavos em todo o sistema (BIGINT no banco).
// Nunca usamos float para guardar dinheiro; float só aparece em taxas de simulação.

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatBRL(cents) {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '—';
  return fmt.format(cents === 0 ? 0 : cents / 100).replace(/ /g, ' ');
}

export function formatPlain(cents) {
  if (cents === null || cents === undefined) return '';
  return fmtNum.format(cents / 100);
}

// Aceita "20", "20,5", "1.234,56", "R$ 1.234,56", "1234.56" e "-15,00".
// Retorna centavos inteiros ou null se o texto não for um valor válido.
export function parseBRL(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null;
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/R\$\s?/i, '').replace(/\s/g, '');
  if (!s) return null;
  let neg = false;
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart, decPart = '';
  if (lastComma >= 0) {
    // Vírgula é o separador decimal brasileiro; pontos antes dela são milhares.
    intPart = s.slice(0, lastComma).replace(/\./g, '');
    decPart = s.slice(lastComma + 1);
  } else if (lastDot >= 0 && s.length - lastDot - 1 !== 3) {
    // "12.5" ou "12.50": ponto como decimal (digitação em teclado americano).
    intPart = s.slice(0, lastDot).replace(/\./g, '');
    decPart = s.slice(lastDot + 1);
  } else {
    intPart = s.replace(/\./g, '');
  }
  if (decPart.includes('.') || decPart.includes(',') || decPart.length > 2) return null;
  if (!/^\d*$/.test(intPart) || (!intPart && !decPart)) return null;
  const cents = Number(intPart || '0') * 100 + Number((decPart + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return neg ? -cents : cents;
}

// Divide um total em partes inteiras proporcionais a pesos, sem perder centavos.
export function splitProportional(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let rest = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floors[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < order.length && rest > 0; k++, rest--) floors[order[k][1]]++;
  return floors;
}

export function pct(part, whole) {
  if (!whole) return 0;
  return part / whole;
}

export function formatPct(x, digits = 0) {
  return `${(x * 100).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}
