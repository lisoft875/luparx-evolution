import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * A municipal administrator creating an inspector (CONTRACT.md v0.14), driven end to end against
 * the mock transport: the button, the role list, the §2 fields, and the account that comes back —
 * pending until the person chooses their own password.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/create-inspector';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, locale: 'es-CR' });
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
await page.screenshot({ path: `${outDir}/00-after-login.png` });

// Users list → the new button.
await page.goto(indexUrl + '#/users');
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/01-users-list.png` });
const hasCta = (await page.locator('button:has-text("Crear usuario")').count()) > 0;
if (hasCta) {
  await page.click('button:has-text("Crear usuario")');
  await page.waitForTimeout(900);
}
await page.screenshot({ path: `${outDir}/02-create-form.png`, fullPage: true });

// The role list is the whole point of the "hasta dónde" decision.
let roleOptions = [];
const roleSelect = page.locator('button[role="combobox"], [role="combobox"]').first();
if (await roleSelect.count()) {
  await roleSelect.click();
  await page.waitForTimeout(400);
  roleOptions = await page.locator('[role="option"]').allInnerTexts();
  await page.screenshot({ path: `${outDir}/03-role-options.png` });
  const inspector = page.locator('[role="option"]', { hasText: 'Fiscalizador' }).first();
  if (await inspector.count()) await inspector.click();
  await page.waitForTimeout(400);
}

// Fill it in as an administrator would, and submit: the point is that an account comes back and
// that it is not usable until the person chooses a password.
/** Exact label match: "País" and "País emisor del documento" are different fields. */
function fieldByLabel(labelText) {
  return page
    .locator('.lx-field')
    .filter({ has: page.locator('label', { hasText: new RegExp(`^${labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\(opcional\\))?$`) }) })
    .first();
}

async function pickField(labelText, optionText) {
  const field = fieldByLabel(labelText);
  // The cascading lists (province → canton → district) are fetched when the level above changes,
  // so the option is waited for rather than assumed present the instant the list opens.
  // Close whatever list the previous pick left open: a click meant for this trigger would land on
  // that list instead, and the failure looks like "the option never appeared".
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await field.locator('[role="combobox"]').first().scrollIntoViewIfNeeded();
  await field.locator('[role="combobox"]').first().click();
  const option = page.locator('[role="option"]', { hasText: optionText }).first();
  try {
    await option.waitFor({ state: 'visible', timeout: 3000 });
  } catch {
    // One retry: a click that lands while another list is still closing does nothing at all.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await field.locator('[role="combobox"]').first().click();
  }
  try {
    await option.waitFor({ state: 'visible', timeout: 8000 });
  } catch (e) {
    await page.screenshot({ path: `${outDir}/zz-stuck-${labelText.replace(/\W+/g, '-')}.png`, fullPage: true });
    console.log(`stuck on "${labelText}" → "${optionText}"; options present:`, await page.locator('[role="option"]').allInnerTexts());
    throw e;
  }
  await option.click();
  await page.waitForTimeout(400);
}
async function type(labelText, value) {
  await fieldByLabel(labelText).locator('input').first().fill(value);
}

await type('Correo electrónico', 'fiscalizador.nuevo@sanjose.go.cr');
await type('Nombre', 'Marta');
await type('Primer apellido', 'Rojas');
await pickField('País emisor del documento', 'Costa Rica');
await type('Número de documento', '112340567');
await pickField('País', 'Costa Rica');
await page.screenshot({ path: `${outDir}/03b-after-country.png`, fullPage: true });
console.log('address fields visible:', await page.locator('.lx-field label').allInnerTexts());
await pickField('Provincia', 'San José');
await pickField('Cantón', 'Central');
await pickField('Distrito', 'Carmen');
await type('Dirección (línea 1)', '100 m norte del parque');
await pickField('Número de teléfono', '+506');
const phoneField = fieldByLabel('Número de teléfono');
await phoneField.locator('input').last().fill('88887777');
await pickField('Nacionalidad', 'Costa Rica');
await page.locator('input[type="date"]').first().fill('1990-05-14');
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/04-filled.png`, fullPage: true });

await page.click('button:has-text("Crear y enviar el correo")');
await page.waitForTimeout(1400);
await page.screenshot({ path: `${outDir}/05-created.png`, fullPage: true });

const bodyText = await page.locator('body').innerText();
const landedOnDetail = /Detalle|Usuario|Marta/i.test(bodyText);
console.log('after submit — on the new user\'s record:', landedOnDetail);
console.log('record says pending verification:', /PENDING_VERIFICATION|Pendiente/i.test(bodyText));
console.log('record shows the inspector role:', /INSPECTOR|Fiscalizador/i.test(bodyText));

console.log('\n== admin · crear inspector ==');
console.log('users list offers the button:', hasCta);
console.log('roles offered:', roleOptions.map((s) => s.replace(/\n/g, ' / ')));
console.log('form mentions a password is NOT set here:', /contraseña/i.test(bodyText));
console.log('form asks for the §2 fields:', ['Identificación', 'Provincia', 'Teléfono', 'nacimiento'].filter((f) => new RegExp(f, 'i').test(bodyText)));
if (errors.length) console.log('ERRORS:', errors);

await page.close();
await browser.close();
