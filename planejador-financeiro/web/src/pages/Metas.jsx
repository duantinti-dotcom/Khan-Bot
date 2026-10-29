import { useMemo, useState } from 'react';
import { useApp, TopBar } from '../App.jsx';
import { post, put, del } from '../api.js';
import * as C from '@shared/calc.js';
import { formatBR, birthdayAtAge, describeDuration, ageOn, diffDays } from '@shared/dates.js';
import { parseGoalText } from '@shared/parse.js';
import { Modal, Field, MoneyInput, inputToCents, centsToInput, Seg, brl, Money, Progress, Ring, GoalChart, Alert, useSubmit, useToast, Empty } from '../ui.jsx';
import { GoalStatus } from './Home.jsx';
import { AccountSelect } from '../forms/Recebi.jsx';

const PRIORITY = { 1: 'Alta', 2: 'Média', 3: 'Baixa' };
const FREQ = { semanal: 'por semana', quinzenal: 'a cada 14 dias', mensal: 'por mês' };

export function GoalForm({ goal, onClose }) {
  const { data, today, reload } = useApp();
  const toast = useToast();
  const birth = data.profile.birth_date;
  const accounts = data.accounts.filter((a) => !a.archived);
  const [text, setText] = useState('');
  const [f, setF] = useState(() => ({
    name: goal?.name || '', kind: goal?.kind || 'meta', target: centsToInput(goal?.target_cents), priority: goal?.priority || 2,
    type: goal?.target_type || (birth ? 'idade' : 'data'), age: goal?.target_age ? String(goal.target_age) : '', date: goal?.target_date || '',
    real: goal?.real_terms || false, plan: centsToInput(goal?.plan_amount_cents), freq: goal?.plan_frequency || 'mensal',
    place: goal?.place_account_id || '', placeNote: goal?.place_note || '', note: goal?.note || '', initial: '', initialAcc: accounts.find((a) => a.purpose !== 'gastar')?.id || accounts[0]?.id,
  }));
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }));
  const deadline = f.type === 'idade' ? (birth && f.age ? birthdayAtAge(birth, Number(f.age)) : null) : f.date || null;
  const understand = () => {
    const p = parseGoalText(text);
    setF((x) => ({ ...x, name: p.name || x.name || (p.target_age ? `Meta dos ${p.target_age} anos` : x.name), target: p.target_cents ? centsToInput(p.target_cents) : x.target, type: p.target_type || x.type, age: p.target_age ? String(p.target_age) : x.age, date: p.target_date || x.date }));
  };
  const s = useSubmit(async () => {
    const target = inputToCents(f.target);
    if (!target || target <= 0) throw new Error('Informe o valor desejado.');
    if (!f.name.trim()) throw new Error('Dê um nome para a meta.');
    if (f.type === 'idade' && !f.age) throw new Error('Informe a idade.');
    if (f.type === 'data' && !f.date) throw new Error('Informe a data.');
    const plan = inputToCents(f.plan);
    const body = {
      name: f.name.trim(), kind: f.kind, target_cents: target, priority: Number(f.priority), target_type: f.type,
      target_age: f.type === 'idade' ? Number(f.age) : null, target_date: f.type === 'data' ? f.date : null, real_terms: f.real,
      plan_amount_cents: plan > 0 ? plan : null, plan_frequency: plan > 0 ? f.freq : null,
      place_account_id: f.place || null, place_note: f.placeNote.trim() || null, note: f.note.trim() || null,
    };
    if (goal) await put(`/goals/${goal.id}`, body);
    else {
      const init = inputToCents(f.initial);
      await post('/goals', { ...body, initial: init > 0 ? { amount_cents: init, account_id: f.initialAcc } : undefined });
    }
    await reload(); toast(goal ? 'Meta atualizada.' : 'Meta criada.'); onClose();
  });
  return (
    <Modal title={goal ? 'Editar meta' : 'Nova meta'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); s.run().catch(() => {}); }}>
        {!goal && (
          <Field label="Descreva em uma frase (opcional)" hint='Ex.: “Quero ter R$10.000 quando completar 20 anos”'>
            <div className="row"><input className="input" aria-label="Frase da meta" value={text} onChange={(e) => setText(e.target.value)} /><button type="button" className="btn" onClick={understand}>Entender</button></div>
          </Field>
        )}
        <div className="form-grid">
          <Field label="Nome"><input className="input" value={f.name} onChange={set('name')} /></Field>
          <Field label="Valor desejado"><MoneyInput value={f.target} onChange={set('target')} /></Field>
          <Field label="Tipo"><select className="input" value={f.kind} onChange={set('kind')}><option value="meta">Meta</option><option value="reserva">Reserva para imprevistos</option></select></Field>
          <Field label="Prioridade"><select className="input" value={f.priority} onChange={set('priority')}>{[1, 2, 3].map((p) => <option key={p} value={p}>{PRIORITY[p]}</option>)}</select></Field>
          <div className="full"><Seg value={f.type} onChange={set('type')} options={[['idade', 'Quando eu tiver uma idade'], ['data', 'Até uma data']]} /></div>
          {f.type === 'idade' ? (
            <Field label="Idade" hint={!birth ? 'Informe sua data de nascimento em “Minha conta” para calcular o prazo.' : deadline ? `Prazo: ${formatBR(deadline)} (aniversário de ${f.age} anos)${deadline < today ? ' — já passou' : ''}` : undefined}>
              <input className="input" inputMode="numeric" value={f.age} onChange={(e) => set('age')(e.target.value.replace(/\D/g, '').slice(0, 3))} />
            </Field>
          ) : (
            <Field label="Data"><input className="input" type="date" value={f.date} onChange={set('date')} /></Field>
          )}
          <Field label="Aporte planejado (opcional)"><MoneyInput value={f.plan} onChange={set('plan')} /></Field>
          <Field label="Frequência do aporte"><select className="input" value={f.freq} onChange={set('freq')}><option value="semanal">Semanal</option><option value="quinzenal">A cada 14 dias</option><option value="mensal">Mensal</option></select></Field>
          <AccountSelect value={f.place} onChange={set('place')} accounts={accounts} label="Onde pretende guardar" allowEmpty />
          <Field label="Ou descreva o lugar"><input className="input" value={f.placeNote} onChange={set('placeNote')} placeholder="Ex.: Tesouro Selic, caixinha" /></Field>
          {!goal && (
            <>
              <Field label="Já tenho destinado a ela (opcional)"><MoneyInput value={f.initial} onChange={set('initial')} /></Field>
              <AccountSelect value={f.initialAcc} onChange={set('initialAcc')} accounts={accounts} label="Esse valor está em" />
            </>
          )}
          <label className="check full"><input type="checkbox" checked={f.real} onChange={set('real')} />O valor representa o <b>poder de compra de hoje</b> (corrigir pela inflação nas simulações)</label>
          <Field label="Observação" full><input className="input" value={f.note} onChange={set('note')} /></Field>
        </div>
        {deadline && inputToCents(f.target) > 0 && deadline > today && (
          <p className="hint">Prazo de {describeDuration(today, deadline)}. Sem rendimento, seriam cerca de {brl(Math.ceil((inputToCents(f.target) - (inputToCents(f.initial) || 0)) / Math.max(1, diffDays(today, deadline) / C.DIAS_POR_MES)))} por mês.</p>
        )}
        {s.error && <p className="err">{s.error}</p>}
        <button className="btn primary block" disabled={s.busy}>{goal ? 'Salvar' : 'Criar meta'}</button>
      </form>
    </Modal>
  );
}

