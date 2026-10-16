#!/usr/bin/env node
/**
 * Testes de segurança e integração do banco (RLS, RPC, storage, transições).
 * Rodar contra o Supabase LOCAL (npx supabase start):
 *
 *   eval "$(npx supabase status -o env)" && \
 *   SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
 *   node scripts/test-rls.mjs
 *
 * Cria usuários e registros de teste com dados fictícios e os remove ao final.
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey || !serviceKey) {
  console.error('Defina SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
if (!/127\.0\.0\.1|localhost/.test(url) && process.env.ALLOW_REMOTE !== '1') {
  console.error('Por segurança este script só roda contra o Supabase local (defina ALLOW_REMOTE=1 para forçar).')
  process.exit(1)
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(url, serviceKey, opts)
const anon = createClient(url, anonKey, opts)

let passed = 0
let failed = 0
const ok = (name, cond, extra = '') => {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name} ${extra}`)
  }
}

const rnd = () => Math.random().toString(36).slice(2, 8)
const phone = () => `11 9${String(Math.floor(10000000 + Math.random() * 89999999))}`
const pwd = `T3ste-${randomUUID()}`

async function makeUser(admin) {
  const email = `teste-${rnd()}@example.com`
  const { data, error } = await service.auth.admin.createUser({ email, password: pwd, email_confirm: true })
  if (error) throw error
  if (admin) {
    const r = await service.from('profiles').insert({ id: data.user.id, role: 'admin', full_name: 'Admin Teste' })
    if (r.error) throw r.error
  }
  const client = createClient(url, anonKey, opts)
  const s = await client.auth.signInWithPassword({ email, password: pwd })
  if (s.error) throw s.error
  return { client, id: data.user.id }
}

const createdUsers = []
const createdQuoteIds = []

// Zera o contador anti-abuso por IP (todos os testes locais saem do mesmo IP).
const resetRateLimit = () => service.from('quote_requests').update({ ip_hash: null }).not('ip_hash', 'is', null)

try {
  await resetRateLimit()
  const { data: services } = await anon.from('services').select('id,name').order('sort_order')
  const serviceId = services[0].id
  const basePayload = (p = phone()) => ({
    customer_name: 'Cliente Teste',
    phone: p,
    vehicle_brand: 'Fiat',
    vehicle_model: 'Argo',
    vehicle_year: '2020',
    vehicle_mileage: '35.000',
    service_id: serviceId,
    description: 'Barulho na suspensão dianteira.',
    contact_preference: 'whatsapp',
    preferred_date: null,
    preferred_period: 'manha',
    photo_paths: [],
    website: '',
  })

  console.log('\nVisitante (anon)')
  ok('lê serviços ativos', services.length >= 1)
  const tables = ['customers', 'quote_requests', 'quote_notes', 'quote_status_history', 'profiles']
  for (const t of tables) {
    const r = await anon.from(t).select('*').limit(1)
    ok(`não lê ${t}`, Boolean(r.error) || (r.data ?? []).length === 0, JSON.stringify(r.data))
  }
  const insSvc = await anon.from('services').insert({ name: 'Hack' })
  ok('não cria serviço', Boolean(insSvc.error))
  const updSet = await anon.from('site_settings').update({ data: { hacked: true } }).eq('id', 1).select()
  ok('não altera site_settings', Boolean(updSet.error) || (updSet.data ?? []).length === 0)
  const insQuote = await anon.from('quote_requests').insert({ customer_name: 'x' })
  ok('não insere direto em quote_requests', Boolean(insQuote.error))
  const stats = await anon.rpc('admin_dashboard_stats', { days: 30 })
  ok('não acessa indicadores do painel', Boolean(stats.error))

  const sub = await anon.rpc('submit_quote_request', { payload: basePayload() })
  ok('envia solicitação válida pela função segura', !sub.error && sub.data?.number > 0, sub.error?.message)
  if (sub.data) createdQuoteIds.push(sub.data.id)

  const bad = await anon.rpc('submit_quote_request', { payload: { ...basePayload(), phone: '123' } })
  ok('rejeita telefone inválido no servidor', bad.error?.message === 'invalid_phone', bad.error?.message)
  const bad2 = await anon.rpc('submit_quote_request', { payload: { ...basePayload(), description: 'curto' } })
  ok('rejeita descrição curta no servidor', bad2.error?.message === 'invalid_description')
  const bad3 = await anon.rpc('submit_quote_request', { payload: { ...basePayload(), preferred_date: '2000-01-01' } })
  ok('rejeita data passada no servidor', bad3.error?.message === 'invalid_preferred_date')
  const bot = await anon.rpc('submit_quote_request', { payload: { ...basePayload(), website: 'http://spam' } })
  ok('bloqueia robôs (campo armadilha)', bot.error?.message === 'invalid_request')
  const fakePhoto = await anon.rpc('submit_quote_request', { payload: { ...basePayload(), photo_paths: [`pending/${randomUUID()}/nao-existe.jpg`] } })
  ok('rejeita foto inexistente', fakePhoto.error?.message === 'invalid_photo')

  const samePhone = phone()
  const results = []
  for (let i = 0; i < 4; i++) results.push(await anon.rpc('submit_quote_request', { payload: basePayload(samePhone) }))
  results.forEach((r) => r.data && createdQuoteIds.push(r.data.id))
  ok('limita abuso (4º pedido do mesmo telefone em 30 min)', results[3].error?.message === 'rate_limited', results.map((r) => r.error?.message).join(','))
  const { count: custCount } = await service.from('customers').select('*', { count: 'exact', head: true }).eq('phone_normalized', `55${samePhone.replace(/\D/g, '')}`)
  ok('não duplica cliente com o mesmo telefone', custCount === 1, `count=${custCount}`)

  // Storage
  const photoPath = `pending/${randomUUID()}/foto.png`
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')
  const up = await anon.storage.from('quote-photos').upload(photoPath, png, { contentType: 'image/png' })
  ok('visitante envia foto para pending/<uuid>/', !up.error, up.error?.message)
  const upBad = await anon.storage.from('quote-photos').upload(`outra/${randomUUID()}.png`, png, { contentType: 'image/png' })
  ok('visitante não envia fora de pending/', Boolean(upBad.error))
  const upExe = await anon.storage.from('quote-photos').upload(`pending/${randomUUID()}/x.html`, Buffer.from('<script>'), { contentType: 'text/html' })
  ok('bloqueia tipo de arquivo não permitido', Boolean(upExe.error))
  const dl = await anon.storage.from('quote-photos').download(photoPath)
  ok('visitante não baixa fotos privadas', Boolean(dl.error))
  const list = await anon.storage.from('quote-photos').list('pending')
  ok('visitante não lista fotos', Boolean(list.error) || (list.data ?? []).length === 0)
  const media = await anon.storage.from('media').upload(`gallery/${randomUUID()}.png`, png, { contentType: 'image/png' })
  ok('visitante não envia para a galeria pública', Boolean(media.error))
  const withPhoto = await anon.rpc('submit_quote_request', { payload: { ...basePayload(), photo_paths: [photoPath] } })
  ok('solicitação com foto enviada é aceita', !withPhoto.error, withPhoto.error?.message)
  if (withPhoto.data) createdQuoteIds.push(withPhoto.data.id)

  await resetRateLimit()
  console.log('\nUsuário autenticado SEM perfil admin')
  const intruder = await makeUser(false)
  createdUsers.push(intruder.id)
  for (const t of ['customers', 'quote_requests', 'quote_notes']) {
    const r = await intruder.client.from(t).select('*').limit(5)
    ok(`não lê ${t}`, Boolean(r.error) || r.data.length === 0)
  }
  const iu = await intruder.client.from('site_settings').update({ data: { hacked: true } }).eq('id', 1).select()
  ok('não altera conteúdo do site', Boolean(iu.error) || iu.data.length === 0)
  const selfPromote = await intruder.client.from('profiles').insert({ id: intruder.id, role: 'admin' })
  ok('não se promove a admin', Boolean(selfPromote.error))
  const iStats = await intruder.client.rpc('admin_dashboard_stats', { days: 30 })
  ok('não acessa indicadores', Boolean(iStats.error))
  const iUp = await intruder.client.storage.from('media').upload(`gallery/${randomUUID()}.png`, png, { contentType: 'image/png' })
  ok('não envia para a galeria', Boolean(iUp.error))

  console.log('\nAdministrador')
  const admin = await makeUser(true)
  createdUsers.push(admin.id)
  const q = await admin.client.from('quote_requests').select('*').eq('id', createdQuoteIds[0]).single()
  ok('lê a solicitação criada no site', !q.error && q.data.status === 'novo')
  const skip = await admin.client.from('quote_requests').update({ status: 'concluido' }).eq('id', createdQuoteIds[0]).select()
  ok('bloqueia transição inválida (novo → concluído)', Boolean(skip.error))
  const step = await admin.client.from('quote_requests').update({ status: 'em_contato' }).eq('id', createdQuoteIds[0]).select().single()
  ok('altera status válido (novo → em contato)', !step.error && step.data.status === 'em_contato', step.error?.message)
  const hist = await admin.client.from('quote_status_history').select('*').eq('request_id', createdQuoteIds[0])
  ok('registra histórico de status', hist.data?.length === 2, `len=${hist.data?.length}`)
  const editName = await admin.client.from('quote_requests').update({ customer_name: 'Alterado' }).eq('id', createdQuoteIds[0]).select()
  ok('dados enviados pelo cliente não são reescritos pela API', Boolean(editName.error))
  const note = await admin.client.from('quote_notes').insert({ request_id: createdQuoteIds[0], body: 'Nota interna', author_id: admin.id }).select().single()
  ok('cria observação interna', !note.error, note.error?.message)
  const anonNote = await anon.from('quote_notes').select('*').eq('id', note.data?.id ?? randomUUID())
  ok('observação interna invisível para visitantes', Boolean(anonNote.error) || anonNote.data.length === 0)
  const aStats = await admin.client.rpc('admin_dashboard_stats', { days: 30 })
  ok('indicadores refletem registros reais', !aStats.error && aStats.data.total >= createdQuoteIds.length, JSON.stringify(aStats.error))
  const signed = await admin.client.storage.from('quote-photos').createSignedUrl(photoPath, 60)
  ok('admin gera link temporário da foto', !signed.error)
  const role = await admin.client.from('profiles').update({ role: 'admin', active: true }).eq('id', admin.id).select()
  ok('papel administrativo não é editável pela API', Boolean(role.error))

  // Serviço inativo some do site e do formulário
  const svc = await admin.client.from('services').insert({ name: `Serviço teste ${rnd()}`, is_active: false }).select().single()
  ok('admin cria serviço', !svc.error, svc.error?.message)
  const anonSvc = await anon.from('services').select('id').eq('id', svc.data.id)
  ok('serviço inativo não aparece para visitantes', anonSvc.data.length === 0)
  const subInactive = await anon.rpc('submit_quote_request', { payload: { ...basePayload(), service_id: svc.data.id } })
  ok('formulário rejeita serviço inativo', subInactive.error?.message === 'invalid_service')
  await admin.client.from('services').update({ is_active: true }).eq('id', svc.data.id)
  const anonSvc2 = await anon.from('services').select('id').eq('id', svc.data.id)
  ok('serviço ativado aparece para visitantes', anonSvc2.data.length === 1)
  const subActive = await anon.rpc('submit_quote_request', { payload: { ...basePayload(), service_id: svc.data.id } })
  if (subActive.data) createdQuoteIds.push(subActive.data.id)
  const del = await admin.client.from('services').delete().eq('id', svc.data.id)
  ok('admin exclui serviço', !del.error)
  const kept = await admin.client.from('quote_requests').select('service_id, service_name').eq('id', subActive.data.id).single()
  ok('histórico preserva o nome do serviço excluído', kept.data.service_id === null && kept.data.service_name.startsWith('Serviço teste'))

  // Conteúdo
  const before = await admin.client.from('site_settings').select('data').eq('id', 1).single()
  const upd = await admin.client.from('site_settings').update({ data: { ...before.data.data, hero: { title: 'Título de teste' } } }).eq('id', 1).select().single()
  ok('admin salva conteúdo do site', !upd.error)
  const pub = await anon.from('site_settings').select('data').eq('id', 1).single()
  ok('conteúdo salvo é visto pelo site público', pub.data.data.hero?.title === 'Título de teste')
  await admin.client.from('site_settings').update({ data: before.data.data }).eq('id', 1)
} catch (err) {
  failed++
  console.error('Erro inesperado:', err)
} finally {
  await resetRateLimit()
  if (createdQuoteIds.length) await service.from('quote_requests').delete().in('id', createdQuoteIds)
  await service.from('customers').delete().eq('name', 'Cliente Teste')
  for (const id of createdUsers) await service.auth.admin.deleteUser(id)
}

console.log(`\n${passed} aprovados, ${failed} falharam`)
process.exit(failed ? 1 : 0)
