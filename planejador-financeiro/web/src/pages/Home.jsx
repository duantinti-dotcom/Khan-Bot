import { useMemo, useState } from 'react';
import { useApp, TopBar } from '../App.jsx';
import { put } from '../api.js';
import * as C from '@shared/calc.js';
import * as B from '@shared/budget.js';
import { formatBR, relativeDays, diffDays, weekdayShort } from '@shared/dates.js';
import { brl, AnimatedMoney, SplitBar, Expander, EmptyCta, Seg, Icon, useToast } from '../ui.jsx';
import { DivisionRow, ApplyPlanModal } from '../budgetui.jsx';
import { settle } from '../actions.js';

export function GoalStatus({ m }) {
  const map = {
    atingida: ['ok', 'Meta atingida'], adiantada: ['ok', 'Adiantada'], no_plano: ['info', 'Dentro do plano'],
    atrasada: ['warn', 'Atrasada'], vencida: ['bad', 'Prazo vencido'], sem_prazo: ['warn', 'Sem prazo calculável'],
  };
  const [tone, label] = map[m.status];
  return <span className={`chip ${tone}`}>{label}{m.daysLeft != null && m.daysLeft >= 0 && m.status !== 'atingida' ? ` · ${m.daysLeft} dias` : ''}</span>;
}

export function BillItem({ b, cats, today, onPay, payLabel = 'Paguei' }) {
  const d = diffDays(today, b.date);
  const c = cats.get(b.category_id);
  return (
    <div className="item">
      <div className="dot" aria-hidden="true">{b.kind === 'receita' ? '↓' : c?.icon || '•'}</div>
      <div className="grow">
        <div className="t">{b.description || c?.name || 'Conta'}</div>
        <div className={`s ${b.kind !== 'receita' && d < 0 ? 'bad' : b.kind !== 'receita' && d <= 3 ? 'warn' : ''}`}>
          {weekdayShort(b.date)}, {formatBR(b.date)} · {d < 0 ? `${b.kind === 'receita' ? 'prevista' : 'venceu'} há ${-d} dia(s)` : relativeDays(today, b.date)}
        </div>
      </div>
      <div className={`amt ${b.kind === 'receita' ? 'ok' : ''}`}>{brl(b.amount_cents)}</div>
      {onPay && <button className="btn small" onClick={() => onPay(b)}>{payLabel}</button>}
    </div>
  );
}

const COLORS = { contas: '#b9773a', separado: '#7c8597', guardar: '#2347c6', livre: '#2f7a57' };

