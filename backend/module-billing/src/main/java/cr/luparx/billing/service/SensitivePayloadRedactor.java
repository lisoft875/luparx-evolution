package cr.luparx.billing.service;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Limpia el cuerpo de una notificación de pasarela ANTES de guardarlo (CONTRACT.md v0.45).
 *
 * <h2>Por qué existe</h2>
 *
 * <p>{@code gateway_notifications.payload} guarda el cuerpo que mandó el proveedor, tal cual, para
 * siempre: es la evidencia de qué nos dijeron y cuándo. El problema es que lo que manda el
 * proveedor lo decide el proveedor. El día que uno incluya el número de tarjeta en su webhook
 * —algunos lo hacen, y la integración todavía no está hecha, así que nadie puede prometer que no—
 * ese número queda escrito en una tabla que no se reescribe. Eso es justamente lo que la regla
 * «no almacenar datos sensibles de tarjetas» prohíbe, y no es algo que se pueda arreglar después.</p>
 *
 * <p>Por eso la limpieza va <b>antes</b> de guardar y no depende de ningún proveedor: no sabe de
 * formatos ajenos, sólo de qué cosas no deben quedar escritas.</p>
 *
 * <h2>Qué NO toca</h2>
 *
 * <p>La huella {@code body_sha256} se calcula sobre el cuerpo <b>original</b>, no sobre éste: es lo
 * que detecta reenvíos del proveedor y lo que permitiría recomprobar una firma. Si la huella se
 * calculara sobre el texto limpio, dos cuerpos distintos que se limpian igual pasarían por el mismo,
 * y el descarte de duplicados dejaría de ser cierto.</p>
 *
 * <p>Y nadie vuelve a leer el payload guardado para procesarlo —verificado en el árbol: no hay un
 * solo lector—, así que limpiarlo no le quita función a nada. Si algún día hiciera falta
 * reprocesar, se le pide el evento al proveedor, que es el camino que el barrido ya usa.</p>
 */
public final class SensitivePayloadRedactor {

    /** Lo que queda en lugar de un número de tarjeta. Sin dígitos: no hace falta ninguno. */
    static final String PAN_OCULTO = "[DATO-DE-TARJETA-OCULTO]";

    /** Lo que queda en lugar del valor de un campo sensible. */
    static final String VALOR_OCULTO = "[OCULTO]";

    /**
     * Tope de lo que se guarda. Un cuerpo de un megabyte no es evidencia, es un adjunto: lo que un
     * auditor necesita está siempre al principio, y la huella del original sigue completa.
     */
    static final int TOPE = 16_384;

    static final String RECORTADO = "\n…[recortado: el cuerpo original excede " + TOPE + " caracteres]";

    /**
     * Nombres de campo cuyo VALOR nunca se guarda, venga como JSON o como formulario.
     *
     * <p>Se comparan sin distinguir mayúsculas ni separadores, así que {@code card_number},
     * {@code cardNumber} y {@code CARDNUMBER} son el mismo nombre.</p>
     */
    private static final Set<String> CAMPOS_PROHIBIDOS = Set.of(
            "cardnumber", "pan", "accountnumber", "primaryaccountnumber",
            "cvv", "cvv2", "cvc", "cvc2", "csc", "securitycode", "cardsecuritycode",
            "expiry", "expirydate", "expiration", "expirationdate", "expmonth", "expyear",
            "track1", "track2", "trackdata", "magstripe", "pin", "pinblock", "cardholdername");

    /** `"campo": "valor"` o `"campo":123` en JSON, y `campo=valor` en un formulario. */
    private static final Pattern CAMPO_JSON = Pattern.compile(
            "(\"([A-Za-z0-9_\\-]{2,40})\"\\s*:\\s*)(\"[^\"]*\"|-?\\d+(?:\\.\\d+)?|true|false|null)");
    private static final Pattern CAMPO_FORMULARIO = Pattern.compile(
            "(?<=^|[&;])([A-Za-z0-9_\\-]{2,40})=([^&;\\s]*)");

