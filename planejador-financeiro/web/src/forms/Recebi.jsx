import { useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import { post } from '../api.js';
import * as C from '@shared/calc.js';
import { parts } from '@shared/dates.js';
import { Modal, Field, MoneyInput, inputToCents, centsToInput, Seg, Alert, brl, useSubmit, useToast } from '../ui.jsx';

export function AccountSelect({ value, onChange, accounts, label = 'Conta', allowEmpty }) {
  return (
    <Field label={label}>
      <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
        {allowEmpty && <option value="">—</option>}
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.institution ? ` · ${a.institution}` : ''}</option>)}
      </select>
    </Field>
  );
}

export function FrequencyFields({ freq, setFreq, day, setDay }) {
  return (
    <>
      <Field label="Frequência">
        <select className="input" value={freq} onChange={(e) => setFreq(e.target.value)}>
          <option value="mensal">Mensal</option><option value="quinzenal">A cada 14 dias</option><option value="semanal">Semanal</option><option value="anual">Anual</option>
        </select>
      </Field>
      {freq === 'mensal' && <Field label="Dia do mês"><input className="input" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} /></Field>}
    </>
  );
}

function SplitStep({ income, onClose }) {
  const { data, today, reload } = useApp();
  const toast = useToast();
  const acc = data.accounts.find((a) => a.id === income.account_id);
  const sug = useMemo(() => C.suggestSplit(data, today, income.amount_cents, { countedInBase: acc?.purpose === 'gastar' ? income.amount_cents : 0 }), [data, today, income, acc]);
  const goals = data.goals.filter((g) => !g.archived && g.kind !== 'reserva');
  const [reserva, setReserva] = useState(centsToInput(sug.reserva));
  const [metas, setMetas] = useState(() => Object.fromEntries(goals.map((g) => [g.id, centsToInput(sug.metas.find((m) => m.goal_id === g.id)?.amount || 0)])));
  const rc = inputToCents(reserva) || 0;
  const mc = Object.values(metas).reduce((s, v) => s + (inputToCents(v) || 0), 0);
  const livre = income.amount_cents - sug.contas - rc - mc;
  const s = useSubmit(async () => {
    if (livre < 0) throw new Error('A soma das separações passa do valor recebido.');
    const items = [];
    if (rc > 0 && sug.reserveGoal) items.push({ goal_id: sug.reserveGoal.id, account_id: income.account_id, amount_cents: rc, date: today, source: 'divisao' });
    for (const [gid, v] of Object.entries(metas)) {
      const c = inputToCents(v) || 0;
      if (c > 0) items.push({ goal_id: gid, account_id: income.account_id, amount_cents: c, date: today, source: 'divisao' });
    }
    if (items.length) await post('/contributions', { items });
    await reload();
    toast(items.length ? 'Separação registrada no seu planejamento.' : 'Tudo certo, nada separado.');
    onClose();
  });
  return (
    <div className="stack">
      <Alert tone="ok">{brl(income.amount_cents)} registrados em {acc?.name}.</Alert>
      <h3>Sugestão de divisão</h3>
      <p className="hint">Baseada na sua situação agora (contas até {new Date(sug.period.end + 'T12:00').toLocaleDateString('pt-BR')}, reserva e aportes pendentes). Ajuste como quiser. É um registro de planejamento: o app não movimenta dinheiro no banco. O valor separado continua em {acc?.name}, só que deixa de aparecer como livre.</p>
      <ul className="hint">{sug.explain.map((e, i) => <li key={i}>{e}</li>)}</ul>
      <div className="calc">
        <div className="ln"><span>Contas e despesas essenciais (fica no saldo para pagá-las)</span><b className="num">{brl(sug.contas)}</b></div>
      </div>
      {sug.reserveGoal && <Field label={`Reserva para imprevistos (${sug.reserveGoal.name})`}><MoneyInput value={reserva} onChange={setReserva} /></Field>}
      {goals.map((g) => <Field key={g.id} label={`Meta: ${g.name}`}><MoneyInput value={metas[g.id]} onChange={(v) => setMetas((x) => ({ ...x, [g.id]: v }))} /></Field>)}
      <div className="calc"><div className="ln"><span>Livre para gastar</span><b className={`num ${livre < 0 ? 'bad' : ''}`}>{brl(livre)}</b></div></div>
      {s.error && <p className="err">{s.error}</p>}
      <div className="row"><button className="btn" onClick={onClose}>Não separar agora</button><div className="spacer" /><button className="btn primary" disabled={s.busy || livre < 0} onClick={() => s.run().catch(() => {})}>Confirmar separação</button></div>
    </div>
  );
}

