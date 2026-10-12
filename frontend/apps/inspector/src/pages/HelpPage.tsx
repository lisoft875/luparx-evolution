import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { formatDateTime, useTranslation, type TranslationKey } from '@luparx/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  DiagnosticList,
  IconCheck,
  IconChevronRight,
  IconEye,
  IconGauge,
  IconHelp,
  IconMail,
  IconOffline,
  IconPin,
  IconShield,
  IconSystem,
  IconUser,
  ListRow,
  Modal,
  SummaryList,
  SummaryRow,
} from '@luparx/ui';
import type { DiagnosticCheck } from '@luparx/ui';
import { InspectorShell } from '../components/InspectorShell';
import {
  cameraPermissionState,
  hasNativeCamera,
  locationPermissionState,
  probePosition,
  requestCameraPermission,
  takeNativePhoto,
  type PermissionReadiness,
  type PositionProbe,
} from '../lib/capture';
import { probeServer, type ServerReach } from '../lib/serverProbe';
import { GUIAS, pasoDeGuia, tituloDeGuia } from '../lib/helpGuides';
import { useCitationQueue, useIsOnline } from '../lib/queries';
import { lastSyncAt } from '../lib/citationQueue';

/**
 * El Centro de soporte de Fiscalización.
 *
 * <h2>De dónde viene</h2>
 *
 * <p>Esta pantalla fue cinco tarjetas de texto (26-09), después cinco tarjetas que ERAN la acción,
 * después seis con un modal que repetía la pantalla que lo había abierto (06-10, un error mío), y
 * desde el 08-10 cuatro filas que no navegan a ninguna parte: cada una MIDE o ACTÚA sobre el
 * aparato. Ése sigue siendo el criterio y por eso ninguna lleva ruta — «Ayuda no es una segunda
 * barra de navegación».</p>
 *
 * <h2>Qué cambió el 12-10-2026</h2>
 *
 * <p>El encargo del Centro de soporte pidió una auditoría antes de tocar nada, y la auditoría
 * encontró que lo que había estaba bien y le faltaban cosas concretas. Lo que se agregó:</p>
 *
 * <ul>
 *   <li><b>Conectividad de verdad.</b> `useIsOnline` es `navigator.onLine`, que contesta «¿hay una
 *       interfaz de red?» y dice que sí con un portal cautivo o el servidor caído. Ahora el
 *       diagnóstico además MIDE contra `GET /inspector/zones` — ver `serverProbe.ts`.</li>
 *   <li><b>Las coordenadas que ya se estaban midiendo.</b> `takePosition` devolvía latitud,
 *       longitud y precisión y esta pantalla tiraba el resultado.</li>
 *   <li><b>La causa de un fallo de GPS.</b> Denegado, sin receptor o se venció el tiempo llevan a
 *       tres sitios distintos y antes se pintaban igual.</li>
 *   <li><b>«Probar cámara» y «Volver a comprobar».</b></li>
 *   <li><b>Las dos filas que faltaban</b> para las seis del §7: guías y «Acerca de».</li>
 * </ul>
 *
 * <h2>Lo que sigue sin existir, a propósito</h2>
 *
 * <ul>
 *   <li><b>El formulario de incidencias.</b> No hay endpoint de soporte en el servidor —auditadas
 *       las 32 rutas— y el §5 dice implementarlo «únicamente cuando se defina un destino
 *       autorizado». Un formulario que no envía es la simulación que ese mismo párrafo prohíbe.</li>
 *   <li><b>Un segundo sistema de nada.</b> La cola, la conexión y los permisos salen de los mismos
 *       módulos que alimentan la insignia de la cabecera y el contador de la barra inferior.</li>
 * </ul>
 */
type ClavePanel = 'diag' | 'permissions' | 'sync' | 'report' | 'guides' | 'about';

const ACCIONES: { clave: ClavePanel; icono: React.ReactNode }[] = [
  { clave: 'diag', icono: <IconGauge /> },
  // El escudo SÍ es el icono correcto acá, al revés que en el acceso a Ayuda: esto son permisos de
  // verdad, que es justo lo que un escudo significa en el resto del sistema.
  { clave: 'permissions', icono: <IconShield /> },
  // El mismo icono que la pestaña «Pendientes» de la barra inferior, porque es la misma cola: si
  // el panel de sincronización se dibujara con otro símbolo, parecerían dos cosas distintas.
  { clave: 'sync', icono: <IconCheck /> },
  { clave: 'report', icono: <IconMail /> },
  { clave: 'guides', icono: <IconHelp /> },
  { clave: 'about', icono: <IconSystem /> },
];

