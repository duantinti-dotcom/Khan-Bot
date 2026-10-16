import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env'

/**
 * Cliente Supabase do navegador. Usa apenas a chave pública: todas as
 * permissões são garantidas pelas políticas RLS do banco.
 * É `null` quando o projeto ainda não foi configurado.
 */
export const supabase: SupabaseClient | null = env.hasBackend
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}
