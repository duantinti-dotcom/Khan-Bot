import { useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import { put } from '../api.js';
import * as C from '@shared/calc.js';
import { formatBR, relativeDays, addDays, diffDays, monthLabel, monthKey, weekdayShort } from '@shared/dates.js';
import { Money, brl, Ring, Progress, Alert, BarsChart, useToast } from '../ui.jsx';
import { settle } from '../actions.js';

export function SpendCard({ compact }) {
  const { data, today, reload, open } = useApp();
  const [showCalc, setShowCalc] = useState(false);
  const sp = useMemo(() => C.spendable(data, today), [data, today]);
  const opts = useMemo(() => C.deficitOptions(sp, data), [sp, data]);
  const toast = useToast();
  const neg = sp.livreFinal < 0;
  const togglePlanned = async () => {
    await put('/profile', { include_planned_contributions: !sp.includePlanned });
    await reload();
    toast(sp.includePlanned ? 'Aportes planejados não são mais descontados.' : 'Aportes planejados agora são descontados.');
  };
  if (!sp.hasAccounts) {
    return (
      <section className="card hero">
        <h2>Quanto posso gastar?</h2>
        <p className="muted">Cadastre onde está o seu dinheiro (conta, carteira) para o app calcular.</p>
        <button className="btn primary" onClick={() => (location.hash = '#/dinheiro')}>Cadastrar conta</button>
      </section>
    );
  }
  return (
    <section className="card hero" aria-labelledby="spend-h">
      <div className="card-h">
        <h2 id="spend-h">{neg ? 'Seu orçamento está negativo' : 'Você pode gastar'}</h2>
        <span className="chip">até {formatBR(sp.period.end)}</span>
      </div>
      <div className={`big-value num ${neg ? 'neg' : 'pos'}`}>{neg ? `− ${brl(-sp.livreFinal)}` : brl(sp.livreFinal)}</div>
      <p className="muted">
        {neg ? `Faltam ${brl(-sp.livreFinal)} para cobrir os compromissos até ${formatBR(sp.period.end)}.`
          : `${sp.days} ${sp.days === 1 ? 'dia' : 'dias'} até ${sp.period.reason === 'proxima_renda' ? `a próxima renda (${formatBR(sp.period.nextIncome)})` : 'o fim do mês'}.`}
      </p>
      {sp.unknown.length > 0 && <Alert tone="warn">Saldo desconhecido em {sp.unknown.map((a) => a.name).join(', ')}. <a href="#/dinheiro">Atualize</a> para o cálculo ficar correto.</Alert>}
      <div className="kpis">
        <div className="kpi"><div className="l">Por dia</div><div className="v num">{brl(sp.daily)}</div></div>
        <div className="kpi"><div className="l">Por semana</div><div className="v num">{brl(sp.weekly)}</div></div>
        <div className="kpi"><div className="l">Contas até {formatBR(sp.period.end).slice(0, 5)}</div><div className="v num">{brl(sp.compromissos)}</div></div>
        {!compact && <div className="kpi"><div className="l">Previsto para entrar</div><div className="v num faint">{brl(sp.incomesTotal)}</div></div>}
      </div>
      {sp.tight && <p className="warn" style={{ marginTop: 10 }}>Atenção: o limite diário está abaixo do seu gasto médio recente ({brl(sp.avgDaily)}/dia).</p>}
      <div className="row wrap" style={{ marginTop: 12 }}>
        <button className="btn small" onClick={() => setShowCalc(!showCalc)} aria-expanded={showCalc}>{showCalc ? 'Esconder cálculo' : 'Como chegamos nesse valor?'}</button>
        <button className="btn small" onClick={() => open('comprar')}>Posso comprar isso?</button>
      </div>
      {showCalc && (
        <div className="calc" aria-live="polite">
          <div className="ln"><span>Saldo nas contas para gastar</span><Money c={sp.saldoBase} /></div>
          <div className="ln"><span>− Já separado para metas e reserva nessas contas</span><Money c={-sp.separado} /></div>
          <div className="ln"><span>− Contas a pagar até {formatBR(sp.period.end)} ({sp.bills.length})</span><Money c={-sp.compromissos} /></div>
          <div className="ln"><span>
            − Aportes planejados que faltam neste mês {' '}
            <button className="btn small ghost" onClick={togglePlanned}>{sp.includePlanned ? '(descontando — mudar)' : '(não descontando — mudar)'}</button>
          </span><Money c={sp.includePlanned ? -sp.aportesPendentes : 0} /></div>
          <div className="ln"><span>= Livre para gastar</span><Money c={sp.livreFinal} /></div>
          <p className="hint">Despesas já pagas já saíram do saldo e não são descontadas de novo. Dinheiro em contas marcadas como reservadas ou investidas ({brl(sp.totals.reservado + sp.totals.investido)}) e receitas previstas ({brl(sp.incomesTotal)}) não entram como dinheiro livre. Limite diário = livre ÷ {sp.days} dia(s).</p>
        </div>
      )}
      {neg && opts.length > 0 && (
        <div className="stack" style={{ marginTop: 12 }}>
          <h3>Opções para ajustar</h3>
          {opts.map((o, i) => <Alert key={i} tone="info">{o}</Alert>)}
        </div>
      )}
    </section>
  );
}

export function UpcomingBills({ days = 14, limit = 6 }) {
  const { data, today, reload } = useApp();
  const toast = useToast();
  const bills = useMemo(() => C.pendingExpenses(data, today, addDays(today, days)), [data, today, days]);
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const pay = async (b) => {
    try { await settle(b, today); await reload(); toast(`"${b.description || 'Conta'}" marcada como paga.`); } catch (e) { if (!e.cancelled) alert(e.message); else toast(e.message); }
  };
  return (
    <section className="card">
      <div className="card-h"><h2>Próximas contas</h2><a href="#/lancamentos?tab=calendario" className="hint">calendário</a></div>
      {!bills.length && <p className="empty">Nada a pagar nos próximos {days} dias. 🎉</p>}
      <div className="list">
        {bills.slice(0, limit).map((b) => {
          const d = diffDays(today, b.date);
          return (
            <div className="item" key={b.id}>
              <div className="dot" aria-hidden="true">{cats.get(b.category_id)?.icon || '•'}</div>
              <div className="grow">
                <div className="t">{b.description || cats.get(b.category_id)?.name || 'Conta'}</div>
                <div className={`s ${d < 0 ? 'bad' : d <= 3 ? 'warn' : ''}`}>{weekdayShort(b.date)}, {formatBR(b.date)} · {d < 0 ? `atrasada ${-d} dia(s)` : relativeDays(today, b.date)}{b.virtual ? ' · recorrente' : ''}</div>
              </div>
              <div className="amt num">{brl(b.amount_cents)}</div>
              <button className="btn small" onClick={() => pay(b)}>Paguei</button>
            </div>
          );
        })}
      </div>
      {bills.length > limit && <p className="hint">+ {bills.length - limit} conta(s). Veja todas em Lançamentos.</p>}
    </section>
  );
}

export default function Home() {
  const { data, today, open, go } = useApp();
  const mg = useMemo(() => C.mainGoal(data, today), [data, today]);
  const goalsM = useMemo(() => C.activeGoals(data).map((g) => C.goalMetrics(g, data, today)), [data, today]);
  const monthPending = goalsM.reduce((s, m) => s + (m.status === 'vencida' ? 0 : m.pendingThisMonth), 0);
  const alerts = useMemo(() => C.alerts(data, today), [data, today]);
  const series = useMemo(() => C.monthlySeries(data, today, 6), [data, today]);
  const catMonth = useMemo(() => C.categoryMonth(data, today).filter((c) => c.planned > 0 || c.limit).sort((a, b) => b.planned - a.planned), [data, today]);
  const name = data.profile.display_name || data.user.username;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="hello">Olá, {name} · {formatBR(today)}</div>
          <h1>Início</h1>
        </div>
        <button className="btn primary" onClick={() => open('recebi')}>+ Recebi</button>
      </div>

      <div className="grid two">
        <div className="stack">
          <SpendCard />
          <div className="quick" role="group" aria-label="Ações rápidas">
            <button className="btn" onClick={() => open('recebi')}><span className="ico">↓</span>Recebi</button>
            <button className="btn" onClick={() => open('gastei')}><span className="ico">↑</span>Gastei</button>
            <button className="btn" onClick={() => open('guardei')}><span className="ico">◆</span>Guardei</button>
          </div>
        </div>
        <div className="stack">
          <UpcomingBills />
          <section className="card">
            <div className="card-h"><h2>Meta principal</h2><button className="btn small ghost" onClick={() => go('metas')}>ver metas</button></div>
            {!mg && <div className="empty">Nenhuma meta ainda. <button className="btn small" onClick={() => go('metas')}>Criar meta</button></div>}
            {mg && (
              <div className="row" style={{ gap: 16, alignItems: 'center' }}>
                <Ring value={mg.progress} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <h3>{mg.goal.name}</h3>
                  <p className="num"><b>{brl(mg.current)}</b> <span className="muted">de {brl(mg.target)}</span></p>
                  <GoalStatus m={mg} />
                  {mg.perMonth != null && mg.status !== 'atingida' && <p className="hint">Para chegar no prazo: {brl(mg.perMonth)}/mês ou {brl(mg.perWeek)}/semana.</p>}
                </div>
              </div>
            )}
            <hr />
            <div className="row between">
              <span className="muted">Falta guardar neste mês ({monthLabel(monthKey(today), true)})</span>
              <b className="num">{brl(monthPending)}</b>
            </div>
          </section>
        </div>
      </div>

      {alerts.length > 0 && (
        <section className="section">
          <h2>Alertas</h2>
          <div className="stack">{alerts.slice(0, 6).map((a, i) => <Alert key={i} tone={a.tone}>{a.text}</Alert>)}</div>
        </section>
      )}

      <div className="grid two section">
        <section className="card">
          <div className="card-h"><h2>Entradas e saídas</h2><small>últimos 6 meses</small></div>
          <BarsChart series={series} />
        </section>
        <section className="card">
          <div className="card-h"><h2>Categorias no mês</h2><button className="btn small ghost" onClick={() => go('lancamentos')}>detalhes</button></div>
          {!catMonth.length && <p className="empty">Sem gastos registrados neste mês.</p>}
          <div className="stack">
            {catMonth.slice(0, 7).map((c) => (
              <div key={c.category.id}>
                <div className="row between"><span>{c.category.icon} {c.category.name}</span><span className="num">{brl(c.planned)}{c.limit ? <span className="muted"> / {brl(c.limit)}</span> : ''}</span></div>
                <Progress value={c.limit ? c.ratio : c.planned / Math.max(1, catMonth[0].planned)} tone={c.over ? 'bad' : c.ratio >= 0.8 ? 'warn' : ''} />
                {c.pending > 0 && <small className="muted">inclui {brl(c.pending)} ainda a pagar</small>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export function GoalStatus({ m }) {
  const map = {
    atingida: ['ok', 'Meta atingida'], adiantada: ['ok', 'Adiantada'], no_plano: ['info', 'Dentro do plano'],
    atrasada: ['warn', 'Atrasada'], vencida: ['bad', 'Prazo vencido'], sem_prazo: ['warn', 'Sem prazo calculável'],
  };
  const [tone, label] = map[m.status];
  return <span className={`chip ${tone}`}>{label}{m.daysLeft != null && m.daysLeft >= 0 && m.status !== 'atingida' ? ` · ${m.daysLeft} dias` : ''}</span>;
}
