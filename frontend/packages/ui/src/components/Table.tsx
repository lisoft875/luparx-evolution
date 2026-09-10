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
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  loading,
  loadingLabel,
  emptyLabel,
  stickyFirstColumn,
}: TableProps<T>): React.JSX.Element {
  return (
    <div className="lx-table-wrapper">
      <table className={stickyFirstColumn ? 'lx-table lx-table-sticky-first' : 'lx-table'}>
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
