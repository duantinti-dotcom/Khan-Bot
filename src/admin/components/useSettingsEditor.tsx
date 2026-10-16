import { useCallback, useEffect, useMemo, useState } from 'react'
import { Save, Undo2 } from 'lucide-react'
import { getSettings, saveSettings } from '../../data/admin'
import { settingsSchema } from '../../lib/settingsSchema'
import type { SiteSettings } from '../../lib/settings'
import { friendlyError } from '../../lib/errors'
import { formatDateTime } from '../../lib/format'
import { useAuth } from '../../context/AuthContext'
import { useSiteData } from '../../context/SiteDataContext'
import { useFeedback } from '../../components/ui/Feedback'
import { Button } from '../../components/ui/Button'

type Path = string

function getAt(obj: unknown, path: Path): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), obj)
}

function setAt<T>(obj: T, path: Path, value: unknown): T {
  const keys = path.split('.')
  const clone = (o: unknown) => (Array.isArray(o) ? [...o] : { ...(o as object) })
  const root = clone(obj) as Record<string, unknown>
  let cur = root
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = clone(cur[keys[i]])
    cur = cur[keys[i]] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
  return root as T
}

/** Carrega, edita, valida e salva a linha única de configurações do site. */
export function useSettingsEditor() {
  const { user } = useAuth()
  const { reload } = useSiteData()
  const { toast } = useFeedback()
  const [original, setOriginal] = useState<SiteSettings | null>(null)
  const [draft, setDraft] = useState<SiteSettings | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const { settings, updated_at } = await getSettings()
      setOriginal(settings)
      setDraft(settings)
      setUpdatedAt(updated_at)
    } catch (err) {
      setLoadError(friendlyError(err, 'Não foi possível carregar as configurações.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const dirty = useMemo(() => JSON.stringify(original) !== JSON.stringify(draft), [original, draft])

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const get = useCallback(<T,>(path: Path) => getAt(draft, path) as T, [draft])
  const set = useCallback((path: Path, value: unknown) => {
    setDraft((d) => (d ? setAt(d, path, value) : d))
    setErrors((e) => {
      if (!e[path]) return e
      const n = { ...e }
      delete n[path]
      return n
    })
  }, [])

  /** Props prontas para <Input>/<Textarea>. */
  const field = (path: Path) => ({
    value: (get<string>(path) ?? '') as string,
    onChange: (e: { target: { value: string } }) => set(path, e.target.value),
    error: errors[path],
    name: path,
  })

  const save = async () => {
    if (!draft || !user) return
    const parsed = settingsSchema.safeParse(draft)
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const i of parsed.error.issues) errs[i.path.join('.')] ??= i.message
      setErrors(errs)
      toast('Revise os campos destacados antes de salvar.', 'error')
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setSaving(true)
    try {
      const res = await saveSettings(parsed.data, user.id)
      setOriginal(parsed.data)
      setDraft(parsed.data)
      setUpdatedAt(res.updated_at)
      toast('Alterações salvas e publicadas no site.')
      void reload()
    } catch (err) {
      toast(friendlyError(err, 'Não foi possível salvar.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveBar = (
    <div
      className={`sticky bottom-0 z-10 -mx-4 mt-8 flex flex-col gap-3 border-t border-ink-700 bg-ink-950/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:-mx-8 lg:px-8`}
    >
      <p className="text-xs text-steel-400">
        {dirty ? <span className="font-semibold text-warning">Alterações não salvas</span> : updatedAt ? `Última atualização: ${formatDateTime(updatedAt)}` : 'Usando o conteúdo padrão.'}
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" disabled={!dirty || saving} onClick={() => original && (setDraft(original), setErrors({}))} icon={<Undo2 className="size-4" />}>
          Descartar
        </Button>
        <Button onClick={() => void save()} loading={saving} disabled={!dirty} icon={<Save className="size-4" />}>
          Salvar alterações
        </Button>
      </div>
    </div>
  )

  return { draft, loading, loadError, load, get, set, field, errors, saveBar, dirty }
}
