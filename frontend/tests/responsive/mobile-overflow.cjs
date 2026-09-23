/**
 * Detector de problemas de layout móvil: desborde horizontal, texto recortado y solapamiento.
 *
 * No busca "esto se ve raro": mide. Para cada viewport reporta
 *   1. si el documento scrollea de lado — el síntoma que una persona describe como
 *      "se sale del cuadro", y que corre TODOS los cuadros de la pantalla;
 *   2. qué elemento excede a su propio padre, que es la parte que dice QUÉ arreglar;
 *   3. qué texto se sale o se recorta dentro de su propia caja;
 *   4. qué elementos se pisan entre sí en la misma fila.
 *
 * Tres detalles que hacen la diferencia entre esto y un detector inútil, cada uno aprendido
 * de un falso positivo o de un defecto que se escapó (2026-09-18):
 *
 *   - Se DESCARTA el elemento cuyo padre tiene overflow-x en auto|scroll|hidden. Sin ese filtro
 *     cada `.lx-table-wrapper` —que scrollea a propósito— reporta decenas de culpables y entierra
 *     la única línea que importa.
 *   - Sólo se reporta el elemento que ROMPE, nunca sus hijos: un hijo hereda el desborde del padre.
 *   - El solapamiento NO es desborde y necesita su propio pase. Así se encontró el badge de
 *     municipalidad colapsado a 0px pintado encima de "Perfil": nada se salía de la página.
 *
 *   node tests/responsive/mobile-overflow.cjs                      # staging, portal ciudadano
 *   BASE=http://localhost:8093 node tests/responsive/mobile-overflow.cjs
 *   PORTAL=admin node tests/responsive/mobile-overflow.cjs
 *   PORTAL=all node tests/responsive/mobile-overflow.cjs           # los cuatro, uno tras otro
 *
 * Requiere el navegador de Playwright: `npx playwright install chromium` (una vez, en la Mac).
 * Sale con código distinto de cero si algo falla, así que puede frenar un deploy.
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const PORTAL = process.env.PORTAL ?? 'citizen';

const CUENTAS = {
  // Ana tiene saldo, tres municipalidades e historial: es la que más llena las pantallas.
  citizen: 'ana.morales@luparx.test',
  admin: 'admin@luparx.test',
  inspector: 'inspector@luparx.test',
  platform: 'platform@luparx.test',
};

const PREFIJO = { citizen: '', admin: '/admin', inspector: '/inspector', platform: '/platform' };

/**
 * Las rutas PAGINADAS del admin van primero y no se quitan: ahí vivía el desborde de 45px de
 * `.lx-pagination`, y es el defecto más fácil de reintroducir (cualquier fila flex sin flex-wrap).
 */
const RUTAS = {
  citizen: ['/', '/wallet', '/movements', '/fines', '/vehicles', '/notifications', '/profile'],
  // `/citations`, `/infractions` y `/reconciliation` NO EXISTEN en el portal de administración:
  // la ruta comodín las mandaba a `/`, así que el barredor medía el Inicio tres veces y le ponía a
  // cada medición el nombre de una pantalla distinta. Las verdaderas son `/enforcement/citations`,
  // `/settings/infraction-types` y `/billing`. Es el mismo error que ya había pasado con
  // `/admin/citations` en snapshot.cjs, y vuelve a entrar por el mismo lado: una lista de rutas
  // escrita a mano que nadie comprueba contra App.tsx.
  admin: [
    '/audit', '/users', '/staff', '/appeals', '/exemptions', // paginadas: las que rompían
    '/', '/dashboard', '/zones', '/spaces', '/tariffs', '/parking-policy',
    '/settings/schedule', '/enforcement/citations', '/enforcement/checks',
    '/settings/infraction-types', '/billing', '/reports',
  ],
  // /new-citation tiene el MISMO grid zona/bahía que /plate-lookup y el mismo defecto: no estaba
  // en esta lista, así que el detector no lo vio y se encontró leyendo el código.
  inspector: ['/', '/queue', '/my-citations', '/plate-lookup', '/new-citation', '/profile'],
  platform: ['/', '/tenants', '/users', '/audit', '/system', '/catalogs'],
};

