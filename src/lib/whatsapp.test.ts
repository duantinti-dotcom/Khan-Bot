import { describe, expect, it } from 'vitest'
import { buildQuoteMessage, whatsappLink } from './whatsapp'
import { isValidBrPhone, maskBrPhone, normalizeBrPhone } from './phone'
import { emptyQuoteForm, validateQuote } from './quoteSchema'
import { parseCurrencyToCents, todayISO } from './format'
import { canTransition } from './status'
import { mergeSettings } from './settings'
import { defaultSettings } from '../config/brand'

describe('whatsapp', () => {
  it('monta link com número configurado', () => {
    expect(whatsappLink('55 (11) 91234-5678', 'Olá')).toBe('https://wa.me/5511912345678?text=Ol%C3%A1')
  })
  it('sem número, abre o seletor de contatos (não inventa número)', () => {
    expect(whatsappLink('', 'Oi')).toBe('https://wa.me/?text=Oi')
  })
  it('gera mensagem organizada com os dados do pedido', () => {
    const msg = buildQuoteMessage({
      businessName: 'VÉRTICE AUTOMOTIVE',
      number: 12,
      customer_name: 'Ana Souza',
      phone: '11912345678',
      vehicle_brand: 'Volkswagen',
      vehicle_model: 'Golf',
      vehicle_year: '2019',
      vehicle_mileage: '45000',
      service_name: 'Freios e suspensão',
      description: 'Barulho ao frear.',
      contact_preference: 'whatsapp',
      preferred_date: '2030-01-15',
      preferred_period: 'manha',
    })
    expect(msg).toContain('VA-00012')
    expect(msg).toContain('*Veículo:* Volkswagen Golf 2019')
    expect(msg).toContain('45.000 km')
    expect(msg).toContain('(11) 91234-5678')
    expect(msg).toContain('15/01/2030 · Manhã (sujeito à confirmação)')
  })
})

describe('telefone', () => {
  it('valida celular e fixo com DDD', () => {
    expect(isValidBrPhone('(11) 91234-5678')).toBe(true)
    expect(isValidBrPhone('(11) 3456-7890')).toBe(true)
    expect(isValidBrPhone('5511912345678')).toBe(true)
    expect(isValidBrPhone('1234')).toBe(false)
    expect(isValidBrPhone('(11) 81234-5678')).toBe(false)
  })
  it('normaliza e aplica máscara', () => {
    expect(normalizeBrPhone('(11) 91234-5678')).toBe('5511912345678')
    expect(maskBrPhone('5511912345678')).toBe('(11) 91234-5678')
  })
})

describe('formulário de orçamento', () => {
  it('aponta campos obrigatórios', () => {
    const errors = validateQuote(emptyQuoteForm())
    expect(Object.keys(errors)).toEqual(
      expect.arrayContaining(['customer_name', 'phone', 'vehicle_brand', 'vehicle_model', 'service_id', 'description', 'consent']),
    )
  })
  it('aceita formulário válido e rejeita data passada', () => {
    const ok = {
      ...emptyQuoteForm('x'),
      customer_name: 'Ana Souza',
      phone: '(11) 91234-5678',
      vehicle_brand: 'Fiat',
      vehicle_model: 'Argo',
      description: 'Luz da injeção acesa.',
      consent: true as const,
    }
    expect(validateQuote(ok)).toEqual({})
    expect(validateQuote({ ...ok, preferred_date: '2000-01-01' }).preferred_date).toBeTruthy()
    expect(validateQuote({ ...ok, preferred_date: todayISO(1) })).toEqual({})
  })
})

describe('utilitários', () => {
  it('converte moeda em centavos', () => {
    expect(parseCurrencyToCents('1.234,56')).toBe(123456)
    expect(parseCurrencyToCents('99.9')).toBe(9990)
    expect(parseCurrencyToCents('')).toBeNull()
  })
  it('respeita transições de status (aprovado ≠ concluído)', () => {
    expect(canTransition('novo', 'em_contato')).toBe(true)
    expect(canTransition('novo', 'concluido')).toBe(false)
    expect(canTransition('aprovado', 'concluido')).toBe(false)
    expect(canTransition('em_execucao', 'concluido')).toBe(true)
  })
  it('mescla configurações salvas sobre os padrões', () => {
    const merged = mergeSettings(defaultSettings, { hero: { title: 'Novo título' }, hacked: 1, theme: { accent: 5 } })
    expect(merged.hero.title).toBe('Novo título')
    expect(merged.hero.subtitle).toBe(defaultSettings.hero.subtitle)
    expect(merged.theme.accent).toBe(defaultSettings.theme.accent)
    expect('hacked' in merged).toBe(false)
  })
})
