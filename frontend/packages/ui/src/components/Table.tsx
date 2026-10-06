import * as React from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /**
   * Ancho declarado de la columna, como valor CSS (`'160px'`, `'12%'`, `'auto'`).
   *
   * <p>Sin esto, el navegador reparte el ancho según lo que cada celda mida, así que la columna
   * que manda es la que trae el dato más largo — un UUID, típicamente — y la que contiene lo que
   * alguien de verdad quiere leer queda estrujada. Declarar los anchos de las columnas
   * previsibles y dejar una en `auto` hace que el espacio sobrante caiga donde debe.</p>
   *
   * <p>Se emite como `<colgroup>`, que es la forma en que una tabla HTML acepta anchos sin que
   * cada celda tenga que repetirlos.</p>
   */
  width?: string;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  loadingLabel: string;
  emptyLabel: string;
  /**
   * Pins the first column while the rest scrolls sideways. For a grid wide enough to need it — a
   * row of prices per zone, say — a row whose name has scrolled off is a row of numbers belonging
   * to nobody.
   */
  stickyFirstColumn?: boolean;
  /**
   * Fija la ÚLTIMA columna mientras el resto se desplaza. Para la columna de acciones.
   *
   * <p>Es la red de seguridad, no la solución: el objetivo en escritorio es que la tabla quepa. Pero
   * cuando no cabe —un portátil estrecho, un zoom al 125%, una traducción más larga— lo que se va
   * fuera de la pantalla es la última columna, y si ahí viven Desactivar y Revocar, el
   * administrador queda mirando una fila que no puede operar. Con la primera y la última fijas,
   * SIEMPRE se ve a quién y SIEMPRE se alcanza el menú; lo que se desplaza es el detalle.</p>
   *
   * <p>Cuando no hay desbordamiento esto no cuesta nada: una celda `sticky` sin nada que desplazar
   * se dibuja en su sitio.</p>
   */
  stickyLastColumn?: boolean;
  /**
   * Hace que los anchos declarados MANDEN, en vez de ser sugerencias.
   *
   * <p>Con el reparto por omisión (`table-layout: auto`), un `width` en el `<colgroup>` es un deseo:
   * el navegador mide el contenido mínimo de cada celda y, si no cabe, ensancha la columna. Con las
   * celdas en `nowrap`, «Administrador municipal» y «San Rafael - Multiplaza» son mínimos
   * indivisibles, así que la tabla crece hasta donde el texto más largo diga — medido en
   * Funcionarios: 1150px declarando 964.</p>
   *
   * <p>Con `fixed`, la primera fila decide el reparto y el contenido se adapta: lo que no cabe se
   * recorta con puntos suspensivos y las cabeceras quiebran en dos líneas. Es lo que convierte una
   * tabla de anchos recomendados en una tabla de anchos reales.</p>
   *
   * <p>Es una opción y no el valor por omisión porque una tabla de tres columnas con contenido corto
   * se reparte mejor sola, y porque `fixed` sin anchos declarados reparte en partes iguales, que
   * casi nunca es lo que se quiere.</p>
   */
  fixedLayout?: boolean;
  /**
   * El ancho por debajo del cual la tabla deja de encogerse y empieza a desplazarse.
   *
   * <p>Con `fixedLayout`, la columna SIN ancho declarado se queda con lo que sobre — y cuando no
   * sobra nada, se queda con cero. Medido en Funcionarios a 390px: la columna de la persona
   * desaparecía por completo. Una columna que cede hasta cero no cede, se va.</p>
   *
   * <p>Con un mínimo, por debajo de ese ancho la tabla se desplaza como un bloque en vez de estrujar
   * a sus columnas, y con la primera y la última fijas lo que viaja es el detalle. Se calcula
   * sumando los mínimos de las columnas declaradas más un suelo razonable para la flexible.</p>
   */
  minWidth?: string;
  /**
   * Aprieta el relleno horizontal de las celdas (25-09-2026).
   *
   * <p>Para la tabla que tiene muchas columnas y las necesita todas a la vista a la vez. Con seis
   * columnas, los 16 px de cada lado son 192 px de aire: en un portátil de 1280 la bitácora de
   * auditoría se pasaba 58 px y había que arrastrarla para leer una sola fila.</p>
   *
   * <p>Es una opción y no el valor por omisión porque en una tabla de tres columnas ese aire es lo
   * que la hace legible. Lo compacto se pide donde se necesita.</p>
   */
  compact?: boolean;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  loading,
  loadingLabel,
  emptyLabel,
  stickyFirstColumn,
  stickyLastColumn,
  fixedLayout,
  minWidth,
  compact,
}: TableProps<T>): React.JSX.Element {
  return (
    <div className="lx-table-wrapper">
      <table
        className={[
          'lx-table',
          stickyFirstColumn ? 'lx-table-sticky-first' : '',
          stickyLastColumn ? 'lx-table-sticky-last' : '',
          fixedLayout ? 'lx-table--fixed' : '',
          compact ? 'lx-table--compact' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={minWidth ? { minWidth } : undefined}
      >
        {columns.some((column) => column.width) ? (
          <colgroup>
            {columns.map((column) => (
              <col key={column.key} style={column.width ? { width: column.width } : undefined} />
            ))}
          </colgroup>
        ) : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="lx-table__status">
                {loadingLabel}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="lx-table__status">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