// Los tamaños que de verdad se usan, no una lista bonita. 320px es donde se rompe lo que
// "funciona en móvil", y 430px es el iPhone Pro Max actual.
const VIEWPORTS = [
  { name: 'muy chico  320x568', viewport: { width: 320, height: 568 } },
  { name: 'iPhone SE  375x667', viewport: { width: 375, height: 667 } },
  { name: 'iPhone 14  390x844', viewport: { width: 390, height: 844 } },
  { name: 'Pixel 7    412x915', viewport: { width: 412, height: 915 } },
  { name: 'iPhone Max 430x932', viewport: { width: 430, height: 932 } },
  { name: 'tablet     768x1024', viewport: { width: 768, height: 1024 } },
];

async function medir(page) {
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const doc = document.documentElement;
    const ancho = doc.clientWidth;
    const recorte = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 48);

    const desbordes = [];
    const recortados = [];

    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;

      const padre = el.parentElement;
      const pb = padre ? padre.getBoundingClientRect() : null;
      const padreCorta = padre
        ? /auto|scroll|hidden/.test(getComputedStyle(padre).overflowX)
        : false;

      // (1)+(2) se sale del viewport Y de su propio padre, y el padre no lo recorta a propósito.
      if (b.right > ancho + 1 && pb && b.right > pb.right + 1 && !padreCorta) {
        desbordes.push({
          tag: el.tagName.toLowerCase(),
          cls: recorte(el.className).slice(0, 60),
          texto: recorte(el.textContent),
          excesoViewport: Math.round(b.right - ancho),
          excesoPadre: Math.round(b.right - pb.right),
        });
      }

      // (3) texto que no cabe en su propia caja. Sólo hojas: en un contenedor scrollWidth mide
      // a los hijos y no dice nada del texto.
      if (el.children.length === 0 && (el.textContent || '').trim()) {
        const corte = el.scrollWidth - el.clientWidth;
        // `text-overflow: ellipsis` es una decisión de diseño, no un defecto: el badge de
        // municipalidad recorta "San José" a propósito. Sólo se reporta el texto que se SALE
        // (overflow visible) o que se corta SIN elipsis.
        const st = getComputedStyle(el);
        const elipsisIntencional = st.textOverflow === 'ellipsis' && st.overflowX !== 'visible';
        if (corte > 1 && !elipsisIntencional) {
          const s = st;
          recortados.push({
            tag: el.tagName.toLowerCase(),
            cls: recorte(el.className).slice(0, 60),
            texto: recorte(el.textContent),
            corte,
            visible: s.overflowX === 'visible', // visible = se sale; hidden = se corta
          });
        }
      }
    }

    // (4) solapamiento: dos hojas con texto, en la misma línea, cuyas cajas se cruzan.
    // Un elemento aplastado a 0px de ancho es la señal de que un hermano no cedió.
    // Un elemento fijo o pegado TAPA contenido por diseño y el contenido sigue siendo
    // alcanzable con scroll, así que cruzarse con él no es un defecto. Medido: en el home del
    // ciudadano a 320px la barra inferior "pisaba" la tarjeta de multas en la posición de scroll
    // del momento, pero con la página al fondo el contenido termina 24px antes de la barra
    // porque `main` lleva padding-bottom = alto de la barra. Sin este filtro el reporte daba 24
    // solapamientos falsos y ninguno real.
    const dentroDeFijo = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const pos = getComputedStyle(n).position;
        if (pos === 'fixed' || pos === 'sticky') return true;
      }
      return false;
    };
    const hojas = [...document.querySelectorAll('body *')].filter(
      (el) => el.children.length === 0 && (el.textContent || '').trim() && !dentroDeFijo(el),
    );
    const solapes = [];
    const aplastados = [];
    for (const el of hojas) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 && el.scrollWidth > 1) {
        aplastados.push({
          cls: recorte(el.className).slice(0, 60),
          texto: recorte(el.textContent),
          necesita: el.scrollWidth,
        });
      }
    }
    for (let i = 0; i < hojas.length && solapes.length < 6; i++) {
      const a = hojas[i].getBoundingClientRect();
      if (a.width === 0 || a.height === 0) continue;
      for (let j = i + 1; j < hojas.length; j++) {
        const b = hojas[j].getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        const cruzanY = a.top < b.bottom - 2 && b.top < a.bottom - 2;
        const cruzanX = a.left < b.right - 2 && b.left < a.right - 2;
        if (cruzanY && cruzanX) {
          solapes.push({
            a: recorte(hojas[i].textContent).slice(0, 24),
            b: recorte(hojas[j].textContent).slice(0, 24),
            clsA: recorte(hojas[i].className).slice(0, 40),
            clsB: recorte(hojas[j].className).slice(0, 40),
          });
          break;
        }
      }
    }

    return {
      scrollDeLado: doc.scrollWidth - ancho,
      desbordes: desbordes.slice(0, 6),
      recortados: recortados.slice(0, 6),
      aplastados: aplastados.slice(0, 4),
      solapes,
    };
  });
}

