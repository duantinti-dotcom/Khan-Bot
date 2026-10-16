import { formatDate, formatMileage, quoteCode } from './format'
import { maskBrPhone, onlyDigits } from './phone'
import type { DayPeriod } from './types'

export const PERIOD_LABEL: Record<DayPeriod, string> = { manha: 'Manhã', tarde: 'Tarde' }

/**
 * Monta o link de conversa do WhatsApp. Sem número configurado, abre o
 * WhatsApp para o usuário escolher o contato (nunca usa um número inventado).
 * Abrir o link NÃO envia a mensagem: o usuário confirma o envio no aplicativo.
 */
export function whatsappLink(number: string, message?: string): string {
  const digits = onlyDigits(number)
  const text = message ? `?text=${encodeURIComponent(message)}` : ''
  return digits ? `https://wa.me/${digits}${text}` : `https://wa.me/${text}`
}

export interface QuoteMessageInput {
  businessName: string
  number?: number | null
  customer_name: string
  phone: string
  vehicle_brand: string
  vehicle_model: string
  vehicle_year?: string | number | null
  vehicle_mileage?: string | number | null
  service_name: string
  description: string
  contact_preference: 'whatsapp' | 'ligacao'
  preferred_date?: string | null
  preferred_period?: DayPeriod | '' | null
}

/** Mensagem organizada com os dados da solicitação de orçamento. */
export function buildQuoteMessage(q: QuoteMessageInput): string {
  const lines: string[] = []
  lines.push(`Olá, ${q.businessName}! Gostaria de solicitar um orçamento.`)
  if (q.number) lines.push(`Pedido registrado no site: ${quoteCode(q.number)}`)
  lines.push('')
  lines.push(`*Nome:* ${q.customer_name.trim()}`)
  lines.push(`*Telefone:* ${maskBrPhone(q.phone)}`)
  const year = q.vehicle_year ? ` ${q.vehicle_year}` : ''
  lines.push(`*Veículo:* ${q.vehicle_brand.trim()} ${q.vehicle_model.trim()}${year}`)
  const km = q.vehicle_mileage ? Number(onlyDigits(String(q.vehicle_mileage))) : 0
  if (km) lines.push(`*Quilometragem:* ${formatMileage(km)}`)
  lines.push(`*Serviço:* ${q.service_name}`)
  lines.push(`*Descrição:* ${q.description.trim()}`)
  lines.push(`*Prefiro contato por:* ${q.contact_preference === 'whatsapp' ? 'WhatsApp' : 'Ligação'}`)
  if (q.preferred_date || q.preferred_period) {
    const parts = [
      q.preferred_date ? formatDate(q.preferred_date) : null,
      q.preferred_period ? PERIOD_LABEL[q.preferred_period] : null,
    ].filter(Boolean)
    lines.push(`*Preferência de data/período:* ${parts.join(' · ')} (sujeito à confirmação)`)
  }
  return lines.join('\n')
}

/** Mensagem curta usada pelo painel para iniciar contato com o cliente. */
export function buildFollowUpMessage(businessName: string, customerName: string, number?: number): string {
  const first = customerName.trim().split(/\s+/)[0] ?? ''
  const ref = number ? ` sobre a solicitação ${quoteCode(number)}` : ''
  return `Olá, ${first}! Aqui é da ${businessName}. Estamos entrando em contato${ref}.`
}
