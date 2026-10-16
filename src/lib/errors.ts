// Traduz erros do backend em mensagens compreensíveis, sem expor detalhes internos.

const RPC_MESSAGES: Record<string, string> = {
  invalid_request: 'Não foi possível processar a solicitação.',
  invalid_name: 'Informe seu nome completo.',
  invalid_phone: 'Informe um telefone válido com DDD.',
  invalid_vehicle_brand: 'Informe a marca do veículo.',
  invalid_vehicle_model: 'Informe o modelo do veículo.',
  invalid_vehicle_year: 'Ano do veículo inválido.',
  invalid_vehicle_mileage: 'Quilometragem inválida.',
  invalid_service: 'O serviço selecionado não está mais disponível. Escolha outro.',
  invalid_description: 'Descreva o problema com pelo menos 10 caracteres.',
  invalid_contact_preference: 'Preferência de contato inválida.',
  invalid_preferred_date: 'Escolha uma data a partir de hoje (até 6 meses).',
  invalid_preferred_period: 'Período inválido.',
  too_many_photos: 'Envie no máximo 5 fotos.',
  invalid_photo: 'Não foi possível anexar uma das fotos. Tente enviá-las novamente.',
  rate_limited: 'Recebemos várias solicitações em pouco tempo. Aguarde alguns minutos ou fale conosco pelo WhatsApp.',
  forbidden: 'Você não tem permissão para esta ação.',
}

interface MaybeError {
  message?: string
  code?: string
  status?: number
}

export function friendlyError(err: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  if (!err) return fallback
  const e = err as MaybeError
  const msg = e.message ?? ''
  if (RPC_MESSAGES[msg]) return RPC_MESSAGES[msg]
  if (e.code === '42501' || /row-level security|permission denied/i.test(msg))
    return 'Você não tem permissão para esta ação. Entre novamente com uma conta administrativa.'
  if (e.code === '23514' && /Transição de status/.test(msg)) return 'Esta mudança de status não é permitida a partir do status atual.'
  if (e.code === '23514') return 'Algum campo está fora do formato permitido. Revise os dados.'
  if (e.code === '23505') return 'Já existe um registro com esses dados.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.'
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar.'
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  if (/different from the old password/i.test(msg)) return 'A nova senha precisa ser diferente da atual.'
  if (/Password should be|weak/i.test(msg)) return 'A senha não atende aos requisitos mínimos (10 caracteres ou mais).'
  if (/The resource already exists|Duplicate/i.test(msg)) return 'Já existe um arquivo com esse nome.'
  if (/mime type|invalid_mime/i.test(msg)) return 'Formato de arquivo não permitido.'
  if (/exceeded the maximum allowed size|Payload too large/i.test(msg)) return 'Arquivo maior que o limite permitido (5 MB).'
  return fallback
}
