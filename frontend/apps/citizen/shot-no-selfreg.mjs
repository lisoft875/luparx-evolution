import { chromium } from 'playwright';
import fs from 'node:fs';

/**
 * Self-registration is the citizen portal's only (CONTRACT.md v0.13). Checks the three things that
 * have to hold together: the citizen login still offers "Crear cuenta", the admin and inspector
 * logins do not, and a deep link to /register on those two lands on the login screen instead of a
 * form. (The transport's own refusal is not exercised from here: the mock is installed inside the
 * app as its fetch implementation, not on `window`, so a probe from the page would only prove that
 * `file://` has no server.)
 */
const outDir = '/home/claude/previews/no-selfreg';
fs.mkdirSync(outDir, { recursive: true });

const apps = [
  ['citizen', '/home/claude/luparx-evolution/frontend/apps/citizen/dist-preview/index.html', true],
  ['admin', '/home/claude/luparx-evolution/frontend/apps/admin/dist-preview/index.html', false],
  ['inspector', '/home/claude/luparx-evolution/frontend/apps/inspector/dist-preview/index.html', false],
  ['platform', '/home/claude/luparx-evolution/frontend/apps/platform/dist-preview/index.html', false],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

for (const [name, file, expectLink] of apps) {
  if (!fs.existsSync(file)) {
    console.log(`\n== ${name} == (no preview build, skipped)`);
    continue;
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'es-CR' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('file://' + file);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/${name}-login.png` });
  const loginText = await page.locator('body').innerText();
  const hasLink = /Crear cuenta/i.test(loginText);

  // A stale bookmark of the removed route.
  await page.goto('file://' + file + '#/register');
  await page.waitForTimeout(700);
  const afterDeepLink = await page.locator('body').innerText();
  const showsForm = /Crear cuenta|Registro|Nombre completo/i.test(afterDeepLink) && !/Iniciar sesión/i.test(afterDeepLink);

  console.log(`\n== ${name} ==`);
  console.log('login offers "Crear cuenta":', hasLink, `(expected ${expectLink})`, hasLink === expectLink ? 'OK' : 'MISMATCH');
  console.log('#/register shows a registration form:', showsForm);
  if (errors.length) console.log('ERRORS:', errors);
  await page.close();
}

await browser.close();
