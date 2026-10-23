/*
  La hoja de estilos de MapLibre, sin la cual el lienzo NO se coloca: el `canvas` se queda como un
  elemento en flujo con su tamaño intrínseco —el mapa crecía a 369px dentro de una caja pedida de
  200— y los controles y la atribución pierden su posición absoluta. Va acá, en el módulo que ya
  se carga de forma perezosa, así que sigue sin pesar para quien no abre el mapa.
*/
import 'maplibre-gl/dist/maplibre-gl.css';
import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ZoneGeoJsonFeatureCollection } from '@luparx/api-client';
import { Button } from '../components/Button';
import { encuadreDe, etiquetaDeZona } from './zoneGeometry';
import { PALETA_MAPA, oscurecer, urlDelEstilo } from './estiloOscuro';
import {
  CAPA_ELEGIDA, CAPA_RELLENO, FUENTE, PROP_ETIQUETA, PROP_TONO, VERIFICADA, capasDeZonas, tonoDeZona,
} from './capas';

export interface ZoneMapTextos {
  /** Nombre accesible del mapa. */
  titulo: string;
  ampliar: string;
  cerrar: string;
  cargando: string;
  /** No hay ninguna zona verificada que dibujar. */
  vacio: string;
  errorTitulo: string;
  reintentar: string;
  /** Esta instalación no tiene proveedor de teselas configurado. */
  sinProveedor: string;
  /** El rótulo de una geometría que NO es un límite oficial. */
  noOficial: string;
  /** La advertencia que acompaña a esas geometrías. */
  noOficialDetalle: string;
}

export interface ZoneMapProps {
  /** Las zonas dibujadas de la municipalidad activa, tal como las devuelve el servidor. */
  zonas: ZoneGeoJsonFeatureCollection | undefined;
  cargando?: boolean;
  error?: boolean;
  onReintentar?: () => void;
  textos: ZoneMapTextos;
  /**
   * Alto de la vista compacta. Al ampliar ocupa la pantalla.
   *
   * <p>Admite una medida CSS y no sólo píxeles: la orden del 23-10-2026 pide «280–350 px,
   * adaptable al dispositivo», y eso es un `clamp`, no un número. Un número se sigue aceptando y
   * se lee como píxeles, que es lo que esperan las pantallas que ya lo pasaban así.</p>
   */
  altoCompacto?: number | string;
  /** Desactiva el recoloreado cuando el proveedor ya sirve un estilo oscuro. */
  recolorear?: boolean;
  /**
   * La tarifa de cada zona, ya escrita —«₡450/h»—, por código de zona.
   *
   * El GeoJSON del servidor no trae precios: trae código, nombre, procedencia y estado. La tarifa
   * la tiene la pantalla que ya pidió las zonas, y entra por acá tal como el servidor la dio. Una
   * zona ausente de este mapa se rotula sólo con su nombre; nunca se calcula un precio por hora a
   * partir de otra duración, que es la clase de cuenta que sale mal en cuanto la escalera de
   * precios no es lineal — y casi nunca lo es.
   */
  etiquetas?: Record<string, string>;
  /**
   * El código de la zona que la persona eligió, si ya eligió una.
   *
   * Con esto el mapa abre encuadrado en SU zona y no sobre toda la municipalidad: elegir «Barrio
   * Amón» y ver el conjunto —o, peor, el país— es exactamente lo que se reportó desde staging. Si
   * esa zona aún no tiene geometría dibujada, el encuadre se cae al de las que sí la tienen.
   */
  zonaDestacada?: string;
  /**
   * Qué hacer cuando alguien toca una zona dibujada. Recibe el **código** de esa zona.
   *
   * <p>Sin esto el mapa es de sólo lectura, que es como nació: una confirmación de dónde cae la
   * zona que ya se eligió en otra parte. Con esto pasa a ser también la forma de elegirla, que es
   * lo que pide el boceto aprobado.</p>
   *
   * <p><b>El mapa no es la única forma de elegir, y no puede serlo.</b> Un lienzo WebGL no se
   * recorre con el teclado ni lo lee un lector de pantalla: quien navegue así necesita el selector
   * de la pantalla, que sigue estando y manda lo mismo. Por eso este componente no se anuncia como
   * un control: se queda como imagen, y la lista de zonas es la vía accesible.</p>
   *
   * <p>Devuelve el código y no el identificador interno porque es lo único que el GeoJSON publica,
   * y porque es lo que la persona ve escrito en el rótulo.</p>
   */
  onZonaElegida?: (codigo: string) => void;
}

