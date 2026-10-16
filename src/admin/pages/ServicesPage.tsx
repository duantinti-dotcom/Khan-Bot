import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pencil, Plus, Trash2, Wrench } from 'lucide-react'
import { createService, deleteService, listServicesAdmin, saveOrder, updateService, type ServiceInput } from '../../data/admin'
import type { Service } from '../../lib/types'
import { centsToInput, formatCurrency, parseCurrencyToCents } from '../../lib/format'
import { friendlyError } from '../../lib/errors'
import { Button, IconButton } from '../../components/ui/Button'
import { Input, Select, Switch, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useFeedback } from '../../components/ui/Feedback'
import { EmptyState, ErrorState } from '../../components/ui/Misc'
import { PageLoader } from '../../components/ui/Spinner'
import { ICONS, ServiceIcon } from '../../components/ui/ServiceIcon'
import { PageHeader } from '../components/PageHeader'
import { ImageField } from '../components/ImageField'
import { moveItem, OrderButtons } from '../components/OrderButtons'
import { useSiteData } from '../../context/SiteDataContext'

interface Draft {
  name: string
  description: string
  category: string
  icon: string
  price: string
  price_note: string
  image_url: string
  is_active: boolean
}

const emptyDraft: Draft = { name: '', description: '', category: 'Geral', icon: 'wrench', price: '', price_note: '', image_url: '', is_active: true }

