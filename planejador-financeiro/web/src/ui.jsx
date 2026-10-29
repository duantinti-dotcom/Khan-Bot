import { useEffect, useRef, useState, createContext, useContext, useCallback, useId, isValidElement, cloneElement } from 'react';
import { formatBRL, formatPlain, parseBRL } from '@shared/money.js';
import { formatBR, monthLabel } from '@shared/dates.js';

export const brl = formatBRL;
export const dt = formatBR;

export function Money({ c, sign = false, className = '' }) {
  const cls = sign ? (c < 0 ? 'bad' : c > 0 ? 'ok' : '') : '';
  return <span className={`num ${cls} ${className}`}>{sign && c > 0 ? '+' : ''}{formatBRL(c)}</span>;
}

export function MoneyInput({ value, onChange, huge, autoFocus, id, placeholder = '0,00', allowNegative, 'aria-describedby': describedBy }) {
  return (
    <div className={`money-input ${huge ? 'huge' : ''}`}>
      <span className="prefix">R$</span>
      <input
        id={id}
        aria-describedby={describedBy}
        className="input num"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          const v = e.target.value.replace(allowNegative ? /[^\d.,-]/g : /[^\d.,]/g, '');
          onChange(v);
        }}
      />
    </div>
  );
}

export const centsToInput = (c) => (c == null ? '' : formatPlain(c));
export const inputToCents = (s) => (s === '' || s == null ? null : parseBRL(s));

export function Field({ label, hint, children, full }) {
  // Liga o rótulo ao controle pelo id, para leitores de tela lerem só o rótulo.
  const id = useId();
  const hintId = `${id}-h`;
  const child = isValidElement(children) && !children.props.id
    ? cloneElement(children, { id, 'aria-describedby': hint ? hintId : undefined })
    : children;
  return (
    <div className={`f ${full ? 'full' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {child}
      {hint && <small className="hint" id={hintId}>{hint}</small>}
    </div>
  );
}

export function PasswordInput({ value, onChange, autoComplete = 'current-password', id, placeholder, 'aria-describedby': describedBy }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input id={id} aria-describedby={describedBy} className="input" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete} placeholder={placeholder} autoCapitalize="off" spellCheck="false" />
      <button type="button" className="btn small ghost" onClick={() => setShow(!show)} aria-pressed={show}>
        {show ? 'Ocultar' : 'Mostrar'}<span className="sr-only"> senha</span>
      </button>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('input,select,textarea,button')?.focus?.();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={wide ? { width: 'min(760px, 100%)' } : undefined}>
        <div className="modal-h">
          <h2>{title}</h2>
          <button className="btn small ghost" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Seg({ options, value, onChange, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button type="button" key={String(v)} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function Progress({ value, tone }) {
  const pct = Math.max(0, Math.min(1, value || 0));
  return <div className={`bar ${tone || ''}`} role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct * 100}%` }} /></div>;
}

