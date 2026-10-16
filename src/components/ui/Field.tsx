import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

const control =
  'w-full rounded-xl border bg-ink-850 px-3.5 text-[0.95rem] text-snow placeholder:text-steel-400/70 transition-colors outline-none hover:border-ink-500 focus:border-accent focus:ring-3 focus:ring-accent/20 disabled:opacity-60 aria-invalid:border-danger/70 aria-invalid:focus:ring-danger/20'

interface FieldShellProps {
  label: string
  hint?: ReactNode
  error?: string
  optional?: boolean
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
  className?: string
}

export function FieldShell({ label, hint, error, optional, children, className = '' }: FieldShellProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-[0.82rem] font-medium text-steel-200">
        <span>{label}</span>
        {optional && <span className="text-[0.72rem] font-normal text-steel-400">Opcional</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-steel-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

type Common = { label: string; hint?: ReactNode; error?: string; optional?: boolean; wrapperClassName?: string }

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Common>(function Input(
  { label, hint, error, optional, wrapperClassName, className = '', ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <input
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${control} h-12 ${invalid ? 'border-danger/70' : 'border-ink-600'} ${className}`}
          {...rest}
        />
      )}
    </FieldShell>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Common>(function Textarea(
  { label, hint, error, optional, wrapperClassName, className = '', ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <textarea
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${control} min-h-28 resize-y py-3 leading-relaxed ${invalid ? 'border-danger/70' : 'border-ink-600'} ${className}`}
          {...rest}
        />
      )}
    </FieldShell>
  )
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & Common>(function Select(
  { label, hint, error, optional, wrapperClassName, className = '', children, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <select
            ref={ref}
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={`${control} h-12 appearance-none pr-10 ${invalid ? 'border-danger/70' : 'border-ink-600'} ${className}`}
            {...rest}
          >
            {children}
          </select>
          <svg className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-steel-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </FieldShell>
  )
})

/** Botões de escolha única (rádio) com aparência de segmentos. */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  optional,
  name,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: ReactNode }[]
  optional?: boolean
  name: string
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 flex w-full items-baseline justify-between text-[0.82rem] font-medium text-steel-200">
        <span>{label}</span>
        {optional && <span className="text-[0.72rem] font-normal text-steel-400">Opcional</span>}
      </legend>
      <div className="grid auto-cols-fr grid-flow-col gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors has-focus-visible:ring-3 has-focus-visible:ring-accent/30 ${
              value === o.value
                ? 'border-accent bg-accent/10 text-snow'
                : 'border-ink-600 bg-ink-850 text-steel-300 hover:border-ink-500 hover:text-snow'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.icon}
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-snow">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-steel-400">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
          checked ? 'border-accent bg-accent' : 'border-ink-500 bg-ink-700'
        }`}
      >
        <span
          className={`inline-block size-4.5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[1.4rem]' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  )
}
