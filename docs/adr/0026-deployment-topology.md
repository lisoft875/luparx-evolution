# 0026 — Despliegue en una instancia: un dominio con rutas, imágenes construidas en el servidor

- **Estado**: Aceptado
- **Fecha**: 2026-09-12

## Contexto

Hasta ahora LupaRX sólo corría en la laptop de quien la desarrolla: `infra/docker-compose.yml` levanta
PostgreSQL y Mailpit, el backend arranca con Maven y cada portal con su propio Vite en su propio
puerto (docs/PORTS.md). No había forma de que otra persona la viera funcionando.

Aparece la primera instancia real: una máquina de AWS Lightsail con Docker, que ya sirve otro sitio
del mismo dueño. El objetivo es **mostrar el producto**, no operar una municipalidad: cinco
municipalidades de prueba, datos sembrados, y un dominio al que se le pueda mandar el enlace a
alguien.

Cuatro portales (`citizen`, `admin`, `inspector`, `platform`) más una API, en una instancia chica,
compartida con otro sitio.

## Alternativas consideradas

### Dónde vive cada portal

1. **Un subdominio por portal** (`app.`, `admin.`, `inspector.`, `platform.`, `api.`). Es lo correcto
   a futuro y lo que este ADR recomienda para producción: cada portal es su propio origen, así que el
   `localStorage` de uno es inalcanzable desde otro y un XSS en el portal público no puede leer la
   sesión de un funcionario de plataforma. Rechazada **hoy**: son cinco registros DNS y cinco
   certificados para una demostración, y obliga a CORS entre portales y API desde el primer día.
2. **Un dominio con rutas** (elegida): `/` el ciudadano, `/admin/`, `/inspector/`, `/platform/`, y
   `/api/` el backend. Un registro DNS, un certificado, ningún CORS —todo es el mismo origen—. El
   costo, escrito para que nadie lo descubra después: **los cuatro portales comparten origen**, y con
   él el almacenamiento del navegador. Lo que hace que esto sea aceptable y no temerario es que el
   almacenamiento de sesión ya estaba separado por portal desde antes (`storageKeyFor(portal)` en
   `packages/auth`), así que las sesiones no se pisan; lo que no se puede prometer es aislamiento
   frente a un XSS. Para una instancia de demostración con datos sembrados, es un riesgo proporcionado;
   para una instalación con municipalidades reales, no lo es, y por eso la alternativa 1 queda escrita
   acá y no en una conversación.

### Cómo llega el código

3. **Construir imágenes en CI y publicarlas en un registro** (GHCR), que el servidor sólo baja. Es lo
   reproducible: la imagen que se probó es exactamente la que corre, el servidor no necesita compilar
   y el rollback es una etiqueta. Rechazada por ahora por decisión explícita del dueño del producto:
   una pieza más (registro, credenciales, permisos del paquete) para una instancia que todavía cambia
   varias veces al día.
4. **Clonar el repositorio en el servidor y construir ahí** (elegida). `scripts/deploy.sh` hace
   `git pull --ff-only`, construye y recambia. Consecuencias asumidas: el servidor necesita memoria
   para compilar (Maven y cuatro builds de Vite; en menos de ~3.5 GB entre RAM y swap el script
   avisa), y «lo que corre» es «lo que estaba en `main` a esa hora». El script mitiga lo segundo
   etiquetando cada imagen con el hash del commit y guardando la anterior como `:previous`, que es lo
   que hace posible `--rollback`.

### Con qué datos

5. **Perfil `dev` en el servidor.** Es lo que ya siembra las cinco municipalidades, así que era la vía
   corta. **Rechazada, y con énfasis**: `dev` genera un par de llaves de firma efímero cuando no
   encuentra el de disco —cada reinicio deja a todo el mundo afuera y nadie custodia la llave
   privada—, trae la pimienta del hash de IP escrita en el repositorio, y registra cada consulta SQL.
   Eso es razonable en una laptop y no lo es en una máquina con dirección pública.
6. **Perfil `demo` propio** (elegida): los mismos sembradores (`@Profile({"dev","demo"})`), con llaves
   en disco obligatorias, sin SQL en el log y con la pimienta como variable de entorno. El sembrado
   sigue siendo idempotente y se apaga con `LUPARX_DEV_SEED_DEMO_DATA=false`. Los endpoints de
   conveniencia del desarrollo —recargar la billetera a mano, el checkout simulado, la pasarela de
   pago de mentira— **siguen siendo sólo de `dev`**: en una máquina pública, «regalar saldo» no puede
   ser una ruta HTTP.

## Decisión

Un dominio con rutas, servido por un nginx propio que además hace de proxy a la API; imágenes
construidas en el servidor a partir del repositorio; perfil `demo` para los datos. El TLS lo termina
el proxy que ya tiene la instancia — este despliegue publica sólo en `127.0.0.1` — y para una máquina
sin proxy hay un Caddy opcional (`--profile edge`).

## Consecuencias

- **A favor**: un DNS, un certificado, cero CORS; un solo comando para desplegar y otro para volver
  atrás; respaldo automático de la base antes de cada migración; ninguna credencial en el repositorio.
- **En contra**: origen compartido entre portales (arriba); el servidor compila, así que un despliegue
  tarda minutos y depende de la memoria de la instancia; sin registro de imágenes, reconstruir una
  versión vieja exige volver a compilar ese commit.
- **Impacto de migración**: ninguno sobre datos. Sí sobre el frontend: los portales ahora se compilan
  con un prefijo (`VITE_BASE_PATH`) y el enrutador lo respeta (`basename`), y las rutas de los assets
  de marca se arman desde `import.meta.env.BASE_URL` en vez de escribirse como `/brand/…`. En
  desarrollo el prefijo es `/` y no cambia nada.
- **Vuelta atrás**: `scripts/deploy.sh --rollback` recupera las imágenes anteriores. Lo que **no**
  vuelve solo es el esquema: Flyway ya migró. Por eso el respaldo previo es parte del script y no una
  recomendación.
- **Cuándo se revisa**: cuando esta instancia deje de ser una demostración. Datos reales de una
  municipalidad piden, en este orden, subdominios por portal (alternativa 1), imágenes construidas en
  CI (alternativa 3) y el almacenamiento de evidencia fuera del disco del contenedor.