export function Ring({ value, size = 112, label }) {
  const pct = Math.max(0, Math.min(1, value || 0));
  const r = size / 2 - 9;
  const len = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${len * pct} ${len}`} style={{ transition: 'stroke-dasharray .6s ease' }} />
      </svg>
      <div className="c num">{label ?? `${Math.round(pct * 100)}%`}</div>
    </div>
  );
}

export function Alert({ tone = 'info', children }) {
  const ico = { ok: '✓', warn: '!', bad: '⚠', info: 'i' }[tone];
  return <div className={`alert ${tone}`}><b className={tone} aria-hidden="true">{ico}</b><div>{children}</div></div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

// ---------------------------------------------------------------- gráficos SVG

export function BarsChart({ series }) {
  const W = 640, H = 220, P = 30;
  const max = Math.max(1, ...series.flatMap((s) => [s.income, s.expenses, s.saved]));
  const bw = (W - P * 2) / series.length;
  const y = (v) => H - 24 - (v / max) * (H - 50);
  if (series.every((s) => !s.income && !s.expenses && !s.saved)) return <p className="empty">Os gráficos aparecem quando você registrar entradas e gastos.</p>;
  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Entradas, saídas e valores guardados por mês">
        {[0, 0.5, 1].map((f) => <line key={f} x1={P} x2={W - P} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" />)}
        {series.map((s, i) => {
          const x = P + i * bw + bw * 0.14;
          const w = (bw * 0.72) / 3;
          return (
            <g key={s.key}>
              <rect x={x} y={y(s.income)} width={w - 3} height={H - 24 - y(s.income)} rx="4" fill="var(--ok)"><title>Entradas {formatBRL(s.income)}</title></rect>
              <rect x={x + w} y={y(s.expenses)} width={w - 3} height={H - 24 - y(s.expenses)} rx="4" fill="var(--bad)" opacity=".85"><title>Saídas {formatBRL(s.expenses)}</title></rect>
              <rect x={x + 2 * w} y={y(s.saved)} width={w - 3} height={H - 24 - y(s.saved)} rx="4" fill="var(--accent)"><title>Guardado {formatBRL(s.saved)}</title></rect>
              <text x={P + i * bw + bw / 2} y={H - 6} textAnchor="middle">{monthLabel(s.key)}</text>
            </g>
          );
        })}
        <text x={P} y={y(max) - 6}>{formatBRL(max)}</text>
      </svg>
      <div className="legend"><span><i style={{ background: 'var(--ok)' }} />Entradas</span><span><i style={{ background: 'var(--bad)' }} />Saídas</span><span><i style={{ background: 'var(--accent)' }} />Guardado para metas</span></div>
    </figure>
  );
}

export function GoalChart({ points, target, deadline, start }) {
  const W = 640, H = 200, P = 34;
  if (!points.length) return null;
  const t0 = Date.parse(start || points[0].date);
  const t1 = Date.parse(deadline || points[points.length - 1].date);
  const span = Math.max(1, t1 - t0);
  const max = Math.max(target, ...points.map((p) => p.value)) * 1.05;
  const x = (d) => P + ((Date.parse(d) - t0) / span) * (W - 2 * P);
  const y = (v) => H - 22 - (v / max) * (H - 44);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${Math.max(P, Math.min(W - P, x(p.date))).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolução da meta">
      <line x1={P} x2={W - P} y1={y(target)} y2={y(target)} stroke="var(--ok)" strokeDasharray="5 5" />
      <text x={W - P} y={y(target) - 6} textAnchor="end">Meta {formatBRL(target)}</text>
      {deadline && <line x1={P} y1={y(0)} x2={x(deadline)} y2={y(target)} stroke="var(--faint)" strokeDasharray="2 6" />}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" />
      <circle cx={Math.min(W - P, x(last.date))} cy={y(last.value)} r="5" fill="var(--accent)" />
      <text x={P} y={H - 4}>{formatBR(start || points[0].date)}</text>
      {deadline && <text x={W - P} y={H - 4} textAnchor="end">{formatBR(deadline)}</text>}
    </svg>
  );
}

// ---------------------------------------------------------------- avisos rápidos e async

// Número que anima ao mudar (desligado com movimento reduzido).
export function AnimatedMoney({ c, className = '' }) {
  const [shown, setShown] = useState(c);
  const prev = useRef(c);
  useEffect(() => {
    const from = prev.current;
    prev.current = c;
    if (from === c || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(c); return; }
    let raf;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 450);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(from + (c - from) * e));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [c]);
  return <span className={`num ${className}`}>{formatBRL(shown)}</span>;
}

// Expansão suave (altura animada via grid), usada em explicações e detalhes.
export function Expander({ open, children, id }) {
  return <div className={`expander ${open ? 'open' : ''}`} id={id} aria-hidden={!open}><div>{children}</div></div>;
}

// Um dos números principais, com explicação curta ao tocar no "?".
export function Tile({ label, value, sub, explain, tone, main, wide }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className={`tile ${main ? 'main' : ''} ${wide ? 'wide' : ''}`} aria-labelledby={`${id}-l`}>
      <div className="lbl">
        <span id={`${id}-l`}>{label}</span>
        <button className="info-btn" aria-expanded={open} aria-controls={`${id}-e`} aria-label={`O que é “${label}”?`} onClick={() => setOpen(!open)}>?</button>
      </div>
      <div className={`val ${tone || ''}`}><AnimatedMoney c={value} /></div>
      {sub && <div className="sub">{sub}</div>}
      <Expander open={open} id={`${id}-e`}><div className="explain">{explain}</div></Expander>
    </section>
  );
}

// Barra que mostra como o dinheiro foi dividido (cada parte na sua cor).
export function SplitBar({ parts, label = 'Divisão do dinheiro' }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (!total) return <div className="split" aria-label={label} />;
  return (
    <div className="split" role="img" aria-label={`${label}: ${parts.filter((p) => p.value > 0).map((p) => `${p.label} ${formatBRL(p.value)}`).join(', ')}`}>
      {parts.filter((p) => p.value > 0).map((p, i) => (
        <i key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color, animationDelay: `${i * 60}ms` }} title={`${p.label}: ${formatBRL(p.value)}`} />
      ))}
    </div>
  );
}

// Ícones de linha para a navegação (sem ícones decorativos).
const PATHS = {
  inicio: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  mov: 'M7 4v14m0 0-3-3m3 3 3-3M17 20V6m0 0-3 3m3-3 3 3',
  plano: 'M12 3v9l7.5 4.5M21 12a9 9 0 1 1-9-9',
  metas: 'M5 21V4m0 0h11l-2 4 2 4H5',
  perfil: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0',
  mais: 'M12 5v14M5 12h14',
  sair: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10',
  seta: 'M9 6l6 6-6 6',
  check: 'M5 12l4 4 10-10',
  alerta: 'M12 8v5m0 3h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  entrada: 'M12 4v14m0 0-5-5m5 5 5-5',
  gasto: 'M12 20V6m0 0-5 5m5-5 5 5',
  transf: 'M4 8h13m0 0-3-3m3 3-3 3M20 16H7m0 0 3-3m-3 3 3 3',
  guardar: 'M5 21V4m0 0h11l-2 4 2 4H5',
  categorias: 'M4 6h16M4 12h16M4 18h10',
  contas: 'M3 7h18v12H3zM3 11h18',
  fixos: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
  dados: 'M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z',
  aprender: 'M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z',
};
export function Icon({ name, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function More({ label = 'Mais opções', children, open }) {
  return <details className="more" open={open}><summary>{label}</summary><div className="inner">{children}</div></details>;
}

export function EmptyCta({ icon, title, text, action }) {
  return (
    <div className="card empty-cta">
      <div className="big" aria-hidden="true"><Icon name={icon} size={30} /></div>
      <h3>{title}</h3>
      {text && <p className="muted">{text}</p>}
      {action}
    </div>
  );
}

const ToastCtx = createContext(() => {});
// Aviso rápido. `toast('Salvo')` ou `toast({ text, ok: true, action: { label: 'Desfazer', run } })`.
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const show = useCallback((m) => {
    const t = typeof m === 'string' ? { text: m } : m;
    const id = Math.random();
    setMsg({ ...t, id });
    setTimeout(() => setMsg((x) => (x?.id === id ? null : x)), t.action ? 7000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg.ok && <span className="ok-check" aria-hidden="true">✓</span>}
          <span>{msg.text}</span>
          {msg.action && <button className="btn small" onClick={async () => { setMsg(null); await msg.action.run(); }}>{msg.action.label}</button>}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function useSubmit(fn) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (...args) => {
    setBusy(true); setError(null);
    try { return await fn(...args); } catch (e) { setError(e.message || 'Erro'); throw e; } finally { setBusy(false); }
  };
  return { busy, error, setError, run };
}
