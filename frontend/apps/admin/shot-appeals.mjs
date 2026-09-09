import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The moderation queue (CONTRACT.md v0.17): reading a defence whole and deciding it with a reason.
 * Driven against the mock transport, which refuses a second decision on the same case exactly as
 * the server does, so the screen is exercised against the rule and not against a forgiving mock.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/admin-appeals';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'es-CR' });
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

await page.getByRole('link', { name: 'Descargos' }).first().click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outDir}/01-queue.png`, fullPage: true });
const queueRows = await page.locator('tbody tr').allInnerTexts();

// Leer el descargo entero. El botón de decidir vive aquí y no en la fila, a propósito.
await page.locator('button:has-text("Leer")').first().click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${outDir}/02-read.png`, fullPage: true });
const readText = await page.locator('.lx-modal').innerText();

// Rechazar: el motivo es obligatorio, y el botón está bloqueado hasta que se escriba.
await page.locator('.lx-modal button:has-text("Rechazar")').first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/03-decide.png`, fullPage: true });
const decideText = await page.locator('.lx-modal').last().innerText();
const blockedWithoutReason = await page
  .locator('.lx-modal')
  .last()
  .locator('button:has-text("Rechazar")')
  .isDisabled();

await page.locator('.lx-modal').last().locator('textarea').fill(
  'La fotografía adjunta a la boleta muestra el vehículo fuera del horario que usted indica. La multa se mantiene.',
);
await page.waitForTimeout(300);
const enabledWithReason = await page
  .locator('.lx-modal')
  .last()
  .locator('button:has-text("Rechazar")')
  .isEnabled();
await page.screenshot({ path: `${outDir}/04-reason.png`, fullPage: true });
await page.locator('.lx-modal').last().locator('button:has-text("Rechazar")').click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/05-resolved.png`, fullPage: true });
const afterResolve = await page.locator('body').innerText();

// La cola vacía y la vista de todos los estados.
const emptyQueue = await page.locator('body').innerText();
await page.locator('[role="combobox"]').first().click();
await page.waitForTimeout(400);
await page.locator('[role="option"]:has-text("Todos los estados")').first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/06-all.png`, fullPage: true });
const allRows = await page.locator('tbody tr').allInnerTexts();

console.log('\n== cola de descargos ==');
console.log('la cola trae los descargos en trámite:', queueRows.map((r) => r.replace(/\n/g, ' | ')));
console.log('la lectura muestra el descargo entero:', /revisen la hora de la boleta/.test(readText));
console.log('y la versión del texto legal que aceptó:', /Texto legal v\d+/.test(readText));
console.log('el diálogo dice a dónde va el motivo:', /lo lee el ciudadano/.test(decideText));
console.log('bloqueado sin motivo:', blockedWithoutReason, '· habilitado con motivo:', enabledWithReason);
console.log('confirma en una frase:', /se mantiene|sin efecto/.test(afterResolve));
console.log('la cola queda vacía y lo dice:', /No hay descargos esperando/.test(emptyQueue));
console.log('con “todos los estados” aparecen los resueltos:', allRows.map((r) => r.replace(/\n/g, ' | ')));
if (errors.length) console.log('ERRORS:', errors);

await page.close();
await browser.close();
