import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Eye, EyeOff, ImagePlus, Images, Pencil, Trash2 } from 'lucide-react'
import { createGalleryImage, deleteGalleryImage, listGalleryAdmin, saveOrder, updateGalleryImage, uploadMedia } from '../../data/admin'
import type { GalleryCategory, GalleryImage } from '../../lib/types'
import { validateImageFile } from '../../lib/images'
import { friendlyError } from '../../lib/errors'
import { Button, IconButton } from '../../components/ui/Button'
import { Input, Select, Switch } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useFeedback } from '../../components/ui/Feedback'
import { EmptyState, ErrorState } from '../../components/ui/Misc'
import { PageLoader } from '../../components/ui/Spinner'
import { SmartImage } from '../../components/ui/SmartImage'
import { PageHeader } from '../components/PageHeader'
import { moveItem, OrderButtons } from '../components/OrderButtons'
import { GALLERY_CATEGORIES } from '../../site/sections/Gallery'
import { useSiteData } from '../../context/SiteDataContext'

export default function GalleryPage() {
  const { toast, confirm } = useFeedback()
  const { reload } = useSiteData()
  const [items, setItems] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [editing, setEditing] = useState<GalleryImage | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await listGalleryAdmin())
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível carregar a galeria.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const upload = async (files: File[]) => {
    const valid: File[] = []
    for (const f of files) {
      const err = validateImageFile(f, ['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
      if (err) toast(`${f.name}: ${err}`, 'error')
      else valid.push(f)
    }
    if (!valid.length) return
    setUploading({ done: 0, total: valid.length })
    let order = (items.at(-1)?.sort_order ?? 0) + 10
    for (const [i, f] of valid.entries()) {
      try {
        const { url, path } = await uploadMedia(f, 'gallery')
        const created = await createGalleryImage({ image_url: url, storage_path: path, caption: null, alt_text: null, category: 'oficina', is_visible: true, sort_order: order })
        order += 10
        setItems((list) => [...list, created])
      } catch (err) {
        toast(`${f.name}: ${friendlyError(err, 'falha no envio.')}`, 'error')
      }
      setUploading({ done: i + 1, total: valid.length })
    }
    setUploading(null)
    toast('Upload concluído. As imagens já aparecem no site.')
    void reload()
  }

  const toggle = async (img: GalleryImage) => {
    try {
      const updated = await updateGalleryImage(img.id, { is_visible: !img.is_visible })
      setItems((l) => l.map((x) => (x.id === img.id ? updated : x)))
      void reload()
    } catch (err) {
      toast(friendlyError(err), 'error')
    }
  }

  const remove = async (img: GalleryImage) => {
    if (!(await confirm({ title: 'Remover imagem', message: 'A imagem será removida da galeria e do armazenamento.', confirmLabel: 'Remover', tone: 'danger' }))) return
    try {
      await deleteGalleryImage(img)
      setItems((l) => l.filter((x) => x.id !== img.id))
      toast('Imagem removida.')
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
      await saveOrder('gallery_images', next.map((x) => x.id))
      void reload()
    } catch (err) {
      toast(friendlyError(err), 'error')
      void load()
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    try {
      const updated = await updateGalleryImage(editing.id, {
        caption: editing.caption?.trim() || null,
        alt_text: editing.alt_text?.trim() || null,
        category: editing.category,
        is_visible: editing.is_visible,
      })
      setItems((l) => l.map((x) => (x.id === updated.id ? updated : x)))
      setEditing(null)
      toast('Imagem atualizada.')
      void reload()
    } catch (err) {
      toast(friendlyError(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const replace = async (file: File | undefined) => {
    if (!file || !editing) return
    const err = validateImageFile(file, ['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
    if (err) return toast(err, 'error')
    setSaving(true)
    try {
      const old = editing.storage_path
      const { url, path } = await uploadMedia(file, 'gallery')
      const updated = await updateGalleryImage(editing.id, { image_url: url, storage_path: path })
      setItems((l) => l.map((x) => (x.id === updated.id ? updated : x)))
      setEditing({ ...editing, image_url: url, storage_path: path })
      if (old) {
        const { removeMedia } = await import('../../data/admin')
        await removeMedia(old).catch(() => undefined)
      }
      toast('Imagem substituída.')
      void reload()
    } catch (e) {
      toast(friendlyError(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Galeria"
        description="Imagens exibidas na seção Galeria do site. Use fotos reais da oficina sempre que possível."
        actions={
          <>
            <Button icon={<ImagePlus className="size-4" />} loading={Boolean(uploading)} onClick={() => fileRef.current?.click()}>
              {uploading ? `Enviando ${uploading.done}/${uploading.total}` : 'Enviar imagens'}
            </Button>
            <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" tabIndex={-1} onChange={(e) => void upload(Array.from(e.target.files ?? [])).finally(() => (e.target.value = ''))} />
          </>
        }
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState icon={<Images className="size-5" />} title="Galeria vazia" text="Envie fotos da oficina, serviços e equipamentos. A seção fica oculta no site enquanto não houver imagens." action={<Button onClick={() => fileRef.current?.click()}>Enviar imagens</Button>} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((img, i) => (
            <li key={img.id} className={`overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 ${img.is_visible ? '' : 'opacity-60'}`}>
              <div className="relative aspect-[4/3]">
                <SmartImage src={img.image_url} width={700} alt={img.alt_text ?? ''} className="size-full object-cover" />
                {!img.is_visible && <span className="absolute top-3 left-3 rounded-full bg-ink-950/80 px-2.5 py-1 text-[0.7rem] font-semibold">Oculta no site</span>}
              </div>
              <div className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{img.caption || <span className="text-steel-400">Sem legenda</span>}</p>
                  <p className="text-xs text-steel-400">{GALLERY_CATEGORIES[img.category]}</p>
                </div>
                <OrderButtons index={i} total={items.length} onMove={(a, b) => void move(a, b)} disabled={busy} />
                <IconButton label={img.is_visible ? 'Ocultar no site' : 'Exibir no site'} onClick={() => void toggle(img)}>
                  {img.is_visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </IconButton>
                <IconButton label="Editar" onClick={() => setEditing(img)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton label="Remover" onClick={() => void remove(img)} className="hover:text-danger">
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Editar imagem"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="gallery-form" loading={saving}>
              Salvar
            </Button>
          </>
        }
      >
        {editing && (
          <form id="gallery-form" onSubmit={saveEdit} className="grid gap-5">
            <div className="overflow-hidden rounded-xl border border-ink-700">
              <SmartImage src={editing.image_url} width={900} alt="" className="aspect-[16/9] w-full object-cover" />
            </div>
            <Button size="sm" variant="outline" className="justify-self-start" onClick={() => replaceRef.current?.click()} icon={<ImagePlus className="size-4" />}>
              Substituir arquivo
            </Button>
            <input ref={replaceRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" tabIndex={-1} onChange={(e) => void replace(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
            <Input label="Legenda" optional maxLength={160} value={editing.caption ?? ''} onChange={(e) => setEditing({ ...editing, caption: e.target.value })} />
            <Input label="Texto alternativo" optional maxLength={200} hint="Descreva a imagem para leitores de tela e SEO." value={editing.alt_text ?? ''} onChange={(e) => setEditing({ ...editing, alt_text: e.target.value })} />
            <Select label="Categoria" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as GalleryCategory })}>
              {Object.entries(GALLERY_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Switch label="Exibir no site" checked={editing.is_visible} onChange={(v) => setEditing({ ...editing, is_visible: v })} />
          </form>
        )}
      </Modal>
    </>
  )
}
