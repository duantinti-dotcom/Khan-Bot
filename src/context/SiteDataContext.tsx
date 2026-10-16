import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fallbackSiteData, fetchSiteData, type SiteData } from '../data/public'
import { applyTheme } from '../lib/theme'

interface SiteDataState {
  data: SiteData
  loading: boolean
  error: unknown
  reload: () => Promise<void>
}

const SiteDataContext = createContext<SiteDataState | null>(null)

export function SiteDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SiteData>(fallbackSiteData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  const reload = useCallback(async () => {
    try {
      const next = await fetchSiteData()
      setData(next)
      setError(null)
    } catch (err) {
      console.error('[site] falha ao carregar dados', err)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    applyTheme(data.settings.theme.accent)
  }, [data.settings.theme.accent])

  const value = useMemo(() => ({ data, loading, error, reload }), [data, loading, error, reload])
  return <SiteDataContext.Provider value={value}>{children}</SiteDataContext.Provider>
}

export function useSiteData() {
  const ctx = useContext(SiteDataContext)
  if (!ctx) throw new Error('useSiteData precisa estar dentro de SiteDataProvider')
  return ctx
}
