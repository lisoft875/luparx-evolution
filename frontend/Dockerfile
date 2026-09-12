# =================================================================================================
# Los cuatro portales de LupaRX en una sola imagen: se construyen con Node y se sirven con nginx,
# que además hace de proxy hacia el backend para que todo viva en un mismo origen.
#
# UNA IMAGEN Y NO CUATRO. Los portales comparten el 80% del código (packages/ui, features, i18n,
# api-client) y se despliegan juntos; cuatro imágenes significarían cuatro veces el mismo build de
# workspaces y cuatro contenedores para servir archivos estáticos. Si mañana un portal necesita
# publicarse por separado —su propio subdominio, su propio ciclo de despliegue— se extrae con un
# `--target`, sin rehacer nada de esto.
#
# EL PREFIJO ES ARGUMENTO DE BUILD, NO CONFIGURACIÓN DE EJECUCIÓN. Vite reescribe las URL de los
# assets al compilar, así que "bajo qué ruta vive cada portal" tiene que decidirse acá. Cambiarlo
# implica reconstruir, que es exactamente por qué existe scripts/deploy.sh.
# =================================================================================================

FROM node:22-alpine AS build
WORKDIR /app

# URL pública de la API. En un despliegue de un solo dominio es el mismo dominio (nginx enruta
# /api/ hacia el backend) y las peticiones nunca salen del origen: sin CORS y sin preflight.
# El cliente ya pide rutas /api/v1/..., así que acá va el origen SIN ninguna ruta.
ARG PUBLIC_BASE_URL=http://localhost

# Prefijo de cada portal. El ciudadano en la raíz porque es el único de cara al público.
ARG BASE_PATH_CITIZEN=/
ARG BASE_PATH_ADMIN=/admin/
ARG BASE_PATH_INSPECTOR=/inspector/
ARG BASE_PATH_PLATFORM=/platform/

COPY package.json package-lock.json ./
COPY apps apps
COPY packages packages

# `npm ci` y no `install`: instala exactamente el lock, y falla si el lock y los package.json no
# concuerdan en vez de resolver algo distinto de lo que se probó.
RUN npm ci

# Se compila con `vite build` directo y no con `npm run build`, que además corre `tsc --noEmit`:
# el chequeo de tipos es responsabilidad de CI —donde falla el pipeline y no el despliegue— y acá
# duplicaría varios minutos en una instancia chica.
#
# Uno por uno y no en paralelo: cuatro builds de Vite a la vez se comen la memoria de una instancia
# de 1 GB y el OOM killer mata el contenedor a mitad del despliegue.
ENV VITE_USE_MOCKS=false
RUN set -eu; \
    for portal in "citizen:$BASE_PATH_CITIZEN" "admin:$BASE_PATH_ADMIN" "inspector:$BASE_PATH_INSPECTOR" "platform:$BASE_PATH_PLATFORM"; do \
      app="${portal%%:*}"; prefix="${portal#*:}"; \
      echo "== build $app en $prefix =="; \
      VITE_API_BASE_URL="$PUBLIC_BASE_URL" VITE_BASE_PATH="$prefix" \
        npx vite build --config "apps/$app/vite.config.ts" "apps/$app"; \
    done

# -------------------------------------------------------------------------------------------------

FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/apps/citizen/dist   /usr/share/nginx/html/citizen
COPY --from=build /app/apps/admin/dist     /usr/share/nginx/html/admin
COPY --from=build /app/apps/inspector/dist /usr/share/nginx/html/inspector
COPY --from=build /app/apps/platform/dist  /usr/share/nginx/html/platform

# La configuración de nginx NO va dentro de la imagen: se monta desde infra/nginx/luparx.conf en
# compose, para que retocar una cabecera o el límite de subida sea reiniciar un contenedor y no
# reconstruir los cuatro portales.

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1
