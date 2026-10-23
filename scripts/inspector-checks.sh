#!/usr/bin/env bash
# =================================================================================================
# LuParX Inspector — diagnóstico conservador (Fase 3).
#
# Tres correcciones sobre la versión que llegó en el paquete, las tres medidas el 22-10-2026:
#
#   1. `require('frontend/package.json')` es un especificador de MÓDULO para Node, no una ruta.
#      Fallaba con MODULE_NOT_FOUND, así que el script no imprimía ningún script npm y —peor— la
#      comprobación que decide si correr typecheck/lint/test devolvía siempre «no existe». El
#      diagnóstico terminaba sin haber ejecutado ninguno. Se resuelve la ruta a absoluta.
#
#   2. El bucle de arneses hacía `cd "$FRONTEND"` y después pasaba una ruta que YA empezaba por
#      `frontend/`, así que buscaba `frontend/frontend/tests/...`. Los 36 arneses fallaban con
#      MODULE_NOT_FOUND: 36 fallos falsos, ninguno sobre el código.
#
#   3. Los arneses son de navegador y necesitan `MOCKS=1` y un Chromium de Playwright. Sin eso
#      apuntan a staging y se detienen por falta de contraseña. Correrlos por omisión producía una
#      pared roja que no dice nada, así que ahora son opt-in: `ARNESES=1`.
#
#   bash scripts/inspector-checks.sh                      # estático: git, scripts npm, typecheck, lint
#   ARNESES=1 MOCKS=1 bash scripts/inspector-checks.sh    # además los arneses de navegador
# =================================================================================================
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
echo "=== LuParX Inspector: diagnóstico conservador ==="
echo "Root: $ROOT"
echo
echo "=== Estado inicial ==="
git status --short 2>&1 || true
git branch --show-current 2>&1 || true
git diff --check 2>&1
echo "git diff --check exit=$?"
echo
if [[ -f frontend/package.json ]]; then FRONTEND=frontend
elif [[ -f package.json ]]; then FRONTEND=.
else FRONTEND=""
fi
if [[ -n "$FRONTEND" ]]; then
  PKG="$ROOT/$FRONTEND/package.json"
  echo "Frontend: $FRONTEND  ($PKG)"
  node --version 2>&1 || true
  npm --version 2>&1 || true
  echo "=== Scripts npm declarados ==="
  node -e 'const p=require(process.argv[1]); console.log(JSON.stringify(p.scripts||{},null,2))' "$PKG" 2>&1 || true
  for script in typecheck type-check check:types lint test test:unit checks contraste; do
    if node -e 'const p=require(process.argv[1]); process.exit(p.scripts && p.scripts[process.argv[2]] ? 0 : 1)' "$PKG" "$script"; then
      echo "--- npm run $script ---"
      (cd "$FRONTEND" && npm run "$script")
      echo "RESULT npm run $script => $?"
    else
      echo "(sin script npm «$script»)"
    fi
  done
  echo
  echo "=== Arneses CJS responsive ==="
  if [[ -d "$FRONTEND/tests/responsive" ]]; then
    find "$FRONTEND/tests/responsive" -maxdepth 1 -type f -name '*.cjs' -print | sort
    if [[ "${ARNESES:-0}" != "1" ]]; then
      echo
      echo "NO EJECUTADOS. Son arneses de NAVEGADOR: necesitan MOCKS=1 y un Chromium de Playwright"
      echo "(npx playwright install chromium, o PW_CHROMIUM=/ruta/al/chrome). Sin eso apuntan a"
      echo "staging y se detienen por falta de contraseña, lo que no dice nada sobre el código."
      echo "Para correrlos:  ARNESES=1 MOCKS=1 bash scripts/inspector-checks.sh"
    else
      while IFS= read -r f; do
        [[ -n "$f" ]] || continue
        rel="${f#"$FRONTEND"/}"
        echo "--- $rel ---"
        (cd "$FRONTEND" && node "$rel")
        echo "RESULT $rel => $?"
      done < <(find "$FRONTEND/tests/responsive" -maxdepth 1 -type f -name '*.cjs' -print | sort)
    fi
  fi
else
  echo "No se encontró package.json en raíz ni frontend/."
fi
echo
echo "=== Configuración encontrada ==="
find . -maxdepth 4 \( -name 'tsconfig*.json' -o -name 'eslint.config.*' -o -name '.eslintrc*' -o -name 'playwright.config.*' \) -not -path './node_modules/*' -not -path './.git/*' -print 2>/dev/null | sort | head -200
echo "Diagnóstico terminado. Revisar cada resultado; esto no sustituye integración real."
