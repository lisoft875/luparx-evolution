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
import { FUENTE, PROP_ETIQUETA, VERIFICADA, capasDeZonas } from './capas';

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
  /** Alto de la vista compacta. Al ampliar ocupa la pantalla. */
  altoCompacto?: number;
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
    El mapa base NO depende de que haya polígonos (21-10-2026).

    Hasta hoy, sin geometrías verificadas no se dibujaba nada: en su lugar salía una caja gris con
    un texto, que es lo que la usuaria fotografió en staging ocupando media pantalla. El motivo
    estaba escrito acá abajo —«sin posición inicial inventada: el encuadre lo da la geometría»— y
    seguía siendo cierto, pero la conclusión era desproporcionada: que no sepamos dónde cae una zona
    no quita que las calles existan y sirvan para orientarse.

    Ahora el mapa base se dibuja siempre que haya proveedor, y los polígonos se añaden sólo si
    llegaron. Nada se inventa: sin geometrías no se pinta ningún límite municipal ni ninguna bahía,
    y el aviso lo dice en una línea en vez de en una caja vacía.
  */
  const puedeDibujarse = Boolean(estilo) && !error && !cargando;

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
            El encuadre lo da la geometría que llegó. Si no llegó ninguna, el país — y es lo
            único honesto que se puede poner: el nombre de la municipalidad no es una
            coordenada, y convertirlo en una sería inventarle una ubicación a un dato que el
            servidor no mandó. Desde el país, la persona acerca hasta su calle.
          */
          bounds: encuadreAMaplibre(zonasRef.current) ?? COSTA_RICA,
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
  }, [estilo, recolorear, puedeDibujarse]);

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
    } | null;
    if (!m || generacion === 0) return;

    const capas = capasDeZonas({
      colorOficial: PALETA_MAPA.zona,
      colorNoOficial: PALETA_MAPA.zonaNoOficial,
      colorTexto: PALETA_MAPA.texto,
      colorBordeTexto: PALETA_MAPA.textoBorde,
      fuenteTexto: fuenteDelEstilo(m),
    });
    const hay = Boolean(zonas && zonas.features.length > 0);
    const datos = hay ? conEtiquetas(zonas as ZoneGeoJsonFeatureCollection, etiquetas) : zonas;

    try {
      if (hay) {
        const fuente = m.getSource?.(FUENTE);
        if (fuente?.setData) fuente.setData(datos as never);
        else m.addSource?.(FUENTE, { type: 'geojson', data: datos as never });
        for (const capa of capas) {
          if (!m.getLayer?.((capa as { id: string }).id)) m.addLayer?.(capa as never);
        }
        const encuadre = encuadreAMaplibre(zonas);
        if (encuadre) m.fitBounds?.(encuadre, { padding: 24, maxZoom: 15, animate: false });
      } else {
        for (const capa of capas) {
          if (m.getLayer?.((capa as { id: string }).id)) m.removeLayer?.((capa as { id: string }).id);
        }
        if (m.getSource?.(FUENTE)) m.removeSource?.(FUENTE);
      }
    } catch {
      // El mapa puede estar yéndose mientras esto corre; no es un fallo que deba ver nadie.
    }
  }, [zonas, generacion, etiquetas]);

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

  let cuerpo: React.JSX.Element;
  if (!estilo) {
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
      className={['lx-zonemap', ampliado ? 'lx-zonemap--ampliado' : ''].filter(Boolean).join(' ')}
      aria-labelledby={`${id}-titulo`}
      style={ampliado ? undefined : { ['--lx-zonemap-alto' as string]: `${altoCompacto}px` }}
    >
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

      {noOficiales > 0 ? (
        <p className="lx-zonemap__noOficial" role="note">
          <strong>{textos.noOficial}</strong> {textos.noOficialDetalle}
        </p>
      ) : null}

      {cuerpo}

      {/* Una línea, DEBAJO del mapa: primero se ven las calles y después se lee por qué no hay
          límites dibujados. Al revés, el texto volvía a ser lo primero y lo único. */}
      {!hayQueDibujar && puedeDibujarse && !falloMapa ? (
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
      },
    })),
  };
}

/**
 * Costa Rica entera, para cuando no hay ninguna geometría que encuadre el mapa.
 *
 * <p>Es el único encuadre que no afirma nada: el país donde opera el producto. No se deduce del
 * nombre de la municipalidad —un nombre no es una coordenada— ni se pide la ubicación del
 * teléfono, que exige consentimiento y que esta pantalla no necesita.</p>
 *
 * <p>Son los límites continentales; la Isla del Coco queda fuera a propósito, porque incluirla
 * alejaría el encuadre unos 500 km al suroeste por una isla sin estacionamiento municipal.</p>
 */
const COSTA_RICA: [[number, number], [number, number]] = [[-85.95, 8.03], [-82.55, 11.22]];

/** El encuadre en la forma que espera MapLibre: `[[oeste, sur], [este, norte]]`. */
function encuadreAMaplibre(
  zonas: ZoneGeoJsonFeatureCollection | undefined,
): [[number, number], [number, number]] | undefined {
  const e = encuadreDe(zonas);
  return e ? [[e.minLon, e.minLat], [e.maxLon, e.maxLat]] : undefined;
}
