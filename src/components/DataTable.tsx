import React, { useMemo } from 'react';

interface Column<T> {
  key: keyof T;
  header: string;
  render?: (value: any, row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export function DataTable<T extends { id: string | number }>({
  data,
  columns,
  onRowClick,
  emptyMessage = 'No data available'
}: DataTableProps<T>) {
  const rows = useMemo(() => {
    return data.map(row => ({
      id: row.id,
      cells: columns.map(col => ({
        key: String(col.key),
        value: col.render ? col.render(row[col.key], row) : row[col.key]
      }))
    }));
  }, [data, columns]);

  if (data.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map(col => (
            <th key={String(col.key)}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr
            key={row.id}
            onClick={() => onRowClick?.(data.find(d => d.id === row.id)!)}
            className={onRowClick ? 'clickable' : undefined}
          >
            {row.cells.map(cell => (
              <td key={cell.key}>{cell.value}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
