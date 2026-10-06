package cr.luparx.core.net;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Lo que entra y lo que no entra en el cotejo de direcciones de la bitácora.
 *
 * <p>El caso que motivó todo va primero y con nombre propio: {@code 999.999.999.999} pasaba, se
 * hasheaba y quedaba registrado como un cotejo legítimo.</p>
 */
class IpAddressesTest {

    @Test
    void rejectsTheAddressThatStartedThis() {
        assertThat(IpAddresses.isValid("999.999.999.999")).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "0.0.0.0",
            "1.2.3.4",
            "10.0.0.1",
            "192.168.0.255",
            "255.255.255.255",
    })
    void acceptsIpv4(String direccion) {
        assertThat(IpAddresses.isValid(direccion)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "256.1.1.1",          // un octeto de más
            "1.2.3",              // tres grupos
            "1.2.3.4.5",          // cinco
            "1.2.3.",             // punto suelto al final
            ".1.2.3",             // y al principio
            "010.1.1.1",          // cero a la izquierda: alguien lo leería como octal
            "1.2.3.04",
            "1.2.3.-4",
            "1.2.3.a",
            "0x7f.0.0.1",
            "10.0.0.1:443",       // un extremo de conexión, no una dirección
            "10.0.0.0/8",         // un rango
            "",
            "   ",
            "no es una ip",
    })
    void rejectsWhatIsNotIpv4(String direccion) {
        assertThat(IpAddresses.isValid(direccion)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "::",                                       // todo en cero
            "::1",                                      // la propia máquina
            "1::",
            "2001:db8::1",
            "2001:0db8:0000:0000:0000:0000:0000:0001",  // sin comprimir, ocho grupos
            "fe80::1ff:fe23:4567:890a",
            "1:2:3:4:5:6:7:8",
            "1:2:3:4:5:6:7::",                          // la elisión vale por una sola palabra
            "::ffff:192.168.0.1",                       // IPv4 embebida
            "64:ff9b::1.2.3.4",
            "FE80::1",                                  // hexadecimal en mayúsculas
    })
    void acceptsIpv6(String direccion) {
        assertThat(IpAddresses.isValid(direccion)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "1:2:3:4:5:6:7:8:9",      // nueve grupos
            "1:2:3:4:5:6:7",          // ocho hacen falta si no hay elisión
            "1::2::3",                // dos elisiones: no se sabe cuántos ceros va cada una
            "1:::2",
            ":1:2:3:4:5:6:7:8",
            "1:2:3:4:5:6:7:8:",
            "12345::1",               // cinco dígitos hexadecimales
            "2001:db8::g1",           // «g» no es hexadecimal
            "fe80::1%eth0",           // identificador de zona
            "2001:db8::/32",          // un prefijo
            "1.2.3.4::ffff",          // la IPv4 embebida va al final, no al principio
            "::ffff:999.999.999.999", // y tiene que ser una IPv4 de verdad
            "[2001:db8::1]",          // la forma para URLs, no la dirección
            ":",
            ":::",
    })
    void rejectsWhatIsNotIpv6(String direccion) {
        assertThat(IpAddresses.isValid(direccion)).isFalse();
    }

    @Test
    void trimsBeforeJudging() {
        assertThat(IpAddresses.isValid("  10.0.0.1  ")).isTrue();
        assertThat(IpAddresses.isValid(null)).isFalse();
    }

    @Test
    void rejectsSomethingLongerThanAnyAddress() {
        assertThat(IpAddresses.isValid("0".repeat(60))).isFalse();
    }
}
