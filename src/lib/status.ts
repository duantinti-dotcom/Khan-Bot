import type { QuoteStatus } from './types'

export const STATUS_ORDER: QuoteStatus[] = [
  'novo',
  'em_contato',
  'em_avaliacao',
  'aguardando_aprovacao',
  'aprovado',
  'em_execucao',
  'concluido',
  'cancelado',
]

export const STATUS_META: Record<QuoteStatus, { label: string; tone: string; dot: string; description: string }> = {
  novo: { label: 'Novo', tone: 'text-info bg-info/10 border-info/25', dot: 'bg-info', description: 'Recebido, aguardando primeiro contato.' },
  em_contato: { label: 'Em contato', tone: 'text-sky-300 bg-sky-300/10 border-sky-300/25', dot: 'bg-sky-300', description: 'Equipe conversando com o cliente.' },
  em_avaliacao: { label: 'Em avaliação', tone: 'text-violet-300 bg-violet-300/10 border-violet-300/25', dot: 'bg-violet-300', description: 'Veículo ou informações em análise.' },
  aguardando_aprovacao: { label: 'Aguardando aprovação', tone: 'text-warning bg-warning/10 border-warning/25', dot: 'bg-warning', description: 'Orçamento enviado ao cliente.' },
  aprovado: { label: 'Aprovado', tone: 'text-emerald-300 bg-emerald-300/10 border-emerald-300/25', dot: 'bg-emerald-300', description: 'Cliente aprovou o orçamento. Serviço ainda não iniciado.' },
  em_execucao: { label: 'Em execução', tone: 'text-orange-300 bg-orange-300/10 border-orange-300/25', dot: 'bg-orange-300', description: 'Serviço em andamento.' },
  concluido: { label: 'Concluído', tone: 'text-success bg-success/10 border-success/25', dot: 'bg-success', description: 'Serviço finalizado.' },
  cancelado: { label: 'Cancelado', tone: 'text-steel-400 bg-steel-400/10 border-steel-400/25', dot: 'bg-steel-400', description: 'Solicitação encerrada sem execução.' },
}

/** Espelho da função quote_status_transition_allowed() do banco. */
export const STATUS_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  novo: ['em_contato', 'em_avaliacao', 'cancelado'],
  em_contato: ['novo', 'em_avaliacao', 'aguardando_aprovacao', 'cancelado'],
  em_avaliacao: ['em_contato', 'aguardando_aprovacao', 'cancelado'],
  aguardando_aprovacao: ['em_contato', 'em_avaliacao', 'aprovado', 'cancelado'],
  aprovado: ['aguardando_aprovacao', 'em_execucao', 'cancelado'],
  em_execucao: ['aprovado', 'concluido', 'cancelado'],
  concluido: ['em_execucao'],
  cancelado: ['novo', 'em_contato'],
}

export const canTransition = (from: QuoteStatus, to: QuoteStatus) =>
  from === to || STATUS_TRANSITIONS[from].includes(to)
