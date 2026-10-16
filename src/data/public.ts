import { defaultSettings, fallbackFaqs, fallbackGallery, fallbackServices } from '../config/brand'
import { mergeSettings, type SiteSettings } from '../lib/settings'
import { requireSupabase, supabase } from '../lib/supabase'
import { NO_SERVICE } from '../lib/quoteConstants'
import type { QuoteFormValues } from '../lib/quoteSchema'
import { safeFileName } from '../lib/images'
import type { Faq, GalleryImage, Review, Service } from '../lib/types'

export interface SiteData {
  settings: SiteSettings
  services: Service[]
  faqs: Faq[]
  reviews: Review[]
  gallery: GalleryImage[]
  /** "database" quando os dados vieram do Supabase; "fallback" no modo offline. */
  source: 'database' | 'fallback'
}

export const fallbackSiteData: SiteData = {
  settings: defaultSettings,
  services: fallbackServices,
  faqs: fallbackFaqs,
  reviews: [],
  gallery: fallbackGallery,
  source: 'fallback',
}

export async function fetchSiteData(): Promise<SiteData> {
  if (!supabase) return fallbackSiteData
  const [settings, services, faqs, reviews, gallery] = await Promise.all([
    supabase.from('site_settings').select('data').eq('id', 1).maybeSingle(),
    supabase.from('services').select('*').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('faqs').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('reviews').select('*').eq('is_visible', true).order('sort_order').order('review_date', { ascending: false }),
    supabase.from('gallery_images').select('*').eq('is_visible', true).order('sort_order').order('created_at'),
  ])
  const firstError = settings.error ?? services.error ?? faqs.error ?? reviews.error ?? gallery.error
  if (firstError) throw firstError
  return {
    settings: mergeSettings(defaultSettings, settings.data?.data ?? {}),
    services: (services.data ?? []) as Service[],
    faqs: (faqs.data ?? []) as Faq[],
    reviews: (reviews.data ?? []) as Review[],
    gallery: (gallery.data ?? []) as GalleryImage[],
    source: 'database',
  }
}

/** Envia fotos para o bucket privado. O visitante só pode gravar em pending/<uuid>/. */
export async function uploadQuotePhotos(files: File[]): Promise<string[]> {
  if (!files.length) return []
  const sb = requireSupabase()
  const folder = `pending/${crypto.randomUUID()}`
  const paths: string[] = []
  for (const [i, file] of files.entries()) {
    const path = `${folder}/${i + 1}-${safeFileName(file.name)}`
    const { error } = await sb.storage.from('quote-photos').upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: '3600',
    })
    if (error) throw error
    paths.push(path)
  }
  return paths
}

export async function submitQuoteRequest(
  values: QuoteFormValues,
  photoPaths: string[],
  honeypot: string,
): Promise<{ id: string; number: number }> {
  const sb = requireSupabase()
  const { data, error } = await sb.rpc('submit_quote_request', {
    payload: {
      customer_name: values.customer_name,
      phone: values.phone,
      vehicle_brand: values.vehicle_brand,
      vehicle_model: values.vehicle_model,
      vehicle_year: values.vehicle_year,
      vehicle_mileage: values.vehicle_mileage,
      service_id: values.service_id === NO_SERVICE ? null : values.service_id,
      description: values.description,
      contact_preference: values.contact_preference,
      preferred_date: values.preferred_date || null,
      preferred_period: values.preferred_period || null,
      photo_paths: photoPaths,
      website: honeypot,
    },
  })
  if (error) throw error
  return data as { id: string; number: number }
}
