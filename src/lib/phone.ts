/** Mantém apenas dígitos. */
export const onlyDigits = (v: string) => v.replace(/\D/g, '')

/** Normaliza para o formato internacional brasileiro (55 + DDD + número). */
export function normalizeBrPhone(v: string): string {
  const d = onlyDigits(v)
  if (d.length === 10 || d.length === 11) return `55${d}`
  return d
}

/** Valida telefone brasileiro com DDD (fixo ou celular), com ou sem DDI. */
export function isValidBrPhone(v: string): boolean {
  const d = onlyDigits(v)
  const local = d.length >= 12 && d.startsWith('55') ? d.slice(2) : d
  if (local.length !== 10 && local.length !== 11) return false
  if (local.length === 11 && local[2] !== '9') return false
  return /^[1-9]{2}/.test(local)
}

/** Máscara progressiva: (11) 91234-5678 */
export function maskBrPhone(v: string): string {
  let d = onlyDigits(v)
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  d = d.slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** Exibe um número normalizado (5511912345678) de forma legível. */
export function formatPhone(v: string): string {
  return maskBrPhone(v) || v
}
