import type { ReactNode } from 'react'
import { useNoIndex } from '../../lib/seo'
import { STATUS_META } from '../../lib/status'
import type { QuoteStatus } from '../../lib/types'

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  useNoIndex(title)
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-wide text-2xl font-bold tracking-tight uppercase sm:text-[1.7rem]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-steel-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ title, description, actions, children, className = '' }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-ink-700 bg-ink-900 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-steel-400">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function Pagination({ page, pageSize, count, onPage }: { page: number; pageSize: number; count: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  if (count <= pageSize) return null
  const from = page * pageSize + 1
  const to = Math.min(count, (page + 1) * pageSize)
  return (
    <div className="flex items-center justify-between gap-4 border-t border-ink-700 px-4 py-3 text-sm text-steel-400">
      <span>
        {from}–{to} de {count}
      </span>
      <div className="flex gap-2">
        <button type="button" className="h-9 rounded-full border border-ink-600 px-4 hover:text-snow disabled:opacity-40" disabled={page === 0} onClick={() => onPage(page - 1)}>
          Anterior
        </button>
        <button type="button" className="h-9 rounded-full border border-ink-600 px-4 hover:text-snow disabled:opacity-40" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          Próxima
        </button>
      </div>
    </div>
  )
}

export function StatusBadge({ status }: { status: QuoteStatus }) {
  const meta = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold whitespace-nowrap ${meta.tone}`}>
      <span className={`size-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}
