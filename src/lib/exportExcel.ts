import * as XLSX from 'xlsx';

export interface ExcelSheet {
  name: string;
  rows: Record<string, unknown>[];
}

/**
 * Download data as a real .xlsx workbook (fully offline, no server needed).
 * Each sheet is built from an array of flat objects — keys become headers.
 */
/** Build the workbook (pure — easy to test); downloadExcel writes it to disk. */
export function buildWorkbook(sheets: ExcelSheet[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{}]);
    // Auto-size columns to content (capped).
    const keys = s.rows.length ? Object.keys(s.rows[0]) : [];
    ws['!cols'] = keys.map((k) => {
      const max = Math.max(
        k.length,
        ...s.rows.map((r) => String(r[k] ?? '').length),
      );
      return { wch: Math.min(40, Math.max(10, max + 2)) };
    });
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  return wb;
}

export function downloadExcel(filename: string, sheets: ExcelSheet[]): XLSX.WorkBook {
  const wb = buildWorkbook(sheets);
  const safe = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, safe);
  return wb;
}
