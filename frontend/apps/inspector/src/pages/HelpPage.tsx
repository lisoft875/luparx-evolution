import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import {
  Badge,
  Card,
  CardStack,
  DiagnosticList,
  IconCheck,
  IconChevronRight,
  IconEye,
  IconFine,
  IconGauge,
  IconOffline,
  IconPin,
  IconSearch,
  IconSystem,
  IconUser,
  Modal,
} from '@luparx/ui';
import type { DiagnosticCheck } from '@luparx/ui';
import { InspectorShell } from '../components/InspectorShell';
import {
  cameraPermissionState,
  hasNativeCamera,
  locationPermissionState,
  requestCameraPermission,
  takePosition,
  type PermissionReadiness,
} from '../lib/capture';
import { useCitationQueue, useIsOnline } from '../lib/queries';

/**
 * Ayuda: cinco eventualidades del turno y, la sexta, el diagnóstico de la aplicación.
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
 * <h2>Qué cambió el 06-10-2026, y por qué era un error mío</h2>
 *
 * <p>La sexta tarjeta era «Resolver un problema» y abría una lista de siete filas. Cinco de esas
 * siete ERAN, por construcción, las cinco tarjetas de arriba: las derivaba de la misma tabla para
 * que no pudieran discrepar. El resultado fue peor que la discrepancia que evitaba —un modal que
 * repetía la pantalla que lo había abierto— y se ve de un golpe en las dos capturas del PDF del
 * 06-10. La derivación era correcta y la idea era mala.</p>
 *
 * <p>La sexta tarjeta ahora hace lo único que ninguna de las otras cinco hace: MEDIR. Responde
 * «¿mi aplicación está funcionando?» con seis comprobaciones del estado real, y ofrece un botón
 * solamente donde hay algo que arreglar. Si no hay nada, no hay ningún botón: un control de
 * recuperación visible cuando no hay nada que recuperar enseña a ignorarlo.</p>
 *
 * <h2>Lo que NO se creó, a propósito</h2>
 *
 * <ul>
 *   <li><b>Ningún segundo sistema offline.</b> El panel de «Si te quedás sin señal» y el
 *       diagnóstico leen {@link useIsOnline} y {@link useCitationQueue}, que son los mismos que
 *       alimentan la insignia de la cabecera y el contador de la barra inferior. Si alguna vez
 *       discrepan, es un error; por eso hay una sola fuente.</li>
 *   <li><b>Ninguna galería de evidencia.</b> Las fotos se agregan DENTRO de una boleta, así que la
 *       tarjeta lleva al flujo de boleta, que es el punto correcto del flujo existente.</li>
 *   <li><b>Ninguna ruta nueva, ningún endpoint nuevo.</b> `/`, `/cite` y `/queue` ya estaban, y el
 *       diagnóstico no llama al servidor: todo lo que informa se mide en el dispositivo.</li>
 *   <li><b>Ninguna versión de la aplicación.</b> El PDF la pide «si ya existe». No existe: el
 *       frontend no expone ninguna, y escribir una constante a mano sería inventar el dato que el
 *       propio PDF prohíbe inventar.</li>
 * </ul>
 */
type ClaveEventualidad = 'offline' | 'plate' | 'citation' | 'evidence' | 'queue';

