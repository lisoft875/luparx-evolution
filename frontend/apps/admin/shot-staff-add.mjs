import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Agregar funcionario: buscar a alguien que ya existe y darle el puesto (CONTRACT.md v0.26).
 *
 * Lo que hay que ver es lo que antes no tenía salida: María Rodríguez ya está registrada como
 * ciudadana de San José, así que crearla otra vez es imposible —la cédula es única en la
 * plataforma—. Con esto se la busca por cédula, se confirma que es ella, y se le da el puesto de
 * fiscalizadora sobre la MISMA cuenta. Y las tres cosas que hacen segura la consulta: coincidencia
 * exacta, correo enmascarado, y ni una palabra sobre las otras municipalidades de la persona.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/admin-staff-add';
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

await page.getByRole('link', { name: 'Funcionarios' }).first().click();
await page.waitForTimeout(1000);
const staffBefore = await page.locator('tbody tr').count();
await page.screenshot({ path: `${outDir}/01-staff.png`, fullPage: true });
const listed = await page.locator('body').innerText();

await page.locator('button', { hasText: 'Agregar funcionario' }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/02-dialog.png`, fullPage: true });
const dialog = await page.locator('.lx-modal').innerText();

const field = (label) => page.locator('.lx-modal .lx-field', { hasText: label }).locator('input').first();
const combo = (label) => page.locator('.lx-modal .lx-field', { hasText: label }).locator('[role="combobox"]').first();

async function choose(label, optionText) {
  await combo(label).click();
  await page.waitForTimeout(300);
  await page.locator('[role="option"]', { hasText: optionText }).first().click();
  await page.waitForTimeout(300);
}

// 1. Nadie con esa cédula: la otra respuesta normal, y ofrece abrir el expediente.
await choose('País emisor', 'Costa Rica');
await choose('Tipo de documento', 'Cédula');
await field('Número de documento').fill('999999999');
await page.locator('.lx-modal button', { hasText: 'Buscar' }).last().click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/03-not-found.png`, fullPage: true });
const notFound = await page.locator('.lx-modal').innerText();

// 2. La cédula de María, escrita CON GUIONES: el servidor la normaliza igual que al registrarla.
await field('Número de documento').fill('1-0987-0123');
await page.locator('.lx-modal button', { hasText: 'Buscar' }).last().click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/04-found.png`, fullPage: true });
const found = await page.locator('.lx-modal').innerText();

// 3. Darle el puesto de fiscalizadora.
await choose('Rol', 'Fiscalizador');
await page.locator('.lx-modal button', { hasText: 'Dar acceso' }).click();
await page.waitForTimeout(1400);
await page.screenshot({ path: `${outDir}/05-granted.png`, fullPage: true });
const after = await page.locator('body').innerText();
const staffAfter = await page.locator('tbody tr').count();

// 4. Un segundo puesto en la MISMA app: la escalera de un puesto por aplicación, dicha en pantalla.
await page.locator('button', { hasText: 'Agregar funcionario' }).first().click();
await page.waitForTimeout(500);
// El selector de criterio va con aria-label y no dentro de un .lx-field: es el primero del diálogo.
await page.locator('.lx-modal [role="combobox"]').first().click();
await page.waitForTimeout(300);
await page.locator('[role="option"]', { hasText: 'correo' }).first().click();
await page.waitForTimeout(300);
await field('Correo electrónico').fill('citizen@example.com');
await page.locator('.lx-modal button', { hasText: 'Buscar' }).last().click();
await page.waitForTimeout(900);
const second = await page.locator('.lx-modal').innerText();
await combo('Rol').click();
await page.waitForTimeout(400);
const roleOptions = await page.locator('[role="option"]').allInnerTexts();
const inspectorDisabled = await page
  .locator('[role="option"]', { hasText: 'Fiscalizador' })
  .first()
  .getAttribute('aria-disabled');
await page.screenshot({ path: `${outDir}/06-app-taken.png`, fullPage: true });

console.log('\n== agregar funcionario: buscar a quien ya existe ==');
console.log('el botón de la pantalla abre la búsqueda, no el formulario:', /Agregar funcionario/.test(listed));
console.log('el diálogo explica por qué se busca primero:', /ya tiene cuenta porque se registró como ciudadana/.test(dialog));
console.log('avisa que es dato exacto y no un buscador por partes:', /no es un buscador por partes/.test(dialog));
console.log('sin coincidencia ofrece abrir el expediente:', /Nadie en la plataforma tiene ese dato/.test(notFound) && /Crear expediente nuevo/.test(notFound));
console.log('encuentra la cédula escrita con guiones:', /María Rodríguez/.test(found));
console.log('el correo llega enmascarado:', /ci\*\*\*@example\.com/.test(found), '·', (found.match(/\S*\*\*\*\S*/) ?? [''])[0]);
console.log('NO dice nada de sus otras municipalidades:', !/Escazú/.test(found));
console.log('dice qué tiene hoy en ESTA municipalidad:', /Ciudadan|Todavía no tiene/.test(found));
console.log('explica un puesto por aplicación:', /Un puesto por aplicación/.test(dialog + found));
console.log('tras dar el acceso lo confirma nombrando el rol:', /ahora es Fiscalizador/.test(after));
console.log('y dice que se le avisó por correo:', /avisó por correo/.test(after));
console.log('la fila nueva aparece en la lista:', staffBefore, '→', staffAfter);
console.log('la segunda vez ya se ve el puesto que tiene:', /Fiscalizador/.test(second));
console.log('y el rol de esa misma app queda deshabilitado:', inspectorDisabled);
console.log('opciones de rol ofrecidas:', roleOptions.map((r) => r.replace(/\n/g, ' · ')));
if (errors.length) console.log('ERRORS:', errors);

await page.close();
await browser.close();
