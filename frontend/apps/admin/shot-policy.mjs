import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The parking policy (CONTRACT.md v0.18, simplified in v0.23): what the municipality sells and under
 * what rules. The floor and the ceiling are no longer fields — they are the first and last of the
 * durations on sale — so the contradiction the old warning existed to catch cannot be configured at
 * all. What this checks now is that the derived range is stated, that the list drives it, and that
 * the rules the server still enforces are answered in words before the request goes out.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/admin-policy';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, locale: 'es-CR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND') && errors.push(m.text()));

/** The number input under a field whose label matches exactly — "Tolerancia" must not find its hint. */
const numberByLabel = (label) =>
  page.locator('.lx-field', { has: page.getByText(new RegExp(`^${label}$`)) }).locator('input[type="number"]');

await page.goto(indexUrl);
await page.waitForTimeout(700);
await page.fill('input[type="email"]', 'admin@example.com');
await page.fill('input[type="password"]', 'Password123!');
await page.click('button[type="submit"]');
await page.waitForTimeout(1200);
const pick = page.locator('text=Municipalidad de San José').first();
if (await pick.count()) {
  await pick.click();
  await page.waitForTimeout(1000);
}

await page.getByRole('link', { name: 'Política de parqueo' }).first().click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outDir}/01-policy.png`, fullPage: true });
const initial = await page.locator('body').innerText();

// Agregar una duración nueva y ver que entra ordenada en la vista previa.
const addField = page.locator('.lx-field', { has: page.getByText(/^Minutos$/) }).first().locator('input');
await addField.fill('45');
await page.locator('button:has-text("Agregar")').first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/02-added.png`, fullPage: true });
const afterAdd = await page.locator('body').innerText();

// El rango se lee de la lista: quitar la duración más larga baja el techo.
const rangeText = async () => (await page.locator('body').innerText()).match(/se vende desde .* de una sola vez\./)?.[0] ?? '';
const rangeBefore = await rangeText();
// Dentro de la tarjeta de duraciones: la otra lista de minutos es la de extensiones y tiene sus
// propias fichas "Quitar".
const sessionCard = page.locator('.lx-card', { hasText: 'Duraciones que se venden' }).first();
await sessionCard.locator('button[aria-label^="Quitar"]').last().click();
await page.waitForTimeout(400);
const rangeAfter = await rangeText();
await page.screenshot({ path: `${outDir}/03-range.png`, fullPage: true });

// Guardar.
await page.locator('button:has-text("Guardar")').last().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/04-saved.png`, fullPage: true });
const afterSave = await page.locator('body').innerText();

// El techo con extensiones por debajo del máximo: el servidor lo rechaza y la pantalla lo dice antes.
await numberByLabel('Techo total con extensiones').fill('10');
await page.waitForTimeout(300);
await page.locator('button:has-text("Guardar")').last().click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/05-ceiling.png`, fullPage: true });
const ceilingText = await page.locator('body').innerText();

// Apagar "terminar antes" tiene que llevarse los minutos guardados con él.
await numberByLabel('Techo total con extensiones').fill('1440');
await page.locator('input[type="checkbox"]').nth(1).uncheck();
await page.waitForTimeout(400);
const creditBox = page.locator('input[type="checkbox"]').nth(2);
const creditChecked = await creditBox.isChecked();
const creditDisabled = await creditBox.isDisabled();
await page.screenshot({ path: `${outDir}/06-credit-off.png`, fullPage: true });

console.log('\n== política de parqueo ==');
console.log('la vista previa muestra la escalera del ciudadano:', /Lo que verá el ciudadano/.test(initial));
console.log('con las etiquetas del ciudadano (1 hora, no 60 min):', /1 hora/.test(initial));
console.log('la opción agregada entra ordenada:', /45 min/.test(afterAdd));
console.log('dice el rango que sale de la lista:', /se vende desde/.test(rangeBefore));
console.log('el rango sigue a la lista:', rangeBefore, '->', rangeAfter, '· cambió:', rangeBefore !== rangeAfter);
console.log('ya no hay campos de mínimo ni máximo:', !/La estadía más corta que se vende/.test(initial));
console.log('ni el aviso de opciones inalcanzables:', !/no podría usarlas/.test(initial));
console.log('guardó:', /Cambios guardados|guardad/i.test(afterSave));
console.log('rechaza el techo por debajo del máximo, nombrando la duración:', /no puede ser menor que .*, que es la estadía más larga/.test(ceilingText));
console.log('apagar terminar antes apaga los minutos guardados:', creditChecked === false, '· y los bloquea:', creditDisabled);
if (errors.length) console.log('ERRORS:', errors);

await page.close();
await browser.close();