/** Lo que las comprobaciones asíncronas devuelven. `null` mientras se están midiendo. */
interface Medicion {
  camara: PermissionReadiness;
  ubicacion: PermissionReadiness;
  almacenamiento: boolean;
  /** Si este aparato tiene receptor de posición. Sin él no hay permiso que arreglar. */
  hayUbicacion: boolean;
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

/** Si este aparato ofrece posición. En el navegador es `navigator.geolocation`; en nativo, el plugin. */
function hayReceptorDeUbicacion(): boolean {
  if (typeof navigator === 'undefined') return false;
  return Boolean(navigator.geolocation);
}

/** Coordenadas con seis decimales, que es la precisión con la que se guardan en la boleta. */
function coordenada(valor: number): string {
  return valor.toFixed(6);
}

export function HelpPage(): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const navigate = useNavigate();
  const online = useIsOnline();
  const { rows, pending, flush, retryAll } = useCitationQueue();
  const { status, activeTenant, apiClient } = useAuth();
  /*
    Un solo estado para los paneles, en vez de un booleano por panel. Con seis, seis booleanos
    abren la puerta a dos paneles a la vez; con una clave, abrir uno cierra el otro por
    construcción. `null` es «ninguno».
  */
  const [panel, setPanel] = useState<ClavePanel | null>(null);
  /** Si el estado ya se copió al portapapeles, para decirlo en vez de dejar la duda. */
  const [copiado, setCopiado] = useState<'ok' | 'error' | null>(null);
  const [medicion, setMedicion] = useState<Medicion | null>(null);
  /** Lo que contestó el servidor la última vez que se le preguntó. `null` mientras se pregunta. */
  const [red, setRed] = useState<ServerReach | null>(null);
  /** La última lectura de posición hecha desde esta pantalla, con su causa si falló. */
  const [gps, setGps] = useState<PositionProbe | null>(null);
  /** Cómo terminó la última prueba de cámara. Nunca guarda la fotografía. */
  const [camaraPrueba, setCamaraPrueba] = useState<'ok' | 'cancelled' | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  /** Qué se está pidiendo ahora mismo, para que su botón lo diga y no se pueda pulsar dos veces. */
  const [pidiendo, setPidiendo] = useState<'camera' | 'location' | 'network' | null>(null);
  /*
    La cámara del navegador es un `<input type="file" capture>` y no una API: en Safari no existe
    ningún permiso de cámara que pedir desde la página, la decisión la toma el selector del sistema
    en el momento de usarla. Así que «Probar cámara» en el navegador es pulsar este input, y el
    archivo que devuelve se descarta sin leerlo.
  */
  const inputCamara = useRef<HTMLInputElement | null>(null);

  const fallidas = rows.filter((row) => row.state === 'FAILED').length;
  const enviadas = rows.filter((row) => row.state === 'SENT').length;
  /*
    La última sincronización de ESTE aparato. Se lee en cada pintada y no hace falta suscribirse:
    el único momento en que cambia es cuando una boleta pasa a `SENT`, y eso ya mueve las filas de
    la cola, que sí son reactivas. Así que cuando este valor cambia, el componente ya se está
    volviendo a pintar por el otro camino.
  */
  const ultimaSync = lastSyncAt(activeTenant?.id ?? null);
  /**
   * «Sin pendientes» no es «todo sincronizado» (§4, que lo prohíbe por su nombre).
   *
   * <p>Hasta hoy la cola vacía decía «Todo sincronizado» en un aparato recién entregado que no
   * había enviado una sola boleta, y lo decía al lado de una fila que decía «este aparato no ha
   * enviado nada todavía». Las dos frases eran ciertas y juntas no se entendían.</p>
   */
  const nuncaEnvio = ultimaSync === null && enviadas === 0;

  /**
   * Mide lo que hay que preguntar y esperar. Se vuelve a correr cada vez que se abre el panel y
   * después de cada acción: un diagnóstico que no se actualiza tras pulsar «Sincronizar ahora»
   * deja al fiscalizador mirando el problema que acaba de resolver.
   */
  const medir = useCallback(async () => {
    const [camara, ubicacion] = await Promise.all([cameraPermissionState(), locationPermissionState()]);
    setMedicion({
      camara,
      ubicacion,
      almacenamiento: almacenamientoDisponible(),
      hayUbicacion: hayReceptorDeUbicacion(),
    });
  }, []);

  /** La otra mitad del diagnóstico: la que sale del aparato y llega —o no— al servidor. */
  const medirRed = useCallback(async () => {
    setRed(null);
    setRed(await probeServer(apiClient));
  }, [apiClient]);

