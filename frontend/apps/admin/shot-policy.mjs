import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The parking policy (CONTRACT.md v0.18): what the municipality sells and under what rules. The
 * interesting part is not the form, it is the preview and the warning — the screen has to say which
 * of the offered durations the rest of the policy makes unreachable, because nobody sees that
 * mistake until a citizen in the street cannot park.
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

/** The number input under a field whose label matches exactly — "Mínimo" must not find "Mínimo para que…". */
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

// Subir el mínimo por encima de una opción: la pantalla tiene que decir cuál queda inalcanzable.
await numberByLabel('Mínimo').fill('60');
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/03-unreachable.png`, fullPage: true });
const withUnreachable = await page.locator('body').innerText();

// Devolverlo y guardar.
await numberByLabel('Mínimo').fill('15');
await page.waitForTimeout(300);
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
console.log('avisa de las opciones inalcanzables:', /no podría usarlas/.test(withUnreachable));
console.log('y las nombra:', /45 min/.test(withUnreachable.split('no podría usarlas')[1] ?? ''));
console.log('guardó:', /Cambios guardados|guardad/i.test(afterSave));
console.log('rechaza el techo por debajo del máximo con una frase:', /no puede ser menor que el máximo/.test(ceilingText));
console.log('apagar terminar antes apaga los minutos guardados:', creditChecked === false, '· y los bloquea:', creditDisabled);
if (errors.length) console.log('ERRORS:', errors);

await page.close();
await browser.close();
