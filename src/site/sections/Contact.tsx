import type { ReactNode } from 'react'
import { ArrowRight, Clock, Mail, MapPin, MessageCircle, Navigation, Phone } from 'lucide-react'
import { Button, LinkButton } from '../../components/ui/Button'
import { useQuote } from '../quote/QuoteContext'
import { useSiteData } from '../../context/SiteDataContext'
import { InstagramIcon } from '../../components/brand/SocialIcons'
import { whatsappLink } from '../../lib/whatsapp'
import { formatPhone, onlyDigits } from '../../lib/phone'

export function fullAddress(c: { address: string; city: string; state: string; zip: string }) {
  return [c.address, [c.city, c.state].filter(Boolean).join(' – '), c.zip].filter(Boolean).join(', ')
}

function handleFromUrl(url: string) {
  const m = url.match(/instagram\.com\/([^/?#]+)/i)
  return m ? `@${m[1]}` : url.replace(/^https?:\/\//, '')
}

export function Contact() {
  const { data } = useSiteData()
  const { contact, hours, social, contactSection, business, display, whatsapp } = data.settings
  const address = fullAddress(contact)
  const demo = business.isDemo
  // Mapa e rotas só com endereço real configurado (nunca apontar para um local inventado).
  const hasRealAddress = Boolean(contact.address.trim()) && !demo
  const mapQuery = encodeURIComponent(address)
  const routeUrl = contact.mapsUrl || `https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`

  return (
    <section id="contato" className="border-t border-ink-800 bg-ink-950 py-24 sm:py-32">
      <div className="container-x">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="reveal lg:col-span-7">
            <p className="eyebrow">{contactSection.eyebrow}</p>
            <h2 className="section-title mt-5">{contactSection.title}</h2>
          </div>
          <p className="reveal text-base leading-relaxed text-steel-300 lg:col-span-5">{contactSection.subtitle}</p>
        </div>

        {demo && (
          <p className="reveal mt-10 inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/[0.07] px-4 py-2 text-xs font-medium text-warning">
            Dados de contato demonstrativos — a oficina configura os dados reais no painel.
          </p>
        )}

        <div className="mt-10 grid gap-4 lg:grid-cols-12">
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
            {address && (
              <ContactCard icon={<MapPin className="size-5" />} label="Endereço">
                <p>{address}</p>
                {hasRealAddress && (
                  <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
                    <Navigation className="size-4" /> Abrir rotas
                  </a>
                )}
              </ContactCard>
            )}
            {contact.phone && (
              <ContactCard icon={<Phone className="size-5" />} label="Telefone">
                <a href={`tel:+${onlyDigits(contact.phone).length <= 11 ? '55' : ''}${onlyDigits(contact.phone)}`} className="hover:text-accent">
                  {contact.phone}
                </a>
              </ContactCard>
            )}
            <ContactCard icon={<MessageCircle className="size-5" />} label="WhatsApp">
              {contact.whatsapp ? (
                <a href={whatsappLink(contact.whatsapp, whatsapp.greeting)} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                  {formatPhone(contact.whatsapp)}
                </a>
              ) : (
                <span className="text-steel-400">Número a configurar</span>
              )}
            </ContactCard>
            {contact.email && (
              <ContactCard icon={<Mail className="size-5" />} label="E-mail">
                <a href={`mailto:${contact.email}`} className="break-all hover:text-accent">
                  {contact.email}
                </a>
              </ContactCard>
            )}
            {social.instagram && (
              <ContactCard icon={<InstagramIcon />} label="Instagram">
                <a href={social.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                  {handleFromUrl(social.instagram)}
                </a>
              </ContactCard>
            )}
          </div>

          <div className="grid gap-4 lg:col-span-7">
            {hours.length > 0 && (
              <div className="reveal rounded-3xl border border-ink-700 bg-ink-900 p-7">
                <div className="flex items-center gap-3 text-steel-300">
                  <Clock className="size-5" />
                  <h3 className="text-[0.7rem] font-semibold tracking-[0.24em] uppercase">Horário de funcionamento</h3>
                </div>
                <dl className="mt-5 divide-y divide-ink-700">
                  {hours.map((h, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 py-3 text-sm">
                      <dt className="text-steel-300">{h.days}</dt>
                      <dd className="font-semibold text-snow">{h.hours}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {display.showMap &&
              (hasRealAddress ? (
                <div className="reveal overflow-hidden rounded-3xl border border-ink-700">
                  <iframe
                    title={`Mapa — ${business.name}`}
                    src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                    className="h-80 w-full grayscale-[0.85] invert-[0.92] hue-rotate-180"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              ) : (
                <div className="reveal grid-bg relative flex h-64 items-center justify-center overflow-hidden rounded-3xl border border-ink-700 bg-ink-900 text-center">
                  <div className="px-6">
                    <MapPin className="mx-auto size-7 text-accent" />
                    <p className="mt-3 text-sm text-steel-300">O mapa e o botão de rotas aparecem quando o endereço real for configurado.</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ContactCard({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="reveal flex gap-4 rounded-3xl border border-ink-700 bg-ink-900 p-6">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-ink-600 text-snow">{icon}</span>
      <div className="min-w-0 text-[0.95rem] text-snow">
        <p className="mb-1 text-[0.68rem] font-semibold tracking-[0.22em] text-steel-400 uppercase">{label}</p>
        {children}
      </div>
    </div>
  )
}

export function FinalCta() {
  const { data } = useSiteData()
  const { finalCta, whatsapp, contact } = data.settings
  return (
    <section className="relative isolate overflow-hidden border-t border-ink-800 bg-ink-900 py-24 sm:py-32">
      <div className="grid-bg absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="absolute top-0 left-1/2 -z-10 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-accent to-transparent" />
      <div className="container-x text-center">
        <h2 className="font-wide reveal mx-auto max-w-4xl text-4xl leading-[0.98] font-extrabold tracking-tight text-balance uppercase sm:text-6xl">
          {finalCta.title}
        </h2>
        <p className="reveal mx-auto mt-6 max-w-xl text-lg leading-relaxed text-steel-300">{finalCta.text}</p>
        <div className="reveal mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <FinalQuoteButton label={finalCta.primaryCta} />
          <LinkButton
            size="lg"
            variant="outline"
            href={whatsappLink(contact.whatsapp, whatsapp.greeting)}
            target="_blank"
            rel="noopener noreferrer"
            icon={<MessageCircle className="size-4" />}
          >
            {finalCta.whatsappCta}
          </LinkButton>
        </div>
      </div>
    </section>
  )
}

function FinalQuoteButton({ label }: { label: string }) {
  const { openQuote } = useQuote()
  return (
    <Button size="lg" onClick={() => openQuote()} iconRight={<ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" />}>
      {label}
    </Button>
  )
}
