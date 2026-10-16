import type { ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from './Button'

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-600 px-6 py-14 text-center">
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-ink-600 bg-ink-850 text-steel-300">{icon}</div>}
      <h3 className="text-base font-semibold text-snow">{title}</h3>
      {text && <p className="mt-1.5 max-w-md text-sm text-steel-400">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-danger/30 bg-danger/[0.06] p-5 sm:flex-row sm:items-center">
      <AlertCircle className="size-5 shrink-0 text-danger" />
      <p className="flex-1 text-sm text-steel-200">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} icon={<RefreshCw className="size-4" />}>
          Tentar novamente
        </Button>
      )}
    </div>
  )
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold whitespace-nowrap ${className}`}>
      {children}
    </span>
  )
}

export function Notice({ tone = 'info', children, className = '' }: { tone?: 'info' | 'warning' | 'success'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'border-info/25 bg-info/[0.06] text-steel-200',
    warning: 'border-warning/30 bg-warning/[0.07] text-steel-200',
    success: 'border-success/30 bg-success/[0.07] text-steel-200',
  }
  return <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${tones[tone]} ${className}`}>{children}</div>
}
