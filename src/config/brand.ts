import type { SiteSettings } from '../lib/settings'
import type { Faq, GalleryImage, Service } from '../lib/types'

// =============================================================================
// CONFIGURAÇÃO PADRÃO DA OFICINA
//
// Para adaptar o produto a outra oficina, a Lume Studio® altera este arquivo
// (valores iniciais) e, depois da publicação, o proprietário ajusta tudo pelo
// painel em /admin. O que for salvo no painel tem prioridade sobre estes dados.
//
// Dados de contato abaixo são DEMONSTRATIVOS: a VÉRTICE AUTOMOTIVE é fictícia.
// =============================================================================

const unsplash = (id: string) => `https://images.unsplash.com/${id}`

export const defaultSettings: SiteSettings = {
  business: {
    name: 'VÉRTICE AUTOMOTIVE',
    tagline: 'Mecânica automotiva com precisão e transparência',
    description:
      'Centro automotivo dedicado a manutenção preventiva, diagnóstico e reparos, com comunicação clara em cada etapa do atendimento.',
    logoUrl: '',
    legalName: '',
    document: '',
    isDemo: true,
  },
  contact: {
    phone: '(00) 0000-0000',
    whatsapp: '',
    email: 'contato@example.com',
    address: 'Endereço demonstrativo, 000',
    city: 'Sua cidade',
    state: 'UF',
    zip: '',
    mapsUrl: '',
    preferredChannel: 'whatsapp',
  },
  hours: [
    { days: 'Segunda a sexta', hours: '08h às 18h' },
    { days: 'Sábado', hours: '08h às 12h' },
    { days: 'Domingo e feriados', hours: 'Fechado' },
  ],
  social: {
    instagram: '',
    facebook: '',
    youtube: '',
    tiktok: '',
    googleBusiness: '',
  },
  links: [],
  hero: {
    eyebrow: 'Centro automotivo',
    title: 'Performance, precisão e confiança.',
    subtitle:
      'Seu veículo merece mais do que manutenção. Merece cuidado técnico, transparência e atenção a cada detalhe.',
    primaryCta: 'Solicitar orçamento',
    secondaryCta: 'Conhecer nossos serviços',
    imageUrl: unsplash('photo-1503376780353-7e6692767b70'),
  },
  differentials: {
    eyebrow: 'Diferenciais',
    title: 'Um atendimento pensado para você entender cada etapa.',
    items: [
      {
        icon: 'file-text',
        title: 'Transparência nos orçamentos',
        text: 'Você recebe a explicação do que precisa ser feito e aprova antes de qualquer execução.',
      },
      {
        icon: 'scan-line',
        title: 'Diagnóstico cuidadoso',
        text: 'Investigamos a origem do problema antes de indicar peças ou serviços.',
      },
      {
        icon: 'user-check',
        title: 'Atendimento personalizado',
        text: 'Cada veículo tem sua história. Ouvimos você e consideramos o uso do seu carro.',
      },
      {
        icon: 'message-square',
        title: 'Comunicação durante o serviço',
        text: 'Você acompanha o andamento e é avisado sobre qualquer novidade.',
      },
    ],
  },
  servicesSection: {
    eyebrow: 'Serviços',
    title: 'Tudo o que seu veículo precisa, com critério técnico.',
    subtitle: 'Escolha um serviço para solicitar seu orçamento. Se não souber exatamente o que é, descreva o sintoma.',
  },
  about: {
    eyebrow: 'A oficina',
    title: 'Mais que uma oficina. Um novo padrão de cuidado.',
    text: 'Acreditamos que cuidar de um veículo exige conhecimento, atenção e transparência. Nosso compromisso é tornar cada etapa do atendimento mais clara, desde a identificação da necessidade até a conclusão do serviço.',
    history:
      'A VÉRTICE AUTOMOTIVE nasceu da vontade de oferecer um atendimento automotivo mais claro e organizado, em que o cliente entende o que está sendo feito no próprio veículo. (Texto demonstrativo — conte a história real da oficina pelo painel.)',
    imageUrl: unsplash('photo-1486262715619-67b85e0b08d3'),
    secondaryImageUrl: unsplash('photo-1487754180451-c456f719a1fc'),
    specialties: [
      'Manutenção preventiva',
      'Diagnóstico eletrônico',
      'Freios e suspensão',
      'Motor e transmissão',
      'Injeção eletrônica',
      'Ar-condicionado',
    ],
  },
  gallerySection: {
    eyebrow: 'Galeria',
    title: 'Estrutura, detalhes e trabalho.',
    subtitle: 'Um pouco do nosso ambiente e do cuidado em cada serviço.',
  },
  reviewsSection: {
    eyebrow: 'Avaliações',
    title: 'O que nossos clientes dizem.',
    subtitle: 'Avaliações publicadas com autorização dos clientes.',
    emptyText:
      'Ainda não publicamos avaliações. Em breve você poderá conferir aqui a opinião de quem já foi atendido.',
  },
  faqSection: {
    eyebrow: 'Dúvidas',
    title: 'Perguntas frequentes',
  },
  contactSection: {
    eyebrow: 'Contato',
    title: 'Fale com a nossa equipe.',
    subtitle: 'Tire dúvidas, solicite um orçamento ou combine o melhor momento para trazer seu veículo.',
  },
  finalCta: {
    title: 'Seu próximo passo começa aqui.',
    text: 'Conte o que seu veículo precisa e fale com nossa equipe para receber orientação sobre o atendimento.',
    primaryCta: 'Solicitar orçamento',
    whatsappCta: 'Conversar pelo WhatsApp',
  },
  whatsapp: {
    greeting: 'Olá! Vim pelo site da VÉRTICE AUTOMOTIVE e gostaria de atendimento.',
    floatingButton: true,
  },
  theme: {
    accent: '#e10600',
  },
  seo: {
    title: 'VÉRTICE AUTOMOTIVE — Mecânica automotiva com precisão e transparência',
    description:
      'Revisão, diagnóstico eletrônico, freios, suspensão, motor e mais. Solicite seu orçamento com transparência e atendimento personalizado.',
    siteUrl: '',
    ogImage: '/og-image.png',
    structuredData: false,
  },
  display: {
    showPrices: true,
    showGallery: true,
    showReviews: true,
    showFaq: true,
    showMap: true,
    allowPhotos: true,
  },
}

