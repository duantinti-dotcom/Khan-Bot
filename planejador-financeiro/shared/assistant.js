// Assistente financeiro por regras. Todas as respostas vêm de cálculos determinísticos sobre os
// dados da pessoa; nada é inventado. Ações sugeridas voltam como prévia para confirmação na interface.

import { addDays, dayOfWeek, formatBR, diffDays } from './dates.js';
import { formatBRL as fmt } from './money.js';
import { spendable, canIBuy, suggestSplit, planner, mainGoal, DIAS_POR_MES } from './calc.js';
import { suggestBudget, budgetUsage, completeness, itemKey, splitNewIncome, STYLES } from './budget.js';

export const SHORTCUTS = [
  { id: 'montar', label: 'Monte meu orçamento até o próximo pagamento' },
  { id: 'uber', label: 'Quanto posso gastar de Uber este mês?' },
  { id: 'fimdesemana', label: 'Dá para sair neste fim de semana?' },
  { id: 'recebi', label: 'Recebi R$ ___, como divido?', needs: ['amount'] },
  { id: 'diminuir', label: 'Onde posso diminuir para guardar mais?' },
  { id: 'possogastar', label: 'Posso gastar R$ ___ agora?', needs: ['amount'] },
  { id: 'passeios', label: 'Quanto posso reservar para sair com minha namorada?' },
  { id: 'meta', label: 'Se eu fizer essa compra, atrasa minha meta?', needs: ['amount'] },
];

const TRANSP = /uber|99|t[aá]xi|transporte|corrida/i;

// Junta o plano atual (ou a sugestão) com os acréscimos de uma entrada nova, no formato do POST /plans.
export function mergePlanItems(base, adds) {
  const m = new Map(base);
  for (const a of adds) m.set(a.key, (m.get(a.key) || 0) + a.amount);
  return [...m.entries()].filter(([, v]) => v > 0).map(([k, v]) => {
    const [type, ref_id] = k.split(':');
    return { type, ref_id, amount_cents: v, locked: false };
  });
}

const LAZER = /namor|passeio|encontro|date|lazer|rol[eê]|sa[ií]da/i;

function base(state, today) {
  const sp = spendable(state, today);
  const caveats = completeness(state, today);
  const period = `Período considerado: hoje (${formatBR(today)}) até ${formatBR(sp.period.end)}${sp.period.nextIncome ? `, véspera da próxima renda (${formatBR(sp.period.nextIncome)})` : ''}.`;
  return { sp, caveats, period };
}

function coveredText(sp) {
  const parts = [];
  if (sp.compromissos > 0) parts.push(`suas contas até ${formatBR(sp.period.end)} (${fmt(sp.compromissos)})`);
  if (sp.includePlanned && sp.aportesPendentes > 0) parts.push(`o aporte planejado das metas (${fmt(sp.aportesPendentes)})`);
  if (sp.separado > 0) parts.push(`o que já está separado (${fmt(sp.separado)})`);
  return parts.length ? `${parts.join(', ').replace(/, ([^,]*)$/, ' e $1')} já ${parts.length > 1 ? 'estão' : 'está'} descontado${parts.length > 1 ? 's' : ''}` : 'não há contas pendentes registradas no período';
}

function noAccounts(b) {
  return { answer: 'Primeiro cadastre onde está o seu dinheiro (conta ou carteira) para eu calcular.', value: null, reason: '', period: b.period, caveats: [], action: { type: 'navigate', to: 'perfil/contas', label: 'Cadastrar conta' } };
}

