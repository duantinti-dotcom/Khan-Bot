import { useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { post, put } from '../api.js';
import { Field, MoneyInput, inputToCents, Seg, Alert, brl, useSubmit } from '../ui.jsx';
import { parseGoalText } from '@shared/parse.js';
import { ageOn, formatBR, birthdayAtAge } from '@shared/dates.js';

const STEPS = ['Sobre você', 'Saldo agora', 'Já guardado', 'Renda fixa', 'Renda variável', 'Contas fixas', 'Categorias', 'Primeira meta'];

const ACCOUNT_KINDS = [['corrente', 'Conta corrente / digital'], ['dinheiro', 'Dinheiro físico']];
const SAVE_KINDS = [['caixinha', 'Caixinha / conta remunerada'], ['poupanca', 'Poupança'], ['tesouro', 'Tesouro'], ['cdb', 'CDB'], ['dinheiro', 'Dinheiro guardado em casa'], ['outros', 'Outro']];

function Tri({ value, onChange, yes = 'Sim', no = 'Não' }) {
  return <Seg value={value} onChange={onChange} options={[['sim', yes], ['nao', no], ['nao_sei', 'Não sei agora']]} />;
}

export default function Onboarding() {
  const { data, today, reload, me } = useApp();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    name: '', birth: '',
    balanceKnown: 'sim', balance: '', accName: 'Conta principal', accKind: 'corrente', accInst: '',
    saved: 'nao', savedAmount: '', savedKind: 'caixinha', savedName: 'Caixinha', savedInst: '',
    fixed: 'nao', fixedAmount: '', fixedDay: '5', fixedDesc: 'Mesada',
    variable: 'nao_sei', variableEst: '',
    expenses: [],
    cats: Object.fromEntries(data.categories.map((c) => [c.id, true])), newCat: '', extraCats: [],
    goalText: '', goalName: '', goalTarget: '', goalType: 'idade', goalAge: '', goalDate: '', goalFromSaved: '', skipGoal: false,
    reserve: true, reserveTarget: '',
  });
  // Guarda o que já foi criado: se algo falhar no meio, tentar de novo não duplica registros.
  const done = useRef({});
  const once = async (key, fn) => (key in done.current ? done.current[key] : (done.current[key] = await fn()));
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const age = f.birth && f.birth <= today ? ageOn(f.birth, today) : null;

  const s = useSubmit(async () => {
    const savedCents = f.saved === 'sim' ? inputToCents(f.savedAmount) || 0 : 0;
    await put('/profile', {
      display_name: f.name.trim() || null,
      birth_date: f.birth || null,
      has_variable_income: f.variable === 'nao_sei' ? null : f.variable === 'sim',
      variable_income_estimate_cents: f.variable === 'sim' ? inputToCents(f.variableEst) : null,
      budget_mode: f.fixed === 'sim' ? 'proxima_renda' : 'fim_do_mes',
    });
    const main = await once('main', () => post('/accounts', {
      name: f.accName.trim() || 'Conta principal', kind: f.accKind, institution: f.accInst.trim() || null, purpose: 'gastar', liquidity: 'imediata',
      initial_cents: f.balanceKnown === 'sim' ? inputToCents(f.balance) || 0 : 0, balance_known: f.balanceKnown === 'sim',
    }));
    let savedAcc = null;
    if (f.saved === 'sim' || f.saved === 'nao_sei') {
      const kind = f.savedKind;
      savedAcc = await once('saved', () => post('/accounts', {
        name: f.savedName.trim() || 'Guardado', kind, institution: f.savedInst.trim() || null,
        purpose: ['tesouro', 'cdb'].includes(kind) ? 'investido' : 'reservado', liquidity: 'imediata',
        initial_cents: savedCents, balance_known: f.saved === 'sim',
      }));
    }
    if (f.fixed === 'sim' && inputToCents(f.fixedAmount) > 0) {
      await once('income', () => post('/recurrences', {
        kind: 'receita', amount_cents: inputToCents(f.fixedAmount), description: f.fixedDesc.trim() || 'Renda fixa', frequency: 'mensal',
        day_of_month: Number(f.fixedDay) || 1, start_date: today, account_id: main.id, is_main_income: true,
      }));
    }
    for (const [i, e] of f.expenses.entries()) {
      const v = inputToCents(e.amount);
      if (!e.name.trim() || !v) continue;
      await once(`exp${i}`, () => post('/recurrences', {
        kind: 'despesa', amount_cents: v, description: e.name.trim(), frequency: 'mensal', day_of_month: Number(e.day) || 1,
        start_date: today, account_id: main.id, category_id: e.cat || null,
      }));
    }
    for (const c of data.categories) if (!f.cats[c.id]) await once(`cat${c.id}`, () => put(`/categories/${c.id}`, { archived: true }));
    for (const [i, name] of f.extraCats.entries()) await once(`newcat${i}`, () => post('/categories', { name, color: '#94a3b8', sort: 100 + i }));
    let fromSaved = Math.min(savedCents, inputToCents(f.goalFromSaved) || 0);
    if (!f.skipGoal && inputToCents(f.goalTarget) > 0 && (f.goalType === 'data' ? f.goalDate : f.goalAge)) {
      await once('goal', () => post('/goals', {
        name: f.goalName.trim() || 'Minha meta', target_cents: inputToCents(f.goalTarget), priority: 1, target_type: f.goalType,
        target_age: f.goalType === 'idade' ? Number(f.goalAge) : null, target_date: f.goalType === 'data' ? f.goalDate : null,
        place_account_id: savedAcc?.id || null,
        initial: fromSaved > 0 && savedAcc ? { amount_cents: fromSaved, account_id: savedAcc.id } : undefined,
      }));
    } else fromSaved = 0;
    if (f.reserve && inputToCents(f.reserveTarget) > 0) {
      const rest = savedCents - fromSaved;
      await once('reserve', () => post('/goals', {
        name: 'Reserva para imprevistos', kind: 'reserva', target_cents: inputToCents(f.reserveTarget), priority: 1,
        target_type: 'data', target_date: addYears(today, 1), place_account_id: savedAcc?.id || null,
        initial: rest > 0 && savedAcc ? { amount_cents: rest, account_id: savedAcc.id } : undefined,
      }));
    }
    await put('/profile', { onboarding_done: true });
    await reload();
  });

  const parsed = () => {
    const p = parseGoalText(f.goalText);
    setF((x) => ({
      ...x,
      goalName: p.name || x.goalName || (p.target_type === 'idade' ? `Meta dos ${p.target_age} anos` : x.goalName),
      goalTarget: p.target_cents ? (p.target_cents / 100).toLocaleString('pt-BR') : x.goalTarget,
      goalType: p.target_type || x.goalType,
      goalAge: p.target_age ? String(p.target_age) : x.goalAge,
      goalDate: p.target_date || x.goalDate,
    }));
  };

  const body = [
    <div className="stack" key="0">
      <Field label="Como quer ser chamado(a)?"><input className="input" value={f.name} onChange={set('name')} placeholder="Nome ou apelido" /></Field>
      <Field label="Data de nascimento" hint="Usada para calcular prazos de metas como “quando eu fizer 20 anos”. Pode deixar em branco e informar depois.">
        <input className="input" type="date" value={f.birth} max={today} onChange={set('birth')} />
      </Field>
      {age != null && <p className="muted">Você tem {age} anos.</p>}
    </div>,
    <div className="stack" key="1">
      <p>Quanto dinheiro você tem <b>disponível agora</b> para usar no dia a dia (conta, carteira)?</p>
      <Tri value={f.balanceKnown} onChange={set('balanceKnown')} yes="Sei o valor" no="Não tenho nada" />
      {f.balanceKnown === 'sim' && <MoneyInput huge value={f.balance} onChange={set('balance')} />}
      {f.balanceKnown === 'nao' && <p className="muted">Vamos registrar R$ 0,00 — um valor conhecido.</p>}
      {f.balanceKnown === 'nao_sei' && <Alert tone="warn">O saldo ficará marcado como <b>desconhecido</b> (diferente de zero). Os cálculos de “quanto posso gastar” vão avisar até você atualizar.</Alert>}
      <div className="form-grid">
        <Field label="Nome da conta"><input className="input" value={f.accName} onChange={set('accName')} /></Field>
        <Field label="Tipo"><select className="input" value={f.accKind} onChange={set('accKind')}>{ACCOUNT_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Banco / instituição (opcional)" full><input className="input" value={f.accInst} onChange={set('accInst')} placeholder="Ex.: Nubank, Inter, carteira" /></Field>
      </div>
    </div>,
    <div className="stack" key="2">
      <p>Você já tem algum dinheiro <b>guardado</b> (separado do dia a dia)?</p>
      <Tri value={f.saved} onChange={set('saved')} />
      {f.saved !== 'nao' && (
        <div className="form-grid">
          {f.saved === 'sim' && <Field label="Quanto?" full><MoneyInput value={f.savedAmount} onChange={set('savedAmount')} /></Field>}
          <Field label="Onde está guardado?"><select className="input" value={f.savedKind} onChange={(e) => setF((x) => ({ ...x, savedKind: e.target.value, savedName: SAVE_KINDS.find((k) => k[0] === e.target.value)[1].split(' /')[0] }))}>{SAVE_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Nome"><input className="input" value={f.savedName} onChange={set('savedName')} /></Field>
          <Field label="Instituição (opcional)" full><input className="input" value={f.savedInst} onChange={set('savedInst')} /></Field>
        </div>
      )}
      {f.saved === 'nao_sei' && <p className="muted">Criaremos o lugar com saldo desconhecido para você atualizar depois.</p>}
    </div>,
    <div className="stack" key="3">
      <p>Você recebe algum valor <b>fixo</b> todo mês (mesada, salário, estágio)?</p>
      <Tri value={f.fixed} onChange={set('fixed')} />
      {f.fixed === 'sim' && (
        <div className="form-grid">
          <Field label="Valor por mês" full><MoneyInput value={f.fixedAmount} onChange={set('fixedAmount')} /></Field>
          <Field label="Dia previsto"><input className="input" inputMode="numeric" value={f.fixedDay} onChange={set('fixedDay')} /></Field>
          <Field label="Descrição"><input className="input" value={f.fixedDesc} onChange={set('fixedDesc')} /></Field>
          <p className="hint full">A renda fica como <b>prevista</b> e só entra no saldo quando você confirmar que recebeu. O orçamento passa a durar até o dia anterior a ela.</p>
        </div>
      )}
    </div>,
    <div className="stack" key="4">
      <p>Você recebe valores <b>variáveis ou picados</b> (bicos, vendas, presentes, Pix de família)?</p>
      <Tri value={f.variable} onChange={set('variable')} />
      {f.variable === 'sim' && (
        <Field label="Quanto costuma somar por mês? (opcional)" hint="Só uma estimativa para os primeiros meses. Depois o app usa a média do que você registrar.">
          <MoneyInput value={f.variableEst} onChange={set('variableEst')} />
        </Field>
      )}
    </div>,
    <div className="stack" key="5">
      <p>Tem <b>contas fixas</b> que se repetem todo mês? (assinaturas, plano de celular, academia…)</p>
      {f.expenses.map((e, i) => (
        <div key={i} className="card" style={{ padding: 12 }}>
          <div className="form-grid">
            <Field label="Nome"><input className="input" value={e.name} onChange={(ev) => updExp(setF, i, 'name', ev.target.value)} /></Field>
            <Field label="Valor"><MoneyInput value={e.amount} onChange={(v) => updExp(setF, i, 'amount', v)} /></Field>
            <Field label="Dia do vencimento"><input className="input" inputMode="numeric" value={e.day} onChange={(ev) => updExp(setF, i, 'day', ev.target.value)} /></Field>
            <Field label="Categoria"><select className="input" value={e.cat} onChange={(ev) => updExp(setF, i, 'cat', ev.target.value)}><option value="">—</option>{data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          </div>
          <button className="btn small ghost" onClick={() => setF((x) => ({ ...x, expenses: x.expenses.filter((_, j) => j !== i) }))}>Remover</button>
        </div>
      ))}
      <button className="btn" onClick={() => setF((x) => ({ ...x, expenses: [...x.expenses, { name: '', amount: '', day: '10', cat: data.categories.find((c) => c.name.startsWith('Assinaturas'))?.id || '' }] }))}>+ Adicionar conta fixa</button>
      <p className="hint">Pode pular e cadastrar depois em “Lançamentos”.</p>
    </div>,
    <div className="stack" key="6">
      <p>Quais categorias você usa? Dá para editar, criar limites e mudar depois.</p>
      <div className="stack">
        {data.categories.map((c) => (
          <label key={c.id} className="check"><input type="checkbox" checked={f.cats[c.id]} onChange={(e) => setF((x) => ({ ...x, cats: { ...x.cats, [c.id]: e.target.checked } }))} />{c.icon} {c.name}{c.essential && <span className="chip">essencial</span>}</label>
        ))}
        {f.extraCats.map((n) => <span key={n} className="chip info">+ {n}</span>)}
      </div>
      <div className="row">
        <input className="input" value={f.newCat} onChange={set('newCat')} placeholder="Nova categoria" />
        <button className="btn" onClick={() => f.newCat.trim() && setF((x) => ({ ...x, extraCats: [...x.extraCats, x.newCat.trim()], newCat: '' }))}>Adicionar</button>
      </div>
    </div>,
    <div className="stack" key="7">
      <Field label="Escreva sua meta, se quiser" hint='Ex.: “Quero ter R$10.000 quando completar 20 anos” ou “3 mil para uma viagem até dezembro de 2027”.'>
        <div className="row"><input className="input" aria-label="Frase da meta" value={f.goalText} onChange={set('goalText')} /><button className="btn" onClick={parsed}>Entender</button></div>
      </Field>
      <div className="form-grid">
        <Field label="Nome da meta"><input className="input" value={f.goalName} onChange={set('goalName')} /></Field>
        <Field label="Valor desejado"><MoneyInput value={f.goalTarget} onChange={set('goalTarget')} /></Field>
        <div className="full"><Seg value={f.goalType} onChange={set('goalType')} options={[['idade', 'Até uma idade'], ['data', 'Até uma data']]} /></div>
        {f.goalType === 'idade' ? (
          <Field label="Idade" hint={f.birth && f.goalAge ? `Prazo: ${formatBR(birthdayAtAge(f.birth, Number(f.goalAge)))} (seu aniversário de ${f.goalAge} anos)` : !f.birth ? 'Informe a data de nascimento na 1ª etapa para calcular o prazo.' : undefined}>
            <input className="input" inputMode="numeric" value={f.goalAge} onChange={set('goalAge')} />
          </Field>
        ) : (
          <Field label="Data"><input className="input" type="date" min={today} value={f.goalDate} onChange={set('goalDate')} /></Field>
        )}
        {f.saved === 'sim' && inputToCents(f.savedAmount) > 0 && (
          <Field label="Do que já está guardado, quanto é desta meta?" hint={`Você tem ${brl(inputToCents(f.savedAmount))} guardados.`}><MoneyInput value={f.goalFromSaved} onChange={set('goalFromSaved')} /></Field>
        )}
      </div>
      <label className="check"><input type="checkbox" checked={f.skipGoal} onChange={(e) => setF((x) => ({ ...x, skipGoal: e.target.checked }))} />Prefiro criar a meta depois</label>
      <hr />
      <label className="check"><input type="checkbox" checked={f.reserve} onChange={(e) => setF((x) => ({ ...x, reserve: e.target.checked }))} />Criar uma <b>reserva para imprevistos</b></label>
      {f.reserve && <Field label="Quanto quer ter na reserva?" hint="Uma referência comum é o equivalente a alguns meses dos seus gastos essenciais. Você decide."><MoneyInput value={f.reserveTarget} onChange={set('reserveTarget')} /></Field>}
    </div>,
  ];

  return (
    <div className="auth-wrap">
      <div className="card auth" style={{ width: 'min(620px, 100%)' }}>
        <div className="brand"><img src="/icon.svg" alt="" />Órbita</div>
        <div className="steps" aria-hidden="true">{STEPS.map((_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>{STEPS[step]}</h2>
          <small>{step + 1} de {STEPS.length}</small>
        </div>
        {step === 0 && <p className="muted" style={{ marginTop: -6 }}>Olá, {me.user.username}! São etapas curtas, e tudo pode ser editado depois em “Minha conta”. Se não souber um valor, marque “não sei” — isso é diferente de zero.</p>}
        {body[step]}
        {s.error && <p className="err" role="alert">{s.error}</p>}
        <div className="row" style={{ marginTop: 18 }}>
          {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Voltar</button>}
          <div className="spacer" />
          {step < STEPS.length - 1 ? (
            <button className="btn primary" onClick={() => setStep(step + 1)}>Continuar</button>
          ) : (
            <button className="btn primary" disabled={s.busy} onClick={() => s.run().catch(() => {})}>{s.busy ? 'Salvando…' : 'Concluir'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function updExp(setF, i, k, v) {
  setF((x) => ({ ...x, expenses: x.expenses.map((e, j) => (j === i ? { ...e, [k]: v } : e)) }));
}

function addYears(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y + n}-${String(m).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`;
}
