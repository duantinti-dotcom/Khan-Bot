import { useSiteData } from '../../context/SiteDataContext'
import { usePublicSeo } from '../../lib/seo'
import { useReveal } from '../../lib/useReveal'
import { Hero, ServiceMarquee } from '../sections/Hero'
import { Differentials } from '../sections/Differentials'
import { Services } from '../sections/Services'
import { About } from '../sections/About'
import { Gallery } from '../sections/Gallery'
import { Reviews } from '../sections/Reviews'
import { Faq } from '../sections/Faq'
import { Contact, FinalCta } from '../sections/Contact'

export default function HomePage() {
  const { data } = useSiteData()
  usePublicSeo(data.settings)
  useReveal([data])
  return (
    <>
      <Hero />
      <ServiceMarquee />
      <Differentials />
      <Services />
      <About />
      <Gallery />
      <Reviews />
      <Faq />
      <Contact />
      <FinalCta />
    </>
  )
}
