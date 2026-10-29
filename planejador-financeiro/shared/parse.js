import { parseBRL } from './money.js';
import { isISODate, fromParts, daysInMonth } from './dates.js';

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Interpreta frases como "Quero ter R$10.000 quando completar 20 anos",
// "juntar 3 mil até dezembro de 2027" ou "R$ 800 até 15/03/2027".
// Retorna só o que conseguiu entender; o formulário mostra o resto para a pessoa completar.
export function parseGoalText(text) {
  if (!text || typeof text !== 'string') return {};
  const t = norm(text);
  const out = {};
  const mil = t.match(/(\d+(?:[.,]\d+)?)\s*(mil|k)\b/);
  if (mil) {
    const base = parseBRL(mil[1]);
    if (base != null) out.target_cents = base * 1000;
  } else {
    const m = t.match(/r\$\s*([\d.,]+)/) || t.match(/\b(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\b(?!\s*(?:anos|\/|de\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)))/);
    if (m) {
      const v = parseBRL(m[1]);
      if (v != null && v > 0) out.target_cents = v;
    }
  }
  const age = t.match(/(?:completar|fizer|tiver|aos|com)\s+(\d{1,3})\s*anos/);
  if (age) {
    out.target_type = 'idade';
    out.target_age = Number(age[1]);
  }
  const dmy = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    const iso = fromParts(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
    if (isISODate(iso)) { out.target_type = 'data'; out.target_date = iso; delete out.target_age; }
  } else {
    const my = t.match(new RegExp(`(${MESES.join('|')})\\s+(?:de\\s+)?(\\d{4})`));
    if (my) {
      const y = Number(my[2]);
      const mo = MESES.indexOf(my[1]) + 1;
      out.target_type = 'data';
      out.target_date = fromParts(y, mo, daysInMonth(y, mo));
      delete out.target_age;
    }
  }
  const nome = text.match(/(?:para|pra)\s+(?:(?:um|uma|o|a|meu|minha)\s+)?([^,.;]+?)(?:\s+(?:ate|até|quando|aos|em)(?=\s|$)|[,.;]|$)/i);
  if (nome && nome[1].trim().length > 1 && !/^\d/.test(nome[1].trim())) out.name = nome[1].trim().replace(/^./, (c) => c.toUpperCase());
  return out;
}
