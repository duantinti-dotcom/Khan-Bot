import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../../components/brand/Logo'
import { SmartImage } from '../../components/ui/SmartImage'
import { useSiteData } from '../../context/SiteDataContext'

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { data } = useSiteData()
  return (
    <div className="grid min-h-dvh bg-ink-950 lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden lg:block">
        <SmartImage src={data.settings.hero.imageUrl} width={1400} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-ink-950/30" />
        <div className="absolute inset-x-0 bottom-0 p-12">
          <p className="eyebrow">Painel administrativo</p>
          <p className="font-wide mt-5 max-w-md text-4xl leading-[1] font-extrabold uppercase">Gestão com a mesma precisão do atendimento.</p>
        </div>
      </div>
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Link to="/" className="self-start" aria-label="Voltar ao site">
          <Logo name={data.settings.business.name} logoUrl={data.settings.business.logoUrl} />
        </Link>
        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-sm py-12 animate-fade-up">
            <h1 className="font-wide text-2xl font-bold tracking-tight uppercase">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-steel-400">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
        <p className="text-center text-xs text-steel-400">Área restrita · {data.settings.business.name}</p>
      </div>
    </div>
  )
}
