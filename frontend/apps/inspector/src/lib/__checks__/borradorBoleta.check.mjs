// Comprobaciones del borrador de boleta: cuándo se ofrece, cuándo choca con una consulta de placa,
// y cuándo NO se escribe.
//
//   cd ~/Development/Proyectos/luparx-evolution/frontend
//   node apps/inspector/src/lib/__checks__/borradorBoleta.check.mjs
//
// Por qué existe. A /cite se llega en blanco o desde una consulta de placa que trae la placa y la
// bahía puestas. Un borrador de hace diez horas y de otro carro, restaurado encima de esos datos,
// produce un acto administrativo con la placa de hoy y las fotografías de ayer. Las reglas que lo
// impiden —caducidad, conflicto declarado, reemplazo total y nunca parcial, y el autoguardado que
// espera a que el fiscalizador decida— se comprueban acá, en JavaScript plano, que es la
// convención de `__checks__` en este repositorio.
//
// Qué no prueba: los dos botones de la pantalla. Eso es Playwright, en
// `tests/responsive/fiscalizacion-boleta-1a.cjs`.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PAGINA = readFileSync(resolve(AQUI, '../../pages/NewCitationPage.tsx'), 'utf8');
const MODULO = readFileSync(resolve(AQUI, '../citationDraft.ts'), 'utf8');

let fallos = 0;
const ok = (c, m) => { if (!c) { console.log('  FALLA:', m); fallos += 1; } else console.log('  ok  ', m); };

// ── Las reglas, transcritas ───────────────────────────────────────────────────────────────────
const HORAS_DE_VIDA = 12;
const HORA = 3_600_000;

const seOfrece = (guardadoEn, ahora = Date.now()) => {
  const edad = (ahora - new Date(guardadoEn).getTime()) / HORA;
  return Number.isFinite(edad) && edad <= HORAS_DE_VIDA;
};
const tieneContenido = (b) => Boolean(
  b.plate.trim() || b.typeId || b.zoneId || b.spaceCode.trim() || b.addressText.trim() || b.notes.trim() || b.fotos.length,
);
const vacio = { plate: '', typeId: '', zoneId: '', spaceCode: '', addressText: '', notes: '', fotos: [] };

// El conflicto, igual que en la pantalla.
const placaConsultada = (p) => (p.plate ?? '').trim().toUpperCase();
const vinoDeUnaConsulta = (p) => Boolean(placaConsultada(p) || p.zoneId || p.spaceCode);
const esDeOtroVehiculo = (borrador, p) =>
  borrador !== null && placaConsultada(p).length > 0 &&
  borrador.plate.trim().toUpperCase() !== placaConsultada(p);

// El autoguardado: no escribe mientras la oferta esté sin contestar.
const autoguarda = ({ inquilino, enviada, ofertaSinContestar, contenido }) =>
  Boolean(inquilino) && !enviada && !ofertaSinContestar && tieneContenido(contenido);

console.log('cuándo se ofrece un borrador');
const ahora = Date.parse('2026-10-16T18:00:00Z');
ok(seOfrece('2026-10-16T17:30:00Z', ahora), 'media hora: se ofrece');
ok(seOfrece('2026-10-16T06:30:00Z', ahora), 'once horas y media: todavía se ofrece');
ok(!seOfrece('2026-10-16T05:00:00Z', ahora), 'trece horas: ya no — es de otra jornada y casi seguro de otro carro');
ok(!seOfrece('porqueria', ahora), 'una fecha ilegible no se ofrece en vez de ofrecerse por defecto');
ok(seOfrece('2026-10-16T18:00:00Z', ahora), 'el instante exacto del guardado cuenta como vigente');

console.log('\nqué vale la pena guardar');
ok(!tieneContenido(vacio), 'un formulario en blanco no genera borrador');
ok(!tieneContenido({ ...vacio, plate: '   ' }), 'ni uno con sólo espacios en la placa');
ok(tieneContenido({ ...vacio, plate: 'BKZ123' }), 'una placa sí');
ok(tieneContenido({ ...vacio, notes: 'carro sobre la acera' }), 'una nota sola también: es trabajo');
ok(tieneContenido({ ...vacio, fotos: [{}] }), 'y una fotografía, que es lo más caro de volver a conseguir');

