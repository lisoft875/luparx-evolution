/**
 * Las dos conversiones de «día escrito» a «instante», y por qué ya no revientan.
 *
 * <h2>El defecto que las trajo acá (24-09-2026)</h2>
 *
 * <p>Estas dos funciones estaban duplicadas, palabra por palabra, en `AuditPage` y en
 * `DashboardPage`. Las dos hacían `new Date(...).toISOString()` sin comprobar nada, y
 * {@code toISOString()} **lanza** `RangeError: Invalid time value` cuando la fecha no es válida.</p>
 *
 * <p>En el Panel eso no se notaba porque hay un botón «Aplicar» de por medio: la conversión ocurre
 * cuando la persona terminó de escribir. En Auditoría no lo hay —cada tecla dispara la consulta— así
 * que el valor intermedio llega directo a `toISOString()`. Y un `<input type="date">` produce
 * valores intermedios que **no** son fechas: basta un dígito de más en el año para que quede
 * {@code "20265-09-07"}, que en ISO 8601 no es un año de cinco cifras sino nada —los años
 * expandidos exigen signo, {@code "+020265"}— con lo cual `new Date` devuelve `Invalid Date`.</p>
 *
 * <p>Ese `RangeError` sube desde el cuerpo del componente. React no atrapa eso: desmonta el árbol.
 * La pantalla desaparece mientras alguien escribe una fecha, que es exactamente como se reportó.</p>
 *
 * <h2>La decisión</h2>
 *
 * <p>Devolver `undefined` en vez de lanzar. Un filtro que no se puede interpretar es un filtro que
 * no se aplica —la consulta sale sin ese extremo del rango, que es lo que la pantalla hacía cuando
 * el campo estaba vacío— y no una pantalla que se cierra. Una función que se llama en cada
 * pulsación de tecla, dentro del render, no puede tener un modo «lanzo y que alguien vea».</p>
 *
 * <p>Y viven en un solo archivo. Estaban copiadas en dos pantallas y sólo una estaba protegida por
 * accidente; el arreglo en una no habría llegado nunca a la otra.</p>
 */

/**
 * Cuántos caracteres puede tener el año de una fecha ISO sin signo.
 *
 * <p>Cuatro. No es un límite nuestro: es el formato. `new Date('20265-01-01T00:00:00')` no es una
 * fecha del año 20265, es `Invalid Date`.</p>
 */
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function medianoche(dia: string): Date | null {
  // La forma con hora explícita se interpreta en la zona de quien lee; la forma corta, en UTC. La
  // diferencia son las seis horas que deciden si las primeras entradas del día aparecen, así que se
  // escribe entera en vez de dejarla parecer un descuido.
  if (!DIA_ISO.test(dia)) return null;
  const fecha = new Date(`${dia}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return null;

  // Y se comprueba que el día que salió sea el día que entró.
  //
  // JavaScript NO rechaza «2026-02-31»: lo desborda al 3 de marzo. Un `hasta` que en silencio se
  // corre tres días devuelve un resultado equivocado con cara de correcto, que es peor que un
  // error. Un `<input type="date">` nunca produce esa cadena, pero esta función ya vive fuera de
  // una sola pantalla y no puede confiar en quién la llama.
  const [anio, mes, dias] = dia.split('-').map(Number);
  const coincide =
    fecha.getFullYear() === anio && fecha.getMonth() + 1 === mes && fecha.getDate() === dias;
  return coincide ? fecha : null;
}

/**
 * La medianoche del día escrito, en la zona de quien lee.
 *
 * @returns el instante en ISO, o `undefined` si lo escrito todavía no es un día — en cuyo caso
 *          quien llama debe omitir el filtro, no inventarse uno
 */
export function startOfDay(dia: string): string | undefined {
  return medianoche(dia)?.toISOString();
}

/**
 * El instante en que termina el día escrito, que es el comienzo del siguiente.
 *
 * <p>La ventana de la API es semiabierta (`>= desde`, `< hasta`), así que un «hasta el 9» que
 * excluyera lo que pasó el 9 sería una mentira silenciosa.</p>
 */
export function startOfNextDay(dia: string): string | undefined {
  const fecha = medianoche(dia);
  if (fecha === null) return undefined;
  fecha.setDate(fecha.getDate() + 1);
  return Number.isNaN(fecha.getTime()) ? undefined : fecha.toISOString();
}
