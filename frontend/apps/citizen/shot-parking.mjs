import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/parking';

const sizes = [
  [390, 844, '390x844'],
  [320, 568, '320x568'],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

for (const [width, height, tag] of sizes) {
  const page = await browser.newPage({ viewport: { width, height }, locale: 'es-CR' });
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto(indexUrl);
  await page.waitForTimeout(600);

  // ---- Login ----
  await page.fill('input[type="email"]', 'citizen@example.com');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${outDir}/01-home-active-session-${tag}.png` });

  // ---- Vehicles list ----
  await page.click('nav[aria-label="primary"] >> text=Vehículos');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/02-vehicles-${tag}.png` });

  // ---- Vehicle form (add) ----
  await page.click('button:has-text("Agregar")');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/03-vehicle-form-${tag}.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // ---- Parking flow ----
  await page.click('nav[aria-label="primary"] >> text=Estacionar');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/04-parking-flow-${tag}.png` });

  // ---- Extend dialog (from Home) ----
  await page.click('nav[aria-label="primary"] >> text=Inicio');
  await page.waitForTimeout(400);
  const extendBtn = page.locator('button:has-text("Extender tiempo")').first();
  if (await extendBtn.count()) {
    await extendBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/05-extend-dialog-${tag}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  // ---- Finish confirmation ----
  const finishBtn = page.locator('button:has-text("Finalizar ahora")').first();
  if (await finishBtn.count()) {
    await finishBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/06-finish-confirm-${tag}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  // ---- Timer bar visible while navigating Inicio -> Vehículos -> Billetera ----
  await page.click('nav[aria-label="primary"] >> text=Billetera');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/07-wallet-${tag}.png` });

  console.log(tag, 'console/page errors:', consoleErrors.length ? consoleErrors.slice(0, 5).join(' | ') : 'none');
  await page.close();
}

await browser.close();
