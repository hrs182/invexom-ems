import ExcelJS from 'exceljs';
import { dialog, BrowserWindow } from 'electron';
import path from 'node:path';
import os from 'node:os';

export interface ExportColumn { header: string; key: string; width?: number }

/** FR-GLB-04 / FR-BKP-04: Excel export with a save dialog. */
export async function exportExcel(
  suggestedName: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
): Promise<{ ok: true; filePath: string } | { ok: false; error: string }> {
  const win = BrowserWindow.getFocusedWindow();
  const r = await dialog.showSaveDialog(win ?? undefined as never, {
    title: 'Export Excel',
    defaultPath: path.join(os.homedir(), 'Documents', suggestedName),
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, error: 'cancelled' };
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Report');
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  for (const row of rows) ws.addRow(row);
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columns.length)}1` };
  await wb.xlsx.writeFile(r.filePath);
  return { ok: true, filePath: r.filePath };
}

/** FR-BKP-04: one-click "export everything" — one workbook, one sheet per module. */
export async function exportEverything(
  sheets: { name: string; columns: ExportColumn[]; rows: Record<string, unknown>[] }[],
): Promise<{ ok: true; filePath: string } | { ok: false; error: string }> {
  const win = BrowserWindow.getFocusedWindow();
  const r = await dialog.showSaveDialog(win ?? undefined as never, {
    title: 'Export everything',
    defaultPath: path.join(os.homedir(), 'Documents', `invexom-ems-full-export-${new Date().toISOString().slice(0, 10)}.xlsx`),
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, error: 'cancelled' };
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    for (const row of s.rows) ws.addRow(row);
  }
  await wb.xlsx.writeFile(r.filePath);
  return { ok: true, filePath: r.filePath };
}
