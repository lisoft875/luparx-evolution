import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Exoneraciones (CONTRACT.md v0.28): el registro de placas que la municipalidad no multa. */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/admin-exemptions';
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

await page.getByRole('link', { name: 'Exoneraciones' }).first().click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outDir}/01-list.png`, fullPage: true });
const list = await page.locator('body').innerText();

await page.locator('button', { hasText: 'Exonerar una placa' }).first().click();
await page.waitForTimeout(600);
const dialog = await page.locator('.lx-modal').innerText();
await page.screenshot({ path: `${outDir}/02-dialog.png`, fullPage: true });

const field = (label) => page.locator('.lx-modal .lx-field', { hasText: label }).locator('input, textarea').first();
await field('Placa').fill('CL-1234');
await field('Motivo').fill('Segunda ambulancia');
await page.locator('.lx-dialog-actions button', { hasText: 'Guardar' }).click();
await page.waitForTimeout(1000);
const duplicate = await page.locator('body').innerText();

await field('Placa').fill('MUNI-07');
await field('Motivo').fill('Vehículo de la Municipalidad, recolección de residuos');
await page.locator('.lx-dialog-actions button', { hasText: 'Guardar' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/03-granted.png`, fullPage: true });
const after = await page.locator('body').innerText();

const row = page.locator('tbody tr', { hasText: 'MUNI07' }).first();
await row.locator('button', { hasText: 'Retirar' }).click();
await page.waitForTimeout(600);
const revokeDialog = await page.locator('.lx-modal').innerText();
await page.locator('.lx-modal textarea').fill('El vehículo salió de la flotilla');
await page.locator('.lx-dialog-actions button', { hasText: 'Retirar' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/04-revoked.png`, fullPage: true });
const revoked = await page.locator('body').innerText();

console.log('\n== exoneraciones ==');
console.log('la ambulancia sembrada aparece vigente:', /CL1234/.test(list) && /Vigente/.test(list));
console.log('y «sin vencimiento» se dice con palabras:', /Sin vencimiento/.test(list));
console.log('el diálogo explica por qué cuelga de la placa:', /casi nunca tienen cuenta/.test(dialog));
console.log('y advierte de una exoneración sin vencimiento:', /nadie la va a revisar/.test(dialog));
console.log('una placa ya exonerada se rechaza:', /ya tiene una exoneración vigente/.test(duplicate));
console.log('la nueva queda registrada:', /MUNI07/.test(after));
console.log('retirar advierte que la fila se conserva:', /La fila se conserva/.test(revokeDialog));
console.log('y tras retirarla queda con su motivo:', /El vehículo salió de la flotilla/.test(revoked) || /Exoneración retirada/.test(revoked));
if (errors.length) console.log('ERRORS:', errors);

await page.close();
await browser.close();
