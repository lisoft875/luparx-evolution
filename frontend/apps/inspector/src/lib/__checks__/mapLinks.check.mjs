// Comprobaciones de mapLinks: el formato de la coordenada, que es donde esto se rompe.
const coordenada = (v) => v.toFixed(6);
const posicionUsable = (lat, lon) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  return !(lat === 0 && lon === 0);
};
const enlaceGoogleMaps = (lat, lon) =>
  posicionUsable(lat, lon)
    ? `https://www.google.com/maps/search/?api=1&query=${coordenada(lat)},${coordenada(lon)}`
    : null;
const enlaceWaze = (lat, lon) =>
  posicionUsable(lat, lon)
    ? `https://waze.com/ul?ll=${coordenada(lat)}%2C${coordenada(lon)}&navigate=yes`
    : null;

let fallos = 0;
const ok = (c, m) => { if (!c) { console.log('  FALLA:', m); fallos++; } else console.log('  ok  ', m); };

console.log('una posición de San José');
const LAT = 9.9333, LON = -84.0833;
ok(enlaceGoogleMaps(LAT, LON) === 'https://www.google.com/maps/search/?api=1&query=9.933300,-84.083300',
   'Google Maps recibe la coordenada con punto decimal y coma de separación');
ok(enlaceWaze(LAT, LON) === 'https://waze.com/ul?ll=9.933300%2C-84.083300&navigate=yes',
   'Waze recibe la coma codificada, que es la que documenta');

console.log('la trampa de la configuración regional');
// En es-CR la coma ES el separador decimal: un formateador regional escribiria «9,933300», y
// entonces la coma de separacion del parametro deja de distinguirse de la del decimal.
ok(!enlaceGoogleMaps(LAT, LON).includes('9,9'), 'la latitud NO sale con coma decimal');
ok(enlaceGoogleMaps(LAT, LON).split('query=')[1].split(',').length === 2,
   'y el parámetro sigue teniendo exactamente dos partes');

console.log('lo que no se manda a un mapa');
ok(enlaceGoogleMaps(0, 0) === null, 'el (0,0) del Golfo de Guinea no es una posición, es un receptor vacío');
ok(enlaceWaze(0, 0) === null, '  y Waze tampoco lo recibe');
ok(enlaceGoogleMaps(NaN, LON) === null, 'un NaN no construye una URL');
ok(enlaceGoogleMaps(LAT, Infinity) === null, 'un infinito tampoco');
ok(enlaceGoogleMaps(95, 0) === null, 'una latitud imposible tampoco');
ok(enlaceGoogleMaps(0, 200) === null, 'ni una longitud imposible');

console.log('los bordes que SÍ son validos');
ok(enlaceGoogleMaps(0, -84.08) !== null, 'latitud cero con longitud real es el ecuador, y existe');
ok(enlaceGoogleMaps(-90, 180) !== null, 'los extremos del rango son posiciones legítimas');

console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos > 0 ? 1 : 0);
