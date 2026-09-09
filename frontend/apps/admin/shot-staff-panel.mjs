import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The staff administration panel (CONTRACT.md v0.15), driven against the mock transport: the list
 * with role, status, sectors and last access; assigning sectors; and deactivating somebody — which
 * has to say, where the button is, that neither the account nor the record of their acts is touched.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/staff-panel';
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

await page.getByRole('link', { name: 'Funcionarios' }).first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/01-staff-list.png`, fullPage: true });

const headers = await page.locator('th').allInnerTexts();
const firstRow = await page.locator('tbody tr').first().innerText().catch(() => '');

// Sectors: the dialog says out loud that ticking nothing means everywhere.
const zonesButton = page.locator('button:has-text("Sectores")').first();
let zonesDialog = '';
if (await zonesButton.count()) {
  await zonesButton.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/02-zones-dialog.png` });
  zonesDialog = await page.locator('.lx-modal').first().innerText();
  const box = page.locator('.lx-modal input[type="checkbox"]').first();
  if (await box.count()) {
    await box.check();
    await page.locator('.lx-modal button:has-text("Guardar")').first().click();
    await page.waitForTimeout(900);
  } else {
    await page.keyboard.press('Escape');
  }
  await page.screenshot({ path: `${outDir}/03-after-zones.png`, fullPage: true });
}

// Deactivating: the sentence about the history is the requirement, so it is asserted.
let suspendDialog = '';
const suspendButton = page.locator('button:has-text("Desactivar")').first();
if (await suspendButton.count()) {
  await suspendButton.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/04-suspend-dialog.png` });
  suspendDialog = await page.locator('.lx-modal').first().innerText();
  await page.locator('.lx-modal input').first().fill('Licencia sin goce de salario');
  await page.locator('.lx-modal button:has-text("Desactivar")').first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${outDir}/05-after-suspend.png`, fullPage: true });
}

const afterSuspend = await page.locator('body').innerText();

console.log('\n== panel de funcionarios ==');
console.log('columns:', headers);
console.log('first row:', firstRow.replace(/\n/g, ' | '));
console.log('zones dialog says empty means everywhere:', /toda la municipalidad/i.test(zonesDialog));
console.log('suspend dialog keeps the record:', /se conservan|no se toca/i.test(suspendDialog));
console.log('row now reads suspended:', /Suspendido/.test(afterSuspend));
console.log('reactivate is offered:', (await page.locator('button:has-text("Reactivar")').count()) > 0);
if (errors.length) console.log('ERRORS:', errors);

await page.close();
await browser.close();
