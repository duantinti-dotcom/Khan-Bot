import { useMemo } from 'react';
import { useApp, TopBar } from '../App.jsx';
import { put } from '../api.js';
import * as C from '@shared/calc.js';
import * as B from '@shared/budget.js';
import { formatBR, relativeDays, diffDays, weekdayShort } from '@shared/dates.js';
import { brl, Tile, Progress, EmptyCta, useToast } from '../ui.jsx';
import { settle } from '../actions.js';

export function GoalStatus({ m }) {
  const map = {
    atingida: ['ok', 'Meta atingida'], adiantada: ['ok', 'Adiantada'], no_plano: ['info', 'Dentro do plano'],
    atrasada: ['warn', 'Atrasada'], vencida: ['bad', 'Prazo vencido'], sem_prazo: ['warn', 'Sem prazo calculável'],
  };
  const [tone, label] = map[m.status];
  return <span className={`chip ${tone}`}>{label}{m.daysLeft != null && m.daysLeft >= 0 && m.status !== 'atingida' ? ` · ${m.daysLeft} dias` : ''}</span>;
}

export function BillItem({ b, cats, today, onPay, payLabel = 'Paguei' }) {
  const d = diffDays(today, b.date);
  const c = cats.get(b.category_id);
  return (
    <div className="item">
      <div className="dot" aria-hidden="true">{b.kind === 'receita' ? '↓' : c?.icon || '•'}</div>
      <div className="grow">
        <div className="t">{b.description || c?.name || 'Conta'}</div>
        <div className={`s ${b.kind !== 'receita' && d < 0 ? 'bad' : b.kind !== 'receita' && d <= 3 ? 'warn' : ''}`}>
          {weekdayShort(b.date)}, {formatBR(b.date)} · {d < 0 ? `${b.kind === 'receita' ? 'prevista' : 'venceu'} há ${-d} dia(s)` : relativeDays(today, b.date)}
        </div>
      </div>
      <div className={`amt num ${b.kind === 'receita' ? 'ok' : ''}`}>{brl(b.amount_cents)}</div>
      {onPay && <button className="btn small" onClick={() => onPay(b)}>{payLabel}</button>}
    </div>
  );
}

