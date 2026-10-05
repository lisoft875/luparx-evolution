import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import {
  Badge,
  Button,
  Card,
  CardStack,
  IconArrowLeft,
  IconCheck,
  IconEye,
  IconFine,
  IconOffline,
  IconSearch,
  IconShield,
  IconSystem,
  ListRow,
  Modal,
  SummaryList,
  SummaryRow,
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
type ClaveEventualidad = 'offline' | 'plate' | 'citation' | 'evidence' | 'queue';
type ClaveProblema = ClaveEventualidad | 'error' | 'back';

interface Entrada {
  clave: ClaveEventualidad | 'triage';
  icono: React.ReactNode;
  /**
   * Adónde lleva. `null` = abre un panel, no una pantalla: la conexión para `offline`, la lista de
   * problemas para `triage`.
   */
  ruta: string | null;
}

/** Las cinco eventualidades, en el orden en que se leen. */
const EVENTUALIDADES: { clave: ClaveEventualidad; icono: React.ReactNode; ruta: string | null }[] = [
  { clave: 'offline', icono: <IconOffline />, ruta: null },
  { clave: 'plate', icono: <IconSearch />, ruta: '/' },
  { clave: 'citation', icono: <IconFine />, ruta: '/cite' },
  // La evidencia vive dentro de la boleta: llevar al mismo sitio es lo correcto, no un descuido.
  { clave: 'evidence', icono: <IconEye />, ruta: '/cite' },
  { clave: 'queue', icono: <IconCheck />, ruta: '/queue' },
];

/**
 * Las seis tarjetas: las cinco de siempre y el triaje, que es la sexta (05-10-2026).
 *
 * <p>La sexta no es una explicación más. Las otras cinco suponen que uno ya sabe cuál de las cinco
 * aplica; ésta es para cuando no se sabe, y por eso va al final y abre una lista en vez de llevar
 * a una ruta.</p>
 */
const ENTRADAS: Entrada[] = [
  ...EVENTUALIDADES,
  { clave: 'triage', icono: <IconShield />, ruta: null },
];

/**
 * Los siete problemas del triaje, y por qué esta tabla se DERIVA de la de arriba.
 *
 * <p>Cinco de los siete son las mismas cinco eventualidades, con el mismo destino. Escribirlos otra
 * vez habría dejado dos listas que pueden discrepar: cambiar la ruta de la evidencia en una y
 * olvidarla en la otra es el error que se comete a los tres meses, y el síntoma —una ayuda que
 * lleva a un sitio y otra ayuda que lleva a otro— no se parece a su causa. Así que las cinco se
 * toman de {@link EVENTUALIDADES} y sólo se agregan los dos que el PDF trae nuevos.</p>
 */
const PROBLEMAS: { clave: ClaveProblema; icono: React.ReactNode }[] = [
  ...EVENTUALIDADES.map(({ clave, icono }) => ({ clave: clave as ClaveProblema, icono })),
  { clave: 'error', icono: <IconSystem /> },
  { clave: 'back', icono: <IconArrowLeft /> },
];

export function HelpPage(): React.JSX.Element {
  const { t, tPlural } = useTranslation();
  const navigate = useNavigate();
  const online = useIsOnline();
  const { pending } = useCitationQueue();
  const [verConexion, setVerConexion] = useState(false);
  const [verProblemas, setVerProblemas] = useState(false);
  const [verError, setVerError] = useState(false);

  /** Abre lo que esa tarjeta abre: la conexión, o la lista de problemas. */
  function abrirPanel(clave: Entrada['clave']): void {
    if (clave === 'triage') setVerProblemas(true);
    else setVerConexion(true);
  }

  /**
   * Resuelve un problema del triaje con lo que ya existe. Ninguna rama crea un proceso paralelo.
   */
  function resolver(clave: ClaveProblema): void {
    setVerProblemas(false);
    if (clave === 'error') {
      setVerError(true);
      return;
    }
    if (clave === 'back') {
      // La navegación que ya hay, no una nueva: el historial del navegador, que es el mismo que
      // mueve la flecha de la cabecera. Sin historial —una pestaña abierta directo en /help— no
      // hay «anterior», así que se va a la raíz del módulo, que es la Consulta.
      if (typeof window !== 'undefined' && window.history.length > 1) navigate(-1);
      else navigate('/');
      return;
    }
    const eventualidad = EVENTUALIDADES.find((e) => e.clave === clave);
    if (!eventualidad) return;
    if (eventualidad.ruta === null) setVerConexion(true);
    else navigate(eventualidad.ruta);
  }

  return (
    <InspectorShell title={t('inspector.help.title')} onBack={() => navigate('/more')}>
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
              onClick={() => (entrada.ruta === null ? abrirPanel(entrada.clave) : navigate(entrada.ruta))}
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

      {/* La sexta opción: un triaje, no un manual. Siete filas, cada una con su salida ya
          construida, y la fila se cierra en el acto —la lista no es un sitio donde quedarse. */}
      <Modal
        open={verProblemas}
        onClose={() => setVerProblemas(false)}
        title={t('inspector.help.triage.title')}
        closeLabel={t('common.close')}
      >
        <p className="lx-text-meta" style={{ marginTop: 0 }}>
          {t('inspector.help.triage.intro')}
        </p>
        <div>
          {PROBLEMAS.map((problema) => (
            <ListRow
              key={problema.clave}
              icon={problema.icono}
              title={t(`inspector.help.${problema.clave}.title` as TranslationKey)}
              meta={t(`inspector.help.${problema.clave}.action` as TranslationKey)}
              onClick={() => resolver(problema.clave)}
            />
          ))}
        </div>
      </Modal>

      {/* «La aplicación presenta un error»: información útil y la recuperación que ya existe.
          Lo útil es lo que la aplicación de verdad sabe —conexión, cuánto está esperando— y no una
          lista de causas posibles; la recuperación es volver a montarla, que es exactamente lo que
          hace el botón de reintentar de la pantalla de error. */}
      <Modal
        open={verError}
        onClose={() => setVerError(false)}
        title={t('inspector.help.error.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
          <SummaryList>
            <SummaryRow
              label={t('inspector.help.error.state')}
              value={online ? t('inspector.home.online') : t('inspector.offline.badge')}
            />
            <SummaryRow
              label={t('inspector.help.queue.title')}
              value={
                pending > 0
                  ? tPlural('inspector.offline.queued', pending)
                  : t('inspector.help.offline.nothingPending')
              }
            />
          </SummaryList>
          <p className="lx-text-body" style={{ margin: 0 }}>
            {t('inspector.help.error.body')}
          </p>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('inspector.help.error.safe')}
          </p>
          <Button type="button" fullWidth onClick={() => window.location.reload()}>
            {t('inspector.help.error.reload')}
          </Button>
        </div>
      </Modal>
    </InspectorShell>
  );
}
