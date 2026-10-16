import { Link, useLocation } from 'react-router-dom'
import { Logo } from '../components/brand/Logo'
import { FacebookIcon, InstagramIcon, TiktokIcon, YoutubeIcon } from '../components/brand/SocialIcons'
import { useSiteData } from '../context/SiteDataContext'
import { NAV } from './Header'
import { fullAddress } from './sections/Contact'

const YEAR = new Date().getFullYear()

export function Footer() {
  const { data } = useSiteData()
  const { business, contact, hours, social, links } = data.settings
  const { pathname } = useLocation()
  const href = (id: string) => (pathname === '/' ? `#${id}` : `/#${id}`)
  const socials = [
    { url: social.instagram, label: 'Instagram', Icon: InstagramIcon },
    { url: social.facebook, label: 'Facebook', Icon: FacebookIcon },
    { url: social.youtube, label: 'YouTube', Icon: YoutubeIcon },
    { url: social.tiktok, label: 'TikTok', Icon: TiktokIcon },
  ].filter((s) => s.url)

  return (
    <footer className="border-t border-ink-800 bg-ink-950 pt-20 pb-10">
      <div className="container-x">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo name={business.name} logoUrl={business.logoUrl} />
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-steel-400">{business.description}</p>
            {socials.length > 0 && (
              <ul className="mt-6 flex gap-2">
                {socials.map(({ url, label, Icon }) => (
                  <li key={label}>
                    <a href={url} target="_blank" rel="noopener noreferrer" aria-label={label} className="flex size-10 items-center justify-center rounded-full border border-ink-600 text-steel-300 transition-colors hover:border-accent hover:text-snow">
                      <Icon className="size-4.5" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <FooterCol title="Navegação" className="lg:col-span-2">
            {NAV.map((n) => (
              <li key={n.id}>
                <a href={href(n.id)} className="hover:text-snow">
                  {n.label}
                </a>
              </li>
            ))}
          </FooterCol>

          <FooterCol title="Contato" className="lg:col-span-3">
            {contact.phone && <li>{contact.phone}</li>}
            {contact.email && (
              <li>
                <a href={`mailto:${contact.email}`} className="break-all hover:text-snow">
                  {contact.email}
                </a>
              </li>
            )}
            {contact.address && <li>{fullAddress(contact)}</li>}
            {links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="hover:text-snow">
                  {l.label}
                </a>
              </li>
            ))}
          </FooterCol>

          <FooterCol title="Horários" className="lg:col-span-3">
            {hours.map((h, i) => (
              <li key={i} className="flex justify-between gap-4">
                <span>{h.days}</span>
                <span className="text-steel-300">{h.hours}</span>
              </li>
            ))}
          </FooterCol>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-ink-800 pt-8 text-xs text-steel-400 md:flex-row md:items-center md:justify-between">
          <p>
            © {YEAR} {business.legalName || business.name}
            {business.document && ` · ${business.document}`}. Todos os direitos reservados.
          </p>
          <nav aria-label="Links legais" className="flex flex-wrap gap-x-6 gap-y-2">
            <Link to="/privacidade" className="hover:text-snow">
              Política de privacidade
            </Link>
            <Link to="/termos" className="hover:text-snow">
              Termos de uso
            </Link>
          </nav>
          <p>
            {business.isDemo ? 'Projeto demonstrativo · ' : ''}Desenvolvido por <span className="font-semibold text-steel-300">Lume Studio®</span>
          </p>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h2 className="text-[0.7rem] font-semibold tracking-[0.24em] text-snow uppercase">{title}</h2>
      <ul className="mt-5 grid gap-3 text-sm text-steel-400">{children}</ul>
    </div>
  )
}
