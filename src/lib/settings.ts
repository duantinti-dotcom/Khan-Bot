// Tipos e mescla das configurações do site. A validação (zod) fica em
// settingsSchema.ts para não pesar no carregamento do site público.
import type { SiteSettings } from './settingsSchema'

export type { SiteSettings }

type DeepPartial<T> = T extends unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Mescla o que veio do banco sobre os padrões. Arrays são substituídos por inteiro. */
export function mergeSettings<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return base
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (!(key in base)) continue // ignora chaves desconhecidas
    const current = (base as Record<string, unknown>)[key]
    if (isPlainObject(current)) out[key] = mergeSettings(current, value)
    else if (Array.isArray(current)) out[key] = Array.isArray(value) ? value : current
    else if (value !== undefined && value !== null && typeof value === typeof current) out[key] = value
  }
  return out as T
}

export type SettingsOverride = DeepPartial<SiteSettings>
