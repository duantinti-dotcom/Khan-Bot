import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

// ------------------------------------------------------------------- Toasts
type ToastTone = 'success' | 'error' | 'info'
interface Toast {
  id: number
  tone: ToastTone
  message: string
}

interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'default'
}

interface FeedbackApi {
  toast: (message: string, tone?: ToastTone) => void
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

const FeedbackContext = createContext<FeedbackApi | null>(null)

const toneIcon = {
  success: <CheckCircle2 className="size-5 text-success" />,
  error: <XCircle className="size-5 text-danger" />,
  info: <Info className="size-5 text-info" />,
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId.current++
      setToasts((t) => [...t.slice(-3), { id, tone, message }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000)
    },
    [dismiss],
  )

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    [],
  )

  const close = (value: boolean) => {
    confirmState?.resolve(value)
    setConfirmState(null)
  }

  const api = useMemo(() => ({ toast, confirm }), [toast, confirm])

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex flex-col items-center gap-2 p-4 sm:items-end"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-2xl border border-ink-600 bg-ink-800 px-4 py-3 text-sm shadow-2xl shadow-black/40"
          >
            <span className="mt-0.5 shrink-0">{toneIcon[t.tone]}</span>
            <p className="flex-1 text-steel-200">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} className="shrink-0 text-steel-400 hover:text-snow" aria-label="Fechar aviso">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <Modal
        open={Boolean(confirmState)}
        onClose={() => close(false)}
        title={confirmState?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button variant={confirmState?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)} data-autofocus>
              {confirmState?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        <div className="flex gap-3">
          {confirmState?.tone === 'danger' && <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />}
          <div className="text-sm leading-relaxed text-steel-300">{confirmState?.message}</div>
        </div>
      </Modal>
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback precisa estar dentro de FeedbackProvider')
  return ctx
}
