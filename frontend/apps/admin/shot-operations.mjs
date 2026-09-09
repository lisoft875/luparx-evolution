import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Zones and their bays (CONTRACT.md v0.16). Driven against the mock transport, which mirrors the
 * server's refusals so the screens' copy is exercised rather than assumed. Tariffs moved to their
 * own script when that screen was rebuilt around the list of zones (v0.21): see shot-tariffs.mjs.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/admin-operations';
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

// ---- Zonas ----
await page.getByRole('link', { name: 'Zonas' }).first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/01-zones.png`, fullPage: true });
const zoneRow = await page.locator('tbody tr').first().innerText().catch(() => '');

// Crear una zona, y comprobar que el código repetido se rechaza con una frase y no con un código.
await page.click('button:has-text("Crear zona")');
await page.waitForTimeout(500);
await page.locator('.lx-modal input').nth(0).fill('SJ-CENTRO');
await page.locator('.lx-modal input').nth(1).fill('Duplicada');
await page.locator('.lx-modal button:has-text("Guardar")').click();
await page.waitForTimeout(800);
const duplicateMessage = await page.locator('body').innerText();
await page.locator('.lx-modal input').nth(0).fill('SJ-SUR');
await page.locator('.lx-modal input').nth(1).fill('Zona Sur');
await page.locator('.lx-modal button:has-text("Guardar")').click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/02-zone-created.png`, fullPage: true });
const afterCreate = await page.locator('body').innerText();

// ---- Espacios ----
await page.getByRole('link', { name: 'Espacios' }).first().click();
await page.waitForTimeout(800);
const beforeZonePick = await page.locator('body').innerText();
await page.locator('[role="combobox"]').first().click();
await page.waitForTimeout(400);
await page.locator('[role="option"]').first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/03-spaces.png`, fullPage: true });
const spaceRows = await page.locator('tbody tr').allInnerTexts();

// Sacar de servicio la primera bahía.
const outOfService = page.locator('button:has-text("Sacar de servicio")').first();
let toggled = false;
if (await outOfService.count()) {
  await outOfService.click();
  await page.waitForTimeout(900);
  toggled = true;
  await page.screenshot({ path: `${outDir}/04-space-out-of-service.png`, fullPage: true });
}

console.log('\n== operación municipal ==');
console.log('zonas — primera fila:', zoneRow.replace(/\n/g, ' | '));
console.log('código repetido rechazado con una frase:', /Ya hay otra zona con ese código/.test(duplicateMessage));
console.log('zona creada aparece en la lista:', /SJ-SUR/.test(afterCreate));
console.log('espacios pide escoger zona primero:', /Escoja una zona/.test(beforeZonePick));
console.log('espacios:', spaceRows.map((s) => s.replace(/\n/g, ' | ')));
console.log('sacada de servicio:', toggled);
if (errors.length) console.log('ERRORS:', errors);

await page.close();
await browser.close();
