import { addDays, addMonths, diffDays, parts, fromParts, daysInMonth } from './dates.js';

export const FREQUENCIAS = {
  semanal: { label: 'Semanal', perMonth: 52 / 12 },
  quinzenal: { label: 'A cada 14 dias', perMonth: 26 / 12 },
  mensal: { label: 'Mensal', perMonth: 1 },
  anual: { label: 'Anual', perMonth: 1 / 12 },
};

// Valor mensal equivalente de algo que se repete numa frequência.
export function monthlyEquivalent(amountCents, frequency) {
  const f = FREQUENCIAS[frequency];
  return f ? amountCents * f.perMonth : 0;
}

// Datas de ocorrência de uma recorrência dentro de [from, to] (inclusive).
// A regra é determinística: ocorrências são calculadas, nunca gravadas em lote,
// por isso abrir o app várias vezes não duplica nada.
export function occurrenceDates(rec, from, to) {
  const out = [];
  const start = rec.start_date;
  const end = rec.end_date && rec.end_date < to ? rec.end_date : to;
  const lo = from > start ? from : start;
  if (end < lo) return out;
  if (rec.frequency === 'mensal') {
    const day = rec.day_of_month || parts(start).d;
    const s = parts(start);
    const l = parts(lo);
    // Base no dia 1 do mês de início; cada ocorrência cai no dia escolhido
    // (ou no último dia, em meses mais curtos). Começa perto de `lo` para não iterar anos à toa.
    const base = fromParts(s.y, s.m, 1);
    let k = Math.max(0, (l.y - s.y) * 12 + (l.m - s.m) - 1);
    for (let guard = 0; guard < 600; guard++, k++) {
      const cur = addMonths(base, k, day);
      if (cur > end) break;
      if (cur >= lo && cur >= start) out.push(cur);
    }
    return out;
  }
  if (rec.frequency === 'semanal' || rec.frequency === 'quinzenal') {
    const step = rec.frequency === 'semanal' ? 7 : 14;
    let k = Math.max(0, Math.floor(diffDays(start, lo) / step));
    let cur = addDays(start, k * step);
    for (let guard = 0; guard < 2000 && cur <= end; guard++) {
      if (cur >= lo) out.push(cur);
      k++;
      cur = addDays(start, k * step);
    }
    return out;
  }
  if (rec.frequency === 'anual') {
    const s = parts(start);
    for (let y = Math.max(s.y, parts(lo).y - 1); y <= parts(end).y; y++) {
      const cur = fromParts(y, s.m, Math.min(s.d, daysInMonth(y, s.m)));
      if (cur >= lo && cur <= end && cur >= start) out.push(cur);
    }
    return out;
  }
  return out;
}

// Próxima ocorrência estritamente depois de `after`.
export function nextOccurrence(rec, after, horizonDays = 800) {
  const list = occurrenceDates(rec, addDays(after, 1), addDays(after, horizonDays));
  return list[0] || null;
}
