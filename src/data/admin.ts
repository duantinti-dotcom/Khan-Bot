import { requireSupabase } from '../lib/supabase'
import { defaultSettings } from '../config/brand'
import { mergeSettings, type SiteSettings } from '../lib/settings'
import { safeFileName } from '../lib/images'
import type {
  Customer,
  Faq,
  GalleryImage,
  QuoteNote,
  QuoteRequest,
  QuoteStatus,
  QuoteStatusHistory,
  Review,
  Service,
} from '../lib/types'

// Todas as funções abaixo dependem da sessão de um administrador. Sem ela, as
// políticas RLS do banco recusam a operação (não há "bypass" no frontend).

const sb = () => requireSupabase()

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error
  return res.data as T
}

// ---------------------------------------------------------------- Indicadores
export interface DashboardStats {
  total: number
  by_status: Partial<Record<QuoteStatus, number>>
  approved_ever: number
  top_services: { name: string; count: number }[]
  per_day: { day: string; count: number }[]
}

export async function getDashboardStats(days = 30): Promise<DashboardStats> {
  return check(await sb().rpc('admin_dashboard_stats', { days })) as DashboardStats
}

// ---------------------------------------------------------------- Orçamentos
export interface QuoteFilters {
  search?: string
  status?: QuoteStatus | ''
  from?: string
  to?: string
  sort?: 'created_desc' | 'created_asc' | 'name_asc'
  page?: number
  pageSize?: number
  customerId?: string
}

export async function listQuotes(f: QuoteFilters = {}): Promise<{ rows: QuoteRequest[]; count: number }> {
  const pageSize = f.pageSize ?? 15
  const page = f.page ?? 0
  let q = sb().from('quote_requests').select('*', { count: 'exact' })
  if (f.status) q = q.eq('status', f.status)
  if (f.customerId) q = q.eq('customer_id', f.customerId)
  if (f.from) q = q.gte('created_at', new Date(`${f.from}T00:00:00`).toISOString())
  if (f.to) q = q.lte('created_at', new Date(`${f.to}T23:59:59.999`).toISOString())
  const term = f.search?.trim().replace(/[%,()*\\]/g, ' ').trim()
  if (term) {
    const digits = term.replace(/\D/g, '')
    const ors = [
      `customer_name.ilike.%${term}%`,
      `vehicle_brand.ilike.%${term}%`,
      `vehicle_model.ilike.%${term}%`,
      `service_name.ilike.%${term}%`,
    ]
    if (digits.length >= 3) ors.push(`phone_normalized.ilike.%${digits}%`)
    const code = term.match(/^(?:VA-?)?0*(\d{1,9})$/i)
    if (code) ors.push(`number.eq.${Number(code[1])}`)
    q = q.or(ors.join(','))
  }
  if (f.sort === 'created_asc') q = q.order('created_at', { ascending: true })
  else if (f.sort === 'name_asc') q = q.order('customer_name', { ascending: true })
  else q = q.order('created_at', { ascending: false })
  q = q.range(page * pageSize, page * pageSize + pageSize - 1)
  const { data, error, count } = await q
  if (error) throw error
  return { rows: (data ?? []) as QuoteRequest[], count: count ?? 0 }
}

export async function getQuote(id: string): Promise<QuoteRequest | null> {
  return check(await sb().from('quote_requests').select('*').eq('id', id).maybeSingle()) as QuoteRequest | null
}

export async function updateQuoteStatus(id: string, status: QuoteStatus): Promise<QuoteRequest> {
  return check(await sb().from('quote_requests').update({ status }).eq('id', id).select('*').single()) as QuoteRequest
}

export async function deleteQuote(id: string): Promise<void> {
  check(await sb().from('quote_requests').delete().eq('id', id))
}

export async function listQuoteHistory(id: string): Promise<QuoteStatusHistory[]> {
  return check(
    await sb().from('quote_status_history').select('*').eq('request_id', id).order('created_at', { ascending: true }),
  ) as QuoteStatusHistory[]
}

export async function listQuoteNotes(id: string): Promise<QuoteNote[]> {
  return check(
    await sb().from('quote_notes').select('*').eq('request_id', id).order('created_at', { ascending: true }),
  ) as QuoteNote[]
}

export async function addQuoteNote(requestId: string, body: string, authorId: string, authorName: string | null) {
  return check(
    await sb()
      .from('quote_notes')
      .insert({ request_id: requestId, body: body.trim(), author_id: authorId, author_name: authorName })
      .select('*')
      .single(),
  ) as QuoteNote
}

export async function deleteQuoteNote(id: string) {
  check(await sb().from('quote_notes').delete().eq('id', id))
}

export async function signedPhotoUrls(paths: string[]): Promise<string[]> {
  if (!paths.length) return []
  const res = await sb().storage.from('quote-photos').createSignedUrls(paths, 60 * 10)
  if (res.error) throw res.error
  return (res.data ?? []).map((d) => d.signedUrl ?? '').filter(Boolean)
}

// ------------------------------------------------------------------ Clientes
export interface CustomerWithStats extends Customer {
  requests: Pick<QuoteRequest, 'id' | 'number' | 'vehicle_brand' | 'vehicle_model' | 'vehicle_year' | 'status' | 'created_at' | 'service_name'>[]
}