function FlowRow({ color, title, sub, value, explain, total }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`flow-row ${total ? 'total' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="sw" style={{ background: color }} aria-hidden="true" />
        <span className="t">{title}{sub && <small>{sub}</small>}</span>
        <span className="v">{brl(value)}</span>
      </button>
      <Expander open={open}><div className="flow-explain">{explain}</div></Expander>
    </>
  );
}

export default function Home() {
  const { data, today, reload, open, go } = useApp();
  const toast = useToast();
  const sp = useMemo(() => C.spendable(data, today), [data, today]);
  const [style, setStyle] = useState(null);
  const [showStyles, setShowStyles] = useState(false);
  const [apply, setApply] = useState(false);
  const sug = useMemo(() => B.suggestBudget(data, today, style ? { style } : {}), [data, today, style]);
  const usage = useMemo(() => B.budgetUsage(data, data.plan), [data]);
  const stale = useMemo(() => B.planStale(data, data.plan, today), [data, today]);
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const name = data.profile.display_name || data.user.username;

  const pay = async (b) => {
    try { await settle(b, today); await reload(); toast({ text: `${b.kind === 'receita' ? 'Recebimento confirmado' : `“${b.description || 'Conta'}” paga`}.`, ok: true }); }
    catch (e) { if (!e.cancelled) alert(e.message); else toast(e.message); }
  };

  if (!sp.hasAccounts) {
    return (
      <>
        <TopBar title={`Olá, ${name}`} subtitle={formatBR(today)} />
        <EmptyCta icon="contas" title="Comece pelo seu dinheiro" text="Cadastre onde seu dinheiro está (conta, carteira) e quanto tem hoje. Depois o app mostra quanto você pode gastar e como dividir."
          action={<button className="btn primary" onClick={() => go('perfil/contas')}>Cadastrar conta</button>} />
      </>
    );
  }

  const guardar = sp.includePlanned ? sp.aportesPendentes : 0;
  const pode = sp.livreFinal;
  const flowParts = [
    { label: 'Contas para pagar', value: sp.compromissos, color: COLORS.contas },
    { label: 'Já separado para metas', value: sp.separado, color: COLORS.separado },
    { label: 'Guardar para minha meta', value: guardar, color: COLORS.guardar },
    { label: 'Pode gastar', value: Math.max(0, pode), color: COLORS.livre },
  ];
  const todo = [];
  if (sp.overdue.length) todo.push({ ico: 'alerta', text: `${sp.overdue.length} conta(s) vencida(s) sem pagamento registrado`, action: () => go('movimentacoes/calendario'), label: 'Ver' });
  const toConfirm = sp.incomes.filter((i) => i.date <= today);
  if (toConfirm.length) todo.push({ ico: 'entrada', text: `${toConfirm.length} recebimento(s) previsto(s) para confirmar`, action: () => document.getElementById('proximos')?.setAttribute('open', ''), label: 'Ver' });
  if (data.plan && stale.length) todo.push({ ico: 'fixos', text: `Plano desatualizado: ${stale[0]}`, action: () => go('plano/organizar'), label: 'Revisar' });
  if (sp.unknown.length) todo.push({ ico: 'contas', text: `Informe o saldo de ${sp.unknown.map((a) => a.name).join(', ')}`, action: () => go('perfil/contas'), label: 'Atualizar' });

  const planView = usage && !stale.length;
  const rows = planView
    ? usage.items.filter((i) => i.amount_cents > 0).map((i) => {
      const s = sug.items.find((x) => x.id === i.ref_id) || {};
      return { it: { ...s, name: i.name, icon: i.icon, type: i.type, color: i.color }, used: i.used, planned: i.amount_cents };
    })
    : sug.items.filter((i) => i.amount > 0).map((i) => ({ it: i }));

  return (
    <>
      <TopBar title={`Olá, ${name}`} subtitle={`${formatBR(today)} · seu dinheiro até ${formatBR(sp.period.end)}`} />

      <section className="hero" aria-labelledby="pode-h">
        <div className="label" id="pode-h">{pode < 0 ? 'Faltam para fechar o período' : 'Pode gastar'}</div>
        <div className={`big-value ${pode < 0 ? 'neg' : ''}`}><AnimatedMoney c={Math.abs(pode)} /></div>
        <p className="sub">
          {pode < 0 ? `Suas contas e metas até ${formatBR(sp.period.end)} passam do que você tem. Veja as opções em Meu plano.`
            : `até ${formatBR(sp.period.end)} · cerca de ${brl(sp.daily)} por dia`}
        </p>
      </section>

      <section className="card flow">
        <h2>Para onde vai o dinheiro</h2>
        <div style={{ margin: '14px 0 4px' }}><SplitBar parts={flowParts} label="Dinheiro disponível" /></div>
        <div className="flow-rows">
          <FlowRow color="var(--text)" total title="1. Quanto tenho disponível" sub="dinheiro que já entrou nas contas de gasto" value={sp.saldoBase}
            explain={<>Soma de {sp.spendAccounts.map((a) => a.name).join(', ')}. Recebimentos previstos ({brl(sp.incomesTotal)}) só entram quando você confirma. Reservas e investimentos ({brl(sp.totals.reservado + sp.totals.investido)}) ficam fora.{sp.unknown.length ? ' Há conta com saldo desconhecido.' : ''}</>} />
          <FlowRow color={COLORS.contas} title="2. Reservado para contas" sub={`${sp.bills.length} conta(s) até ${formatBR(sp.period.end)}`} value={sp.compromissos}
            explain={<>Contas a pagar até a véspera {sp.period.nextIncome ? `do próximo recebimento (${formatBR(sp.period.nextIncome)})` : 'do fim do mês'}. Contas já pagas saíram do saldo e não contam de novo.</>} />
          {sp.separado > 0 && <FlowRow color={COLORS.separado} title="Já separado no app" sub="para metas, nessas contas" value={sp.separado}
            explain="Separar no app é planejamento: o dinheiro continua na conta, só deixa de aparecer como livre. Nada é transferido no banco." />}
          {guardar > 0 && <FlowRow color={COLORS.guardar} title="Guardar para minha meta" sub="o que falta separar neste mês" value={guardar}
            explain={<>Aporte que falta neste mês para seguir o plano das metas. <button className="btn small" onClick={async () => { await put('/profile', { include_planned_contributions: false }); await reload(); }}>Não descontar daqui</button></>} />}
          <FlowRow color={COLORS.livre} total title="3. Quanto posso gastar" sub="depois das contas e das metas" value={pode}
            explain={<>Tenho {brl(sp.saldoBase)} − contas {brl(sp.compromissos)} − separado {brl(sp.separado)}{guardar ? ` − guardar ${brl(guardar)}` : ''} = {brl(pode)}.{!sp.includePlanned && <> <button className="btn small" onClick={async () => { await put('/profile', { include_planned_contributions: true }); await reload(); }}>Descontar o aporte das metas</button></>}</>} />
        </div>
      </section>

      <section className="section" aria-labelledby="div-h">
        <div className="row between wrap">
          <h2 id="div-h">4. {planView ? 'Seu plano' : 'Sua divisão sugerida'}</h2>
          <span className="hint">{planView ? `até ${formatBR(data.plan.period_end)}` : `estilo ${B.STYLES[sug.style].label.toLowerCase()}`}</span>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          {planView ? 'Quanto você planejou, quanto já usou e quanto resta em cada coisa.'
            : sug.available < 0 ? `Faltam ${brl(-sug.available)} só para as contas; não há o que dividir agora.`
              : `Como dividir os ${brl(sug.pool)} livres depois das contas, com base nos seus gastos e metas. Toque para ver o porquê.`}
        </p>
        <div className="card division">
          {!rows.length && <p className="empty">Registre alguns gastos ou responda às perguntas em Meu plano para o app sugerir valores.</p>}
          {rows.map((r) => <DivisionRow key={`${r.it.type}:${r.it.id || r.it.name}`} {...r} />)}
          {!planView && sug.livre > 0 && (
            <div className="div-row"><div className="top" style={{ cursor: 'default' }}><span className="ic" aria-hidden="true">·</span><span className="name">Livre para outras coisas</span><span className="val">{brl(sug.livre)}</span></div></div>
          )}
        </div>
        {!planView && sug.totalShort > 0 && sug.available >= 0 && <p className="hint warn" style={{ marginTop: 8 }}>Não cobre tudo: faltam {brl(sug.totalShort)} para o costume e as metas. Ajuste valores ou simule outra divisão.</p>}
        {showStyles && (
          <div style={{ marginTop: 12 }}>
            <Seg value={sug.style} onChange={setStyle} label="Estilo de divisão" options={Object.entries(B.STYLES).map(([k, v]) => [k, v.label])} />
            <p className="hint" style={{ marginTop: 6 }}>{B.STYLES[sug.style].desc}</p>
          </div>
        )}
        <div className="actions-bar">
          {!planView && <button className="btn primary" disabled={sug.available < 0 || !rows.length} onClick={() => setApply(true)}>Aplicar plano</button>}
          <button className="btn" onClick={() => go('plano/organizar', style ? { style } : null)}>Ajustar valores</button>
          {!planView && <button className="btn" onClick={() => setShowStyles(!showStyles)} aria-expanded={showStyles}>Simular outra divisão</button>}
          {planView && <button className="btn" onClick={() => go('plano/assistente')}>Perguntar ao assistente</button>}
        </div>
      </section>

      {todo.length > 0 && (
        <section className="section">
          <h2>Para fazer</h2>
          <div className="card" style={{ marginTop: 12, paddingTop: 6, paddingBottom: 6 }}>
            {todo.map((t, i) => (
              <div className="todo" key={i}>
                <span className="ico"><Icon name={t.ico} size={18} /></span>
                <div className="grow">{t.text}</div>
                <button className="btn small" onClick={t.action}>{t.label}</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <details className="more" id="proximos" open={toConfirm.length > 0 || sp.overdue.length > 0}>
          <summary>Próximos dias · {sp.bills.length} conta(s), {sp.incomes.length} recebimento(s) previsto(s)</summary>
          <div className="inner">
            <div>
              <h3>Contas até {formatBR(sp.period.end)} <span className="muted">({brl(sp.compromissos)})</span></h3>
              {!sp.bills.length && <p className="hint">Nenhuma conta até lá.</p>}
              <div className="list">{sp.bills.slice(0, 8).map((b) => <BillItem key={b.id} b={b} cats={cats} today={today} onPay={pay} />)}</div>
            </div>
            <div>
              <h3>A receber — ainda não conta no saldo <span className="muted">({brl(sp.incomesTotal)})</span></h3>
              {!sp.incomes.length && <p className="hint">Nenhum recebimento previsto até lá.</p>}
              <div className="list">{sp.incomes.slice(0, 6).map((i) => <BillItem key={i.id} b={i} cats={cats} today={today} onPay={i.date <= today ? pay : null} payLabel="Recebi" />)}</div>
            </div>
          </div>
        </details>
      </section>
      {apply && <ApplyPlanModal sug={sug} onClose={() => setApply(false)} />}
    </>
  );
}