function Simulation({ m }) {
  const { data } = useApp();
  const [rate, setRate] = useState(data.profile.sim_yield_annual != null ? String((data.profile.sim_yield_annual * 100).toFixed(2)).replace('.', ',') : '');
  const [inf, setInf] = useState(data.profile.sim_inflation_annual != null ? String((data.profile.sim_inflation_annual * 100).toFixed(2)).replace('.', ',') : '');
  const [taxed, setTaxed] = useState(true);
  const months = Math.max(0, Math.floor(m.monthsLeft || 0));
  const r = parseFloat((rate || '0').replace(',', '.')) / 100 || 0;
  const i = parseFloat((inf || '0').replace(',', '.')) / 100 || 0;
  const monthly = m.planMonthly || m.perMonth || 0;
  const sim = useMemo(() => C.simulate({ initial: m.current, monthly, months, annualRate: r, annualInflation: i, taxed }), [m.current, monthly, months, r, i, taxed]);
  const rm = C.annualToMonthly(r);
  const need = C.requiredMonthly(m.target, m.current, months, rm);
  const targetNominal = m.goal.real_terms && i ? C.inflate(m.target, i, (m.daysLeft || 0) / 365.25) : m.target;
  const save = async () => { await put('/profile', { sim_yield_annual: r || null, sim_inflation_annual: i || null }); };
  if (!months) return <p className="hint">Simulações precisam de pelo menos 1 mês de prazo.</p>;
  return (
    <div className="stack">
      <Alert tone="info">Simulação opcional com <b>premissas suas</b>. Não é previsão nem promessa de retorno. O cenário principal do app é sem rendimento.</Alert>
      <div className="form-grid">
        <Field label="Rendimento anual estimado (% a.a.)" hint={r ? `Equivale a ${(rm * 100).toFixed(4).replace('.', ',')}% ao mês (juros compostos)` : 'Deixe vazio para 0%'}><input className="input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} onBlur={save} placeholder="ex.: 10" /></Field>
        <Field label="Inflação anual estimada (% a.a.)" hint="Para ver o valor em poder de compra de hoje"><input className="input" inputMode="decimal" value={inf} onChange={(e) => setInf(e.target.value)} onBlur={save} placeholder="ex.: 4" /></Field>
        <label className="check full"><input type="checkbox" checked={taxed} onChange={(e) => setTaxed(e.target.checked)} />Estimar Imposto de Renda pela tabela regressiva de renda fixa (22,5% a 15% sobre o rendimento)</label>
      </div>
      <div className="calc">
        <div className="ln"><span>Aportando {brl(monthly)}/mês por {months} meses</span><span /></div>
        <div className="ln"><span>Total aportado (com o que já tem)</span><Money c={sim.final.invested} /></div>
        <div className="ln"><span>Valor bruto estimado</span><Money c={sim.final.gross} /></div>
        {taxed && <div className="ln"><span>− IR estimado sobre o rendimento</span><Money c={-sim.final.tax} /></div>}
        <div className="ln"><span>Valor líquido estimado (antes de outras taxas)</span><Money c={sim.final.net} /></div>
        {i > 0 && <div className="ln"><span>Em poder de compra de hoje</span><Money c={sim.final.real} /></div>}
      </div>
      <p>Com essa taxa, o aporte mensal necessário (bruto, sem IR) seria <b className="num">{brl(need)}</b> em vez de {brl(m.perMonth)} sem rendimento.</p>
      {m.goal.real_terms && i > 0 && <p>Como a meta está em poder de compra de hoje, com {inf}% a.a. de inflação ela equivaleria a <b className="num">{brl(targetNominal)}</b> na data do prazo.</p>}
      <p className="hint">Premissas: taxa anual convertida para mensal por (1+a)^(1/12)−1; aportes no fim de cada mês; IR de renda fixa calculado por aporte conforme o tempo aplicado (até 180 dias 22,5%, até 360 dias 20%, até 720 dias 17,5%, acima 15%). Não considera IOF (resgates com menos de 30 dias), taxas de custódia, poupança/LCI/LCA (isentas de IR para pessoa física) nem variação da taxa.</p>
    </div>
  );
}

