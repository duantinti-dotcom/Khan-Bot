import { useState } from 'react';
import { useApp } from '../App.jsx';
import { post } from '../api.js';
import { parts } from '@shared/dates.js';
import { Modal, Field, MoneyInput, inputToCents, Seg, brl, useSubmit, useToast } from '../ui.jsx';
import { AccountSelect, FrequencyFields } from './Recebi.jsx';
import { withAllocCheck } from '../actions.js';

export function CategoryPicker({ value, onChange, categories }) {
  return (
    <div className="row wrap" role="radiogroup" aria-label="Categoria">
      {categories.map((c) => (
        <button type="button" key={c.id} role="radio" aria-checked={value === c.id} className={`chip ${value === c.id ? 'info' : ''}`}
          style={{ cursor: 'pointer', padding: '8px 12px', fontSize: '0.9rem', borderColor: value === c.id ? c.color : undefined }} onClick={() => onChange(c.id)}>
          {c.icon} {c.name}
        </button>
      ))}
    </div>
  );
}

export default function Gastei({ onClose, mode: initialMode = 'despesa' }) {
  const { data, today, reload } = useApp();
  const toast = useToast();
  const accounts = data.accounts.filter((a) => !a.archived);
  const cats = data.categories.filter((c) => !c.archived);
  const [mode, setMode] = useState(initialMode);
  const [kind, setKind] = useState('unica');
  const [amount, setAmount] = useState('');
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

  const s = useSubmit(async () => {
    const cents = inputToCents(amount);
    if (!cents || cents <= 0) throw new Error('Informe um valor maior que zero.');
    if (!account) throw new Error('Cadastre uma conta primeiro.');
    const description = desc.trim() || cats.find((c) => c.id === cat)?.name || null;
    if (mode === 'reembolso') {
      await post('/transactions', { kind: 'reembolso', amount_cents: cents, date, account_id: account, category_id: cat, status: 'realizado', description: description ? `Reembolso: ${description}` : 'Reembolso', note: note || null });
      await reload();
      toast('Reembolso registrado: reduz o gasto da categoria, não conta como renda.');
      return onClose();
    }
    if (paid && date > today) throw new Error('Para uma data futura, marque como “a pagar”.');
    if (kind === 'recorrente') {
      const r = await post('/recurrences', { kind: 'despesa', amount_cents: cents, description: description || 'Despesa fixa', frequency: freq, day_of_month: freq === 'mensal' ? Number(day) || parts(date).d : null, start_date: date, account_id: account, category_id: cat, note: note || null });
      if (paid) {
        // Paga só a primeira ocorrência; se a pessoa recusar usar dinheiro de metas, a recorrência continua cadastrada e a conta fica pendente.
        await withAllocCheck((withdraw) => post(`/recurrences/${r.id}/occurrence`, { occurrence_date: date, action: 'realizar', date: date > today ? today : date, withdraw_from_goals: withdraw }))
          .catch((e) => { if (!e.cancelled) throw e; toast('Recorrência criada; o primeiro vencimento ficou pendente.'); });
      }
      await reload();
      toast('Despesa recorrente cadastrada.');
      return onClose();
    }
    await withAllocCheck(async (withdraw) => {
      if (kind === 'unica') {
        return post('/transactions', { kind: 'despesa', amount_cents: cents, date, account_id: account, category_id: cat, status: paid ? 'realizado' : 'previsto', description, note: note || null, withdraw_from_goals: withdraw });
      }
      const parcels = Number(n);
      if (!(parcels >= 2 && parcels <= 72)) throw new Error('Parcelas entre 2 e 72.');
      const total = totalMode === 'total' ? cents : cents * parcels;
      return post('/transactions/installments', { description: description || 'Compra parcelada', total_cents: total, n: parcels, first_date: date, account_id: account, category_id: cat, first_paid: paid && date <= today, note: note || null, withdraw_from_goals: withdraw });
    });
    await reload();
    toast('Gasto registrado.');
    onClose();
  });

  const parcelPreview = kind === 'parcelada' && inputToCents(amount) > 0 && Number(n) >= 2
    ? (totalMode === 'total' ? `${n}x de cerca de ${brl(Math.round(inputToCents(amount) / Number(n)))}` : `Total de ${brl(inputToCents(amount) * Number(n))}`) : null;

  return (
    <Modal title={mode === 'reembolso' ? 'Recebi um reembolso' : 'Gastei'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); s.run().catch(() => {}); }}>
        <Seg value={mode} onChange={setMode} label="Tipo de lançamento" options={[['despesa', 'Despesa'], ['reembolso', 'Reembolso']]} />
        <MoneyInput huge value={amount} onChange={setAmount} autoFocus />
        {mode === 'despesa' && <Seg value={kind} onChange={setKind} label="Forma" options={[['unica', 'Única'], ['recorrente', 'Recorrente'], ['parcelada', 'Parcelada']]} />}
        <Field label="Categoria"><CategoryPicker value={cat} onChange={setCat} categories={cats} /></Field>
        <div className="form-grid">
          <Field label={kind === 'parcelada' ? 'Data da 1ª parcela' : kind === 'recorrente' ? 'Primeiro vencimento' : 'Data'}><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <AccountSelect value={account} onChange={setAccount} accounts={accounts} label={mode === 'reembolso' ? 'Entrou em' : 'Pago com'} />
          {kind === 'recorrente' && mode === 'despesa' && <FrequencyFields freq={freq} setFreq={setFreq} day={day} setDay={setDay} />}
          {kind === 'parcelada' && mode === 'despesa' && (
            <>
              <Field label="Número de parcelas"><input className="input" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ''))} /></Field>
              <Field label="O valor digitado é"><select className="input" value={totalMode} onChange={(e) => setTotalMode(e.target.value)}><option value="total">o total da compra</option><option value="parcela">o valor de cada parcela</option></select></Field>
              {parcelPreview && <p className="hint full">{parcelPreview}. As parcelas são gravadas uma única vez, mês a mês.</p>}
            </>
          )}
          <Field label="Descrição" full><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: cinema, Uber, lanche" /></Field>
          <Field label="Observação (opcional)" full><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {mode === 'despesa' && (
            <label className="check full"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />{kind === 'unica' ? 'Já paguei' : kind === 'recorrente' ? 'Já paguei este primeiro vencimento' : 'Já paguei a 1ª parcela'}</label>
          )}
        </div>
        {mode === 'reembolso' && <p className="hint">Reembolso devolve dinheiro de um gasto (ex.: amigo pagou a parte dele). Ele reduz o gasto da categoria e não é contado como renda.</p>}
        {s.error && <p className="err" role="alert">{s.error}</p>}
        <button className="btn primary block" disabled={s.busy}>{s.busy ? 'Salvando…' : 'Salvar'}</button>
      </form>
    </Modal>
  );
}
