import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** "sheet" abre como painel lateral (útil para detalhes no painel). */
  variant?: 'dialog' | 'sheet'
  closeOnBackdrop?: boolean
}

const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, title, description, children, footer, size = 'md', variant = 'dialog', closeOnBackdrop = true }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(() => {
      const panel = panelRef.current
      const target = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel
      target?.focus()
    }, 20)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
      if (e.key === 'Tab' && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
        if (!items.length) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open])

  if (!open) return null

  const isSheet = variant === 'sheet'
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="presentation">
      <div
        className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-[2px]"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={
          isSheet
            ? 'relative ml-auto flex h-full w-full max-w-2xl animate-slide-in-right flex-col border-l border-ink-700 bg-ink-900 outline-none sm:self-stretch'
            : `relative flex max-h-[92dvh] w-full animate-scale-in flex-col rounded-t-3xl border border-ink-700 bg-ink-900 outline-none sm:rounded-3xl ${widths[size]}`
        }
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-700 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="font-wide text-lg font-semibold tracking-tight uppercase">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-steel-400">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-steel-300 transition-colors hover:bg-white/[0.07] hover:text-snow"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <footer className="flex flex-col-reverse gap-2 border-t border-ink-700 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
