import { useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import { post, put, del } from '../api.js';
import * as C from '@shared/calc.js';
import * as B from '@shared/budget.js';
import { addDays, parts, formatBR } from '@shared/dates.js';
import { FREQUENCIAS } from '@shared/recurrence.js';
import { Modal, Field, MoneyInput, inputToCents, centsToInput, Seg, brl, More, Progress, useSubmit, useToast, EmptyCta } from '../ui.jsx';
import { CategoryForm } from './Categorias.jsx';

function nextPending(data, rec, today) {
  return C.virtualOccurrences(data, today, addDays(today, 800)).find((o) => o.recurrence_id === rec.id) || null;
}

export function RecurrenceForm({ rec, kind: kindProp, onClose }) {
  const { data, today, reload } = useApp();
  const toast = useToast();
  const kind = rec?.kind || kindProp;
  const accounts = data.accounts.filter((a) => !a.archived);
  const cats = data.categories.filter((c) => !c.archived || c.id === rec?.category_id);
  const next = rec ? nextPending(data, rec, today) : null;
  const [name, setName] = useState(rec?.description || '');
  const [amount, setAmount] = useState(centsToInput(next?.amount_cents ?? rec?.amount_cents));
  const [freq, setFreq] = useState(rec?.frequency || 'mensal');
  const [date, setDate] = useState(next?.date || rec?.start_date || today);
  const [account, setAccount] = useState(rec?.account_id || (accounts.find((a) => a.purpose === 'gastar') || accounts[0])?.id);
  const [cat, setCat] = useState(rec?.category_id || '');
  const [end, setEnd] = useState(rec?.end_date || '');
  const [estimated, setEstimated] = useState(rec?.estimated || false);
  const [main, setMain] = useState(rec?.is_main_income || false);
  const [scope, setScope] = useState('proximos');
  const [newCat, setNewCat] = useState(false);
  const cents = inputToCents(amount);
  const timingChanged = rec && (cents !== (next?.amount_cents ?? rec.amount_cents) || freq !== rec.frequency || (next && date !== next.date));

  const s = useSubmit(async () => {
    if (!name.trim()) throw new Error('Dê um nome.');
    if (!cents || cents <= 0) throw new Error('Informe o valor.');
    if (end && end < date) throw new Error('O término deve ser depois da próxima data.');
    const base = {
      description: name.trim(), account_id: account || null, category_id: kind === 'despesa' ? cat || null : null,
      end_date: end || null, estimated, is_main_income: kind === 'receita' ? main : false,
    };
    if (!rec) {
      await post('/recurrences', { ...base, kind, amount_cents: cents, frequency: freq, day_of_month: freq === 'mensal' ? parts(date).d : null, start_date: date });
      await reload();
      toast({ text: `${kind === 'receita' ? 'Renda' : 'Despesa'} fixa cadastrada.`, ok: true });
      return onClose();
    }
    // Nome, conta, categoria, término e "estimado" valem para a regra toda.
    await put(`/recurrences/${rec.id}`, base);
    if (timingChanged && next) {
      if (scope === 'so_proximo') {
        await post(`/recurrences/${rec.id}/occurrence`, { occurrence_date: next.occurrence_date, action: 'editar', amount_cents: cents, date });
      } else {
        const changes = { amount_cents: cents, frequency: freq };
        if (freq === 'mensal') changes.day_of_month = parts(date).d;
        await post(`/recurrences/${rec.id}/split`, { from_date: next.occurrence_date, changes });
      }
    }
    await reload();
    toast({ text: 'Alterações salvas.', ok: true });
    onClose();
  });

  return (
    <Modal title={rec ? `Editar ${kind === 'receita' ? 'renda' : 'despesa'} fixa` : kind === 'receita' ? 'Nova renda fixa' : 'Nova despesa fixa'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); s.run().catch(() => {}); }}>
        <p className="hint">{kind === 'receita' ? 'Renda fixa é dinheiro que entra regularmente (mesada, salário, estágio).' : 'Despesa fixa é dinheiro que sai regularmente (assinatura, celular, academia).'}</p>
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'receita' ? 'Ex.: Mesada' : 'Ex.: Spotify'} /></Field>
        <Field label={estimated ? 'Valor estimado' : 'Valor'}><MoneyInput value={amount} onChange={setAmount} /></Field>
        <div className="form-grid">
          <Field label="Frequência">
            <select className="input" value={freq} onChange={(e) => setFreq(e.target.value)}>
              {Object.entries(FREQUENCIAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label={rec ? 'Próxima data' : kind === 'receita' ? 'Próximo recebimento' : 'Próximo vencimento'}><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        {kind === 'despesa' && (
          <Field label="Categoria">
            <div className="row">
              <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">Sem categoria</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
              <button type="button" className="btn" onClick={() => setNewCat(true)}>+ Nova</button>
            </div>
          </Field>
        )}
        {rec && timingChanged && next && (
          <Field label="Essa mudança vale para">
            <Seg value={scope} onChange={setScope} options={[['so_proximo', `Só ${formatBR(next.occurrence_date)}`], ['proximos', 'Esta e as próximas']]} />
          </Field>
        )}
        <More label="Mais detalhes">
          <Field label={kind === 'receita' ? 'Entra em' : 'Sai de'}>
            <select className="input" value={account || ''} onChange={(e) => setAccount(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
          <Field label="Termina em (opcional)"><input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <label className="check"><input type="checkbox" checked={estimated} onChange={(e) => setEstimated(e.target.checked)} />O valor varia; este é uma estimativa (ex.: conta de luz)</label>
          {kind === 'receita' && <label className="check"><input type="checkbox" checked={main} onChange={(e) => setMain(e.target.checked)} />É minha renda principal (o “posso gastar” vai até a véspera dela)</label>}
        </More>
        {s.error && <p className="err">{s.error}</p>}
        <div className="form-actions"><button className="btn primary" disabled={s.busy}>{s.busy ? 'Salvando…' : 'Salvar'}</button></div>
      </form>
      {newCat && <CategoryForm onClose={() => setNewCat(false)} onSaved={(id) => setCat(id)} />}
    </Modal>
  );
}

export default function Fixos() {
  const { data, today, reload } = useApp();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const accs = new Map(data.accounts.map((a) => [a.id, a]));
  const commit = useMemo(() => B.incomeCommitment(data, today, 30), [data, today]);
  const active = data.recurrences.filter((r) => r.active && (!r.end_date || r.end_date >= today));
  const stop = async (r) => {
    const used = data.transactions.some((t) => t.recurrence_id === r.id);
    if (!used) {
      if (!window.confirm(`Excluir “${r.description}”? Ainda não há lançamentos dela.`)) return;
      await del(`/recurrences/${r.id}`);
    } else {
      if (!window.confirm(`Encerrar “${r.description}”? Os lançamentos já feitos continuam no histórico.`)) return;
      const end = addDays(today, -1) < r.start_date ? r.start_date : addDays(today, -1);
      await put(`/recurrences/${r.id}`, { end_date: end, active: addDays(today, -1) >= r.start_date });
    }
    await reload();
    toast({ text: 'Pronto.', ok: true });
  };
  const list = (kind) => {
    const rows = active.filter((r) => r.kind === kind);
    const monthly = rows.reduce((s, r) => s + C.monthlyEquivalent(r.amount_cents, r.frequency), 0);
    return (
      <section className="card">
        <div className="card-h">
          <div>
            <h2>{kind === 'receita' ? 'Rendas fixas' : 'Despesas fixas'}</h2>
            <small>{kind === 'receita' ? 'Dinheiro que entra regularmente' : 'Dinheiro que sai regularmente'} · {brl(Math.round(monthly))}/mês</small>
          </div>
          <button className="btn small primary" onClick={() => setForm({ kind })}>+ Adicionar</button>
        </div>
        {!rows.length && <p className="empty">{kind === 'receita' ? 'Cadastre mesada, salário ou qualquer valor que entra com frequência.' : 'Cadastre assinaturas, celular, academia e outras contas que se repetem.'}</p>}
        {rows.map((r) => {
          const n = nextPending(data, r, today);
          return (
            <div className="item wrap-actions" key={r.id}>
              <div className="dot" aria-hidden="true">{kind === 'receita' ? '↓' : cats.get(r.category_id)?.icon || '•'}</div>
              <div className="grow">
                <div className="t">{r.description} {r.estimated && <span className="tag">estimado</span>} {r.is_main_income && <span className="tag">principal</span>}</div>
                <div className="s">{FREQUENCIAS[r.frequency].label}{n ? ` · próxima ${formatBR(n.date)}` : ''}{accs.get(r.account_id) ? ` · ${accs.get(r.account_id).name}` : ''}{r.end_date ? ` · até ${formatBR(r.end_date)}` : ''}</div>
              </div>
              <div className="actions">
                <div className={`amt num ${kind === 'receita' ? 'ok' : ''}`} style={{ alignSelf: 'center', marginRight: 6 }}>{brl(n?.amount_cents ?? r.amount_cents)}</div>
                <button className="btn small" onClick={() => setForm({ rec: r })}>Editar</button>
                <button className="btn small ghost" onClick={() => stop(r)} aria-label={`Encerrar ${r.description}`}>✕</button>
              </div>
            </div>
          );
        })}
      </section>
    );
  };
  return (
    <div className="stack">
      <section className="card">
        <h3>Renda futura já comprometida</h3>
        {commit.income > 0 ? (
          <>
            <p className="muted">Nos próximos 30 dias entram {brl(commit.income)} previstos; {brl(commit.bills)} já têm destino em contas ({Math.round(commit.ratio * 100)}%).</p>
            <Progress value={commit.ratio} tone={commit.ratio > 1 ? 'bad' : commit.ratio > 0.8 ? 'warn' : ''} />
          </>
        ) : <p className="muted">Sem rendas previstas nos próximos 30 dias. Contas previstas: {brl(commit.bills)}.</p>}
      </section>
      <div className="grid two">
        {list('receita')}
        {list('despesa')}
      </div>
      <p className="hint">Valores picados (um Pix, uma venda) são registrados em “+ → Entrada”. Para mudar o valor de uma conta fixa só uma vez ou a partir de agora, toque em Editar.</p>
      {form && <RecurrenceForm rec={form.rec} kind={form.kind} onClose={() => setForm(null)} />}
    </div>
  );
}

export { EmptyCta };
