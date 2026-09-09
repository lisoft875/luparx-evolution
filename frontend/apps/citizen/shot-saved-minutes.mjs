import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The saved minutes as the first duration (CONTRACT.md v0.12). The fixture citizen has 12 saved
 * minutes in San José against increments of 30/60/120 — below the municipality's own minimum, which
 * is exactly the case the rule exists for.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/saved-minutes';
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
  await page.waitForTimeout(900);

  // A car that is not already parked: the fixture's first vehicle has a running stay, and
  // SESSION_ALREADY_ACTIVE_FOR_VEHICLE would mask what this script is actually checking.
  await page.click('[aria-label="Selecciona un vehículo"]');
  await page.waitForTimeout(300);
  await page.locator('[role="option"]').nth(1).click();
  await page.waitForTimeout(300);

  // The duration dropdown, open: its order is the whole point.
  await page.click('[aria-label="Tiempo"], [aria-label="Duración"], [aria-label="Tiempo de estacionamiento"]').catch(async () => {
    await page.getByRole('button', { name: /minuto|hora/i }).first().click();
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/01-duration-options-${tag}.png` });

  const optionTexts = await page.locator('[role="option"]').allInnerTexts();

  // Choose it: the whole point is that a duration the municipality never published is accepted,
  // priced at zero, and actually starts a stay.
  await page.locator('[role="option"]').first().click();
  await page.waitForTimeout(500);
  const spaceInput = page.locator('input').first();
  await spaceInput.fill('LUP-0044');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${outDir}/02-saved-selected-${tag}.png`, fullPage: true });
  const summary = await page.locator('main').innerText();

  const submit = page.locator('button:has-text("Iniciar")').first();
  const started = (await submit.count()) > 0 && (await submit.isEnabled());
  if (started) {
    await submit.click();
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${outDir}/03-after-start-${tag}.png` });
  }
  const home = await page.locator('body').innerText();
  console.log('started with saved minutes:', started, '· home shows a running stay:', /Estacionamiento activo/.test(home));

  console.log(`\n== ${tag} ==`);
  console.log('options in order:', optionTexts.map((s) => s.replace(/\n/g, ' / ')));
  console.log(
    'summary duration/total lines:',
    summary
      .split('\n')
      .filter((l) => /Total|Duración|minuto/i.test(l))
      .join(' | '),
  );
  if (errors.length) console.log('ERRORS:', errors);
  await page.close();
}

await browser.close();