/**
 * El mapa informativo de las zonas de cobro de la municipalidad activa.
 *
 * <h2>Lo que este mapa NO hace</h2>
 *
 * <p>No pide ubicación ni permisos del dispositivo, no dibuja la posición del ciudadano y
 * <b>no pone un marcador en una bahía</b>: `parking_spaces` no tiene coordenadas, y un pin inventado
 * sobre una cuadra es peor que no tener mapa. Dibuja perímetros de zona, que es lo único que el
 * servidor sabe de verdad.</p>
 *
 * <p>Tampoco es un paso del flujo. Aparece después de que la bahía valida, es opcional, se puede
 * cerrar, y si falla —sin proveedor, sin red, sin geometrías— el ciudadano sigue adelante igual.</p>
 *
 * <h2>Oficial y no oficial</h2>
 *
 * <p>En producción el servidor sólo envía geometrías `VERIFIED`, así que no hay nada que rotular.
 * En desarrollo el filtro se abre y pueden llegar `UNVERIFIED` o `REJECTED` —entre ellas los ocho
 * rectángulos de demostración de San José—: ésas se dibujan en otro color, con trazo punteado y un
 * aviso visible. <b>Nunca se presentan como límites municipales.</b></p>
 */
export function ZoneMap({
  zonas,
  cargando = false,
  error = false,
  onReintentar,
  textos,
  altoCompacto = 200,
  recolorear = true,
  etiquetas,
  zonaDestacada,
  onZonaElegida,
}: ZoneMapProps): React.JSX.Element {
  const id = useId();
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<unknown>(null);
  const [ampliado, setAmpliado] = useState(false);
  const [falloMapa, setFalloMapa] = useState(false);
  const estilo = urlDelEstilo();

  const rasgos = zonas?.features ?? [];
  const noOficiales = rasgos.filter((f) => f.properties.status !== VERIFICADA).length;
  const hayQueDibujar = rasgos.length > 0;
  /*
    SIN GEOMETRÍA NO HAY MAPA — y esto corrige lo que la usuaria fotografió el 20-10 (22-10-2026).

    El 21-10 se cambió para que el mapa base se dibujara aunque no llegaran polígonos: la idea era
    que, aunque no sepamos dónde cae la zona, las calles sirven para orientarse. Lo que se vio en
    staging fue otra cosa: sin una sola geometría, el único encuadre honesto era el país, y el
    resultado es un mapa de Costa Rica y Panamá debajo de «Barrio Amón». Eso no orienta a nadie; es
    peor que no tener mapa, y la orden del 22-10 lo dice con todas las letras: «nunca en vista
    nacional».

    Así que el mapa vuelve a depender de que haya algo que encuadrar, con la diferencia que sí valía
    la pena conservar: cuando no lo hay, lo que queda es UNA LÍNEA de aviso y no la caja gris de
    200 px que había antes. Y el encuadre nunca se inventa: sale de la geometría que llegó.
  */
  const puedeDibujarse = Boolean(estilo) && !error && !cargando && hayQueDibujar;

  /*
    El mapa se crea UNA vez y después se le cambian los datos.

    Antes el efecto que lo crea dependía de `zonas`, y mientras el mapa sólo existía con geometrías
    eso no se notaba: llegaban los datos y recién entonces se creaba, una sola vez. Al dibujar
    también sin ellas, esa dependencia pasó a significar dos mapas por pantalla —uno sin datos y
    otro al llegar—, y el navegador limita los lienzos WebGL: medido el 21-10-2026, a partir del
    octavo el mapa deja de aparecer, sin error. Se vio como «el mapa no se dibuja» en el tamaño
    más chico, que es el último del barrido.

    Así que ahora son dos efectos: uno crea y destruye el mapa, el otro le pone o le quita la capa
    de zonas cuando el dato cambia.
  */
  const zonasRef = useRef(zonas);
  zonasRef.current = zonas;
  const destacadaRef = useRef(zonaDestacada);
  destacadaRef.current = zonaDestacada;
  const elegirRef = useRef(onZonaElegida);
  elegirRef.current = onZonaElegida;
  /*
    QUÉ SE ENCUADRA, Y POR QUÉ DEPENDE DE PARA QUÉ ESTÁ EL MAPA (22-10-2026).

    El 22-10 por la mañana se cambió el encuadre para que abriera en LA ZONA ELEGIDA: la usuaria
    había elegido «Barrio Amón» y veía Costa Rica y Panamá. Para un mapa que confirma dónde cae la
    zona que ya se eligió en otra parte, ése es el encuadre correcto.

    Esa misma tarde el mapa pasó a ser también la forma de ELEGIR la zona, y ahí el encuadre en una
    sola zona se vuelve un defecto: las demás quedan fuera del lienzo y no hay nada que tocar. El
    arnés lo midió —La Sabana caía en x = −240— antes de que lo viera ningún usuario.

    Así que el encuadre depende del papel: un mapa que ELIGE muestra entre qué se elige; uno que
    CONFIRMA muestra lo confirmado. El papel se sabe por si hay alguien escuchando los toques.
  */
  const encuadrarEnLaElegida = !onZonaElegida;
  /*
    Si el último cambio de zona vino de un toque EN el mapa, no se reencuadra.

    Reencuadrar es lo correcto cuando la zona cambió desde la lista —la persona pidió otra zona y
    hay que llevarla ahí— y es lo incorrecto cuando acaba de tocarla con el dedo: ya la está
    mirando, ya la encuadró ella, y moverle el mapa debajo del dedo se siente como un fallo.
  */
  const vinoDelMapa = useRef(false);
  const [generacion, setGeneracion] = useState(0);

  // --- ciclo de vida del mapa ------------------------------------------------------------------
  useEffect(() => {
    if (!estilo || !contenedor.current || !puedeDibujarse) return undefined;
    let vivo = true;
    let instancia: { remove: () => void } | null = null;

    // Carga perezosa: MapLibre pesa, y la mayoría de las sesiones de estacionamiento no abren el
    // mapa. Importarlo acá mantiene el paquete inicial del ciudadano como estaba.
    void import('maplibre-gl').then(async (mod) => {
      if (!vivo || !contenedor.current) return;
      const maplibre = mod.default ?? mod;
      try {
        let estiloFinal: unknown = estilo;
        if (recolorear) {
          const respuesta = await fetch(estilo);
          if (!respuesta.ok) throw new Error(`estilo ${respuesta.status}`);
          estiloFinal = oscurecer(await respuesta.json());
        }
        if (!vivo || !contenedor.current) return;

        const m = new maplibre.Map({
          container: contenedor.current,
          style: estiloFinal as never,
          /*
            El encuadre sale de la geometría, y si hay una zona elegida, de ESA zona.

            Elegir «Barrio Amón» y ver el país entero es lo que reportó la usuaria. El mapa se crea
            ya encuadrado donde la persona dijo que está: su zona si tiene geometría, y el conjunto
            de las que haya si todavía no eligió ninguna. Nunca un encuadre inventado: este efecto
            sólo corre cuando hay al menos un polígono.
          */
          bounds: encuadreAMaplibre(zonasRef.current,
            encuadrarEnLaElegida ? destacadaRef.current : undefined),
          fitBoundsOptions: { padding: 24, maxZoom: 15 },
          attributionControl: { compact: true },
          // En móvil el mapa vive dentro de un formulario que se desplaza: sin esto, el dedo que
          // intenta bajar la página arrastra el mapa. Pedir dos dedos es lo que recomienda MapLibre.
          cooperativeGestures: true,
          // Nada de rotar: un mapa informativo torcido sólo desorienta.
          pitchWithRotate: false,
          dragRotate: false,
          touchZoomRotate: true,
        });
        instancia = m;
        mapa.current = m;
        /*
          La costura del arnés, y la única.

          Para comprobar en un navegador que tocar una zona la elige hay que saber DÓNDE cae esa
          zona en pantalla, y eso sólo lo sabe MapLibre: es una proyección que depende del centro y
          del zoom del momento. Sin esta línea, la prueba tendría que tocar el centro del lienzo a
          ciegas —lo que sólo sirve para la zona ya encuadrada— o reimplementar la proyección, que
          es comprobar una copia en vez del código que se despliega.

          Es una asignación y nada más: el componente no lee esta propiedad, no cambia de
          comportamiento con ella, y vive en el nodo del DOM, no en `window`.
        */
        (contenedor.current as unknown as { __lxMapa?: unknown }).__lxMapa = m;
        m.touchZoomRotate?.disableRotation?.();
        m.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');

        m.on('error', () => setFalloMapa(true));
        // Las capas las pone el efecto de datos, que se entera por este contador.
        m.on('load', () => { if (vivo) setGeneracion((n) => n + 1); });
      } catch {
        if (vivo) setFalloMapa(true);
      }
    }).catch(() => {
      if (vivo) setFalloMapa(true);
    });

    return () => {
      vivo = false;
      // Sin esto, cada vez que la pantalla se redibuja queda un lienzo WebGL colgando: el navegador
      // los limita y a partir del octavo el mapa deja de aparecer, sin error.
      try { instancia?.remove(); } catch { /* ya se fue */ }
      mapa.current = null;
    };
  }, [estilo, recolorear, puedeDibujarse, encuadrarEnLaElegida]);

  /*
    Los polígonos, cuando los hay.

    Se añaden y se quitan sobre el mapa que ya existe. Sin geometrías no se añade ninguna capa y,
    si había, se retira: así no queda dibujado en pantalla un límite que el servidor dejó de
    mandar. `zonas` entra por identidad —react-query devuelve el mismo objeto mientras no cambie
    el dato—, así que esto no corre en cada redibujado.
  */
  useEffect(() => {
    const m = mapa.current as {
      getSource?: (id: string) => { setData?: (d: unknown) => void } | undefined;
      addSource?: (id: string, s: unknown) => void;
      removeSource?: (id: string) => void;
      addLayer?: (c: unknown) => void;
      removeLayer?: (id: string) => void;
      getLayer?: (id: string) => unknown;
      fitBounds?: (b: unknown, o: unknown) => void;
      getStyle?: () => EstiloCargado | undefined;
      getCanvas?: () => HTMLCanvasElement;
      on?: (evento: string, capa: string, fn: (e: unknown) => void) => void;
      off?: (evento: string, capa: string, fn: (e: unknown) => void) => void;
    } | null;
    if (!m || generacion === 0) return undefined;

    const capas = capasDeZonas({
      colorOficial: PALETA_MAPA.zona,
      colorNoOficial: PALETA_MAPA.zonaNoOficial,
      colorTexto: PALETA_MAPA.texto,
      colorBordeTexto: PALETA_MAPA.textoBorde,
      fuenteTexto: fuenteDelEstilo(m),
      codigoElegido: zonaDestacada,
    });
    const hay = Boolean(zonas && zonas.features.length > 0);
    const datos = hay ? conEtiquetas(zonas as ZoneGeoJsonFeatureCollection, etiquetas) : zonas;

    try {
      if (hay) {
        const fuente = m.getSource?.(FUENTE);
        if (fuente?.setData) fuente.setData(datos as never);
        else m.addSource?.(FUENTE, { type: 'geojson', data: datos as never });
        /*
          El anillo se quita y se vuelve a poner en cada pasada.

          Su filtro lleva el código de la zona elegida DENTRO, así que una capa que ya existe tiene
          el filtro de la zona anterior. Añadir sólo las que faltan —que es lo correcto para las
          otras cuatro, que nunca cambian— dejaría el anillo clavado en la primera zona que se
          eligió, y el síntoma sería el peor posible: el mapa marcando una zona distinta de la que
          dice la tarjeta.
        */
        if (m.getLayer?.(CAPA_ELEGIDA)) m.removeLayer?.(CAPA_ELEGIDA);
        for (const capa of capas) {
          if (!m.getLayer?.((capa as { id: string }).id)) m.addLayer?.(capa as never);
        }
        if (!vinoDelMapa.current) {
          const encuadre = encuadreAMaplibre(zonas, encuadrarEnLaElegida ? zonaDestacada : undefined);
          if (encuadre) m.fitBounds?.(encuadre, { padding: 24, maxZoom: 16, animate: false });
        }
        vinoDelMapa.current = false;
      } else {
        for (const capa of capas) {
          if (m.getLayer?.((capa as { id: string }).id)) m.removeLayer?.((capa as { id: string }).id);
        }
        if (m.getSource?.(FUENTE)) m.removeSource?.(FUENTE);
      }
    } catch {
      // El mapa puede estar yéndose mientras esto corre; no es un fallo que deba ver nadie.
    }

    /*
      El toque sobre una zona.

      Va contra el RELLENO y no contra el contorno: el dedo apunta al interior, y acertarle a una
      línea de 2 px en un teléfono no es razonable. El manejador se registra acá, después de que
      las capas existan, y se retira al salir: MapLibre reparte el evento por capa, así que un
      manejador vivo sobre una capa que ya no está es ruido que no se dispara pero que se acumula
      cada vez que cambian los datos.
    */
    if (!hay || !elegirRef.current) return undefined;
    const alTocar = (e: unknown): void => {
      const rasgo = (e as { features?: { properties?: { code?: unknown } }[] }).features?.[0];
      const codigo = rasgo?.properties?.code;
      if (typeof codigo !== 'string' || codigo.length === 0) return;
      vinoDelMapa.current = true;
      elegirRef.current?.(codigo);
    };
    const entrar = (): void => { const c = m.getCanvas?.(); if (c) c.style.cursor = 'pointer'; };
    const salir = (): void => { const c = m.getCanvas?.(); if (c) c.style.cursor = ''; };
    m.on?.('click', CAPA_RELLENO, alTocar);
    m.on?.('mouseenter', CAPA_RELLENO, entrar);
    m.on?.('mouseleave', CAPA_RELLENO, salir);
    return () => {
      try {
        m.off?.('click', CAPA_RELLENO, alTocar);
        m.off?.('mouseenter', CAPA_RELLENO, entrar);
        m.off?.('mouseleave', CAPA_RELLENO, salir);
      } catch { /* el mapa ya se fue */ }
    };
  }, [zonas, generacion, etiquetas, zonaDestacada, encuadrarEnLaElegida]);

  // Al ampliar y al cerrar cambia el tamaño del contenedor, y MapLibre no se entera solo.
  useEffect(() => {
    const m = mapa.current as { resize?: () => void } | null;
    const t = window.setTimeout(() => m?.resize?.(), 60);
    return () => window.clearTimeout(t);
  }, [ampliado]);

  // --- lo que se ve ----------------------------------------------------------------------------
  const aviso = (texto: string, accion?: React.ReactNode): React.JSX.Element => (
    <div className="lx-zonemap__aviso" role="status">
      <span>{texto}</span>
      {accion}
    </div>
  );

  let cuerpo: React.JSX.Element | null;
  if (!hayQueDibujar && !cargando && !error) {
    /*
      Sin geometría no se reserva hueco: ni lienzo, ni caja. Queda el título y la nota de una línea
      que explica por qué. Dejar el contenedor vacío de 200 px era el defecto original; dibujar el
      país dentro fue el intento siguiente, y también estaba mal.
    */
    cuerpo = null;
  } else if (!estilo) {
    cuerpo = aviso(textos.sinProveedor);
  } else if (error) {
    cuerpo = aviso(
      textos.errorTitulo,
      onReintentar ? (
        <Button type="button" variant="secondary" onClick={onReintentar}>
          {textos.reintentar}
        </Button>
      ) : undefined,
    );
  } else if (cargando) {
    cuerpo = aviso(textos.cargando);
  } else if (falloMapa) {
    cuerpo = aviso(textos.errorTitulo);
  } else {
    cuerpo = <div ref={contenedor} className="lx-zonemap__lienzo" aria-label={textos.titulo} role="img" />;
  }

  return (
    <section
      /*
        SIN NADA QUE DIBUJAR, LA SECCIÓN TAMPOCO SE DIBUJA (23-10-2026).

        El cuerpo ya se anulaba —ni lienzo ni aviso— pero la propia `<section>` seguía poniendo su
        borde, su fondo y su relleno, y lo que quedaba era un recuadro vacío con una línea de texto
        adentro. Es, exactamente, la caja que el incidente del 21-10 mandó quitar: volvió por la
        puerta de atrás, desde el contenedor en vez de desde el aviso, y la comprobación que la
        vigilaba miraba `__aviso` y no la veía.

        Con `--sin-mapa` la sección pasa a ser sólo el párrafo. La nota queda como una línea más de
        la pantalla, que es lo que la orden pide: «UNA nota breve, no párrafos técnicos» —y tampoco
        un marco que insinúe que ahí debía haber un mapa y falló.
      */
      className={['lx-zonemap', ampliado ? 'lx-zonemap--ampliado' : '',
        !hayQueDibujar && !cargando && !error ? 'lx-zonemap--sin-mapa' : '']
        .filter(Boolean).join(' ')}
      aria-labelledby={`${id}-titulo`}
      style={ampliado ? undefined : {
        ['--lx-zonemap-alto' as string]:
          typeof altoCompacto === 'number' ? `${altoCompacto}px` : altoCompacto,
      }}
    >
      {/*
        EL CROMO SE QUITA DE ENCIMA DEL MAPA CUANDO EL MAPA ES LO PRINCIPAL (22-10-2026).

        Con el mapa al final de un formulario, un título y un botón encima costaban 56 px que no se
        notaban. Desde que el mapa abre con la pantalla y es la forma de elegir la zona, cada fila
        que va encima lo empuja fuera de la primera pantalla: medido a 390 × 844, el mapa empezaba
        a 690 px de una ventana de 844.

        Así que con `onZonaElegida` —el mapa que ELIGE— el título queda sólo para quien usa lector
        de pantalla y el control de ampliar se dibuja SOBRE el lienzo, en una esquina. Sin él —el
        mapa que confirma, en «¡Listo!»— la barra se queda como estaba: ahí el mapa es un apunte
        dentro de una pantalla que ya cuenta otra cosa, y un título ayuda a saber qué es.
      */}
      {onZonaElegida ? (
        <h3 id={`${id}-titulo`} className="lx-visually-hidden">{textos.titulo}</h3>
      ) : (
        <div className="lx-zonemap__barra">
          <h3 id={`${id}-titulo`} className="lx-zonemap__titulo">{textos.titulo}</h3>
          {puedeDibujarse && !falloMapa ? (
            <Button
              type="button"
              variant="secondary"
              className="lx-zonemap__accion"
              aria-expanded={ampliado}
              onClick={() => setAmpliado((v) => !v)}
            >
              {ampliado ? textos.cerrar : textos.ampliar}
            </Button>
          ) : null}
        </div>
      )}

      {/*
        El aviso de «no son límites oficiales» pasa DEBAJO del mapa cuando el mapa es lo principal.

        Encima costaba otras dos líneas antes de que se viera nada, y el aviso es sobre lo que se
        está mirando: leerlo después de ver los bordes punteados es cuando significa algo. Lo que
        NO cambia es que el aviso exista siempre que haya una geometría no verificada: es la regla
        que impide que una zona de demostración pase por oficial, y no depende de dónde se escriba.
      */}
      {noOficiales > 0 && !onZonaElegida ? (
        <p className="lx-zonemap__noOficial" role="note">
          <strong>{textos.noOficial}</strong> {textos.noOficialDetalle}
        </p>
      ) : null}

      {onZonaElegida && puedeDibujarse && !falloMapa ? (
        <div className="lx-zonemap__lienzoConAccion">
          {cuerpo}
          <Button
            type="button"
            variant="secondary"
            className="lx-zonemap__accion lx-zonemap__accion--sobre"
            aria-expanded={ampliado}
            onClick={() => setAmpliado((v) => !v)}
          >
            {ampliado ? textos.cerrar : textos.ampliar}
          </Button>
        </div>
      ) : cuerpo}

      {noOficiales > 0 && onZonaElegida ? (
        <p className="lx-zonemap__noOficial lx-zonemap__noOficial--debajo" role="note">
          <strong>{textos.noOficial}</strong> {textos.noOficialDetalle}
        </p>
      ) : null}

      {/* Una línea, DEBAJO del mapa: primero se ven las calles y después se lee por qué no hay
          límites dibujados. Al revés, el texto volvía a ser lo primero y lo único. */}
      {!hayQueDibujar && !cargando && !error ? (
        <p className="lx-zonemap__nota" role="note">{textos.vacio}</p>
      ) : null}
    </section>
  );
}

