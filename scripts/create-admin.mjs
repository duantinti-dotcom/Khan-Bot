#!/usr/bin/env node
/**
 * Cria (ou promove) um administrador do painel VÉRTICE AUTOMOTIVE.
 *
 * Executar SOMENTE no computador de quem administra o projeto — nunca no
 * navegador. Usa a service_role key, que ignora RLS e não pode ser exposta.
 *
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/create-admin.mjs admin@oficina.com.br "Nome do Responsável"
 *
 * A senha é pedida no terminal (não fica no histórico do shell). Para
 * automação, é possível informar ADMIN_PASSWORD no ambiente.
 */
import { createClient } from '@supabase/supabase-js'
import { createInterface } from 'node:readline'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const [email, ...nameParts] = process.argv.slice(2)
const fullName = nameParts.join(' ').trim() || null

if (!url || !serviceKey) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.')
  process.exit(1)
}
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Uso: node scripts/create-admin.mjs <email> [nome]')
  process.exit(1)
}

async function askPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  // Oculta a digitação
  rl._writeToOutput = (s) => rl.output.write(s.includes('Senha') ? s : '*')
  const answer = await new Promise((resolve) => rl.question('Senha (mín. 10 caracteres): ', resolve))
  rl.close()
  process.stdout.write('\n')
  return String(answer)
}

const password = await askPassword()
if (password.length < 10) {
  console.error('A senha deve ter pelo menos 10 caracteres.')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

let userId
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } })
if (created.error) {
  if (!/already|registered|exists/i.test(created.error.message)) {
    console.error('Erro ao criar usuário:', created.error.message)
    process.exit(1)
  }
  // Usuário já existe: localiza e atualiza a senha.
  let page = 1
  while (!userId) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    userId = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id
    if (data.users.length < 200) break
    page++
  }
  if (!userId) {
    console.error('Usuário existente não encontrado.')
    process.exit(1)
  }
  const upd = await admin.auth.admin.updateUserById(userId, { password })
  if (upd.error) throw upd.error
  console.log('Usuário já existia — senha atualizada.')
} else {
  userId = created.data.user.id
}

const { error: profileError } = await admin
  .from('profiles')
  .upsert({ id: userId, full_name: fullName, role: 'admin', active: true }, { onConflict: 'id' })
if (profileError) {
  console.error('Erro ao gravar perfil administrativo:', profileError.message)
  process.exit(1)
}

console.log(`Administrador pronto: ${email}`)
