import { useEffect, useMemo, useState } from 'react';
import { useApp, TopBar } from '../App.jsx';
import { api, post, put, del } from '../api.js';
import * as C from '@shared/calc.js';
import * as B from '@shared/budget.js';
import { SHORTCUTS, ask } from '@shared/assistant.js';
import { formatBR } from '@shared/dates.js';
import { Modal, Field, MoneyInput, inputToCents, centsToInput, Seg, brl, Progress, Alert, EmptyCta, useSubmit, useToast } from '../ui.jsx';
import { BillItem } from './Home.jsx';
import { EditTx } from './Lancamentos.jsx';
import { MonthSummary } from './Movimentacoes.jsx';
import Cenarios from './Cenarios.jsx';
import { settle } from '../actions.js';

const STEP = 500; // R$ 5,00 por toque nos botões − / +

function BudgetRow({ it, onSet, onUnlock, onToggleEssential }) {
  const [text, setText] = useState(centsToInput(it.amount));
  useEffect(() => { setText(centsToInput(it.amount)); }, [it.amount]);
  const commit = (v) => { const c = inputToCents(v); if (c != null && c >= 0) onSet(c); };
  return (
    <div className="budget-row">
      <div className="top">
        <span aria-hidden="true" style={{ fontSize: '1.2rem' }}>{it.icon || '•'}</span>
        <span className="name">{it.name}</span>
        {it.type === 'categoria' && (
          <button className="btn small ghost" onClick={onToggleEssential} aria-label={`${it.name}: ${it.essential ? 'essencial' : 'flexível'}. Tocar para mudar`}>
            <span className={`tag`}>{it.essential ? 'essencial' : 'flexível'}</span>
          </button>
        )}
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <div className="stepper">
          <button className="btn" onClick={() => onSet(Math.max(0, it.amount - STEP))} aria-label={`Diminuir ${it.name}`}>−</button>
          <div className="money-input"><span className="prefix">R$</span>
            <input className="input num" inputMode="decimal" value={text} aria-label={`Valor para ${it.name}`}
              onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ''))} onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commit(e.currentTarget.value)} />
          </div>
          <button className="btn" onClick={() => onSet(it.amount + STEP)} aria-label={`Aumentar ${it.name}`}>+</button>
        </div>
        <button className="btn small lock" aria-pressed={!!it.locked} onClick={() => (it.locked ? onUnlock() : onSet(it.amount))}>
          {it.locked ? '🔒 Fixado' : '🔓 Fixar'}
        </button>
      </div>
      <small className="muted">{it.reason}{it.short > 0 ? <> · <span className="warn">faltam {brl(it.short)} para o costume</span></> : ''}</small>
    </div>
  );
}

