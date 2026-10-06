/**
 * ¿Es esto una dirección IP?
 *
 * <h2>Por qué está acá y no sólo en el servidor</h2>
 *
 * <p>El servidor también la valida, y es el que manda: ésta no es la puerta, es el mensaje. Sin
 * ella, escribir `999.999.999.999` en el cotejo de direcciones de Auditoría sale a la red, gasta
 * crédito del limitador de intentos y vuelve como un error genérico. Con ella, la pantalla dice
 * qué está mal antes de que la petición salga —que es lo que pide el criterio de aceptación del
 * 05-10-2026— y el campo no puede producir un evento de bitácora.</p>
 *
 * <p>Las mismas reglas que `cr.luparx.core.net.IpAddresses`, a propósito y con el mismo detalle.
 * Son dos lenguajes, así que son dos implementaciones; si alguna vez discrepan, la del servidor es
 * la que decide y ésta es la que hay que corregir.</p>
 *
 * <h2>Lo que rechaza a propósito</h2>
 *
 * <ul>
 *   <li>ceros a la izquierda (`010.1.1.1`): hay librerías que leen `010` como octal;</li>
 *   <li>identificador de zona (`fe80::1%eth0`): es local a una máquina;</li>
 *   <li>prefijos (`10.0.0.0/8`) y puertos (`10.0.0.1:443`): esto coteja una dirección.</li>
 * </ul>
 */

/** `0000:0000:0000:0000:0000:ffff:255.255.255.255` — lo más largo que puede ser. */
const LARGO_MAXIMO = 45;
/** Una dirección IPv6 son ocho palabras de 16 bits. */
const PALABRAS = 8;

function esOcteto(parte: string): boolean {
  const largo = parte.length;
  if (largo < 1 || largo > 3) return false;
  if (largo > 1 && parte[0] === '0') return false;
  let valor = 0;
  for (let i = 0; i < largo; i++) {
    const c = parte.charCodeAt(i);
    if (c < 48 || c > 57) return false;
    valor = valor * 10 + (c - 48);
  }
  return valor <= 255;
}

/** Cuatro octetos decimales de 0 a 255, sin ceros a la izquierda. */
export function isIpv4(direccion: string): boolean {
  const partes = direccion.split('.');
  if (partes.length !== 4) return false;
  return partes.every((parte) => esOcteto(parte));
}

/**
 * Cuántas palabras de 16 bits consume este tramo separado por `:`, o -1 si no es válido.
 *
 * <p>Un tramo vacío son cero palabras: es lo que hay a cada lado de un `::` en los bordes. Una
 * IPv4 al final consume dos, porque es lo que ocupa.</p>
 */
function palabras(tramo: string, permiteIpv4AlFinal: boolean): number {
  if (tramo === '') return 0;
  const partes = tramo.split(':');
  let total = 0;
  for (let i = 0; i < partes.length; i++) {
    const parte = partes[i] ?? '';
    // Vacío acá significa dos puntos de más («1:::2») o uno pegado al borde («:1»).
    if (parte === '') return -1;
    const ultima = i === partes.length - 1;
    if (parte.includes('.')) {
      if (!ultima || !permiteIpv4AlFinal || !isIpv4(parte)) return -1;
      total += 2;
      continue;
    }
    if (parte.length > 4) return -1;
    if (!/^[0-9a-fA-F]+$/.test(parte)) return -1;
    total += 1;
    if (total > PALABRAS) return -1;
  }
  return total;
}

/**
 * IPv6, con una sola elisión `::` y con IPv4 embebida sólo al final.
 *
 * <p>La elisión representa UNA O MÁS palabras en cero (RFC 4291 §2.2), así que los dos tramos
 * juntos suman como máximo siete: con ocho no habría nada que elidir.</p>
 */
export function isIpv6(direccion: string): boolean {
  if (!direccion.includes(':') || direccion.includes('%') || direccion.includes('/')) return false;
  const elision = direccion.indexOf('::');
  if (elision >= 0 && direccion.indexOf('::', elision + 1) >= 0) return false;

  if (elision < 0) return palabras(direccion, true) === PALABRAS;
  // La IPv4 embebida sólo puede ir al final, o sea en el tramo de la derecha.
  const izquierda = palabras(direccion.slice(0, elision), false);
  const derecha = palabras(direccion.slice(elision + 2), true);
  if (izquierda < 0 || derecha < 0) return false;
  return izquierda + derecha <= PALABRAS - 1;
}

/** Verdadero si es una IPv4 o una IPv6 bien formada. Recorta los espacios de los bordes. */
export function isValidIpAddress(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  const direccion = value.trim();
  if (direccion === '' || direccion.length > LARGO_MAXIMO) return false;
  return isIpv4(direccion) || isIpv6(direccion);
}
