import { useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import * as C from '@shared/calc.js';
import { formatBR, describeDuration } from '@shared/dates.js';
import { Field, MoneyInput, inputToCents, centsToInput, brl, Alert, Empty } from '../ui.jsx';

function ScenarioCard({ title, desc, sc, goal, extra }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      <p className="hint">{desc}</p>
      {!sc ? <p className="muted">{extra || 'Preencha os campos para simular.'}</p> : (
        <div className="calc">
          <div className="ln"><span>Sobra mensal estimada</span><b className={`num ${sc.capacity < 0 ? 'bad' : ''}`}>{brl(sc.capacity)}</b></div>
          <div className="ln"><span>Disponível para “{goal.goal.name}”</span><b className="num">{brl(sc.avail)}/mês</b></div>
          <div className="ln"><span>Necessário</span><b className="num">{brl(sc.need)}/mês</b></div>
          <div className="ln"><span>No prazo ({formatBR(goal.deadline)}) você teria</span><b className={`num ${sc.fits ? 'ok' : 'warn'}`}>{brl(sc.atDeadline)}</b></div>
          <div className="ln"><span>Chegaria na meta em</span><b>{sc.finishDate ? formatBR(sc.finishDate) : 'não chega com essa sobra'}</b></div>
          <div className="ln"><span>Resultado</span><b className={sc.fits ? 'ok' : 'warn'}>{sc.fits ? 'Cabe' : 'Não cabe no prazo'}</b></div>
        </div>
      )}
    </section>
  );
}

