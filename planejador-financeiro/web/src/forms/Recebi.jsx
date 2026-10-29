import { useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import { post } from '../api.js';
import * as C from '@shared/calc.js';
import { parts } from '@shared/dates.js';
import * as B from '@shared/budget.js';
import { mergePlanItems } from '@shared/assistant.js';
import { Modal, Field, MoneyInput, inputToCents, Seg, Alert, brl, More, SplitBar, useSubmit, useToast } from '../ui.jsx';
import { soft } from '../budgetui.jsx';
import { undoCreated } from './Gastei.jsx';

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

// Divide só o dinheiro novo: completa o que falta no plano (ou na sugestão), sem reservar de novo o que já estava separado.
function SplitStep({ income, onClose }) {
  const { data, today, reload, go } = useApp();
  const toast = useToast();
  const acc = data.accounts.find((a) => a.id === income.account_id);
  const counted = acc?.purpose === 'gastar' ? income.amount_cents : 0;
  const r = useMemo(() => B.splitNewIncome(data, today, income.amount_cents, { alreadyCounted: counted }), [data, today, income, counted]);
  const metaAdds = r.adds.filter((a) => a.type === 'meta');
  const [separar, setSeparar] = useState(true);
  const parts = [
    ...(r.billGap ? [{ label: 'Contas', value: r.billGap, color: 'var(--warn)' }] : []),
    ...r.adds.map((a) => ({ label: a.name, value: a.amount, color: a.type === 'meta' ? 'var(--accent)' : soft(data.categories.find((c) => c.id === a.id)?.color) })),
    ...(r.livre > 0 ? [{ label: 'Livre', value: r.livre, color: 'var(--fill-strong)' }] : []),
  ];
  const s = useSubmit(async () => {
    if (r.adds.length) await post('/plans', { items: mergePlanItems(r.planned, r.adds) });
    if (separar && metaAdds.length) {
      await post('/contributions', { items: metaAdds.map((a) => ({ goal_id: a.id, account_id: income.account_id, amount_cents: a.amount, date: today, source: 'divisao' })) });
    }
    await reload();
    toast({ text: r.adds.length ? 'Plano atualizado com o dinheiro novo.' : 'Tudo certo, nada mudou no plano.', ok: true });
    onClose();
  });
  return (
    <div className="stack">
      <Alert tone="ok">{brl(income.amount_cents)} registrados em {acc?.name}.</Alert>
      <h3>Como dividir esse dinheiro</h3>
      <SplitBar parts={parts} label="Divisão do dinheiro novo" />
      <div className="calc">
        {r.billGap > 0 && <div className="ln"><span>Cobrir contas que estavam descobertas</span><b className="num">{brl(r.billGap)}</b></div>}
        {r.adds.map((a) => <div className="ln" key={a.key}><span>{a.icon} {a.name}<br /><small className="muted">{a.reason}</small></span><b className="num">+{brl(a.amount)}</b></div>)}
        <div className="ln"><span>Fica livre</span><b className="num">{brl(r.livre)}</b></div>
      </div>
      <p className="hint">Considerei {r.base === 'plano' ? 'seu plano salvo' : 'a divisão sugerida'} e só completei o que faltava: nada que já estava reservado foi reservado de novo. Separar no aplicativo é planejamento — o dinheiro continua em {acc?.name}, nada é transferido no banco.</p>
      {metaAdds.length > 0 && <label className="check"><input type="checkbox" checked={separar} onChange={(e) => setSeparar(e.target.checked)} />Marcar agora como separado para {metaAdds.map((a) => a.name).join(', ')}</label>}
      {s.error && <p className="err">{s.error}</p>}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Não dividir agora</button>
        <button className="btn" onClick={() => { onClose(); go('plano/organizar'); }}>Ajustar valores</button>
        <button className="btn primary" disabled={s.busy} onClick={() => s.run().catch(() => {})}>{r.adds.length ? 'Confirmar divisão' : 'Ok'}</button>
      </div>
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
    const created = {};
    if (rec) {
      const r = await post('/recurrences', { kind: 'receita', amount_cents: cents, description: description || 'Renda recorrente', frequency: freq, day_of_month: freq === 'mensal' ? Number(day) || parts(date).d : null, start_date: date, account_id: account, is_main_income: false });
      created.recurrence = r.id;
      if (status === 'realizado') {
        const occ = C.occurrenceDates({ frequency: freq, start_date: date, day_of_month: Number(day) || parts(date).d }, date, date)[0];
        if (occ) await post(`/recurrences/${r.id}/occurrence`, { occurrence_date: occ, action: 'realizar', date });
        else created.tx = [(await post('/transactions', { kind: 'receita', amount_cents: cents, date, account_id: account, status: 'realizado', description })).id];
      }
    } else {
      created.tx = [(await post('/transactions', { kind: 'receita', amount_cents: cents, date, account_id: account, status, description })).id];
    }
    await reload();
    setCount((n) => n + 1);
    const undo = { label: 'Desfazer', run: () => undoCreated(created, reload) };
    if (again) {
      toast({ text: `${brl(cents)} registrados.`, ok: true, action: undo });
      setAmount(''); setDesc('');
      return;
    }
    if (status === 'realizado') { toast({ text: `${brl(cents)} entraram no saldo.`, ok: true, action: undo }); setSplit({ amount_cents: cents, account_id: account }); }
    else { toast({ text: 'Recebimento previsto registrado. Só entra no saldo quando você confirmar.', ok: true, action: undo }); onClose(); }
  });

  if (!accounts.length) {
    return <Modal title="Recebi dinheiro" onClose={onClose}><p>Cadastre primeiro onde guarda seu dinheiro.</p><a className="btn primary" href="#/perfil/contas" onClick={onClose}>Cadastrar conta</a></Modal>;
  }
  return (
    <Modal title={split ? 'Dividir o que entrou' : 'Entrada'} onClose={onClose}>
      {split ? <SplitStep income={split} onClose={onClose} /> : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); s.run(false).catch(() => {}); }}>
          <Field label="Quanto?"><MoneyInput huge value={amount} onChange={setAmount} autoFocus /></Field>
          <Seg value={status} onChange={setStatus} label="Situação" options={[['realizado', 'Já recebi'], ['previsto', 'Ainda vou receber']]} />
          <p className="hint" style={{ marginTop: -4 }}>{status === 'realizado' ? 'Entra no saldo agora.' : 'Fica em “a receber” e não conta como dinheiro para gastar até você confirmar.'}</p>
          <Field label="De onde veio?"><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: mesada, Pix da avó, venda" /></Field>
          <More label="Mais opções (data, conta, se repete)">
            <div className="form-grid">
              <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={status === 'realizado' ? today : undefined} /></Field>
              <AccountSelect value={account} onChange={setAccount} accounts={accounts} label="Entrou em" />
            </div>
            <label className="check"><input type="checkbox" checked={rec} onChange={(e) => setRec(e.target.checked)} />Se repete (renda fixa: entra regularmente)</label>
            {rec && <div className="form-grid"><FrequencyFields freq={freq} setFreq={setFreq} day={day} setDay={setDay} /></div>}
          </More>
          {s.error && <p className="err" role="alert">{s.error}</p>}
          {count > 0 && <p className="hint ok">{count} entrada(s) registrada(s) nesta janela.</p>}
          <div className="form-actions">
            <button type="button" className="btn" disabled={s.busy} onClick={() => s.run(true).catch(() => {})}>Salvar e outra</button>
            <button className="btn primary" disabled={s.busy}>{s.busy ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
