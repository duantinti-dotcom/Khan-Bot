// Tipos compartilhados entre o site público e o painel.

export type QuoteStatus =
  | 'novo'
  | 'em_contato'
  | 'em_avaliacao'
  | 'aguardando_aprovacao'
  | 'aprovado'
  | 'em_execucao'
  | 'concluido'
  | 'cancelado'

export type ContactPreference = 'whatsapp' | 'ligacao'
export type DayPeriod = 'manha' | 'tarde'

export interface Service {
  id: string
  name: string
  description: string
  category: string
  icon: string
  price_cents: number | null
  price_note: string | null
  image_url: string | null
  is_active: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

export interface Faq {
  id: string
  question: string
  answer: string
  is_active: boolean
  sort_order: number
}

export interface Review {
  id: string
  author_name: string
  rating: number
  comment: string
  review_date: string | null
  source: string | null
  is_demo: boolean
  is_visible: boolean
  sort_order: number
}

export type GalleryCategory = 'oficina' | 'servicos' | 'detalhes' | 'estrutura'

export interface GalleryImage {
  id: string
  image_url: string
  storage_path: string | null
  caption: string | null
  alt_text: string | null
  category: GalleryCategory
  is_visible: boolean
  sort_order: number
}

export interface Customer {
  id: string
  name: string
  phone: string
  phone_normalized: string
  email: string | null
  last_request_at: string | null
  created_at: string
}

export interface QuoteRequest {
  id: string
  number: number
  customer_id: string | null
  customer_name: string
  phone: string
  phone_normalized: string
  vehicle_brand: string
  vehicle_model: string
  vehicle_year: number | null
  vehicle_mileage: number | null
  service_id: string | null
  service_name: string
  description: string
  contact_preference: ContactPreference
  preferred_date: string | null
  preferred_period: DayPeriod | null
  photo_paths: string[]
  status: QuoteStatus
  created_at: string
  updated_at: string
}

export interface QuoteNote {
  id: string
  request_id: string
  author_id: string | null
  author_name: string | null
  body: string
  created_at: string
}

export interface QuoteStatusHistory {
  id: number
  request_id: string
  from_status: QuoteStatus | null
  to_status: QuoteStatus
  changed_by: string | null
  created_at: string
}

export interface Profile {
  id: string
  full_name: string | null
  role: 'admin'
  active: boolean
}
