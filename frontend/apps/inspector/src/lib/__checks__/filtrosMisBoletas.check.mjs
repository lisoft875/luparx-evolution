/**
 * Filtros de «Mis boletas» — cableado de punta a punta, comprobado sin navegador (Fase 4).
 *
 * No hay módulo de lógica pura que ejercitar: el filtro es contrato (cliente → endpoint → servicio).
 * Esta comprobación protege el cableado del FRONTEND contra una reversión silenciosa, afirmando
 * sobre el TEXTO de los archivos que cada eslabón sigue presente. El contrato del backend
 * (status/from/to opcionales → CitationService.search acotado a la sesión) se verifica con mvnw. Las pruebas de comportamiento (filtros
 * combinados, paginación, parámetros inválidos) son de integración y corren contra el backend real.
 *
 *   node apps/inspector/src/lib/__checks__/filtrosMisBoletas.check.mjs
 */
import { readFileSync } from 'node:fs';

const raiz = new URL('../../../../..', import.meta.url).pathname;
const leer = (rel) => readFileSync(raiz + rel, 'utf8');

let fallos = 0;
const ok = (cond, msg, detalle) => {
  if (cond) {
    console.log('  \x1b[32m✓\x1b[0m ' + msg);
  } else {
    fallos++;
    console.log('  \x1b[31m✗\x1b[0m ' + msg + (detalle ? '  — ' + detalle : ''));
  }
};

console.log('el cliente manda status/from/to a /inspector/citations');
const cliente = leer('packages/api-client/src/client.ts');
const listInspector = cliente.slice(cliente.indexOf("readonly inspectorEnforcement"));
const bloqueList = listInspector.slice(0, listInspector.indexOf('get:'));
ok(/status\?: CitationStatus/.test(bloqueList), 'la firma de list acepta status tipado');
ok(/status: params\.status/.test(bloqueList) && /from: params\.from/.test(bloqueList) && /to: params\.to/.test(bloqueList),
  'los tres viajan en el query');

console.log('\nel hook pasa los filtros y los mete en la clave de caché');
const q = leer('apps/inspector/src/lib/queries.ts');
ok(/export interface MyCitationsFilters/.test(q), 'existe el tipo MyCitationsFilters');
ok(/filters: MyCitationsFilters = \{\}/.test(q), 'useMyCitations recibe filtros (por defecto vacíos → compatibles)');
ok(/KEYS\.citations\(page, size, filters\)/.test(q), 'la clave de caché incluye los filtros: cambiar filtro no sirve caché viejo');
ok(/list\(\{ page, size, \.\.\.filters \}\)/.test(q), 'el queryFn reenvía los filtros al cliente');

console.log('\nla pantalla reinicia la paginación al aplicar/limpiar');
const page = leer('apps/inspector/src/pages/MyCitationsPage.tsx');
ok(/setApplied\(draft\);\s*\n\s*setPage\(0\)/.test(page), 'aplicar un filtro vuelve a la página 0');
ok(/setApplied\(\{\}\);\s*\n\s*setPage\(0\)/.test(page), 'limpiar vuelve a la página 0');
ok(/inspector\.citations\.emptyFiltered/.test(page), 'vacío con filtros dice algo distinto de «nunca emitiste»');

console.log('\ni18n en los dos idiomas');
for (const loc of ['es-CR', 'en-US']) {
  const txt = leer(`packages/i18n/src/locales/${loc}.ts`);
  ok(/inspector\.citations\.filter\.status/.test(txt) && /inspector\.citations\.filter\.apply/.test(txt) && /inspector\.citations\.emptyFiltered/.test(txt),
    `${loc}: claves de filtro presentes`);
}

console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
