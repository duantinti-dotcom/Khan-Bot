import { useEffect } from 'react'
import type { SiteSettings } from './settings'
import { env } from './env'

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = value
}

function setCanonical(url: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!url) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.href = url
}

/** Metadados da página pública a partir das configurações de SEO. */
export function usePublicSeo(settings: SiteSettings, opts: { title?: string; path?: string } = {}) {
  useEffect(() => {
    const { seo, business, hero } = settings
    const title = opts.title ? `${opts.title} — ${business.name}` : seo.title || business.name
    const description = seo.description || hero.subtitle
    const base = (seo.siteUrl || env.siteUrl || '').replace(/\/$/, '')
    const url = base ? `${base}${opts.path ?? '/'}` : ''
    const image = seo.ogImage ? (seo.ogImage.startsWith('/') && base ? `${base}${seo.ogImage}` : seo.ogImage) : ''

    document.title = title
    setMeta('name', 'description', description)
    setMeta('name', 'robots', 'index, follow')
    setMeta('property', 'og:title', title)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:site_name', business.name)
    if (image) setMeta('property', 'og:image', image)
    if (url) setMeta('property', 'og:url', url)
    setCanonical(url)

    // Dados estruturados apenas quando a oficina habilitar e houver dados reais.
    const existing = document.getElementById('ld-business')
    existing?.remove()
    if (seo.structuredData && !business.isDemo) {
      const { contact, social } = settings
      const ld: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'AutoRepair',
        name: business.name,
        description: business.description || undefined,
        url: url || undefined,
        telephone: contact.phone || undefined,
        email: contact.email || undefined,
        image: image || undefined,
        sameAs: Object.values(social).filter(Boolean),
      }
      if (contact.address) {
        ld.address = {
          '@type': 'PostalAddress',
          streetAddress: contact.address,
          addressLocality: contact.city || undefined,
          addressRegion: contact.state || undefined,
          postalCode: contact.zip || undefined,
          addressCountry: 'BR',
        }
      }
      const script = document.createElement('script')
      script.type = 'application/ld+json'
      script.id = 'ld-business'
      script.textContent = JSON.stringify(ld)
      document.head.appendChild(script)
    }
  }, [settings, opts.title, opts.path])
}

/** O painel não deve ser indexado. */
export function useNoIndex(title: string) {
  useEffect(() => {
    document.title = `${title} · Painel`
    setMeta('name', 'robots', 'noindex, nofollow')
    document.getElementById('ld-business')?.remove()
  }, [title])
}
