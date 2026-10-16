import { z } from 'zod'
import { isValidBrPhone } from './phone'
import { todayISO } from './format'

export { NO_SERVICE, NO_SERVICE_LABEL } from './quoteConstants'

const currentYear = new Date().getFullYear()

/** Validação do formulário público (a mesma regra é aplicada no banco). */
export const quoteFormSchema = z
  .object({
    customer_name: z
      .string()
      .trim()
      .min(3, 'Informe seu nome completo.')
      .max(120, 'Nome muito longo.')
      .refine((v) => v.split(/\s+/).length >= 2, 'Informe nome e sobrenome.'),
    phone: z.string().trim().refine(isValidBrPhone, 'Informe um telefone válido com DDD.'),
    vehicle_brand: z.string().trim().min(1, 'Informe a marca.').max(60, 'Máximo de 60 caracteres.'),
    vehicle_model: z.string().trim().min(1, 'Informe o modelo.').max(80, 'Máximo de 80 caracteres.'),
    vehicle_year: z
      .string()
      .trim()
      .refine((v) => v === '' || (/^\d{4}$/.test(v) && +v >= 1900 && +v <= currentYear + 1), 'Ano inválido.'),
    vehicle_mileage: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d{1,7}$/.test(v.replace(/\D/g, '')), 'Quilometragem inválida.'),
    service_id: z.string().min(1, 'Selecione um serviço.'),
    description: z
      .string()
      .trim()
      .min(10, 'Descreva o problema com pelo menos 10 caracteres.')
      .max(2000, 'Máximo de 2.000 caracteres.'),
    contact_preference: z.enum(['whatsapp', 'ligacao']),
    preferred_date: z.string(),
    preferred_period: z.enum(['', 'manha', 'tarde']),
    consent: z.literal(true, { error: 'É preciso concordar com o uso dos dados para o atendimento.' }),
  })
  .superRefine((data, ctx) => {
    if (data.preferred_date) {
      const min = todayISO(0)
      const max = todayISO(180)
      if (data.preferred_date < min || data.preferred_date > max)
        ctx.addIssue({ code: 'custom', path: ['preferred_date'], message: 'Escolha uma data a partir de hoje (até 6 meses).' })
    }
  })

export type QuoteFormValues = z.input<typeof quoteFormSchema>

export const emptyQuoteForm = (serviceId = ''): QuoteFormValues => ({
  customer_name: '',
  phone: '',
  vehicle_brand: '',
  vehicle_model: '',
  vehicle_year: '',
  vehicle_mileage: '',
  service_id: serviceId,
  description: '',
  contact_preference: 'whatsapp',
  preferred_date: '',
  preferred_period: '',
  consent: false as unknown as true,
})

export type FieldErrors = Partial<Record<keyof QuoteFormValues, string>>

export function validateQuote(values: QuoteFormValues): FieldErrors {
  const result = quoteFormSchema.safeParse(values)
  if (result.success) return {}
  const errors: FieldErrors = {}
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof QuoteFormValues
    if (key && !errors[key]) errors[key] = issue.message
  }
  return errors
}
