// Teste ponta a ponta no navegador: node tests/e2e.mjs <url-base> <pasta-de-screenshots>
// Cria uma conta nova, passa pela configuração inicial, registra movimentações,
// confere persistência (recarregar e outro "aparelho") e largura em tela pequena.
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
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const money = async (page, label, value) => page.getByLabel(label, { exact: false }).first().fill(value);

const phone = await browser.newContext({ ...devices['iPhone 13'] });
const p = await phone.newPage();
watch(p);
try {
await p.goto(BASE);
await p.getByRole('radio', { name: 'Criar conta' }).click();
await p.getByLabel('Nome de usuário').fill(USER);
await p.getByLabel('Senha', { exact: true }).fill(PASS);
await p.getByLabel('Repita a senha').fill(PASS);
await shot(p, '01-cadastro');
await p.getByRole('button', { name: 'Criar conta' }).click();
await p.getByText('Seus códigos de recuperação').waitFor();
const codes = await p.locator('.codes div').allTextContents();
assert.equal(codes.length, 8);
await shot(p, '02-codigos');
await p.getByRole('checkbox').check();
await p.getByRole('button', { name: 'Continuar' }).click();

// Configuração inicial
await p.getByLabel('Como quer ser chamado(a)?').fill('Duda');
await p.getByLabel('Data de nascimento').fill('2009-03-10');
await p.getByRole('button', { name: 'Continuar' }).click();
await p.locator('.money-input input').fill('350');
await shot(p, '03-onboarding-saldo');
await p.getByRole('button', { name: 'Continuar' }).click();
await p.getByRole('radio', { name: 'Sim' }).click();
await p.locator('.money-input input').fill('500');
await p.getByRole('button', { name: 'Continuar' }).click();
await p.getByRole('radio', { name: 'Sim' }).click();
await p.locator('.money-input input').fill('400');
await p.getByLabel('Dia previsto').fill('5');
await p.getByRole('button', { name: 'Continuar' }).click();
await p.getByRole('radio', { name: 'Sim' }).click();
await p.locator('.money-input input').fill('200');
await p.getByRole('button', { name: 'Continuar' }).click();
await p.getByRole('button', { name: '+ Adicionar conta fixa' }).click();
await p.getByLabel('Nome', { exact: true }).fill('Spotify');
await p.locator('.money-input input').fill('21,90');
await p.getByLabel('Dia do vencimento').fill('10');
await p.getByRole('button', { name: 'Continuar' }).click();
await p.getByRole('button', { name: 'Continuar' }).click();
await p.getByLabel('Frase da meta').fill('Quero ter R$10.000 quando completar 20 anos');
await p.getByRole('button', { name: 'Entender' }).click();
assert.equal(await p.getByLabel('Idade').inputValue(), '20');
await p.getByText('Prazo: 10/03/2029').waitFor();
await money(p, 'Do que já está guardado', '300');
await money(p, 'Quanto quer ter na reserva?', '1000');
await shot(p, '04-onboarding-meta');
await p.getByRole('button', { name: 'Concluir' }).click();

// Início
await p.getByRole('heading', { name: 'Início' }).waitFor();
await p.getByText('Você pode gastar').waitFor();
const livre1 = await p.locator('.big-value').first().textContent();
await shot(p, '05-inicio-celular');
// Spotify vence dia 10, depois do período (até a véspera da mesada), então não entra.
// Aportes do 1º mês são proporcionais aos dias restantes do mês; o valor deve ser positivo e ≤ 350.
assert.match(livre1, /^R\$\s?\d/);

// Recebi R$ 20 e confirmo a divisão sugerida
await p.getByRole('group', { name: 'Ações rápidas' }).getByRole('button', { name: /Recebi/ }).click();
await p.locator('.modal .money-input input').first().fill('20');
await p.getByLabel('Origem').fill('Pix da tia');
await p.getByRole('button', { name: 'Salvar', exact: true }).click();
await p.getByText('Sugestão de divisão').waitFor();
await shot(p, '06-divisao');
await p.getByRole('button', { name: 'Confirmar separação' }).click();
await p.locator('.modal').waitFor({ state: 'detached' });

// Gastei R$ 35 em namoro
await p.getByRole('group', { name: 'Ações rápidas' }).getByRole('button', { name: /Gastei/ }).click();
await p.locator('.modal .money-input input').first().fill('35');
await p.getByRole('radio', { name: /Namoro e passeios/ }).click();
await p.getByLabel('Descrição').fill('Cinema');
await p.getByRole('button', { name: 'Salvar', exact: true }).click();
await p.locator('.modal').waitFor({ state: 'detached' });

// Posso comprar? (simulação não registra)
await p.getByRole('button', { name: 'Posso comprar isso?' }).first().click();
await p.locator('.modal .money-input input').fill('1000');
await p.getByText('Não cabe').waitFor();
await shot(p, '07-posso-comprar');
await p.getByRole('button', { name: 'Fechar' }).click();

await p.getByRole('button', { name: 'Como chegamos nesse valor?' }).click();
const calc = await p.locator('.calc').first().innerText();
await shot(p, '08-calculo');

// Persistência: recarregar
await p.reload();
await p.getByText(/Você pode gastar|Seu orçamento está negativo/).waitFor();
const livre2 = await p.locator('.big-value').first().textContent();

// Largura em tela pequena em todas as páginas
const overflow = {};
for (const pg of ['inicio', 'lancamentos', 'metas', 'dinheiro', 'plano', 'aprender', 'conta']) {
  await p.goto(`${BASE}/#/${pg}`);
  await p.waitForTimeout(300);
  overflow[pg] = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await shot(p, `10-${pg}-celular`);
}
await p.goto(`${BASE}/#/lancamentos`);
await p.getByRole('radio', { name: 'Calendário' }).click();
await shot(p, '11-calendario');

// Outro aparelho: desktop, novo contexto (sem cookies)
const desk = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const d = await desk.newPage();
watch(d);
await d.goto(BASE);
await d.getByLabel('Nome de usuário').fill(USER.toUpperCase());
await d.getByLabel('Senha', { exact: true }).fill(PASS);
await d.getByRole('button', { name: 'Entrar' }).click();
await d.getByRole('heading', { name: 'Início' }).waitFor();
const livre3 = await d.locator('.big-value').first().textContent();
await shot(d, '12-inicio-desktop');
await d.goto(`${BASE}/#/metas`);
await d.waitForTimeout(300);
await shot(d, '13-metas-desktop');
await d.goto(`${BASE}/#/plano`);
await d.waitForTimeout(300);
await shot(d, '14-plano-desktop');
await d.locator('html').evaluate((el) => { el.dataset.theme = 'claro'; });
await d.goto(`${BASE}/#/inicio`);
await d.waitForTimeout(300);

console.log(JSON.stringify({ user: USER, livre1, livre2, livre3, calc, overflow, errors }, null, 2));
assert.equal(livre2, livre3, 'mesmo valor em outro aparelho');
assert.ok(Object.values(overflow).every((v) => v <= 0), 'sem rolagem horizontal no celular');
assert.deepEqual(errors, []);
} catch (e) {
  await p.screenshot({ path: `${OUT}/zz-falha.png`, fullPage: true }).catch(() => {});
  console.error('Erros da página:', errors);
  throw e;
} finally {
  await browser.close();
}
