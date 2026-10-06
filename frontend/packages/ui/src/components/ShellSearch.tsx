import * as React from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface ShellSearchDestination {
  to: string;
  label: string;
  icon?: React.ReactNode;
  /** El grupo del menú al que pertenece, para decir «Zonas · Operación» y no sólo «Zonas». */
  group?: string;
}

export interface ShellSearchProps {
  placeholder: string;
  /** Nombre accesible del campo. */
  label: string;
  /** Los destinos que ESTA cuenta puede abrir. Filtrar por permiso es de quien llama. */
  destinations: ShellSearchDestination[];
  onNavigate: (to: string) => void;
  /**
   * La búsqueda de datos de verdad: la fila «Buscar "x" en Usuarios».
   *
   * <p>Opcional a propósito. Sin permiso para ver usuarios, la fila no aparece: la v1.1 pide
   * «ocultar acciones no autorizadas en vez de mostrarlas como accesos muertos».</p>
   */
  freeText?: { label: string; onSubmit: (query: string) => void };
  /** Qué decir cuando no hay ninguna coincidencia. */
  emptyLabel: string;
  /** El encabezado de la lista de destinos. */
  destinationsLabel: string;
}

/** Sin acentos y en minúscula: quien escribe «fiscalizacion» con prisa busca «Fiscalización». */
function plano(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

const MAXIMO = 6;

/**
 * El buscador de la cabecera de una consola.
 *
 * <h2>Qué busca, y por qué no busca más</h2>
 *
 * <p>Dos cosas: los DESTINOS de esta consola —veintidós en el admin, que es más de lo que nadie
 * recuerda— y, como última fila, la búsqueda libre que la pantalla de Usuarios ya sabe hacer contra
 * el servidor.</p>
 *
 * <p>No busca placas, boletas ni zonas, y no es un olvido: no existe un endpoint de búsqueda global,
 * y la v1.1 §7 prohíbe en letra «modificar contratos de API ni modelos de datos sólo para conseguir
 * el look». Un campo que acepta una placa y no encuentra nada es peor que un campo que dice
 * honestamente qué sabe buscar. El día que haya `GET /admin/search`, esto gana una sección más y
 * nada de lo de acá cambia.</p>
 *
 * <h2>Teclado</h2>
 *
 * <p>Flechas para moverse, Enter para abrir lo resaltado, Escape para cerrar. `aria-activedescendant`
 * en vez de mover el foco de verdad: el foco se queda en el campo —si no, cada flecha borraría la
 * posición del cursor— y el lector de pantalla anuncia la fila resaltada igual.</p>
 */
export function ShellSearch({
  placeholder,
  label,
  destinations,
  onNavigate,
  freeText,
  emptyLabel,
  destinationsLabel,
}: ShellSearchProps): React.JSX.Element {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const base = useId();

  const consulta = texto.trim();

  const coincidencias = useMemo(() => {
    if (consulta === '') return [];
    const aguja = plano(consulta);
    return destinations.filter((destino) => plano(destino.label).includes(aguja)).slice(0, MAXIMO);
  }, [consulta, destinations]);

  /** Las filas, en el orden en que las flechas las recorren: destinos y después la búsqueda libre. */
  const filas = useMemo(
    () => [
      ...coincidencias.map((destino) => ({ tipo: 'destino' as const, destino })),
      ...(freeText && consulta !== '' ? [{ tipo: 'libre' as const, destino: undefined }] : []),
    ],
    [coincidencias, freeText, consulta],
  );

  // El resaltado vuelve a la primera fila cada vez que cambia la lista: dejarlo en la cuarta de una
  // lista que ahora tiene dos significa que Enter abre algo que no está en pantalla.
  useEffect(() => {
    setResaltado(0);
  }, [consulta]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (evento: PointerEvent) => {
      if (!caja.current?.contains(evento.target as Node)) setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);

  const elegir = (indice: number) => {
    const fila = filas[indice];
    if (!fila) return;
    setAbierto(false);
    setTexto('');
    if (fila.tipo === 'destino' && fila.destino) {
      onNavigate(fila.destino.to);
    } else if (freeText) {
      freeText.onSubmit(consulta);
    }
  };

  const hayPanel = abierto && consulta !== '';

  return (
    <div className="lx-shell-search" ref={caja}>
      <span className="lx-shell-search__icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-4.2-4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="search"
        className="lx-shell-search__input"
        placeholder={placeholder}
        aria-label={label}
        value={texto}
        role="combobox"
        aria-expanded={hayPanel}
        aria-controls={`${base}-panel`}
        aria-activedescendant={hayPanel && filas[resaltado] ? `${base}-fila-${resaltado}` : undefined}
        autoComplete="off"
        onChange={(evento) => {
          setTexto(evento.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={(evento) => {
          if (evento.key === 'Escape') {
            setAbierto(false);
            return;
          }
          if (filas.length === 0) return;
          if (evento.key === 'ArrowDown') {
            evento.preventDefault();
            setResaltado((previo) => (previo + 1) % filas.length);
          } else if (evento.key === 'ArrowUp') {
            evento.preventDefault();
            setResaltado((previo) => (previo - 1 + filas.length) % filas.length);
          } else if (evento.key === 'Enter') {
            evento.preventDefault();
            elegir(resaltado);
          }
        }}
      />
      {hayPanel ? (
        <div className="lx-shell-search__panel" id={`${base}-panel`} role="listbox" aria-label={label}>
          {coincidencias.length > 0 ? (
            <p className="lx-shell-search__heading">{destinationsLabel}</p>
          ) : null}
          {filas.map((fila, indice) => (
            <button
              key={fila.tipo === 'destino' && fila.destino ? fila.destino.to : 'libre'}
              id={`${base}-fila-${indice}`}
              type="button"
              role="option"
              aria-selected={indice === resaltado}
              className={`lx-shell-search__row${indice === resaltado ? ' lx-shell-search__row--on' : ''}`}
              // `onMouseDown` y no `onClick`: el `pointerdown` que cierra el panel al pulsar fuera
              // corre antes que un `click`, y con `onClick` la fila desaparecía sin dispararse.
              onMouseDown={(evento) => {
                evento.preventDefault();
                elegir(indice);
              }}
              onMouseEnter={() => setResaltado(indice)}
            >
              {fila.tipo === 'destino' && fila.destino ? (
                <>
                  {fila.destino.icon ? (
                    <span className="lx-shell-search__row-icon" aria-hidden="true">
                      {fila.destino.icon}
                    </span>
                  ) : null}
                  <span className="lx-shell-search__row-label">{fila.destino.label}</span>
                  {fila.destino.group ? (
                    <span className="lx-shell-search__row-meta">{fila.destino.group}</span>
                  ) : null}
                </>
              ) : (
                <>
                  <span className="lx-shell-search__row-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false">
                      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                      <path d="M20 20l-4.2-4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="lx-shell-search__row-label">{freeText?.label}</span>
                  <span className="lx-shell-search__row-meta">«{consulta}»</span>
                </>
              )}
            </button>
          ))}
          {filas.length === 0 ? <p className="lx-shell-search__empty">{emptyLabel}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
