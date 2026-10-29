import { useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import { post } from '../api.js';
import * as C from '@shared/calc.js';
import { Modal, Field, MoneyInput, inputToCents, brl, useSubmit, useToast } from '../ui.jsx';
import { AccountSelect } from './Recebi.jsx';
import { withAllocCheck } from '../actions.js';

export default function Transferir({ onClose, fromId }) {
  const { data, today, reload } = useApp();
  const toast = useToast();
  const { list } = useMemo(() => C.accountsSummary(data), [data]);
  const alloc = useMemo(() => C.allocations(data), [data]);
  const [from, setFrom] = useState(fromId || list[0]?.id);
  const [to, setTo] = useState(list.find((a) => a.id !== (fromId || list[0]?.id))?.id);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [goal, setGoal] = useState('');
  const goalsHere = data.goals.filter((g) => (alloc.byGoalAccount.get(`${g.id}|${from}`) || 0) > 0);
  const fromAcc = list.find((a) => a.id === from);

  const s = useSubmit(async () => {
    const cents = inputToCents(amount);
    if (!cents || cents <= 0) throw new Error('Informe um valor maior que zero.');
    if (!from || !to || from === to) throw new Error('Escolha duas contas diferentes.');
    if (date > today) throw new Error('A transferência deve ter data de hoje ou anterior.');
    const contributions = goal ? [
      { goal_id: goal, account_id: from, amount_cents: -cents, date, source: 'ajuste', note: 'Separação movida junto com a transferência' },
      { goal_id: goal, account_id: to, amount_cents: cents, date, source: 'ajuste', note: 'Separação movida junto com a transferência' },
    ] : [];
    await withAllocCheck((withdraw) => post('/transactions', {
      items: [{ kind: 'transferencia', amount_cents: cents, date, account_id: from, to_account_id: to, status: 'realizado', description: 'Transferência' }],
      contributions, withdraw_from_goals: withdraw,
    }));
    await reload();
    toast('Transferência registrada (não conta como receita nem despesa).');
    onClose();
  });

  return (
    <Modal title="Transferir entre contas" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); s.run().catch(() => {}); }}>
        <MoneyInput huge value={amount} onChange={setAmount} autoFocus />
        <div className="form-grid">
          <AccountSelect value={from} onChange={(v) => { setFrom(v); setGoal(''); }} accounts={list} label="De" />
          <AccountSelect value={to} onChange={setTo} accounts={list} label="Para" />
          <Field label="Data"><input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        {fromAcc && <p className="hint">Saldo em {fromAcc.name}: {brl(fromAcc.balance)} ({brl(fromAcc.allocated)} separados para metas).</p>}
        {goalsHere.length > 0 && (
          <Field label="Esse dinheiro é de uma meta?" hint="Se sim, a separação da meta vai junto para a conta de destino, sem contar duas vezes.">
            <select className="input" value={goal} onChange={(e) => setGoal(e.target.value)}>
              <option value="">Não, é dinheiro livre</option>
              {goalsHere.map((g) => <option key={g.id} value={g.id}>{g.name} ({brl(alloc.byGoalAccount.get(`${g.id}|${from}`))} nesta conta)</option>)}
            </select>
          </Field>
        )}
        {s.error && <p className="err" role="alert">{s.error}</p>}
        <div className="form-actions"><button className="btn primary" disabled={s.busy}>Transferir</button></div>
      </form>
    </Modal>
  );
}
