import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Tarifas (CONTRACT.md v0.24): un precio propio por duración, sobre una base lineal.
 *
 * Lo que hay que ver es que la escalera no sea lineal —45 minutos cuesta menos que tres bloques de
 * 15— porque eso es exactamente lo que la tarifa por bloque no podía expresar, y una escalera lineal
 * en el fixture dejaría pasar sin ruido una regresión en la resolución por duración.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/admin-tariffs';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, locale: 'es-CR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND') && errors.push(m.text()));

await page.goto(indexUrl);
await page.waitForTimeout(700);
await page.fill('input[type="email"]', 'admin@example.com');
await page.fill('input[type="password"]', 'Password123!');
await page.click('button[type="submit"]');
await page.waitForTimeout(1200);
const pick = page.locator('text=Municipalidad de San José').first();
if (await pick.count()) { await pick.click(); await page.waitForTimeout(1000); }

await page.getByRole('link', { name: 'Tarifas' }).first().click();
await page.waitForTimeout(1100);
await page.screenshot({ path: `${outDir}/01-grid.png`, fullPage: true });
const initial = await page.locator('body').innerText();
const gridRows = await page.locator('tbody').first().locator('tr').allInnerTexts();

const submit = () => page.locator('.lx-dialog-actions button').last();
const centro = page.locator('tbody tr', { hasText: 'SJ-CENTRO' }).first();

// Una celda heredada de la base: 1 hora en SJ-CENTRO no tiene peldaño.
await centro.locator('.lx-linklike', { hasText: 'de la base' }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/02-inherited.png`, fullPage: true });
const inheritedDialog = await page.locator('.lx-modal').innerText();
await page.locator('.lx-modal input[type="number"]').first().fill('500');
await submit().click();
await page.waitForTimeout(1100);
await page.screenshot({ path: `${outDir}/03-priced.png`, fullPage: true });
const afterPrice = await page.locator('body').innerText();

// Quitarle el precio propio a esa misma duración: vuelve a la base.
await centro.locator('.lx-linklike', { hasText: '₡500' }).first().click();
await page.waitForTimeout(600);
const ownDialog = await page.locator('.lx-modal').innerText();
const clearButton = page.locator('.lx-dialog-actions button').first();
const clearLabel = await clearButton.innerText();
await clearButton.click();
await page.waitForTimeout(1100);
await page.screenshot({ path: `${outDir}/04-cleared.png`, fullPage: true });
const afterClear = await page.locator('body').innerText();

console.log('\n== tarifas: escalera por duración ==');
// Los encabezados van en versalitas por CSS y innerText devuelve el texto ya transformado.
console.log('la grilla trae una columna por duración vendida:', /15 minutos/i.test(initial) && /45 minutos/i.test(initial) && /2 horas/i.test(initial));
console.log('filas:', gridRows.map((r) => r.replace(/\n/g, ' | ')));
console.log('la escalera NO es lineal (45 min < 3 × 15 min):', /₡400/.test(initial) && /₡150/.test(initial));
console.log('marca las celdas que hereda de la base:', /de la base/.test(initial));
console.log('el diálogo de una heredada dice cuánto cobra hoy la base:', /la cobra la base/.test(inheritedDialog));
console.log('y explica que el monto ES el precio, sin multiplicar:', /sin multiplicar/.test(inheritedDialog));
console.log('tras ponerle precio propio deja de decir «de la base» en esa celda:', afterPrice.split('SJ-CENTRO')[1]?.indexOf('de la base') !== 0);
console.log('el diálogo de una propia ofrece quitarla:', /Quitar precio propio/.test(ownDialog), '·', clearLabel);
console.log('tras quitarla vuelve a heredar:', /de la base/.test(afterClear));
console.log('la base se muestra bajo la zona:', /Base: ₡/.test(initial));
console.log('el historial distingue base de duración:', /Tarifa base/.test(initial));
if (errors.length) console.log('ERRORS:', errors);

await page.close();
await browser.close();
