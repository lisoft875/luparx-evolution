/**
 * La carrocería que la persona eligió para cada vehículo, guardada en ESTE dispositivo.
 *
 * <h2>Por qué no va al servidor, que es donde debería ir</h2>
 *
 * <p>Porque el servidor no tiene dónde ponerla, y comprobarlo fue el primer paso del trabajo. El
 * enum `VehicleType` del backend tiene <b>dos</b> valores, `CAR` y `MOTORCYCLE`; `V16_0` retiró
 * PICKUP, VAN y OTHER con una razón escrita —«ninguna tarifa, ningún reporte y ninguna regla de
 * fiscalización distinguía una pick-up de un sedán»— y la tabla `vehicles` lo sostiene con un
 * CHECK. No hay columna de carrocería, no hay campo libre que no sea marca, modelo o apodo, y
 * `VehicleService` <b>rechaza con 400</b> cualquier `type` fuera de los dos: mandar `SEDAN` no
 * guardaría un sedán, devolvería un error de validación.</p>
 *
 * <p>Las alternativas que no se tomaron, dichas para que no haya que redescubrirlas:</p>
 *
 * <ul>
 *   <li><b>Escribirla en `model` o en el apodo.</b> Son datos de la persona y el emparejamiento ya
 *       lee `model`: meter «SUV» ahí ensucia el dato y envenena la tabla de modelos.</li>
 *   <li><b>Una migración que agregue la columna.</b> Es lo correcto a futuro y no es de este
 *       encargo: la orden es Ciudadano, y tocar base de datos y contrato necesita aprobación
 *       aparte. Cuando llegue, este módulo se borra y la carrocería viaja en el DTO.</li>
 * </ul>
 *
 * <h2>Qué significa «este dispositivo», con todas sus letras</h2>
 *
 * <p>La elección vive en `localStorage` del navegador donde se hizo. <b>No</b> viaja a otro
 * teléfono, <b>no</b> la ve el inspector y se pierde si la persona borra los datos del sitio.
 * Cuando no está, la imagen vuelve a elegirse sola por marca y modelo, que es exactamente lo que
 * hacía antes de este cambio: perderla degrada, no rompe.</p>
 *
 * <p>Lo que SÍ viaja al servidor es lo que el servidor entiende: automóvil o motocicleta. La
 * pregunta del formulario es una sola, y por debajo se parte en dos destinos.</p>
 *
 * <h2>Por qué un almacén suscribible y no leer `localStorage` en cada render</h2>
 *
 * <p>Porque la imagen se dibuja en cuatro pantallas —la lista, el Inicio, la sesión activa y el
 * selector de Estacionar— y al guardar una carrocería nueva las cuatro tienen que enterarse. Con
 * `useSyncExternalStore` se enteran solas; leyendo el almacenamiento en cada render, la tarjeta
 * que no se volvió a montar seguiría mostrando la imagen vieja hasta recargar.</p>
 */
import { useSyncExternalStore } from 'react';

/**
 * Una clave por portal y con versión, como `packages/auth/src/storage.ts`.
 *
 * <p>La versión no es decorativa: si algún día cambia la forma de lo guardado, se sube el número y
 * lo viejo se ignora solo, en vez de intentar leer con la forma nueva algo escrito con la vieja.</p>
 */
const CLAVE = 'luparx.citizen.carroceria.v1';

/** Lo último leído o escrito. `useSyncExternalStore` exige una referencia estable entre renders. */
let memoria: Readonly<Record<string, string>> | null = null;
const VACIO: Readonly<Record<string, string>> = Object.freeze({});

const oyentes = new Set<() => void>();

function avisar(): void {
  for (const oyente of oyentes) oyente();
}

/**
 * Lee el mapa completo.
 *
 * <p>Todo envuelto en `try`: en navegación privada, con los datos del sitio bloqueados o en un
 * entorno sin `window`, `localStorage` lanza al tocarlo. Un dibujo de vehículo no es motivo para
 * tumbar una pantalla.</p>
 */
function leerTodo(): Readonly<Record<string, string>> {
  if (memoria) return memoria;
  try {
    const crudo = globalThis.localStorage?.getItem(CLAVE);
    if (!crudo) {
      memoria = VACIO;
      return memoria;
    }
    const leido: unknown = JSON.parse(crudo);
    if (!leido || typeof leido !== 'object' || Array.isArray(leido)) {
      memoria = VACIO;
      return memoria;
    }
    // Sólo pares de cadenas: lo que no lo sea se descarta en vez de llegar como `undefined` a
    // quien lo use. Lo escrito por una versión futura con otra forma se ignora, no rompe.
    const limpio: Record<string, string> = {};
    for (const [id, valor] of Object.entries(leido as Record<string, unknown>)) {
      if (typeof valor === 'string' && valor) limpio[id] = valor;
    }
    memoria = Object.freeze(limpio);
  } catch {
    memoria = VACIO;
  }
  return memoria;
}

function escribirTodo(mapa: Record<string, string>): void {
  memoria = Object.freeze({ ...mapa });
  try {
    globalThis.localStorage?.setItem(CLAVE, JSON.stringify(memoria));
  } catch {
    // Sin espacio o con el almacenamiento bloqueado: la elección vale para esta sesión y se pierde
    // al recargar. Es peor perderla en silencio que tumbar el formulario al guardar un vehículo.
  }
  avisar();
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** La carrocería elegida para un vehículo, o `null`. Fuera de React. */
export function leerCarroceriaElegida(vehicleId: string | undefined): string | null {
  if (!vehicleId) return null;
  return leerTodo()[vehicleId] ?? null;
}

/** Guarda la elección, o la borra si llega `null`. */
export function guardarCarroceriaElegida(vehicleId: string, carroceria: string | null): void {
  const actual = leerTodo();
  if ((actual[vehicleId] ?? null) === (carroceria ?? null)) return;
  const siguiente = { ...actual };
  if (carroceria) siguiente[vehicleId] = carroceria;
  else delete siguiente[vehicleId];
  escribirTodo(siguiente);
}

/**
 * Olvida la elección de un vehículo que ya no existe.
 *
 * <p>Se llama al eliminar. Sin esto el mapa crece para siempre, y —peor— el día que el servidor
 * reutilizara un identificador, el vehículo nuevo heredaría la carrocería del borrado.</p>
 */
export function olvidarCarroceriaElegida(vehicleId: string): void {
  guardarCarroceriaElegida(vehicleId, null);
}

/**
 * La carrocería elegida, dentro de React y al día.
 *
 * <p>Se vuelve a dibujar cuando se guarda una elección en esta pestaña y también cuando se guarda
 * en otra: el evento `storage` sólo lo reciben las demás pestañas, así que hacen falta los dos
 * avisos para que las cuatro pantallas digan lo mismo.</p>
 */
export function useCarroceriaElegida(vehicleId: string | undefined): string | null {
  const mapa = useSyncExternalStore(suscribir, leerTodo, () => VACIO);
  return vehicleId ? (mapa[vehicleId] ?? null) : null;
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (evento) => {
    if (evento.key !== null && evento.key !== CLAVE) return;
    memoria = null;
    avisar();
  });
}

/** Sólo para las pruebas: vacía la memoria para que la siguiente lectura vuelva al almacenamiento. */
export function olvidarTodoEnMemoria(): void {
  memoria = null;
}
