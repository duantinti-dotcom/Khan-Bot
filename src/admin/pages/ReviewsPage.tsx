import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { createReview, deleteReview, listReviewsAdmin, saveOrder, updateReview, type ReviewInput } from '../../data/admin'
import type { Review } from '../../lib/types'
import { formatDate } from '../../lib/format'
import { friendlyError } from '../../lib/errors'
import { Button, IconButton } from '../../components/ui/Button'
import { Input, Switch, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useFeedback } from '../../components/ui/Feedback'
import { EmptyState, ErrorState, Notice } from '../../components/ui/Misc'
import { PageLoader } from '../../components/ui/Spinner'
import { Stars } from '../../site/sections/Reviews'
import { PageHeader } from '../components/PageHeader'
import { moveItem, OrderButtons } from '../components/OrderButtons'
import { useSiteData } from '../../context/SiteDataContext'

const empty: ReviewInput = { author_name: '', rating: 5, comment: '', review_date: null, source: null, is_demo: false, is_visible: true, sort_order: 0 }

export default function ReviewsPage() {
  const { toast, confirm } = useFeedback()
  const { reload } = useSiteData()
  const [items, setItems] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Review | 'new' | null>(null)
  const [draft, setDraft] = useState<ReviewInput>(empty)
  const [authorized, setAuthorized] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await listReviewsAdmin())
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível carregar as avaliações.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const open = (r: Review | 'new') => {
    setErrors({})
    setAuthorized(r !== 'new')
    setDraft(r === 'new' ? { ...empty, sort_order: (items.at(-1)?.sort_order ?? 0) + 10 } : { ...r })
    setEditing(r)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (draft.author_name.trim().length < 2) errs.author_name = 'Informe o nome ou identificação autorizada.'
    if (draft.comment.trim().length < 2) errs.comment = 'Informe o comentário.'
    if (!draft.is_demo && !authorized) errs.authorized = 'Confirme que a publicação foi autorizada pelo cliente.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    const payload: ReviewInput = {
      author_name: draft.author_name.trim(),
      rating: draft.rating,
      comment: draft.comment.trim(),
      review_date: draft.review_date || null,
      source: draft.source?.trim() || null,
      is_demo: draft.is_demo,
      is_visible: draft.is_visible,
      sort_order: draft.sort_order,
    }
    try {
      if (editing === 'new') {
        const created = await createReview(payload)
        setItems((l) => [...l, created])
        toast('Avaliação cadastrada.')
      } else if (editing) {
        const updated = await updateReview(editing.id, payload)
        setItems((l) => l.map((x) => (x.id === updated.id ? updated : x)))
        toast('Avaliação atualizada.')
      }
      setEditing(null)
      void reload()
    } catch (err) {
      toast(friendlyError(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (r: Review) => {
    try {
      const updated = await updateReview(r.id, { is_visible: !r.is_visible })
      setItems((l) => l.map((x) => (x.id === r.id ? updated : x)))
      void reload()
    } catch (err) {
      toast(friendlyError(err), 'error')
    }
  }

  const remove = async (r: Review) => {
    if (!(await confirm({ title: 'Excluir avaliação', message: `A avaliação de ${r.author_name} será excluída permanentemente.`, confirmLabel: 'Excluir', tone: 'danger' }))) return
    try {
      await deleteReview(r.id)
      setItems((l) => l.filter((x) => x.id !== r.id))
      toast('Avaliação excluída.')
      void reload()
    } catch (err) {
      toast(friendlyError(err), 'error')
    }
  }

  const move = async (from: number, to: number) => {
    const next = moveItem(items, from, to)
    setItems(next)
    setBusy(true)
    try {
      await saveOrder('reviews', next.map((x) => x.id))
      void reload()
    } catch (err) {
      toast(friendlyError(err), 'error')
      void load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Avaliações"
        description="Publique apenas avaliações reais, com autorização do cliente. Exemplos de demonstração são sinalizados no site."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => open('new')}>
            Nova avaliação
          </Button>
        }
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState icon={<Star className="size-5" />} title="Nenhuma avaliação cadastrada" text="Enquanto não houver avaliações, o site exibe uma mensagem neutra na seção." action={<Button onClick={() => open('new')}>Cadastrar avaliação</Button>} />
      ) : (
        <ul className="grid gap-3">
          {items.map((r, i) => (
            <li key={r.id} className={`flex flex-wrap items-start gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4 sm:flex-nowrap ${r.is_visible ? '' : 'opacity-60'}`}>
              <OrderButtons index={i} total={items.length} onMove={(a, b) => void move(a, b)} disabled={busy} />
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{r.author_name}</p>
                  <Stars value={r.rating} className="size-3.5" />
                  {r.is_demo && <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[0.65rem] font-semibold text-warning">Demonstração</span>}
                  {!r.is_visible && <span className="rounded-full border border-ink-500 px-2 py-0.5 text-[0.65rem] font-semibold text-steel-400">Oculta</span>}
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm text-steel-300">{r.comment}</p>
                <p className="mt-1 text-xs text-steel-400">{[r.review_date && formatDate(r.review_date), r.source].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => void toggle(r)}>
                  {r.is_visible ? 'Ocultar' : 'Publicar'}
                </Button>
                <IconButton label="Editar" onClick={() => open(r)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton label="Excluir" onClick={() => void remove(r)} className="hover:text-danger">
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nova avaliação' : 'Editar avaliação'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="review-form" loading={saving}>
              Salvar
            </Button>
          </>
        }
      >
        <form id="review-form" onSubmit={save} noValidate className="grid gap-5">
          <Input label="Nome ou identificação autorizada" hint="Ex.: “Mariana S.” — use somente o que o cliente autorizou." maxLength={80} value={draft.author_name} onChange={(e) => setDraft({ ...draft, author_name: e.target.value })} error={errors.author_name} data-autofocus />
          <fieldset>
            <legend className="mb-2 text-[0.82rem] font-medium text-steel-200">Nota</legend>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setDraft({ ...draft, rating: n })} aria-label={`${n} estrela${n > 1 ? 's' : ''}`} aria-pressed={draft.rating === n} className="rounded-lg p-1.5 hover:bg-white/5">
                  <Star className={`size-6 ${n <= draft.rating ? 'fill-accent text-accent' : 'text-ink-500'}`} strokeWidth={1.5} />
                </button>
              ))}
            </div>
          </fieldset>
          <Textarea label="Comentário" maxLength={1000} value={draft.comment} onChange={(e) => setDraft({ ...draft, comment: e.target.value })} error={errors.comment} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Input label="Data" type="date" optional value={draft.review_date ?? ''} onChange={(e) => setDraft({ ...draft, review_date: e.target.value || null })} />
            <Input label="Origem" optional placeholder="Ex.: Google, presencial" maxLength={60} value={draft.source ?? ''} onChange={(e) => setDraft({ ...draft, source: e.target.value })} />
          </div>
          <Switch label="Publicar no site" checked={draft.is_visible} onChange={(v) => setDraft({ ...draft, is_visible: v })} />
          <Switch label="Conteúdo de demonstração" description="Marque somente para exemplos. O site exibirá o selo “Exemplo demonstrativo” e não contará na média." checked={draft.is_demo} onChange={(v) => setDraft({ ...draft, is_demo: v })} />
          {!draft.is_demo && (
            <label className="flex items-start gap-3 text-sm text-steel-300">
              <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} className="mt-0.5 size-4.5 accent-[var(--color-accent)]" />
              Confirmo que esta é uma avaliação real e que o cliente autorizou a publicação.
            </label>
          )}
          {errors.authorized && <Notice tone="warning">{errors.authorized}</Notice>}
        </form>
      </Modal>
    </>
  )
}
