import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import {
  Badge,
  Card,
  CardStack,
  IconCheck,
  IconFine,
  IconOffline,
  IconPin,
  IconSearch,
  Modal,
} from '@luparx/ui';
import { InspectorShell } from '../components/InspectorShell';
import { useCitationQueue, useIsOnline } from '../lib/queries';

/**
 * Ayuda: cinco eventualidades del turno, cada una con la salida ya construida.
 *
 * <h2>Qué cambió el 26-09-2026</h2>
 *
 * <p>Estas cinco tarjetas eran texto. Explicaban bien y no llevaban a ninguna parte: quien leía
 * «consultá la placa desde la pestaña Placa» tenía que cerrar la ayuda, acordarse y navegar. En la
 * calle, de pie, eso es una ayuda que no ayuda.</p>
 *
 * <p>Ahora cada tarjeta ES la acción. Y ninguna trae pantalla nueva: cuatro llevan a rutas que ya
 * existen y la quinta abre un panel corto con el estado que la aplicación ya conoce.</p>
 *
 * <h2>Lo que NO se creó, a propósito</h2>
 *
 * <ul>
 *   <li><b>Ningún segundo sistema offline.</b> El panel de «Si te quedás sin señal» lee
 *       {@link useIsOnline} y {@link useCitationQueue}, que son los mismos que alimentan la insignia
 *       de la cabecera y el contador de la barra inferior. Si alguna vez discrepan, es un error;
 *       por eso hay una sola fuente.</li>
 *   <li><b>Ninguna galería de evidencia.</b> Las fotos se agregan DENTRO de una boleta, así que la
 *       tarjeta lleva al flujo de boleta, que es el punto correcto del flujo existente.</li>
 *   <li><b>Ninguna ruta nueva.</b> `/`, `/cite` y `/queue` ya estaban.</li>
 * </ul>
 */
interface Entrada {
  clave: 'offline' | 'plate' | 'citation' | 'evidence' | 'queue';
  icono: React.ReactNode;
  /** Adónde lleva. `null` = abre el panel de conexión, que no es una pantalla. */
  ruta: string | null;
}

const ENTRADAS: Entrada[] = [
  { clave: 'offline', icono: <IconOffline />, ruta: null },
  { clave: 'plate', icono: <IconSearch />, ruta: '/' },
  { clave: 'citation', icono: <IconFine />, ruta: '/cite' },
  // La evidencia vive dentro de la boleta: llevar al mismo sitio es lo correcto, no un descuido.
  { clave: 'evidence', icono: <IconPin />, ruta: '/cite' },
  { clave: 'queue', icono: <IconCheck />, ruta: '/queue' },
];

export function HelpPage(): React.JSX.Element {
  const { t, tPlural } = useTranslation();
  const navigate = useNavigate();
  const online = useIsOnline();
  const { pending } = useCitationQueue();
  const [verConexion, setVerConexion] = useState(false);

  return (
    <InspectorShell title={t('inspector.help.title')} onBack={() => navigate('/more')} stickyHeader>
      <CardStack>
        {ENTRADAS.map((entrada) => (
          <Card key={entrada.clave}>
            {/* La tarjeta entera es el botón, no un enlace pequeño dentro de ella: esto se pulsa de
                pie, con una mano, a veces con guantes. Un `<button>` de verdad —y no un `div` con
                `onClick`— para que el teclado lo alcance y un lector de pantalla lo anuncie como
                acción. */}
            <button
              type="button"
              className="lx-help-card"
              onClick={() => (entrada.ruta === null ? setVerConexion(true) : navigate(entrada.ruta))}
            >
              <span className="lx-help-card__icon" aria-hidden="true">
                {entrada.icono}
              </span>
              <span className="lx-help-card__text">
                <span className="lx-help-card__title">
                  {t(`inspector.help.${entrada.clave}.title` as TranslationKey)}
                </span>
                <span className="lx-text-meta">
                  {t(`inspector.help.${entrada.clave}.body` as TranslationKey)}
                </span>
                <span className="lx-help-card__action">
                  {t(`inspector.help.${entrada.clave}.action` as TranslationKey)}
                </span>
              </span>
            </button>
          </Card>
        ))}
      </CardStack>

      {/* Un panel corto, no una pantalla: la especificación lo pide así y además es lo honesto.
          Acá no hay nada que configurar — sólo el estado de ahora mismo y qué va a pasar con lo
          que está esperando. */}
      <Modal
        open={verConexion}
        onClose={() => setVerConexion(false)}
        title={t('inspector.help.offline.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
          {/* El mismo dato que la insignia de la cabecera, del mismo sitio: si discreparan, uno de
              los dos estaría mintiendo. */}
          <Badge tone={online ? 'success' : 'warning'} icon={<IconOffline size={16} />}>
            {online ? t('inspector.home.online') : t('inspector.offline.badge')}
          </Badge>
          <p className="lx-text-body" style={{ margin: 0 }}>
            {t('inspector.help.offline.body')}
          </p>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {pending > 0
              ? tPlural('inspector.offline.queued', pending)
              : t('inspector.help.offline.nothingPending')}
          </p>
        </div>
      </Modal>
    </InspectorShell>
  );
}
