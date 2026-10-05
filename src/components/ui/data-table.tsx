import * as React from 'react';
import { cn } from '../../lib/cn';

/**
 * Dense data table: zebra striping + sticky headers (SRS 4.2),
 * horizontal scroll with sticky first column on narrow windows.
 */
export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  sticky?: boolean;
}

export function DataTable<T extends { id: string | number }>({
  columns, rows, empty, onRowClick, className,
}: {
  columns: Column<T>[]; rows: T[]; empty: React.ReactNode;
  onRowClick?: (row: T) => void; className?: string;
}) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <div className={cn('overflow-x-auto rounded-xl border border-border', className)}>
      <table className="data-grid w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'border-b border-border px-4 py-2.5 text-left text-[13px] font-semibold text-muted whitespace-nowrap',
                  c.sticky && 'sticky left-0 z-[2]',
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('border-b border-border last:border-0', onRowClick && 'cursor-pointer')}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-4 py-2.5 whitespace-nowrap',
                    c.sticky && 'sticky left-0 z-[1] bg-surface',
                    c.className,
                  )}
                >
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
