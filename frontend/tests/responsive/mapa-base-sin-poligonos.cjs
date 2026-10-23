/**
 * El mapa base se dibuja SIN polígonos, si se le dice dónde centrarlo.
 *
 * <h2>Por qué esta prueba monta el componente aparte</h2>
 *
 * <p>La corrección del 23-10-2026 pide que «la falta de geometría NO oculte el mapa base». La
 * capacidad existe en `ZoneMap` desde esa fecha —la propiedad `centro`— pero <b>ninguna pantalla
 * la usa todavía</b>, y no por olvido: no hay de dónde sacar un centro real. Ni el contrato del
 * ciudadano ni la tabla `tenants` guardan coordenadas, y poner unas a mano sería inventarlas.</p>
 *
 * <p>Eso deja una rama de código sin ningún camino que la recorra, que es la forma más común de
 * entregar algo roto creyendo que funciona: el día que exista el centro, alguien lo pasa y recién
 * ahí se descubre que el encuadre nunca se probó. Así que se monta el componente en una página
 * mínima, fuera de la aplicación, y se comprueba lo único que importa: que con centro y sin
 * polígonos aparece un lienzo con calles, y que sin centro y sin polígonos NO aparece.</p>
 *
 * <p>La página la escribe este archivo en un directorio temporal. No se agrega ninguna ruta de
 * prueba al portal: una pantalla que sólo existe para las pruebas termina, tarde o temprano,
 * desplegada.</p>
 *
 *   node tests/responsive/mapa-base-sin-poligonos.cjs
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..', '..');
const PUERTO = Number(process.env.PUERTO || 5187);
const CAPTURAS = process.env.CAPTURAS || path.join(__dirname, 'capturas', 'mapa-base');

/* San José centro. Es un dato de PRUEBA y vive sólo acá: no entra en el portal ni en ningún
   catálogo. Sirve para comprobar que el encuadre funciona, no para decirle a nadie dónde está. */
const CENTRO_DE_PRUEBA = { lon: -84.0807, lat: 9.9333, zoom: 14 };

/* El mismo estilo mínimo de los otros arneses: el proveedor real no se contacta. Con `sources`
   vacío no hay teselas de calle que descargar, así que lo que se comprueba es que el lienzo se
   monta y queda centrado donde se pidió, no el dibujo del tercero. */
const ESTILO = {
  version: 8,
  name: 'prueba-local',
  sources: {},
  layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#1b2838' } }],
};

let fallos = 0;
const ok = (cond, nombre, detalle = '') => {
  if (cond) console.log(`  ok   ${nombre}`);
  else { fallos += 1; console.log(`  ✗    ${nombre}${detalle ? ' — ' + detalle : ''}`); }
};

const puertoOcupado = (p) => new Promise((res) => {
  const s = net.connect({ host: '127.0.0.1', port: p });
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  s.setTimeout(1000, () => { s.destroy(); res(false); });
});

const esperarPuerto = async (p, ms) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await puertoOcupado(p)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};

/**
 * Escribe la página mínima que monta el componente, y devuelve su directorio.
 *
 * <p>Va DENTRO del repositorio y no en `/tmp`, aunque sea temporal: desde `/tmp` ni la
 * configuración de Vite encuentra `vite` y `@vitejs/plugin-react`, ni la página encuentra
 * `@luparx/ui`. Node resuelve subiendo por los `node_modules` de los directorios padre, y el padre
 * de `/tmp` no tiene ninguno. Se borra al terminar, y el nombre empieza con punto para que no
 * aparezca en los listados ni lo recoja ninguna herramienta.</p>
 */