export default function Home() {
  const { data, today, reload, open, go } = useApp();
  const toast = useToast();
  const sp = useMemo(() => C.spendable(data, today), [data, today]);
  const goalsM = useMemo(() => C.sortGoals(C.activeGoals(data).map((g) => C.goalMetrics(g, data, today))), [data, today]);
  const usage = useMemo(() => B.budgetUsage(data, data.plan), [data]);
  const stale = useMemo(() => B.planStale(data, data.plan, today), [data, today]);
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const name = data.profile.display_name || data.user.username;

  const pay = async (b) => {
    try { await settle(b, today); await reload(); toast({ text: `“${b.description || 'Conta'}” marcada como paga.`, ok: true }); }
    catch (e) { if (!e.cancelled) alert(e.message); else toast(e.message); }
  };

  if (!sp.hasAccounts) {
    return (
      <>
        <TopBar title={`Olá, ${name}`} subtitle={formatBR(today)} />
        <EmptyCta icon="🏦" title="Comece pelo seu dinheiro" text="Cadastre onde seu dinheiro está (conta, carteira) e o saldo de hoje. Depois o app mostra quanto você pode gastar."
          action={<button className="btn primary" onClick={() => go('perfil/contas')}>Cadastrar conta</button>} />
      </>
    );
  }

  const comprometido = sp.compromissos + sp.separado;
  const guardar = sp.aportesPendentes;
  const incomesToConfirm = sp.incomes.filter((i) => i.date <= today);
  const billsBefore = sp.bills;
  const todo = [];
  if (sp.overdue.length) todo.push({ ico: '⚠', text: `${sp.overdue.length} conta(s) vencida(s) sem pagamento registrado`, action: () => go('movimentacoes/calendario'), label: 'Ver' });
  if (incomesToConfirm.length) todo.push({ ico: '↓', text: `${incomesToConfirm.length} recebimento(s) previsto(s) para confirmar`, action: () => document.getElementById('a-receber')?.scrollIntoView({ behavior: 'smooth' }), label: 'Confirmar' });
  if (!data.plan) todo.push({ ico: '✦', text: 'Organize seu dinheiro: veja quanto destinar para cada coisa', action: () => go('plano/organizar'), label: 'Organizar' });
  else if (stale.length) todo.push({ ico: '↻', text: `Plano desatualizado: ${stale[0]}`, action: () => go('plano/organizar'), label: 'Revisar' });
  if (guardar > 0) todo.push({ ico: '◆', text: `Separar ${brl(guardar)} para suas metas este mês`, action: () => open('guardei'), label: 'Guardar' });
  if (sp.unknown.length) todo.push({ ico: '?', text: `Informe o saldo de ${sp.unknown.map((a) => a.name).join(', ')}`, action: () => go('perfil/contas'), label: 'Atualizar' });

  const togglePlanned = async () => {
    await put('/profile', { include_planned_contributions: !sp.includePlanned });
    await reload();
  };

  return (
    <>
      <TopBar title={`Olá, ${name}`} subtitle={`${formatBR(today)} · até ${formatBR(sp.period.end)}`} />
      <div className="tiles">
        <Tile main label="Posso gastar" value={sp.livreFinal} tone={sp.livreFinal < 0 ? 'neg' : 'pos'}
          sub={sp.livreFinal < 0 ? `Faltam ${brl(-sp.livreFinal)} até ${formatBR(sp.period.end)}` : `até ${formatBR(sp.period.end)} · cerca de ${brl(sp.daily)} por dia`}
          explain={
            <>
              <p>Tenho agora {brl(sp.saldoBase)} − já comprometido {brl(comprometido)}{sp.includePlanned ? ` − preciso guardar ${brl(guardar)}` : ''} = <b>{brl(sp.livreFinal)}</b>.</p>
              <p>É o dinheiro livre até {sp.period.reason === 'proxima_renda' ? `a véspera da próxima renda (${formatBR(sp.period.nextIncome)})` : 'o fim do mês'}. Gastos já pagos já saíram do saldo e não são descontados de novo.</p>
              <button className="btn small" onClick={togglePlanned}>{sp.includePlanned ? 'Não descontar o “preciso guardar”' : 'Descontar o “preciso guardar”'}</button>
            </>
          } />
        <Tile label="Tenho agora" value={sp.saldoBase} sub="já recebido, nas contas de gasto"
          explain={<>Soma do saldo de {sp.spendAccounts.map((a) => a.name).join(', ')}. Só conta dinheiro que já entrou: recebimentos previstos ({brl(sp.incomesTotal)}) ficam separados. Reservas e investimentos ({brl(sp.totals.reservado + sp.totals.investido)}) não entram.{sp.unknown.length ? ' Atenção: há conta com saldo desconhecido.' : ''}</>} />
        <Tile label="Já comprometido" value={comprometido} sub={`contas ${brl(sp.compromissos)} · separado ${brl(sp.separado)}`}
          explain={<>Contas a pagar até {formatBR(sp.period.end)} ({billsBefore.length}) somam {brl(sp.compromissos)}. Dinheiro que você já separou para metas nessas contas: {brl(sp.separado)}.</>} />
        <Tile wide label="Preciso guardar" value={guardar} sub={guardar > 0 ? 'neste mês, para as metas' : 'aportes do mês em dia'}
          explain={<>{goalsM.filter((m) => m.pendingThisMonth > 0 && m.status !== 'vencida').map((m) => `${m.goal.name}: ${brl(m.pendingThisMonth)}`).join(' · ') || 'Nenhum aporte pendente neste mês.'}</>} />
      </div>

      {todo.length > 0 && (
        <>
          <div className="section-title"><h2>O que fazer agora</h2></div>
          <div className="stack">
            {todo.slice(0, 4).map((t, i) => (
              <div className="todo" key={i}>
                <span className="ico" aria-hidden="true">{t.ico}</span>
                <div className="grow">{t.text}</div>
                <button className="btn small" onClick={t.action}>{t.label}</button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="grid two section">
        <section className="card">
          <div className="card-h">
            <h2>Até {sp.period.nextIncome ? `o próximo recebimento` : 'o fim do mês'}</h2>
            <span className="chip">{sp.period.nextIncome ? formatBR(sp.period.nextIncome) : formatBR(sp.period.end)}</span>
          </div>
          <p className="muted">Contas que vencem antes ({brl(sp.compromissos)})</p>
          {!billsBefore.length && <p className="empty">Nenhuma conta até lá. 🎉</p>}
          <div className="list">{billsBefore.slice(0, 6).map((b) => <BillItem key={b.id} b={b} cats={cats} today={today} onPay={pay} />)}</div>
          {billsBefore.length > 6 && <button className="btn small ghost" onClick={() => go('movimentacoes/calendario')}>Ver todas ({billsBefore.length})</button>}
          <hr />
          <p className="muted" id="a-receber">A receber — ainda não conta no saldo ({brl(sp.incomesTotal)})</p>
          {!sp.incomes.length && <p className="hint">Nenhum recebimento previsto até lá.</p>}
          <div className="list">{sp.incomes.slice(0, 5).map((i) => <BillItem key={i.id} b={i} cats={cats} today={today} onPay={i.date <= today ? pay : null} payLabel="Recebi" />)}</div>
        </section>

        <section className="card">
          <div className="card-h"><h2>Seu plano</h2><button className="btn small ghost" onClick={() => go('plano/organizar')}>{data.plan ? 'abrir' : 'criar'}</button></div>
          {!usage ? (
            <div className="stack">
              <p className="muted">Divida o dinheiro livre entre o que importa (transporte, comida, passeios, metas). O app sugere valores com base nos seus gastos.</p>
              <button className="btn primary" onClick={() => go('plano/organizar')}>Organizar meu dinheiro</button>
            </div>
          ) : (
            <div className="stack">
              {usage.items.filter((i) => i.type === 'categoria' && i.amount_cents > 0).slice(0, 4).map((i) => (
                <div key={i.ref_id}>
                  <div className="row between"><span>{i.icon} {i.name}</span><span className="num">{i.left >= 0 ? `restam ${brl(i.left)}` : <span className="bad">passou {brl(-i.left)}</span>}</span></div>
                  <Progress value={i.amount_cents ? i.used / i.amount_cents : 1} tone={i.left < 0 ? 'bad' : i.used / Math.max(1, i.amount_cents) > 0.8 ? 'warn' : ''} />
                </div>
              ))}
              {goalsM[0] && (
                <div>
                  <div className="row between"><span>🎯 {goalsM[0].goal.name}</span><span className="num">{Math.round(goalsM[0].progress * 100)}%</span></div>
                  <Progress value={goalsM[0].progress} />
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
