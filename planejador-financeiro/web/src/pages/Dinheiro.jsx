import { useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import { post, put, del } from '../api.js';
import * as C from '@shared/calc.js';
import { formatBR } from '@shared/dates.js';
import { Modal, Field, MoneyInput, inputToCents, centsToInput, brl, Money, Progress, Alert, useSubmit, useToast, Empty } from '../ui.jsx';
import { withAllocCheck } from '../actions.js';

export const KINDS = { corrente: 'Conta corrente', dinheiro: 'Dinheiro físico', caixinha: 'Conta remunerada / caixinha', poupanca: 'Poupança', tesouro: 'Tesouro', cdb: 'CDB', outros: 'Outros' };
export const PURPOSES = { gastar: 'Para gastar', reservado: 'Reservado', investido: 'Investido' };
export const LIQ = { imediata: 'Resgate imediato', curta: 'Resgate em alguns dias', bloqueada: 'Indisponível até o vencimento' };
const DEFAULT_PURPOSE = { corrente: 'gastar', dinheiro: 'gastar', caixinha: 'reservado', poupanca: 'reservado', tesouro: 'investido', cdb: 'investido', outros: 'reservado' };

function AccountForm({ account, onClose }) {
  const { reload } = useApp();
  const toast = useToast();
  const [f, setF] = useState(() => ({
    name: account?.name || '', kind: account?.kind || 'corrente', institution: account?.institution || '',
    purpose: account?.purpose || 'gastar', liquidity: account?.liquidity || 'imediata', maturity: account?.maturity_date || '',
    yieldNote: account?.est_yield_note || '', initial: '', known: true,
  }));
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }));
  const s = useSubmit(async () => {
    if (!f.name.trim()) throw new Error('Dê um nome.');
    const body = {
      name: f.name.trim(), kind: f.kind, institution: f.institution.trim() || null, purpose: f.purpose, liquidity: f.liquidity,
      maturity_date: f.maturity || null, est_yield_note: f.yieldNote.trim() || null,
    };
    if (account) await put(`/accounts/${account.id}`, body);
    else await post('/accounts', { ...body, initial_cents: f.known ? inputToCents(f.initial) || 0 : 0, balance_known: f.known });
    await reload(); toast('Conta salva.'); onClose();
  });
  return (
    <Modal title={account ? 'Editar conta' : 'Novo lugar para o dinheiro'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); s.run().catch(() => {}); }}>
        <div className="form-grid">
          <Field label="Nome"><input className="input" value={f.name} onChange={set('name')} placeholder="Ex.: Nubank, carteira" /></Field>
          <Field label="Tipo"><select className="input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value, purpose: account ? x.purpose : DEFAULT_PURPOSE[e.target.value], liquidity: account ? x.liquidity : (e.target.value === 'cdb' || e.target.value === 'tesouro' ? 'curta' : 'imediata') }))}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Instituição (opcional)"><input className="input" value={f.institution} onChange={set('institution')} /></Field>
          <Field label="Finalidade" hint="Só “Para gastar” entra no cálculo do dinheiro livre."><select className="input" value={f.purpose} onChange={set('purpose')}>{Object.entries(PURPOSES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Liquidez"><select className="input" value={f.liquidity} onChange={set('liquidity')}>{Object.entries(LIQ).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Vencimento (opcional)"><input className="input" type="date" value={f.maturity} onChange={set('maturity')} /></Field>
          <Field label="Rendimento estimado (opcional, texto livre)" full hint="Ex.: “100% do CDI segundo o app do banco”. É só uma anotação sua; o app não busca taxas."><input className="input" value={f.yieldNote} onChange={set('yieldNote')} /></Field>
          {!account && (
            <>
              <label className="check full"><input type="checkbox" checked={!f.known} onChange={(e) => setF((x) => ({ ...x, known: !e.target.checked }))} />Não sei o saldo agora</label>
              {f.known && <Field label="Saldo atual" full><MoneyInput value={f.initial} onChange={set('initial')} /></Field>}
            </>
          )}
        </div>
        {s.error && <p className="err">{s.error}</p>}
        <button className="btn primary block" disabled={s.busy}>Salvar</button>
      </form>
    </Modal>
  );
}

