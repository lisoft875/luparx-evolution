/**
 * Validación de imágenes de reclamo — lógica pura, sin navegador.
 * (El escalado por canvas no se prueba acá: necesita navegador; lo verifica la persona en Safari.)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = new URL('../../../../..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'imgrec-'));
try {
  execFileSync(join(raiz, 'node_modules/.bin/tsc'),
    ['--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
     '--skipLibCheck', '--outDir', dir, join(raiz, 'apps/citizen/src/lib/imagenReclamo.ts')],
    { stdio: 'pipe' });
} catch (e) {
  const s = String(e.stdout || '') + String(e.stderr || '');
  if (!s.includes('Cannot find module') && !s.includes('TS2307') && !s.includes('lib.dom')) {
    console.error(s); rmSync(dir, { recursive: true, force: true }); process.exit(1);
  }
}
const m = await import(join(dir, 'imagenReclamo.js'));
let fallos = 0;
const ok = (c, msg, d) => { if (c) console.log('  \x1b[32m✓\x1b[0m ' + msg); else { fallos++; console.log('  \x1b[31m✗\x1b[0m ' + msg + (d ? ' — ' + d : '')); } };

ok(m.esImagenAceptada('image/jpeg') && m.esImagenAceptada('image/png') && m.esImagenAceptada('image/webp'), 'acepta JPEG/PNG/WebP');
ok(m.esImagenAceptada('image/heic'), 'acepta HEIC (iPhone)');
ok(m.esImagenAceptada('IMAGE/JPEG'), 'no distingue mayúsculas');
ok(m.esImagenAceptada('application/pdf') === false && m.esImagenAceptada('image/gif') === false, 'rechaza PDF y GIF');
ok(m.esImagenAceptada('') === false && m.esImagenAceptada(null) === false, 'rechaza tipo vacío/nulo');
ok(m.MAX_RECLAMO_BYTES === 1024 * 1024, 'el tope es 1 MB, igual que el backend', String(m.MAX_RECLAMO_BYTES));
ok(m.MAX_IMAGENES_RECLAMO === 3, 'máximo 3 imágenes');
ok(m.necesitaReducir(1024 * 1024 + 1) === true, 'una imagen por encima de 1 MB se reduce');
ok(m.necesitaReducir(1024 * 1024) === false, 'exactamente 1 MB NO se reduce');
ok(m.necesitaReducir(500 * 1024) === false, 'media de 1 MB no se reduce');

rmSync(dir, { recursive: true, force: true });
console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