function GoalDetail({ m, onClose }) {
  const { data, today, reload, open } = useApp();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [tab, setTab] = useState('resumo');
  const accs = new Map(data.accounts.map((a) => [a.id, a]));
  const points = C.goalSeries(m, today);
  const removeContribution = async (c) => {
    if (!window.confirm('Excluir este registro de aporte/resgate?')) return;
    try { await del(`/contributions/${c.id}`); await reload(); toast('Excluído.'); } catch (e) { alert(e.message); }
  };
  const archive = async () => { await put(`/goals/${m.goal.id}`, { archived: !m.goal.archived }); await reload(); onClose(); };
  const remove = async () => {
    if (!window.confirm('Excluir a meta e todos os registros de aportes dela? O dinheiro volta a ser “não destinado” nas contas.')) return;
    await del(`/goals/${m.goal.id}`); await reload(); onClose();
  };
  const place = m.goal.place_account_id ? accs.get(m.goal.place_account_id)?.name : m.goal.place_note;
  return (
    <Modal title={m.goal.name} onClose={onClose} wide>
      {edit ? <GoalForm goal={m.goal} onClose={() => setEdit(false)} /> : (
        <div className="stack">
          <div className="row wrap" style={{ gap: 16 }}>
            <Ring value={m.progress} />
            <div className="grow">
              <p className="num" style={{ fontSize: '1.4rem', fontWeight: 700 }}>{brl(m.current)} <span className="muted" style={{ fontSize: '1rem' }}>de {brl(m.target)}</span></p>
              <GoalStatus m={m} />
              <p className="muted">Prioridade {PRIORITY[m.goal.priority]}{place ? ` · guardando em ${place}` : ''}{m.goal.real_terms ? ' · valor em poder de compra de hoje' : ''}</p>
            </div>
          </div>
          <Seg value={tab} onChange={setTab} options={[['resumo', 'Resumo'], ['aportes', 'Aportes'], ['simular', 'Simular rendimento']]} />
          {tab === 'resumo' && <GoalSummary m={m} />}
          {tab === 'resumo' && points.length > 0 && <GoalChart points={points} target={m.target} deadline={m.deadline} start={m.goal.created_at < points[0].date ? m.goal.created_at : points[0].date} />}
          {tab === 'aportes' && (
            <div className="list">
              {!m.contributions.length && <Empty>Nenhum aporte ainda.</Empty>}
              {[...m.contributions].reverse().map((c) => (
                <div className="item" key={c.id}>
                  <div className="grow"><div className="t">{c.source === 'inicial' ? 'Valor inicial' : c.source === 'resgate' ? 'Resgate' : c.source === 'divisao' ? 'Divisão de entrada' : c.source === 'ajuste' ? 'Movido entre contas' : 'Aporte'}</div><div className="s">{formatBR(c.date)} · {accs.get(c.account_id)?.name}{c.note ? ` · ${c.note}` : ''}</div></div>
                  <Money c={c.amount_cents} sign />
                  <button className="btn small ghost" onClick={() => removeContribution(c)} aria-label="Excluir">✕</button>
                </div>
              ))}
            </div>
          )}
          {tab === 'simular' && <Simulation m={m} />}
          <div className="row wrap">
            <button className="btn primary" onClick={() => { onClose(); open('guardei', { goalId: m.goal.id }); }}>Guardei</button>
            <button className="btn" onClick={() => setEdit(true)}>Editar</button>
            <button className="btn" onClick={archive}>{m.goal.archived ? 'Reativar' : 'Arquivar'}</button>
            <div className="spacer" />
            <button className="btn danger" onClick={remove}>Excluir</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function GoalSummary({ m }) {
  const { today } = useApp();
  if (m.status === 'sem_prazo') return <Alert tone="warn">Essa meta usa idade como prazo. Informe sua data de nascimento em “Minha conta” para o app calcular o prazo pelo seu aniversário.</Alert>;
  if (m.status === 'atingida') return <Alert tone="ok">Meta atingida! Você já tem {brl(m.current)} (alvo {brl(m.target)}).</Alert>;
  if (m.status === 'vencida') return <Alert tone="bad">O prazo terminou em {formatBR(m.deadline)} e faltam {brl(m.remaining)}. Edite a meta para definir um novo prazo ou valor.</Alert>;
  return (
    <div className="stack">
      {m.shortDeadline && <Alert tone="warn">Prazo muito curto ({m.daysLeft} dia(s)): o valor que falta precisaria entrar inteiro nesse período.</Alert>}
      <div className="kpis">
        <div className="kpi"><div className="l">Falta</div><div className="v num">{brl(m.remaining)}</div></div>
        <div className="kpi"><div className="l">Prazo</div><div className="v">{formatBR(m.deadline)}</div><small>{describeDuration(today, m.deadline)}</small></div>
        <div className="kpi"><div className="l">Por mês</div><div className="v num">{brl(m.perMonth)}</div></div>
        <div className="kpi"><div className="l">Por semana</div><div className="v num">{brl(m.perWeek)}</div></div>
        <div className="kpi"><div className="l">Neste mês</div><div className="v num">{brl(m.contributedThisMonth)}</div><small>faltam {brl(m.pendingThisMonth)}</small></div>
        <div className="kpi"><div className="l">Esperado hoje</div><div className="v num">{brl(m.expectedNow)}</div><small>trajetória linear</small></div>
      </div>
      <div className="calc">
        <div className="ln"><span>Seu ritmo real (últimos {m.windowDays} dias)</span><b className="num">{brl(m.paceMonthly)}/mês</b></div>
        <div className="ln"><span>No ritmo real, no prazo você teria</span><b className={`num ${m.projPace >= m.target ? 'ok' : 'warn'}`}>{brl(m.projPace)}</b></div>
        {m.paceDate && <div className="ln"><span>No ritmo real, chegaria lá em</span><b>{formatBR(m.paceDate)}</b></div>}
        {m.planMonthly > 0 && <div className="ln"><span>Com o aporte planejado ({brl(m.goal.plan_amount_cents)} {FREQ[m.goal.plan_frequency]})</span><b className={`num ${m.planEnough ? 'ok' : 'warn'}`}>{brl(m.projPlan)}</b></div>}
      </div>
      {m.planMonthly > 0 && !m.planEnough && <p className="warn">O aporte planejado não alcança a meta no prazo: faltariam {brl(m.target - m.projPlan)}.</p>}
      {m.nextPlanned.length > 0 && <p className="hint">Próximos aportes planejados: {m.nextPlanned.map(formatBR).join(', ')}.</p>}
      <p className="hint">Cálculo sem rendimento: quanto falta ÷ meses restantes (dias ÷ 30,44). O prazo por idade usa a data exata do aniversário.</p>
    </div>
  );
}

export default function Metas() {
  const { data, today } = useApp();
  const [form, setForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const all = useMemo(() => C.sortGoals(data.goals.filter((g) => showArchived || !g.archived).map((g) => C.goalMetrics(g, data, today))), [data, today, showArchived]);
  const sel = detail && all.find((m) => m.goal.id === detail);
  const age = data.profile.birth_date ? ageOn(data.profile.birth_date, today) : null;
  return (
    <>
      <TopBar title="Metas" subtitle={age != null ? `Você tem ${age} anos` : undefined}>
        <button className="btn primary" onClick={() => setForm(true)}>+ Nova</button>
      </TopBar>
      {all.length > 0 && (
        <div className="kpis" style={{ marginTop: 0, marginBottom: 16 }}>
          <div className="kpi"><div className="l">Guardado nas metas</div><div className="v num">{brl(all.filter((m) => !m.goal.archived).reduce((s, m) => s + m.current, 0))}</div></div>
          <div className="kpi"><div className="l">Falta guardar neste mês</div><div className="v num">{brl(all.filter((m) => !m.goal.archived && m.status !== 'vencida').reduce((s, m) => s + m.pendingThisMonth, 0))}</div></div>
        </div>
      )}
      {!data.profile.birth_date && data.goals.some((g) => g.target_type === 'idade') && <Alert tone="warn">Informe sua data de nascimento em <a href="#/conta">Minha conta</a> para calcular metas por idade.</Alert>}
      {!all.length && <div className="card"><Empty>Nenhuma meta ainda. Que tal “Quero ter R$10.000 quando completar 20 anos”? Cada pessoa define a sua.</Empty></div>}
      <div className="grid three">
        {all.map((m) => (
          <button key={m.goal.id} className="card" style={{ textAlign: 'left', cursor: 'pointer', opacity: m.goal.archived ? 0.6 : 1 }} onClick={() => setDetail(m.goal.id)}>
            <div className="row between"><h3>{m.goal.kind === 'reserva' ? '🛟 ' : ''}{m.goal.name}</h3><GoalStatus m={m} /></div>
            <p className="num" style={{ margin: '10px 0 6px' }}><b style={{ fontSize: '1.25rem' }}>{brl(m.current)}</b> <span className="muted">de {brl(m.target)}</span></p>
            <Progress value={m.progress} tone={m.status === 'atrasada' ? 'warn' : m.status === 'vencida' ? 'bad' : ''} />
            <p className="hint" style={{ marginTop: 8 }}>
              {m.status === 'atingida' ? 'Concluída' : m.status === 'vencida' ? `Prazo vencido em ${formatBR(m.deadline)}` : m.status === 'sem_prazo' ? 'Informe a data de nascimento' : `${brl(m.perMonth)}/mês · ${brl(m.perWeek)}/semana até ${formatBR(m.deadline)}`}
            </p>
            {m.pendingThisMonth > 0 && m.status !== 'vencida' && <p className="hint">Falta guardar neste mês: <b className="num">{brl(m.pendingThisMonth)}</b></p>}
          </button>
        ))}
      </div>
      <label className="check" style={{ marginTop: 16 }}><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Mostrar metas arquivadas</label>
      {form && <GoalForm onClose={() => setForm(false)} />}
      {sel && <GoalDetail m={sel} onClose={() => setDetail(null)} />}
    </>
  );
}
