import * as React from 'react';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import { Alert, Badge, Card, SectionHeader, Skeleton } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

/**
 * Los permisos por área de trabajo, en el orden en que una municipalidad los piensa.
 *
 * <h2>Por qué una tabla a mano y no el orden alfabético</h2>
 *
 * <p>Porque el alfabético junta `CITATION_INGEST` con `CITATION_VOID` —cargar boletas de otro
 * sistema y anular una boleta propia, que son trabajos de dos personas distintas— y separa
 * `USER_READ` de `MEMBERSHIP_APPROVE`, que casi siempre se conceden juntos. El orden del trabajo es
 * el que deja comparar dos roles de un vistazo.</p>
 *
 * <h2>Por qué hay un grupo «Otros»</h2>
 *
 * <p>Porque el servidor puede ganar un permiso mañana y esta pantalla no debe esconderlo. Lo que no
 * esté en ningún grupo cae en el último, con su nombre técnico: una pantalla de seguridad que
 * silencia un permiso nuevo es peor que una desordenada.</p>
 */
const GRUPOS: { clave: string; permisos: readonly string[] }[] = [
  { clave: 'people', permisos: ['USER_READ', 'USER_WRITE', 'USER_BLOCK'] },
  { clave: 'staff', permisos: ['MEMBERSHIP_APPROVE', 'ROLE_ASSIGN', 'ZONE_ASSIGN'] },
  { clave: 'tenant', permisos: ['TENANT_MANAGE'] },
  {
    clave: 'citations',
    permisos: ['CITATION_ISSUE', 'CITATION_READ', 'CITATION_VOID', 'ENFORCEMENT_MANAGE', 'CITATION_INGEST'],
  },
  { clave: 'finance', permisos: ['WALLET_TOPUP', 'EXPORT_RUN'] },
  { clave: 'security', permisos: ['AUDIT_READ', 'PLATFORM_MANAGE'] },
];

/** El nombre humano de un permiso, o su nombre técnico si todavía no tiene traducción. */
function permisoLegible(t: (key: TranslationKey) => string, permiso: string): string {
  const clave = `admin.roles.permission.${permiso}` as TranslationKey;
  const texto = t(clave);
  return texto === clave ? permiso : texto;
}

/**
 * Qué puede hacer cada rol, según el servidor.
 *
 * <h2>Por qué esta pantalla</h2>
 *
 * La tabla de roles y permisos existe desde el primer día y se aplica en cada endpoint. Lo que no
 * existía era poder <b>verla</b>: para contestar «¿un fiscalizador puede cambiar una tarifa?» había
 * que abrir el código. La §3 de la guía funcional (24-09-2026) pide consultar los permisos
 * efectivos; esto es eso, y nada más que eso.
 *
 * <h2>Por qué es de sólo lectura</h2>
 *
 * Porque la alternativa es peor. Editar la matriz desde acá sacaría los permisos del código
 * —versionados, revisables en un diff, probados— para meterlos en una fila de base de datos que
 * nadie mira. Es una decisión de arquitectura, está marcada VALIDAR CON JAVIER, y hasta que se tome
 * esta pantalla dice la verdad: esto es lo que hay.
 *
 * <h2>Por qué ya no es una matriz (05-10-2026)</h2>
 *
 * <p>Era dieciséis columnas de puntos con la primera fija y desplazamiento horizontal. Técnicamente
 * exacta y, como informe, ilegible: para contestar «¿qué puede hacer Finanzas?» había que recorrer
 * una fila de dieciséis celdas de ida y vuelta leyendo cabeceras traducidas, y para comparar dos
 * roles había que hacerlo dos veces y recordar el resultado. El hallazgo del 05-10-2026 lo dice sin
 * rodeos: «técnicamente puede ser útil, pero como interfaz resulta difícil de leer y comparar».</p>
 *
 * <p>Ahora es una fila por rol con un resumen —«5 de 16 permisos»— que se abre mostrando los
 * dieciséis agrupados por área. Lo que se gana no es espacio: es que la pregunta que la gente trae
 * («¿qué puede hacer este rol?») se contesta leyendo hacia abajo, que es como se lee. Cero
 * desplazamiento horizontal a cualquier ancho.</p>
 *
 * <p><b>Lo que NO cambió</b>, y es la mitad del encargo: ni un permiso del backend, ni la fuente de
 * los datos, ni el hecho de que los dieciséis se vean —concedidos y negados— cuando el rol está
 * abierto. Esconder los negados habría hecho la pantalla más corta y la habría vuelto inútil para
 * su única pregunta de verdad, que es qué NO puede hacer alguien.</p>
 *
 * <h2>Por qué no muestra Ver/Crear/Editar/Aprobar/Anular por módulo</h2>
 *
 * Porque esos verbos todavía no existen como permisos. Hoy `TENANT_MANAGE` cubre de un solo golpe
 * tarifas, zonas, política de parqueo y configuración. Dibujar una matriz con casillas que ningún
 * endpoint comprueba sería la peor clase de pantalla de seguridad: la que tranquiliza sin proteger.
 * Partir ese permiso es trabajo de la §3 que toca todos los `@PreAuthorize` y necesita decidirse.
 */
