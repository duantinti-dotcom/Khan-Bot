import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { IconButton } from '../../components/ui/Button'

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 border-b border-ink-700 py-8 first:pt-0 last:border-0 lg:grid-cols-[18rem_1fr] lg:gap-10">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-steel-400">{description}</p>}
      </div>
      <div className="grid min-w-0 gap-5">{children}</div>
    </section>
  )
}

export function Grid2({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 sm:grid-cols-2">{children}</div>
}

/** Lista editável genérica (horários, links, diferenciais…). */
export function ListEditor<T>({
  items,
  onChange,
  render,
  create,
  addLabel,
  max = 10,
}: {
  items: T[]
  onChange: (items: T[]) => void
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode
  create: () => T
  addLabel: string
  max?: number
}) {
  return (
    <div className="grid gap-3">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 rounded-xl border border-ink-700 bg-ink-900 p-3">
          <div className="grid min-w-0 flex-1 gap-3">{render(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))), i)}</div>
          <IconButton label="Remover item" onClick={() => onChange(items.filter((_, j) => j !== i))} className="mt-6 hover:text-danger">
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ))}
      {items.length < max && (
        <button type="button" onClick={() => onChange([...items, create()])} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-dashed border-ink-500 text-sm font-medium text-steel-300 hover:border-steel-300 hover:text-snow">
          <Plus className="size-4" /> {addLabel}
        </button>
      )}
    </div>
  )
}
