import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import { Alert, Card, SectionHeader, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

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

  const query = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => apiClient.adminRoles.list(),
  });

  const roles = query.data ?? [];

  /** Los permisos que alguno de los roles del portal concede, para no dibujar columnas vacías. */
  const permisos = React.useMemo(
    () => [...new Set(roles.flatMap((fila) => fila.permissions))].sort(),
    [roles],
  );

  return (
    <AdminShell>
      <h1>{t('admin.roles.title')}</h1>
      <p className="lx-text-meta">{t('admin.roles.subtitle')}</p>

      <Alert tone="info">{t('admin.roles.readOnly')}</Alert>

      <Card>
        <SectionHeader title={t('admin.roles.matrix.title')} description={t('admin.roles.matrix.description')} />
        {/* Dieciséis columnas de permiso no entran en ninguna pantalla, y no tienen por qué: el
            envoltorio ya desplaza en horizontal. Lo que no puede irse es el NOMBRE DEL ROL —una
            fila de puntos sin saber de quién es no dice nada— así que la primera columna queda
            fija. El componente ya lo soporta; esto es usarlo, no inventarlo. */}
        <Table
          stickyFirstColumn
          loading={query.isLoading}
          loadingLabel={t('common.loading')}
          emptyLabel={t('admin.roles.empty')}
          rows={roles}
          rowKey={(fila) => fila.role}
          columns={[
            {
              key: 'role',
              header: t('admin.roles.column.role'),
              // El nombre del enum va abajo y a media luz: es lo que hay que buscar en el código o
              // citar en un ticket, y esconderlo obliga a adivinarlo.
              render: (fila) => (
                <>
                  <strong>{t(`admin.roles.name.${fila.role}` as TranslationKey)}</strong>
                  <br />
                  <code className="lx-text-meta">{fila.role}</code>
                </>
              ),
            },
            {
              key: 'portal',
              header: t('admin.roles.column.portal'),
              render: (fila) => t(`portal.${fila.portal}` as TranslationKey),
            },
            ...permisos.map((permiso) => ({
              key: permiso,
              header: t(`admin.roles.permission.${permiso}` as TranslationKey),
              // El nombre crudo del permiso viaja en la celda (data-permission).
              //
              // Sin esto, comprobar la matriz desde fuera obliga a contar columnas —las cabeceras
              // están traducidas— o a pedir /admin/roles por segunda vez. La primera corrida del
              // arnés intentó lo segundo con un `fetch` dentro de la página y se llevó un 401: la
              // sesión vive en un token en memoria, no en una cookie, así que una petición hecha
              // por fuera del cliente no lleva credenciales. Cinco fallos, todos del arnés.
              render: (fila: (typeof roles)[number]) =>
                fila.permissions.includes(permiso) ? (
                  // Marca Y texto accesible: una tabla de permisos leída sólo por un símbolo verde
                  // no se puede leer en voz alta ni imprimir en blanco y negro.
                  <span
                    data-permission={permiso}
                    data-granted="true"
                    aria-label={t('admin.roles.granted')}
                    title={t('admin.roles.granted')}
                  >
                    ●
                  </span>
                ) : (
                  <span
                    className="lx-text-meta"
                    data-permission={permiso}
                    data-granted="false"
                    aria-label={t('admin.roles.denied')}
                    title={t('admin.roles.denied')}
                  >
                    ·
                  </span>
                ),
            })),
          ]}
        />
      </Card>
    </AdminShell>
  );
}
