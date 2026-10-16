import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'
import { QuoteProvider } from './quote/QuoteContext'
import { WhatsappIcon } from '../components/brand/SocialIcons'
import { useSiteData } from '../context/SiteDataContext'
import { whatsappLink } from '../lib/whatsapp'

export function PublicLayout() {
  const { data } = useSiteData()
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) {
        requestAnimationFrame(() => el.scrollIntoView())
        return
      }
    }
    window.scrollTo(0, 0)
  }, [pathname, hash])

  const { whatsapp, contact } = data.settings
  return (
    <QuoteProvider>
      <Header />
      <main id="conteudo">
        <Outlet />
      </main>
      <Footer />
      {whatsapp.floatingButton && (
        <a
          href={whatsappLink(contact.whatsapp, whatsapp.greeting)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Conversar pelo WhatsApp"
          className="fixed right-4 bottom-4 z-40 flex size-14 items-center justify-center rounded-full bg-[#1fa855] text-white shadow-lg shadow-black/40 transition-transform hover:scale-105 sm:right-6 sm:bottom-6"
        >
          <WhatsappIcon className="size-7" />
        </a>
      )}
    </QuoteProvider>
  )
}
