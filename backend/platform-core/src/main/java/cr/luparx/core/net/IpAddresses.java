package cr.luparx.core.net;

/**
 * ¿Es esto una dirección IP?
 *
 * <h2>Por qué existe</h2>
 *
 * <p>El 05-10-2026 se escribió {@code 999.999.999.999} en el cotejo de direcciones de Auditoría. El
 * servidor sólo comprobaba que el campo no estuviera vacío, así que hasheó ese texto, contó cero
 * coincidencias —que es la respuesta correcta para un valor que nadie pudo haber usado nunca—, la
 * pantalla lo mostró en verde como «ninguna entrada viene de esa dirección», y el cotejo quedó
 * registrado en la bitácora como una consulta legítima.</p>
 *
 * <p>Las tres consecuencias, en orden de gravedad: una pista de auditoría con entradas de consultas
 * que no consultaron nada; una respuesta en verde que se lee como «esta dirección queda descartada»
 * cuando lo que pasó es que la pregunta no tenía sentido; y un hash en la base de datos de algo que
 * no es una dirección.</p>
 *
 * <h2>Por qué no {@code InetAddress}</h2>
 *
 * <p>{@code InetAddress.getByName} resuelve nombres: pasarle lo que alguien escribió en un
 * formulario convierte una validación en una consulta DNS de salida, con lo que un texto cualquiera
 * se vuelve una petición a la red desde el servidor. {@code InetAddress.ofLiteral}, que sí es un
 * analizador estricto, llegó en Java 22 y esto corre en 21. Así que se analiza acá, sin red.</p>
 *
 * <h2>Lo que rechaza a propósito</h2>
 *
 * <ul>
 *   <li><b>Ceros a la izquierda</b> ({@code 010.1.1.1}): más de una librería lee {@code 010} como
 *       octal, o sea 8. Dos capas que leen el mismo texto como dos direcciones distintas es
 *       exactamente lo que no se quiere debajo de una pista de auditoría.</li>
 *   <li><b>Identificador de zona</b> ({@code fe80::1%eth0}): es local a una máquina y no identifica
 *       a nadie desde fuera, así que en una consulta de bitácora sólo puede ser un error de copia.</li>
 *   <li><b>Prefijos</b> ({@code 10.0.0.0/8}) y <b>puertos</b> ({@code 10.0.0.1:443}): esto coteja
 *       una dirección, no un rango ni un extremo de conexión.</li>
 * </ul>
 */
public final class IpAddresses {

    /** {@code 0000:0000:0000:0000:0000:ffff:255.255.255.255} — lo más largo que puede ser. */
    private static final int LARGO_MAXIMO = 45;
    /** Una dirección IPv6 son ocho palabras de 16 bits. */
    private static final int PALABRAS = 8;

    private IpAddresses() {
    }

    /** Verdadero si es una IPv4 o una IPv6 bien formada. Nunca lanza, y no toca la red. */
    public static boolean isValid(String value) {
        if (value == null) {
            return false;
        }
        String direccion = value.trim();
        if (direccion.isEmpty() || direccion.length() > LARGO_MAXIMO) {
            return false;
        }
        return isIpv4(direccion) || isIpv6(direccion);
    }

    /** Cuatro octetos decimales de 0 a 255, sin ceros a la izquierda. */
    public static boolean isIpv4(String direccion) {
        String[] partes = direccion.split("\\.", -1);
        if (partes.length != 4) {
            return false;
        }
        for (String parte : partes) {
            if (!esOcteto(parte)) {
                return false;
            }
        }
        return true;
    }

    private static boolean esOcteto(String parte) {
        int largo = parte.length();
        if (largo < 1 || largo > 3) {
            return false;
        }
        if (largo > 1 && parte.charAt(0) == '0') {
            return false;
        }
        int valor = 0;
        for (int i = 0; i < largo; i++) {
            char c = parte.charAt(i);
            if (c < '0' || c > '9') {
                return false;
            }
            valor = valor * 10 + (c - '0');
        }
        return valor <= 255;
    }

    /**
     * IPv6, con una sola elisión {@code ::} y con IPv4 embebida sólo al final.
     *
     * <p>La elisión representa UNA O MÁS palabras en cero (RFC 4291 §2.2), así que los dos tramos
     * juntos pueden sumar como máximo siete: con ocho no habría nada que elidir y {@code ::} estaría
     * de más.</p>
     */
    public static boolean isIpv6(String direccion) {
        if (direccion.indexOf(':') < 0 || direccion.indexOf('%') >= 0 || direccion.indexOf('/') >= 0) {
            return false;
        }
        int elision = direccion.indexOf("::");
        if (elision >= 0 && direccion.indexOf("::", elision + 1) >= 0) {
            return false;
        }

        if (elision < 0) {
            return palabras(direccion, true) == PALABRAS;
        }
        // La IPv4 embebida sólo puede ir al final, o sea en el tramo de la derecha.
        int izquierda = palabras(direccion.substring(0, elision), false);
        int derecha = palabras(direccion.substring(elision + 2), true);
        if (izquierda < 0 || derecha < 0) {
            return false;
        }
        return izquierda + derecha <= PALABRAS - 1;
    }

    /**
     * Cuántas palabras de 16 bits consume este tramo separado por {@code :}, o -1 si no es válido.
     *
     * <p>Un tramo vacío son cero palabras, que es lo que hay a cada lado de un {@code ::} en los
     * bordes. Una IPv4 al final consume dos, porque es lo que ocupa.</p>
     */
    private static int palabras(String tramo, boolean permiteIpv4AlFinal) {
        if (tramo.isEmpty()) {
            return 0;
        }
        String[] partes = tramo.split(":", -1);
        int total = 0;
        for (int i = 0; i < partes.length; i++) {
            String parte = partes[i];
            // Vacío acá significa dos puntos de más («1:::2») o uno pegado al borde («:1»).
            if (parte.isEmpty()) {
                return -1;
            }
            boolean ultima = i == partes.length - 1;
            if (parte.indexOf('.') >= 0) {
                if (!ultima || !permiteIpv4AlFinal || !isIpv4(parte)) {
                    return -1;
                }
                total += 2;
                continue;
            }
            if (parte.length() > 4) {
                return -1;
            }
            for (int j = 0; j < parte.length(); j++) {
                char c = parte.charAt(j);
                boolean hex = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
                if (!hex) {
                    return -1;
                }
            }
            total += 1;
            if (total > PALABRAS) {
                return -1;
            }
        }
        return total;
    }
}
