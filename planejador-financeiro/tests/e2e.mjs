// Teste ponta a ponta no navegador: node tests/e2e.mjs <url-base> <pasta-de-screenshots>
// Cria uma conta nova, faz a configuração inicial e usa os fluxos principais no iPhone,
// confere números pela API, persistência (sair/entrar e outro aparelho) e layout no iPad e no computador.
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright'); // Playwright instalado globalmente no ambiente
import assert from 'node:assert/strict';

const BASE = process.argv[2] || 'http://localhost:8787';
const OUT = process.argv[3] || '.';
const USER = `teste${Date.now().toString(36)}`;
const PASS = 'frase-secreta-17';

const browser = await chromium.launch();
const errors = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/409|400|Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const data = (page) => page.evaluate(() => fetch('/api/data').then((r) => r.json()));
const modal = (page) => page.locator('.modal').last();
const closeModals = async (page) => { while (await page.locator('.modal').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); } };
const overflowAll = async (page, label) => {
  const out = {};
  for (const pg of ['inicio', 'movimentacoes/lista', 'movimentacoes/calendario', 'movimentacoes/fixos', 'movimentacoes/mes', 'plano/organizar', 'plano/acompanhar', 'plano/assistente', 'plano/revisao', 'plano/cenarios', 'metas', 'perfil', 'perfil/contas', 'perfil/categorias', 'perfil/fixos', 'perfil/dados', 'perfil/aprender']) {
    await page.goto(`${BASE}/#/${pg}`);
    await page.waitForTimeout(250);
    // Mede contra a largura real da tela: se algo for largo demais, o navegador "afasta o zoom" e innerWidth cresce.
    out[pg] = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth) - screen.width);
    if (['inicio', 'plano/organizar', 'movimentacoes/lista', 'metas', 'perfil'].includes(pg)) await shot(page, `${label}-${pg.replace('/', '-')}`);
  }
  return out;
};

