import { ArrowDown, ArrowRight } from 'lucide-react'
import { Button, LinkButton } from '../../components/ui/Button'
import { SmartImage } from '../../components/ui/SmartImage'
import { useSiteData } from '../../context/SiteDataContext'
import { useQuote } from '../quote/QuoteContext'

/** Destaca o ponto final do título com a cor da marca. */
function AccentTitle({ text }: { text: string }) {
  const t = text.trim()
  if (/[.!]$/.test(t))
    return (
      <>
        {t.slice(0, -1)}
        <span className="text-accent">{t.slice(-1)}</span>
      </>
    )
  return <>{t}</>
}

export function Hero() {
  const { data } = useSiteData()
  const { openQuote } = useQuote()
  const { hero, business } = data.settings

  return (
    <section id="inicio" className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-ink-950 pt-[72px]">
      <div className="absolute inset-0 -z-10">
        <SmartImage
          src={hero.imageUrl}
          width={1920}
          widths={[768, 1280, 1920, 2560]}
          sizes="100vw"
          alt=""
          fetchPriority="high"
          loading="eager"
          className="size-full scale-[1.02] animate-fade-in object-cover object-[65%_center]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/80 to-ink-950/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-ink-950/50" />
        <div className="grid-bg absolute inset-0 [mask-image:linear-gradient(to_right,black,transparent_70%)] opacity-60" />
      </div>

      <div className="container-x relative pt-20 pb-16 sm:pb-24 lg:pb-28">
        <div className="max-w-5xl">
          <p className="eyebrow animate-fade-up">{hero.eyebrow || business.tagline}</p>
          <h1
            className="font-wide mt-6 animate-fade-up text-[clamp(1.85rem,8.2vw,5rem)] leading-[0.95] font-extrabold tracking-[-0.02em] text-balance break-words uppercase [animation-delay:80ms]"
          >
            <AccentTitle text={hero.title} />
          </h1>
          <p className="mt-6 max-w-2xl animate-fade-up text-base leading-relaxed text-steel-200 [animation-delay:160ms] sm:text-lg">
            {hero.subtitle}
          </p>
          <div className="mt-9 flex animate-fade-up flex-col gap-3 [animation-delay:240ms] sm:flex-row">
            <Button size="lg" onClick={() => openQuote()} iconRight={<ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" />}>
              {hero.primaryCta}
            </Button>
            <LinkButton size="lg" variant="outline" href="#servicos">
              {hero.secondaryCta}
            </LinkButton>
          </div>
        </div>

        <a
          href="#diferenciais"
          className="absolute right-4 bottom-10 hidden items-center gap-3 text-[0.7rem] font-semibold tracking-[0.28em] text-steel-400 uppercase transition-colors hover:text-snow sm:right-6 lg:right-8 lg:flex"
        >
          Role para explorar
          <span className="flex size-10 items-center justify-center rounded-full border border-ink-500">
            <ArrowDown className="size-4 animate-bounce" />
          </span>
        </a>
      </div>
    </section>
  )
}

/** Faixa contínua com os nomes dos serviços cadastrados. */
export function ServiceMarquee() {
  const { data } = useSiteData()
  const names = data.services.map((s) => s.name)
  if (names.length < 3) return null
  const row = [...names, ...names]
  return (
    <div className="relative overflow-hidden border-y border-ink-800 bg-ink-950 py-5" aria-hidden="true">
      <div className="flex w-max animate-[marquee_60s_linear_infinite] gap-10 motion-reduce:animate-none">
        {row.map((n, i) => (
          <span key={i} className="font-wide flex items-center gap-10 text-sm font-semibold tracking-[0.18em] whitespace-nowrap text-steel-400 uppercase">
            {n}
            <span className="size-1.5 rotate-45 bg-accent" />
          </span>
        ))}
      </div>
      <style>{'@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}'}</style>
    </div>
  )
}