export default function ServicesPage() {
  const { toast, confirm } = useFeedback()
  const { reload } = useSiteData()
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Service | 'new' | null>(params.get('novo') ? 'new' : null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const [saving, setSaving] = useState(false)
  const [reordering, setReordering] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await listServicesAdmin())
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível carregar os serviços.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openEditor = (s: Service | 'new') => {
    setErrors({})
    setDraft(
      s === 'new'
        ? emptyDraft
        : {
            name: s.name,
            description: s.description,
            category: s.category,
            icon: s.icon,
            price: centsToInput(s.price_cents),
            price_note: s.price_note ?? '',
            image_url: s.image_url ?? '',
            is_active: s.is_active,
          },
    )
    setEditing(s)
  }

  useEffect(() => {
    if (params.get('novo')) {
      openEditor('new')
      setParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categories = Array.from(new Set(items.map((s) => s.category)))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (draft.name.trim().length < 2) errs.name = 'Informe o nome (mínimo 2 caracteres).'
    if (draft.name.trim().length > 80) errs.name = 'Máximo de 80 caracteres.'
    if (draft.description.length > 600) errs.description = 'Máximo de 600 caracteres.'
    if (!draft.category.trim()) errs.category = 'Informe a categoria.'
    const cents = parseCurrencyToCents(draft.price)
    if (draft.price.trim() && cents === null) errs.price = 'Valor inválido. Ex.: 189,90'
    setErrors(errs)
    if (Object.keys(errs).length) return

    const payload: ServiceInput = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      category: draft.category.trim(),
      icon: draft.icon,
      price_cents: cents,
      price_note: draft.price_note.trim() || null,
      image_url: draft.image_url || null,
      is_active: draft.is_active,
      sort_order: editing === 'new' ? (items.at(-1)?.sort_order ?? 0) + 10 : (editing as Service).sort_order,
    }
    setSaving(true)
    try {
      if (editing === 'new') {
        const created = await createService(payload)
        setItems((list) => [...list, created])
        toast('Serviço criado e publicado no site.')
      } else if (editing) {
        const updated = await updateService(editing.id, payload)
        setItems((list) => list.map((s) => (s.id === updated.id ? updated : s)))
        toast('Serviço atualizado.')
      }
      setEditing(null)
      void reload()
    } catch (err) {
      toast(friendlyError(err, 'Não foi possível salvar o serviço.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (s: Service) => {
    try {
      const updated = await updateService(s.id, { is_active: !s.is_active })
      setItems((list) => list.map((x) => (x.id === s.id ? updated : x)))
      toast(updated.is_active ? 'Serviço ativado no site.' : 'Serviço desativado. Ele não aparece mais no site nem no formulário.')
      void reload()
    } catch (err) {
      toast(friendlyError(err), 'error')
    }
  }

  const remove = async (s: Service) => {
    const ok = await confirm({
      title: 'Excluir serviço',
      message: (
        <>
          O serviço <strong>{s.name}</strong> será excluído. Solicitações antigas mantêm o nome do serviço no histórico. Se quiser apenas ocultá-lo, use “Desativar”.
        </>
      ),
      confirmLabel: 'Excluir serviço',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteService(s.id)
      setItems((list) => list.filter((x) => x.id !== s.id))
      toast('Serviço excluído.')
      void reload()
    } catch (err) {
      toast(friendlyError(err), 'error')
    }
  }

  const move = async (from: number, to: number) => {
    const next = moveItem(items, from, to)
    setItems(next)
    setReordering(true)
    try {
      await saveOrder('services', next.map((s) => s.id))
      void reload()
    } catch (err) {
      toast(friendlyError(err, 'Não foi possível salvar a nova ordem.'), 'error')
      void load()
    } finally {
      setReordering(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Serviços"
        description="Catálogo exibido no site e nas opções do formulário de orçamento. Serviços inativos ficam ocultos."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => openEditor('new')}>
            Novo serviço
          </Button>
        }
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState icon={<Wrench className="size-5" />} title="Nenhum serviço cadastrado" text="Cadastre os serviços da oficina para exibi-los no site." action={<Button onClick={() => openEditor('new')}>Cadastrar serviço</Button>} />
      ) : (
        <ul className="grid gap-2">
          {items.map((s, i) => (
            <li key={s.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-3 sm:flex-nowrap sm:p-4 ${s.is_active ? '' : 'opacity-60'}`}>
              <OrderButtons index={i} total={items.length} onMove={(a, b) => void move(a, b)} disabled={reordering} />
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <ServiceIcon name={s.icon} />
              </span>
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate font-medium">{s.name}</p>
                <p className="truncate text-xs text-steel-400">
                  {s.category}
                  {s.price_cents != null && ` · ${s.price_note ? `${s.price_note} ` : ''}${formatCurrency(s.price_cents)}`}
                </p>
              </div>
              <span className={`rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold ${s.is_active ? 'border-success/30 bg-success/10 text-success' : 'border-ink-500 text-steel-400'}`}>
                {s.is_active ? 'Ativo' : 'Inativo'}
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => void toggle(s)}>
                  {s.is_active ? 'Desativar' : 'Ativar'}
                </Button>
                <IconButton label={`Editar ${s.name}`} onClick={() => openEditor(s)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton label={`Excluir ${s.name}`} onClick={() => void remove(s)} className="hover:text-danger">
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
        title={editing === 'new' ? 'Novo serviço' : 'Editar serviço'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="service-form" loading={saving}>
              Salvar serviço
            </Button>
          </>
        }
      >
        <form id="service-form" onSubmit={save} noValidate className="grid gap-5">
          <Input label="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} error={errors.name} maxLength={80} data-autofocus />
          <Textarea label="Descrição" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} error={errors.description} maxLength={600} hint={`${draft.description.length}/600`} />
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Input label="Categoria" list="service-categories" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} error={errors.category} maxLength={60} />
              <datalist id="service-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <Select label="Ícone" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })}>
              {Object.entries(ICONS).map(([key, v]) => (
                <option key={key} value={key}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 p-3 text-sm text-steel-300">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <ServiceIcon name={draft.icon} />
            </span>
            Pré-visualização do ícone
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Input label="Preço" optional inputMode="decimal" placeholder="Ex.: 189,90" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} error={errors.price} hint="Deixe vazio para não exibir valor." />
            <Input label="Texto antes do preço" optional placeholder="Ex.: a partir de" value={draft.price_note} onChange={(e) => setDraft({ ...draft, price_note: e.target.value })} maxLength={60} />
          </div>
          <ImageField label="Imagem (opcional)" value={draft.image_url} onChange={(url) => setDraft({ ...draft, image_url: url })} folder="services" />
          <Switch label="Serviço ativo" description="Serviços ativos aparecem no site e no formulário de orçamento." checked={draft.is_active} onChange={(v) => setDraft({ ...draft, is_active: v })} />
        </form>
      </Modal>
    </>
  )
}
