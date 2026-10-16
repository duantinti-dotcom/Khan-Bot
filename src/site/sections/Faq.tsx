import { useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { useSiteData } from '../../context/SiteDataContext'

export function Faq() {
  const { data } = useSiteData()
  const { faqSection, display } = data.settings
  const [open, setOpen] = useState<string | null>(data.faqs[0]?.id ?? null)
  const baseId = useId()
  if (!display.showFaq || data.faqs.length === 0) return null

  return (
    <section id="faq" className="border-t border-ink-800 bg-ink-900 py-24 sm:py-32">
      <div className="container-x grid gap-12 lg:grid-cols-12">
        <div className="reveal lg:col-span-4">
          <p className="eyebrow">{faqSection.eyebrow}</p>
          <h2 className="section-title mt-5">{faqSection.title}</h2>
        </div>
        <ul className="lg:col-span-8">
          {data.faqs.map((f) => {
            const isOpen = open === f.id
            const panelId = `${baseId}-${f.id}`
            return (
              <li key={f.id} className="reveal border-b border-ink-700 first:border-t">
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? null : f.id)}
                    className="group flex w-full items-center justify-between gap-6 py-6 text-left"
                  >
                    <span className="text-base font-semibold text-snow transition-colors group-hover:text-steel-200 sm:text-lg">{f.question}</span>
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                        isOpen ? 'rotate-45 border-accent bg-accent text-white' : 'border-ink-600 text-steel-300'
                      }`}
                    >
                      <Plus className="size-4" />
                    </span>
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                  inert={!isOpen}
                >
                  <div className="overflow-hidden">
                    <p className="pr-12 pb-6 text-[0.95rem] leading-relaxed whitespace-pre-line text-steel-300">{f.answer}</p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
