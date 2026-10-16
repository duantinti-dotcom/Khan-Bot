const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const longDateFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })

export const formatCurrency = (cents: number) => brl.format(cents / 100)

/** Datas "YYYY-MM-DD" são tratadas como data local (sem fuso). */
function parse(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}

export const formatDate = (v: string) => dateFmt.format(parse(v))
export const formatDateTime = (v: string) => dateTimeFmt.format(parse(v))
export const formatLongDate = (v: string) => longDateFmt.format(parse(v))

export const quoteCode = (n: number) => `VA-${String(n).padStart(5, '0')}`

export function formatMileage(km: number) {
  return `${new Intl.NumberFormat('pt-BR').format(km)} km`
}

export function relativeTime(v: string): string {
  const diff = Date.now() - new Date(v).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  if (d < 30) return `há ${d} dia${d > 1 ? 's' : ''}`
  return formatDate(v)
}

/** Converte "1.234,56" ou "1234.56" em centavos. Retorna null se vazio/inválido. */
export function parseCurrencyToCents(input: string): number | null {
  const raw = input.trim().replace(/[R$\s]/g, '')
  if (!raw) return null
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

export function centsToInput(cents: number | null): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2).replace('.', ',')
}

export function todayISO(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
