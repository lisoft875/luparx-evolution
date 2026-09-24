import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { ENLACE_EXTERNO, LUPARX_SITE_URL, LocaleSwitcher } from '@luparx/features';
import { useTranslation } from '@luparx/i18n';
import {
  Badge,
  Button,
  Card,
  CardStack,
  IconChevronRight,
  IconGlobe,
  IconLogout,
  IconOffline,
  IconShield,
  IconSystem,
  IconUser,
  ListRow,
} from '@luparx/ui';
import { InspectorShell } from '../components/InspectorShell';
import { useCitationQueue, useIsOnline } from '../lib/queries';

/**
 * «Más»: las herramientas del fiscalizador que no se ganan un lugar en la barra.
 *
 * <h2>Qué cambió</h2>
 *
 * <p>Hasta ahora «Más» llevaba directo a «Mi perfil», así que el portal no tenía dónde poner nada
 * que no fuera un dato personal —ni idioma, ni ayuda, ni cierre de sesión—. La especificación del
 * 24-09-2026 lo convierte en un menú, y eso es todo lo que hace esta pantalla: los mismos cinco
 * destinos de la barra siguen donde estaban y ninguna función operativa se tocó.</p>
 *
 * <h2>La municipalidad NO se cambia desde acá, y eso es deliberado</h2>
 *
 * <p>La especificación de «Más» lo prohíbe en tres lugares distintos: el fiscalizador trabaja para
 * una municipalidad y no elige otra desde un menú. La insignia del encabezado —que existía antes de
 * esta pantalla y que el documento de inicio de sesión sí pide— no se tocó: son superficies
 * distintas y cada documento habla de la suya.</p>
 *
 * <h2>Idioma y conexión van EN la pantalla, no detrás de ella</h2>
 *
 * <p>Misma razón que en el portal del ciudadano, y está escrita allá: elegir el idioma *es* toda la
 * acción, y una fila que navega a una pantalla que sólo contiene un desplegable es una pantalla que
 * existe para contener un desplegable. Con el estado de conexión pasa lo mismo: es un hecho, no un
 * destino.</p>
 *
 * <h2>Lo que NO está, y por qué no se inventó</h2>
 *
 * <ul>
 *   <li><b>Mi actividad</b>: no hay de dónde sacarla. El fiscalizador no tiene {@code AUDIT_READ},
 *       y de sus consultas de placa sólo existe el {@code POST} que las crea — ningún endpoint que
 *       las liste. La §4 pide reutilizar la bitácora «si ya está disponible»; no lo está.</li>
 *   <li><b>Notificaciones</b>: el módulo existe y es completo, pero sus endpoints piden
 *       {@code hasRole('CITIZEN')}. Dibujar la entrada daría una pantalla con un 403 detrás.</li>
 * </ul>
 *
 * <p>Las dos necesitan una decisión de backend, no una pantalla. Están documentadas en el informe
 * en vez de fingidas acá: la §4 dice «no inventar datos» y una entrada que lleva a un error es una
 * forma de inventarlos.</p>
 */
export function MorePage(): React.JSX.Element {
  const { t, tPlural } = useTranslation();
  const navigate = useNavigate();
  const { me, logout } = useAuth();
  const enLinea = useIsOnline();
  const { pending } = useCitationQueue();

  const perfil = me?.user;
  const nombre = [perfil?.givenName, perfil?.familyName].filter(Boolean).join(' ');

  return (
    <InspectorShell>
      <h1 className="lx-text-screen-title">{t('nav.more')}</h1>

      <CardStack>
        <Card>
          <ListRow
            icon={<IconUser size={18} />}
            title={t('inspector.more.profile')}
            meta={nombre || perfil?.email || t('common.empty')}
            value={<IconChevronRight size={16} />}
            onClick={() => navigate('/profile')}
          />
        </Card>

        {/* --- Idioma: el control, no un enlace al control -------------------------------------- */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-3)' }}>
            <span className="lx-list-row__icon" aria-hidden="true">
              <IconGlobe size={18} />
            </span>
            <div>
              <p className="lx-text-card-title" style={{ margin: 0 }}>
                {t('inspector.more.language')}
              </p>
              <p className="lx-text-meta" style={{ margin: 0 }}>
                {t('account.language.meta')}
              </p>
            </div>
          </div>
          <div style={{ marginTop: 'var(--lx-space-3)' }}>
            <LocaleSwitcher />
          </div>
        </Card>

        {/* --- Estado de conexión ---------------------------------------------------------------
            El mismo dato que ya vive en la barra superior, dicho entero. Arriba es una insignia que
            se lee de reojo mientras se trabaja; acá es la respuesta a «¿por qué no se me subió la
            boleta?», que es una pregunta que se hace parado y con tiempo. */}
        <Card>
          <ListRow
            icon={enLinea ? <IconSystem size={18} /> : <IconOffline size={18} />}
            title={t('inspector.more.connection')}
            meta={
              enLinea
                ? t('inspector.more.connection.online')
                : t('inspector.more.connection.offline')
            }
            value={
              pending > 0 ? (
                <Badge tone="warning">{tPlural('inspector.more.connection.pending', pending)}</Badge>
              ) : (
                <Badge tone={enLinea ? 'success' : 'neutral'}>
                  {enLinea ? t('inspector.more.connection.synced') : t('inspector.more.connection.waiting')}
                </Badge>
              )
            }
          />
        </Card>

        <Card>
          <ListRow
            icon={<IconShield size={18} />}
            title={t('inspector.more.help')}
            meta={t('inspector.more.help.meta')}
            value={<IconChevronRight size={16} />}
            onClick={() => navigate('/help')}
          />
          {/* --- Acerca de LuParX ---------------------------------------------------------------
              Un <a> de verdad y no un botón que navega: abre fuera de la aplicación, y quien quiera
              copiar la dirección o abrirla en otra pestaña debería poder hacerlo como con cualquier
              enlace. La dirección vive en `LUPARX_SITE_URL`, en un solo lugar. */}
          <a
            className="lx-list-row"
            href={LUPARX_SITE_URL}
            {...ENLACE_EXTERNO}
          >
            <span className="lx-list-row__icon" aria-hidden="true">
              <IconGlobe size={18} />
            </span>
            <span className="lx-list-row__body">
              <span className="lx-list-row__title">{t('inspector.more.about')}</span>
              <span className="lx-list-row__meta">{t('inspector.more.about.meta')}</span>
            </span>
            <span className="lx-list-row__value" aria-hidden="true">
              <IconChevronRight size={16} />
            </span>
          </a>
        </Card>
      </CardStack>

      {/* Separado del resto y al final, como pide la especificación: cerrar sesión no es una
          preferencia más, y ponerlo entre ellas invita a tocarlo sin querer. */}
      <div style={{ marginTop: 'var(--lx-space-4)' }}>
        <Button type="button" variant="ghost" onClick={() => void logout()}>
          <IconLogout size={18} /> {t('auth.logout.action')}
        </Button>
      </div>
    </InspectorShell>
  );
}
