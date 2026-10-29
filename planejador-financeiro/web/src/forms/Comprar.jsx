import { useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import * as C from '@shared/calc.js';
import { formatBR } from '@shared/dates.js';
import { Modal, MoneyInput, inputToCents, brl, Alert } from '../ui.jsx';

// Simulação pura: nada é gravado.
export default function Comprar({ onClose }) {
  const { data, today, open } = useApp();
  const [amount, setAmount] = useState('');
  const cents = inputToCents(amount) || 0;
  const r = useMemo(() => (cents > 0 ? C.canIBuy(data, today, cents) : null), [data, today, cents]);
  const verdict = r && {
    cabe: ['ok', 'Cabe no orçamento.'],
    apertado: ['warn', 'Cabe, mas deixa o resto do período bem apertado.'],
    afeta_metas: ['warn', 'Cabe nas contas, mas tira dinheiro dos aportes planejados das metas.'],
    nao_cabe: ['bad', 'Não cabe: faltaria dinheiro para contas já previstas.'],
  }[r.verdict];
  return (
    <Modal title="Posso comprar isso?" onClose={onClose}>
      <div className="stack">
        <p className="muted">Digite o valor. É só uma simulação — nada é registrado.</p>
        <MoneyInput huge value={amount} onChange={setAmount} autoFocus />
        {r && (
          <>
            <Alert tone={verdict[0]}><b>{verdict[1]}</b></Alert>
            <div className="calc">
              <div className="ln"><span>Livre hoje até {formatBR(r.sp.period.end)}</span><b className="num">{brl(r.sp.livreFinal)}</b></div>
              <div className="ln"><span>− Esta compra</span><b className="num">{brl(-cents)}</b></div>
              <div className="ln"><span>Sobraria</span><b className={`num ${r.after < 0 ? 'bad' : ''}`}>{brl(r.after)}</b></div>
            </div>
            <p>Limite diário passaria de <b className="num">{brl(r.sp.daily)}</b> para <b className="num">{brl(r.newDaily)}</b> ({r.sp.days} dia(s)).</p>
            {r.affectedBills.length > 0 && (
              <div className="stack"><h3>Contas que ficariam sem cobertura</h3>
                {r.affectedBills.map((b) => <div key={b.id} className="row between"><span>{b.description || 'Conta'} · {formatBR(b.date)}</span><b className="num">{brl(b.amount_cents)}</b></div>)}
              </div>
            )}
            {r.affectedGoals.length > 0 && (
              <div className="stack"><h3>Aportes do mês afetados</h3>
                {r.affectedGoals.map((g) => <div key={g.goal_id} className="row between"><span>{g.name}</span><b className="num">faltariam {brl(g.uncovered)}</b></div>)}
              </div>
            )}
            {r.goalImpact && (
              <p className="hint">Impacto estimado na meta “{r.goalImpact.name}”: esse valor equivale a {Math.round(r.goalImpact.shareOfRemaining * 1000) / 10}% do que falta{r.goalImpact.delayDays ? `, ou cerca de ${r.goalImpact.delayDays} dia(s) de aportes no seu ritmo` : ''}.</p>
            )}
            <button className="btn" onClick={() => open('gastei')}>Comprei — registrar gasto</button>
          </>
        )}
      </div>
    </Modal>
  );
}