export default function Recebi({ onClose }) {
  const { data, today, reload } = useApp();
  const toast = useToast();
  const accounts = data.accounts.filter((a) => !a.archived);
  const def = accounts.find((a) => a.purpose === 'gastar') || accounts[0];
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [desc, setDesc] = useState('');
  const [account, setAccount] = useState(def?.id);
  const [status, setStatus] = useState('realizado');
  const [rec, setRec] = useState(false);
  const [freq, setFreq] = useState('mensal');
  const [day, setDay] = useState(String(parts(today).d));
  const [split, setSplit] = useState(null);
  const [count, setCount] = useState(0);

  const s = useSubmit(async (again) => {
    const cents = inputToCents(amount);
    if (!cents || cents <= 0) throw new Error('Informe um valor maior que zero.');
    if (!account) throw new Error('Cadastre uma conta em "Meu dinheiro" primeiro.');
    if (status === 'realizado' && date > today) throw new Error('Se ainda não recebeu, marque como “previsto”.');
    const description = desc.trim() || null;
    if (rec) {
      const r = await post('/recurrences', { kind: 'receita', amount_cents: cents, description: description || 'Renda recorrente', frequency: freq, day_of_month: freq === 'mensal' ? Number(day) || parts(date).d : null, start_date: date, account_id: account, is_main_income: false });
      if (status === 'realizado') {
        const occ = C.occurrenceDates({ frequency: freq, start_date: date, day_of_month: Number(day) || parts(date).d }, date, date)[0];
        if (occ) await post(`/recurrences/${r.id}/occurrence`, { occurrence_date: occ, action: 'realizar', date });
        else await post('/transactions', { kind: 'receita', amount_cents: cents, date, account_id: account, status: 'realizado', description });
      }
    } else {
      await post('/transactions', { kind: 'receita', amount_cents: cents, date, account_id: account, status, description });
    }
    await reload();
    setCount((n) => n + 1);
    if (again) {
      toast(`${brl(cents)} registrados.`);
      setAmount(''); setDesc('');
      return;
    }
    if (status === 'realizado') setSplit({ amount_cents: cents, account_id: account });
    else { toast('Entrada prevista registrada. Ela não conta no saldo até você confirmar.'); onClose(); }
  });

  if (!accounts.length) {
    return <Modal title="Recebi dinheiro" onClose={onClose}><p>Cadastre primeiro onde guarda seu dinheiro.</p><a className="btn primary" href="#/dinheiro" onClick={onClose}>Ir para Meu dinheiro</a></Modal>;
  }
  return (
    <Modal title={split ? 'Dividir o que entrou' : 'Recebi dinheiro'} onClose={onClose}>
      {split ? <SplitStep income={split} onClose={onClose} /> : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); s.run(false).catch(() => {}); }}>
          <MoneyInput huge value={amount} onChange={setAmount} autoFocus />
          <Seg value={status} onChange={setStatus} label="Situação" options={[['realizado', 'Já recebi'], ['previsto', 'Ainda vou receber']]} />
          <div className="form-grid">
            <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={status === 'realizado' ? today : undefined} /></Field>
            <AccountSelect value={account} onChange={setAccount} accounts={accounts} label="Entrou em" />
            <Field label="Origem" full><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: mesada, Pix da avó, venda, freela" /></Field>
            <label className="check full"><input type="checkbox" checked={rec} onChange={(e) => setRec(e.target.checked)} />Se repete (renda recorrente)</label>
            {rec && <FrequencyFields freq={freq} setFreq={setFreq} day={day} setDay={setDay} />}
          </div>
          {status === 'previsto' && <p className="hint">Entradas previstas aparecem separadas e nunca viram dinheiro liberado para gastar.</p>}
          {s.error && <p className="err" role="alert">{s.error}</p>}
          {count > 0 && <p className="hint ok">{count} entrada(s) registrada(s) nesta janela.</p>}
          <div className="row wrap">
            <button type="button" className="btn" disabled={s.busy} onClick={() => s.run(true).catch(() => {})}>Salvar e registrar outra</button>
            <div className="spacer" />
            <button className="btn primary" disabled={s.busy}>{s.busy ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
