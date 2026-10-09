#!/usr/bin/env bash
# =================================================================================================
# ¿Se puede sembrar demostración en ESTA instancia? — comprobación de SÓLO LECTURA.
#
# Se corre EN EL SERVIDOR, desde la raíz del repositorio:
#
#     ./infra/demo/auditar-inicio-demo.sh
#
# No escribe nada. Contesta, con evidencia y no con una opinión, las cuatro preguntas que hay que
# contestar ANTES de insertar un solo registro:
#
#   1. ¿Esto es staging o producción?
#   2. ¿La base es de esta instancia sola, o la comparte con algo?
#   3. ¿Hay información real adentro —dinero de verdad, personas de verdad—?
#   4. ¿Ya hay datos de demostración sembrados de una vez anterior?
#
# La cuarta importa tanto como las otras: el sembrador es idempotente, pero saber si ya corrió es
# lo que distingue «la pantalla está vacía porque no hay datos» de «la pantalla está vacía y eso
# es un defecto».
# =================================================================================================
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE_FILE="infra/docker-compose.deploy.yml"
ENV_FILE="${LUPARX_ENV_FILE:-infra/.env}"

[[ -f "$ENV_FILE" ]] || { echo "No está $ENV_FILE. ¿Es esta la raíz del repositorio en el servidor?" >&2; exit 1; }

# Se leen sin `source`: un archivo de entorno de compose no es un script de shell.
leer() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"''; }
DB="$(leer POSTGRES_DB)"
USUARIO="$(leer POSTGRES_USER)"
ENTORNO="$(leer LUPARX_ENVIRONMENT)"
PERFIL="$(leer SPRING_PROFILES_ACTIVE)"
SEMBRADO="$(leer LUPARX_DEV_SEED_DASHBOARD_DEMO)"

COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
psql() { "${COMPOSE[@]}" exec -T postgres psql -U "$USUARIO" -d "$DB" -At -c "$1"; }

echo "=============================================================================="
echo " 1 · QUÉ INSTANCIA ES ESTA"
echo "=============================================================================="
echo "  LUPARX_ENVIRONMENT        : ${ENTORNO:-(sin declarar, el compose usa 'staging')}"
echo "  SPRING_PROFILES_ACTIVE    : ${PERFIL:-(sin declarar, el compose usa 'demo')}"
echo "  Sembrado del Inicio       : ${SEMBRADO:-false}"
echo "  Imagen del backend        : $("${COMPOSE[@]}" images backend --format json 2>/dev/null | head -c 200 || echo '(no se pudo leer)')"
echo
echo "  Si la primera línea no dice staging, DETENERSE acá."

echo
echo "=============================================================================="
echo " 2 · LA BASE: ¿de esta instancia sola?"
echo "=============================================================================="
echo "  Volumen de datos:"
"${COMPOSE[@]}" config --volumes | sed 's/^/    /'
echo "  Puertos publicados por postgres (vacío = nadie de fuera la alcanza):"
"${COMPOSE[@]}" ps --format '    {{.Service}}  {{.Ports}}' postgres 2>/dev/null || true
echo
echo "  Una base sin puerto publicado y con volumen propio del proyecto no la comparte"
echo "  nadie más. Si aparece un 0.0.0.0:5432 o un volumen externo, DETENERSE."

echo
echo "=============================================================================="
echo " 3 · ¿HAY INFORMACIÓN REAL ADENTRO?"
echo "=============================================================================="
printf '  Municipalidades          : %s\n' "$(psql "SELECT count(*) FROM tenants;")"
printf '  Cuentas de persona       : %s\n' "$(psql "SELECT count(*) FROM users;")"
printf '    de ellas, @luparx.test : %s\n' "$(psql "SELECT count(*) FROM users WHERE email LIKE '%@luparx.test';")"
printf '    con otro dominio       : %s\n' "$(psql "SELECT count(*) FROM users WHERE email NOT LIKE '%@luparx.test';")"
echo
echo "  Pagos por proveedor (un proveedor que no sea demo-seed o simulado = dinero real):"
psql "SELECT '    '||coalesce(provider,'(sin proveedor)')||'  '||count(*)||' pagos  '||
             to_char(coalesce(sum(gross_amount_minor),0)/100.0,'FM999G999G990D00')
      FROM payments GROUP BY provider ORDER BY 1;" || echo "    (sin pagos)"
echo
echo "  Boletas por estado:"
psql "SELECT '    '||status||'  '||count(*) FROM citations GROUP BY status ORDER BY 1;" || echo "    (sin boletas)"
echo
echo "  Las cuentas con un dominio distinto de @luparx.test son la señal a mirar: si hay"
echo "  correos de personas reales, esto dejó de ser un entorno de prueba."

echo
echo "=============================================================================="
echo " 4 · LO QUE YA SEMBRÓ ESTA DEMOSTRACIÓN"
echo "=============================================================================="
printf '  Pagos con provider=demo-seed       : %s\n' "$(psql "SELECT count(*) FROM payments WHERE provider = 'demo-seed';")"
printf '  Estadías con placa DMO###          : %s\n' "$(psql "SELECT count(*) FROM parking_sessions WHERE plate_snapshot LIKE 'DMO%';")"
echo
echo "  Y lo que impediría retirarlos (tiene que decir 0 en las tres):"
printf '    líneas de conciliación colgando  : %s\n' "$(psql "SELECT count(*) FROM settlement_lines sl JOIN payments p ON p.id = sl.payment_id WHERE p.provider = 'demo-seed';" 2>/dev/null || echo 'n/d')"
printf '    movimientos de billetera         : %s\n' "$(psql "SELECT count(*) FROM wallet_transactions wt JOIN payments p ON p.id = wt.payment_id WHERE p.provider = 'demo-seed';" 2>/dev/null || echo 'n/d')"
printf '    extensiones de estadía           : %s\n' "$(psql "SELECT count(*) FROM parking_session_extensions e JOIN parking_sessions s ON s.id = e.session_id WHERE s.plate_snapshot LIKE 'DMO%';" 2>/dev/null || echo 'n/d')"

echo
echo "=============================================================================="
echo " Si 1 dice staging, 2 no publica puerto ni comparte volumen, 3 no muestra correos"
echo " ajenos ni pagos de un proveedor real, entonces el sembrado está aislado y se puede"
echo " encender. Cualquier otra combinación: no sembrar."
echo "=============================================================================="
