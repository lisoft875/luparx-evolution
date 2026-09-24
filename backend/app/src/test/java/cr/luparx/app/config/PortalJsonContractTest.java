package cr.luparx.app.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import cr.luparx.core.domain.Portal;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * El formato de cable de {@link Portal}.
 *
 * <p>Esta prueba existe por un defecto que no fallaba: Jackson serializaba el enum por
 * {@code name()}, así que el navegador recibía {@code "INSPECTOR"} mientras el cliente —su tipo, sus
 * URLs, sus claves de traducción— escribe {@code inspector}. Ninguna excepción, ningún 500. Lo que
 * había era un modal de «cambiar rol» que ofrecía cero opciones, pantallas de fiscalización sin un
 * solo fiscalizador que filtrar, y una clave de traducción cruda impresa en medio de una frase.</p>
 *
 * <p>Un desajuste que no lanza sólo lo encuentra alguien probando a mano, y ya costó una sesión de
 * pruebas del 24-09-2026. Escrito acá, lo encuentra quien lo rompa.</p>
 */
class PortalJsonContractTest {

    private final ObjectMapper mapper = construir();

    private static ObjectMapper construir() {
        Jackson2ObjectMapperBuilder builder = Jackson2ObjectMapperBuilder.json();
        new JacksonConfiguration().luparxJacksonCustomizer().customize(builder);
        return builder.build();
    }

    @Test
    void unPortalSeEscribeComoSuSlug() throws Exception {
        for (Portal portal : Portal.values()) {
            assertThat(mapper.writeValueAsString(portal))
                    .as("serialización de %s", portal)
                    .isEqualTo("\"" + portal.slug() + "\"");
        }
    }

    @Test
    void seLeeElSlug() throws Exception {
        for (Portal portal : Portal.values()) {
            assertThat(mapper.readValue("\"" + portal.slug() + "\"", Portal.class)).isEqualTo(portal);
        }
    }

    @Test
    void tambienSeLeeElNombreDelEnum() throws Exception {
        // Tolerante a la entrada a propósito: lo que ya esté mandando «ADMIN» no debe romperse el día
        // en que cambió la salida.
        for (Portal portal : Portal.values()) {
            assertThat(mapper.readValue("\"" + portal.name() + "\"", Portal.class)).isEqualTo(portal);
        }
    }

    @Test
    void loQueVaYVuelveEsLoMismo() throws Exception {
        for (Portal portal : Portal.values()) {
            String json = mapper.writeValueAsString(portal);
            assertThat(mapper.readValue(json, Portal.class)).isEqualTo(portal);
        }
    }
}
