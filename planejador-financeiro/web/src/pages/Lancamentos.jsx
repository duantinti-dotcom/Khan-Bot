import { useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import { put, del, post } from '../api.js';
import * as C from '@shared/calc.js';
import {
  formatBR, addDays, startOfMonth, endOfMonth, addMonths, monthKey, monthLabel, parts, dayOfWeek, diffDays,
} from '@shared/dates.js';
import { Modal, Field, MoneyInput, inputToCents, centsToInput, Seg, brl, Money, Progress, useSubmit, useToast, Alert, Empty } from '../ui.jsx';
import { CategoryPicker } from '../forms/Gastei.jsx';
import { AccountSelect } from '../forms/Recebi.jsx';
import { settle, skipOccurrence, withAllocCheck } from '../actions.js';
import { FREQUENCIAS } from '@shared/recurrence.js';

const KIND_LABEL = { receita: 'Entrada', despesa: 'Despesa', transferencia: 'Transferência', ajuste: 'Ajuste de saldo', reembolso: 'Reembolso' };
const STATUS_LABEL = { realizado: { receita: 'recebido', despesa: 'pago', reembolso: 'recebido', transferencia: 'feita', ajuste: '' }, previsto: { receita: 'previsto', despesa: 'a pagar' }, cancelado: { receita: 'pulado', despesa: 'pulado' } };

function txSign(t) {
  if (t.kind === 'despesa') return -1;
  if (t.kind === 'transferencia') return 0;
  return 1;
}

export function EditTx({ tx, onClose }) {
  const { data, today, reload } = useApp();
  const toast = useToast();
  const [amount, setAmount] = useState(centsToInput(tx.amount_cents));
  const [date, setDate] = useState(tx.date);
  const [desc, setDesc] = useState(tx.description || '');
  const [cat, setCat] = useState(tx.category_id);
  const [account, setAccount] = useState(tx.account_id);
  const [to, setTo] = useState(tx.to_account_id);
  const [status, setStatus] = useState(tx.status);
  const [note, setNote] = useState(tx.note || '');
  const accounts = data.accounts;
  const s = useSubmit(async () => {
    const cents = inputToCents(amount);
    if (!cents || cents <= 0) throw new Error('Valor inválido.');
    await withAllocCheck((w) => put(`/transactions/${tx.id}`, {
      amount_cents: cents, date, description: desc.trim() || null, category_id: tx.kind === 'transferencia' ? null : cat,
      account_id: account, to_account_id: tx.kind === 'transferencia' ? to : null, status, note: note.trim() || null, withdraw_from_goals: w,
    }));
    await reload(); toast('Alterações salvas.'); onClose();
  });
  const remove = async (scope) => {
    if (!window.confirm(scope === 'group' ? 'Excluir esta e as parcelas ainda não pagas?' : 'Excluir este lançamento?')) return;
    try {
      await withAllocCheck((w) => del(`/transactions/${tx.id}?${scope === 'group' ? 'scope=group&' : ''}${w ? 'withdraw=1' : ''}`));
      await reload(); toast('Excluído.'); onClose();
    } catch (e) { if (!e.cancelled) alert(e.message); }
  };
  if (tx.kind === 'ajuste') {
    return (
      <Modal title="Ajuste de saldo" onClose={onClose}>
        <p>Ajuste de <Money c={tx.amount_cents} sign /> em {formatBR(tx.date)}. Ajustes guardam o histórico de quando você corrigiu o saldo; para mudar, use “Atualizar saldo” em Meu dinheiro.</p>
        <button className="btn danger" onClick={() => remove()}>Excluir ajuste</button>
      </Modal>
    );
  }
  return (
    <Modal title={`Editar ${KIND_LABEL[tx.kind].toLowerCase()}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); s.run().catch(() => {}); }}>
        <MoneyInput huge value={amount} onChange={setAmount} />
        {tx.kind !== 'transferencia' && tx.kind !== 'reembolso' && (
          <Seg value={status} onChange={setStatus} options={tx.kind === 'receita' ? [['realizado', 'Recebido'], ['previsto', 'Previsto']] : [['realizado', 'Pago'], ['previsto', 'A pagar']]} />
        )}
        {tx.kind !== 'transferencia' && <Field label="Categoria"><CategoryPicker value={cat} onChange={setCat} categories={data.categories.filter((c) => !c.archived || c.id === cat)} /></Field>}
        <div className="form-grid">
          <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <AccountSelect value={account} onChange={setAccount} accounts={accounts} label={tx.kind === 'transferencia' ? 'De' : 'Conta'} />
          {tx.kind === 'transferencia' && <AccountSelect value={to} onChange={setTo} accounts={accounts} label="Para" />}
          <Field label="Descrição" full><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <Field label="Observação" full><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        {tx.installment_group && <p className="hint">Parcela {tx.installment_no}/{tx.installment_total}. A edição vale só para esta parcela.</p>}
        {tx.recurrence_id && <p className="hint">Ocorrência de {formatBR(tx.occurrence_date)} de uma recorrência. A edição vale só para ela.</p>}
        {status === 'realizado' && date > today && <p className="err">Data futura: marque como previsto/a pagar.</p>}
        {s.error && <p className="err">{s.error}</p>}
        <div className="row wrap">
          <button type="button" className="btn danger" onClick={() => remove()}>Excluir</button>
          {tx.installment_group && <button type="button" className="btn danger" onClick={() => remove('group')}>Excluir parcelas futuras</button>}
          <div className="spacer" />
          <button className="btn primary" disabled={s.busy}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

export function OccurrenceModal({ occ, onClose }) {
  const { data, today, reload } = useApp();
  const toast = useToast();
  const rec = data.recurrences.find((r) => r.id === occ.recurrence_id);
  const [amount, setAmount] = useState(centsToInput(occ.amount_cents));
  const [date, setDate] = useState(occ.date);
  const [scope, setScope] = useState('so_esta');
  const s = useSubmit(async (action) => {
    const cents = inputToCents(amount);
    if (action === 'realizar') {
      await settle(occ, today, { amount_cents: cents });
    } else if (action === 'pular') {
      await skipOccurrence(occ);
    } else if (scope === 'so_esta') {
      await post(`/recurrences/${occ.recurrence_id}/occurrence`, { occurrence_date: occ.occurrence_date, action: 'editar', amount_cents: cents, date });
    } else {
      const changes = { amount_cents: cents };
      if (rec.frequency === 'mensal' && date !== occ.date) changes.day_of_month = parts(date).d;
      await post(`/recurrences/${occ.recurrence_id}/split`, { from_date: occ.occurrence_date, changes });
    }
    await reload(); toast('Feito.'); onClose();
  });
  const isIncome = occ.kind === 'receita';
  return (
    <Modal title={rec?.description || 'Ocorrência'} onClose={onClose}>
      <div className="stack">
        <p className="muted">{isIncome ? 'Entrada' : 'Conta'} recorrente ({FREQUENCIAS[rec?.frequency]?.label.toLowerCase()}) prevista para {formatBR(occ.occurrence_date)}.</p>
        <MoneyInput huge value={amount} onChange={setAmount} />
        <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Seg value={scope} onChange={setScope} options={[['so_esta', 'Alterar só esta'], ['proximas', 'Esta e as próximas']]} />
        {s.error && <p className="err">{s.error}</p>}
        <div className="row wrap">
          <button className="btn" disabled={s.busy} onClick={() => s.run('pular').catch(() => {})}>Pular esta</button>
          <button className="btn" disabled={s.busy} onClick={() => s.run('editar').catch(() => {})}>Salvar alteração</button>
          <div className="spacer" />
          <button className="btn primary" disabled={s.busy || date > today} onClick={() => s.run('realizar').catch(() => {})}>{isIncome ? 'Recebi' : 'Paguei'}</button>
        </div>
        {date > today && <p className="hint">Para marcar como {isIncome ? 'recebida' : 'paga'}, a data precisa ser hoje ou antes.</p>}
      </div>
    </Modal>
  );
}

function History() {
  const { data, today } = useApp();
  const [month, setMonth] = useState(monthKey(today));
  const [kind, setKind] = useState('');
  const [cat, setCat] = useState('');
  const [acc, setAcc] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const accs = new Map(data.accounts.map((a) => [a.id, a]));
  const months = useMemo(() => {
    const set = new Set(data.transactions.map((t) => monthKey(t.date)));
    set.add(monthKey(today));
    return [...set].sort().reverse();
  }, [data, today]);
  const rows = data.transactions.filter((t) => (month === 'todos' || monthKey(t.date) === month)
    && (!kind || t.kind === kind) && (!cat || t.category_id === cat) && (!acc || t.account_id === acc || t.to_account_id === acc)
    && (!status || t.status === status) && (!q || `${t.description || ''} ${t.note || ''}`.toLowerCase().includes(q.toLowerCase())));
  const totIn = rows.filter((t) => t.kind === 'receita' && t.status === 'realizado').reduce((s, t) => s + t.amount_cents, 0);
  const totOut = rows.filter((t) => t.kind === 'despesa' && t.status === 'realizado').reduce((s, t) => s + t.amount_cents, 0)
    - rows.filter((t) => t.kind === 'reembolso' && t.status === 'realizado').reduce((s, t) => s + t.amount_cents, 0);
  return (
    <section className="card">
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Field label="Mês"><select className="input" value={month} onChange={(e) => setMonth(e.target.value)}><option value="todos">Todos</option>{months.map((m) => <option key={m} value={m}>{monthLabel(m, true)}</option>)}</select></Field>
        <Field label="Tipo"><select className="input" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Todos</option>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Categoria"><select className="input" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Todas</option>{data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Conta"><select className="input" value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">Todas</option>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Situação"><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todas</option><option value="realizado">Pago/recebido</option><option value="previsto">Previsto/a pagar</option><option value="cancelado">Pulado</option></select></Field>
        <Field label="Buscar"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="descrição" /></Field>
      </div>
      <div className="row wrap" style={{ margin: '12px 0' }}>
        <span className="chip ok">Entradas recebidas {brl(totIn)}</span>
        <span className="chip bad">Gastos pagos {brl(totOut)}</span>
        <span className="chip">{rows.length} lançamento(s)</span>
      </div>
      {!rows.length && <Empty>Nenhum lançamento com esses filtros.</Empty>}
      <div className="list">
        {rows.map((t) => {
          const c = cats.get(t.category_id);
          const sign = txSign(t);
          return (
            <button key={t.id} className="item" style={{ background: 'none', border: 0, borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => setEdit(t)}>
              <div className="dot" aria-hidden="true">{t.kind === 'transferencia' ? '⇄' : t.kind === 'receita' ? '↓' : t.kind === 'ajuste' ? '≈' : c?.icon || '•'}</div>
              <div className="grow">
                <div className="t">{t.description || c?.name || KIND_LABEL[t.kind]}</div>
                <div className="s">{formatBR(t.date)} · {t.kind === 'transferencia' ? `${accs.get(t.account_id)?.name} → ${accs.get(t.to_account_id)?.name}` : accs.get(t.account_id)?.name}{c && t.kind !== 'receita' ? ` · ${c.name}` : ''}{t.status !== 'realizado' ? ` · ${STATUS_LABEL[t.status][t.kind] || t.status}` : ''}</div>
              </div>
              <div className={`amt num ${t.status !== 'realizado' ? 'faint' : sign < 0 ? '' : sign > 0 ? 'ok' : 'muted'}`}>
                {t.kind === 'ajuste' ? <Money c={t.amount_cents} sign /> : `${sign < 0 ? '−' : sign > 0 ? '+' : ''}${brl(t.amount_cents)}`}
              </div>
            </button>
          );
        })}
      </div>
      {edit && <EditTx tx={edit} onClose={() => setEdit(null)} />}
    </section>
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
    const virt = C.virtualOccurrences(data, from, to);
    return [...real, ...virt];
  }, [data, from, to]);
  const byDay = new Map();
  for (const it of items) byDay.set(it.date, [...(byDay.get(it.date) || []), it]);
  const startPad = dayOfWeek(from);
  const total = parts(to).d;
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(`${base.slice(0, 8)}${String(d).padStart(2, '0')}`);
  const dayItems = byDay.get(sel) || [];
  const monthOut = items.filter((i) => i.kind === 'despesa').reduce((s, i) => s + i.amount_cents, 0);
  return (
    <section className="card">
      <div className="row between" style={{ marginBottom: 12 }}>
        <button className="btn small" onClick={() => setBase(addMonths(base, -1, 1))} aria-label="Mês anterior">‹</button>
        <h2>{monthLabel(monthKey(base), true)}</h2>
        <button className="btn small" onClick={() => setBase(addMonths(base, 1, 1))} aria-label="Próximo mês">›</button>
      </div>
      <div className="cal">
        {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((w) => <div className="wd" key={w}>{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`p${i}`} />;
          const its = byDay.get(d) || [];
          const out = its.filter((x) => x.kind === 'despesa').reduce((s, x) => s + x.amount_cents, 0);
          return (
            <button key={d} className={`d ${d === today ? 'today' : ''} ${d === sel ? 'sel' : ''}`} onClick={() => setSel(d)} aria-label={`${formatBR(d)}: ${its.length} item(s)`}>
              <b>{parts(d).d}</b>
              <div className="marks">{its.slice(0, 4).map((x) => <span key={x.id} className="m" style={{ background: x.kind === 'receita' ? 'var(--ok)' : x.status === 'realizado' ? 'var(--faint)' : d < today ? 'var(--bad)' : 'var(--warn)' }} />)}</div>
              {out > 0 && <span className="sum num">{brl(out).replace('R$ ', '')}</span>}
            </button>
          );
        })}
      </div>
      <div className="legend"><span><i style={{ background: 'var(--warn)' }} />A pagar</span><span><i style={{ background: 'var(--bad)' }} />Atrasada</span><span><i style={{ background: 'var(--faint)' }} />Paga</span><span><i style={{ background: 'var(--ok)' }} />Entrada</span></div>
      <p className="hint">Total de despesas no mês (pagas e a pagar): {brl(monthOut)}</p>
      <hr />
      <h3>{formatBR(sel)}</h3>
      {!dayItems.length && <p className="muted">Nada neste dia.</p>}
      <div className="list">
        {dayItems.map((x) => (
          <div key={x.id} className="item">
            <div className="grow">
              <div className="t">{x.description || KIND_LABEL[x.kind]}</div>
              <div className="s">{x.kind === 'receita' ? 'Entrada' : 'Conta'} · {x.status === 'realizado' ? (x.kind === 'receita' ? 'recebida' : 'paga') : x.kind === 'receita' ? 'prevista' : 'a pagar'}{x.virtual ? ' · recorrente' : ''}</div>
            </div>
            <div className="amt num">{brl(x.amount_cents)}</div>
            <button className="btn small" onClick={() => (x.virtual ? setOcc(x) : setEdit(x))}>Abrir</button>
          </div>
        ))}
      </div>
      {occ && <OccurrenceModal occ={occ} onClose={() => setOcc(null)} />}
      {edit && <EditTx tx={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function Recurring() {
  const { data, today, reload } = useApp();
  const toast = useToast();
  const [occ, setOcc] = useState(null);
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const upcoming = useMemo(() => C.virtualOccurrences(data, addDays(today, -C.LOOKBACK_DIAS), addDays(today, 45)), [data, today]);
  const active = data.recurrences.filter((r) => r.active && (!r.end_date || r.end_date >= today));
  const stop = async (r) => {
    if (!window.confirm(`Encerrar “${r.description}”? Ocorrências já registradas continuam no histórico.`)) return;
    await put(`/recurrences/${r.id}`, { end_date: addDays(today, -1) < r.start_date ? r.start_date : addDays(today, -1), active: addDays(today, -1) >= r.start_date });
    await reload(); toast('Recorrência encerrada.');
  };
  return (
    <div className="grid two">
      <section className="card">
        <div className="card-h"><h2>Próximas ocorrências</h2><small>45 dias</small></div>
        {!upcoming.length && <Empty>Nenhuma ocorrência pendente.</Empty>}
        <div className="list">
          {upcoming.map((o) => (
            <div key={o.id} className="item">
              <div className="dot">{o.kind === 'receita' ? '↓' : cats.get(o.category_id)?.icon || '•'}</div>
              <div className="grow"><div className="t">{o.description}</div><div className={`s ${o.date < today ? 'bad' : ''}`}>{formatBR(o.date)}{o.date < today ? ' · atrasada' : ''} · {o.kind === 'receita' ? 'entrada prevista' : 'a pagar'}</div></div>
              <div className={`amt num ${o.kind === 'receita' ? 'ok' : ''}`}>{brl(o.amount_cents)}</div>
              <button className="btn small" onClick={() => setOcc(o)}>Abrir</button>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <div className="card-h"><h2>Recorrências ativas</h2></div>
        {!active.length && <Empty>Nenhuma. Cadastre em “Recebi” ou “Gastei” marcando que se repete.</Empty>}
        <div className="list">
          {active.map((r) => (
            <div key={r.id} className="item">
              <div className="grow">
                <div className="t">{r.description}{r.is_main_income && <span className="chip info" style={{ marginLeft: 6 }}>renda principal</span>}</div>
                <div className="s">{r.kind === 'receita' ? 'Entrada' : 'Despesa'} · {FREQUENCIAS[r.frequency].label}{r.frequency === 'mensal' ? ` · dia ${r.day_of_month}` : ''} · desde {formatBR(r.start_date)}{r.end_date ? ` até ${formatBR(r.end_date)}` : ''}</div>
              </div>
              <div className="amt num">{brl(r.amount_cents)}</div>
              <button className="btn small ghost" onClick={() => stop(r)}>Encerrar</button>
            </div>
          ))}
        </div>
        <p className="hint">Ocorrências são calculadas a partir da regra e só viram lançamento quando você paga, edita ou pula. Por isso abrir o app não duplica nada. Para mudar o valor a partir de uma data, abra uma ocorrência e escolha “Esta e as próximas”.</p>
      </section>
      {occ && <OccurrenceModal occ={occ} onClose={() => setOcc(null)} />}
    </div>
  );
}

function Installments() {
  const { data, today } = useApp();
  const [edit, setEdit] = useState(null);
  const groups = new Map();
  for (const t of data.transactions) if (t.installment_group) groups.set(t.installment_group, [...(groups.get(t.installment_group) || []), t]);
  const list = [...groups.values()].map((g) => g.sort((a, b) => a.installment_no - b.installment_no));
  const future = data.transactions.filter((t) => t.installment_group && t.status === 'previsto').sort((a, b) => (a.date < b.date ? -1 : 1));
  const byMonth = new Map();
  for (const t of future) byMonth.set(monthKey(t.date), (byMonth.get(monthKey(t.date)) || 0) + t.amount_cents);
  return (
    <div className="grid two">
      <section className="card">
        <div className="card-h"><h2>Parcelas futuras por mês</h2></div>
        {!byMonth.size && <Empty>Sem parcelas a pagar.</Empty>}
        {[...byMonth.entries()].map(([k, v]) => <div key={k} className="row between item"><span>{monthLabel(k, true)}</span><b className="num">{brl(v)}</b></div>)}
      </section>
      <section className="card">
        <div className="card-h"><h2>Compras parceladas</h2></div>
        {!list.length && <Empty>Nenhuma compra parcelada. Use “Gastei” → Parcelada.</Empty>}
        {list.map((g) => {
          const paid = g.filter((t) => t.status === 'realizado').length;
          const total = g.reduce((s, t) => s + t.amount_cents, 0);
          const next = g.find((t) => t.status === 'previsto');
          return (
            <div key={g[0].installment_group} className="stack" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="row between"><b>{g[0].description.replace(/ \(\d+\/\d+\)$/, '')}</b><span className="num">{brl(total)}</span></div>
              <Progress value={paid / g.length} />
              <div className="row between"><small>{paid}/{g.length} pagas</small>{next && <button className="btn small" onClick={() => setEdit(next)}>Próxima: {formatBR(next.date)} · {brl(next.amount_cents)}</button>}</div>
            </div>
          );
        })}
      </section>
      {edit && <EditTx tx={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function Budget() {
  const { data, today, reload } = useApp();
  const toast = useToast();
  const [key, setKey] = useState(monthKey(today));
  const rows = useMemo(() => C.categoryMonth(data, today, key), [data, today, key]);
  const [editing, setEditing] = useState(null);
  const [val, setVal] = useState('');
  const [newCat, setNewCat] = useState('');
  const saveLimit = async (c) => {
    const v = val.trim() === '' ? null : inputToCents(val);
    if (v !== null && (v == null || v < 0)) return alert('Valor inválido');
    await put(`/categories/${c.id}`, { monthly_limit_cents: v });
    setEditing(null); await reload(); toast('Limite salvo.');
  };
  const totalLimit = rows.reduce((s, r) => s + (r.limit || 0), 0);
  const totalPlanned = rows.reduce((s, r) => s + r.planned, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  return (
    <section className="card">
      <div className="row between wrap" style={{ marginBottom: 10 }}>
        <div className="row">
          <button className="btn small" onClick={() => setKey(monthKey(addMonths(`${key}-01`, -1, 1)))}>‹</button>
          <h2>{monthLabel(key, true)}</h2>
          <button className="btn small" onClick={() => setKey(monthKey(addMonths(`${key}-01`, 1, 1)))}>›</button>
        </div>
        <div className="row wrap"><span className="chip">Limites {brl(totalLimit)}</span><span className="chip">Planejado {brl(totalPlanned)}</span><span className="chip">Realizado {brl(totalSpent)}</span></div>
      </div>
      <div className="scroll-x">
        <table className="table">
          <thead><tr><th>Categoria</th><th className="r">Limite</th><th className="r">Realizado</th><th className="r">A pagar</th><th className="r">Planejado − limite</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category.id}>
                <td>{r.category.icon} {r.category.name}{r.category.essential && <span className="chip" style={{ marginLeft: 6 }}>essencial</span>}
                  {r.limit ? <div style={{ marginTop: 6 }}><Progress value={r.ratio} tone={r.over ? 'bad' : r.ratio >= 0.8 ? 'warn' : ''} /></div> : null}</td>
                <td className="r num">{editing === r.category.id
                  ? <div className="row" style={{ justifyContent: 'flex-end' }}><div style={{ width: 130 }}><MoneyInput value={val} onChange={setVal} /></div><button className="btn small primary" onClick={() => saveLimit(r.category)}>OK</button></div>
                  : r.limit != null ? brl(r.limit) : <span className="faint">sem limite</span>}</td>
                <td className="r num">{brl(r.spent)}</td>
                <td className="r num">{brl(r.pending)}</td>
                <td className={`r num ${r.limit != null ? (r.over ? 'bad' : 'ok') : 'faint'}`}>{r.limit != null ? brl(r.planned - r.limit) : '—'}</td>
                <td className="r">{editing !== r.category.id && <button className="btn small ghost" onClick={() => { setEditing(r.category.id); setVal(centsToInput(r.limit)); }}>Limite</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Deixe o limite em branco para remover. Reembolsos reduzem o “realizado” da categoria. Lazer e namoro fazem parte do orçamento: o limite serve para planejar, não para proibir.</p>
      <hr />
      <CategoryManager newCat={newCat} setNewCat={setNewCat} />
    </section>
  );
}

function CategoryManager({ newCat, setNewCat }) {
  const { data, reload } = useApp();
  const toast = useToast();
  const add = async () => {
    if (!newCat.trim()) return;
    try { await post('/categories', { name: newCat.trim(), color: '#94a3b8', sort: 200 }); setNewCat(''); await reload(); toast('Categoria criada.'); } catch (e) { alert(e.message); }
  };
  const upd = async (c, patch) => { try { await put(`/categories/${c.id}`, patch); await reload(); } catch (e) { alert(e.message); } };
  return (
    <div className="stack">
      <h3>Categorias</h3>
      {data.categories.map((c) => (
        <div key={c.id} className="row wrap" style={{ opacity: c.archived ? 0.55 : 1 }}>
          <input type="color" value={c.color} onChange={(e) => upd(c, { color: e.target.value })} aria-label={`Cor de ${c.name}`} style={{ width: 40, height: 36, border: 0, background: 'none' }} />
          <input className="input" style={{ flex: '1 1 160px', minHeight: 40 }} defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && upd(c, { name: e.target.value.trim() })} aria-label="Nome da categoria" />
          <label className="check"><input type="checkbox" checked={c.essential} onChange={(e) => upd(c, { essential: e.target.checked })} />essencial</label>
          <button className="btn small ghost" onClick={() => upd(c, { archived: !c.archived })}>{c.archived ? 'Reativar' : 'Ocultar'}</button>
        </div>
      ))}
      <div className="row"><input className="input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nova categoria" /><button className="btn" onClick={add}>Adicionar</button></div>
      <p className="hint">Categorias essenciais (alimentação, saúde, estudos, transporte) nunca entram nas sugestões de corte do planejador.</p>
    </div>
  );
}

export default function Lancamentos() {
  const { open } = useApp();
  const initial = new URLSearchParams(location.hash.split('?')[1] || '').get('tab') || 'historico';
  const [tab, setTab] = useState(initial);
  return (
    <>
      <div className="topbar">
        <h1>Lançamentos</h1>
        <div className="row wrap">
          <button className="btn" onClick={() => open('gastei')}>− Gastei</button>
          <button className="btn" onClick={() => open('transferir')}>⇄</button>
          <button className="btn primary" onClick={() => open('recebi')}>+ Recebi</button>
        </div>
      </div>
      <div style={{ marginBottom: 14, overflowX: 'auto' }}>
        <Seg value={tab} onChange={setTab} options={[['historico', 'Histórico'], ['calendario', 'Calendário'], ['recorrentes', 'Recorrentes'], ['parcelas', 'Parcelas'], ['orcamento', 'Orçamento']]} />
      </div>
      {tab === 'historico' && <History />}
      {tab === 'calendario' && <Calendar />}
      {tab === 'recorrentes' && <Recurring />}
      {tab === 'parcelas' && <Installments />}
      {tab === 'orcamento' && <Budget />}
    </>
  );
}
