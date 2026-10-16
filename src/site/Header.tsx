import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { Logo } from '../components/brand/Logo'
import { Button } from '../components/ui/Button'
import { useSiteData } from '../context/SiteDataContext'
import { useQuote } from './quote/QuoteContext'

export const NAV = [
  { id: 'inicio', label: 'Início' },
  { id: 'servicos', label: 'Serviços' },
  { id: 'oficina', label: 'A oficina' },
  { id: 'diferenciais', label: 'Diferenciais' },
  { id: 'avaliacoes', label: 'Avaliações' },
  { id: 'contato', label: 'Contato' },
]

export function Header() {
  const { data } = useSiteData()
  const { openQuote } = useQuote()
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('inicio')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!isHome) return
    const sections = NAV.map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActive(visible.target.id)
      },
      { rootMargin: '-35% 0px -55% 0px', threshold: [0, 0.25, 0.5] },
    )
    sections.forEach((s) => io.observe(s))
    return () => io.disconnect()
  }, [isHome, data.source])

  useEffect(() => {
    if (!open) return
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const href = (id: string) => (isHome ? `#${id}` : `/#${id}`)
  const solid = scrolled || !isHome || open

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        solid ? 'border-b border-white/[0.06] bg-ink-950/90 backdrop-blur-md' : 'border-b border-transparent bg-transparent'
      }`}
    >
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-sm">
        Pular para o conteúdo
      </a>
      <div className="container-x flex h-[72px] items-center justify-between gap-6">
        <Link to="/" aria-label={`${data.settings.business.name} — página inicial`} className="shrink-0" onClick={() => setOpen(false)}>
          <Logo name={data.settings.business.name} logoUrl={data.settings.business.logoUrl} />
        </Link>

        <nav aria-label="Principal" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((n) => (
              <li key={n.id}>
                <a
                  href={href(n.id)}
                  aria-current={isHome && active === n.id ? 'true' : undefined}
                  className="relative rounded-full px-3.5 py-2 text-[0.84rem] font-medium text-steel-300 transition-colors hover:text-snow aria-[current]:text-snow"
                >
                  {n.label}
                  <span
                    className={`absolute inset-x-3.5 -bottom-0.5 h-px origin-left bg-accent transition-transform duration-300 ${
                      isHome && active === n.id ? 'scale-x-100' : 'scale-x-0'
                    }`}
                  />
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Button size="sm" className="max-sm:hidden" onClick={() => openQuote()} iconRight={<ArrowUpRight className="size-4 transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />}>
            Solicitar orçamento
          </Button>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full border border-ink-600 text-snow lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Portal: o backdrop-filter do header criaria um bloco de contenção para elementos fixed. */}
      {open &&
        createPortal(
        <div id="mobile-menu" className="fixed inset-x-0 top-[72px] bottom-0 z-40 animate-fade-in overflow-y-auto bg-ink-950 lg:hidden">
          <nav aria-label="Menu móvel" className="container-x flex min-h-full flex-col py-6">
            <ul className="flex flex-col">
              {NAV.map((n, i) => (
                <li key={n.id} className="animate-fade-up border-b border-ink-800" style={{ animationDelay: `${i * 40}ms` }}>
                  <a href={href(n.id)} onClick={() => setOpen(false)} className="font-wide flex items-center justify-between py-4 text-xl font-semibold tracking-tight uppercase">
                    {n.label}
                    <ArrowUpRight className="size-5 text-steel-400" />
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-auto grid gap-3 pt-8 pb-[env(safe-area-inset-bottom)]">
              <Button
                size="lg"
                onClick={() => {
                  setOpen(false)
                  openQuote()
                }}
              >
                Solicitar orçamento
              </Button>
            </div>
          </nav>
        </div>,
          document.body,
        )}
    </header>
  )
}
