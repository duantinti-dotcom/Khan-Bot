import { useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import { post } from '../api.js';
import * as C from '@shared/calc.js';
import { Modal, Field, MoneyInput, inputToCents, Seg, brl, useSubmit, useToast, Alert } from '../ui.jsx';
import { AccountSelect } from './Recebi.jsx';
import { withAllocCheck } from '../actions.js';

export default function Guardei({ onClose, goalId }) {
  const { data, today, reload } = useApp();
  const toast = useToast();
  const goals = data.goals.filter((g) => !g.archived);
  const { list } = useMemo(() => C.accountsSummary(data), [data]);
  const alloc = useMemo(() => C.allocations(data), [data]);
  const [mode, setMode] = useState('aporte');
  const [goal, setGoal] = useState(goalId || goals[0]?.id);
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState((list.find((a) => a.purpose === 'gastar') || list[0])?.id);
  const [moved, setMoved] = useState(false);
  const [to, setTo] = useState(list.find((a) => a.purpose !== 'gastar')?.id || list[0]?.id);
  const [note, setNote] = useState('');
  const where = moved ? to : from;
  const whereAcc = list.find((a) => a.id === where);
  const inGoalHere = alloc.byGoalAccount.get(`${goal}|${from}`) || 0;

  const s = useSubmit(async () => {
    const cents = inputToCents(amount);
    if (!cents || cents <= 0) throw new Error('Informe um valor maior que zero.');
    if (!goal) throw new Error('Crie uma meta primeiro.');
    if (mode === 'resgate') {
      await post('/contributions', { goal_id: goal, account_id: from, amount_cents: -cents, date: today, source: 'resgate', note: note || null });
    } else if (moved) {
      if (from === to) throw new Error('Escolha contas diferentes para a transferência.');
      await withAllocCheck((withdraw) => post('/transactions', {
        items: [{ kind: 'transferencia', amount_cents: cents, date: today, account_id: from, to_account_id: to, status: 'realizado', description: `Guardar para meta` }],
        contributions: [{ goal_id: goal, account_id: to, amount_cents: cents, date: today, source: 'aporte', note: note || null }],
        withdraw_from_goals: withdraw,
      }));
    } else {
      await post('/contributions', { goal_id: goal, account_id: from, amount_cents: cents, date: today, source: 'aporte', note: note || null });
    }
    await reload();
    toast(mode === 'resgate' ? 'Resgate registrado.' : 'Aporte registrado na meta.');
    onClose();
  });

  if (!goals.length) return <Modal title="Guardei" onClose={onClose}><p>Crie uma meta primeiro.</p><a className="btn primary" href="#/metas" onClick={onClose}>Ir para Minhas metas</a></Modal>;
  return (
    <Modal title={mode === 'resgate' ? 'Retirar de uma meta' : 'Guardei para uma meta'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); s.run().catch(() => {}); }}>
        <Seg value={mode} onChange={setMode} label="Operação" options={[['aporte', 'Guardar'], ['resgate', 'Retirar']]} />
        <MoneyInput huge value={amount} onChange={setAmount} autoFocus />
        <Field label="Meta">
          <select className="input" value={goal} onChange={(e) => setGoal(e.target.value)}>{goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        </Field>
        <AccountSelect value={from} onChange={setFrom} accounts={list} label={mode === 'resgate' ? 'De qual conta sai a separação' : 'Onde o dinheiro está agora'} />
        {mode === 'resgate' && <p className="hint">Esta meta tem {brl(inGoalHere)} nessa conta. O resgate devolve o valor ao “livre” (se a conta for de gastos); nada é movimentado no banco.</p>}
        {mode === 'aporte' && (
          <>
            <label className="check"><input type="checkbox" checked={moved} onChange={(e) => setMoved(e.target.checked)} />Também transferi esse valor para outra conta (ex.: caixinha)</label>
            {moved && <AccountSelect value={to} onChange={setTo} accounts={list} label="Para onde transferi" />}
            {whereAcc && <p className="hint">Em {whereAcc.name} há {brl(Math.max(0, whereAcc.unallocated))} ainda não destinados a nenhuma meta{moved ? ' (antes da transferência)' : ''}. Cada centavo só pode ser destinado a uma meta.</p>}
            <Alert tone="info">Isto é um registro de planejamento: marca o dinheiro como reservado para a meta. Se você também moveu o dinheiro no banco, marque a transferência acima.</Alert>
          </>
        )}
        <Field label="Observação (opcional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {s.error && <p className="err" role="alert">{s.error}</p>}
        <button className="btn primary block" disabled={s.busy}>{s.busy ? 'Salvando…' : 'Confirmar'}</button>
      </form>
    </Modal>
  );
}
