import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Panel de funcionarios (CONTRACT.md v0.27): invitar, cambiar rol, y el último uso POR PUESTO.
 *
 * Lo que hay que ver:
 *  1. invitar a quien no existe —la municipalidad pone correo y puesto, nada más—, y que la
 *     invitación aparezca aparte de la plantilla, porque una promesa no es personal;
 *  2. que invitar a quien SÍ existe se rechace mandando a la búsqueda, que es el camino correcto;
 *  3. que cambiar el rol sólo ofrezca roles de la misma app, porque un rol pertenece a un portal;
 *  4. que el último uso sea el DEL PUESTO y que, cuando no hay, lo diga en vez de mentir «nunca».
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/admin-staff-panel';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1150 }, locale: 'es-CR' });
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
await page.waitForTimeout(1100);
await page.screenshot({ path: `${outDir}/01-panel.png`, fullPage: true });
const panel = await page.locator('body').innerText();

const combo = (label) => page.locator('.lx-modal .lx-field', { hasText: label }).locator('[role="combobox"]').first();
const field = (label) => page.locator('.lx-modal .lx-field', { hasText: label }).locator('input').first();
async function choose(label, optionText) {
  await combo(label).click();
  await page.waitForTimeout(300);
  await page.locator('[role="option"]', { hasText: optionText }).first().click();
  await page.waitForTimeout(300);
}

// --- 1. Invitar a alguien que no existe ------------------------------------------------------
await page.locator('button', { hasText: 'Agregar funcionario' }).first().click();
await page.waitForTimeout(500);
await page.locator('.lx-modal [role="combobox"]').first().click();
await page.waitForTimeout(300);
await page.locator('[role="option"]', { hasText: 'correo' }).first().click();
await page.waitForTimeout(300);
await field('Correo electrónico').fill('nueva.funcionaria@sanjose.go.cr');
await page.locator('.lx-modal button', { hasText: 'Buscar' }).last().click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/02-invite.png`, fullPage: true });
const inviteBranch = await page.locator('.lx-modal').innerText();
const prefilled = await page.locator('.lx-modal .lx-field', { hasText: 'Correo electrónico' })
  .locator('input').last().inputValue();
await choose('Rol', 'Fiscalizador');
await page.locator('.lx-modal button', { hasText: 'Invitar por correo' }).click();
await page.waitForTimeout(1400);
await page.screenshot({ path: `${outDir}/03-invited.png`, fullPage: true });
const afterInvite = await page.locator('body').innerText();

// --- 2. Invitar a quien ya tiene cuenta: se rechaza y dice qué hacer --------------------------
await page.locator('button', { hasText: 'Agregar funcionario' }).first().click();
await page.waitForTimeout(500);
await page.locator('.lx-modal [role="combobox"]').first().click();
await page.waitForTimeout(300);
await page.locator('[role="option"]', { hasText: 'correo' }).first().click();
await page.waitForTimeout(300);
await field('Correo electrónico').fill('desconocida@example.com');
await page.locator('.lx-modal button', { hasText: 'Buscar' }).last().click();
await page.waitForTimeout(900);
// El correo de una persona que sí existe, escrito en el campo de invitación.
await page.locator('.lx-modal .lx-field', { hasText: 'Correo electrónico' }).locator('input').last()
  .fill('citizen@example.com');
await choose('Rol', 'Finanzas');
await page.locator('.lx-modal button', { hasText: 'Invitar por correo' }).click();
await page.waitForTimeout(1100);
const refused = await page.locator('.lx-modal').innerText();
await page.screenshot({ path: `${outDir}/04-refused.png`, fullPage: true });
await page.locator('.lx-modal button[aria-label], .lx-modal button:has-text("×")').first().click().catch(() => {});
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

// --- 3. Cambiar el rol de un puesto ------------------------------------------------------------
const inspectorRow = page.locator('tbody tr', { hasText: 'inspector@example.com' }).first();
await inspectorRow.locator('button', { hasText: 'Cambiar rol' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/05-change-role.png`, fullPage: true });
const roleDialog = await page.locator('.lx-modal').innerText();
await page.locator('.lx-modal [role="combobox"]').first().click();
await page.waitForTimeout(400);
const offered = await page.locator('[role="option"]').allInnerTexts();
await page.locator('[role="option"]', { hasText: 'Jefe' }).first().click();
await page.waitForTimeout(300);
await page.locator('.lx-dialog-actions button', { hasText: 'Guardar' }).click();
await page.waitForTimeout(1300);
await page.screenshot({ path: `${outDir}/06-role-changed.png`, fullPage: true });
const afterRole = await page.locator('body').innerText();

