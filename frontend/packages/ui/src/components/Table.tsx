import * as React from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
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
  compact,
}: TableProps<T>): React.JSX.Element {
  return (
    <div className="lx-table-wrapper">
      <table
        className={['lx-table', stickyFirstColumn ? 'lx-table-sticky-first' : '', compact ? 'lx-table--compact' : '']
          .filter(Boolean)
          .join(' ')}
      >
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
