import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
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
  requestCameraPermission,
  takePosition,
  type PermissionReadiness,
} from '../lib/capture';
import { useCitationQueue, useIsOnline } from '../lib/queries';
import { lastSyncAt } from '../lib/citationQueue';

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
/**
 * Las cuatro cosas que Ayuda resuelve (reestructurada el 08-10-2026).
 *
 * <p>Eran seis tarjetas y cuatro de ellas —«Consultar una placa», «Levantar una boleta», «Fotos y
 * evidencia» y «Pendientes»— llevaban a destinos que la barra inferior ya tiene a un toque. El
 * encargo lo dice con todas las letras: «Ayuda NO es una segunda barra de navegación». Las
 * funciones no se tocan; lo que se va es su acceso duplicado desde acá.</p>
 *
 * <p>Lo que queda no navega a ninguna parte: cada una abre un panel que MIDE o ACTÚA sobre el
 * aparato. Ése es el criterio y por eso ninguna lleva ruta.</p>
 */
type ClavePanel = 'diag' | 'permissions' | 'sync' | 'report';

const ACCIONES: { clave: ClavePanel; icono: React.ReactNode }[] = [
  { clave: 'diag', icono: <IconGauge /> },
  // El escudo SÍ es el icono correcto acá, al revés que en el acceso a Ayuda: esto son permisos de
  // verdad, que es justo lo que un escudo significa en el resto del sistema.
  { clave: 'permissions', icono: <IconShield /> },
  // El mismo icono que la pestaña «Pendientes» de la barra inferior, porque es la misma cola: si
  // el panel de sincronización se dibujara con otro símbolo, parecerían dos cosas distintas.
  { clave: 'sync', icono: <IconCheck /> },
  { clave: 'report', icono: <IconMail /> },
];

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
  const { t, tPlural, locale } = useTranslation();
  const navigate = useNavigate();
  const online = useIsOnline();
  const { rows, pending, flush, retryAll } = useCitationQueue();
  const { status, activeTenant } = useAuth();
  /*
    Un solo estado para los cuatro paneles, en vez de un booleano por panel. Con cuatro, cuatro
    booleanos abren la puerta a dos paneles a la vez; con una clave, abrir uno cierra el otro por
    construcción. `null` es «ninguno».
  */
  const [panel, setPanel] = useState<ClavePanel | null>(null);
  /** Si el estado ya se copió al portapapeles, para decirlo en vez de dejar la duda. */
  const [copiado, setCopiado] = useState<'ok' | 'error' | null>(null);
  const [medicion, setMedicion] = useState<Medicion | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  /** Qué permiso se está pidiendo ahora mismo, para que su botón diga «Pidiendo…» y no dos veces. */
  const [pidiendo, setPidiendo] = useState<'camera' | 'location' | null>(null);

  const fallidas = rows.filter((row) => row.state === 'FAILED').length;
  /*
    La última sincronización de ESTE aparato. Se lee en cada pintada y no hace falta suscribirse:
    el único momento en que cambia es cuando una boleta pasa a `SENT`, y eso ya mueve las filas de
    la cola, que sí son reactivas. Así que cuando este valor cambia, el componente ya se está
    volviendo a pintar por el otro camino.
  */
  const ultimaSync = lastSyncAt(activeTenant?.id ?? null);

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
    if (panel !== 'diag' && panel !== 'permissions') return;
    void medir();
  }, [panel, medir]);

  /**
   * Abre un panel.
   *
   * <p>El diagnóstico y los permisos vuelven a medir al abrirse —`setMedicion(null)` los deja en
   * su estado de carga y el efecto de abajo dispara la medición—, porque los dos informan de algo
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
   * Cámara y ubicación: los dos permisos que esta aplicación usa de verdad.
   *
   * <p>Extraídas a su propia función el 08-10-2026 porque ahora las leen DOS sitios —el
   * diagnóstico y el panel de «Permisos del dispositivo»— y el encargo pide los dos. Separar el
   * código habría dejado dos listas que pueden discrepar: una diciendo «Permitido» y la otra
   * «Bloqueado» sobre el mismo permiso, en la misma pantalla, a un toque de distancia.</p>
   *
   * <p>La cámara va primera, y no es alfabético: el encargo la llama prioritaria porque sin ella
   * no se puede adjuntar evidencia a una boleta.</p>
   *
   * <p>No hay fila de notificaciones. El encargo la pide «si la app las utiliza», y no las
   * utiliza: esta aplicación nunca llama a `Notification.requestPermission` —los avisos de la
   * campana los sirve el servidor, que es otra cosa— así que una fila de permiso de
   * notificaciones mediría algo que el aparato no le concede a nadie.</p>
   */
  function comprobacionesPermisos(): DiagnosticCheck[] {
    const filas: DiagnosticCheck[] = [];
    // 4 y 5. Cámara y ubicación. Un permiso denegado no trae botón: en el teléfono se activa en los
    //        ajustes del sistema, y volver a pedirlo desde acá no abre nada —sería un control
    //        muerto, que es precisamente lo que este PDF vino a quitar.
    const camara = medicion?.camara ?? 'asksOnUse';
    filas.push({
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
    filas.push({
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
    return filas;
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
        : {
            label: t('inspector.help.offline.action'),
            // Lleva al panel de Sincronización, que es donde ahora viven el estado de la conexión
            // y lo que está esperando. Antes abría un panel propio de «Si te quedás sin señal»,
            // que decía lo mismo con otras palabras.
            onClick: () => setPanel('sync'),
            kind: 'remedy',
          },
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

    lista.push(...comprobacionesPermisos());

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

  /**
   * El estado de la aplicación en texto plano, para pegarlo en un mensaje a soporte.
   *
   * <p>Sale de las mismas mediciones que el diagnóstico, no de una plantilla: si el diagnóstico
   * dice que la cámara está bloqueada, esto también. Sin datos personales —ni placas, ni nombres,
   * ni la municipalidad— porque esto se pega en un WhatsApp y no hay razón para que lleve nada
   * de eso. Lo que soporte necesita es el estado del aparato.</p>
   */
  function resumenDelEstado(): string {
    const lineas = [
      `LuParX · Fiscalización`,
      `Fecha: ${new Date().toISOString()}`,
      `Conexión: ${online ? 'en línea' : 'sin conexión'}`,
      `Pendientes: ${pending}`,
      `Con error: ${fallidas}`,
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

  const filas = comprobaciones();
  const permisos = comprobacionesPermisos();

  return (
    <InspectorShell title={t('inspector.help.title')} onBack={() => navigate('/more')}>
      {/* «¿En qué podemos ayudarte?», y después sólo botones. Sin párrafos: el encargo pide
          «texto corto, una acción por botón, poco desplazamiento», y esto se lee de pie. */}
      <p className="lx-text-body" style={{ margin: 0 }}>
        {t('inspector.help.lead')}
      </p>

      <Card>
        {/*
          Icono + nombre + chevron, que es el formato exacto que pide el encargo, y con `ListRow`,
          que ya dibuja esa fila en los dos portales. No se creó ninguna tarjeta nueva: lo que había
          —`.lx-help-card`, con su título, su párrafo y su frase de acción— era el formato de la
          Ayuda VIEJA, la de las explicaciones largas, y es justo lo que este encargo quita.
        */}
        {ACCIONES.map((accion) => (
          <ListRow
            key={accion.clave}
            icon={accion.icono}
            title={t(`inspector.help.entry.${accion.clave}` as TranslationKey)}
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
            checks={permisos}
          />
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
              value={pending > 0 ? String(pending) : t('inspector.help.diag.sync.ok')}
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

    </InspectorShell>
  );
}
