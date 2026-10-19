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
import { encuadreDe } from './zoneGeometry';
import { PALETA_MAPA, oscurecer, urlDelEstilo } from './estiloOscuro';
import { FUENTE, VERIFICADA, capasDeZonas } from './capas';

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

  // --- ciclo de vida del mapa ------------------------------------------------------------------
  useEffect(() => {
    if (!estilo || !contenedor.current || !hayQueDibujar) return undefined;
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
          // Sin posición inicial inventada: el encuadre lo da la geometría que llegó.
          bounds: encuadreAMaplibre(zonas),
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
        m.on('load', () => {
          if (!vivo) return;
          m.addSource(FUENTE, { type: 'geojson', data: zonas as never });
          for (const capa of capasDeZonas(PALETA_MAPA.zona, PALETA_MAPA.zonaNoOficial)) {
            m.addLayer(capa as never);
          }
        });
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
    // `zonas` entra por identidad: react-query devuelve el mismo objeto mientras no cambie el dato.
  }, [estilo, recolorear, zonas, hayQueDibujar]);

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
  } else if (!hayQueDibujar) {
    cuerpo = aviso(textos.vacio);
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
        {hayQueDibujar && estilo && !falloMapa ? (
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
    </section>
  );
}

/** El encuadre en la forma que espera MapLibre: `[[oeste, sur], [este, norte]]`. */
function encuadreAMaplibre(
  zonas: ZoneGeoJsonFeatureCollection | undefined,
): [[number, number], [number, number]] | undefined {
  const e = encuadreDe(zonas);
  return e ? [[e.minLon, e.minLat], [e.maxLon, e.maxLat]] : undefined;
}