async function entrar(page, portal) {
  const prefijo = PREFIJO[portal];
  await page.goto(`${BASE}${prefijo}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.fill('input[type="email"]', CUENTAS[portal]);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  // Varios portales piden elegir municipalidad antes de entrar. El texto de la ficha es el
  // nombre de la municipalidad, así que se busca por clase y, si no, por el nombre sembrado.
  const ficha = page
    .locator('.lx-tenant-tile, [class*="tenant-tile"], [class*="tenant-card"]')
    .first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1500);
    return;
  }
  const porNombre = page.getByText('San José', { exact: true }).first();
  if (await porNombre.isVisible().catch(() => false)) {
    await porNombre.click();
    await page.waitForTimeout(1500);
  }
}

(async () => {
  const portales = PORTAL === 'all' ? Object.keys(CUENTAS) : [PORTAL];
  for (const p of portales) {
    if (!CUENTAS[p]) throw new Error(`PORTAL desconocido: ${p}`);
  }

  const browser = await chromium.launch();
  let fallos = 0;
  let vistas = 0;

  for (const portal of portales) {
    console.log(`\n########## portal ${portal} · ${BASE}${PREFIJO[portal]} · ${CUENTAS[portal]} ##########`);

    for (const vp of VIEWPORTS) {
      console.log(`\n=== ${vp.name} ===`);
      const ctx = await browser.newContext({ ...vp, locale: 'es-CR', ignoreHTTPSErrors: true });
      const page = await ctx.newPage();

      // Una excepción en render deja la pantalla en blanco sin mensaje (el frontend no tiene
      // error boundary), así que un crash tiene que aparecer en el reporte y no como "ok".
      const errores = [];
      page.on('pageerror', (e) => errores.push(String(e.message).split('\n')[0]));

      try {
        informar('/login', await medir(page), errores, 'login');
        await entrar(page, portal);
      } catch (e) {
        console.log(`  (login: ${String(e.message).split('\n')[0]})`);
      }

      for (const ruta of RUTAS[portal]) {
        errores.length = 0;
        try {
          // goto completo por ruta: dejar una ruta de otro portal en el historial deja la app
          // en blanco y parece un crash que no existe.
          await page.goto(`${BASE}${PREFIJO[portal]}${ruta}`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(1200);
          informar(ruta, await medir(page), errores, ruta);
        } catch (e) {
          console.log(`  ?   ${ruta} — ${String(e.message).split('\n')[0]}`);
        }
      }
      await ctx.close();
    }
  }

  await browser.close();
  console.log(`\n===== ${vistas} vistas medidas · ${fallos} con problemas =====`);
  process.exit(fallos > 0 ? 1 : 0);

  function informar(ruta, r, errores) {
    vistas++;
    const limpio =
      r.scrollDeLado <= 1 &&
      r.desbordes.length === 0 &&
      r.recortados.length === 0 &&
      r.aplastados.length === 0 &&
      r.solapes.length === 0 &&
      errores.length === 0;
    if (limpio) {
      console.log(`  ok  ${ruta}`);
      return;
    }
    fallos++;
    const scroll = r.scrollDeLado > 1 ? `  (scroll lateral ${r.scrollDeLado}px)` : '';
    console.log(`  ✗   ${ruta}${scroll}`);
    for (const e of errores) console.log(`        CRASH: ${e}`);
    for (const d of r.desbordes) {
      console.log(
        `        se sale +${d.excesoViewport}px del viewport (+${d.excesoPadre} del padre)  <${d.tag} class="${d.cls}">  "${d.texto}"`,
      );
    }
    for (const c of r.recortados) {
      console.log(
        `        ${c.visible ? 'texto fuera de su caja' : 'texto cortado'} +${c.corte}px  <${c.tag} class="${c.cls}">  "${c.texto}"`,
      );
    }
    for (const a of r.aplastados) {
      console.log(`        aplastado a 0px (necesita ${a.necesita}px)  class="${a.cls}"  "${a.texto}"`);
    }
    for (const s of r.solapes) {
      console.log(`        se pisan: "${s.a}" (${s.clsA})  ×  "${s.b}" (${s.clsB})`);
    }
  }
})();
