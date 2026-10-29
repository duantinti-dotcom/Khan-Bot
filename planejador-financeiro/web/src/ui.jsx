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
        <defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--accent2)" /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface2)" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#rg)" strokeWidth="10" strokeLinecap="round"
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
        {[0, 0.5, 1].map((f) => <line key={f} x1={P} x2={W - P} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" />)}
        {series.map((s, i) => {
          const x = P + i * bw + bw * 0.14;
          const w = (bw * 0.72) / 3;
          return (
            <g key={s.key}>
              <rect x={x} y={y(s.income)} width={w - 3} height={H - 24 - y(s.income)} rx="4" fill="var(--accent2)"><title>Entradas {formatBRL(s.income)}</title></rect>
              <rect x={x + w} y={y(s.expenses)} width={w - 3} height={H - 24 - y(s.expenses)} rx="4" fill="var(--bad)" opacity=".85"><title>Saídas {formatBRL(s.expenses)}</title></rect>
              <rect x={x + 2 * w} y={y(s.saved)} width={w - 3} height={H - 24 - y(s.saved)} rx="4" fill="var(--accent)"><title>Guardado {formatBRL(s.saved)}</title></rect>
              <text x={P + i * bw + bw / 2} y={H - 6} textAnchor="middle">{monthLabel(s.key)}</text>
            </g>
          );
        })}
        <text x={P} y={y(max) - 6}>{formatBRL(max)}</text>
      </svg>
      <div className="legend"><span><i style={{ background: 'var(--accent2)' }} />Entradas</span><span><i style={{ background: 'var(--bad)' }} />Saídas</span><span><i style={{ background: 'var(--accent)' }} />Guardado para metas</span></div>
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
      <line x1={P} x2={W - P} y1={y(target)} y2={y(target)} stroke="var(--accent2)" strokeDasharray="5 5" />
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

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const show = useCallback((m) => { setMsg(m); setTimeout(() => setMsg((x) => (x === m ? null : x)), 3200); }, []);
  return <ToastCtx.Provider value={show}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>;
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
