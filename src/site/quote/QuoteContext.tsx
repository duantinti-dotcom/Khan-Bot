import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

const QuoteDialog = lazy(() => import('./QuoteDialog'))

interface QuoteApi {
  openQuote: (serviceId?: string) => void
}

const QuoteContext = createContext<QuoteApi | null>(null)

export function QuoteProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; serviceId: string; key: number }>({ open: false, serviceId: '', key: 0 })
  const openQuote = useCallback((serviceId = '') => setState((s) => ({ open: true, serviceId, key: s.key + 1 })), [])
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), [])
  const api = useMemo(() => ({ openQuote }), [openQuote])
  return (
    <QuoteContext.Provider value={api}>
      {children}
      {state.open && (
        <Suspense fallback={null}>
          <QuoteDialog key={state.key} open={state.open} initialServiceId={state.serviceId} onClose={close} />
        </Suspense>
      )}
    </QuoteContext.Provider>
  )
}

export function useQuote() {
  const ctx = useContext(QuoteContext)
  if (!ctx) throw new Error('useQuote precisa estar dentro de QuoteProvider')
  return ctx
}