export default function Plano() {
  const { data, today } = useApp();
  const cats = data.categories.filter((c) => !c.archived);
  const [goalId, setGoalId] = useState('');
  const [red, setRed] = useState({});
  const [newTarget, setNewTarget] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const reductions = Object.fromEntries(Object.entries(red).map(([k, v]) => [k, inputToCents(v) || 0]).filter(([, v]) => v > 0));
  const p = useMemo(() => C.planner(data, today, {
    goalId: goalId || undefined, reductions, newTarget: inputToCents(newTarget) || undefined, newDeadline: newDeadline || undefined,
  }), [data, today, goalId, JSON.stringify(reductions), newTarget, newDeadline]);
  const catName = new Map(data.categories.map((c) => [c.id, c]));
  const avgByCat = new Map(p.cap.categoryAvg.map((c) => [c.category_id, c.monthly]));
  const candidates = p.goalsM.filter((m) => !['atingida', 'vencida', 'sem_prazo'].includes(m.status));
  const essentialChosen = Object.keys(reductions).filter((id) => catName.get(id)?.essential);

  return (
    <>
      <div className="topbar"><h1>Meu plano</h1></div>
      <section className="card">
        <h2 style={{ marginBottom: 10 }}>O que os seus números dizem</h2>
        {!p.msgs.length && <Empty>Registre entradas, gastos e metas para receber orientações.</Empty>}
        <div className="stack">{p.msgs.map((m, i) => <Alert key={i} tone={m.tone}>{m.text}</Alert>)}</div>
      </section>

      <div className="grid two section">
        <section className="card">
          <h2>Sua sobra mensal estimada</h2>
          <p className="hint">Média dos últimos {p.cap.window.days} dias{p.cap.window.short ? ' (pouco histórico ainda: os números vão ficar mais precisos com o tempo)' : ''}.</p>
          <div className="calc">
            <div className="ln"><span>Renda fixa (recorrente)</span><b className="num">{brl(p.cap.incomeFixed)}</b></div>
            <div className="ln"><span>Renda variável {p.cap.incomeVariableSource === 'estimativa' ? '(sua estimativa)' : '(média registrada)'}</span><b className="num">{brl(p.cap.incomeVariable)}</b></div>
            <div className="ln"><span>− Despesas fixas</span><b className="num">{brl(-p.cap.expensesFixed)}</b></div>
            <div className="ln"><span>− Parcelas dos próximos 30 dias</span><b className="num">{brl(-p.cap.installments)}</b></div>
            <div className="ln"><span>− Gastos variáveis (média, já com reembolsos)</span><b className="num">{brl(-p.cap.expensesVariable)}</b></div>
            <div className="ln"><span>= Sobra por mês</span><b className={`num ${p.cap.capacity < 0 ? 'bad' : 'ok'}`}>{brl(p.cap.capacity)}</b></div>
          </div>
          {!p.cap.incomeKnown && <p className="warn">Sem renda registrada, não dá para saber o que cabe. Registre o que recebe, mesmo valores pequenos.</p>}
        </section>
        <section className="card">
          <h2>Metas por prioridade</h2>
          <p className="hint">A sobra mensal é distribuída primeiro às metas de prioridade mais alta e prazo mais curto.</p>
          {!p.alloc.length && <Empty>Nenhuma meta.</Empty>}
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Meta</th><th className="r">Precisa/mês</th><th className="r">Cabe/mês</th><th /></tr></thead>
              <tbody>{p.alloc.map((a) => (
                <tr key={a.m.goal.id}><td>{a.m.goal.name}<br /><small className="muted">{a.m.deadline ? `até ${formatBR(a.m.deadline)}` : 'sem prazo'}</small></td>
                  <td className="r num">{a.m.status === 'atingida' ? '—' : brl(a.need)}</td><td className="r num">{brl(a.got)}</td>
                  <td>{a.m.status === 'atingida' ? <span className="chip ok">atingida</span> : a.m.status === 'vencida' ? <span className="chip bad">vencida</span> : p.cap.incomeKnown ? <span className={`chip ${a.fits ? 'ok' : 'warn'}`}>{a.fits ? 'cabe' : 'não cabe'}</span> : <span className="chip">?</span>}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="section">
        <h2>Comparar cenários</h2>
        {!candidates.length ? <div className="card"><Empty>Crie uma meta com prazo para comparar cenários.</Empty></div> : (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <Field label="Meta analisada">
                <select className="input" value={goalId || p.goal?.goal.id || ''} onChange={(e) => setGoalId(e.target.value)}>
                  {candidates.map((m) => <option key={m.goal.id} value={m.goal.id}>{m.goal.name}</option>)}
                </select>
              </Field>
              {p.goal && <p className="hint">Faltam {brl(p.goal.remaining)} em {describeDuration(today, p.goal.deadline)}. Metas de prioridade mais alta são atendidas antes.</p>}
            </div>
            <div className="grid three">
              <ScenarioCard title="1. Manter meus gastos" desc="Tudo como está hoje." sc={p.scenarios.manter} goal={p.goal} extra={p.goal ? undefined : 'Selecione uma meta.'} />
              <div className="stack">
                <ScenarioCard title="2. Reduzir despesas que eu escolher" desc={p.scenarios.reduzir ? `Redução total de ${brl(p.scenarios.reduzir.reductionTotal)}/mês.` : 'Escolha abaixo quanto reduzir por mês em cada categoria.'} sc={p.scenarios.reduzir} goal={p.goal} />
                <section className="card">
                  <h3>Reduções por mês</h3>
                  {cats.map((c) => (
                    <div key={c.id} className="row" style={{ marginTop: 8 }}>
                      <span style={{ flex: 1, minWidth: 0 }}>{c.icon} {c.name}<br /><small className="muted">média {brl(avgByCat.get(c.id) || 0)}/mês{c.essential ? ' · essencial' : ''}</small></span>
                      <div style={{ width: 140 }}><MoneyInput value={red[c.id] || ''} onChange={(v) => setRed((x) => ({ ...x, [c.id]: v }))} /></div>
                    </div>
                  ))}
                  {essentialChosen.length > 0 && <p className="warn" style={{ marginTop: 8 }}>Atenção: {essentialChosen.map((id) => catName.get(id).name).join(', ')} é necessidade básica. O app não sugere cortar isso; reduza só se tiver certeza de que é possível.</p>}
                  {p.suggestions.length > 0 && (
                    <button className="btn small" style={{ marginTop: 10 }} onClick={() => setRed(Object.fromEntries(p.suggestions.map((s) => [s.category_id, centsToInput(s.cut)])))}>Usar sugestão do app</button>
                  )}
                </section>
              </div>
              <div className="stack">
                <section className="card">
                  <h3>3. Alterar prazo ou valor</h3>
                  <p className="hint">Mantém seus gastos e muda a meta.</p>
                  <div className="stack">
                    <Field label="Novo valor da meta"><MoneyInput value={newTarget} onChange={setNewTarget} placeholder={p.goal ? centsToInput(p.goal.target) : ''} /></Field>
                    <Field label="Novo prazo"><input className="input" type="date" value={newDeadline} min={today} onChange={(e) => setNewDeadline(e.target.value)} /></Field>
                  </div>
                  {p.scenarios.alterar && (
                    p.scenarios.alterar.invalid ? <p className="err">Escolha um prazo futuro.</p> : (
                      <div className="calc">
                        <div className="ln"><span>Falta</span><b className="num">{brl(p.scenarios.alterar.remaining)}</b></div>
                        <div className="ln"><span>Precisaria por mês</span><b className="num">{brl(p.scenarios.alterar.need)}</b></div>
                        <div className="ln"><span>Disponível por mês</span><b className="num">{brl(p.scenarios.alterar.avail)}</b></div>
                        <div className="ln"><span>Resultado</span><b className={p.scenarios.alterar.fits ? 'ok' : 'warn'}>{p.scenarios.alterar.fits ? 'Cabe' : 'Ainda não cabe'}</b></div>
                      </div>
                    )
                  )}
                  {p.goal && p.cap.capacity > 0 && p.scenarios.manter && !p.scenarios.manter.fits && (
                    <p className="hint">Com a sobra atual, um valor que cabe no prazo seria cerca de {brl(p.goal.current + Math.max(0, p.scenarios.manter.avail) * Math.floor(p.goal.monthsLeft))}.</p>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="section card">
        <h3>Como o plano é calculado</h3>
        <p className="hint">Todas as orientações vêm de regras fixas aplicadas aos seus números (sem inteligência artificial e sem inventar valores). Sugestões de redução usam só categorias que você não marcou como essenciais, até 25% da média de cada uma, para manter espaço para lazer e relacionamento — gastar com isso não é erro. Não há chat com IA neste app: nenhuma chave de API foi configurada, e nenhuma informação sua é enviada a serviços de IA.</p>
      </section>
    </>
  );
}