interface EstiloCargado {
  glyphs?: string;
  layers?: { type?: string; layout?: { 'text-font'?: string[] } }[];
}

/**
 * La familia tipográfica que ya usa el estilo del proveedor, o nada.
 *
 * <p>No se escribe un nombre de fuente a mano. Si la familia no está en el juego de glifos del
 * proveedor, MapLibre lanza un error, el componente lo recoge y la pantalla entera cae al aviso de
 * fallo: un rótulo decorativo tumbaría el mapa. Así que se lee la que el propio estilo ya está
 * usando para sus etiquetas de calle —que por definición existe— y se reutiliza.</p>
 *
 * <p>Sin `glyphs` en el estilo no hay rótulos posibles: devuelve `undefined` y la capa de texto
 * sencillamente no se añade. Es lo que pasa con el estilo de prueba de los arneses, que no sirve
 * ni teselas ni tipografías.</p>
 */
function fuenteDelEstilo(m: { getStyle?: () => EstiloCargado | undefined } | null): string[] | undefined {
  try {
    const estilo = m?.getStyle?.();
    if (!estilo || !estilo.glyphs) return undefined;
    for (const capa of estilo.layers ?? []) {
      const familia = capa.layout?.['text-font'];
      if (capa.type === 'symbol' && Array.isArray(familia) && familia.length > 0) return familia;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * La misma colección, con el rótulo ya compuesto en cada rasgo.
 *
 * <p>Se copia en vez de tocar lo que llegó: el objeto del servidor lo comparte react-query con
 * quien más lo pida, y escribirle propiedades encima es la clase de efecto que después nadie
 * encuentra.</p>
 */
function conEtiquetas(
  zonas: ZoneGeoJsonFeatureCollection,
  tarifas: Record<string, string> | undefined,
): ZoneGeoJsonFeatureCollection {
  return {
    ...zonas,
    features: zonas.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        [PROP_ETIQUETA]: etiquetaDeZona(
          f.properties.name,
          tarifas?.[f.properties.code],
          f.properties.status,
        ),
        // El tono neón de esta zona, decidido acá y no en el estilo: así se puede comprobar sin
        // mapa que la misma zona sale siempre del mismo color.
        [PROP_TONO]: tonoDeZona(f.properties.code),
      },
    })),
  };
}


/**
 * El encuadre en la forma que espera MapLibre: `[[oeste, sur], [este, norte]]`.
 *
 * <p>Con una zona elegida, el encuadre es el de ESA zona: el mapa abre donde la persona dijo que
 * está, no sobre el conjunto de la municipalidad. Si esa zona todavía no tiene geometría dibujada,
 * se cae al conjunto de las que sí la tienen, que sigue siendo información verdadera.</p>
 */
function encuadreAMaplibre(
  zonas: ZoneGeoJsonFeatureCollection | undefined,
  destacada?: string,
): [[number, number], [number, number]] | undefined {
  const sola = destacada
    ? zonas?.features.filter((f) => f.properties.code === destacada)
    : undefined;
  const fuente = sola && sola.length > 0 ? { ...zonas!, features: sola } : zonas;
  const e = encuadreDe(fuente);
  return e ? [[e.minLon, e.minLat], [e.maxLon, e.maxLat]] : undefined;
}
