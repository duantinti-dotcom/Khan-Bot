import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { HelpCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { createFaq, deleteFaq, listFaqsAdmin, saveOrder, updateFaq, type FaqInput } from '../../data/admin'
import type { Faq } from '../../lib/types'
import { friendlyError } from '../../lib/errors'
import { Button, IconButton } from '../../components/ui/Button'
import { Input, Switch, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useFeedback } from '../../components/ui/Feedback'
import { EmptyState, ErrorState } from '../../components/ui/Misc'
import { PageLoader } from '../../components/ui/Spinner'
import { PageHeader } from '../components/PageHeader'
import { moveItem, OrderButtons } from '../components/OrderButtons'
import { useSiteData } from '../../context/SiteDataContext'

export default function FaqsPage() {
  const { toast, confirm } = useFeedback()
  const { reload } = useSiteData()
  const [items, setItems] = useState<Faq[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Faq | 'new' | null>(null)
  const [draft, setDraft] = useState<FaqInput>({ question: '', answer: '', is_active: true, sort_order: 0 })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await listFaqsAdmin())
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível carregar as perguntas.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const open = (f: Faq | 'new') => {
    setErrors({})
    setDraft(f === 'new' ? { question: '', answer: '', is_active: true, sort_order: (items.at(-1)?.sort_order ?? 0) + 10 } : { question: f.question, answer: f.answer, is_active: f.is_active, sort_order: f.sort_order })
    setEditing(f)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (draft.question.trim().length < 3) errs.question = 'Informe a pergunta.'
    if (draft.answer.trim().length < 2) errs.answer = 'Informe a resposta.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    const payload = { ...draft, question: draft.question.trim(), answer: draft.answer.trim() }
    try {
      if (editing === 'new') {
        const created = await createFaq(payload)
        setItems((l) => [...l, created])
        toast('Pergunta adicionada.')
      } else if (editing) {
        const updated = await updateFaq(editing.id, payload)
        setItems((l) => l.map((x) => (x.id === updated.id ? updated : x)))
        toast('Pergunta atualizada.')
      }
      setEditing(null)
      void reload()
    } catch (err) {
      toast(friendlyError(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (f: Faq) => {
    try {
      const updated = await updateFaq(f.id, { is_active: !f.is_active })
      setItems((l) => l.map((x) => (x.id === f.id ? updated : x)))
      void reload()
    } catch (err) {
      toast(friendlyError(err), 'error')
    }
  }

  const remove = async (f: Faq) => {
    if (!(await confirm({ title: 'Excluir pergunta', message: `“${f.question}” será excluída permanentemente.`, confirmLabel: 'Excluir', tone: 'danger' }))) return
    try {
      await deleteFaq(f.id)
      setItems((l) => l.filter((x) => x.id !== f.id))
      toast('Pergunta excluída.')
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
      await saveOrder('faqs', next.map((x) => x.id))
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
        title="Perguntas frequentes"
        description="Perguntas e respostas exibidas na seção de dúvidas do site."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => open('new')}>
            Nova pergunta
          </Button>
        }
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState icon={<HelpCircle className="size-5" />} title="Nenhuma pergunta cadastrada" text="A seção fica oculta no site enquanto não houver perguntas ativas." action={<Button onClick={() => open('new')}>Adicionar pergunta</Button>} />
      ) : (
        <ul className="grid gap-2">
          {items.map((f, i) => (
            <li key={f.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4 sm:flex-nowrap ${f.is_active ? '' : 'opacity-60'}`}>
              <OrderButtons index={i} total={items.length} onMove={(a, b) => void move(a, b)} disabled={busy} />
              <div className="min-w-0 flex-1 basis-56">
                <p className="font-medium">{f.question}</p>
                <p className="mt-1 line-clamp-1 text-sm text-steel-400">{f.answer}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => void toggle(f)}>
                  {f.is_active ? 'Desativar' : 'Ativar'}
                </Button>
                <IconButton label="Editar" onClick={() => open(f)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton label="Excluir" onClick={() => void remove(f)} className="hover:text-danger">
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
        title={editing === 'new' ? 'Nova pergunta' : 'Editar pergunta'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="faq-form" loading={saving}>
              Salvar
            </Button>
          </>
        }
      >
        <form id="faq-form" onSubmit={save} noValidate className="grid gap-5">
          <Input label="Pergunta" maxLength={200} value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} error={errors.question} data-autofocus />
          <Textarea label="Resposta" maxLength={2000} className="min-h-40" value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} error={errors.answer} />
          <Switch label="Exibir no site" checked={draft.is_active} onChange={(v) => setDraft({ ...draft, is_active: v })} />
        </form>
      </Modal>
    </>
  )
}
