import { ServiceIcon } from '../../components/ui/ServiceIcon'
import { useSiteData } from '../../context/SiteDataContext'

export function Differentials() {
  const { data } = useSiteData()
  const { differentials } = data.settings
  if (!differentials.items.length) return null
  return (
    <section id="diferenciais" className="relative bg-ink-950 py-24 sm:py-32">
      <div className="container-x">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="reveal lg:col-span-7">
            <p className="eyebrow">{differentials.eyebrow}</p>
            <h2 className="section-title mt-5">{differentials.title}</h2>
          </div>
        </div>

        <ul className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-ink-700 bg-ink-700 sm:grid-cols-2 lg:grid-cols-4">
          {differentials.items.map((item, i) => (
            <li
              key={`${item.title}-${i}`}
              className="reveal group relative flex flex-col bg-ink-900 p-7 transition-colors duration-300 hover:bg-ink-850 sm:p-8"
              style={{ ['--reveal-delay' as string]: `${i * 80}ms` }}
            >
              <div className="flex items-center justify-between">
                <span className="flex size-12 items-center justify-center rounded-2xl border border-ink-600 bg-ink-850 text-snow transition-colors duration-300 group-hover:border-accent/60 group-hover:text-accent">
                  <ServiceIcon name={item.icon} className="size-5" />
                </span>
                <span className="font-wide text-xs font-semibold tracking-[0.2em] text-steel-400">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="mt-8 text-lg font-semibold tracking-tight text-snow">{item.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-steel-300">{item.text}</p>
              <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-accent transition-transform duration-500 group-hover:scale-x-100" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