export async function listCustomers(search = '', page = 0, pageSize = 20) {
  let q = sb()
    .from('customers')
    .select('*, requests:quote_requests(id, number, vehicle_brand, vehicle_model, vehicle_year, status, created_at, service_name)', {
      count: 'exact',
    })
    .order('last_request_at', { ascending: false, nullsFirst: false })
  const term = search.trim().replace(/[%,()*\\]/g, ' ').trim()
  if (term) {
    const digits = term.replace(/\D/g, '')
    q = q.or(
      [`name.ilike.%${term}%`, digits.length >= 3 ? `phone_normalized.ilike.%${digits}%` : null].filter(Boolean).join(','),
    )
  }
  const { data, error, count } = await q.range(page * pageSize, page * pageSize + pageSize - 1)
  if (error) throw error
  return { rows: (data ?? []) as CustomerWithStats[], count: count ?? 0 }
}

// ------------------------------------------------------------------ Serviços
export type ServiceInput = Omit<Service, 'id' | 'created_at' | 'updated_at'>

export async function listServicesAdmin(): Promise<Service[]> {
  return check(await sb().from('services').select('*').order('sort_order').order('name')) as Service[]
}
export async function createService(input: ServiceInput) {
  return check(await sb().from('services').insert(input).select('*').single()) as Service
}
export async function updateService(id: string, input: Partial<ServiceInput>) {
  return check(await sb().from('services').update(input).eq('id', id).select('*').single()) as Service
}
export async function deleteService(id: string) {
  check(await sb().from('services').delete().eq('id', id))
}

// --------------------------------------------- Ordenação genérica (troca de posição)
type OrderedTable = 'services' | 'faqs' | 'reviews' | 'gallery_images'

/** Regrava sort_order de toda a lista na ordem recebida. */
export async function saveOrder(table: OrderedTable, ids: string[]) {
  const results = await Promise.all(
    ids.map((id, i) => sb().from(table).update({ sort_order: (i + 1) * 10 }).eq('id', id)),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

// ---------------------------------------------------------------------- FAQ
export type FaqInput = Omit<Faq, 'id'>
export async function listFaqsAdmin(): Promise<Faq[]> {
  return check(await sb().from('faqs').select('*').order('sort_order')) as Faq[]
}
export async function createFaq(input: FaqInput) {
  return check(await sb().from('faqs').insert(input).select('*').single()) as Faq
}
export async function updateFaq(id: string, input: Partial<FaqInput>) {
  return check(await sb().from('faqs').update(input).eq('id', id).select('*').single()) as Faq
}
export async function deleteFaq(id: string) {
  check(await sb().from('faqs').delete().eq('id', id))
}

// ---------------------------------------------------------------- Avaliações
export type ReviewInput = Omit<Review, 'id'>
export async function listReviewsAdmin(): Promise<Review[]> {
  return check(await sb().from('reviews').select('*').order('sort_order').order('created_at', { ascending: false })) as Review[]
}
export async function createReview(input: ReviewInput) {
  return check(await sb().from('reviews').insert(input).select('*').single()) as Review
}
export async function updateReview(id: string, input: Partial<ReviewInput>) {
  return check(await sb().from('reviews').update(input).eq('id', id).select('*').single()) as Review
}
export async function deleteReview(id: string) {
  check(await sb().from('reviews').delete().eq('id', id))
}

// ------------------------------------------------------------------- Galeria
export async function listGalleryAdmin(): Promise<GalleryImage[]> {
  return check(await sb().from('gallery_images').select('*').order('sort_order').order('created_at')) as GalleryImage[]
}

/** Envia uma imagem ao bucket público "media" e retorna a URL pública. */
export async function uploadMedia(file: File, folder: 'gallery' | 'brand' | 'site' | 'services') {
  const path = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeFileName(file.name)}`
  const up = await sb().storage.from('media').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' })
  if (up.error) throw up.error
  const { data } = sb().storage.from('media').getPublicUrl(path)
  return { path, url: data.publicUrl }
}

export async function removeMedia(path: string | null) {
  if (!path) return
  const res = await sb().storage.from('media').remove([path])
  if (res.error) throw res.error
}

export async function createGalleryImage(input: Omit<GalleryImage, 'id'>) {
  return check(await sb().from('gallery_images').insert(input).select('*').single()) as GalleryImage
}
export async function updateGalleryImage(id: string, input: Partial<Omit<GalleryImage, 'id'>>) {
  return check(await sb().from('gallery_images').update(input).eq('id', id).select('*').single()) as GalleryImage
}
export async function deleteGalleryImage(img: GalleryImage) {
  check(await sb().from('gallery_images').delete().eq('id', img.id))
  // Remove o arquivo depois do registro, para nunca deixar a galeria apontando para um arquivo apagado.
  if (img.storage_path) await removeMedia(img.storage_path).catch(() => undefined)
}

// --------------------------------------------------------------- Configurações
export async function getSettings(): Promise<{ settings: SiteSettings; updated_at: string | null }> {
  const row = check(await sb().from('site_settings').select('data, updated_at').eq('id', 1).maybeSingle()) as {
    data: unknown
    updated_at: string
  } | null
  return { settings: mergeSettings(defaultSettings, row?.data ?? {}), updated_at: row?.updated_at ?? null }
}

export async function saveSettings(settings: SiteSettings, userId: string) {
  const res = await sb()
    .from('site_settings')
    .upsert({ id: 1, data: settings, updated_by: userId }, { onConflict: 'id' })
    .select('updated_at')
    .single()
  if (res.error) throw res.error
  return res.data as { updated_at: string }
}
