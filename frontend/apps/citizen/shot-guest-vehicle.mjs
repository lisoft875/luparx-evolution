import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Parking somebody else's car (CONTRACT.md v0.11), driven end to end against the mock transport:
 * pick "Otro vehículo", type a plate, choose the type, and check that the stay that comes back
 * carries the typed plate and no vehicle of the citizen's.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/guest-vehicle';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

for (const [width, height, tag] of [
  [390, 844, '390x844'],
  [320, 568, '320x568'],
]) {
  const page = await browser.newPage({ viewport: { width, height }, locale: 'es-CR' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND') && errors.push(m.text()));

  await page.goto(indexUrl);
  await page.waitForTimeout(600);
  await page.fill('input[type="email"]', 'citizen@example.com');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(900);
  const pick = page.locator('text=Municipalidad de San José').first();
  if (await pick.count()) {
    await pick.click();
    await page.waitForTimeout(900);
  }

  await page.click('nav[aria-label="primary"] >> text=Estacionar');
  await page.waitForTimeout(700);

  // The vehicle dropdown: last entry is the borrowed car.
  await page.click('[aria-label="Selecciona un vehículo"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/01-vehicle-options-${tag}.png` });
  await page.click('text=Otro vehículo');
  await page.waitForTimeout(400);

  // A lowercase plate with a dash: the app must show it the way the server will store it.
  await page.fill('input#\\:r0\\:, input[placeholder="BHL019"]', 'crc-742');
  await page.locator('input[placeholder="BHL019"]').blur();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/02-guest-plate-${tag}.png` });

  const plateShown = await page.locator('input[placeholder="BHL019"]').inputValue();

  // A free bay, and the summary.
  await page.fill('input[name="spaceCode"], input#spaceCode', '').catch(() => {});
  const spaceInput = page.locator('input').filter({ hasNot: page.locator('[placeholder="BHL019"]') }).first();
  await spaceInput.fill('LUP-0042');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/03-summary-${tag}.png`, fullPage: true });

  const summary = await page.locator('main').innerText();

  const submit = page.locator('button:has-text("Iniciar")').first();
  const canSubmit = (await submit.count()) > 0 && (await submit.isEnabled());
  if (canSubmit) {
    await submit.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${outDir}/04-after-start-${tag}.png` });
  }

  const home = await page.locator('body').innerText();

  console.log(`\n== ${tag} ==`);
  console.log('plate as shown after blur:', JSON.stringify(plateShown));
  console.log('summary vehicle line:', summary.split('\n').filter((l) => /Veh|CRC742|Otro/.test(l)).join(' | '));
  console.log('submit enabled:', canSubmit);
  console.log('home mentions CRC742:', home.includes('CRC742'));
  if (errors.length) console.log('ERRORS:', errors);
  await page.close();
}

await browser.close();
