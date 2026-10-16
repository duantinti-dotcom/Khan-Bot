import { ArrowDown, ArrowUp } from 'lucide-react'
import { IconButton } from '../../components/ui/Button'

export function OrderButtons({ index, total, onMove, disabled }: { index: number; total: number; onMove: (from: number, to: number) => void; disabled?: boolean }) {
  return (
    <span className="inline-flex">
      <IconButton label="Mover para cima" disabled={disabled || index === 0} onClick={() => onMove(index, index - 1)}>
        <ArrowUp className="size-4" />
      </IconButton>
      <IconButton label="Mover para baixo" disabled={disabled || index === total - 1} onClick={() => onMove(index, index + 1)}>
        <ArrowDown className="size-4" />
      </IconButton>
    </span>
  )
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
