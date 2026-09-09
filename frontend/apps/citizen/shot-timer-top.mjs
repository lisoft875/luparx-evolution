import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + path.join(here, 'dist-preview', 'index.html');
const outDir = '/home/claude/previews/timer-top';
fs.mkdirSync(outDir, { recursive: true });

const sizes = [
  [390, 844, '390x844'],
  [320, 568, '320x568'],
  [1280, 900, 'desktop'],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

for (const [width, height, tag] of sizes) {
  const page = await browser.newPage({ viewport: { width, height }, locale: 'es-CR' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(indexUrl);
  await page.waitForTimeout(600);
  await page.fill('input[type="email"]', 'citizen@example.com');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  // Login lands on the municipality picker (CONTRACT.md v0.4) before any screen renders.
  const pick = page.locator('text=Municipalidad de San José').first();
  if (await pick.count()) {
    await pick.click();
    await page.waitForTimeout(1000);
  }

  // 1. Home — app bar + timer bar under it.
  await page.screenshot({ path: `${outDir}/01-home-${tag}.png` });

  // 2. A bare tab-root screen (no app bar): the timer bar is the top chrome by itself.
  await page.click('nav[aria-label="primary"] >> text=Vehículos');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/02-vehicles-${tag}.png` });

  // At rest the bar must sit in flow, above `main`, covering nothing.
  const atRest = await page.evaluate(() => {
    const bar = document.querySelector('.lx-sticky-timer-bar');
    const main = document.querySelector('main');
    if (!bar || !main) return { present: false };
    const b = bar.getBoundingClientRect();
    const m = main.getBoundingClientRect();
    return { present: true, barTop: Math.round(b.top), barBottom: Math.round(b.bottom), mainTop: Math.round(m.top), overlapsMain: b.bottom > m.top + 1 };
  });

  // 3. Scrolled: the bar must still be pinned to the top of the viewport.
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/03-vehicles-scrolled-${tag}.png` });

  // Geometry assertions on the live DOM.
  const geom = await page.evaluate(() => {
    const bar = document.querySelector('.lx-sticky-timer-bar');
    if (!bar) return { present: false };
    const b = bar.getBoundingClientRect();
    const main = document.querySelector('main').getBoundingClientRect();
    const timer = bar.querySelector('.lx-timer');
    return {
      present: true,
      barTop: Math.round(b.top),
      barBottom: Math.round(b.bottom),
      mainTop: Math.round(main.top),
      inViewport: b.top >= 0 && b.bottom <= window.innerHeight,
      inTopHalf: b.bottom <= window.innerHeight / 2,
      pinnedToTop: Math.round(b.top) === 0,
      readout: timer?.textContent ?? null,
      topChromeAttr: !!document.querySelector('[data-lx-top-chrome]'),
      bottomChromeAttr: [...document.querySelectorAll('[data-lx-bottom-chrome]')].length,
    };
  });

  // 4. The finish dialog: the minutes it promises.
  await page.click('nav[aria-label="primary"] >> text=Inicio');
  await page.waitForTimeout(500);
  const finish = page.locator('button:has-text("Finalizar ahora")').first();
  let dialogText = null;
  let barReadout = null;
  if (await finish.count()) {
    barReadout = await page.locator('.lx-sticky-timer-bar .lx-timer').first().textContent();
    await finish.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/04-finish-dialog-${tag}.png` });
    dialogText = await page.locator('.lx-modal').first().innerText();
    await page.keyboard.press('Escape');
  }

  console.log(`\n== ${tag} ==`);
  console.log('at rest:', atRest);
  console.log('scrolled:', geom);
  if (barReadout) console.log('bar readout when the dialog opened:', barReadout);
  if (dialogText) console.log('dialog:', dialogText.replace(/\n/g, ' | '));
  if (errors.length) console.log('ERRORS:', errors);
  await page.close();
}

await browser.close();
