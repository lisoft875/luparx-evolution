import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** El registro de consultas de fiscalización (CONTRACT.md v0.29). */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/admin-checks';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: 'es-CR' });
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

await page.getByRole('link', { name: 'Consultas' }).first().click();
await page.waitForTimeout(1100);
await page.screenshot({ path: `${outDir}/01-checks.png`, fullPage: true });
const body = await page.locator('body').innerText();
const rows = await page.locator('tbody tr').count();

// Filtrar por resultado: sólo las que no tenían pago.
await page.locator('[role="combobox"]').last().click();
await page.waitForTimeout(400);
await page.locator('[role="option"]', { hasText: 'Sin pago' }).first().click();
await page.waitForTimeout(1000);
const filtered = await page.locator('tbody tr').count();
await page.screenshot({ path: `${outDir}/02-filtered.png`, fullPage: true });

console.log('\n== registro de fiscalización ==');
console.log('la pantalla lista las consultas:', rows, 'filas');
console.log('dice quién consultó:', /Ana Vargas/.test(body));
console.log('la placa como se tecleó, cuando difiere:', /aaa-111/.test(body));
console.log('el resultado, incluido un rechazo:', /Rechazada \(ZONE_NOT_ASSIGNED\)/.test(body));
console.log('la acción que siguió:', /Emitió boleta/.test(body) && /Sólo consultó/.test(body));
console.log('distingue «sin señal» de «no concedida»:', /Sin señal en ese momento/.test(body) && /Ubicación no concedida/.test(body));
console.log('y muestra las coordenadas cuando las hubo:', /9\.93210/.test(body));
console.log('avisa de la retención en la pantalla:', /Se conservan 12 meses/.test(body));
console.log('filtrar por resultado acota:', rows, '→', filtered);
if (errors.length) console.log('ERRORS:', errors);

await page.close();
await browser.close();