interface Entrada {
  clave: ClaveEventualidad | 'diag';
  icono: React.ReactNode;
  /**
   * Adónde lleva. `null` = abre un panel, no una pantalla: la conexión para `offline`, el
   * diagnóstico para `diag`.
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

/** Las seis tarjetas: las cinco de siempre y el diagnóstico, que es la sexta. */
const ENTRADAS: Entrada[] = [...EVENTUALIDADES, { clave: 'diag', icono: <IconGauge />, ruta: null }];

/**
 * Lo que mide esta pantalla.
 *
 * <p>La forma —tono, icono, estado, nota, acción— y su dibujo viven en `DiagnosticList`, del
 * paquete compartido. Acá queda sólo lo que el fiscalizador comprueba, que no se parece a lo que
 * comprueba el ciudadano.</p>
 */
/** Lo que las comprobaciones asíncronas devuelven. `null` mientras se están midiendo. */
interface Medicion {
  camara: PermissionReadiness;
  ubicacion: PermissionReadiness;
  almacenamiento: boolean;
}

/**
 * ¿Este dispositivo está guardando lo que la aplicación le confía?
 *
 * <p>La cola de boletas vive en `localStorage` (ver `citationQueue.ts`). En modo privado, o con el
 * almacenamiento lleno, escribir ahí lanza —y entonces una boleta levantada sin señal se pierde al
 * cerrar la aplicación, en silencio y sin que nada en la pantalla lo delate. Es el único fallo de
 * esta aplicación que no se nota hasta que ya costó una boleta, así que se comprueba escribiendo
 * de verdad y borrando lo escrito.</p>
 */
function almacenamientoDisponible(): boolean {
  try {
    const clave = 'luparx.diag.probe';
    window.localStorage.setItem(clave, '1');
    window.localStorage.removeItem(clave);
    return true;
  } catch {
    return false;
  }
}

export function HelpPage(): React.JSX.Element {
  const { t, tPlural } = useTranslation();
  const navigate = useNavigate();
  const online = useIsOnline();
  const { rows, pending, flush, retryAll } = useCitationQueue();
  const { status, activeTenant } = useAuth();
  const [verConexion, setVerConexion] = useState(false);
  const [verDiagnostico, setVerDiagnostico] = useState(false);
  const [medicion, setMedicion] = useState<Medicion | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  /** Qué permiso se está pidiendo ahora mismo, para que su botón diga «Pidiendo…» y no dos veces. */
  const [pidiendo, setPidiendo] = useState<'camera' | 'location' | null>(null);

  const fallidas = rows.filter((row) => row.state === 'FAILED').length;

  /**
   * Mide lo que hay que preguntar y esperar. Se vuelve a correr cada vez que se abre el panel y
   * después de cada acción: un diagnóstico que no se actualiza tras pulsar «Sincronizar ahora»
   * deja al fiscalizador mirando el problema que acaba de resolver.
   */
  const medir = useCallback(async () => {
    const [camara, ubicacion] = await Promise.all([cameraPermissionState(), locationPermissionState()]);
    setMedicion({ camara, ubicacion, almacenamiento: almacenamientoDisponible() });
  }, []);

  useEffect(() => {
    if (!verDiagnostico) return;
    void medir();
  }, [verDiagnostico, medir]);

  /** Abre lo que esa tarjeta abre: la conexión, o el diagnóstico. */
  function abrirPanel(clave: Entrada['clave']): void {
    if (clave === 'diag') {
      setMedicion(null);
      setVerDiagnostico(true);
    } else {
      setVerConexion(true);
    }
  }

  async function sincronizarAhora(): Promise<void> {
    setSincronizando(true);
    try {
      await flush();
    } finally {
      setSincronizando(false);
      await medir();
    }
  }

  /**
   * Pide la ubicación de verdad, con lo que ya existe.
   *
   * <p>Llama a {@link takePosition} y no a `requestLocationPermission`, que es lo que parecería
   * natural: en el navegador esa función no pregunta nada —devuelve `granted` si existe
   * `navigator.geolocation` y se acabó— porque el aviso del sistema lo dispara la PRIMERA lectura.
   * Un botón que no abre ningún diálogo y después pinta la fila en verde estaría mintiendo. Una
   * lectura real pregunta, y después la medición dice lo que el usuario contestó.</p>
   */
  async function permitirUbicacion(): Promise<void> {
    setPidiendo('location');
    try {
      await takePosition();
    } finally {
      setPidiendo(null);
      await medir();
    }
  }

  /** Lo mismo para la cámara, que en nativo sí tiene una solicitud de permiso de verdad. */
  async function permitirCamara(): Promise<void> {
    setPidiendo('camera');
    try {
      await requestCameraPermission();
    } finally {
      setPidiendo(null);
      await medir();
    }
  }

  /** El permiso, dicho en palabras. Los tres estados existen porque los tres pasan de verdad. */
  function textoPermiso(estado: PermissionReadiness): string {
    if (estado === 'granted') return t('inspector.help.diag.permission.granted');
    if (estado === 'denied') return t('inspector.help.diag.permission.denied');
    return t('inspector.help.diag.permission.asks');
  }

  /**
   * Las seis comprobaciones, en el orden del PDF.
   *
   * <p>Ninguna fila lleva a «Consultar una placa», «Levantar una boleta», «Fotos y evidencia» ni
   * «Pendientes» como acceso: §4 lo prohíbe en letra, y además sería volver a la lista que esto
   * vino a borrar. Una ruta sólo aparece cuando ES el remedio del problema detectado.</p>
   */
  function comprobaciones(): DiagnosticCheck[] {
    const lista: DiagnosticCheck[] = [];

    // 1. Conexión.
    lista.push({
      key: 'connection',
      tone: online ? 'ok' : 'problem',
      icon: <IconOffline />,
      title: t('inspector.help.diag.connection'),
      state: online ? t('inspector.home.online') : t('inspector.offline.badge'),
      note: online ? undefined : t('inspector.help.diag.connection.note'),
      action: online
        ? undefined
        : { label: t('inspector.help.offline.action'), onClick: () => setVerConexion(true), kind: 'remedy' },
    });

    // 2. Sincronización. Un solo dato y una sola fila: «sincronización» y «operaciones pendientes»
    //    son la misma cola leída dos veces, y dos filas que siempre dicen lo mismo son ruido.
    if (fallidas > 0) {
      lista.push({
        key: 'sync',
        tone: 'problem',
        icon: <IconCheck />,
        title: t('inspector.help.diag.sync'),
        state: tPlural('inspector.help.diag.sync.failed', fallidas),
        note: t('inspector.help.diag.sync.failedNote'),
        // Reintentar sin señal no reintenta nada: el botón aparece sólo cuando puede funcionar.
        action: online
          ? { label: t('inspector.help.diag.sync.retry'), onClick: () => retryAll(), kind: 'remedy' }
          : undefined,
      });
    } else if (pending > 0) {
      lista.push({
        key: 'sync',
        tone: 'warning',
        icon: <IconCheck />,
        title: t('inspector.help.diag.sync'),
        state: tPlural('inspector.help.diag.sync.pending', pending),
        note: online ? t('inspector.help.diag.sync.note') : t('inspector.help.diag.sync.offlineNote'),
        action: online
          ? {
              label: t('inspector.help.diag.sync.action'),
              onClick: () => void sincronizarAhora(),
              busy: sincronizando,
              busyLabel: t('inspector.help.diag.sync.working'),
              kind: 'remedy',
            }
          : undefined,
      });
    } else {
      lista.push({
        key: 'sync',
        tone: 'ok',
        icon: <IconCheck />,
        title: t('inspector.help.diag.sync'),
        state: t('inspector.help.diag.sync.ok'),
      });
    }

    // 3. Sesión.
    if (status !== 'authenticated') {
      lista.push({
        key: 'session',
        tone: 'problem',
        icon: <IconUser />,
        title: t('inspector.help.diag.session'),
        state: t('inspector.help.diag.session.problem'),
        note: t('inspector.help.diag.session.note'),
        action: { label: t('inspector.help.diag.session.action'), onClick: () => navigate('/login'), kind: 'remedy' },
      });
    } else if (!activeTenant) {
      lista.push({
        key: 'session',
        tone: 'problem',
        icon: <IconUser />,
        title: t('inspector.help.diag.session'),
        state: t('inspector.help.diag.session.noTenant'),
        note: t('inspector.help.diag.session.noTenantNote'),
        action: {
          label: t('inspector.help.diag.session.chooseTenant'),
          onClick: () => navigate('/select-tenant'),
          kind: 'remedy',
        },
      });
    } else {
      lista.push({
        key: 'session',
        tone: 'ok',
        icon: <IconUser />,
        title: t('inspector.help.diag.session'),
        state: t('inspector.help.diag.session.ok'),
      });
    }

    // 4 y 5. Cámara y ubicación. Un permiso denegado no trae botón: en el teléfono se activa en los
    //        ajustes del sistema, y volver a pedirlo desde acá no abre nada —sería un control
    //        muerto, que es precisamente lo que este PDF vino a quitar.
    const camara = medicion?.camara ?? 'asksOnUse';
    lista.push({
      key: 'camera',
      tone: camara === 'denied' ? 'warning' : 'ok',
      icon: <IconEye />,
      title: t('inspector.help.diag.camera'),
      state: textoPermiso(camara),
      note: camara === 'denied' ? t('inspector.help.diag.camera.deniedNote') : undefined,
      /*
        El botón sólo donde de verdad abre un diálogo: `asksOnUse` Y con cámara nativa. En el
        navegador no hay permiso de cámara que pedir —la foto sale del selector del sistema, y
        `requestCameraPermission()` devuelve `granted` sin preguntar nada—, así que ahí un
        «Permitir acceso» pintaría la fila de verde sin que nadie hubiera concedido nada.
      */
      action:
        camara === 'asksOnUse' && hasNativeCamera()
          ? {
              label: t('inspector.help.diag.camera.allow'),
              onClick: () => void permitirCamara(),
              busy: pidiendo === 'camera',
              busyLabel: t('inspector.help.diag.permission.working'),
              kind: 'permission',
            }
          : undefined,
    });

    const ubicacion = medicion?.ubicacion ?? 'asksOnUse';
    lista.push({
      key: 'location',
      tone: ubicacion === 'denied' ? 'warning' : 'ok',
      icon: <IconPin />,
      title: t('inspector.help.diag.location'),
      state: textoPermiso(ubicacion),
      note:
        ubicacion === 'denied'
          ? t('inspector.help.diag.location.deniedNote')
          : ubicacion === 'asksOnUse'
            ? t('inspector.help.diag.location.allowNote')
            : undefined,
      // Acá sí funciona en los dos sitios, porque la lectura de posición dispara el aviso del
      // sistema tanto en el teléfono como en el navegador.
      action:
        ubicacion === 'asksOnUse'
          ? {
              label: t('inspector.help.diag.location.allow'),
              onClick: () => void permitirUbicacion(),
              busy: pidiendo === 'location',
              busyLabel: t('inspector.help.diag.permission.working'),
              kind: 'permission',
            }
          : undefined,
    });

    // 6. La aplicación. Lo que de verdad se puede medir acá es si este dispositivo guarda.
    const guarda = medicion?.almacenamiento ?? true;
    lista.push({
      key: 'app',
      tone: guarda ? 'ok' : 'problem',
      icon: <IconSystem />,
      title: t('inspector.help.diag.app'),
      state: guarda ? t('inspector.help.diag.app.ok') : t('inspector.help.diag.app.problem'),
      note: guarda ? undefined : t('inspector.help.diag.app.note'),
      action: guarda
        ? undefined
        : {
            label: t('inspector.help.diag.app.reload'),
            onClick: () => window.location.reload(),
            kind: 'remedy',
          },
    });

    return lista;
  }

  const filas = comprobaciones();

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
                {/* Frase corta y flecha: lo que antes era «Ir a consultar una placa» ahora es
                    «Consultar placa ›». La flecha no es decorativa —dice que esto lleva a algún
                    lado— pero se marca `aria-hidden` porque eso ya lo dice el texto, y un lector de
                    pantalla anunciando «chevron derecha» después de cada acción es ruido. */}
                <span className="lx-help-card__action">
                  {t(`inspector.help.${entrada.clave}.action` as TranslationKey)}
                  <span className="lx-help-card__go" aria-hidden="true">
                    <IconChevronRight size={14} />
                  </span>
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

      {/* El diagnóstico: estado → problema → solución, en ese orden y sin una sola fila de más.
          El resumen va arriba para que la respuesta a «¿está funcionando?» se lea sin desplazarse,
          que es como se mira esto: de pie y con prisa. */}
      <Modal
        open={verDiagnostico}
        onClose={() => setVerDiagnostico(false)}
        title={t('inspector.help.diag.title')}
        closeLabel={t('common.close')}
      >
        {/* La pintura la pone `DiagnosticList`, del paquete compartido: acá sólo se MIDE.
            Cuando el Ciudadano pidió su diagnóstico el 07-10, la alternativa era copiar ochenta
            líneas de `<li>`; lo que las dos pantallas comparten es la forma de una comprobación,
            no lo que comprueban —el ciudadano no tiene cola de boletas, ni cámara, ni GPS—. */}
        <DiagnosticList
          loading={medicion === null}
          loadingLabel={t('inspector.help.diag.checking')}
          summaryTestId="inspector-diagnostico-resumen"
          summary={{
            allGood: t('inspector.help.diag.allGood'),
            warning: t('inspector.help.diag.someWarning'),
            problem: t('inspector.help.diag.someIssue'),
          }}
          toneLabels={{
            ok: t('inspector.help.diag.tone.ok'),
            warning: t('inspector.help.diag.tone.warning'),
            problem: t('inspector.help.diag.tone.problem'),
          }}
          checks={filas}
        />
      </Modal>
    </InspectorShell>
  );
}