console.log('\n== panel de funcionarios v0.27 ==');
console.log('la columna es «último uso del puesto»:', /ÚLTIMO USO DEL PUESTO/i.test(panel));
console.log('sin uso registrado NO dice «nunca»:', /Sin uso registrado/.test(panel) && !/Nunca ingres/.test(panel));
console.log('el diálogo de no-encontrado explica por qué invitar:', /complete sus propios datos|completa sus propios datos/.test(inviteBranch));
console.log('trae el correo buscado ya escrito:', prefilled === 'nueva.funcionaria@sanjose.go.cr', `(${prefilled})`);
console.log('avisa que el enlace vence en 14 días:', /14 días/.test(inviteBranch));
console.log('deja «crear expediente» como opción secundaria:', /Crear expediente nuevo/.test(inviteBranch));
console.log('tras invitar lo confirma con correo y rol:', /Invitación enviada a nueva.funcionaria@sanjose.go.cr/.test(afterInvite));
// Los encabezados de tabla van en versalitas por CSS: innerText devuelve el texto ya transformado.
console.log('la invitación aparece en su propia tabla:', /Invitaciones/.test(afterInvite) && /puesto ofrecido/i.test(afterInvite));
console.log('y dice que no da acceso por sí sola:', /no da acceso/.test(afterInvite));
console.log('se puede reenviar y retirar:', /Enviar de nuevo/.test(afterInvite) && /Retirar/.test(afterInvite));
console.log('invitar a quien ya tiene cuenta se rechaza con el camino correcto:',
  /ya tiene cuenta/.test(refused) && /sin volver a pedirle sus datos/.test(refused));
console.log('cambiar rol dice que es dentro de la misma app:', /misma aplicación/.test(roleDialog));
console.log('y sólo ofrece roles de esa app:', offered.map((o) => o.split('\n')[0]));
console.log('tras cambiarlo la fila muestra el rol nuevo:', /Jefe de fiscalización/.test(afterRole));

// --- 4. El enlace de la invitación, del lado de quien lo recibe -------------------------------
await page.goto(indexUrl + '#/invitation/tok-nueva.funcionaria@sanjose.go.cr');
await page.waitForTimeout(1400);
await page.screenshot({ path: `${outDir}/07-accept.png`, fullPage: true });
const accept = await page.locator('body').innerText();

// Un enlace muerto tiene que decirlo ANTES de que alguien llene el formulario.
await page.goto(indexUrl + '#/invitation/tok-no-existe');
await page.waitForTimeout(1200);
const dead = await page.locator('body').innerText();
await page.screenshot({ path: `${outDir}/08-dead-link.png`, fullPage: true });

console.log('el invitado ve de qué municipalidad y qué puesto:', /Municipalidad de San José/.test(accept) && /Fiscalizador/.test(accept));
console.log('y a qué dirección se le mandó:', /nueva.funcionaria@sanjose.go.cr/.test(accept));
console.log('NO hay campo de correo que llenar:', !/Correo electrónico/.test(accept));
console.log('sí hay cédula, dirección y contraseña propia:', /documento/i.test(accept) && /Contraseña/.test(accept));
console.log('dice que la contraseña es suya y la municipalidad no la ve:', /no la conoce ni puede verla/.test(accept));
console.log('un enlace muerto lo dice antes de pedir nada:', /ya no está disponible/.test(dead) && !/Contraseña/.test(dead));
if (errors.length) console.log('ERRORS:', errors);

await page.close();
await browser.close();
