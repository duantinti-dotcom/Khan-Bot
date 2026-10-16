interface LogoProps {
  name?: string
  logoUrl?: string
  className?: string
  compact?: boolean
}

/** Marca VÉRTICE: um vértice (V) com aresta em vermelho automotivo. */
export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M8 14h12.5L32 40.5 43.5 14H56L38.4 52H25.6z" fill="currentColor" />
      <path d="M43.5 14H56L38.4 52h-6.2z" fill="var(--color-accent)" />
    </svg>
  )
}

export function Logo({ name = 'VÉRTICE AUTOMOTIVE', logoUrl, className = '', compact }: LogoProps) {
  if (logoUrl) return <img src={logoUrl} alt={name} className={`h-9 w-auto object-contain ${className}`} />
  const [first, ...rest] = name.split(' ')
  const second = rest.join(' ')
  return (
    <span className={`inline-flex items-center gap-2.5 text-snow ${className}`} aria-label={name}>
      <LogoMark className="size-8 shrink-0" />
      {!compact && (
        <span className="flex flex-col leading-none" aria-hidden="true">
          <span className="font-wide text-[1.05rem] font-extrabold tracking-[0.06em]">{first}</span>
          {second && <span className="mt-1 text-[0.56rem] font-semibold tracking-[0.42em] text-steel-300">{second}</span>}
        </span>
      )}
    </span>
  )
}
