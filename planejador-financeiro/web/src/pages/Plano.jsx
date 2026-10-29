import { useEffect, useMemo, useState } from 'react';
import { useApp, TopBar } from '../App.jsx';
import { api, get, post, put, del } from '../api.js';
import * as C from '@shared/calc.js';
import * as B from '@shared/budget.js';
import { SHORTCUTS, ask } from '@shared/assistant.js';
import { formatBR } from '@shared/dates.js';
import { Modal, Field, MoneyInput, inputToCents, centsToInput, Seg, brl, Progress, Alert, EmptyCta, Expander, SplitBar, useSubmit, useToast } from '../ui.jsx';
import { ApplyPlanModal, partsFromItems } from '../budgetui.jsx';
import { BillItem } from './Home.jsx';
import { EditTx } from './Lancamentos.jsx';
import { MonthSummary } from './Movimentacoes.jsx';
import Cenarios from './Cenarios.jsx';
import { settle } from '../actions.js';

const STEP = 500; // R$ 5,00 por toque nos botões − / +

// Pergunta prática para estimar uma categoria sem histórico (viagens × custo médio, ou valor por semana).
export function EstimateForm({ q, onDone, compact }) {
  const { reload } = useApp();
  const toast = useToast();
  const [trips, setTrips] = useState('');
  const [cost, setCost] = useState('');
  const [weekly, setWeekly] = useState('');
  const viagens = q.kind === 'viagens';
  const n = parseInt(trips, 10);
  const c = inputToCents(cost);
  const total = viagens ? (n >= 0 && c != null ? n * c : null) : inputToCents(weekly);
  const s = useSubmit(async () => {
    if (total == null || total < 0) throw new Error('Preencha os valores.');
    const note = viagens ? `${n} viage${n === 1 ? 'm' : 'ns'} × ${brl(c)} por semana` : `${brl(total)} por semana`;
    await put(`/categories/${q.category.id}`, { estimate_weekly_cents: total, estimate_note: note.slice(0, 80) });
    await reload();
    toast({ text: `Estimativa salva para ${q.category.name}.`, ok: true });
    onDone?.();
  });
  return (
    <div className={compact ? 'stack' : 'budget-row'}>
      <p style={{ margin: 0 }}>{q.text}</p>
      <div className="row wrap">
        {viagens ? (
          <>
            <Field label="Viagens por semana"><input className="input num" inputMode="numeric" value={trips} onChange={(e) => setTrips(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label={`Viagens de ${q.category.name} por semana`} /></Field>
            <Field label="Custo médio"><MoneyInput value={cost} onChange={setCost} /></Field>
          </>
        ) : (
          <Field label="Por semana"><MoneyInput value={weekly} onChange={setWeekly} /></Field>
        )}
      </div>
      {total != null && total >= 0 && <small className="muted">≈ {brl(total)} por semana · fica marcado como estimativa sua até haver gastos registrados.</small>}
      {s.error && <p className="err">{s.error}</p>}
      <div className="row"><button className="btn small primary" disabled={s.busy || total == null} onClick={() => s.run().catch(() => {})}>Usar esta estimativa</button></div>
    </div>
  );
}

function BudgetRow({ it, onSet, onUnlock, onToggleEssential }) {
  const [text, setText] = useState(centsToInput(it.amount));
  const [open, setOpen] = useState(false);
  useEffect(() => { setText(centsToInput(it.amount)); }, [it.amount]);
  const commit = (v) => { const c = inputToCents(v); if (c != null && c >= 0) onSet(c); };
  return (
    <div className="budget-row">
      <div className="top">
        <span className="ic" aria-hidden="true">{it.icon || '•'}</span>
        <button className="name linkish" onClick={() => setOpen(!open)} aria-expanded={open}>{it.name}
          <small>{it.type === 'meta' ? 'guardar para a meta' : `já gastou ${brl(it.spent || 0)} neste ciclo`}{it.source === 'estimativa' ? ' · estimativa sua' : ''}</small>
        </button>
        {it.type === 'categoria' && (
          <button className="btn small ghost" onClick={onToggleEssential} aria-label={`${it.name}: ${it.essential ? 'essencial' : 'flexível'}. Tocar para mudar`}>
            <span className="tag">{it.essential ? 'essencial' : 'flexível'}</span>
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
          {it.locked ? 'Fixado' : 'Fixar'}
        </button>
      </div>
      {it.type === 'categoria' && it.amount > 0 && <small className="muted">Resta {brl(Math.max(0, it.amount - (it.spent || 0)))} se contar o que já gastou desde {formatBR(it.cycleStart)}.</small>}
      <Expander open={open}>
        <div className="why">
          <p>{it.reason}</p>
          {it.effect && <p>{it.effect}</p>}
          {it.short > 0 && <p className="warn">Abaixo do necessário: faltam {brl(it.short)}.</p>}
        </div>
      </Expander>
    </div>
  );
}

function StylePick({ value, onChange }) {
  return (
    <div className="style-pick" role="group" aria-label="Como priorizar depois das contas">
      {Object.entries(B.STYLES).map(([k, s]) => (
        <button key={k} aria-pressed={value === k} onClick={() => onChange(k)}><b>{s.label}</b><small>{s.desc}</small></button>
      ))}
    </div>
  );
}

function Organizar() {
  const { data, today, reload, navState, setNavState } = useApp();
  const toast = useToast();
  const [locked, setLocked] = useState(() => navState?.lock || {});
  const [style, setStyle] = useState(() => navState?.style || data.profile?.budget_style || 'equilibrado');
  const [ess, setEss] = useState({});
  const [confirm, setConfirm] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  useEffect(() => { if (navState?.lock || navState?.style) setNavState(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const sug = useMemo(() => B.suggestBudget(data, today, { locked, essential: ess, style }), [data, today, locked, ess, style]);
  const questions = useMemo(() => B.budgetQuestions(data, today), [data, today]);
  const usage = useMemo(() => B.budgetUsage(data, data.plan), [data]);
  const stale = useMemo(() => B.planStale(data, data.plan, today), [data, today]);
  const set = (key, v) => setLocked((x) => ({ ...x, [key]: v }));
  const unlock = (key) => setLocked((x) => { const n = { ...x }; delete n[key]; return n; });
  const items = sug.items.map((i) => ({ ...i, cycleStart: sug.cycleStart }));
  const groups = [
    ['Contas do dia a dia e necessidades', 'O plano cobre primeiro.', items.filter((i) => i.stage === 1)],
    ['Guardar para minhas metas', 'Quanto separar agora para seus objetivos.', items.filter((i) => i.type === 'meta')],
    ['Para viver', 'Lazer, passeios, namoro e compras. Fazem parte do plano.', items.filter((i) => i.stage !== 1 && i.type !== 'meta')],
  ];
  const loadCurrent = () => {
    if (!data.plan) return;
    setLocked(Object.fromEntries(data.plan.items.map((i) => [B.itemKey(i.type, i.ref_id), i.amount_cents])));
  };
  const chooseStyle = async (k) => {
    setStyle(k);
    try { await put('/profile', { budget_style: k }); } catch { /* a escolha vale na simulação mesmo sem salvar */ }
  };
  const confirmPlan = async () => {
    for (const [id, v] of Object.entries(ess)) {
      const c = data.categories.find((x) => x.id === id);
      if (c && c.essential !== v) await put(`/categories/${id}`, { essential: v });
    }
    setConfirm(true);
  };
  const lockedCount = Object.keys(locked).length;

  return (
    <div className="stack">
      <div className="sticky-sum">
        <div className="row between wrap">
          <div><small className="muted">Pode dividir</small><div className="num big-serif">{brl(Math.max(0, sug.available))}</div></div>
          <div><small className="muted">Dividido</small><div className="num">{brl(sug.distributed)}</div></div>
          <div><small className="muted">Livre</small><div className={`num ${sug.livre > 0 ? 'ok' : ''}`}>{brl(sug.livre)}</div></div>
        </div>
        <SplitBar parts={partsFromItems(sug.items, sug.livre)} />
      </div>
      <p className="hint">Período: hoje até {formatBR(sug.period.end)} ({sug.days} dia(s)). Pode dividir = dinheiro nas contas ({brl(sug.sp.saldoBase)}) − contas para pagar até lá ({brl(sug.sp.compromissos)}) − já separado ({brl(sug.sp.separado)}). Recebimentos previstos ({brl(sug.sp.incomesTotal)}) só entram quando chegarem.</p>
      {data.plan && stale.length > 0 && <Alert tone="warn">Seu plano salvo está desatualizado: {stale.join(' ')} Os valores abaixo já estão recalculados — revise e aplique para substituir.</Alert>}
      {sug.available < 0 && <Alert tone="bad">Faltam {brl(-sug.available)} só para cobrir as contas até {formatBR(sug.period.end)}. Não há o que dividir agora. Alternativas: confirmar um recebimento quando chegar, adiar ou negociar uma conta, ou usar a reserva.</Alert>}
      {sug.overLocked > 0 && <Alert tone="bad">Os valores fixados passam {brl(sug.overLocked)} do que dá para dividir. Diminua algum valor fixado.</Alert>}
      {sug.available >= 0 && sug.totalShort > 0 && sug.overLocked === 0 && (
        <Alert tone="warn">O dinheiro não cobre tudo: faltam {brl(sug.totalShort)} para o necessário e para as metas até {formatBR(sug.period.end)}.{sug.essentialShort > 0 ? ` Até as necessidades ficam ${brl(sug.essentialShort)} abaixo.` : ''} Fixe valores menores em itens flexíveis, diminua o aporte das metas ou espere o próximo dinheiro entrar.</Alert>
      )}

      <section>
        <h3>Depois das contas, o que vem primeiro?</h3>
        <StylePick value={style} onChange={chooseStyle} />
      </section>

      {(questions.categories.length > 0 || questions.noBills) && (
        <section className="card">
          <button className="row between linkish block" onClick={() => setAskOpen(!askOpen)} aria-expanded={askOpen}>
            <span><b>Me ajude a estimar</b><br /><small className="muted">{questions.categories.length} categoria(s) sem histórico suficiente{questions.noBills ? ' · nenhuma conta fixa cadastrada' : ''}</small></span>
            <span className="tag est">estimativas</span>
          </button>
          <Expander open={askOpen}>
            <div className="stack" style={{ paddingTop: 12 }}>
              {questions.noBills && <p className="hint">Você não cadastrou contas obrigatórias (aluguel, internet, celular…). Se tiver, cadastre em Perfil › Gastos fixos para o app reservar antes de dividir.</p>}
              {questions.categories.map((q) => <EstimateForm key={q.category.id} q={q} />)}
            </div>
          </Expander>
        </section>
      )}

      <div className="row wrap">
        {data.plan && <button className="btn small" onClick={loadCurrent}>Carregar meu plano salvo</button>}
        {lockedCount > 0 && <button className="btn small ghost" onClick={() => setLocked({})}>Redistribuir tudo automaticamente</button>}
      </div>
      {lockedCount > 0 && <p className="hint">{lockedCount} valor(es) fixado(s). O restante é redistribuído automaticamente pela ordem do estilo escolhido.</p>}
      {groups.map(([title, desc, list]) => list.length > 0 && (
        <section className="card" key={title}>
          <h3>{title}</h3>
          <p className="hint">{desc}</p>
          {list.map((it) => (
            <BudgetRow key={it.key} it={it} onSet={(v) => set(it.key, v)} onUnlock={() => unlock(it.key)}
              onToggleEssential={() => setEss((x) => ({ ...x, [it.id]: !it.essential }))} />
          ))}
        </section>
      ))}
      <section className="card">
        <div className="row between"><h3>Livre</h3><b className="num">{brl(sug.livre)}</b></div>
        <p className="hint">O que não foi dividido fica livre. Separar no aplicativo é planejamento: nada é transferido no banco.</p>
      </section>
      <div className="actions-bar">
        <button className="btn primary" disabled={sug.overLocked > 0 || sug.available < 0} onClick={() => confirmPlan().catch((e) => toast({ text: e.message }))}>Aplicar plano</button>
        <button className="btn" onClick={() => { const ks = Object.keys(B.STYLES); chooseStyle(ks[(ks.indexOf(style) + 1) % ks.length]); }}>Simular outra divisão</button>
      </div>
      {confirm && <ApplyPlanModal sug={sug} onClose={async () => { setConfirm(false); await reload(); }} />}
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
    return <EmptyCta icon="plano" title="Você ainda não tem um plano" text="O app sugere quanto destinar para cada categoria e meta usando seus dados. Você ajusta e confirma."
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


// Pergunta livre: a IA no servidor recebe só um resumo calculado e explica; os números vêm do app.
function AskAi({ status }) {
  const { go } = useApp();
  const [question, setQuestion] = useState('');
  const [res, setRes] = useState(null);
  const s = useSubmit(async () => {
    const q = question.trim();
    if (!q) throw new Error('Escreva sua pergunta.');
    try {
      setRes(await post('/ai/ask', { question: q }));
    } catch (e) {
      setRes({ error: e.message, rules: e.data?.rules });
    }
  });
  if (status == null) return null;
  return (
    <section className="ask-box">
      <h3>Pergunte com suas palavras</h3>
      {!status.configured ? (
        <p className="hint">A IA ainda não está conectada: o servidor precisa da chave da Anthropic configurada como segredo (ANTHROPIC_API_KEY). Enquanto isso, os atalhos acima respondem com os cálculos do app.</p>
      ) : (
        <>
          <p className="hint">Resposta escrita por IA (Claude) a partir dos números calculados pelo app. Ela recebe só valores e nomes de categorias e metas — nunca senha, usuário ou nomes de contas.</p>
          <textarea className="input" rows={2} maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ex.: quero sair sexta e sábado, quanto posso usar sem atrasar a viagem?" aria-label="Sua pergunta" />
          <div className="row"><button className="btn primary" disabled={s.busy} onClick={() => s.run().catch(() => {})}>{s.busy ? 'Pensando…' : 'Perguntar'}</button></div>
          {s.error && <p className="err">{s.error}</p>}
        </>
      )}
      {res && (
        <div className="answer" aria-live="polite">
          {res.error ? <p className="err">{res.error}</p> : <p className="main">{res.texto}</p>}
          {res.pergunta && <p><b>Para melhorar a resposta:</b> {res.pergunta}</p>}
          {res.note && <p className="warn">{res.note}</p>}
          {res.proposal && (
            <>
              <SplitBar parts={res.proposal.items.filter((i) => i.amount > 0).map((i) => ({ label: i.name, value: i.amount, color: i.locked ? 'var(--accent)' : 'var(--fill-strong)' })).concat(res.proposal.livre > 0 ? [{ label: 'Livre', value: res.proposal.livre, color: 'var(--fill)' }] : [])} label="Proposta da IA" />
              <button className="btn primary" onClick={() => go('plano/organizar', { lock: res.proposal.locked })}>Ver e confirmar a proposta</button>
            </>
          )}
          {res.rules && <p className="hint">Cálculo do app: {res.rules}</p>}
          <p className="src">{res.error ? 'Planejador numérico' : `IA · ${res.model || 'Claude'} · confira antes de aplicar`}</p>
        </div>
      )}
    </section>
  );
}

function Assistente() {
  const { data, today, go, open, reload } = useApp();
  const toast = useToast();
  const [q, setQ] = useState(null);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState(null);
  useEffect(() => { get('/ai/status').then(setStatus).catch(() => setStatus({ configured: false })); }, []);
  const sc = SHORTCUTS.find((x) => x.id === q);
  const input = { amount: inputToCents(amount) || undefined, categoryId: category || undefined };
  const needsAmount = sc?.needs?.includes('amount') && !input.amount;
  const r = useMemo(() => (q && !needsAmount ? ask(data, today, q, input) : null), [data, today, q, amount, category]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = useSubmit(async () => {
    const reqs = preview.requests || (preview.request ? [preview.request] : []);
    for (const { method, path, body } of reqs) await api(method, path, body);
    await reload();
    setPreview(null);
    toast({ text: 'Feito! Registrado como você confirmou.', ok: true });
  });
  const act = (a) => {
    if (a.type === 'navigate') go(a.to, a.lock ? { lock: a.lock } : a.style ? { style: a.style } : null);
    if (a.type === 'open') open(a.modal === 'gasto' ? 'gastei' : a.modal, a.props);
    if (a.type === 'apply') setPreview(a);
  };
  return (
    <div className="stack">
      <p className="hint">Os atalhos respondem com cálculos do app sobre os seus registros. Nada é alterado sem você confirmar.</p>
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
      {r?.needs === 'estimate' && (
        <section className="answer">
          <EstimateForm compact q={{ category: r.category, kind: 'viagens', text: r.answer }} />
        </section>
      )}
      {r && !r.needs && (
        <section className="answer" aria-live="polite">
          <p className="main">{r.answer}</p>
          {r.reason && <p>{r.reason}</p>}
          <p className="hint">{r.period}</p>
          {r.caveats?.length > 0 && <p className="hint">Estimativa baseada nos seus registros. {r.caveats.join(' ')}</p>}
          {r.action && <button className="btn primary" onClick={() => act(r.action)}>{r.action.label}</button>}
          <p className="src">Cálculo do app</p>
        </section>
      )}
      <AskAi status={status} />
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
