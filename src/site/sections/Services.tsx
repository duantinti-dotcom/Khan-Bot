import { useMemo, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { ServiceIcon } from '../../components/ui/ServiceIcon'
import { SmartImage } from '../../components/ui/SmartImage'
import { useSiteData } from '../../context/SiteDataContext'
import { formatCurrency } from '../../lib/format'
import { useQuote } from '../quote/QuoteContext'

export function Services() {
  const { data } = useSiteData()
  const { openQuote } = useQuote()
  const { servicesSection, display } = data.settings
  const [category, setCategory] = useState('Todos')

  const categories = useMemo(() => ['Todos', ...Array.from(new Set(data.services.map((s) => s.category)))], [data.services])
  const list = category === 'Todos' ? data.services : data.services.filter((s) => s.category === category)

  return (
    <section id="servicos" className="relative border-t border-ink-800 bg-ink-900 py-24 sm:py-32">
      <div className="container-x">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="reveal lg:col-span-7">
            <p className="eyebrow">{servicesSection.eyebrow}</p>
            <h2 className="section-title mt-5">{servicesSection.title}</h2>
          </div>
          <p className="reveal text-base leading-relaxed text-steel-300 lg:col-span-5">{servicesSection.subtitle}</p>
        </div>

        {categories.length > 2 && (
          <div className="scrollbar-thin -mx-4 mt-12 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Filtrar serviços por categoria">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={category === c}
                onClick={() => setCategory(c)}
                className={`h-9 shrink-0 rounded-full border px-4 text-[0.8rem] font-medium transition-colors ${
                  category === c ? 'border-snow bg-snow text-ink-950' : 'border-ink-600 text-steel-300 hover:border-steel-400 hover:text-snow'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {list.length === 0 ? (
          <p className="mt-12 rounded-2xl border border-dashed border-ink-600 p-10 text-center text-steel-400">
            Nenhum serviço disponível no momento. Fale com a nossa equipe pelo contato abaixo.
          </p>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((s, i) => (
              <li
                key={s.id}
                className="reveal group relative flex flex-col overflow-hidden rounded-3xl border border-ink-700 bg-ink-950 transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-ink-500"
                style={{ ['--reveal-delay' as string]: `${(i % 3) * 70}ms` }}
              >
                {s.image_url && (
                  <div className="aspect-[16/9] overflow-hidden">
                    <SmartImage src={s.image_url} width={800} alt="" className="size-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-7">
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/25 ring-inset">
                      <ServiceIcon name={s.icon} className="size-5.5" />
                    </span>
                    <span className="text-[0.68rem] font-semibold tracking-[0.2em] text-steel-400 uppercase">{s.category}</span>
                  </div>
                  <h3 className="mt-7 text-xl font-semibold tracking-tight text-snow">{s.name}</h3>
                  <p className="mt-2.5 flex-1 text-sm leading-relaxed text-steel-300">{s.description}</p>
                  {display.showPrices && s.price_cents != null && (
                    <p className="mt-5 text-sm text-steel-300">
                      {s.price_note && <span className="mr-1 text-steel-400">{s.price_note}</span>}
                      <span className="font-wide text-lg font-semibold text-snow">{formatCurrency(s.price_cents)}</span>
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => openQuote(s.id)}
                    className="mt-7 inline-flex items-center justify-between gap-2 border-t border-ink-700 pt-5 text-sm font-semibold text-snow transition-colors hover:text-accent"
                    aria-label={`Solicitar orçamento de ${s.name}`}
                  >
                    Solicitar orçamento
                    <span className="flex size-9 items-center justify-center rounded-full border border-ink-600 transition-all duration-300 group-hover:border-accent group-hover:bg-accent group-hover:text-white">
                      <ArrowUpRight className="size-4" />
                    </span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