const phone = await browser.newContext({ ...devices['iPhone 13'] });
const p = await phone.newPage();
watch(p);
const result = {};
try {
  // ---------- cadastro e configuração inicial
  await p.goto(BASE);
  await p.getByRole('radio', { name: 'Criar conta' }).click();
  await p.getByLabel('Nome de usuário').fill(USER);
  await p.getByLabel('Senha', { exact: true }).fill(PASS);
  await p.getByLabel('Repita a senha').fill(PASS);
  await p.getByRole('button', { name: 'Criar conta' }).click();
  await p.getByText('Seus códigos de recuperação').waitFor();
  assert.equal((await p.locator('.codes div').allTextContents()).length, 8);
  await p.getByRole('checkbox').check();
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.getByLabel('Como quer ser chamado(a)?').fill('Duda');
  await p.getByLabel('Data de nascimento').fill('2009-03-10');
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.locator('.money-input input').fill('350');
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.getByRole('radio', { name: 'Sim' }).click();
  await p.locator('.money-input input').fill('500');
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.getByRole('radio', { name: 'Sim' }).click();
  await p.locator('.money-input input').fill('400');
  await p.getByLabel('Dia previsto').fill('5');
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.getByLabel('Frase da meta').fill('Quero ter R$10.000 quando completar 20 anos');
  await p.getByRole('button', { name: 'Entender' }).click();
  await p.getByLabel('Do que já está guardado', { exact: false }).fill('300');
  await p.getByLabel('Quanto quer ter na reserva?').fill('1000');
  await p.getByRole('button', { name: 'Concluir' }).click();

  // ---------- início: quatro números com explicação
  await p.getByText('Posso gastar').first().waitFor();
  for (const l of ['Posso gastar', 'Tenho agora', 'Já comprometido', 'Preciso guardar']) await p.getByText(l, { exact: true }).first().waitFor();
  await p.getByRole('button', { name: 'O que é “Posso gastar”?' }).click();
  await p.getByText('Tenho agora R$ 350,00').waitFor();
  await shot(p, '01-inicio-celular');

  // ---------- gasto com categoria criada na hora + desfazer
  await p.getByRole('button', { name: /Registrar entrada, gasto/ }).click();
  await shot(p, '02-botao-mais');
  await p.getByRole('button', { name: /Gasto/ }).first().click();
  await modal(p).locator('.money-input input').first().fill('12');
  await p.getByRole('button', { name: '+ Nova categoria' }).click();
  await p.getByLabel('Nome').last().fill('Namorada');
  await p.getByRole('radio', { name: '🌹' }).click();
  await shot(p, '03-nova-categoria');
  await p.getByRole('button', { name: 'Salvar categoria' }).click();
  await p.getByRole('radio', { name: /Namorada/ }).waitFor();
  assert.equal(await p.getByRole('radio', { name: /Namorada/ }).getAttribute('aria-checked'), 'true');
  await p.getByRole('button', { name: 'Salvar gasto' }).click();
  await p.getByRole('button', { name: 'Desfazer' }).click();
  await p.waitForTimeout(700);
  let d = await data(p);
  assert.equal(d.transactions.filter((t) => t.kind === 'despesa').length, 0, 'desfazer apagou o gasto');
  const namorada = d.categories.find((c) => c.name === 'Namorada');
  assert.ok(namorada);

  // ---------- categorias: editar, reordenar, arquivar
  await p.goto(`${BASE}/#/perfil/categorias`);
  await p.getByRole('button', { name: 'Subir Namorada' }).click();
  await p.waitForTimeout(400);
  const row = p.locator('.item', { hasText: 'Patinete' });
  await row.getByRole('button', { name: 'Editar' }).click();
  await p.getByLabel('Limite por mês', { exact: false }).fill('60');
  await p.getByRole('button', { name: 'Salvar categoria' }).click();
  await p.waitForTimeout(400);
  await p.locator('.item', { hasText: 'Compras' }).getByRole('button', { name: 'Arquivar' }).click();
  await p.waitForTimeout(500);
  d = await data(p);
  assert.equal(d.categories.find((c) => c.name === 'Patinete').monthly_limit_cents, 6000);
  assert.equal(d.categories.find((c) => c.name === 'Compras').archived, true);
  const order = d.categories.filter((c) => !c.archived).map((c) => c.name);
  assert.ok(order.indexOf('Namorada') < order.indexOf('Outros'), 'reordenou');
  await shot(p, '04-categorias');

  // ---------- rendas e despesas fixas
  await p.goto(`${BASE}/#/perfil/fixos`);
  await p.locator('.card', { hasText: 'Rendas fixas' }).getByRole('button', { name: '+ Adicionar' }).click();
  await p.getByLabel('Nome').fill('Freela');
  await modal(p).locator('.money-input input').fill('50');
  await modal(p).getByLabel('Frequência').selectOption('semanal');
  await p.getByRole('button', { name: 'Salvar' }).click();
  await p.waitForTimeout(500);
  await p.locator('.card', { hasText: 'Despesas fixas' }).getByRole('button', { name: '+ Adicionar' }).click();
  await p.getByLabel('Nome').fill('Celular');
  await modal(p).locator('.money-input input').fill('45');
  await modal(p).getByText('Mais detalhes').click();
  await modal(p).getByText('O valor varia', { exact: false }).click();
  await p.getByRole('button', { name: 'Salvar' }).click();
  await p.waitForTimeout(500);
  d = await data(p);
  assert.equal(d.recurrences.filter((r) => r.kind === 'receita').length, 2, 'duas rendas fixas');
  assert.equal(d.recurrences.find((r) => r.description === 'Celular').estimated, true);
  await shot(p, '05-fixos');

  // ---------- entrada prevista confirmada sem duplicar
  await p.goto(`${BASE}/#/inicio`);
  await p.getByRole('button', { name: /Registrar entrada, gasto/ }).click();
  await p.getByRole('button', { name: /Entrada/ }).first().click();
  await modal(p).locator('.money-input input').first().fill('20');
  await p.getByRole('radio', { name: 'Ainda vou receber' }).click();
  await p.getByLabel('De onde veio?').fill('Pix da tia');
  await p.getByRole('button', { name: 'Salvar', exact: true }).click();
  await p.waitForTimeout(500);
  await closeModals(p);
  const before = (await data(p)).transactions.filter((t) => t.kind === 'receita').length;
  await p.locator('.item', { hasText: 'Pix da tia' }).getByRole('button', { name: 'Recebi' }).click();
  await p.waitForTimeout(700);
  d = await data(p);
  assert.equal(d.transactions.filter((t) => t.kind === 'receita').length, before, 'confirmar não duplicou');
  assert.equal(d.transactions.find((t) => t.description === 'Pix da tia').status, 'realizado');

  // ---------- organizar meu dinheiro
  await p.goto(`${BASE}/#/plano/organizar`);
  await p.getByText('Disponível para distribuir').waitFor();
  await shot(p, '06-organizar');
  const valInput = p.getByLabel('Valor para Namorada');
  await valInput.fill('40');
  await valInput.press('Enter');
  await p.waitForTimeout(300);
  assert.equal(await p.locator('.budget-row', { hasText: 'Namorada' }).getByRole('button', { name: /Fixado/ }).count(), 1);
  await p.getByRole('button', { name: 'Revisar e salvar plano' }).click();
  await shot(p, '07-confirmar-plano');
  await p.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await p.waitForTimeout(800);
  d = await data(p);
  assert.ok(d.plan, 'plano salvo');
  const planTotal = d.plan.items.reduce((s, i) => s + i.amount_cents, 0);
  assert.ok(planTotal <= d.plan.available_cents, 'plano não passa do disponível');
  assert.equal(d.plan.items.find((i) => i.ref_id === namorada.id).amount_cents, 4000);

  // ---------- gasto consome o orçamento e sai do saldo uma vez
  const balBefore = d.accounts.find((a) => a.name === 'Conta principal');
  await p.getByRole('button', { name: /Registrar entrada, gasto/ }).click();
  await p.getByRole('button', { name: /Gasto/ }).first().click();
  await modal(p).locator('.money-input input').first().fill('15');
  await p.getByRole('radio', { name: /Namorada/ }).click();
  await p.getByText('No seu plano, “Namorada” tem R$ 40,00 restantes').waitFor();
  await p.getByRole('button', { name: 'Salvar gasto' }).click();
  await p.waitForTimeout(600);
  await p.goto(`${BASE}/#/plano/acompanhar`);
  await p.getByText('R$ 15,00 de R$ 40,00').waitFor();
  await p.getByText('Restam R$ 25,00').waitFor();
  await shot(p, '08-acompanhar');
  d = await data(p);
  const spent = d.transactions.filter((t) => t.kind === 'despesa' && t.status === 'realizado').reduce((s, t) => s + t.amount_cents, 0);
  assert.equal(spent, 1500, 'gasto registrado uma vez');
  assert.ok(balBefore);

  // ---------- assistente
  await p.goto(`${BASE}/#/plano/assistente`);
  await p.getByRole('listitem').filter({ hasText: 'fim de semana' }).click();
  await p.locator('.answer .main').waitFor();
  result.fimDeSemana = await p.locator('.answer .main').textContent();
  assert.match(result.fimDeSemana, /R\$/);
  await p.getByRole('listitem').filter({ hasText: 'Recebi R$' }).click();
  await p.getByLabel('Valor').fill('100');
  await p.getByRole('button', { name: 'Registrar e separar' }).click();
  await shot(p, '09-assistente-previa');
  const recBefore = (await data(p)).transactions.filter((t) => t.kind === 'receita').length;
  await p.getByRole('button', { name: 'Confirmar' }).click();
  await p.waitForTimeout(700);
  assert.equal((await data(p)).transactions.filter((t) => t.kind === 'receita').length, recBefore + 1);
  await p.getByRole('listitem').filter({ hasText: 'namorada' }).click();
  await p.locator('.answer .main').waitFor();
  result.namorada = await p.locator('.answer .main').textContent();

  // ---------- plano desatualizado depois da entrada nova: recalcular pede confirmação
  await p.goto(`${BASE}/#/plano/organizar`);
  await p.getByText('Seu plano salvo está desatualizado', { exact: false }).waitFor();
  const planId = (await data(p)).plan.id;
  await p.getByRole('button', { name: 'Revisar e salvar plano' }).click();
  await p.getByText('Isto substitui o plano salvo', { exact: false }).waitFor();
  await closeModals(p);
  assert.equal((await data(p)).plan.id, planId, 'não substituiu sem confirmar');

  // ---------- telas pequenas: nenhuma página com rolagem lateral
  result.overflowPhone = await overflowAll(p, '10-celular');

  // ---------- sair e entrar de novo
  await p.goto(`${BASE}/#/perfil`);
  await p.getByRole('button', { name: /Sair/ }).click();
  await p.getByRole('button', { name: 'Entrar' }).waitFor();
  await p.getByLabel('Nome de usuário').fill(USER);
  await p.getByLabel('Senha', { exact: true }).fill(PASS);
  await p.getByRole('button', { name: 'Entrar' }).click();
  await p.getByText('Posso gastar').first().waitFor();
  d = await data(p);
  assert.ok(d.plan && d.categories.some((c) => c.name === 'Namorada'), 'dados mantidos após sair e entrar');

  // ---------- iPad e computador (outro aparelho)
  for (const [label, ctxOpts] of [['ipad', devices['iPad (gen 7)']], ['desktop', { viewport: { width: 1366, height: 900 } }]]) {
    const ctx = await browser.newContext(ctxOpts);
    const q = await ctx.newPage();
    watch(q);
    await q.goto(BASE);
    await q.getByLabel('Nome de usuário').fill(USER.toUpperCase());
    await q.getByLabel('Senha', { exact: true }).fill(PASS);
    await q.getByRole('button', { name: 'Entrar' }).click();
    await q.getByText('Posso gastar').first().waitFor();
    result[`overflow_${label}`] = await overflowAll(q, `11-${label}`);
    await ctx.close();
  }
  console.log(JSON.stringify({ user: USER, ...result, errors }, null, 2));
  for (const k of ['overflowPhone', 'overflow_ipad', 'overflow_desktop']) assert.ok(Object.values(result[k]).every((v) => v <= 0), `sem rolagem horizontal (${k})`);
  assert.deepEqual(errors, []);
} catch (e) {
  await p.screenshot({ path: `${OUT}/zz-falha.png`, fullPage: true }).catch(() => {});
  console.error('Erros da página:', errors, result);
  throw e;
} finally {
  await browser.close();
}
