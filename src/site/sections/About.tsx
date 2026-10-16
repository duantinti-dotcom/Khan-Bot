import { Check } from 'lucide-react'
import { SmartImage } from '../../components/ui/SmartImage'
import { useSiteData } from '../../context/SiteDataContext'

export function About() {
  const { data } = useSiteData()
  const { about } = data.settings
  return (
    <section id="oficina" className="relative overflow-hidden border-t border-ink-800 bg-ink-950 py-24 sm:py-32">
      <div className="container-x grid gap-14 lg:grid-cols-2 lg:gap-20">
        <div className="reveal relative order-2 lg:order-1">
          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl border border-ink-700 sm:aspect-[5/5] lg:aspect-[4/5]">
            <SmartImage src={about.imageUrl} width={1000} widths={[600, 1000, 1400]} sizes="(min-width: 1024px) 50vw, 100vw" alt="Ambiente da oficina" className="size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/70 via-transparent to-transparent" />
          </div>
          {about.secondaryImageUrl && (
            <div className="absolute -right-3 -bottom-8 hidden aspect-square w-[42%] overflow-hidden rounded-2xl border-4 border-ink-950 sm:block lg:-right-10">
              <SmartImage src={about.secondaryImageUrl} width={600} alt="Detalhe de serviço na oficina" className="size-full object-cover" />
            </div>
          )}
          <span className="absolute top-6 -left-3 h-24 w-1 bg-accent" aria-hidden="true" />
        </div>

        <div className="order-1 flex flex-col justify-center lg:order-2">
          <p className="eyebrow reveal">{about.eyebrow}</p>
          <h2 className="section-title reveal mt-5">{about.title}</h2>
          <p className="reveal mt-7 text-lg leading-relaxed text-steel-200">{about.text}</p>
          {about.history && <p className="reveal mt-5 text-[0.95rem] leading-relaxed text-steel-400">{about.history}</p>}

          {about.specialties.length > 0 && (
            <div className="reveal mt-10">
              <h3 className="text-[0.7rem] font-semibold tracking-[0.24em] text-steel-400 uppercase">Especialidades</h3>
              <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {about.specialties.map((s) => (
                  <li key={s} className="flex items-center gap-3 border-b border-ink-800 pb-3 text-sm text-steel-200">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