export function ask(state, today, id, input = {}) {
  const b = base(state, today);
  const { sp } = b;
  if (!sp.hasAccounts) return noAccounts(b);
  const amount = input.amount;

  if (id === 'fimdesemana') {
    const dow = dayOfWeek(today);
    let start, end;
    if (dow === 6) { start = today; end = addDays(today, 1); }
    else if (dow === 0) { start = today; end = today; }
    else if (dow === 5) { start = today; end = addDays(today, 2); }
    else { start = addDays(today, 6 - dow); end = addDays(start, 1); }
    const n = diffDays(start, end) + 1;
    if (sp.livreFinal <= 0) {
      return { ...b, value: 0, answer: `Pelos seus registros, não sobra dinheiro livre até ${formatBR(sp.period.end)}.`, reason: sp.livreFinal < 0 ? `Faltam ${fmt(-sp.livreFinal)} para cobrir contas e aportes.` : 'Tudo o que há está comprometido.', action: { type: 'navigate', to: 'plano/organizar', label: 'Ver como ajustar' } };
    }
    const value = Math.min(sp.livreFinal, sp.daily * n);
    const after = start > sp.period.end ? ` O fim de semana cai depois da sua próxima renda (${formatBR(sp.period.nextIncome)}); considerei só o dinheiro de hoje.` : '';
    return {
      ...b, value, answer: `Você pode gastar até ${fmt(value)} no fim de semana (${formatBR(start)}${n > 1 ? ` a ${formatBR(end)}` : ''}).`,
      reason: `Você tem ${fmt(sp.livreFinal)} livres porque ${coveredText(sp)}. Isso dá ${fmt(sp.daily)} por dia em ${sp.days} dia(s); o fim de semana tem ${n} dia(s).${after}`,
    };
  }

  if (id === 'possogastar' || id === 'meta') {
    if (!amount) return { ...b, needs: 'amount', answer: 'Qual o valor?' };
    const r = canIBuy(state, today, amount);
    if (id === 'meta') {
      const mg = mainGoal(state, today);
      if (!mg) return { ...b, answer: 'Você ainda não tem metas ativas.', value: null, reason: '', action: { type: 'navigate', to: 'metas', label: 'Criar meta' } };
      const ref = mg.planMonthly || mg.paceMonthly || mg.perMonth || 0;
      const delay = ref > 0 ? Math.ceil((amount / ref) * DIAS_POR_MES) : null;
      const covers = r.after >= 0;
      return {
        ...b, value: delay,
        answer: covers
          ? `Não atrasa “${mg.goal.name}” neste mês: depois da compra ainda sobram ${fmt(r.after)} com o aporte planejado coberto.`
          : `Atrasa: a compra usaria dinheiro do aporte de “${mg.goal.name}”${delay ? `, o equivalente a cerca de ${delay} dia(s) do seu ritmo de aportes` : ''}.`,
        reason: `A meta precisa de ${fmt(mg.perMonth ?? 0)}/mês até ${mg.deadline ? formatBR(mg.deadline) : '—'}. ${fmt(amount)} são ${Math.round((amount / Math.max(1, mg.remaining)) * 1000) / 10}% do que falta.`,
      };
    }
    const cat = input.categoryId;
    let budgetLine = '';
    if (cat && state.plan) {
      const u = budgetUsage(state, state.plan);
      const it = u.items.find((i) => i.type === 'categoria' && i.ref_id === cat);
      if (it) budgetLine = ` No seu plano, “${it.name}” tem ${fmt(it.left)} restantes${amount > it.left ? `; a compra passaria ${fmt(amount - it.left)} do planejado` : ''}.`;
    }
    const verdict = {
      cabe: `Sim, cabe. Depois sobrariam ${fmt(r.after)} até ${formatBR(sp.period.end)}.`,
      apertado: `Cabe, mas fica apertado: sobrariam ${fmt(r.after)}, cerca de ${fmt(r.newDaily)} por dia.`,
      afeta_metas: `As contas ficam cobertas, mas faltariam ${fmt(-r.after)} para o aporte planejado das metas.`,
      nao_cabe: `Não cabe: faltaria dinheiro para contas já previstas (${r.affectedBills.map((x) => x.description || 'conta').slice(0, 3).join(', ')}).`,
    }[r.verdict];
    return {
      ...b, value: r.after, verdict: r.verdict,
      answer: (b.caveats.length && r.verdict === 'cabe' ? 'Pelos seus registros, sim. ' : '') + verdict,
      reason: `Hoje você tem ${fmt(sp.livreFinal)} livres porque ${coveredText(sp)}.${budgetLine}`,
      action: { type: 'open', modal: 'gasto', props: { amount }, label: 'Comprei — registrar gasto' },
    };
  }

  if (id === 'recebi') {
    if (!amount) return { ...b, needs: 'amount', answer: 'Quanto você recebeu?' };
    const acc = sp.spendAccounts[0];
    const r = splitNewIncome(state, today, amount);
    const items = mergePlanItems(r.planned, r.adds);
    const lines = r.adds.map((a) => `${a.icon || ''} ${a.name}: +${fmt(a.amount)}`);
    return {
      ...b, value: amount,
      answer: r.adds.length
        ? `Sugestão para os ${fmt(amount)}: ${r.adds.map((a) => `${fmt(a.amount)} para ${a.name}`).join(', ')}${r.billGap ? `, ${fmt(r.billGap)} para cobrir contas` : ''} e ${fmt(r.livre)} livres.`
        : `${r.billGap ? `${fmt(r.billGap)} cobrem contas que estavam descobertas e ` : ''}${fmt(r.livre)} ficam livres: ${r.base === 'plano' ? 'seu plano já cobria tudo' : 'suas necessidades e metas já estavam cobertas'}.`,
      reason: `Considerei ${r.base === 'plano' ? 'seu plano salvo' : 'a divisão sugerida'} e só completei o que faltava; nada que já estava reservado foi reservado de novo. ${r.adds.map((a) => `${a.name}: ${a.reason}`).join(' ')}`,
      action: {
        type: 'apply', label: 'Registrar entrada e atualizar plano',
        preview: [`Registrar ${fmt(amount)} como dinheiro que entrou hoje em ${acc.name}`, ...lines, `${fmt(r.livre)} ficam livres`, 'É só planejamento no app: nada é transferido no banco.'],
        requests: [
          { method: 'POST', path: '/transactions', body: { kind: 'receita', amount_cents: amount, date: today, account_id: acc.id, status: 'realizado', description: 'Entrada (assistente)' } },
          { method: 'POST', path: '/plans', body: { items } },
        ],
      },
    };
  }

  if (id === 'uber') {
    const cats = state.categories.filter((c) => !c.archived);
    const cat = input.categoryId ? cats.find((c) => c.id === input.categoryId) : cats.find((c) => TRANSP.test(c.name));
    if (!cat) return { ...b, needs: 'category', answer: 'Em qual categoria você registra o Uber?', options: cats.map((c) => ({ id: c.id, label: `${c.icon || ''} ${c.name}` })) };
    const sug = suggestBudget(state, today);
    const it = sug.items.find((i) => i.key === itemKey('categoria', cat.id));
    if (!it.need && it.source === 'nada') {
      return { ...b, needs: 'estimate', category: cat, answer: `Para calcular, me conte: quantas viagens de ${cat.name} por semana e quanto custa cada uma, em média?` };
    }
    const planIt = state.plan && budgetUsage(state, state.plan).items.find((i) => i.type === 'categoria' && i.ref_id === cat.id);
    const value = planIt ? Math.max(0, planIt.left) : it.amount;
    return {
      ...b, value,
      answer: planIt
        ? `No seu plano, ainda há ${fmt(Math.max(0, planIt.left))} para ${cat.name} até ${formatBR(state.plan.period_end)}.`
        : `Até ${formatBR(sug.period.end)} você pode usar ${fmt(it.amount)} em ${cat.name}${it.short ? ` (o costume seria ${fmt(it.need)}, faltam ${fmt(it.short)})` : ''}.`,
      reason: `${it.reason} Desde ${formatBR(sug.cycleStart)} você já gastou ${fmt(it.spent)} aqui.${cat.essential ? ' Como é essencial, ela é coberta antes de lazer e metas.' : ''}`,
      action: { type: 'navigate', to: 'plano/organizar', label: 'Ver a divisão completa' },
    };
  }

  if (id === 'montar') {
    const sug = suggestBudget(state, today);
    if (sug.available < 0) {
      return { ...b, value: sug.available, answer: `Faltam ${fmt(-sug.available)} para as contas até ${formatBR(sug.period.end)}; ainda não dá para dividir.`, reason: 'Opções: confirmar algum recebimento previsto, adiar uma conta, usar a reserva ou registrar um valor extra que entrar.', action: { type: 'navigate', to: 'inicio', label: 'Ver contas' } };
    }
    const top = sug.items.filter((i) => i.amount > 0).sort((a, x) => x.amount - a.amount).slice(0, 6);
    return {
      ...b, value: sug.distributed,
      answer: `Proposta até ${formatBR(sug.period.end)}: ${top.map((i) => `${i.name} ${fmt(i.amount)}`).join(' · ')}${sug.livre ? ` · livre ${fmt(sug.livre)}` : ''}.`,
      reason: `Cabe nos ${fmt(sug.pool)} disponíveis depois das contas. Estilo: ${STYLES[sug.style].label} — ${STYLES[sug.style].desc}${sug.totalShort ? ` Não cobre tudo: faltam ${fmt(sug.totalShort)} para o costume e as metas.` : ''}`,
      action: { type: 'navigate', to: 'plano/organizar', label: 'Revisar e aplicar' },
    };
  }

  if (id === 'diminuir') {
    const sug = suggestBudget(state, today);
    const flex = sug.items.filter((i) => i.type === 'categoria' && !i.essential && i.need > 0).sort((a, x) => x.need - a.need);
    const goal = sug.items.find((i) => i.type === 'meta');
    if (!flex.length) return { ...b, value: 0, answer: 'Não encontrei gastos flexíveis registrados para reduzir.', reason: 'Registre seus gastos por alguns dias ou informe estimativas nas categorias para eu sugerir onde ajustar.' };
    const cuts = flex.slice(0, 3).map((i) => ({ i, cut: Math.round(i.need * 0.25) })).filter((c) => c.cut >= 100);
    const total = cuts.reduce((x, c) => x + c.cut, 0);
    const ref = goal?.metrics?.planMonthly || goal?.metrics?.perMonth || 0;
    return {
      ...b, value: total,
      answer: `Reduzindo um quarto em ${cuts.map((c) => `${c.i.name} (−${fmt(c.cut)})`).join(', ')}, sobram ${fmt(total)} a mais até ${formatBR(sug.period.end)}.`,
      reason: `Só sugeri categorias flexíveis, mantendo 75% do que você costuma gastar nelas — lazer continua no orçamento.${goal && ref ? ` Colocando isso em “${goal.name}”, a meta adianta cerca de ${Math.ceil((total / ref) * DIAS_POR_MES)} dia(s).` : ''}`,
      action: { type: 'navigate', to: 'plano/organizar', style: 'guardar', label: 'Simular divisão “Guardar mais”' },
    };
  }

  if (id === 'passeios') {
    const cats = state.categories.filter((c) => !c.archived);
    // Entre as categorias de passeio, prefere a que já está no plano.
    const inPlan = new Set((state.plan?.items || []).filter((i) => i.type === 'categoria').map((i) => i.ref_id));
    const matches = cats.filter((c) => LAZER.test(c.name));
    const cat = input.categoryId ? cats.find((c) => c.id === input.categoryId) : matches.find((c) => inPlan.has(c.id)) || matches[0];
    if (!cat) return { ...b, needs: 'category', answer: 'Em qual categoria você registra os passeios?', options: cats.map((c) => ({ id: c.id, label: `${c.icon || ''} ${c.name}` })) };
    if (sp.livreFinal <= 0) {
      return { ...b, value: 0, answer: `Pelos seus registros, não sobra dinheiro para “${cat.name}” até ${formatBR(sp.period.end)}.`, reason: `Contas e aportes já usam todo o saldo${sp.livreFinal < 0 ? `, e ainda faltam ${fmt(-sp.livreFinal)}` : ''}.`, action: { type: 'navigate', to: 'plano/organizar', label: 'Organizar meu dinheiro' } };
    }
    if (state.plan) {
      const u = budgetUsage(state, state.plan);
      const it = u.items.find((i) => i.type === 'categoria' && i.ref_id === cat.id);
      if (it) {
        return { ...b, value: Math.max(0, it.left), answer: `No seu plano, ainda há ${fmt(Math.max(0, it.left))} para “${cat.name}” até ${formatBR(state.plan.period_end)}.`, reason: `Você planejou ${fmt(it.amount_cents)} e já usou ${fmt(it.used)}. O plano foi montado depois de descontar contas e aportes.`, action: { type: 'navigate', to: 'plano/organizar', label: 'Ajustar o plano' } };
      }
    }
    const sug = suggestBudget(state, today);
    const it = sug.items.find((i) => i.key === itemKey('categoria', cat.id));
    const cap = sug.livre + (it?.amount || 0);
    const value = it?.amount > 0 ? it.amount : cap;
    return {
      ...b, value,
      answer: it?.amount > 0
        ? `Você pode destinar ${fmt(it.amount)} para “${cat.name}” até ${formatBR(sp.period.end)}${cap > it.amount ? ` (dá para chegar a ${fmt(cap)} sem mexer em contas e metas)` : ''}.`
        : `Você pode destinar até ${fmt(cap)} para “${cat.name}” até ${formatBR(sp.period.end)}.`,
      reason: `Isso é possível porque ${coveredText(sp)}, e os gastos essenciais previstos (${fmt(sug.items.filter((i) => i.stage === 1).reduce((s, i) => s + i.amount, 0))}) foram reservados antes.`,
      action: { type: 'navigate', to: 'plano/organizar', lock: { [itemKey('categoria', cat.id)]: value }, label: `Usar ${fmt(value)} no meu plano (revisar antes de salvar)` },
    };
  }

  if (id === 'ajustar') {
    const sug = suggestBudget(state, today);
    const flex = sug.items.filter((i) => i.type === 'categoria' && !i.essential && i.need > 0);
    if (sp.livreFinal >= 0 && sug.totalShort === 0) {
      const p = planner(state, today);
      if (p.gap > 0 && p.suggestions.length) {
        return { ...b, value: p.gap, answer: `Este período fecha, mas as metas pedem ${fmt(p.gap)}/mês a mais do que sobra.`, reason: p.suggestions.map((s) => `Reduzir ${fmt(s.cut)}/mês em “${s.name}” (média ${fmt(s.avg)}) mantém ${fmt(s.avg - s.cut)} para ela.`).join(' '), action: { type: 'navigate', to: 'plano/cenarios', label: 'Comparar cenários' } };
      }
      return { ...b, value: 0, answer: 'Pelos seus registros, seu mês fecha sem cortes. Mantenha o lazer dentro do plano.', reason: `Depois de ${coveredText(sp)}, sobram ${fmt(sp.livreFinal)}.` };
    }
    // Falta dinheiro: corta primeiro o excesso das categorias flexíveis, preservando pelo menos metade do lazer.
    const short = sug.totalShort;
    const lines = [];
    for (const i of flex) {
      const keep = LAZER.test(i.name) ? Math.max(i.amount, Math.round(i.need * 0.5)) : i.amount;
      lines.push(`“${i.name}”: ${fmt(keep)} (sua média seria ${fmt(i.need)})`);
    }
    return {
      ...b, value: short,
      answer: `Para fechar até ${formatBR(sp.period.end)} faltam ${fmt(short)} entre o que você costuma gastar, metas e contas.`,
      reason: lines.length ? `Sugestão mantendo lazer: ${lines.join('; ')}. Você decide os valores na tela Organizar.` : 'Não há gastos flexíveis registrados para reduzir; considere adiar parte do aporte das metas.',
      action: { type: 'navigate', to: 'plano/organizar', label: 'Escolher os ajustes' },
    };
  }
  return { ...b, answer: 'Não entendi a pergunta.' };
}
