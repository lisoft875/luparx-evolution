// Comprobaciones de dateRange: lo que un campo de fecha produce mientras alguien escribe.
//
// El caso que originó esto: en Auditoría, cambiando fechas, la pantalla se cerró. La causa era
// `toISOString()` sobre un `Invalid Date`, que LANZA, dentro del render, en cada pulsación.
//
// La copia de las funciones vive acá porque este comprobador corre con node a secas, sin
// TypeScript ni bundler. Si divergen, el último caso lo grita.
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function medianoche(dia) {
  if (!DIA_ISO.test(dia)) return null;
  const fecha = new Date(`${dia}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return null;
  const [anio, mes, dias] = dia.split('-').map(Number);
  const coincide =
    fecha.getFullYear() === anio && fecha.getMonth() + 1 === mes && fecha.getDate() === dias;
  return coincide ? fecha : null;
}
const startOfDay = (dia) => medianoche(dia)?.toISOString();
const startOfNextDay = (dia) => {
  const f = medianoche(dia);
  if (f === null) return undefined;
  f.setDate(f.getDate() + 1);
  return Number.isNaN(f.getTime()) ? undefined : f.toISOString();
};

let fallos = 0;
const ok = (c, m) => {
  if (!c) {
    console.log('  FALLA:', m);
    fallos++;
  } else console.log('  ok  ', m);
};

console.log('lo que el navegador manda mientras se escribe el año');
// Éste es el caso real: un dígito de más y el año tiene cinco cifras. En ISO 8601 un año expandido
// exige signo (+020265), así que «20265-09-07» no es el año 20265: no es nada.
ok(startOfDay('20265-09-07') === undefined, 'un año de cinco cifras no revienta, devuelve undefined');
ok(startOfNextDay('20265-09-07') === undefined, 'y el extremo superior tampoco');
ok(startOfDay('') === undefined, 'la cadena vacía no revienta');
ok(startOfDay('2026-09') === undefined, 'una fecha a medias no revienta');
ok(startOfDay('abc') === undefined, 'basura no revienta');

console.log('fechas que existen y fechas que no');
ok(typeof startOfDay('2026-09-07') === 'string', 'un día normal se convierte');
ok(startOfDay('2026-02-31') === undefined, 'el 31 de febrero no existe y se rechaza');
ok(startOfDay('2026-13-01') === undefined, 'el mes 13 tampoco');
ok(typeof startOfDay('2024-02-29') === 'string', 'el 29 de febrero de un bisiesto sí existe');

console.log('la ventana es semiabierta');
// Un «hasta el 9» que excluyera lo que pasó el 9 sería una mentira silenciosa.
const finDelNueve = startOfNextDay('2026-09-09');
ok(finDelNueve !== undefined && finDelNueve.startsWith('2026-09-10'), 'el fin del 9 es el comienzo del 10');
const finDeMes = startOfNextDay('2026-09-30');
ok(finDeMes !== undefined && finDeMes.startsWith('2026-10-01'), 'el fin del 30 de septiembre cruza al mes siguiente');
const finDeAnio = startOfNextDay('2026-12-31');
ok(finDeAnio !== undefined && finDeAnio.startsWith('2027-01-01'), 'el fin del 31 de diciembre cruza al año siguiente');

console.log('el año 0002, que es por donde pasa el navegador al escribir 2026');
// Es una fecha VÁLIDA: no revienta y no debe rechazarse. Lo que hace es pedir un rango de dos mil
// años, y ése es un problema de rendimiento —el que el botón «Aplicar» del Panel resuelve—, no de
// corrección. Se comprueba para que nadie lo «arregle» rechazándolo.
ok(typeof startOfDay('0002-09-07') === 'string', 'el año 0002 es una fecha válida y se acepta');

console.log(`\n${fallos} fallos`);
process.exit(fallos > 0 ? 1 : 0);
