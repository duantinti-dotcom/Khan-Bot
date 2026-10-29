import { useMemo, useState } from 'react';
import { useApp, TopBar } from '../App.jsx';
import { del } from '../api.js';
import * as C from '@shared/calc.js';
import * as B from '@shared/budget.js';
import {
  formatBR, addDays, startOfMonth, endOfMonth, addMonths, monthKey, monthLabel, parts, dayOfWeek,
} from '@shared/dates.js';
import { Field, Seg, brl, Money, EmptyCta, useToast } from '../ui.jsx';
import { EditTx, OccurrenceModal, Installments } from './Lancamentos.jsx';
import Fixos from './Fixos.jsx';
import { withAllocCheck } from '../actions.js';

const KIND = { receita: 'Entrada', despesa: 'Gasto', transferencia: 'Transferência', ajuste: 'Ajuste de saldo', reembolso: 'Reembolso' };

function statusLabel(t) {
  if (t.status === 'cancelado') return 'pulado';
  if (t.status === 'previsto') return t.kind === 'receita' ? 'previsto' : 'a pagar';
  return t.kind === 'receita' ? 'recebido' : t.kind === 'despesa' ? 'pago' : '';
}

function List() {
  const { data, today, reload } = useApp();
  const toast = useToast();
  const [from, setFrom] = useState(startOfMonth(today));
  const [to, setTo] = useState(endOfMonth(today));
  const [kind, setKind] = useState('');
  const [cat, setCat] = useState('');
  const [acc, setAcc] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const accs = new Map(data.accounts.map((a) => [a.id, a]));
  const rows = data.transactions.filter((t) => (!from || t.date >= from) && (!to || t.date <= to)
    && (!kind || t.kind === kind) && (cat === '' || (cat === 'sem' ? !t.category_id && t.kind === 'despesa' : t.category_id === cat))
    && (!acc || t.account_id === acc || t.to_account_id === acc) && (!status || t.status === status)
    && (!q || `${t.description || ''} ${t.note || ''} ${cats.get(t.category_id)?.name || ''}`.toLowerCase().includes(q.toLowerCase())));
  const recent = [...data.transactions].filter((t) => t.created_at && Date.now() - Date.parse(t.created_at) < 24 * 3600e3)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 5);
  const totIn = rows.filter((t) => t.kind === 'receita' && t.status === 'realizado').reduce((s, t) => s + t.amount_cents, 0);
  const totOut = rows.filter((t) => t.kind === 'despesa' && t.status === 'realizado').reduce((s, t) => s + t.amount_cents, 0)
    - rows.filter((t) => t.kind === 'reembolso' && t.status === 'realizado').reduce((s, t) => s + t.amount_cents, 0);
  const preset = (k) => {
    if (k === 'mes') { setFrom(startOfMonth(today)); setTo(endOfMonth(today)); }
    if (k === '7') { setFrom(addDays(today, -6)); setTo(today); }
    if (k === '30') { setFrom(addDays(today, -29)); setTo(today); }
    if (k === 'tudo') { setFrom(''); setTo(''); }
  };
  const undo = async (t) => {
    if (!window.confirm(`Desfazer “${t.description || KIND[t.kind]}” de ${brl(t.amount_cents)}?`)) return;
    try {
      await withAllocCheck((w) => del(`/transactions/${t.id}${w ? '?withdraw=1' : ''}`));
      await reload();
      toast({ text: 'Lançamento desfeito.', ok: true });
    } catch (e) { if (!e.cancelled) alert(e.message); }
  };
  const row = (t, withUndo) => {
    const c = cats.get(t.category_id);
    const sign = t.kind === 'despesa' ? '−' : t.kind === 'transferencia' ? '' : t.kind === 'ajuste' ? (t.amount_cents < 0 ? '' : '+') : '+';
    return (
      <div className="item" key={t.id}>
        <div className="dot" aria-hidden="true">{t.kind === 'transferencia' ? '⇄' : t.kind === 'receita' ? '↓' : t.kind === 'ajuste' ? '≈' : c?.icon || '•'}</div>
        <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', padding: 0, minWidth: 0 }} onClick={() => setEdit(t)}>
          <div className="t">{t.description || c?.name || KIND[t.kind]}</div>
          <div className="s">{formatBR(t.date)} · {t.kind === 'transferencia' ? `${accs.get(t.account_id)?.name} → ${accs.get(t.to_account_id)?.name}` : `${KIND[t.kind]}${c ? ` · ${c.name}` : t.kind === 'despesa' ? ' · sem categoria' : ''}`}{statusLabel(t) ? ` · ${statusLabel(t)}` : ''}</div>
        </button>
        <div className={`amt num ${t.status !== 'realizado' ? 'faint' : t.kind === 'receita' || t.kind === 'reembolso' ? 'ok' : ''}`}>{t.kind === 'ajuste' ? <Money c={t.amount_cents} sign /> : `${sign}${brl(t.amount_cents)}`}</div>
        {withUndo && <button className="btn small" onClick={() => undo(t)}>Desfazer</button>}
      </div>
    );
  };
  return (
    <div className="stack">
      {recent.length > 0 && (
        <section className="card">
          <div className="card-h"><h3>Registrados recentemente</h3><small>errou? desfaça</small></div>
          {recent.map((t) => row(t, true))}
        </section>
      )}
      <section className="card">
        <Field label="Buscar"><input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Descrição, categoria ou observação" /></Field>
        <div className="tabs-scroll" style={{ marginTop: 10, marginBottom: 0 }}>
          <Seg value={null} onChange={preset} options={[['7', 'Últimos 7 dias'], ['30', '30 dias'], ['mes', 'Este mês'], ['tudo', 'Tudo']]} />
        </div>
        <details className="more" style={{ marginTop: 10 }}>
          <summary>Filtros</summary>
          <div className="inner form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <Field label="De"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Até"><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Field label="Tipo"><select className="input" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Todos</option>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Categoria"><select className="input" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Todas</option><option value="sem">Sem categoria</option>{data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (arquivada)' : ''}</option>)}</select></Field>
            <Field label="Conta"><select className="input" value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">Todas</option>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <Field label="Situação"><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todas</option><option value="realizado">Pago/recebido</option><option value="previsto">Previsto/a pagar</option><option value="cancelado">Pulado</option></select></Field>
          </div>
        </details>
        <div className="row wrap" style={{ margin: '12px 0 4px' }}>
          <span className="chip ok">Entrou {brl(totIn)}</span>
          <span className="chip bad">Saiu {brl(totOut)}</span>
          <span className="chip">{rows.length} lançamento(s)</span>
        </div>
        {!rows.length && <p className="empty">Nada neste período. Use o botão + para registrar.</p>}
        <div className="list">{rows.slice(0, 200).map((t) => row(t, false))}</div>
        {rows.length > 200 && <p className="hint">Mostrando 200 de {rows.length}. Use os filtros para refinar.</p>}
      </section>
      {edit && <EditTx tx={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function Calendar() {
  const { data, today } = useApp();
  const [base, setBase] = useState(startOfMonth(today));
  const [sel, setSel] = useState(today);
  const [occ, setOcc] = useState(null);
  const [edit, setEdit] = useState(null);
  const from = base, to = endOfMonth(base);
  const items = useMemo(() => {
    const real = data.transactions.filter((t) => t.date >= from && t.date <= to && (t.kind === 'despesa' || t.kind === 'receita') && t.status !== 'cancelado');
    return [...real, ...C.virtualOccurrences(data, from, to)];
  }, [data, from, to]);
  const proj = useMemo(() => (to >= today ? B.projection(data, today, to) : null), [data, today, to]);
  const projBy = new Map((proj?.days || []).map((d) => [d.date, d.balance]));
  const byDay = new Map();
  for (const it of items) byDay.set(it.date, [...(byDay.get(it.date) || []), it]);
  const cells = [];
  for (let i = 0; i < dayOfWeek(from); i++) cells.push(null);
  for (let d = 1; d <= parts(to).d; d++) cells.push(`${base.slice(0, 8)}${String(d).padStart(2, '0')}`);
  const dayItems = byDay.get(sel) || [];
  return (
    <section className="card">
      <div className="row between" style={{ marginBottom: 12 }}>
        <button className="btn small" onClick={() => setBase(addMonths(base, -1, 1))} aria-label="Mês anterior">‹</button>
        <h2>{monthLabel(monthKey(base), true)}</h2>
        <button className="btn small" onClick={() => setBase(addMonths(base, 1, 1))} aria-label="Próximo mês">›</button>
      </div>
      {proj && (
        <p className="hint">Saldo atual nas contas de gasto: <b>{brl(proj.start)}</b>. Saldo projetado (se tudo previsto acontecer) no fim do mês: <b className={projBy.get(to) < 0 ? 'bad' : ''}>{brl(projBy.get(to))}</b>{proj.min.balance < 0 ? <> · <span className="bad">fica negativo em {formatBR(proj.min.date)}</span></> : ''}.</p>
      )}
      <div className="cal">
        {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((w) => <div className="wd" key={w}>{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`p${i}`} />;
          const its = byDay.get(d) || [];
          const pb = projBy.get(d);
          return (
            <button key={d} className={`d ${d === today ? 'today' : ''} ${d === sel ? 'sel' : ''}`} onClick={() => setSel(d)} aria-label={`${formatBR(d)}: ${its.length} item(s)`}>
              <b>{parts(d).d}</b>
              <div className="marks">{its.slice(0, 4).map((x) => <span key={x.id} className="m" style={{ background: x.kind === 'receita' ? 'var(--ok)' : x.status === 'realizado' ? 'var(--faint)' : d < today ? 'var(--bad)' : 'var(--warn)' }} />)}</div>
              {pb != null && its.length > 0 && <span className={`sum num ${pb < 0 ? 'bad' : ''}`}>{brl(pb).replace('R$ ', '')}</span>}
            </button>
          );
        })}
      </div>
      <div className="legend"><span><i style={{ background: 'var(--warn)' }} />A pagar</span><span><i style={{ background: 'var(--bad)' }} />Atrasada</span><span><i style={{ background: 'var(--faint)' }} />Paga</span><span><i style={{ background: 'var(--ok)' }} />Entrada</span><span>número = saldo projetado</span></div>
      <hr />
      <div className="row between"><h3>{formatBR(sel)}</h3>{projBy.has(sel) && <small>projetado: <b className="num">{brl(projBy.get(sel))}</b></small>}</div>
      {!dayItems.length && <p className="muted">Nada neste dia.</p>}
      <div className="list">
        {dayItems.map((x) => (
          <div key={x.id} className="item">
            <div className="grow">
              <div className="t">{x.description || KIND[x.kind]}</div>
              <div className="s">{x.kind === 'receita' ? 'Entrada' : 'Conta'} · {statusLabel(x) || 'prevista'}{x.virtual ? ' · fixa' : ''}</div>
            </div>
            <div className={`amt num ${x.kind === 'receita' ? 'ok' : ''}`}>{brl(x.amount_cents)}</div>
            <button className="btn small" onClick={() => (x.virtual ? setOcc(x) : setEdit(x))}>Abrir</button>
          </div>
        ))}
      </div>
      {occ && <OccurrenceModal occ={occ} onClose={() => setOcc(null)} />}
      {edit && <EditTx tx={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

export function MonthSummary() {
  const { data, today } = useApp();
  const [key, setKey] = useState(monthKey(today));
  const prevKey = monthKey(addMonths(`${key}-01`, -1, 1));
  const r = useMemo(() => B.monthCompare(data, key, prevKey), [data, key, prevKey]);
  const diff = (a, b) => (b ? `${a >= b ? '▲' : '▼'} ${brl(Math.abs(a - b))}` : '');
  return (
    <section className="card">
      <div className="row between" style={{ marginBottom: 12 }}>
        <button className="btn small" onClick={() => setKey(prevKey)} aria-label="Mês anterior">‹</button>
        <h2>Fechamento de {monthLabel(key, true)}</h2>
        <button className="btn small" onClick={() => setKey(monthKey(addMonths(`${key}-01`, 1, 1)))} aria-label="Próximo mês">›</button>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="l">Entrou</div><div className="v num ok">{brl(r.cur.income)}</div><small className="muted">{diff(r.cur.income, r.prev.income)} vs {monthLabel(prevKey)}</small></div>
        <div className="kpi"><div className="l">Saiu</div><div className="v num">{brl(r.cur.expenses)}</div><small className="muted">{diff(r.cur.expenses, r.prev.expenses)}</small></div>
        <div className="kpi"><div className="l">Guardado</div><div className="v num">{brl(r.cur.saved)}</div><small className="muted">{diff(r.cur.saved, r.prev.saved)}</small></div>
        <div className="kpi"><div className="l">Sobrou</div><div className={`v num ${r.cur.income - r.cur.expenses < 0 ? 'bad' : ''}`}>{brl(r.cur.income - r.cur.expenses)}</div></div>
      </div>
      <h3 style={{ marginTop: 18 }}>Onde os gastos mudaram</h3>
      {!r.rows.length && <p className="muted">Sem gastos nesses meses.</p>}
      {r.rows.slice(0, 10).map((x) => (
        <div className="item" key={x.category_id || 'sem'}>
          <div className="dot" aria-hidden="true">{x.icon || '•'}</div>
          <div className="grow"><div className="t">{x.name}</div><div className="s">{brl(x.prev)} → {brl(x.cur)}</div></div>
          <div className={`amt num ${x.delta > 0 ? 'bad' : x.delta < 0 ? 'ok' : 'muted'}`}>{x.delta > 0 ? '▲ ' : x.delta < 0 ? '▼ ' : ''}{brl(Math.abs(x.delta))}</div>
        </div>
      ))}
    </section>
  );
}

export default function Movimentacoes() {
  const { route, go, data, open } = useApp();
  const tab = route.sub || 'lista';
  const has = data.transactions.length || data.recurrences.length;
  return (
    <>
      <TopBar title="Movimentações" />
      <div className="tabs-scroll">
        <Seg value={tab} onChange={(t) => go(`movimentacoes/${t}`)} options={[['lista', 'Lista'], ['calendario', 'Calendário'], ['fixos', 'Fixos'], ['parcelas', 'Parcelas'], ['mes', 'Mês']]} />
      </div>
      {!has && tab === 'lista' ? (
        <EmptyCta icon="⇅" title="Nenhuma movimentação ainda" text="Registre o que entrou ou saiu. Valores pequenos também contam."
          action={<button className="btn primary" onClick={() => open('novo')}>+ Registrar</button>} />
      ) : (
        <>
          {tab === 'lista' && <List />}
          {tab === 'calendario' && <Calendar />}
          {tab === 'fixos' && <Fixos />}
          {tab === 'parcelas' && <Installments />}
          {tab === 'mes' && <MonthSummary />}
        </>
      )}
    </>
  );
}
