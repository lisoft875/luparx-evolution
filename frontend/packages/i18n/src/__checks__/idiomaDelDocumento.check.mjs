// El documento tiene que DECLARAR el idioma que muestra.
//
//   cd ~/Development/Proyectos/luparx-evolution/frontend
//   node packages/i18n/src/__checks__/idiomaDelDocumento.check.mjs
//
// Por qué existe. Los cuatro `index.html` traen `<html lang="es-CR">` escrito a mano y nadie lo
// movía: medido en la aplicación corriendo el 17-10-2026, la pantalla decía «Sign in» y el
// documento seguía declarando `es-CR`, antes y después de recargar. La preferencia SÍ persistía
// (`luparx.locale.citizen=en-US`); lo que no se sincronizaba era el documento.
//
// No es cosmético: `lang` decide la voz y la pronunciación del lector de pantalla, la oferta de
// traducir del navegador, `:lang()` y la separación silábica. Declarar español y mostrar inglés
// incumple WCAG 3.1.1. Por eso esto se fija acá y no se deja a una revisión visual, que no puede
// ver un atributo.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(AQUI, '../../../..');
const CONTEXTO = readFileSync(resolve(AQUI, '../context.tsx'), 'utf8');

let fallos = 0;
const ok = (c, m, d = '') => {
  if (c) console.log('  ok  ', m);
  else { fallos += 1; console.log('  FALLA:', m, d ? `— ${d}` : ''); }
};

console.log('el idioma del documento sigue al idioma mostrado');

const efecto = CONTEXTO.slice(CONTEXTO.indexOf('useEffect(() => {'));
ok(/useEffect\(\(\) => \{/.test(CONTEXTO), 'el proveedor tiene un efecto que sincroniza');
ok(
  /document\.documentElement\.lang = locale;/.test(CONTEXTO),
  'y lo que escribe es el idioma activo, no un literal',
);
ok(
  /\}, \[locale\]\);/.test(efecto),
  'depende de `locale`: cambiar de idioma lo vuelve a aplicar, sin recargar',
);
ok(
  /if \(typeof document === 'undefined'\) return;/.test(efecto),
  'y no asume que haya documento: una prueba en Node o un render fuera del navegador no revienta',
);
/*
  Acá había una aserción sobre el ORDEN de declaración del efecto respecto de `setLocale`. Falló
  en su primera corrida porque `indexOf('useEffect')` encontraba la línea del `import`, y al
  mirarla de cerca tampoco medía nada: React no depende de ese orden. Se reemplaza por las dos
  invariantes que sí sostienen la mitad de PERSISTENCIA de la preferencia, que es lo que el
  encargo pide junto con la sincronización.
*/
console.log('\nla preferencia se recuerda entre recargas');
ok(
  /setLocaleState\(next\);\s*\n\s*writeStoredLocale\(next\);/.test(CONTEXTO),
  'elegir un idioma lo escribe en el almacenamiento del navegador',
);
ok(
  /initialLocale \?\? readStoredLocale\(\) \?\? detectBrowserLocale\(\)/.test(CONTEXTO),
  'y al arrancar se lee de ahí antes de preguntarle al navegador, en ese orden',
);
ok(
  /if \(storageScope\) setLocaleStorageScope\(storageScope\);/.test(CONTEXTO),
  'la clave va por portal: el idioma del inspector no decide el del ciudadano',
);

// El valor estático sigue siendo correcto ANTES de que arranque el JavaScript, así que no se quita.
console.log('\nel HTML estático conserva un idioma de arranque');
const portales = ['citizen', 'admin', 'inspector', 'platform'];
for (const portal of portales) {
  const ruta = resolve(raiz, 'apps', portal, 'index.html');
  if (!existsSync(ruta)) { ok(false, `${portal}: falta index.html`, ruta); continue; }
  const html = readFileSync(ruta, 'utf8');
  ok(/<html lang="[a-z]{2}-[A-Z]{2}">/.test(html), `${portal}: declara un idioma antes de cargar el JS`);
}
ok(
  portales.length === 4,
  'los cuatro portales entran en la comprobación: el arreglo vive en el proveedor que todos montan',
);

console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos > 0 ? 1 : 0);
