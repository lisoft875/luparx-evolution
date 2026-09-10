import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Espacios: corregir el código de una bahía (CONTRACT.md v0.25).
 *
 * Lo que hay que ver es que renombrar sea una corrección y no una bahía nueva: la fila es la misma,
 * conserva su estado, y el diálogo dice antes de que el operador escriba que lo ya cobrado no se
 * mueve. Y que las dos negativas del servidor —código tomado, formato inválido— lleguen a la
 * pantalla con su propio texto y no con el genérico.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/admin-spaces';
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
if (await pick.count()) { await pick.click(); await page.waitForTimeout(1000); }

await page.getByRole('link', { name: 'Espacios' }).first().click();
await page.waitForTimeout(900);
// La pantalla pide una zona antes de listar nada.
await page.locator('button', { hasText: 'Seleccione una zona' }).first().click().catch(() => {});
await page.waitForTimeout(300);
const zoneOption = page.locator('[role="option"], li, button').filter({ hasText: 'CENTRO' }).first();
if (await zoneOption.count()) { await zoneOption.click(); }
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/01-list.png`, fullPage: true });
const listed = await page.locator('body').innerText();

const firstRow = page.locator('tbody tr').first();
const originalCode = (await firstRow.locator('td').first().innerText()).trim();
const originalStatus = (await firstRow.locator('td').nth(1).innerText()).trim();

// Sacarla de servicio primero, para poder comprobar que renombrar no toca el estado.
await firstRow.locator('button', { hasText: 'Sacar de servicio' }).click();
await page.waitForTimeout(900);
const rowAfterToggle = page.locator('tbody tr', { hasText: originalCode }).first();
const statusBeforeRename = (await rowAfterToggle.locator('td').nth(1).innerText()).trim();

await rowAfterToggle.locator('button', { hasText: 'Editar código' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/02-dialog.png`, fullPage: true });
const dialog = await page.locator('.lx-modal').innerText();
const field = page.locator('.lx-modal input').first();
const prefilled = await field.inputValue();
const saveButton = page.locator('.lx-dialog-actions button').last();
const disabledUnchanged = await saveButton.isDisabled();

// 1. Un código ya tomado por otra bahía: el servidor responde 409 y la pantalla lo dice.
const secondCode = (await page.locator('tbody tr').nth(1).locator('td').first().innerText()).trim();
await field.fill(secondCode);
await saveButton.click();
await page.waitForTimeout(900);
const takenMessage = await page.locator('body').innerText();
await page.screenshot({ path: `${outDir}/03-taken.png`, fullPage: true });

// 2. Un código que no sigue el formato de la municipalidad: 422.
await field.fill('XX-1');
await saveButton.click();
await page.waitForTimeout(900);
const invalidMessage = await page.locator('body').innerText();

// 3. El renombre bueno.
const renamedCode = 'LUP-9412';
await field.fill(renamedCode);
await saveButton.click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/04-renamed.png`, fullPage: true });
const afterRename = await page.locator('body').innerText();
const renamedRow = page.locator('tbody tr', { hasText: renamedCode }).first();
const statusAfterRename = (await renamedRow.locator('td').nth(1).innerText()).trim();
const rowCount = await page.locator('tbody tr').count();
const oldStillListed = await page.locator('tbody tr', { hasText: originalCode }).count();

console.log('\n== espacios: editar el código de una bahía ==');
console.log('la descripción ya no dice que el código no se edita:', !/no se edita/.test(listed));
console.log('cada fila ofrece «Editar código»:', /Editar código/.test(listed));
console.log('el diálogo avisa ANTES del campo que es la misma bahía:',
  dialog.indexOf('Es la misma bahía') < dialog.indexOf('Código'));
console.log('y que lo ya cobrado conserva su código:', /siguen mostrando el código que tenían/.test(dialog));
console.log('el campo viene con el código actual:', prefilled === originalCode, `(${prefilled})`);
console.log('guardar está deshabilitado mientras el código no cambia:', disabledUnchanged);
console.log('un código tomado se refusa con su propio texto:', /Ya hay un espacio con ese código/.test(takenMessage));
console.log('un código fuera de formato, también:', /no tiene el formato de esta municipalidad/.test(invalidMessage));
console.log('tras renombrar aparece el código nuevo:', /LUP-9412/.test(afterRename));
console.log('y el viejo ya no está en la lista:', oldStillListed === 0, `(era ${originalCode})`);
console.log('es la MISMA fila, no una bahía nueva:', rowCount, 'filas');
console.log('conserva el estado que tenía:', statusAfterRename === statusBeforeRename,
  `(${originalStatus} → ${statusBeforeRename} → ${statusAfterRename})`);
console.log('el mensaje de éxito nombra la consecuencia:', /conserva el código anterior/.test(afterRename));
if (errors.length) console.log('ERRORS:', errors);

await page.close();
await browser.close();
