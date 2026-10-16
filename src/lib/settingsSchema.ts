import { z } from 'zod'

// -----------------------------------------------------------------------------
// Validação (zod) da estrutura das configurações e do conteúdo editável do site.
// Os valores padrão de cada oficina ficam em src/config/brand.ts; o que for
// salvo pelo painel (tabela site_settings) sobrescreve esses padrões.
// -----------------------------------------------------------------------------

const text = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`)
const optionalUrl = z
  .string()
  .trim()
  .max(600)
  .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v) || v.startsWith('/'), {
    message: 'Informe um endereço começando com https://',
  })
const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor no formato #RRGGBB.')
const digitsPhone = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{12,13}$/.test(v.replace(/\D/g, '')), {
    message: 'Informe com DDI e DDD, por exemplo 55 11 91234-5678.',
  })

export const settingsSchema = z.object({
  business: z.object({
    name: text(80).min(2, 'Informe o nome da oficina.'),
    tagline: text(120),
    description: text(400),
    logoUrl: optionalUrl,
    legalName: text(160),
    document: text(40),
    isDemo: z.boolean(),
  }),
  contact: z.object({
    phone: text(30),
    whatsapp: digitsPhone,
    email: z
      .string()
      .trim()
      .max(160)
      .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'E-mail inválido.'),
    address: text(200),
    city: text(80),
    state: text(40),
    zip: text(12),
    mapsUrl: optionalUrl,
    preferredChannel: z.enum(['whatsapp', 'telefone', 'email']),
  }),
  hours: z
    .array(z.object({ days: text(40).min(1, 'Informe os dias.'), hours: text(60).min(1, 'Informe o horário.') }))
    .max(10),
  social: z.object({
    instagram: optionalUrl,
    facebook: optionalUrl,
    youtube: optionalUrl,
    tiktok: optionalUrl,
    googleBusiness: optionalUrl,
  }),
  links: z.array(z.object({ label: text(40).min(1, 'Informe o nome do link.'), url: optionalUrl })).max(8),
  hero: z.object({
    eyebrow: text(80),
    title: text(120).min(3, 'Informe o título.'),
    subtitle: text(300),
    primaryCta: text(40).min(2),
    secondaryCta: text(40).min(2),
    imageUrl: optionalUrl,
  }),
  differentials: z.object({
    eyebrow: text(60),
    title: text(120),
    items: z
      .array(z.object({ icon: text(40), title: text(60).min(2, 'Informe o título.'), text: text(220) }))
      .max(8),
  }),
  servicesSection: z.object({ eyebrow: text(60), title: text(120), subtitle: text(300) }),
  about: z.object({
    eyebrow: text(60),
    title: text(120),
    text: text(1200),
    history: text(1500),
    imageUrl: optionalUrl,
    secondaryImageUrl: optionalUrl,
    specialties: z.array(text(60).min(1)).max(12),
  }),
  gallerySection: z.object({ eyebrow: text(60), title: text(120), subtitle: text(300) }),
  reviewsSection: z.object({ eyebrow: text(60), title: text(120), subtitle: text(300), emptyText: text(300) }),
  faqSection: z.object({ eyebrow: text(60), title: text(120) }),
  contactSection: z.object({ eyebrow: text(60), title: text(120), subtitle: text(300) }),
  finalCta: z.object({
    title: text(120),
    text: text(300),
    primaryCta: text(40).min(2),
    whatsappCta: text(40).min(2),
  }),
  whatsapp: z.object({
    greeting: text(300),
    floatingButton: z.boolean(),
  }),
  theme: z.object({ accent: hexColor }),
  seo: z.object({
    title: text(70),
    description: text(170),
    siteUrl: optionalUrl,
    ogImage: optionalUrl,
    structuredData: z.boolean(),
  }),
  display: z.object({
    showPrices: z.boolean(),
    showGallery: z.boolean(),
    showReviews: z.boolean(),
    showFaq: z.boolean(),
    showMap: z.boolean(),
    allowPhotos: z.boolean(),
  }),
})

export type SiteSettings = z.infer<typeof settingsSchema>