export function RolesPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const base = useId();
  const [abierto, setAbierto] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => apiClient.adminRoles.list(),
  });

  // `useMemo` y no `query.data ?? []`: el literal vacío es un array NUEVO en cada render, así que
  // los `useMemo` que dependen de él se recalculaban siempre. Era el único aviso de lint del
  // repositorio, y venía de la versión anterior de esta pantalla.
  const roles = React.useMemo(() => query.data ?? [], [query.data]);

  /**
   * Los permisos que algún rol del portal concede, repartidos en los grupos de arriba.
   *
   * <p>Se parte de la respuesta del servidor y no de la lista completa del enum: dibujar una fila
   * para un permiso que ningún rol de esta municipalidad concede sería dibujar dieciséis puntos
   * grises que no contestan nada. Lo que el servidor no menciona, no existe acá.</p>
   */
  const grupos = React.useMemo(() => {
    const presentes = new Set(roles.flatMap((fila) => fila.permissions));
    const agrupados = GRUPOS.map((grupo) => ({
      clave: grupo.clave,
      permisos: grupo.permisos.filter((permiso) => presentes.has(permiso)),
    })).filter((grupo) => grupo.permisos.length > 0);

    const colocados = new Set(GRUPOS.flatMap((grupo) => grupo.permisos));
    const sueltos = [...presentes].filter((permiso) => !colocados.has(permiso)).sort();
    return sueltos.length > 0
      ? [...agrupados, { clave: 'other', permisos: sueltos }]
      : agrupados;
  }, [roles]);

  const total = grupos.reduce((suma, grupo) => suma + grupo.permisos.length, 0);

  return (
    <AdminShell>
      <h1>{t('admin.roles.title')}</h1>
      <p className="lx-text-meta">{t('admin.roles.subtitle')}</p>

      <Alert tone="info">{t('admin.roles.readOnly')}</Alert>

      <Card>
        <SectionHeader title={t('admin.roles.matrix.title')} description={t('admin.roles.matrix.description')} />

        {query.isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)' }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={56} shape="block" />
            ))}
          </div>
        ) : null}
        {!query.isLoading && roles.length === 0 ? (
          <p className="lx-text-meta">{t('admin.roles.empty')}</p>
        ) : null}

        <div className="lx-role-list">
          {roles.map((fila) => {
            const panelId = `${base}-${fila.role}`;
            const esteAbierto = abierto === fila.role;
            const concedidos = fila.permissions.length;
            // El nombre visible viene de `role.*`, que es el que usa el resto de la aplicación.
            // Había un segundo juego de claves sólo para esta pantalla, y por eso INSPECTOR_LEAD
            // era «Jefe de fiscalización» en Funcionarios y «Supervisor de fiscalización» acá.
            const nombre = t(`role.${fila.role}` as TranslationKey);
            return (
              <div className="lx-role-row" key={fila.role} data-role={fila.role}>
                <button
                  type="button"
                  className="lx-role-row__head"
                  aria-expanded={esteAbierto}
                  aria-controls={panelId}
                  aria-label={t(esteAbierto ? 'admin.roles.collapse' : 'admin.roles.expand', { role: nombre })}
                  onClick={() => setAbierto(esteAbierto ? null : fila.role)}
                >
                  <span className="lx-role-row__name">
                    <strong>{nombre}</strong>
                    {/* El nombre del enum a media luz: es lo que hay que buscar en el código o
                        citar en un ticket, y esconderlo obliga a adivinarlo. */}
                    <code className="lx-text-meta">{fila.role}</code>
                  </span>
                  <span className="lx-role-row__portal">
                    <Badge tone="neutral">{t(`portal.${fila.portal}` as TranslationKey)}</Badge>
                  </span>
                  <span className="lx-role-row__summary">
                    {t('admin.roles.summary', { granted: concedidos, total })}
                  </span>
                  <span className={`lx-role-row__caret${esteAbierto ? ' lx-role-row__caret--open' : ''}`} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" focusable="false">
                      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>

                {esteAbierto ? (
                  <div className="lx-role-panel" id={panelId}>
                    {grupos.map((grupo) => (
                      <div className="lx-role-group" key={grupo.clave}>
                        <h3 className="lx-role-group__title">
                          {t(`admin.roles.group.${grupo.clave}` as TranslationKey)}
                        </h3>
                        <ul className="lx-role-group__list">
                          {grupo.permisos.map((permiso) => {
                            const concedido = fila.permissions.includes(permiso);
                            return (
                              <li
                                key={permiso}
                                className={`lx-perm${concedido ? ' lx-perm--granted' : ''}`}
                                // El nombre crudo del permiso viaja en la fila.
                                //
                                // Sin esto, comprobar los permisos desde fuera obliga a leer
                                // cabeceras traducidas o a pedir /admin/roles por segunda vez. La
                                // primera corrida del arnés intentó lo segundo con un `fetch`
                                // dentro de la página y se llevó un 401: la sesión vive en un token
                                // en memoria, no en una cookie, así que una petición hecha por
                                // fuera del cliente no lleva credenciales. Cinco fallos, todos del
                                // arnés.
                                data-permission={permiso}
                                data-granted={concedido ? 'true' : 'false'}
                              >
                                {/* Marca Y texto: una lista de permisos leída sólo por un símbolo
                                    verde no se puede leer en voz alta ni imprimir en gris. */}
                                <span className="lx-perm__mark" aria-hidden="true">
                                  {concedido ? '●' : '·'}
                                </span>
                                <span className="lx-perm__name">{permisoLegible(t, permiso)}</span>
                                <span className="lx-perm__state">
                                  {t(concedido ? 'admin.roles.granted' : 'admin.roles.denied')}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
    </AdminShell>
  );
}
