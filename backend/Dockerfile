# syntax=docker/dockerfile:1.7
# ^ obligatoria y en la PRIMERA línea: habilita --mount=type=cache más abajo.
# =================================================================================================
# Imagen del backend de LupaRX. Dos etapas: se compila con Maven y el JDK, se ejecuta con el JRE.
#
# La imagen final NO lleva Maven, ni el código fuente, ni el repositorio ~/.m2 — sólo el jar y un
# runtime. Es la diferencia entre ~700 MB y ~250 MB, y sobre todo la diferencia entre una superficie
# de ataque con compilador y una sin él.
#
# El repositorio de Maven va en una CACHÉ DE BUILDKIT (--mount=type=cache) y no en una capa: así un
# despliegue que sólo toca código reutiliza lo ya descargado sin que las dependencias terminen dentro
# de la imagen. En una instancia pequeña eso son varios minutos por despliegue.
#
# La alternativa habitual —copiar los pom.xml primero y correr `dependency:go-offline`— NO sirve en
# este repositorio: es un reactor multi-módulo y `app` depende de `platform-core`, `module-geo` y los
# demás, que en ese momento todavía no están construidos. Maven los busca entonces en Maven Central,
# no los encuentra y el build falla antes de compilar una sola clase.
# =================================================================================================

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src

COPY . .

# Las pruebas corren en CI (.github/workflows/ci.yml), con su propio PostgreSQL. Repetirlas acá
# obligaría a levantar una base dentro del build y duplicaría el tiempo de cada despliegue.
#
# El jar se renombra a uno fijo: la etapa de runtime no tiene por qué saber el número de versión, y
# un comodín en el ENTRYPOINT es lo que hace que un target/ sucio arranque el jar equivocado.
RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    mvn -B -ntp -DskipTests package \
 && cp app/target/luparx-app-*.jar /src/luparx-app.jar

# -------------------------------------------------------------------------------------------------

FROM eclipse-temurin:21-jre AS runtime

# curl es para el HEALTHCHECK; sin él Docker no sabe distinguir «arrancando» de «caído».
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Nunca root: si algún día una ruta de subida de archivos escapa del directorio previsto, que escape
# con los permisos de una cuenta que no puede escribir en ningún otro lado.
RUN useradd --system --uid 10001 --create-home --shell /usr/sbin/nologin luparx

WORKDIR /app
COPY --from=build /src/luparx-app.jar /app/luparx-app.jar

# La evidencia fotográfica y los documentos de permisos se escriben acá (FilesystemEvidenceStorage).
# Es un volumen en compose: si viviera en la capa del contenedor, cada despliegue borraría las fotos.
RUN mkdir -p /var/lib/luparx/evidence && chown -R luparx:luparx /var/lib/luparx /app
ENV EVIDENCE_ROOT=/var/lib/luparx/evidence

USER luparx
EXPOSE 8090

# MaxRAMPercentage y no -Xmx: la JVM lee el límite del cgroup del contenedor, así que el mismo
# comando se comporta bien en una instancia de 1 GB y en una de 8 sin tocar nada.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError -Djava.security.egd=file:/dev/./urandom"

HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=10 \
  CMD curl -fsS http://127.0.0.1:8090/actuator/health/readiness || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/luparx-app.jar"]
