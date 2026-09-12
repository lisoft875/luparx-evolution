# =================================================================================================
# Imagen del backend de LupaRX. Dos etapas: se compila con Maven y el JDK, se ejecuta con el JRE.
#
# La imagen final NO lleva Maven, ni el código fuente, ni el repositorio ~/.m2 — sólo el jar y un
# runtime. Es la diferencia entre ~700 MB y ~250 MB, y sobre todo la diferencia entre una superficie
# de ataque con compilador y una sin él.
#
# Los pom.xml se copian antes que el código a propósito: mientras no cambien las dependencias, la
# capa de descarga se reutiliza y un despliegue que sólo toca código no vuelve a bajar Maven Central.
# En una instancia pequeña eso son varios minutos por despliegue.
# =================================================================================================

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src

COPY pom.xml ./
COPY platform-core/pom.xml       platform-core/
COPY module-geo/pom.xml          module-geo/
COPY module-identity/pom.xml     module-identity/
COPY module-tenancy/pom.xml      module-tenancy/
COPY module-parking/pom.xml      module-parking/
COPY module-enforcement/pom.xml  module-enforcement/
COPY module-billing/pom.xml      module-billing/
COPY module-notifications/pom.xml module-notifications/
COPY app/pom.xml                 app/

# Falla sin red y con dependencias faltantes, que es lo que queremos saber antes de copiar el código.
RUN mvn -B -ntp dependency:go-offline

COPY platform-core       platform-core
COPY module-geo          module-geo
COPY module-identity     module-identity
COPY module-tenancy      module-tenancy
COPY module-parking      module-parking
COPY module-enforcement  module-enforcement
COPY module-billing      module-billing
COPY module-notifications module-notifications
COPY app                 app

# Las pruebas corren en CI (.github/workflows/ci.yml), con su propio PostgreSQL. Repetirlas acá
# obligaría a levantar una base dentro del build y duplicaría el tiempo de cada despliegue.
RUN mvn -B -ntp -DskipTests package \
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
