import * as React from 'react';
import { useId, useRef, useState } from 'react';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Segunda línea: la zona de la bahía, el estado, lo que distinga una opción de otra. */
  detail?: string;
}

export interface ComboboxProps {
  /** Nombre accesible. Normalmente el mismo texto que la etiqueta del `FormField` que lo envuelve. */
  label: string;
  /** El id que `FormField` entrega, para que su `<label>` apunte a este campo. */
  inputId?: string;
  /** Lo que `FormField` entrega como `describedBy`: su pista y su error. */
  describedBy?: string;
  placeholder?: string;
  /** El texto escrito. Lo controla quien llama, que es quien pide al servidor. */
  value: string;
  onChange: (texto: string) => void;
  onSelect: (value: string) => void;
  options: readonly ComboboxOption[];
  /** Desde cuántos caracteres tiene sentido buscar. Por omisión 2. */
  minChars?: number;
  loading?: boolean;
  /** Qué decir cuando no hay ninguna coincidencia. Nombrar lo buscado es de quien llama. */
  emptyLabel: string;
  /** «y 37 más» cuando el servidor tiene más de las que caben. */
  moreLabel?: string;
  disabled?: boolean;
}

/**
 * Un campo que busca mientras se escribe y ofrece lo encontrado.
 *
 * <h2>Por qué la lista va DEBAJO y no flotando</h2>
 *
 * <p>`Select` resuelve una lista flotante con un portal, midiendo el espacio libre arriba y abajo,
 * porque un desplegable tiene que poder abrirse sobre cualquier cosa. Acá no hace falta: esta
 * lista vive dentro de una tarjeta y empuja lo que tenga debajo. Eso quita de un plumazo el
 * recorte por `overflow`, el reposicionamiento al desplazar y el portal entero. Si algún día se
 * necesita flotando, el sitio donde copiar la solución ya existe y es `Select`.</p>
 *
 * <h2>Lo que hace por el teclado</h2>
 *
 * <p>Flechas para recorrer, `Enter` para elegir, `Escape` para cerrar sin elegir. El campo declara
 * `role="combobox"` con `aria-expanded` y `aria-activedescendant`, que es lo que un lector de
 * pantalla necesita para anunciar «uno de cuatro» en vez de callarse.</p>
 *
 * <p>El retardo y la petición NO viven acá: este componente no sabe de red. Quien llama decide
 * cuánto esperar antes de preguntar y qué preguntar, que es lo que le deja probar la pantalla sin
 * un servidor.</p>
 */
export function Combobox({
  label,
  inputId,
  describedBy,
  placeholder,
  value,
  onChange,
  onSelect,
  options,
  minChars = 2,
  loading = false,
  emptyLabel,
  moreLabel,
  disabled = false,
}: ComboboxProps): React.JSX.Element {
  const id = useId();
  const [activo, setActivo] = useState(-1);
  const [cerrado, setCerrado] = useState(false);
  const campoRef = useRef<HTMLInputElement>(null);

  const suficiente = value.trim().length >= minChars;
  const abierto = suficiente && !cerrado;
  const hayOpciones = options.length > 0;

  function elegir(indice: number): void {
    const opcion = options[indice];
    if (!opcion) return;
    setCerrado(true);
    setActivo(-1);
    onSelect(opcion.value);
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Escape') {
      setCerrado(true);
      setActivo(-1);
      return;
    }
    if (!abierto || !hayOpciones) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      // Sin nada resaltado y con una sola coincidencia, `Enter` la toma: escribir el código
      // completo y pulsar enter es lo que hace cualquiera, y pedirle además una flecha sería
      // cobrarle un paso por haber acertado.
      if (activo >= 0) { e.preventDefault(); elegir(activo); }
      else if (options.length === 1) { e.preventDefault(); elegir(0); }
    }
  }

  return (
    <div className="lx-combobox">
      <input
        id={inputId ?? `${id}-campo`}
        ref={campoRef}
        className="lx-input"
        type="search"
        inputMode="search"
        autoComplete="off"
        role="combobox"
        aria-label={inputId ? undefined : label}
        aria-describedby={describedBy}
        aria-expanded={abierto}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        aria-activedescendant={abierto && activo >= 0 ? `${id}-op-${activo}` : undefined}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => { onChange(e.target.value); setCerrado(false); setActivo(-1); }}
        onKeyDown={alTeclear}
      />

      {abierto ? (
        <ul className="lx-listbox lx-combobox__lista" id={`${id}-lista`} role="listbox" aria-label={label}>
          {loading ? (
            <li className="lx-listbox__empty" role="presentation">…</li>
          ) : !hayOpciones ? (
            <li className="lx-listbox__empty" role="presentation">{emptyLabel}</li>
          ) : (
            <>
              {options.map((opcion, indice) => (
                <li
                  key={opcion.value}
                  id={`${id}-op-${indice}`}
                  role="option"
                  aria-selected={indice === activo}
                  className={['lx-listbox__option', indice === activo ? 'lx-listbox__option--active' : '']
                    .filter(Boolean)
                    .join(' ')}
                  onMouseEnter={() => setActivo(indice)}
                  onMouseDown={(e) => { e.preventDefault(); elegir(indice); }}
                >
                  <span className="lx-listbox__text">
                    <span className="lx-listbox__label">{opcion.label}</span>
                    {opcion.detail ? <span className="lx-listbox__detail">{opcion.detail}</span> : null}
                  </span>
                </li>
              ))}
              {moreLabel ? (
                <li className="lx-listbox__empty" role="presentation">{moreLabel}</li>
              ) : null}
            </>
          )}
        </ul>
      ) : null}
    </div>
  );
}