  useEffect(() => {
    if (panel !== 'diag' && panel !== 'permissions') return;
    void medir();
    // La red sólo se mide en el diagnóstico: el panel de permisos no habla de la conexión y una
    // llamada de red al abrirlo sería trabajo que nadie pidió.
    if (panel === 'diag') void medirRed();
  }, [panel, medir, medirRed]);

  /**
   * Abre un panel.
   *
   * <p>El diagnóstico y los permisos vuelven a medir al abrirse —`setMedicion(null)` los deja en
   * su estado de carga y el efecto de arriba dispara la medición—, porque los dos informan de algo
   * que la persona pudo haber cambiado en los ajustes del sistema mientras la aplicación estaba
   * abierta. La sincronización no mide nada: lee la cola, que ya es reactiva.</p>
   */
  function abrirPanel(clave: ClavePanel): void {
    if (clave === 'diag' || clave === 'permissions') setMedicion(null);
    if (clave === 'report') setCopiado(null);
    setPanel(clave);
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
   * <p>Llama a {@link probePosition} y no a `requestLocationPermission`, que es lo que parecería
   * natural: en el navegador esa función no pregunta nada —devuelve `granted` si existe
   * `navigator.geolocation` y se acabó— porque el aviso del sistema lo dispara la PRIMERA lectura.
   * Un botón que no abre ningún diálogo y después pinta la fila en verde estaría mintiendo. Una
   * lectura real pregunta, y después la medición dice lo que el usuario contestó.</p>
   */
  async function probarUbicacion(): Promise<void> {
    setPidiendo('location');
    try {
      setGps(await probePosition());
    } finally {
      setPidiendo(null);
      await medir();
    }
  }

  /** El permiso de cámara, que en nativo sí tiene una solicitud de verdad. */
  async function permitirCamara(): Promise<void> {
    setPidiendo('camera');
    try {
      await requestCameraPermission();
    } finally {
      setPidiendo(null);
      await medir();
    }
  }

  /**
   * «Probar cámara»: abre la captura real y NO guarda nada.
   *
   * <p>El §2 pide las tres cosas: que la abra sólo una acción de la persona, que sea la captura de
   * verdad y que se pueda cancelar sin guardar la foto. En nativo se distingue la cancelación
   * —`takeNativePhoto` devuelve `null`—; en el navegador no, porque cerrar el selector del sistema
   * no emite ningún evento. Así que en el navegador esta pantalla no afirma que cancelaste: no
   * dice nada hasta que llega una imagen. Decir «cancelaste» sin saberlo sería inventar.</p>
   */
  async function probarCamara(): Promise<void> {
    setCamaraPrueba(null);
    if (hasNativeCamera()) {
      setPidiendo('camera');
      try {
        const foto = await takeNativePhoto();
        setCamaraPrueba(foto ? 'ok' : 'cancelled');
      } finally {
        setPidiendo(null);
        await medir();
      }
      return;
    }
    inputCamara.current?.click();
  }

  /** La foto de prueba llegó. Se cuenta como éxito y se suelta sin leerla ni guardarla. */
  function camaraRespondio(evento: React.ChangeEvent<HTMLInputElement>): void {
    const hubo = (evento.target.files?.length ?? 0) > 0;
    // Limpiar el input permite volver a probar con la misma foto y, sobre todo, no deja el archivo
    // colgando del DOM.
    evento.target.value = '';
    if (hubo) setCamaraPrueba('ok');
    void medir();
  }

  /** El permiso, dicho en palabras. Los tres estados existen porque los tres pasan de verdad. */
  function textoPermiso(estado: PermissionReadiness): string {
    if (estado === 'granted') return t('inspector.help.diag.permission.granted');
    if (estado === 'denied') return t('inspector.help.diag.permission.denied');
    return t('inspector.help.diag.permission.asks');
  }

  /**
   * Cámara y ubicación: los dos permisos que esta aplicación usa de verdad.
   *
   * <p>Las leen DOS sitios —el diagnóstico y el panel de «Permisos del dispositivo»— y por eso son
   * UNA función. Separarlas dejaría dos listas que pueden discrepar: una diciendo «Permitido» y la
   * otra «Bloqueado» sobre el mismo permiso, en la misma pantalla, a un toque de distancia.</p>
   *
   * <p>La cámara va primera, y no es alfabético: sin ella no se puede adjuntar evidencia.</p>
   *
   * <p>No hay fila de notificaciones. Esta aplicación nunca llama a `Notification.requestPermission`
   * —los avisos de la campana los sirve el servidor, que es otra cosa— así que una fila de permiso
   * de notificaciones mediría algo que el aparato no le concede a nadie.</p>
   */
  function comprobacionesPermisos(): DiagnosticCheck[] {
    const filas: DiagnosticCheck[] = [];
    const hayCamara = typeof navigator !== 'undefined';
    const camara = medicion?.camara ?? 'asksOnUse';
    filas.push({
      key: 'camera',
      tone: !hayCamara ? 'unavailable' : camara === 'denied' ? 'warning' : 'ok',
      icon: <IconEye />,
      title: t('inspector.help.diag.camera'),
      state: hayCamara ? textoPermiso(camara) : t('inspector.help.diag.camera.unavailable'),
      note: !hayCamara
        ? t('inspector.help.diag.camera.unavailableNote')
        : camara === 'denied'
          ? t('inspector.help.diag.camera.deniedNote')
          : camaraPrueba === 'ok'
            ? t('inspector.help.diag.camera.testOk')
            : camaraPrueba === 'cancelled'
              ? t('inspector.help.diag.camera.testCancelled')
              : undefined,
      /*
        Un permiso denegado no trae botón de permiso: en el teléfono se activa en los ajustes del
        sistema y volver a pedirlo desde acá no abre nada —sería un control muerto—. Lo que sí
        trae, siempre que haya algo que abrir, es «Probar cámara», que es una comprobación y no una
        concesión: con el permiso ya dado sigue siendo útil para ver si la cámara responde.
      */
      action: !hayCamara
        ? undefined
        : camara === 'asksOnUse' && hasNativeCamera()
          ? {
              label: t('inspector.help.diag.camera.allow'),
              onClick: () => void permitirCamara(),
              busy: pidiendo === 'camera',
              busyLabel: t('inspector.help.diag.permission.working'),
              kind: 'permission',
            }
          : camara === 'denied'
            ? undefined
            : {
                label: t('inspector.help.diag.camera.test'),
                onClick: () => void probarCamara(),
                busy: pidiendo === 'camera',
                busyLabel: t('inspector.help.diag.camera.testing'),
                kind: 'permission',
              },
    });

    const ubicacion = medicion?.ubicacion ?? 'asksOnUse';
    const hayReceptor = medicion?.hayUbicacion ?? true;
    /*
      La causa, cuando la última lectura falló. Son tres y llevan a tres sitios distintos: el
      permiso se arregla en Ajustes, la falta de receptor no se arregla, y un tiempo vencido se
      vuelve a intentar al aire libre. Hasta hoy las tres se pintaban igual.
    */
    const notaUbicacion = ((): string | undefined => {
      if (!hayReceptor) return t('inspector.help.diag.location.unavailableNote');
      if (ubicacion === 'denied') return t('inspector.help.diag.location.deniedNote');
      if (gps?.outcome === 'timeout') return t('inspector.help.diag.location.timeoutNote');
      if (gps?.outcome === 'unavailable') return t('inspector.help.diag.location.unavailableNote');
      if (gps?.outcome === 'ok') {
        return gps.position.accuracyM === null
          ? t('inspector.help.diag.location.accuracyUnknown')
          : t('inspector.help.diag.location.accuracy', { m: Math.round(gps.position.accuracyM) });
      }
      if (ubicacion === 'asksOnUse') return t('inspector.help.diag.location.allowNote');
      return undefined;
    })();

    filas.push({
      key: 'location',
      tone: !hayReceptor
        ? 'unavailable'
        : ubicacion === 'denied' || gps?.outcome === 'timeout'
          ? 'warning'
          : 'ok',
      icon: <IconPin />,
      title: t('inspector.help.diag.location'),
      state: !hayReceptor
        ? t('inspector.help.diag.location.unavailable')
        : gps?.outcome === 'ok'
          ? // La lectura real manda sobre el estado del permiso: si hay coordenadas, el permiso se
            // concedió, y además éste es el dato que el §2 pide mostrar.
            t('inspector.help.diag.location.fix', {
              lat: coordenada(gps.position.latitude),
              lon: coordenada(gps.position.longitude),
            })
          : gps?.outcome === 'timeout'
            ? t('inspector.help.diag.location.timeout')
            : textoPermiso(ubicacion),
      note: notaUbicacion,
      // Acá el botón funciona en los dos sitios, porque la lectura de posición dispara el aviso del
      // sistema tanto en el teléfono como en el navegador. Con el permiso denegado no se ofrece:
      // no abriría nada.
      action:
        hayReceptor && ubicacion !== 'denied'
          ? {
              label: t('inspector.help.diag.location.test'),
              onClick: () => void probarUbicacion(),
              busy: pidiendo === 'location',
              busyLabel: t('inspector.help.diag.permission.working'),
              kind: 'permission',
            }
          : undefined,
    });
    return filas;
  }

  /** La fila de conexión: lo que el sistema dice, y lo que el servidor contestó. */
  function comprobacionConexion(): DiagnosticCheck {
    if (!online) {
      return {
        key: 'connection',
        tone: 'problem',
        icon: <IconOffline />,
        title: t('inspector.help.diag.connection'),
        state: t('inspector.offline.badge'),
        note: t('inspector.help.diag.connection.note'),
        action: {
          label: t('inspector.help.offline.action'),
          // Lleva al panel de Sincronización, que es donde viven el estado de la conexión y lo que
          // está esperando.
          onClick: () => setPanel('sync'),
          kind: 'remedy',
        },
      };
    }
    const reintentar = {
      label: t('inspector.help.diag.connection.retest'),
      onClick: () => void medirRed(),
      busy: pidiendo === 'network',
      busyLabel: t('inspector.help.diag.connection.checking'),
      kind: 'remedy' as const,
    };
    if (red === null) {
      return {
        key: 'connection',
        tone: 'ok',
        icon: <IconOffline />,
        title: t('inspector.help.diag.connection'),
        state: t('inspector.help.diag.connection.checking'),
      };
    }
    if (red.state === 'ok') {
      return {
        key: 'connection',
        tone: 'ok',
        icon: <IconOffline />,
        title: t('inspector.help.diag.connection'),
        state: t('inspector.help.diag.connection.ok', { ms: red.ms }),
      };
    }
    if (red.state === 'slow') {
      return {
        key: 'connection',
        tone: 'warning',
        icon: <IconOffline />,
        title: t('inspector.help.diag.connection'),
        state: t('inspector.help.diag.connection.slow', { ms: red.ms }),
        note: t('inspector.help.diag.connection.slowNote'),
        action: reintentar,
      };
    }
    if (red.state === 'unauthorized') {
      // Llegar y que te rechacen es LLEGAR. Mandar a esta persona a buscar señal sería mandarla
      // lejos del problema, que es su sesión — y de eso se ocupa la fila de abajo.
      return {
        key: 'connection',
        tone: 'warning',
        icon: <IconOffline />,
        title: t('inspector.help.diag.connection'),
        state: t('inspector.help.diag.connection.unauthorized'),
        note: t('inspector.help.diag.connection.unauthorizedNote'),
        action: reintentar,
      };
    }
    const vencido = red.state === 'timeout';
    return {
      key: 'connection',
      tone: 'problem',
      icon: <IconOffline />,
      title: t('inspector.help.diag.connection'),
      state: vencido
        ? t('inspector.help.diag.connection.timeout')
        : t('inspector.help.diag.connection.unreachable'),
      note: vencido
        ? t('inspector.help.diag.connection.timeoutNote')
        : t('inspector.help.diag.connection.unreachableNote'),
      action: reintentar,
    };
  }

  /** La fila de sincronización, con las tres salidas que el §4 pide distinguir. */
  function comprobacionSincronizacion(): DiagnosticCheck {
    if (fallidas > 0) {
      return {
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
      };
    }
    if (pending > 0) {
      return {
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
      };
    }
    return {
      key: 'sync',
      tone: 'ok',
      icon: <IconCheck />,
      title: t('inspector.help.diag.sync'),
      state: nuncaEnvio ? t('inspector.help.diag.sync.nothingYet') : t('inspector.help.diag.sync.ok'),
      note: nuncaEnvio ? t('inspector.help.sync.nothingYetNote') : undefined,
    };
  }

  /** Las comprobaciones, en el orden del encargo. */
  function comprobaciones(): DiagnosticCheck[] {
    const lista: DiagnosticCheck[] = [comprobacionConexion(), comprobacionSincronizacion()];

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

    lista.push(...comprobacionesPermisos());

    // La aplicación. Lo que de verdad se puede medir acá es si este dispositivo guarda.
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

  /**
   * El estado de la aplicación en texto plano, para pegarlo en un mensaje a soporte.
   *
   * <p>Sale de las mismas mediciones que el diagnóstico, no de una plantilla: si el diagnóstico
   * dice que la cámara está bloqueada, esto también. Sin datos personales —ni placas, ni nombres,
   * ni la municipalidad— porque esto se pega en un WhatsApp y no hay razón para que lleve nada
   * de eso. Lo que soporte necesita es el estado del aparato.</p>
   *
   * <p>Desde el 12-10 lleva además la compilación y la pantalla, que son las dos primeras cosas
   * que pregunta quien recibe el reporte: «¿qué versión tenés?» y «¿dónde estabas?».</p>
   */
  function resumenDelEstado(): string {
    const lineas = [
      `LuParX · Fiscalización`,
      `Versión: ${__LUPARX_VERSION__}`,
      `Compilación: ${__LUPARX_BUILD__ ?? 'no disponible'}`,
      `Entorno: ${__LUPARX_ENV__ ?? 'no disponible'}`,
      `Pantalla de la app: ${window.location.pathname}${window.location.hash}`,
      `Fecha: ${new Date().toISOString()}`,
      `Conexión: ${online ? 'en línea' : 'sin conexión'}`,
      `Servidor: ${red ? red.state : 'sin medir'}`,
      `Pendientes: ${pending}`,
      `Con error: ${fallidas}`,
      `Enviadas: ${enviadas}`,
      `Última sincronización: ${ultimaSync ?? 'nunca'}`,
      `Cámara: ${medicion ? medicion.camara : 'sin medir'}`,
      `Ubicación: ${medicion ? medicion.ubicacion : 'sin medir'}`,
      `Almacenamiento: ${medicion ? (medicion.almacenamiento ? 'ok' : 'no disponible') : 'sin medir'}`,
      `Sesión: ${status}`,
      `Pantalla: ${window.innerWidth}x${window.innerHeight}`,
      `Navegador: ${navigator.userAgent}`,
    ];
    return lineas.join('\n');
  }

  /** Copia ese texto. Si el portapapeles no está disponible, se dice; el texto sigue a la vista. */
  async function copiarEstado(): Promise<void> {
    try {
      await navigator.clipboard.writeText(resumenDelEstado());
      setCopiado('ok');
    } catch {
      setCopiado('error');
    }
  }

  const etiquetasDeTono = {
    ok: t('inspector.help.diag.tone.ok'),
    warning: t('inspector.help.diag.tone.warning'),
    problem: t('inspector.help.diag.tone.problem'),
    unavailable: t('inspector.help.diag.tone.unavailable'),
  };
  const resumenDeTonos = {
    allGood: t('inspector.help.diag.allGood'),
    warning: t('inspector.help.diag.someWarning'),
    problem: t('inspector.help.diag.someIssue'),
  };
  const filas = comprobaciones();
  const permisos = comprobacionesPermisos();
  const desconocido = t('inspector.help.about.unknown');

  return (
    <InspectorShell title={t('inspector.help.title')} onBack={() => navigate('/more')}>
      {/* «¿En qué podemos ayudarte?», y después sólo botones. Sin párrafos: el encargo pide
          «texto corto, una acción por botón, poco desplazamiento», y esto se lee de pie. */}
      <p className="lx-text-body" style={{ margin: 0 }}>
        {t('inspector.help.lead')}
      </p>

      {/* El input de la prueba de cámara en el navegador. Fuera de la tarjeta y oculto: lo dispara
          el botón del diagnóstico, nunca se ve, y lo que devuelve se descarta sin leerlo. */}
      <input
        ref={inputCamara}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="inspector-probar-camara"
        onChange={camaraRespondio}
      />

      <Card>
        {/*
          Icono + nombre + descripción + chevron, que es el formato exacto que pide el §7, y con
          `ListRow`, que ya dibuja esa fila en los dos portales y ya tiene `meta` para la
          descripción: no hizo falta ni una propiedad nueva.
        */}
        {ACCIONES.map((accion) => (
          <ListRow
            key={accion.clave}
            icon={accion.icono}
            title={t(`inspector.help.entry.${accion.clave}` as TranslationKey)}
            meta={t(`inspector.help.entry.${accion.clave}.meta` as TranslationKey)}
            value={<IconChevronRight size={16} />}
            onClick={() => abrirPanel(accion.clave)}
          />
        ))}
      </Card>

      {/*
        Diagnóstico: estado → problema → solución, en ese orden y sin una fila de más. El resumen
        va arriba para que «¿está funcionando?» se conteste sin desplazarse, que es como se mira
        esto: de pie y con prisa. Es EL diagnóstico que ya existía — no hay un segundo.
      */}
      <Modal
        open={panel === 'diag'}
        onClose={() => setPanel(null)}
        title={t('inspector.help.diag.title')}
        closeLabel={t('common.close')}
      >
        {/* La pintura la pone `DiagnosticList`, del paquete compartido: acá sólo se MIDE. */}
        <DiagnosticList
          loading={medicion === null}
          loadingLabel={t('inspector.help.diag.checking')}
          summaryTestId="inspector-diagnostico-resumen"
          summary={resumenDeTonos}
          toneLabels={etiquetasDeTono}
          checks={filas}
        />
      </Modal>

      {/*
        Permisos del dispositivo. El mismo componente y las MISMAS comprobaciones que el
        diagnóstico —`comprobacionesPermisos()`—, filtradas a lo que este panel trata. Que sean la
        misma función no es ahorro de código: es la garantía de que las dos pantallas no puedan
        decir cosas distintas del mismo permiso.
      */}
      <Modal
        open={panel === 'permissions'}
        onClose={() => setPanel(null)}
        title={t('inspector.help.permissions.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('inspector.help.permissions.lead')}
          </p>
          <DiagnosticList
            loading={medicion === null}
            loadingLabel={t('inspector.help.diag.checking')}
            summary={resumenDeTonos}
            toneLabels={etiquetasDeTono}
            checks={permisos}
          />
          {/* «Volver a comprobar»: el §3 lo pide por su nombre, para después de cambiar los
              ajustes del sistema. No reabre ningún diálogo —no podría— y eso es justo lo que la
              nota de abajo explica. */}
          <Button type="button" variant="secondary" fullWidth onClick={() => void medir()}>
            {t('inspector.help.permissions.recheck')}
          </Button>
          {/* Dónde se cambia de verdad. Tres sistemas y no uno: el aparato del encargo es un iPad
              en Safari, donde el permiso NO está donde está el de una aplicación instalada. */}
          <div>
            <p className="lx-text-meta" style={{ margin: '0 0 var(--lx-space-1)', fontWeight: 600 }}>
              {t('inspector.help.permissions.settings.title')}
            </p>
            <ul className="lx-guide__step" style={{ paddingLeft: 'var(--lx-space-4)' }}>
              <li>{t('inspector.help.permissions.settings.safari')}</li>
              <li>{t('inspector.help.permissions.settings.ios')}</li>
              <li>{t('inspector.help.permissions.settings.android')}</li>
            </ul>
          </div>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('inspector.help.permissions.apiNote')}
          </p>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('inspector.help.permissions.none')}
          </p>
        </div>
      </Modal>

      {/*
        Sincronización. Todo lo que muestra sale de la cola de este aparato —la misma que alimenta
        el número de la pestaña «Pendientes» y el de la campana—, así que no puede discrepar con
        ellos. Ningún dato es inventado y lo que no existe se dice: un teléfono que nunca envió
        nada no tiene una última sincronización, y eso se escribe en palabras en vez de con una
        fecha cualquiera.
      */}
      <Modal
        open={panel === 'sync'}
        onClose={() => setPanel(null)}
        title={t('inspector.help.sync.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
          <Badge tone={online ? 'success' : 'warning'} icon={<IconOffline size={16} />}>
            {online ? t('inspector.home.online') : t('inspector.offline.badge')}
          </Badge>
          <SummaryList>
            <SummaryRow
              label={t('inspector.help.sync.pendingLabel')}
              value={
                pending > 0
                  ? String(pending)
                  : nuncaEnvio
                    ? t('inspector.help.diag.sync.nothingYet')
                    : t('inspector.help.diag.sync.ok')
              }
            />
            {/* El §4 pide las cuatro cantidades y ésta faltaba: el estado `SENT` existía en la cola
                desde siempre y la pantalla no lo mostraba. */}
            <SummaryRow
              label={t('inspector.help.sync.sentLabel')}
              value={enviadas > 0 ? tPlural('inspector.help.sync.sent', enviadas) : t('inspector.help.sync.noneSent')}
            />
            <SummaryRow
              label={t('inspector.help.sync.lastLabel')}
              value={ultimaSync ? formatDateTime(ultimaSync, locale) : t('inspector.help.sync.never')}
            />
            <SummaryRow
              label={t('inspector.help.sync.errorsLabel')}
              value={
                fallidas > 0
                  ? tPlural('inspector.help.diag.sync.failed', fallidas)
                  : t('inspector.help.sync.noErrors')
              }
            />
          </SummaryList>
          {!online ? (
            <p className="lx-text-meta" style={{ margin: 0 }}>
              {t('inspector.help.diag.sync.offlineNote')}
            </p>
          ) : null}
          {/* El botón sólo cuando puede hacer algo: sin señal no envía, y con la cola vacía no hay
              nada que enviar. Un control que no hace nada es el defecto que este encargo vino a
              quitar de esta pantalla. */}
          {online && (pending > 0 || fallidas > 0) ? (
            <Button
              type="button"
              fullWidth
              loading={sincronizando}
              onClick={() => void sincronizarAhora()}
            >
              {t('inspector.help.diag.sync.action')}
            </Button>
          ) : null}
        </div>
      </Modal>

      {/*
        Reportar un problema — y acá hay que decir la verdad, que es lo que el encargo pide
        explícitamente: NO EXISTE canal para enviarlo. Se auditaron las rutas del servidor y no hay
        ninguna de soporte, reporte ni incidencias.

        Así que este panel no finge. Dice que no se puede enviar y ofrece lo único que sí funciona
        de verdad: copiar el estado de la aplicación para pegarlo en el mensaje a quien da soporte.
        El texto que copia sale de las mismas mediciones que el diagnóstico, no de una plantilla.

        Cuando exista el endpoint, lo que cambia es este panel y nada más.
      */}
      <Modal
        open={panel === 'report'}
        onClose={() => setPanel(null)}
        title={t('inspector.help.report.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
          <Alert tone="info">{t('inspector.help.report.noBackend')}</Alert>
          <Button type="button" variant="secondary" fullWidth onClick={() => void copiarEstado()}>
            {t('inspector.help.report.copy')}
          </Button>
          {copiado ? (
            <p className="lx-text-meta" role="status" style={{ margin: 0 }}>
              {copiado === 'ok' ? t('inspector.help.report.copied') : t('inspector.help.report.failed')}
            </p>
          ) : null}
          {/* El texto, siempre a la vista: si el portapapeles falla —y falla, en contextos sin
              HTTPS y en algunos WebView— la persona todavía puede leerlo y escribirlo. */}
          <pre className="lx-report-state">{resumenDelEstado()}</pre>
        </div>
      </Modal>

      {/*
        Guías de uso. Seis tareas, cada una un `<details>` del navegador: abre, cierra, lo anuncia
        un lector de pantalla y no necesita una línea de JavaScript ni un componente nuevo.

        Lo que describen es lo que ESTA aplicación hace. El procedimiento de la municipalidad
        —cuándo corresponde multar, qué plazos corren— no está acá y la cabecera lo dice: escribirlo
        sería inventar una norma con cara de instrucción.
      */}
      <Modal
        open={panel === 'guides'}
        onClose={() => setPanel(null)}
        title={t('inspector.help.guides.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('inspector.help.guides.lead')}
          </p>
          <div>
            {GUIAS.map((guia) => (
              <details key={guia.clave} className="lx-guide" data-guia={guia.clave}>
                <summary className="lx-guide__summary">{t(tituloDeGuia(guia.clave))}</summary>
                <div className="lx-guide__body">
                  <ol className="lx-guide__step">
                    {Array.from({ length: guia.pasos }, (_, i) => (
                      <li key={i}>{t(pasoDeGuia(guia.clave, i + 1))}</li>
                    ))}
                  </ol>
                </div>
              </details>
            ))}
          </div>
        </div>
      </Modal>

      {/*
        Acerca de LuParX. Los cuatro datos los escribe el proceso de compilación —ver
        `vite.config.ts`— y por eso son ciertos: no hay lectura en ejecución que pueda fallar ni
        constante escrita a mano que se quede vieja.

        Lo que NO se hace es inventar el dato que falta. Una compilación que no recibió el hash del
        commit dice «no disponible en esta compilación», que es exactamente lo que el §6 pide al
        prohibir inventar datos. La otra opción era abrir `/actuator/info` al público, y nginx lo
        cierra a propósito con una razón mejor que un renglón de esta pantalla.
      */}
      <Modal
        open={panel === 'about'}
        onClose={() => setPanel(null)}
        title={t('inspector.help.about.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
          <SummaryList>
            <SummaryRow label={t('inspector.help.about.version')} value={__LUPARX_VERSION__} />
            <SummaryRow label={t('inspector.help.about.build')} value={__LUPARX_BUILD__ ?? desconocido} />
            <SummaryRow label={t('inspector.help.about.environment')} value={__LUPARX_ENV__ ?? desconocido} />
            <SummaryRow
              label={t('inspector.help.about.builtAt')}
              value={formatDateTime(__LUPARX_BUILT_AT__, locale)}
            />
          </SummaryList>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('inspector.help.about.note')}
          </p>
        </div>
      </Modal>
    </InspectorShell>
  );
}
