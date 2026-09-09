import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Tarifas (CONTRACT.md v0.21). The screen is the list of zones, and the thing it has to say out loud
 * is which of them have no price — a zone without an open rate window is one `start` refuses
 * (`PARKING_RATE_NOT_FOUND` on the wire), so a citizen standing there cannot park and nobody finds
 * out until they complain. The fixture leaves La Sabana unpriced for exactly that reason.
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
if (await pick.count()) {
  await pick.click();
  await page.waitForTimeout(1000);
}

await page.getByRole('link', { name: 'Tarifas' }).first().click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outDir}/01-zones.png`, fullPage: true });
const initial = await page.locator('body').innerText();
const zoneRows = await page.locator('tbody tr').allInnerTexts();

// Poner tarifa en la zona que no tiene: la acción vive en la fila de esa zona.
const setButton = page.locator('tbody tr', { hasText: 'SJ-SABANA' }).locator('button:has-text("Poner tarifa")');
await setButton.click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/02-dialog-new.png`, fullPage: true });
const dialogNew = await page.locator('.lx-modal').innerText();
const submit = () => page.locator('.lx-dialog-actions button').last();
const blockedEmpty = await submit().isDisabled();

await page.locator('.lx-modal input[type="number"]').first().fill('500');
await page.waitForTimeout(200);
await submit().click();
await page.waitForTimeout(1100);
await page.screenshot({ path: `${outDir}/03-priced.png`, fullPage: true });
const afterSet = await page.locator('body').innerText();

// Cambiar una que ya tiene: el diálogo dice qué se va a reemplazar.
await page.locator('tbody tr', { hasText: 'SJ-CENTRO' }).locator('button:has-text("Cambiar tarifa")').click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/04-dialog-change.png`, fullPage: true });
const dialogChange = await page.locator('.lx-modal').innerText();
const prefilledMinutes = await page.locator('.lx-modal input[type="number"]').nth(1).inputValue();
await page.locator('.lx-modal input[type="number"]').first().fill('700');
const changeLabel = await submit().innerText();
await submit().click();
await page.waitForTimeout(1100);
await page.screenshot({ path: `${outDir}/05-changed.png`, fullPage: true });
const historyRows = await page.locator('tbody').last().locator('tr').allInnerTexts();

console.log('\n== tarifas ==');
console.log('lista las tres zonas de la municipalidad:', /SJ-CENTRO/.test(initial) && /SJ-ESCALANTE/.test(initial) && /SJ-SABANA/.test(initial));
console.log('nombra las zonas sin tarifa arriba:', /no tienen tarifa vigente/.test(initial));
console.log('y dice qué pasa si se deja así:', /se le rechaza la estadía/.test(initial));
console.log('zonas:', zoneRows.map((r) => r.replace(/\n/g, ' | ')));
console.log('el bloque viaja con el precio (30 min vs 60 min):', /por 30 min/.test(initial) && /por 60 min/.test(initial));
console.log('el diálogo de una zona nueva no habla de reemplazo:', !/deja de regir/.test(dialogNew));
console.log('bloqueado sin monto:', blockedEmpty);
console.log('tras ponerla, la zona deja de estar sin tarifa:', !/SJ-SABANA[\s\S]{0,80}Sin tarifa/.test(afterSet));
console.log('el aviso desaparece cuando todas tienen precio:', !/no tienen tarifa vigente/.test(afterSet));
console.log('cambiar una existente dice qué se reemplaza:', /deja de regir/.test(dialogChange));
console.log('y trae el bloque de esa zona ya puesto:', prefilledMinutes);
console.log('el botón del diálogo dice lo mismo que el de la fila:', changeLabel);
console.log('el aviso ya no trae el código de error crudo:', !/PARKING_RATE_NOT_FOUND/.test(initial));
console.log('la ventana anterior queda en el historial:', historyRows.map((r) => r.replace(/\n/g, ' | ')));
if (errors.length) console.log('ERRORS:', errors);

await page.close();
await browser.close();
