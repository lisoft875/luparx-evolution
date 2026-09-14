# =================================================================================================
# Cabeceras que deben salir en TODA respuesta.
#
# Viven en un archivo aparte por una trampa de nginx que no perdona: `add_header` dentro de un
# `location` NO se suma a las del `server`, las REEMPLAZA. Un bloque que añade `Cache-Control` pierde
# en silencio todas las de seguridad — y el sitio parece correcto, porque la única forma de notarlo
# es mirar las cabeceras de esa ruta en particular.
#
# Por eso esto se incluye en el `server` y OTRA VEZ en cada `location` que añada una cabecera propia.
#
# La extensión es .inc y no .conf a propósito: nginx carga solo todo /etc/nginx/conf.d/*.conf, y este
# archivo tiene que incluirse a mano, no cargarse por su cuenta.
# =================================================================================================

add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;

# STAGING: fuera de los buscadores. Una instalación de pruebas indexada compite con el sitio real por
# el mismo nombre y termina mostrándole a un ciudadano datos sembrados como si fueran suyos.
# QUITAR ESTA LÍNEA en producción — es lo único de este archivo que no sirve para ambos ambientes.
add_header X-Robots-Tag "noindex, nofollow" always;