    /**
     * Una tira de 13 a 19 dígitos, admitiendo espacios o guiones entre grupos.
     *
     * <p>Los bordes impiden morder un número más largo por la mitad: un identificador de veinte
     * dígitos no es una tarjeta y no se toca.</p>
     */
    private static final Pattern POSIBLE_PAN = Pattern.compile(
            "(?<![0-9])(?:[0-9][ -]?){12,18}[0-9](?![0-9])");

    private SensitivePayloadRedactor() {
    }

    /** El cuerpo tal como debe quedar guardado. Nunca devuelve null. */
    public static String redact(String cuerpo) {
        if (cuerpo == null || cuerpo.isEmpty()) {
            return "";
        }
        String limpio = ocultarCampos(cuerpo);
        limpio = ocultarNumerosDeTarjeta(limpio);
        if (limpio.length() > TOPE) {
            limpio = limpio.substring(0, TOPE) + RECORTADO;
        }
        return limpio;
    }

    private static String ocultarCampos(String cuerpo) {
        StringBuilder salida = new StringBuilder();
        Matcher m = CAMPO_JSON.matcher(cuerpo);
        while (m.find()) {
            String reemplazo = esProhibido(m.group(2))
                    ? Matcher.quoteReplacement(m.group(1) + "\"" + VALOR_OCULTO + "\"")
                    : Matcher.quoteReplacement(m.group(0));
            m.appendReplacement(salida, reemplazo);
        }
        m.appendTail(salida);

        StringBuilder segunda = new StringBuilder();
        Matcher f = CAMPO_FORMULARIO.matcher(salida.toString());
        while (f.find()) {
            String reemplazo = esProhibido(f.group(1))
                    ? Matcher.quoteReplacement(f.group(1) + "=" + VALOR_OCULTO)
                    : Matcher.quoteReplacement(f.group(0));
            f.appendReplacement(segunda, reemplazo);
        }
        f.appendTail(segunda);
        return segunda.toString();
    }

    private static boolean esProhibido(String nombre) {
        String normalizado = nombre.replace("_", "").replace("-", "").toLowerCase(Locale.ROOT);
        return CAMPOS_PROHIBIDOS.contains(normalizado);
    }

    /**
     * Oculta lo que, además de tener forma de tarjeta, PASA LUHN.
     *
     * <p>Luhn es lo que separa un número de tarjeta de un identificador largo cualquiera. Sin esa
     * comprobación habría que elegir entre ocultar referencias legítimas —y dejar la evidencia
     * inservible— o no ocultar nada. Un falso positivo cuesta un número opaco en una copia de
     * evidencia; un falso negativo cuesta un número de tarjeta guardado para siempre.</p>
     */
    private static String ocultarNumerosDeTarjeta(String cuerpo) {
        StringBuilder salida = new StringBuilder();
        Matcher m = POSIBLE_PAN.matcher(cuerpo);
        while (m.find()) {
            String soloDigitos = m.group().replaceAll("[^0-9]", "");
            String reemplazo = pasaLuhn(soloDigitos) ? PAN_OCULTO : m.group();
            m.appendReplacement(salida, Matcher.quoteReplacement(reemplazo));
        }
        m.appendTail(salida);
        return salida.toString();
    }

    static boolean pasaLuhn(String digitos) {
        if (digitos.length() < 13 || digitos.length() > 19) {
            return false;
        }
        int suma = 0;
        boolean doblar = false;
        for (int i = digitos.length() - 1; i >= 0; i--) {
            int d = digitos.charAt(i) - '0';
            if (doblar) {
                d *= 2;
                if (d > 9) {
                    d -= 9;
                }
            }
            suma += d;
            doblar = !doblar;
        }
        return suma % 10 == 0;
    }
}