function Reconcile({ account, onClose }) {
  const { reload } = useApp();
  const toast = useToast();
  const [v, setV] = useState(account.balance_known ? centsToInput(account.balance) : '');
  const s = useSubmit(async () => {
    const cents = inputToCents(v);
    if (cents == null) throw new Error('Informe o saldo (pode ser 0).');
    const r = await withAllocCheck((w) => post(`/accounts/${account.id}/reconcile`, { balance_cents: cents, withdraw_from_goals: w }));
    await reload();
    toast(r.diff ? `Saldo atualizado (ajuste de ${brl(r.diff)}).` : 'Saldo confirmado.');
    onClose();
  });
  return (
    <Modal title={`Atualizar saldo · ${account.name}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); s.run().catch(() => {}); }}>
        <p className="muted">Confira no app do banco (ou conte o dinheiro) e digite o saldo real. A diferença vira um “ajuste de saldo” no histórico.</p>
        <MoneyInput huge value={v} onChange={setV} autoFocus allowNegative />
        <p className="hint">Saldo calculado pelo app: {account.balance_known ? brl(account.balance) : 'desconhecido'}</p>
        {s.error && <p className="err">{s.error}</p>}
        <button className="btn primary block" disabled={s.busy}>Salvar saldo</button>
      </form>
    </Modal>
  );
}

export default function Dinheiro() {
  const { data, open, reload } = useApp();
  const toast = useToast();
  const { list, totals } = useMemo(() => C.accountsSummary(data), [data]);
  const alloc = useMemo(() => C.allocations(data), [data]);
  const goals = new Map(data.goals.map((g) => [g.id, g]));
  const [form, setForm] = useState(null);
  const [rec, setRec] = useState(null);
  const archive = async (a) => {
    if (a.allocated > 0) return alert('Essa conta tem dinheiro destinado a metas. Retire ou mova a separação antes de arquivar.');
    if (!window.confirm(`Arquivar “${a.name}”? O histórico é mantido.`)) return;
    await put(`/accounts/${a.id}`, { archived: true }); await reload(); toast('Conta arquivada.');
  };
  const archived = data.accounts.filter((a) => a.archived);
  return (
    <>
      <div className="topbar">
        <h1>Meu dinheiro</h1>
        <div className="row"><button className="btn" onClick={() => open('transferir')}>⇄ Transferir</button><button className="btn primary" onClick={() => setForm({})}>+ Adicionar</button></div>
      </div>
      <Alert tone="info">Os saldos são <b>manuais</b>: o app não se conecta ao banco e nunca pede sua senha bancária. Atualize quando conferir no app do banco.</Alert>
      <div className="kpis" style={{ marginBottom: 18 }}>
        <div className="kpi"><div className="l">Para gastar</div><div className="v num">{brl(totals.gastar)}</div></div>
        <div className="kpi"><div className="l">Reservado</div><div className="v num">{brl(totals.reservado)}</div></div>
        <div className="kpi"><div className="l">Investido</div><div className="v num">{brl(totals.investido)}</div></div>
        <div className="kpi"><div className="l">Indisponível p/ resgate</div><div className="v num">{brl(totals.indisponivel)}</div></div>
        <div className="kpi"><div className="l">Destinado a metas</div><div className="v num">{brl(totals.separadoMetas)}</div></div>
        <div className="kpi"><div className="l">Total</div><div className="v num">{brl(totals.total)}</div></div>
      </div>
      {!list.length && <div className="card"><Empty>Nenhuma conta. Adicione sua conta corrente, carteira ou caixinha.</Empty></div>}
      <div className="grid two">
        {list.map((a) => {
          const parts = data.goals.map((g) => ({ g, v: alloc.byGoalAccount.get(`${g.id}|${a.id}`) || 0 })).filter((x) => x.v > 0);
          return (
            <section className="card" key={a.id}>
              <div className="card-h">
                <div><h3>{a.name}</h3><small>{KINDS[a.kind]}{a.institution ? ` · ${a.institution}` : ''}</small></div>
                <span className={`chip ${a.purpose === 'gastar' ? 'ok' : a.purpose === 'investido' ? 'info' : ''}`}>{PURPOSES[a.purpose]}</span>
              </div>
              <div className="big-value num" style={{ fontSize: '1.9rem' }}>{a.balance_known ? brl(a.balance) : <span className="warn">saldo desconhecido</span>}</div>
              <p className="hint">{LIQ[a.liquidity]}{a.maturity_date ? ` · vence em ${formatBR(a.maturity_date)}` : ''}{a.est_yield_note ? ` · ${a.est_yield_note}` : ''}</p>
              <p className="hint">Última atualização: {a.last_update ? new Date(a.last_update).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'} · manual</p>
              {a.balance > 0 && (
                <>
                  <Progress value={a.allocated / Math.max(1, a.balance)} />
                  <div className="row between" style={{ marginTop: 6 }}><small>Destinado a metas: <Money c={a.allocated} /></small><small>Livre de metas: <Money c={a.unallocated} /></small></div>
                </>
              )}
              {parts.length > 0 && <ul className="hint" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{parts.map((x) => <li key={x.g.id}>{x.g.name}: {brl(x.v)}</li>)}</ul>}
              <div className="row wrap" style={{ marginTop: 12 }}>
                <button className="btn small primary" onClick={() => setRec(a)}>Atualizar saldo</button>
                <button className="btn small" onClick={() => open('transferir', { fromId: a.id })}>Transferir</button>
                <button className="btn small" onClick={() => setForm(a)}>Editar</button>
                <button className="btn small ghost" onClick={() => archive(a)}>Arquivar</button>
              </div>
            </section>
          );
        })}
      </div>
      {archived.length > 0 && (
        <section className="section card">
          <h3>Arquivadas</h3>
          {archived.map((a) => <div key={a.id} className="row between item"><span>{a.name}</span><button className="btn small" onClick={async () => { await put(`/accounts/${a.id}`, { archived: false }); await reload(); }}>Reativar</button></div>)}
        </section>
      )}
      <section className="section card">
        <h3>Como o app separa seu dinheiro</h3>
        <ul className="hint">
          <li><b>Para gastar:</b> conta corrente e carteira. É daqui que sai o “quanto posso gastar”, depois de descontar contas e o que você destinou a metas.</li>
          <li><b>Reservado:</b> caixinha, poupança, reserva. Não aparece como dinheiro livre.</li>
          <li><b>Investido:</b> Tesouro, CDB e similares. Não aparece como dinheiro livre.</li>
          <li><b>Indisponível:</b> aplicações que só podem ser resgatadas no vencimento.</li>
          <li>Uma conta pode guardar dinheiro de várias metas, mas a soma destinada nunca passa do saldo dela — cada parte é de uma meta só.</li>
        </ul>
      </section>
      {form && <AccountForm account={form.id ? form : null} onClose={() => setForm(null)} />}
      {rec && <Reconcile account={rec} onClose={() => setRec(null)} />}
    </>
  );
}
