import { expect, test, type Page } from '@playwright/test'

/**
 * Testes ponta a ponta: site público + painel integrados ao Supabase.
 * Requer o Supabase local rodando, o build apontando para ele (.env.local) e
 * um administrador criado com scripts/create-admin.mjs:
 *   E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npx playwright test
 */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? ''
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? ''
const stamp = Date.now().toString().slice(-6)
const customer = `Cliente E2E ${stamp}`

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'rolagem horizontal').toBeLessThanOrEqual(0)
}

async function login(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('E-mail').fill(ADMIN_EMAIL)
  await page.getByLabel('Senha', { exact: true }).fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible()
}

test.describe.configure({ mode: 'serial' })

// No banco LOCAL, zera o contador anti-abuso por IP antes da suíte
// (todos os testes saem do mesmo IP). Requer SUPABASE_SERVICE_ROLE_KEY.
test.beforeAll(async () => {
  const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key || !/127\.0\.0\.1|localhost/.test(url)) return
  await fetch(`${url}/rest/v1/quote_requests?ip_hash=not.is.null`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip_hash: null }),
  })
})

test('site público carrega com dados do banco e sem rolagem horizontal', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Performance, precisão e confiança/i)
  await expect(page.locator('#servicos li').filter({ hasText: 'Solicitar orçamento' })).toHaveCount(10)
  await expect(page.getByText('Revisão preventiva').first()).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index/)
  await noHorizontalScroll(page)
  for (const id of ['servicos', 'oficina', 'diferenciais', 'avaliacoes', 'contato']) await expect(page.locator(`#${id}`)).toHaveCount(1)
  // Sem avaliações reais: estado vazio elegante (nada inventado)
  await expect(page.locator('#avaliacoes')).toContainText('Ainda não publicamos avaliações')
})

