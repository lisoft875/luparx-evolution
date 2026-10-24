/**
 * Capturas del escenario del 23-10-2026: «Continuar» con el campo enfocado y el teclado arriba.
 *
 * <h2>Qué fotografía y por qué así</h2>
 *
 * <p>Javier reportó que al tocar «Número de parqueo» desaparecían el botón «Continuar» y la barra
 * inferior, y que sólo volvían al tocar la pantalla. Esta herramienta reproduce ese momento exacto
 * —campo enfocado, teclado arriba— y lo fotografía, porque una lista de comprobaciones en verde no
 * es lo que pidió: pidió capturas reales de antes y después.</p>
 *
 * <p>El teclado se simula encogiendo `visualViewport.height`, que es la señal que un teléfono de
 * verdad emite y lo único que el código lee. <b>Queda dicho sin adornos: esto prueba que el
 * mecanismo reacciona a la señal, no que un iPhone la produzca.</b> Chromium no abre un teclado
 * virtual, y en este contenedor no hay WebKit —la descarga del navegador está bloqueada por el
 * proxy—, así que Safari de iOS sigue SIN PROBAR.</p>
 *
 * <p>Para fotografiar dónde queda el teclado se dibuja una banda opaca sobre su franja. No es
 * decoración: sin ella la captura muestra una pantalla entera y no se puede juzgar si las barras
 * quedaron por encima o por debajo del borde, que es justamente lo que hay que ver.</p>
 *
 *   BASE=http://localhost:5183 node tests/responsive/capturas-teclado.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:5183';
const CUENTA = process.env.CUENTA ?? 'citizen@example.com';
const PASS = process.env.PASS ?? 'Password123!';
const SALIDA = process.env.CAPTURAS
  ?? path.join(__dirname, 'capturas', 'teclado-continuar-23oct');

const TAMANOS = [
  { nombre: 'iPhone-chico-320x568', w: 320, h: 568, escala: 2, teclado: 300 },
  { nombre: 'iPhone-390x844', w: 390, h: 844, escala: 3, teclado: 300 },
  { nombre: 'tableta-768x1024', w: 768, h: 1024, escala: 2, teclado: 380 },
];

async function entrar(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.fill('input[type=email]', CUENTA);
  await page.fill('input[type=password]', PASS);
  await page.click('button[type=submit]');
  await page.waitForTimeout(2200);
  const ficha = page.locator('button, a').filter({ hasText: /San José/ }).first();
  if (await ficha.count()) { await ficha.click(); await page.waitForTimeout(1800); }
}

/** Encoge el viewport visual, que es lo que hace un teclado de verdad. */
async function abrirTeclado(page, alto) {
  await page.evaluate((px) => {
    const vv = window.visualViewport;
    if (!vv) return;
    Object.defineProperty(vv, 'height', {
      configurable: true, get: () => window.innerHeight - px,
    });
    vv.dispatchEvent(new Event('resize'));
  }, alto);
}

/** Dibuja dónde estaría el teclado, para que la foto se pueda juzgar. */
async function pintarTeclado(page, alto) {
  await page.evaluate((px) => {
    const banda = document.createElement('div');
    banda.id = '__banda-teclado';
    Object.assign(banda.style, {
      position: 'fixed', left: '0', right: '0', bottom: '0', height: `${px}px`,
      background: 'repeating-linear-gradient(45deg,#2b3340,#2b3340 10px,#232a35 10px,#232a35 20px)',
      borderTop: '2px solid #5b6b80', zIndex: '2147483647',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#8ca4c0', font: '600 13px ui-monospace,monospace', letterSpacing: '.08em',
    });
    banda.textContent = 'AQUÍ ESTARÍA EL TECLADO';
    document.body.appendChild(banda);
  }, alto);
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

  for (const t of TAMANOS) {
    const ctx = await browser.newContext({
      viewport: { width: t.w, height: t.h }, deviceScaleFactor: t.escala,
      hasTouch: true, isMobile: true, locale: 'es-CR',
    });
    const page = await ctx.newPage();
    await entrar(page);
    await page.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // ── Antes de tocar nada: la pantalla en reposo ──
    let archivo = path.join(SALIDA, `${t.nombre}-1-en-reposo.png`);
    await page.screenshot({ path: archivo });
    console.log(`  ··  ${archivo}`);

    // ── El momento del reporte: campo enfocado y teclado arriba ──
    const campo = page.locator('input[inputmode=numeric], input[inputmode=text]').first();
    await campo.click();
    await abrirTeclado(page, t.teclado);
    await page.waitForTimeout(1200);
    await campo.type('0008', { delay: 50 });
    await page.waitForTimeout(900);
    await pintarTeclado(page, t.teclado);
    await page.waitForTimeout(250);

    const estado = await page.evaluate(() => {
      const ver = (sel) => {
        const n = document.querySelector(sel);
        if (!n) return 'no está';
        const e = getComputedStyle(n);
        const c = n.getBoundingClientRect();
        return `${e.visibility}, ${e.position}, y=${Math.round(c.top)}–${Math.round(c.bottom)}`;
      };
      return {
        barras: document.documentElement.getAttribute('data-barras') ?? '(pegadas)',
        teclado: document.documentElement.getAttribute('data-teclado') ?? '(cerrado)',
        altoVar: getComputedStyle(document.documentElement).getPropertyValue('--lx-teclado-alto').trim() || '(sin definir)',
        vv: Math.round(window.visualViewport.height),
        cta: ver('.lx-sticky-cta'),
        nav: ver('.lx-bottom-dock'),
      };
    });

    archivo = path.join(SALIDA, `${t.nombre}-2-escribiendo.png`);
    await page.screenshot({ path: archivo });
    console.log(`  ··  ${archivo}`);
    console.log(`      botón: ${estado.cta}`);
    console.log(`      barra: ${estado.nav}   ·   estado: ${estado.barras}`);
    console.log(`      data-teclado=${estado.teclado} · --lx-teclado-alto=${estado.altoVar} · vv=${estado.vv}`);

    await ctx.close();
  }

  await browser.close();
  console.log(`\ncapturas en ${SALIDA}`);
})().catch((e) => { console.error(e); process.exit(1); });