// -----------------------------------------------------------------------------
// Conteúdo usado SOMENTE quando o Supabase não está configurado (modo
// demonstração offline). Com o banco conectado, os dados vêm do painel.
// -----------------------------------------------------------------------------

const svc = (
  id: string,
  name: string,
  description: string,
  category: string,
  icon: string,
  sort_order: number,
): Service => ({
  id,
  name,
  description,
  category,
  icon,
  price_cents: null,
  price_note: null,
  image_url: null,
  is_active: true,
  sort_order,
})

export const fallbackServices: Service[] = [
  svc('demo-1', 'Revisão preventiva', 'Inspeção completa dos itens de segurança e desgaste, seguindo o plano de manutenção indicado para o seu veículo.', 'Manutenção', 'clipboard-check', 10),
  svc('demo-2', 'Troca de óleo e filtros', 'Substituição de óleo e filtros com produtos adequados à especificação do fabricante.', 'Manutenção', 'droplet', 20),
  svc('demo-3', 'Diagnóstico eletrônico', 'Leitura de falhas com scanner automotivo e análise técnica para identificar a origem do problema.', 'Diagnóstico', 'scan-line', 30),
  svc('demo-4', 'Freios e suspensão', 'Avaliação e manutenção de pastilhas, discos, amortecedores e componentes de suspensão.', 'Segurança', 'disc', 40),
  svc('demo-5', 'Motor e transmissão', 'Diagnóstico e reparo de motor, embreagem e câmbio, com análise cuidadosa antes de qualquer intervenção.', 'Mecânica', 'cog', 50),
  svc('demo-6', 'Sistema de arrefecimento', 'Verificação de radiador, bomba d’água, mangueiras e fluido para evitar superaquecimento.', 'Mecânica', 'thermometer', 60),
  svc('demo-7', 'Injeção eletrônica', 'Limpeza, testes e regulagem do sistema de injeção para melhor funcionamento do motor.', 'Diagnóstico', 'zap', 70),
  svc('demo-8', 'Ar-condicionado automotivo', 'Higienização, verificação de gás e manutenção dos componentes do sistema de climatização.', 'Conforto', 'snowflake', 80),
  svc('demo-9', 'Alinhamento e balanceamento', 'Ajuste da geometria e balanceamento das rodas para mais estabilidade e menor desgaste dos pneus.', 'Segurança', 'circle-dot', 90),
  svc('demo-10', 'Serviços especializados', 'Precisa de algo específico? Descreva a necessidade e nossa equipe avalia o melhor caminho.', 'Especializado', 'wrench', 100),
]

export const fallbackFaqs: Faq[] = [
  ['Como solicitar um orçamento?', 'Clique em "Solicitar orçamento", preencha os dados do veículo e descreva o que está acontecendo. Depois de conferir o resumo, você envia a solicitação e nossa equipe entra em contato para dar continuidade.'],
  ['Preciso entrar em contato antes de levar o veículo?', 'Recomendamos que sim. Assim conseguimos entender a necessidade, orientar sobre o atendimento e combinar o melhor horário com você.'],
  ['Como funciona o diagnóstico?', 'Avaliamos o veículo e, quando necessário, utilizamos equipamentos de diagnóstico eletrônico. Em seguida explicamos o que foi identificado e quais são as alternativas.'],
  ['O orçamento é confirmado antes da execução?', 'Sim. Nenhum serviço é executado sem que você conheça e aprove o orçamento.'],
  ['Quais formas de pagamento são aceitas?', 'As formas de pagamento disponíveis são informadas pela equipe durante o atendimento. (Conteúdo demonstrativo — edite esta resposta no painel.)'],
  ['Quais veículos são atendidos?', 'Atendemos veículos de passeio e utilitários leves. Se tiver dúvida sobre o seu modelo, entre em contato. (Conteúdo demonstrativo — edite esta resposta no painel.)'],
].map(([question, answer], i) => ({ id: `demo-faq-${i}`, question, answer, is_active: true, sort_order: i * 10 }))

export const fallbackGallery: GalleryImage[] = [
  ['photo-1486262715619-67b85e0b08d3', 'Mecânico trabalhando no motor de um carro', 'servicos'],
  ['photo-1487754180451-c456f719a1fc', 'Veículo em manutenção na oficina', 'oficina'],
  ['photo-1492144534655-ae79c964c9d7', 'Carro esportivo branco', 'detalhes'],
  ['photo-1503376780353-7e6692767b70', 'Detalhe frontal de um carro esportivo', 'detalhes'],
  ['photo-1580273916550-e323be2ae537', 'Carro esportivo azul em ambiente urbano', 'detalhes'],
  ['photo-1494976388531-d1058494cdd8', 'Carro clássico em destaque', 'detalhes'],
].map(([id, alt, category], i) => ({
  id: `demo-img-${i}`,
  image_url: unsplash(id),
  storage_path: null,
  caption: 'Imagem ilustrativa',
  alt_text: alt,
  category: category as GalleryImage['category'],
  is_visible: true,
  sort_order: i * 10,
}))
