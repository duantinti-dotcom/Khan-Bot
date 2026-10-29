// Peças de interface compartilhadas do orçamento: lista da divisão, aplicação com confirmação
// e a barra que mostra como o dinheiro foi dividido.
import { useState } from 'react';
import { useApp } from './App.jsx';
import { post } from './api.js';
import { formatBR } from '@shared/dates.js';
import { STYLES } from '@shared/budget.js';
import { Modal, Progress, SplitBar, Expander, brl, useSubmit } from './ui.jsx';

// Cores das categorias em tom suave, coerentes com o fundo marfim.
export function soft(color) {
  return `color-mix(in oklab, ${color || '#8b8c92'} 62%, #6d6f78)`;
}

const META_COLOR = '#2347c6';

export function partsFromItems(items, livre) {
  const parts = items.filter((i) => i.amount > 0).map((i) => ({
    label: i.name, value: i.amount, color: i.type === 'meta' ? META_COLOR : soft(i.color),
  }));
  if (livre > 0) parts.push({ label: 'Livre', value: livre, color: 'var(--fill-strong)' });
  return parts;
}

export function planItemsFrom(sug) {
  return sug.items.filter((i) => i.amount > 0 || i.locked).map((i) => ({ type: i.type, ref_id: i.id, amount_cents: i.amount, locked: !!i.locked }));
}

export function DivisionRow({ it, used, planned }) {
  const [open, setOpen] = useState(false);
  const amount = planned ?? it.amount;
  const spent = used ?? it.spent ?? 0;
  const pct = amount ? Math.min(1, spent / amount) : spent > 0 ? 1 : 0;
  const isMeta = it.type === 'meta';
  return (
    <div className="div-row">
      <button className="top" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="ic" aria-hidden="true">{it.icon || '•'}</span>
        <span className="name">{it.name}
          <small>{isMeta ? (used != null ? `separado ${brl(spent)}` : 'guardar para a meta') : used != null ? `usado ${brl(spent)} · resta ${brl(amount - spent)}` : `já gastou ${brl(spent)} neste ciclo`}</small>
        </span>
        <span className="val">{brl(amount)}</span>
      </button>
      {(used != null || isMeta) && <Progress value={pct} tone={used != null && spent > amount ? 'bad' : isMeta ? 'ok' : ''} />}
      <Expander open={open}>
        <div className="why">
          {it.reason && <p>{it.reason}</p>}
          {it.effect && <p>{it.effect}</p>}
          {it.short > 0 && <p className="warn">Abaixo do costume: faltam {brl(it.short)}.</p>}
          {it.source === 'estimativa' && <p><span className="tag est">estimativa sua</span></p>}
        </div>
      </Expander>
    </div>
  );
}

// Confirma e salva o plano; depois mostra como o dinheiro ficou dividido.
export function ApplyPlanModal({ sug, onClose }) {
  const { data, reload } = useApp();
  const [done, setDone] = useState(false);
  const s = useSubmit(async () => {
    await post('/plans', { items: planItemsFrom(sug) });
    await reload();
    setDone(true);
  });
  const parts = partsFromItems(sug.items, sug.livre);
  return (
    <Modal title={done ? 'Seu dinheiro foi dividido' : 'Aplicar plano'} onClose={onClose}>
      <div className="stack">
        <p className="muted">Até {formatBR(sug.period.end)} · {brl(sug.pool)} para dividir · estilo {STYLES[sug.style].label.toLowerCase()}</p>
        <SplitBar parts={parts} key={done ? 'feito' : 'previa'} />
        <div className="legend">{parts.map((p) => <span key={p.label}><i style={{ background: p.color }} />{p.label} {brl(p.value)}</span>)}</div>
        {!done && (
          <>
            {data.plan && <p className="warn">Isto substitui o plano salvo em {new Date(data.plan.created_at).toLocaleDateString('pt-BR')}.</p>}
            <p className="hint">É planejamento no app: não desconta saldo, não vira despesa e nada é transferido no banco. Cada gasto que você registrar sai do saldo uma vez e aparece como usado na categoria.</p>
            {s.error && <p className="err">{s.error}</p>}
            <div className="form-actions">
              <button className="btn" onClick={onClose}>Voltar</button>
              <button className="btn primary" disabled={s.busy || sug.overLocked > 0 || sug.available < 0} onClick={() => s.run().catch(() => {})}>Confirmar</button>
            </div>
          </>
        )}
        {done && <div className="form-actions"><button className="btn primary" onClick={onClose}>Pronto</button></div>}
      </div>
    </Modal>
  );
}
