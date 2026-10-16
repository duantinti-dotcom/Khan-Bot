// Variáveis públicas do frontend. Somente URL e chave pública (anon/publishable).
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  siteUrl: ((import.meta.env.VITE_SITE_URL as string | undefined)?.trim() ?? '').replace(/\/$/, ''),
  /** Verdadeiro quando o site está conectado a um projeto Supabase. */
  hasBackend: Boolean(url && anonKey && /^https?:\/\//.test(url)),
}