test('FAQ expande e galeria abre em tela cheia com navegação', async ({ page }) => {
  await page.goto('/')
  const q = page.getByRole('button', { name: 'Como funciona o diagnóstico?' })
  await q.click()
  await expect(q).toHaveAttribute('aria-expanded', 'true')
  await page.locator('#galeria').scrollIntoViewIfNeeded()
  await page.locator('#galeria button[aria-label^="Ampliar"]').first().click()
  const dialog = page.getByRole('dialog', { name: /Visualização ampliada/ })
  await expect(dialog).toContainText('01 /')
  await page.keyboard.press('ArrowRight')
  await expect(dialog).toContainText('02 /')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('formulário valida, mostra resumo e registra a solicitação', async ({ page }) => {
  await page.goto('/#servicos')
  await page.getByRole('button', { name: 'Solicitar orçamento de Freios e suspensão' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Serviço desejado')).toHaveValue(/.+/)
  await expect(dialog.getByLabel('Serviço desejado').locator('option:checked')).toHaveText('Freios e suspensão')

  await dialog.getByRole('button', { name: 'Revisar solicitação' }).click()
  await expect(dialog.getByText('Informe seu nome completo.')).toBeVisible()
  await expect(dialog.getByText('Informe um telefone válido com DDD.')).toBeVisible()

  await dialog.getByLabel('Nome completo').fill(customer)
  await dialog.getByLabel('Telefone ou WhatsApp').fill(`1198${stamp}12`.slice(0, 11))
  await dialog.getByLabel('Marca').fill('Volkswagen')
  await dialog.getByLabel('Modelo').fill('Golf TSI')
  await dialog.getByLabel('Ano').fill('2019')
  await dialog.getByLabel('Quilometragem').fill('45000')
  await dialog.getByLabel('Descreva o problema ou a necessidade').fill('Barulho metálico ao frear em baixa velocidade.')
  await dialog.getByLabel('Período preferido').selectOption('manha')
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Revisar solicitação' }).click()

  await expect(dialog.getByRole('heading', { name: 'Confira sua solicitação' })).toBeVisible()
  await expect(dialog).toContainText('45.000 km')
  await expect(dialog).toContainText('fica registrada no sistema da oficina')
  await dialog.getByRole('button', { name: 'Enviar solicitação' }).click()

  await expect(dialog.getByTestId('quote-code')).toHaveText(/VA-\d{5}/)
  const code = await dialog.getByTestId('quote-code').textContent()
  const wa = dialog.getByRole('link', { name: 'Abrir conversa no WhatsApp' })
  const href = (await wa.getAttribute('href')) ?? ''
  expect(href).toMatch(/^https:\/\/wa\.me\//)
  const text = decodeURIComponent(href.split('text=')[1] ?? '')
  expect(text).toContain(code!)
  expect(text).toContain('Volkswagen Golf TSI 2019')
  expect(text).toContain('Freios e suspensão')
  await expect(dialog).toContainText('só é enviada quando você tocar em enviar')
})

test('painel exige login e recusa senha errada', async ({ page }) => {
  await page.goto('/admin/orcamentos')
  await expect(page).toHaveURL(/\/admin\/login\?next=/)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  await page.getByLabel('E-mail').fill(ADMIN_EMAIL)
  await page.getByLabel('Senha', { exact: true }).fill('senha-errada-123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos')
  await page.getByRole('button', { name: 'Mostrar senha' }).click()
  await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'text')
})

test('pedido do site aparece no painel; status e observação persistem', async ({ page }) => {
  test.skip(!ADMIN_EMAIL, 'Defina E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD')
  await login(page)
  await expect(page.getByText('Total de solicitações')).toBeVisible()
  await page.getByRole('link', { name: /^Orçamentos/ }).first().click()
  await page.getByPlaceholder('Nome, telefone, veículo ou nº do pedido').fill(customer)
  const row = page.getByRole('row').filter({ hasText: customer })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Novo')
  await row.click()

  const sheet = page.getByRole('dialog')
  await expect(sheet).toContainText('Barulho metálico ao frear')
  await expect(sheet.getByRole('button', { name: 'Concluído' })).toHaveCount(0) // não pula etapas
  await sheet.getByRole('button', { name: 'Em contato' }).click()
  await expect(page.getByText('Status alterado para “Em contato”.')).toBeVisible()
  await sheet.getByLabel('Nova observação').fill('Cliente pediu retorno à tarde.')
  await sheet.getByRole('button', { name: 'Adicionar observação' }).click()
  await expect(sheet).toContainText('Cliente pediu retorno à tarde.')
  const waHref = await sheet.getByRole('link', { name: 'Abrir WhatsApp' }).getAttribute('href')
  expect(waHref).toMatch(/^https:\/\/wa\.me\/55\d{10,11}\?text=/)

  await page.reload()
  const sheet2 = page.getByRole('dialog')
  await expect(sheet2.getByText('Em contato').first()).toBeVisible()
  await expect(sheet2).toContainText('Cliente pediu retorno à tarde.')
  await expect(sheet2).toContainText('Novo → Em contato')
  await sheet2.getByRole('button', { name: 'Fechar' }).click()

  await page.getByRole('link', { name: 'Clientes' }).first().click()
  await page.getByPlaceholder('Pesquisar por nome ou telefone').fill(customer)
  await expect(page.getByText(customer)).toBeVisible()
  await page.getByRole('button', { name: 'Ver histórico' }).first().click()
  await expect(page.getByText('Volkswagen Golf TSI 2019')).toBeVisible()
})

test('serviço criado no painel aparece no site e some ao desativar', async ({ page }) => {
  test.skip(!ADMIN_EMAIL, 'Defina E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD')
  const name = `Polimento técnico ${stamp}`
  await login(page)
  await page.goto('/admin/servicos')
  await page.getByRole('button', { name: 'Novo serviço' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Salvar serviço' }).click()
  await expect(dialog.getByText('Informe o nome (mínimo 2 caracteres).')).toBeVisible()
  await dialog.getByLabel('Nome').fill(name)
  await dialog.getByLabel('Descrição').fill('Correção de pintura com acabamento profissional.')
  await dialog.getByLabel('Categoria').fill('Estética')
  await dialog.getByPlaceholder('Ex.: 189,90').fill('350,00')
  await dialog.getByPlaceholder('Ex.: a partir de').fill('a partir de')
  await dialog.getByRole('button', { name: 'Salvar serviço' }).click()
  await expect(page.getByText('Serviço criado e publicado no site.')).toBeVisible()

  await page.goto('/')
  const card = page.locator('#servicos li').filter({ hasText: name })
  await expect(card).toBeVisible()
  await expect(card).toContainText('R$ 350,00')

  await page.goto('/admin/servicos')
  const item = page.getByRole('listitem').filter({ hasText: name })
  await item.getByRole('button', { name: 'Desativar' }).click()
  await expect(item).toContainText('Inativo')
  await page.goto('/')
  await expect(page.locator('#servicos li').filter({ hasText: name })).toHaveCount(0)

  await page.goto('/admin/servicos')
  await page.getByRole('button', { name: `Excluir ${name}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir serviço' }).click()
  await expect(page.getByText('Serviço excluído.')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: name })).toHaveCount(0)
})

test('conteúdo editado persiste após recarregar e reflete no site', async ({ page }) => {
  test.skip(!ADMIN_EMAIL, 'Defina E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD')
  await login(page)
  await page.goto('/admin/conteudo')
  const title = page.getByLabel('Título principal')
  const original = await title.inputValue()
  await title.fill(`Precisão em cada detalhe ${stamp}.`)
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByText('Alterações salvas e publicadas no site.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Título principal')).toHaveValue(`Precisão em cada detalhe ${stamp}.`)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`Precisão em cada detalhe ${stamp}`)

  await page.goto('/admin/conteudo')
  await page.getByLabel('Título principal').fill(original)
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByText('Alterações salvas e publicadas no site.')).toBeVisible()

  // Validação: cor inválida não é salva
  await page.getByLabel('Cor em hexadecimal').fill('vermelho')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByText('Use uma cor no formato #RRGGBB.')).toBeVisible()
})

test('logout encerra a sessão e bloqueia o painel', async ({ page }) => {
  test.skip(!ADMIN_EMAIL, 'Defina E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD')
  await login(page)
  await page.getByRole('button', { name: 'Sair' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/admin\/login/)
  await page.goto('/admin/clientes')
  await expect(page).toHaveURL(/\/admin\/login/)
})

test.describe('celular', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })

  test('menu móvel, formulário e painel sem rolagem horizontal', async ({ page }) => {
    await page.goto('/')
    await noHorizontalScroll(page)
    await page.getByRole('button', { name: 'Abrir menu' }).click()
    await page.getByRole('navigation', { name: 'Menu móvel' }).getByRole('link', { name: /Contato/ }).click()
    await expect(page.getByRole('navigation', { name: 'Menu móvel' })).toHaveCount(0)
    await expect(page.locator('#contato')).toBeInViewport()
    await page.getByRole('button', { name: 'Abrir menu' }).click()
    await page.getByRole('navigation', { name: 'Menu móvel' }).getByRole('button', { name: 'Solicitar orçamento' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await noHorizontalScroll(page)

    if (!ADMIN_EMAIL) return
    await login(page)
    await noHorizontalScroll(page)
    await page.goto('/admin/orcamentos')
    await expect(page.getByRole('row')).toHaveCount(0) // tabela vira cartões
    await noHorizontalScroll(page)
  })
})