function escribirPagina() {
  const dir = fs.mkdtempSync(path.join(RAIZ, '.banco-mapa-'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>banco de pruebas del mapa</title>
<style>html,body,#raiz{margin:0;height:100%;background:#0a1220}</style></head>
<body><div id="raiz"></div><script type="module" src="/banco.tsx"></script></body></html>
`);
  fs.writeFileSync(path.join(dir, 'banco.tsx'), `import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { ZoneMap } from '@luparx/ui/map';
import '@luparx/ui/tokens.css';

/*
  Dos montajes, uno al lado del otro, para que la diferencia sea la ÚNICA variable: los dos sin
  polígonos, uno con centro y el otro sin él.
*/
const TEXTOS = {
  titulo: 'Zonas', ampliar: 'Ampliar', cerrar: 'Cerrar', cargando: 'Cargando…',
  vacio: 'Esta municipalidad todavía no tiene zonas dibujadas en el mapa.',
  errorTitulo: 'No se pudo cargar el mapa.', reintentar: 'Reintentar',
  sinProveedor: 'Sin proveedor de mapas.',
  noOficial: 'No son límites oficiales.', noOficialDetalle: 'Las punteadas son de demostración.',
};

/* Lo inyecta el arnés con addInitScript, antes de que exista el documento: por eso va en window y
   no en un dataset. El primer intento lo puso en document.documentElement.dataset y reventó ahí
   mismo, porque a esa altura documentElement todavía es null. */
type Centro = { lon: number; lat: number; zoom?: number };
const centro = (window as unknown as { __lxCentroDePrueba?: Centro }).__lxCentroDePrueba;

createRoot(document.getElementById('raiz')!).render(
  <div style={{ padding: 12, display: 'grid', gap: 16 }}>
    <div data-caso="con-centro">
      <ZoneMap zonas={{ type: 'FeatureCollection', features: [] } as never}
        centro={centro} altoCompacto={300} textos={TEXTOS} />
    </div>
    <div data-caso="sin-centro">
      <ZoneMap zonas={{ type: 'FeatureCollection', features: [] } as never}
        altoCompacto={300} textos={TEXTOS} />
    </div>
  </div>,
);
`);
  fs.writeFileSync(path.join(dir, 'vite.config.ts'), `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: ${JSON.stringify(dir)},
  plugins: [react()],
  server: { port: ${PUERTO}, strictPort: true },
  resolve: { preserveSymlinks: true },
});
`);
  return dir;
}

(async () => {
  if (await puertoOcupado(PUERTO)) {
    console.error(`✗ Ya hay algo escuchando en :${PUERTO}.`);
    process.exit(2);
  }
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const dir = escribirPagina();

  const hijo = spawn(path.join(RAIZ, 'node_modules/.bin/vite'),
    ['--config', path.join(dir, 'vite.config.ts')], {
      cwd: RAIZ,
      // El estilo se sirve desde la propia página; la variable sólo tiene que ser una https válida
      // para que `urlDelEstilo()` la acepte. La petición la intercepta Playwright más abajo.
      env: { ...process.env, VITE_MAP_STYLE_URL: 'https://teselas.invalido.test/styles/prueba' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const salida = [];
  hijo.stdout.on('data', (d) => salida.push(String(d)));
  hijo.stderr.on('data', (d) => salida.push(String(d)));

  if (!(await esperarPuerto(PUERTO, 90000))) {
    console.error('✗ El servidor de pruebas no levantó:\n' + salida.join('').split('\n').slice(-15).join('\n'));
    try { hijo.kill('SIGKILL'); } catch { /* ya no está */ }
    process.exit(1);
  }

  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'es-CR' });

  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(`http://localhost:${PUERTO}`) || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    if (/\/styles\//.test(url)) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(ESTILO),
      });
    }
    return route.abort();
  });

  const page = await context.newPage();
  const consola = [];
  page.on('console', (m) => consola.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => consola.push(`pageerror: ${String(e)}`));
  await page.addInitScript((c) => {
    window.__lxCentroDePrueba = c;
  }, CENTRO_DE_PRUEBA);
  await page.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  if (process.env.DEPURAR === '1') {
    console.log('  ··  centro inyectado =', await page.evaluate(() => window.__lxCentroDePrueba));
    console.log('  ··  consola:\n' + consola.slice(0, 20).map((l) => '      ' + l).join('\n'));
  }
  console.log('\n── Con centro y SIN polígonos ──');
  const conCentro = page.locator('[data-caso=con-centro]');
  const lienzo = conCentro.locator('.lx-zonemap__lienzo canvas');
  ok(await lienzo.count() === 1, 'se monta un lienzo de mapa aunque no llegue ni un polígono');
  if (await lienzo.count() === 1) {
    const caja = await lienzo.boundingBox();
    ok(Boolean(caja) && caja.height > 200,
      'y tiene alto de verdad, no un lienzo de cero',
      caja ? `${Math.round(caja.width)}×${Math.round(caja.height)}` : '(sin caja)');
  }
  /*
    Que esté centrado DONDE SE PIDIÓ y no en el mundo entero. Es la comprobación que importa: el
    defecto del 21-10 fue exactamente un mapa que se dibujaba sin saber dónde, y lo que salió fue
    Costa Rica y Panamá en zoom de país. Se tolera medio grado y medio nivel de zoom porque el
    lienzo ajusta al tamaño del contenedor.
  */
  const centroReal = await conCentro.locator('.lx-zonemap__lienzo').evaluate((n) => {
    const m = n.__lxMapa;
    if (!m || !m.getCenter) return null;
    const c = m.getCenter();
    return { lon: c.lng, lat: c.lat, zoom: m.getZoom() };
  }).catch(() => null);
  if (centroReal) {
    ok(Math.abs(centroReal.lon - CENTRO_DE_PRUEBA.lon) < 0.5
      && Math.abs(centroReal.lat - CENTRO_DE_PRUEBA.lat) < 0.5,
      'el mapa quedó centrado donde se pidió, no en el mundo',
      JSON.stringify(centroReal));
    ok(Math.abs(centroReal.zoom - CENTRO_DE_PRUEBA.zoom) < 1.5,
      'y con el zoom pedido: nunca la vista nacional',
      `zoom ${centroReal.zoom?.toFixed?.(2)}`);
  } else {
    console.log('  ··  SIN PROBAR: la costura `__lxMapa` no estaba disponible; sólo se midió el lienzo');
  }
  ok(await conCentro.locator('.lx-zonemap__nota').count() === 1,
    'y la nota sigue diciendo que no hay zonas dibujadas: hay calles, no límites');

  console.log('\n── Sin centro y SIN polígonos ──');
  const sinCentro = page.locator('[data-caso=sin-centro]');
  ok(await sinCentro.locator('.lx-zonemap__lienzo').count() === 0,
    'no se dibuja ningún mapa: no hay dónde centrarlo');
  ok(await sinCentro.locator('.lx-zonemap__nota').count() === 1,
    'queda la nota de una línea, como antes');
  ok(await sinCentro.locator('.lx-zonemap__aviso').count() === 0,
    'y no vuelve la caja gris');

  const archivo = path.join(CAPTURAS, 'con-centro-y-sin-centro-390x900.png');
  await page.screenshot({ path: archivo });
  console.log(`  ··  captura: ${archivo}`);

  await browser.close();
  try { hijo.kill('SIGKILL'); } catch { /* ya no está */ }
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(fallos === 0 ? '\nsin fallos' : `\n${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
