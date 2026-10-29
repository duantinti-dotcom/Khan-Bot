import { useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import { post, get, del } from '../api.js';
import { parts, formatBR } from '@shared/dates.js';
import * as B from '@shared/budget.js';
import { Modal, Field, MoneyInput, inputToCents, Seg, brl, More, useSubmit, useToast } from '../ui.jsx';
import { AccountSelect, FrequencyFields } from './Recebi.jsx';
import { CategoryForm } from '../pages/Categorias.jsx';
import { withAllocCheck } from '../actions.js';

export function CategoryPicker({ value, onChange, categories, onNew }) {
  return (
    <div className="row wrap" role="radiogroup" aria-label="Categoria">
      {categories.map((c) => (
        <button type="button" key={c.id} role="radio" aria-checked={value === c.id} className={`chip ${value === c.id ? 'info' : ''}`}
          style={{ cursor: 'pointer', padding: '9px 12px', fontSize: '0.92rem', borderColor: value === c.id ? c.color : undefined }} onClick={() => onChange(value === c.id ? null : c.id)}>
          {c.icon} {c.name}
        </button>
      ))}
      {onNew && <button type="button" className="chip" style={{ cursor: 'pointer', padding: '9px 12px', fontSize: '0.92rem', borderStyle: 'dashed' }} onClick={onNew}>+ Nova categoria</button>}
    </div>
  );
}

// Desfaz um registro recém-feito apagando exatamente o que foi criado.
export async function undoCreated(created, reload) {
  if (created.recurrence) {
    const d = await get('/data');
    for (const t of d.transactions.filter((x) => x.recurrence_id === created.recurrence)) await del(`/transactions/${t.id}?withdraw=1`);
    await del(`/recurrences/${created.recurrence}`);
  }
  if (created.group) {
    const d = await get('/data');
    for (const t of d.transactions.filter((x) => x.installment_group === created.group)) await del(`/transactions/${t.id}?withdraw=1`);
  }
  for (const id of created.tx || []) await del(`/transactions/${id}?withdraw=1`);
  await reload();
}

export default function Gastei({ onClose, amount: initialAmount }) {
  const { data, today, reload } = useApp();
  const toast = useToast();
  const accounts = data.accounts.filter((a) => !a.archived);
  const cats = data.categories.filter((c) => !c.archived);
  const [mode, setMode] = useState('despesa');
  const [kind, setKind] = useState('unica');
  const [amount, setAmount] = useState(initialAmount ? (initialAmount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
  const [date, setDate] = useState(today);
  const [cat, setCat] = useState(null);
  const [account, setAccount] = useState((accounts.find((a) => a.purpose === 'gastar') || accounts[0])?.id);
  const [paid, setPaid] = useState(true);
  const [desc, setDesc] = useState('');
  const [note, setNote] = useState('');
  const [freq, setFreq] = useState('mensal');
  const [day, setDay] = useState(String(parts(today).d));
  const [n, setN] = useState('3');
  const [totalMode, setTotalMode] = useState('total');
  const [newCat, setNewCat] = useState(false);
  const cents = inputToCents(amount);
  const usage = useMemo(() => B.budgetUsage(data, data.plan), [data]);
  const budgetItem = cat && usage?.items.find((i) => i.type === 'categoria' && i.ref_id === cat);

  const s = useSubmit(async () => {
    if (!cents || cents <= 0) throw new Error('Informe um valor maior que zero.');
    if (!account) throw new Error('Cadastre uma conta primeiro.');
    const description = desc.trim() || cats.find((c) => c.id === cat)?.name || null;
    const created = {};
    if (mode === 'reembolso') {
      const r = await post('/transactions', { kind: 'reembolso', amount_cents: cents, date, account_id: account, category_id: cat, status: 'realizado', description: description ? `Reembolso: ${description}` : 'Reembolso', note: note || null });
      created.tx = [r.id];
    } else {
      if (paid && date > today) throw new Error('Para uma data futura, desmarque “Já paguei”.');
      if (kind === 'recorrente') {
        const r = await post('/recurrences', { kind: 'despesa', amount_cents: cents, description: description || 'Despesa fixa', frequency: freq, day_of_month: freq === 'mensal' ? Number(day) || parts(date).d : null, start_date: date, account_id: account, category_id: cat, note: note || null });
        created.recurrence = r.id;
        if (paid) {
          await withAllocCheck((withdraw) => post(`/recurrences/${r.id}/occurrence`, { occurrence_date: date, action: 'realizar', date: date > today ? today : date, withdraw_from_goals: withdraw }))
            .catch((e) => { if (!e.cancelled) throw e; });
        }
      } else {
        const r = await withAllocCheck(async (withdraw) => {
          if (kind === 'unica') {
            return post('/transactions', { kind: 'despesa', amount_cents: cents, date, account_id: account, category_id: cat, status: paid ? 'realizado' : 'previsto', description, note: note || null, withdraw_from_goals: withdraw });
          }
          const parcels = Number(n);
          if (!(parcels >= 2 && parcels <= 72)) throw new Error('Parcelas entre 2 e 72.');
          const total = totalMode === 'total' ? cents : cents * parcels;
          return post('/transactions/installments', { description: description || 'Compra parcelada', total_cents: total, n: parcels, first_date: date, account_id: account, category_id: cat, first_paid: paid && date <= today, note: note || null, withdraw_from_goals: withdraw });
        });
        if (r.group) created.group = r.group; else created.tx = [r.id];
      }
    }
    await reload();
    toast({ text: mode === 'reembolso' ? 'Reembolso registrado.' : kind === 'recorrente' ? 'Despesa fixa cadastrada.' : 'Gasto registrado.', ok: true, action: { label: 'Desfazer', run: () => undoCreated(created, reload) } });
    onClose();
  });

  const parcelPreview = kind === 'parcelada' && cents > 0 && Number(n) >= 2
    ? (totalMode === 'total' ? `${n}x de cerca de ${brl(Math.round(cents / Number(n)))}` : `Total de ${brl(cents * Number(n))}`) : null;

  return (
    <Modal title={mode === 'reembolso' ? 'Recebi um reembolso' : 'Gasto'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); s.run().catch(() => {}); }}>
        <Field label="Quanto?"><MoneyInput huge value={amount} onChange={setAmount} autoFocus /></Field>
        <Field label="Com o quê?"><CategoryPicker value={cat} onChange={setCat} categories={cats} onNew={() => setNewCat(true)} /></Field>
        {budgetItem && cents > 0 && mode === 'despesa' && (
          <p className={`hint ${budgetItem.left - cents < 0 ? 'warn' : ''}`}>No seu plano, “{budgetItem.name}” tem {brl(budgetItem.left)} restantes; depois deste gasto ficariam {brl(budgetItem.left - cents)}.</p>
        )}
        {mode === 'despesa' && kind === 'unica' && <label className="check"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />Já paguei {paid ? '(sai do saldo agora)' : '(fica como conta a pagar)'}</label>}
        <More label="Mais opções (descrição, data, conta, fixo ou parcelado)">
          <Field label="Descrição"><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: cinema, Uber, lanche" /></Field>
          <div className="form-grid">
            <Field label={kind === 'parcelada' ? 'Data da 1ª parcela' : kind === 'recorrente' ? 'Primeiro vencimento' : 'Data'}><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <AccountSelect value={account} onChange={setAccount} accounts={accounts} label={mode === 'reembolso' ? 'Entrou em' : 'Pago com'} />
          </div>
          <Field label="Tipo"><Seg value={mode} onChange={setMode} label="Tipo de lançamento" options={[['despesa', 'Gasto'], ['reembolso', 'Reembolso (devolveram)']]} /></Field>
          {mode === 'despesa' && <Field label="Se repete?"><Seg value={kind} onChange={setKind} label="Forma" options={[['unica', 'Só desta vez'], ['recorrente', 'Todo mês / fixo'], ['parcelada', 'Parcelado']]} /></Field>}
          {kind === 'recorrente' && mode === 'despesa' && (
            <div className="form-grid">
              <FrequencyFields freq={freq} setFreq={setFreq} day={day} setDay={setDay} />
              <label className="check full"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />Já paguei este primeiro vencimento</label>
            </div>
          )}
          {kind === 'parcelada' && mode === 'despesa' && (
            <div className="form-grid">
              <Field label="Parcelas"><input className="input" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ''))} /></Field>
              <Field label="O valor é"><select className="input" value={totalMode} onChange={(e) => setTotalMode(e.target.value)}><option value="total">o total</option><option value="parcela">cada parcela</option></select></Field>
              {parcelPreview && <p className="hint full">{parcelPreview}, a partir de {formatBR(date)}.</p>}
              <label className="check full"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />Já paguei a 1ª parcela</label>
            </div>
          )}
          {mode === 'reembolso' && <p className="hint">Reembolso é dinheiro devolvido de um gasto (ex.: amigo pagou a parte dele). Reduz o gasto da categoria e não conta como renda.</p>}
          <Field label="Observação"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </More>
        {s.error && <p className="err" role="alert">{s.error}</p>}
        <div className="form-actions"><button className="btn primary" disabled={s.busy}>{s.busy ? 'Salvando…' : 'Salvar gasto'}</button></div>
      </form>
      {newCat && <CategoryForm onClose={() => setNewCat(false)} onSaved={(id) => setCat(id)} />}
    </Modal>
  );
}
