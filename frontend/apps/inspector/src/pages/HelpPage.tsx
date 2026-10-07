import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardStack,
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
 * El tono de una comprobación.
 *
 * <p>`aviso` no es un `problema` flojo. `problema` es algo que ahora mismo impide trabajar o puede
 * perder datos; `aviso` es algo que conviene saber y con lo que se trabaja igual —la ubicación
 * denegada, por ejemplo: una boleta sin coordenadas es una boleta perfectamente válida, y pintarla
 * de rojo enseñaría a no creerle al rojo.</p>
 */
type Tono = 'ok' | 'aviso' | 'problema';

interface Comprobacion {
  clave: string;
  tono: Tono;
  icono: React.ReactNode;
  titulo: string;
  estado: string;
  /** Sólo cuando el tono no es `ok`: qué significa y qué se puede hacer. */
  nota?: string;
  /**
   * Sólo cuando existe algo que de verdad resuelve. Nunca un botón decorativo.
   *
   * <p>`tipo` distingue las dos clases de acción, y la distinción importa: un `remedio` aparece
   * únicamente ante un problema detectado —ésa es la regla del 06-10— mientras que un `permiso` es
   * una oportunidad, no una falla: la aplicación funciona sin él y pedirlo antes del turno es mejor
   * que pedirlo frente a un carro. Las pruebas comprueban por separado que con todo en orden no
   * haya ni un `remedio`.</p>
   */
  accion?: { etiqueta: string; onClick: () => void; ocupado?: boolean; tipo: 'remedio' | 'permiso' };
}

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
  function comprobaciones(): Comprobacion[] {
    const lista: Comprobacion[] = [];

    // 1. Conexión.
    lista.push({
      clave: 'connection',
      tono: online ? 'ok' : 'problema',
      icono: <IconOffline />,
      titulo: t('inspector.help.diag.connection'),
      estado: online ? t('inspector.home.online') : t('inspector.offline.badge'),
      nota: online ? undefined : t('inspector.help.diag.connection.note'),
      accion: online
        ? undefined
        : { etiqueta: t('inspector.help.offline.action'), onClick: () => setVerConexion(true), tipo: 'remedio' },
    });

    // 2. Sincronización. Un solo dato y una sola fila: «sincronización» y «operaciones pendientes»
    //    son la misma cola leída dos veces, y dos filas que siempre dicen lo mismo son ruido.
    if (fallidas > 0) {
      lista.push({
        clave: 'sync',
        tono: 'problema',
        icono: <IconCheck />,
        titulo: t('inspector.help.diag.sync'),
        estado: tPlural('inspector.help.diag.sync.failed', fallidas),
        nota: t('inspector.help.diag.sync.failedNote'),
        // Reintentar sin señal no reintenta nada: el botón aparece sólo cuando puede funcionar.
        accion: online
          ? { etiqueta: t('inspector.help.diag.sync.retry'), onClick: () => retryAll(), tipo: 'remedio' }
          : undefined,
      });
    } else if (pending > 0) {
      lista.push({
        clave: 'sync',
        tono: 'aviso',
        icono: <IconCheck />,
        titulo: t('inspector.help.diag.sync'),
        estado: tPlural('inspector.help.diag.sync.pending', pending),
        nota: online ? t('inspector.help.diag.sync.note') : t('inspector.help.diag.sync.offlineNote'),
        accion: online
          ? {
              etiqueta: t('inspector.help.diag.sync.action'),
              onClick: () => void sincronizarAhora(),
              ocupado: sincronizando,
              tipo: 'remedio',
            }
          : undefined,
      });
    } else {
      lista.push({
        clave: 'sync',
        tono: 'ok',
        icono: <IconCheck />,
        titulo: t('inspector.help.diag.sync'),
        estado: t('inspector.help.diag.sync.ok'),
      });
    }

    // 3. Sesión.
    if (status !== 'authenticated') {
      lista.push({
        clave: 'session',
        tono: 'problema',
        icono: <IconUser />,
        titulo: t('inspector.help.diag.session'),
        estado: t('inspector.help.diag.session.problem'),
        nota: t('inspector.help.diag.session.note'),
        accion: { etiqueta: t('inspector.help.diag.session.action'), onClick: () => navigate('/login'), tipo: 'remedio' },
      });
    } else if (!activeTenant) {
      lista.push({
        clave: 'session',
        tono: 'problema',
        icono: <IconUser />,
        titulo: t('inspector.help.diag.session'),
        estado: t('inspector.help.diag.session.noTenant'),
        nota: t('inspector.help.diag.session.noTenantNote'),
        accion: {
          etiqueta: t('inspector.help.diag.session.chooseTenant'),
          onClick: () => navigate('/select-tenant'),
          tipo: 'remedio',
        },
      });
    } else {
      lista.push({
        clave: 'session',
        tono: 'ok',
        icono: <IconUser />,
        titulo: t('inspector.help.diag.session'),
        estado: t('inspector.help.diag.session.ok'),
      });
    }

    // 4 y 5. Cámara y ubicación. Un permiso denegado no trae botón: en el teléfono se activa en los
    //        ajustes del sistema, y volver a pedirlo desde acá no abre nada —sería un control
    //        muerto, que es precisamente lo que este PDF vino a quitar.
    const camara = medicion?.camara ?? 'asksOnUse';
    lista.push({
      clave: 'camera',
      tono: camara === 'denied' ? 'aviso' : 'ok',
      icono: <IconEye />,
      titulo: t('inspector.help.diag.camera'),
      estado: textoPermiso(camara),
      nota: camara === 'denied' ? t('inspector.help.diag.camera.deniedNote') : undefined,
      /*
        El botón sólo donde de verdad abre un diálogo: `asksOnUse` Y con cámara nativa. En el
        navegador no hay permiso de cámara que pedir —la foto sale del selector del sistema, y
        `requestCameraPermission()` devuelve `granted` sin preguntar nada—, así que ahí un
        «Permitir acceso» pintaría la fila de verde sin que nadie hubiera concedido nada.
      */
      accion:
        camara === 'asksOnUse' && hasNativeCamera()
          ? {
              etiqueta: t('inspector.help.diag.camera.allow'),
              onClick: () => void permitirCamara(),
              ocupado: pidiendo === 'camera',
              tipo: 'permiso',
            }
          : undefined,
    });

    const ubicacion = medicion?.ubicacion ?? 'asksOnUse';
    lista.push({
      clave: 'location',
      tono: ubicacion === 'denied' ? 'aviso' : 'ok',
      icono: <IconPin />,
      titulo: t('inspector.help.diag.location'),
      estado: textoPermiso(ubicacion),
      nota:
        ubicacion === 'denied'
          ? t('inspector.help.diag.location.deniedNote')
          : ubicacion === 'asksOnUse'
            ? t('inspector.help.diag.location.allowNote')
            : undefined,
      // Acá sí funciona en los dos sitios, porque la lectura de posición dispara el aviso del
      // sistema tanto en el teléfono como en el navegador.
      accion:
        ubicacion === 'asksOnUse'
          ? {
              etiqueta: t('inspector.help.diag.location.allow'),
              onClick: () => void permitirUbicacion(),
              ocupado: pidiendo === 'location',
              tipo: 'permiso',
            }
          : undefined,
    });

    // 6. La aplicación. Lo que de verdad se puede medir acá es si este dispositivo guarda.
    const guarda = medicion?.almacenamiento ?? true;
    lista.push({
      clave: 'app',
      tono: guarda ? 'ok' : 'problema',
      icono: <IconSystem />,
      titulo: t('inspector.help.diag.app'),
      estado: guarda ? t('inspector.help.diag.app.ok') : t('inspector.help.diag.app.problem'),
      nota: guarda ? undefined : t('inspector.help.diag.app.note'),
      accion: guarda
        ? undefined
        : {
            etiqueta: t('inspector.help.diag.app.reload'),
            onClick: () => window.location.reload(),
            tipo: 'remedio',
          },
    });

    return lista;
  }

  const filas = comprobaciones();
  const hayProblema = filas.some((fila) => fila.tono === 'problema');
  const hayAviso = filas.some((fila) => fila.tono === 'aviso');

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
        <div className="lx-diag">
          {medicion === null ? (
            <p className="lx-text-meta" style={{ margin: 0 }}>
              {t('inspector.help.diag.checking')}
            </p>
          ) : (
            <>
              <Alert
                tone={hayProblema ? 'warning' : hayAviso ? 'info' : 'success'}
                testId="inspector-diagnostico-resumen"
              >
                {hayProblema
                  ? t('inspector.help.diag.someIssue')
                  : hayAviso
                    ? t('inspector.help.diag.someWarning')
                    : t('inspector.help.diag.allGood')}
              </Alert>
              <ul className="lx-diag__list">
                {filas.map((fila) => (
                  <li
                    key={fila.clave}
                    className="lx-diag__row"
                    data-tono={fila.tono}
                    data-check={fila.clave}
                    data-accion={fila.accion?.tipo}
                  >
                    <span className="lx-diag__icon" aria-hidden="true">
                      {fila.icono}
                    </span>
                    <div className="lx-diag__body">
                      <p className="lx-diag__title">
                        {fila.titulo}
                        {/* El tono se dice también en palabras: el color no es información para
                            quien no lo distingue, y una fila con problema tiene que leerse como tal
                            en un lector de pantalla. */}
                        <span className="lx-visually-hidden">
                          {' · '}
                          {fila.tono === 'ok'
                            ? t('inspector.help.diag.tone.ok')
                            : fila.tono === 'aviso'
                              ? t('inspector.help.diag.tone.warning')
                              : t('inspector.help.diag.tone.problem')}
                        </span>
                      </p>
                      <p className="lx-diag__state">{fila.estado}</p>
                      {fila.nota ? <p className="lx-diag__note">{fila.nota}</p> : null}
                      {fila.accion ? (
                        <Button
                          type="button"
                          variant="secondary"
                          className="lx-diag__action"
                          loading={fila.accion.ocupado}
                          onClick={fila.accion.onClick}
                        >
                          {fila.accion.ocupado
                            ? t(
                                fila.accion.tipo === 'permiso'
                                  ? 'inspector.help.diag.permission.working'
                                  : 'inspector.help.diag.sync.working',
                              )
                            : fila.accion.etiqueta}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Modal>
    </InspectorShell>
  );
}