function Organizar() {
  const { data, today, reload, navState, setNavState } = useApp();
  const toast = useToast();
  const [locked, setLocked] = useState(() => navState?.lock || {});
  const [ess, setEss] = useState({});
  const [confirm, setConfirm] = useState(false);
  const [saveEss, setSaveEss] = useState(true);
  useEffect(() => { if (navState?.lock) setNavState(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const sug = useMemo(() => B.suggestBudget(data, today, { locked, essential: ess }), [data, today, locked, ess]);
  const usage = useMemo(() => B.budgetUsage(data, data.plan), [data]);
  const stale = useMemo(() => B.planStale(data, data.plan, today), [data, today]);
  const set = (key, v) => setLocked((x) => ({ ...x, [key]: v }));
  const unlock = (key) => setLocked((x) => { const n = { ...x }; delete n[key]; return n; });
  const groups = [
    ['Essenciais', 'Necessidades: o plano cobre primeiro.', sug.items.filter((i) => i.stage === 1)],
    ['Metas e reserva', 'Quanto separar agora para seus objetivos.', sug.items.filter((i) => i.stage === 2)],
    ['Flexíveis', 'Lazer, passeios e compras: ajustáveis quando aperta.', sug.items.filter((i) => i.stage === 3)],
  ];
  const loadCurrent = () => {
    if (!data.plan) return;
    setLocked(Object.fromEntries(data.plan.items.map((i) => [B.itemKey(i.type, i.ref_id), i.amount_cents])));
  };
  const s = useSubmit(async () => {
    if (sug.overLocked > 0) throw new Error('Os valores fixados passam do disponível.');
    if (saveEss) {
      for (const [id, v] of Object.entries(ess)) {
        const c = data.categories.find((x) => x.id === id);
        if (c && c.essential !== v) await put(`/categories/${id}`, { essential: v });
      }
    }
    const items = sug.items.filter((i) => i.amount > 0 || i.locked).map((i) => ({ type: i.type, ref_id: i.id, amount_cents: i.amount, locked: !!i.locked }));
    await post('/plans', { items });
    await reload();
    setConfirm(false);
    toast({ text: 'Plano salvo. Ele não tira dinheiro do saldo: serve de guia para seus gastos.', ok: true });
  });
  const old = new Map((data.plan?.items || []).map((i) => [B.itemKey(i.type, i.ref_id), i.amount_cents]));
  const essChanged = Object.entries(ess).some(([id, v]) => data.categories.find((c) => c.id === id)?.essential !== v);

  return (
    <div className="stack">
      <div className="sticky-sum">
        <div className="row between wrap">
          <div><small className="muted">Disponível para distribuir</small><div className="num" style={{ fontSize: '1.4rem', fontWeight: 750 }}>{brl(Math.max(0, sug.available))}</div></div>
          <div><small className="muted">Distribuído</small><div className="num" style={{ fontWeight: 650 }}>{brl(sug.distributed)}</div></div>
          <div><small className="muted">Falta distribuir</small><div className={`num ${sug.livre > 0 ? 'ok' : ''}`} style={{ fontWeight: 650 }}>{brl(sug.livre)}</div></div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div style={{ flex: 1 }}><Progress value={sug.pool ? sug.distributed / sug.pool : 0} /></div>
          <button className="btn small primary" disabled={sug.overLocked > 0 || sug.available < 0} onClick={() => setConfirm(true)}>Salvar</button>
        </div>
      </div>
      <p className="hint">Período: hoje até {formatBR(sug.period.end)} ({sug.days} dia(s)). Disponível = saldo nas contas de gasto ({brl(sug.sp.saldoBase)}) − contas até lá ({brl(sug.sp.compromissos)}) − já separado ({brl(sug.sp.separado)}). Recebimentos previstos ({brl(sug.sp.incomesTotal)}) não entram até chegarem.</p>
      {data.plan && stale.length > 0 && <Alert tone="warn">Seu plano salvo está desatualizado: {stale.join(' ')} Estes valores abaixo já estão recalculados — revise e confirme para substituir.</Alert>}
      {sug.available < 0 && <Alert tone="bad">Faltam {brl(-sug.available)} só para cobrir as contas até {formatBR(sug.period.end)}. Não há o que distribuir agora: veja as contas no Início e decida o que pagar primeiro ou adiar.</Alert>}
      {sug.overLocked > 0 && <Alert tone="bad">Os valores fixados passam {brl(sug.overLocked)} do disponível. Diminua algum valor fixado.</Alert>}
      {sug.available >= 0 && sug.totalShort > 0 && sug.overLocked === 0 && (
        <Alert tone="warn">O dinheiro não cobre tudo: faltam {brl(sug.totalShort)} para o que você costuma gastar e para as metas até {formatBR(sug.period.end)}.{sug.essentialShort > 0 ? ` Até os essenciais ficam ${brl(sug.essentialShort)} abaixo do costume.` : ''} Escolha onde ajustar: fixe valores menores em itens flexíveis ou diminua o aporte das metas.</Alert>
      )}
      {sug.window.short && <p className="hint">Você tem pouco histórico ainda; as sugestões usam a média dos gastos registrados. Ajuste à vontade.</p>}
      <div className="row wrap">
        {data.plan && <button className="btn small" onClick={loadCurrent}>Carregar meu plano salvo</button>}
        {Object.keys(locked).length > 0 && <button className="btn small ghost" onClick={() => setLocked({})}>Soltar todos os fixados</button>}
      </div>
      {groups.map(([title, desc, items]) => items.length > 0 && (
        <section className="card" key={title}>
          <h3>{title}</h3>
          <p className="hint">{desc}</p>
          {items.map((it) => (
            <BudgetRow key={it.key} it={it} onSet={(v) => set(it.key, v)} onUnlock={() => unlock(it.key)}
              onToggleEssential={() => setEss((x) => ({ ...x, [it.id]: !it.essential }))} />
          ))}
        </section>
      ))}
      <section className="card">
        <div className="row between"><h3>Livre para outras coisas</h3><b className="num">{brl(sug.livre)}</b></div>
        <p className="hint">O que não foi distribuído fica livre. Valores que você não fixou são recalculados automaticamente quando você muda outro.</p>
      </section>
      <button className="btn primary block" disabled={sug.overLocked > 0 || sug.available < 0} onClick={() => setConfirm(true)}>Revisar e salvar plano</button>
      {confirm && (
        <Modal title="Confirmar plano" onClose={() => setConfirm(false)}>
          <div className="stack">
            <p className="muted">Até {formatBR(sug.period.end)}. O plano é um guia: não desconta saldo e não vira despesa. Cada gasto registrado sai do saldo uma vez e aparece como “usado” na categoria.</p>
            <div className="calc">
              {sug.items.filter((i) => i.amount > 0 || old.has(i.key)).map((i) => (
                <div className="ln" key={i.key}><span>{i.icon} {i.name}</span><span className="num">{old.has(i.key) && old.get(i.key) !== i.amount ? <s className="faint">{brl(old.get(i.key))}</s> : null} {brl(i.amount)}</span></div>
              ))}
              <div className="ln"><span>Livre</span><span className="num">{brl(sug.livre)}</span></div>
            </div>
            {data.plan && <p className="warn">Isto substitui o plano salvo em {new Date(data.plan.created_at).toLocaleDateString('pt-BR')}.</p>}
            {essChanged && <label className="check"><input type="checkbox" checked={saveEss} onChange={(e) => setSaveEss(e.target.checked)} />Salvar também a mudança de essencial/flexível nas categorias</label>}
            {s.error && <p className="err">{s.error}</p>}
            <div className="form-actions"><button className="btn" onClick={() => setConfirm(false)}>Voltar</button><button className="btn primary" disabled={s.busy} onClick={() => s.run().catch(() => {})}>Confirmar e salvar</button></div>
          </div>
        </Modal>
      )}
      {usage && <p className="hint">Plano salvo atual: {brl(usage.plannedSpend)} em categorias, {brl(usage.spent)} já usados.</p>}
    </div>
  );
}

function Acompanhar() {
  const { data, today, go, open, reload } = useApp();
  const toast = useToast();
  const usage = useMemo(() => B.budgetUsage(data, data.plan), [data]);
  const stale = useMemo(() => B.planStale(data, data.plan, today), [data, today]);
  if (!usage) {
    return <EmptyCta icon="✦" title="Você ainda não tem um plano" text="O app sugere quanto destinar para cada categoria e meta usando seus dados. Você ajusta e confirma."
      action={<button className="btn primary" onClick={() => go('plano/organizar')}>Organizar meu dinheiro</button>} />;
  }
  const discard = async () => {
    if (!window.confirm('Descartar o plano atual? Seus lançamentos não mudam.')) return;
    await del('/plans/active'); await reload(); toast({ text: 'Plano descartado.', ok: true });
  };
  const cats = usage.items.filter((i) => i.type === 'categoria');
  const goals = usage.items.filter((i) => i.type === 'meta');
  return (
    <div className="stack">
      <p className="muted">Plano de {formatBR(data.plan.period_start)} até {formatBR(data.plan.period_end)}. Limite de gasto não é dinheiro separado: o saldo só diminui quando você registra um gasto.</p>
      {stale.length > 0 && <Alert tone="warn">{stale.join(' ')} <button className="btn small" onClick={() => go('plano/organizar')}>Recalcular</button></Alert>}
      <section className="card">
        <h3>Gastos planejados</h3>
        {cats.map((i) => (
          <div className="budget-row" key={i.ref_id}>
            <div className="row between"><span>{i.icon} {i.name}{i.archived ? ' (arquivada)' : ''}</span><span className="num">{brl(i.used)} de {brl(i.amount_cents)}</span></div>
            <Progress value={i.amount_cents ? i.used / i.amount_cents : i.used > 0 ? 1 : 0} tone={i.left < 0 ? 'bad' : i.amount_cents && i.used / i.amount_cents > 0.8 ? 'warn' : ''} />
            <small className={i.left < 0 ? 'bad' : 'muted'}>{i.left >= 0 ? `Restam ${brl(i.left)}` : `Passou ${brl(-i.left)} do planejado`}</small>
          </div>
        ))}
        {usage.unplanned > 0 && <p className="hint">Gastos fora do plano desde que foi criado: {brl(usage.unplanned)}.</p>}
      </section>
      {goals.length > 0 && (
        <section className="card">
          <h3>Para guardar</h3>
          {goals.map((i) => (
            <div className="budget-row" key={i.ref_id}>
              <div className="row between"><span>{i.icon} {i.name}</span><span className="num">{brl(i.used)} de {brl(i.amount_cents)}</span></div>
              <Progress value={i.amount_cents ? i.used / i.amount_cents : 1} />
              {i.left > 0 && <button className="btn small" onClick={() => open('guardei', { goalId: i.ref_id, amount: i.left })}>Separar {brl(i.left)} agora</button>}
            </div>
          ))}
          <p className="hint">Separar registra que esse dinheiro é da meta (deixa de aparecer como livre). Nada é movimentado no banco.</p>
        </section>
      )}
      <div className="row wrap"><button className="btn" onClick={() => go('plano/organizar')}>Ajustar valores</button><button className="btn ghost" onClick={discard}>Descartar plano</button></div>
    </div>
  );
}

function Assistente() {
  const { data, today, go, open, reload } = useApp();
  const toast = useToast();
  const [q, setQ] = useState(null);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [preview, setPreview] = useState(null);
  const sc = SHORTCUTS.find((x) => x.id === q);
  const input = { amount: inputToCents(amount) || undefined, categoryId: category || undefined };
  const needsAmount = sc?.needs?.includes('amount') && !input.amount;
  const r = useMemo(() => (q && !needsAmount ? ask(data, today, q, input) : null), [data, today, q, amount, category]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = useSubmit(async () => {
    const { method, path, body } = preview.request;
    await api(method, path, body);
    await reload();
    setPreview(null);
    toast({ text: 'Feito! Registrado como você confirmou.', ok: true });
  });
  const act = (a) => {
    if (a.type === 'navigate') go(a.to, a.lock ? { lock: a.lock } : null);
    if (a.type === 'open') open(a.modal === 'gasto' ? 'gastei' : a.modal, a.props);
    if (a.type === 'apply') setPreview(a);
  };
  return (
    <div className="stack">
      <p className="hint">Assistente por regras: não há IA conectada. As respostas são calculadas com os seus registros e nada é alterado sem você confirmar.</p>
      <div className="chips" role="list">
        {SHORTCUTS.map((s) => (
          <button key={s.id} role="listitem" className={`btn small ${q === s.id ? 'primary' : ''}`} onClick={() => { setQ(s.id); setCategory(''); }}>{s.label}</button>
        ))}
      </div>
      {sc?.needs?.includes('amount') && (
        <Field label="Valor"><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
      )}
      {r?.needs === 'category' && (
        <Field label={r.answer}>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Escolha…</option>
            {r.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
      )}
      {r && !r.needs && (
        <section className="card answer" aria-live="polite">
          <p className="main">{r.answer}</p>
          {r.reason && <p>{r.reason}</p>}
          <p className="hint">{r.period}</p>
          {r.caveats?.length > 0 && <p className="hint">Estimativa baseada nos seus registros. {r.caveats.join(' ')}</p>}
          {r.action && <button className="btn primary" onClick={() => act(r.action)}>{r.action.label}</button>}
        </section>
      )}
      {preview && (
        <Modal title="Confirmar" onClose={() => setPreview(null)}>
          <div className="stack">
            <p className="muted">Isto vai ser registrado:</p>
            <ul>{preview.preview.map((l, i) => <li key={i}>{l}</li>)}</ul>
            {apply.error && <p className="err">{apply.error}</p>}
            <div className="form-actions"><button className="btn" onClick={() => setPreview(null)}>Cancelar</button><button className="btn primary" disabled={apply.busy} onClick={() => apply.run().catch(() => {})}>Confirmar</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Revisao() {
  const { data, today, reload, go, open } = useApp();
  const toast = useToast();
  const r = useMemo(() => B.weeklyReview(data, today), [data, today]);
  const stale = useMemo(() => B.planStale(data, data.plan, today), [data, today]);
  const [edit, setEdit] = useState(null);
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const pay = async (b) => {
    try { await settle(b, today); await reload(); toast({ text: 'Marcada como paga.', ok: true }); } catch (e) { if (!e.cancelled) alert(e.message); }
  };
  const nothing = !r.overdue.length && !r.soon.length && !r.uncategorized.length && !r.oldBalances.length && !stale.length;
  return (
    <div className="stack">
      <p className="muted">Revisão rápida da semana: resolva o que estiver pendente em poucos toques.</p>
      {nothing && <Alert tone="ok">Tudo em ordem nesta semana.</Alert>}
      {(r.overdue.length > 0 || r.soon.length > 0) && (
        <section className="card"><h3>Contas pendentes (próximos 7 dias)</h3>
          {[...r.overdue, ...r.soon].map((b) => <BillItem key={b.id} b={b} cats={cats} today={today} onPay={pay} />)}
        </section>
      )}
      {r.uncategorized.length > 0 && (
        <section className="card"><h3>Gastos sem categoria ({r.uncategorized.length})</h3>
          {r.uncategorized.slice(0, 8).map((t) => (
            <div className="item" key={t.id}><div className="grow"><div className="t">{t.description || 'Gasto'}</div><div className="s">{formatBR(t.date)}</div></div><div className="amt num">{brl(t.amount_cents)}</div><button className="btn small" onClick={() => setEdit(t)}>Categorizar</button></div>
          ))}
        </section>
      )}
      {r.oldBalances.length > 0 && <Alert tone="warn">Saldos sem atualizar há mais de 2 semanas: {r.oldBalances.map((a) => a.name).join(', ')}. <button className="btn small" onClick={() => go('perfil/contas')}>Atualizar</button></Alert>}
      {stale.length > 0 && <Alert tone="warn">Plano desatualizado: {stale.join(' ')} <button className="btn small" onClick={() => go('plano/organizar')}>Revisar</button></Alert>}
      {r.goals.length > 0 && (
        <section className="card"><h3>Metas</h3>
          {r.goals.map((m) => (
            <div key={m.goal.id} className="budget-row">
              <div className="row between"><span>{m.goal.name}</span><span className="num">{brl(m.current)} de {brl(m.target)}</span></div>
              <Progress value={m.progress} tone={m.status === 'atrasada' ? 'warn' : m.status === 'vencida' ? 'bad' : ''} />
              {m.pendingThisMonth > 0 && m.status !== 'vencida' && <button className="btn small" onClick={() => open('guardei', { goalId: m.goal.id, amount: m.pendingThisMonth })}>Guardar {brl(m.pendingThisMonth)}</button>}
            </div>
          ))}
        </section>
      )}
      <MonthSummary />
      {edit && <EditTx tx={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

export default function Plano() {
  const { route, go } = useApp();
  const tab = route.sub || 'organizar';
  return (
    <>
      <TopBar title={tab === 'organizar' ? 'Organizar meu dinheiro' : 'Meu plano'} />
      <div className="tabs-scroll">
        <Seg value={tab} onChange={(t) => go(`plano/${t}`)} options={[['organizar', 'Organizar'], ['acompanhar', 'Acompanhar'], ['assistente', 'Assistente'], ['revisao', 'Revisão'], ['cenarios', 'Cenários']]} />
      </div>
      {tab === 'organizar' && <Organizar />}
      {tab === 'acompanhar' && <Acompanhar />}
      {tab === 'assistente' && <Assistente />}
      {tab === 'revisao' && <Revisao />}
      {tab === 'cenarios' && <Cenarios />}
    </>
  );
}
