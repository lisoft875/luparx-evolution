import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Modo fiscalizador (CONTRACT.md v0.28): los estados que faltaban y los datos que no se mostraban.
 *
 * Lo que hay que ver:
 *  1. EXONERADO —la ambulancia—, resuelto ANTES que cualquier cosa sobre el pago, y con el motivo
 *     a la vista para que el funcionario pueda decir en voz alta por qué no está multando;
 *  2. VENCIDO como estado propio, con la hora de inicio, la de vencimiento CON FECHA y cuánto hace,
 *     que hasta ahora se veía igual que «nunca pagó»;
 *  3. VIGENTE dentro de la tolerancia, explicada en pantalla en vez de ser una contradicción;
 *  4. que sin bahía no se ofrezca emitir la boleta, porque el servidor se negó a responder.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/inspector-lookup';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
// El tamaño de un teléfono, que es donde vive esta app.
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-CR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND') && errors.push(m.text()));

await page.goto(indexUrl);
await page.waitForTimeout(700);
await page.fill('input[type="email"]', 'inspector@example.com');
await page.fill('input[type="password"]', 'Password123!');
await page.click('button[type="submit"]');
await page.waitForTimeout(1400);
const pick = page.locator('text=Municipalidad de San José').first();
if (await pick.count()) { await pick.click(); await page.waitForTimeout(1200); }
await page.screenshot({ path: `${outDir}/01-landing.png`, fullPage: true });
const landing = await page.locator('body').innerText();

const plateField = page.locator('.lx-field', { hasText: 'Placa' }).locator('input').first();
const bayField = page.locator('.lx-field', { hasText: 'Bahía' }).locator('input').first();
const zoneCombo = page.locator('.lx-field', { hasText: 'Zona' }).locator('[role="combobox"]').first();

async function chooseZone(name) {
  await zoneCombo.click();
  await page.waitForTimeout(350);
  await page.locator('[role="option"]', { hasText: name }).first().click();
  await page.waitForTimeout(300);
}
async function lookup(plate, bay) {
  await plateField.fill(plate);
  await bayField.fill(bay ?? '');
  await page.locator('button', { hasText: 'Consultar' }).first().click();
  await page.waitForTimeout(1100);
  return page.locator('body').innerText();
}

// El catálogo de zonas ahora viene del servidor, así que el desplegable tiene zonas en un
// dispositivo que nunca escribió una boleta.
const zoneOptionsBefore = await (async () => {
  await zoneCombo.click();
  await page.waitForTimeout(400);
  const options = await page.locator('[role="option"]').allInnerTexts();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  return options;
})();

await chooseZone('Centro');

// 1. EXONERADO: la ambulancia. Con bahía, para ver que la exoneración gana igual: se resuelve
// ANTES que cualquier cosa sobre el pago.
const exempt = await lookup('CL-1234', 'LUP-0001');
await page.screenshot({ path: `${outDir}/02-exempt.png`, fullPage: true });

// 2. VENCIDO: pagó por esta misma bahía y se le venció hace doce minutos.
const expired = await lookup('CRC880', 'LUP-0002');
await page.screenshot({ path: `${outDir}/03-expired.png`, fullPage: true });

// 3. VIGENTE, con hora de inicio y vencimiento con fecha.
const covered = await lookup('BHL019', 'LUP-0001');
await page.screenshot({ path: `${outDir}/04-covered.png`, fullPage: true });

// 4. Sin bahía, con estadías: el servidor se niega a responder y la pantalla no ofrece la boleta.
// Se recarga para dejar la zona sin escoger: el cliente se niega a mandar media pareja, así que
// con una zona puesta nunca se llega a AMBIGUOUS.
await page.goto(indexUrl);
await page.waitForTimeout(1400);
const ambiguous = await lookup('BHL019', '');
await page.screenshot({ path: `${outDir}/05-ambiguous.png`, fullPage: true });

// 5. SIN PAGO: nada, nunca.
const notCovered = await lookup('XYZ999', 'LUP-0001');
await page.screenshot({ path: `${outDir}/06-not-covered.png`, fullPage: true });

console.log('\n== modo fiscalizador v0.28 ==');
console.log('el desplegable de zonas ya viene lleno del servidor:', zoneOptionsBefore.length > 0, zoneOptionsBefore);
console.log('EXONERADO aparece como estado propio:', /Exonerado/.test(exempt));
console.log('  y dice el motivo para poder explicarlo:', /Ambulancia de la Cruz Roja/.test(exempt));
console.log('  con el documento que lo respalda:', /Acuerdo municipal 2026-014/.test(exempt));
console.log('  y que no vence, con esas palabras:', /sin fecha de vencimiento/i.test(exempt));
console.log('  no ofrece emitir boleta:', !/Emitir boleta/.test(exempt));
console.log('VENCIDO aparece como estado propio:', /Pago vencido/.test(expired));
console.log('  distinguido de «nunca pagó»:', /distinto de no haber pagado nunca/.test(expired));
console.log('  con la hora de inicio, que antes no se mostraba nunca:', /Inició:/.test(expired));
console.log('  y con cuánto hace que venció:', /Venció hace \d+ min/.test(expired));
console.log('  sí ofrece emitir boleta:', /Emitir boleta/.test(expired));
console.log('VIGENTE muestra inicio, vencimiento y zona:', /Pago vigente/.test(covered) && /Inició:/.test(covered) && /Zona: Centro/.test(covered));
console.log('  y cuánto le queda:', /Le quedan \d+ min/.test(covered));
console.log('AMBIGUO no ofrece emitir boleta:', /Falta la bahía/.test(ambiguous) && !/Emitir boleta/.test(ambiguous));
console.log('  y dice por qué:', /el sistema no sabe todavía si este carro pagó/.test(ambiguous));
console.log('SIN PAGO sigue existiendo y sí ofrece boleta:', /Sin pago vigente/.test(notCovered) && /Emitir boleta/.test(notCovered));
if (errors.length) console.log('ERRORS:', errors);

await page.close();
await browser.close();
