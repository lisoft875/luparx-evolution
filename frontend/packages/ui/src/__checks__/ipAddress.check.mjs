/**
 * Comprobaciones del validador de direcciones IP del cliente.
 *
 * <p>Los mismos casos que `IpAddressesTest` en el backend, y por una razón: son dos
 * implementaciones de la misma regla en dos lenguajes, y la única forma de que no se separen es que
 * las dos respondan a la misma lista. Si alguna vez discrepan, manda la del servidor.</p>
 *
 *   node packages/ui/src/__checks__/ipAddress.check.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = new URL('../../../..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'ipaddr-'));
try {
  // Se compila el TS real, no una copia: una prueba contra una transcripción a mano comprueba la
  // transcripción, no el código que se despliega.
  execFileSync(
    join(raiz, 'node_modules/.bin/tsc'),
    ['--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
     '--strict', '--skipLibCheck', '--outDir', dir,
     join(raiz, 'packages/ui/src/ipAddress.ts')],
    { stdio: 'pipe' },
  );
} catch (e) {
  const salida = String(e.stdout || '') + String(e.stderr || '');
  console.error(salida);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}

const { isValidIpAddress } = await import(join(dir, 'ipAddress.js'));

let fallos = 0;
const check = (nombre, cond, detalle = '') => {
  if (cond) console.log(`  ok  ${nombre}`);
  else {
    fallos++;
    console.log(`  ✗   ${nombre}${detalle ? ' — ' + detalle : ''}`);
  }
};

// El caso que motivó todo, con nombre propio.
check('999.999.999.999 se rechaza', isValidIpAddress('999.999.999.999') === false);

const VALIDAS = [
  '0.0.0.0',
  '1.2.3.4',
  '10.0.0.1',
  '192.168.0.255',
  '255.255.255.255',
  '  10.0.0.1  ',
  '::',
  '::1',
  '1::',
  '2001:db8::1',
  '2001:0db8:0000:0000:0000:0000:0000:0001',
  'fe80::1ff:fe23:4567:890a',
  '1:2:3:4:5:6:7:8',
  '1:2:3:4:5:6:7::',
  '::ffff:192.168.0.1',
  '64:ff9b::1.2.3.4',
  'FE80::1',
];

const INVALIDAS = [
  '256.1.1.1',
  '1.2.3',
  '1.2.3.4.5',
  '1.2.3.',
  '.1.2.3',
  '010.1.1.1',
  '1.2.3.04',
  '1.2.3.-4',
  '1.2.3.a',
  '0x7f.0.0.1',
  '10.0.0.1:443',
  '10.0.0.0/8',
  '',
  '   ',
  'no es una ip',
  '1:2:3:4:5:6:7:8:9',
  '1:2:3:4:5:6:7',
  '1::2::3',
  '1:::2',
  ':1:2:3:4:5:6:7:8',
  '1:2:3:4:5:6:7:8:',
  '12345::1',
  '2001:db8::g1',
  'fe80::1%eth0',
  '2001:db8::/32',
  '1.2.3.4::ffff',
  '::ffff:999.999.999.999',
  '[2001:db8::1]',
  ':',
  ':::',
  '0'.repeat(60),
  null,
  undefined,
];

for (const direccion of VALIDAS) {
  check(`válida: ${JSON.stringify(direccion)}`, isValidIpAddress(direccion) === true);
}
for (const direccion of INVALIDAS) {
  check(`inválida: ${JSON.stringify(direccion)}`, isValidIpAddress(direccion) === false);
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${VALIDAS.length + INVALIDAS.length + 1} casos · ${fallos} fallos`);
process.exit(fallos > 0 ? 1 : 0);
