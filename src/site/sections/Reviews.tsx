import { MessageSquareQuote, Star } from 'lucide-react'
import { useSiteData } from '../../context/SiteDataContext'
import { formatLongDate } from '../../lib/format'

export function Stars({ value, className = 'size-4' }: { value: number; className?: string }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`${value} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${className} ${n <= value ? 'fill-accent text-accent' : 'text-ink-500'}`} strokeWidth={1.5} />
      ))}
    </span>
  )
}

export function Reviews() {
  const { data } = useSiteData()
  const { reviewsSection, display } = data.settings
  if (!display.showReviews) return null
  const reviews = data.reviews
  const real = reviews.filter((r) => !r.is_demo)
  const avg = real.length ? real.reduce((a, r) => a + r.rating, 0) / real.length : 0

  return (
    <section id="avaliacoes" className="border-t border-ink-800 bg-ink-950 py-24 sm:py-32">
      <div className="container-x">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="reveal lg:col-span-7">
            <p className="eyebrow">{reviewsSection.eyebrow}</p>
            <h2 className="section-title mt-5">{reviewsSection.title}</h2>
          </div>
          <div className="reveal lg:col-span-5">
            {real.length > 0 ? (
              <div className="flex items-center gap-4">
                <span className="font-wide text-5xl font-bold">{avg.toFixed(1).replace('.', ',')}</span>
                <div>
                  <Stars value={Math.round(avg)} />
                  <p className="mt-1 text-sm text-steel-400">
                    Média de {real.length} avaliaç{real.length > 1 ? 'ões' : 'ão'} publicada{real.length > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-base leading-relaxed text-steel-300">{reviewsSection.subtitle}</p>
            )}
          </div>
        </div>

        {reviews.length === 0 ? (
          <div className="reveal mt-14 flex flex-col items-center rounded-3xl border border-dashed border-ink-600 px-6 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl border border-ink-600 text-steel-300">
              <MessageSquareQuote className="size-6" strokeWidth={1.5} />
            </span>
            <p className="mt-5 max-w-md text-steel-300">{reviewsSection.emptyText}</p>
          </div>
        ) : (
          <ul className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r, i) => (
              <li
                key={r.id}
                className="reveal flex flex-col rounded-3xl border border-ink-700 bg-ink-900 p-7"
                style={{ ['--reveal-delay' as string]: `${(i % 3) * 70}ms` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <Stars value={r.rating} />
                  {r.is_demo && (
                    <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-[0.65rem] font-semibold tracking-wide text-warning uppercase">
                      Exemplo demonstrativo
                    </span>
                  )}
                </div>
                <blockquote className="mt-5 flex-1 text-[0.95rem] leading-relaxed text-steel-200">“{r.comment}”</blockquote>
                <footer className="mt-6 flex items-center gap-3 border-t border-ink-700 pt-5">
                  <span className="font-wide flex size-10 items-center justify-center rounded-full bg-ink-700 text-sm font-semibold">
                    {r.author_name.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{r.author_name}</p>
                    <p className="text-xs text-steel-400">
                      {[r.review_date && formatLongDate(r.review_date), r.source].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </footer>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
