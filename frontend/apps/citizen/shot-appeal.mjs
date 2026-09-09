import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The citizen's half of the defence (CONTRACT.md v0.17): reading the notice, writing the argument,
 * and afterwards reading the municipality's answer. Driven against the mock transport, which
 * mirrors the server's refusals, so the copy is exercised rather than assumed.
 *
 * Two fines are seeded: BHL019 with a defence still waiting, BNY963 with one already rejected. The
 * script walks both, because the interesting halves of the screen are different in each.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/citizen-appeal';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, locale: 'es-CR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND') && errors.push(m.text()));

const openFine = async (plate) => {
  await page.goto(indexUrl + '#/fines');
  await page.waitForTimeout(900);
  await page.locator(`text=${plate}`).last().click();
  await page.waitForTimeout(900);
};

await page.goto(indexUrl);
await page.waitForTimeout(700);
await page.fill('input[type="email"]', 'citizen@example.com');
await page.fill('input[type="password"]', 'Password123!');
await page.click('button[type="submit"]');
await page.waitForTimeout(1200);
const pick = page.locator('text=Municipalidad de San José').first();
if (await pick.count()) {
  await pick.click();
  await page.waitForTimeout(1000);
}

// ---- La lista ----
await page.goto(indexUrl + '#/fines');
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outDir}/01-fines.png`, fullPage: true });
const pendingText = await page.locator('body').innerText();

// ---- BHL019: descargo en trámite ----
await openFine('BHL019');
await page.screenshot({ path: `${outDir}/02-fine-appealed.png`, fullPage: true });
const appealedDetail = await page.locator('body').innerText();
await page.locator('button:has-text("Ver mi descargo")').first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/03-appeal-waiting.png`, fullPage: true });
const waitingText = await page.locator('body').innerText();

// ---- TEST01: sin descargo todavía — se escribe uno ----
await openFine('TEST01');
await page.locator('button:has-text("Presentar descargo")').first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/06-appeal-write.png`, fullPage: true });
const writeText = await page.locator('body').innerText();
const submitDisabledEmpty = await page
  .locator('button:has-text("Presentar descargo")')
  .last()
  .isDisabled()
  .catch(() => null);
await page.locator('textarea').fill('Ese día había pagado desde la app a las 9:12 y todavía me quedaba tiempo.');
await page.waitForTimeout(300);
const counter = await page.locator('.lx-textarea-count').first().innerText().catch(() => '');
await page.screenshot({ path: `${outDir}/07-appeal-written.png`, fullPage: true });
await page.locator('button:has-text("Presentar descargo")').last().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/08-appeal-just-filed.png`, fullPage: true });
const justFiled = await page.locator('body').innerText();

// ---- BNY963: descargo ya rechazado ----
await openFine('BNY963');
await page.screenshot({ path: `${outDir}/04-fine-rejected.png`, fullPage: true });
await page.locator('button:has-text("Ver mi descargo")').first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/05-appeal-rejected.png`, fullPage: true });
const rejectedText = await page.locator('body').innerText();

console.log('\n== descargo del ciudadano ==');
console.log('la multa con descargo en trámite aparece en Pendientes:', /BHL019/.test(pendingText));
console.log('el detalle ofrece leer el descargo ya presentado:', /Ver mi descargo/.test(appealedDetail));
console.log('en trámite lo dice y explica que no se cobra:', /todavía no resuelve/.test(waitingText));
console.log('ofrece agregar fotos mientras está abierto:', /Agregar foto/.test(waitingText));
console.log('dice cuántas fotos permite la municipalidad:', /de \d+ permitidas/.test(waitingText));
console.log('la multa sin descargo muestra el texto legal antes de escribir:', /Antes de escribir/.test(writeText));
console.log('y dice qué versión es:', /Versión \d+/.test(writeText));
console.log('el botón está bloqueado con el campo vacío:', submitDisabledEmpty);
console.log('contador de caracteres:', counter);
console.log('tras presentar, queda en trámite:', /todavía no resuelve/.test(justFiled));
console.log('el rechazado muestra la resolución:', /Resolución de la municipalidad/.test(rejectedText));
console.log('y el motivo textual de la municipalidad:', /SJ-CENTRO-014/.test(rejectedText));
console.log('el rechazado no ofrece agregar fotos:', !/Agregar foto/.test(rejectedText));
if (errors.length) console.log('ERRORS:', errors);

await page.close();
await browser.close();
