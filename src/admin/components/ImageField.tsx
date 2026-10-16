import { useRef, useState } from 'react'
import { ImagePlus, Link2, Trash2 } from 'lucide-react'
import { uploadMedia } from '../../data/admin'
import { validateImageFile } from '../../lib/images'
import { friendlyError } from '../../lib/errors'
import { SmartImage } from '../../components/ui/SmartImage'
import { Spinner } from '../../components/ui/Spinner'

interface Props {
  label: string
  value: string
  onChange: (url: string) => void
  folder: 'brand' | 'site' | 'services' | 'gallery'
  hint?: string
  aspect?: string
  allowEmpty?: boolean
}

/** Envia para o bucket público "media" ou aceita uma URL externa. */
export function ImageField({ label, value, onChange, folder, hint, aspect = 'aspect-[16/9]', allowEmpty = true }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [urlMode, setUrlMode] = useState(false)

  const pick = async (file: File | undefined) => {
    if (!file) return
    const err = validateImageFile(file, ['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
    if (err) {
      setError(err)
      return
    }
    setError('')
    setUploading(true)
    try {
      const { url } = await uploadMedia(file, folder)
      onChange(url)
    } catch (e) {
      setError(friendlyError(e, 'Falha no envio da imagem.'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="grid gap-2">
      <span className="text-[0.82rem] font-medium text-steel-200">{label}</span>
      <div className={`relative overflow-hidden rounded-xl border border-ink-600 bg-ink-850 ${aspect}`}>
        {value ? (
          <SmartImage src={value} width={800} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-steel-400">Nenhuma imagem</div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Spinner className="size-6 text-accent" />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => input.current?.click()} disabled={uploading} className="inline-flex h-9 items-center gap-2 rounded-full border border-ink-600 px-3.5 text-xs font-semibold hover:border-steel-400 disabled:opacity-50">
          <ImagePlus className="size-4" /> {value ? 'Substituir' : 'Enviar imagem'}
        </button>
        <button type="button" onClick={() => setUrlMode((m) => !m)} className="inline-flex h-9 items-center gap-2 rounded-full border border-ink-600 px-3.5 text-xs font-semibold hover:border-steel-400">
          <Link2 className="size-4" /> Usar URL
        </button>
        {value && allowEmpty && (
          <button type="button" onClick={() => onChange('')} className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold text-steel-400 hover:text-danger">
            <Trash2 className="size-4" /> Remover
          </button>
        )}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" tabIndex={-1} onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      </div>
      {urlMode && (
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="https://…"
          aria-label={`${label} — URL`}
          className="h-10 rounded-xl border border-ink-600 bg-ink-850 px-3 text-sm outline-none focus:border-accent"
        />
      )}
      {error ? <p className="text-xs font-medium text-danger" role="alert">{error}</p> : <p className="text-xs text-steel-400">{hint ?? 'JPG, PNG, WebP ou AVIF, até 5 MB.'}</p>}
    </div>
  )
}