console.log('\nel choque con una consulta de placa');
const borrador = { plate: 'BKZ987', fotos: [{}, {}], guardadoEn: '2026-10-16T17:00:00Z' };
ok(!vinoDeUnaConsulta({}), 'entrar en blanco no es venir de una consulta');
ok(vinoDeUnaConsulta({ plate: 'ABC123' }), 'entrar con placa sí');
ok(vinoDeUnaConsulta({ zoneId: 'z1', spaceCode: 'A-01' }), 'y entrar con zona y bahía, aunque no traiga placa');
ok(esDeOtroVehiculo(borrador, { plate: 'ABC123' }), 'placa distinta: se declara el conflicto');
ok(!esDeOtroVehiculo(borrador, { plate: 'bkz987' }), 'la misma placa en minúscula NO es un conflicto');
ok(!esDeOtroVehiculo(borrador, { plate: '  BKZ987 ' }), 'ni la misma placa con espacios de sobra');
ok(!esDeOtroVehiculo(borrador, {}), 'sin consulta no hay con qué chocar: es la oferta normal');
ok(!esDeOtroVehiculo(null, { plate: 'ABC123' }), 'y sin borrador tampoco');
ok(esDeOtroVehiculo({ ...borrador, plate: '' }, { plate: 'ABC123' }),
   'un borrador sin placa frente a una consulta con placa también se declara: lo que trae no es de este carro');

console.log('\ncuándo el autoguardado se calla');
const enCurso = { ...vacio, plate: 'ABC123' };
ok(autoguarda({ inquilino: 't1', enviada: false, ofertaSinContestar: false, contenido: enCurso }),
   'con municipalidad, sin oferta pendiente y con contenido: guarda');
ok(!autoguarda({ inquilino: 't1', enviada: false, ofertaSinContestar: true, contenido: enCurso }),
   'con la oferta en pantalla sin contestar: NO guarda — escribiría encima de lo que está ofreciendo');
ok(!autoguarda({ inquilino: 't1', enviada: true, ofertaSinContestar: false, contenido: enCurso }),
   'ya emitida: no guarda, de eso se encarga la cola');
ok(!autoguarda({ inquilino: null, enviada: false, ofertaSinContestar: false, contenido: enCurso }),
   'sin municipalidad activa: no hay clave donde guardar');
ok(!autoguarda({ inquilino: 't1', enviada: false, ofertaSinContestar: false, contenido: vacio }),
   'y en blanco no guarda nada');

console.log('\ncuántas fotografías se perdieron');
const perdidas = (guardadas, recuperadas) => guardadas - recuperadas;
ok(perdidas(3, 3) === 0, 'tres guardadas y tres recuperadas: ninguna perdida');
ok(perdidas(3, 1) === 2, 'tres guardadas y una recuperada: se dicen dos, no se deja contar al fiscalizador');
ok(perdidas(0, 0) === 0, 'sin fotografías no hay aviso');

// ── Lo que los archivos reales tienen que seguir diciendo ─────────────────────────────────────
console.log('\nlos archivos reales');
ok(/export const HORAS_DE_VIDA = 12;/.test(MODULO), 'la caducidad sigue siendo de 12 horas');
ok(/if \(borradorPrevio\) return;/.test(PAGINA), 'el autoguardado sigue cediendo ante una oferta sin contestar');
ok(/const borradorDeOtroVehiculo =/.test(PAGINA), 'el conflicto se sigue calculando');
ok(/inspector\.cite\.draftOtherVehicle/.test(PAGINA), 'y se sigue diciendo en pantalla');
ok(/inspector\.cite\.draftKeepLookup'/.test(PAGINA), 'la salida «seguir con esta consulta» sigue dibujada');
ok(/inspector\.cite\.draftRestoreReplacing/.test(PAGINA), 'y la de retomar avisa que reemplaza');
ok(/async function seguirConLaConsulta\(\): Promise<void> \{\n    await limpiarBorrador/.test(PAGINA),
   'seguir con la consulta descarta el borrador en vez de dejarlo a medias');
ok(!/setPlate\(b\.plate \|\|/.test(PAGINA), 'retomar no hace mezclas del tipo «sólo si está vacío»');
ok(/inspector\.cite\.draftFound/.test(PAGINA), 'la oferta sigue diciendo cuándo se guardó');
ok(/inspector\.cite\.draftCarries/.test(PAGINA), 'y qué trae');

console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos > 0 ? 1 : 0);
