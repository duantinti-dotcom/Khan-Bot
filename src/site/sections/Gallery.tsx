import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react'
import { SmartImage } from '../../components/ui/SmartImage'
import { useSiteData } from '../../context/SiteDataContext'
import type { GalleryCategory } from '../../lib/types'

export const GALLERY_CATEGORIES: Record<GalleryCategory, string> = {
  oficina: 'Oficina',
  servicos: 'Serviços realizados',
  detalhes: 'Detalhes automotivos',
  estrutura: 'Estrutura e equipamentos',
}

export function Gallery() {
  const { data } = useSiteData()
  const { gallerySection, display } = data.settings
  const [filter, setFilter] = useState<GalleryCategory | 'todas'>('todas')
  const [index, setIndex] = useState<number | null>(null)

  const present = useMemo(() => Array.from(new Set(data.gallery.map((g) => g.category))), [data.gallery])
  const images = filter === 'todas' ? data.gallery : data.gallery.filter((g) => g.category === filter)

  if (!display.showGallery || data.gallery.length === 0) return null

  return (
    <section id="galeria" className="border-t border-ink-800 bg-ink-900 py-24 sm:py-32">
      <div className="container-x">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="reveal lg:col-span-7">
            <p className="eyebrow">{gallerySection.eyebrow}</p>
            <h2 className="section-title mt-5">{gallerySection.title}</h2>
          </div>
          <p className="reveal text-base leading-relaxed text-steel-300 lg:col-span-5">{gallerySection.subtitle}</p>
        </div>

        {present.length > 1 && (
          <div className="scrollbar-thin -mx-4 mt-12 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Filtrar galeria">
            {(['todas', ...present] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={filter === c}
                onClick={() => setFilter(c)}
                className={`h-9 shrink-0 rounded-full border px-4 text-[0.8rem] font-medium transition-colors ${
                  filter === c ? 'border-snow bg-snow text-ink-950' : 'border-ink-600 text-steel-300 hover:border-steel-400 hover:text-snow'
                }`}
              >
                {c === 'todas' ? 'Todas' : GALLERY_CATEGORIES[c]}
              </button>
            ))}
          </div>
        )}

        <ul className="mt-8 grid auto-rows-[180px] grid-cols-2 gap-3 sm:auto-rows-[220px] lg:grid-cols-4">
          {images.map((img, i) => {
            const big = i % 6 === 0
            return (
              <li key={img.id} className={`reveal ${big ? 'col-span-2 row-span-2' : ''}`}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  className="group relative size-full overflow-hidden rounded-2xl border border-ink-700 bg-ink-850"
                  aria-label={`Ampliar imagem${img.caption ? `: ${img.caption}` : ''}`}
                >
                  <SmartImage
                    src={img.image_url}
                    width={big ? 1200 : 600}
                    alt={img.alt_text ?? img.caption ?? ''}
                    className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent opacity-70 transition-opacity group-hover:opacity-100" />
                  {img.caption && <span className="absolute bottom-3 left-4 text-left text-xs font-medium text-steel-200">{img.caption}</span>}
                  <span className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-ink-950/70 opacity-0 transition-opacity group-hover:opacity-100">
                    <Expand className="size-3.5" />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {index !== null && <Lightbox images={images} index={index} onIndex={setIndex} onClose={() => setIndex(null)} />}
    </section>
  )
}

function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: ReturnType<typeof useSiteData>['data']['gallery']
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const total = images.length
  const prev = useCallback(() => onIndex((index - 1 + total) % total), [index, total, onIndex])
  const next = useCallback(() => onIndex((index + 1) % total), [index, total, onIndex])
  const [touchX, setTouchX] = useState<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [prev, next, onClose])

  const img = images[index]
  if (!img) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex animate-fade-in flex-col bg-ink-950/97"
      role="dialog"
      aria-modal="true"
      aria-label="Visualização ampliada da galeria"
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return
        const dx = e.changedTouches[0].clientX - touchX
        if (Math.abs(dx) > 50) (dx > 0 ? prev : next)()
        setTouchX(null)
      }}
    >
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <span className="font-wide text-xs font-semibold tracking-[0.2em] text-steel-300">
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
        <button type="button" onClick={onClose} className="flex size-10 items-center justify-center rounded-full border border-ink-600 hover:bg-white/5" aria-label="Fechar" autoFocus>
          <X className="size-5" />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-2 sm:px-20" onClick={onClose}>
        <SmartImage
          key={img.id}
          src={img.image_url}
          width={2000}
          alt={img.alt_text ?? img.caption ?? ''}
          className="max-h-[78vh] w-auto max-w-full animate-scale-in rounded-xl object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        {total > 1 && (
          <>
            <button type="button" onClick={(e) => (e.stopPropagation(), prev())} className="absolute left-3 flex size-12 items-center justify-center rounded-full border border-ink-600 bg-ink-900/80 hover:bg-ink-800 sm:left-6" aria-label="Imagem anterior">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={(e) => (e.stopPropagation(), next())} className="absolute right-3 flex size-12 items-center justify-center rounded-full border border-ink-600 bg-ink-900/80 hover:bg-ink-800 sm:right-6" aria-label="Próxima imagem">
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>
      <p className="min-h-16 px-6 py-5 text-center text-sm text-steel-300">{img.caption ?? ''}</p>
    </div>,
    document.body,
  )
}
