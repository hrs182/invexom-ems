import ExcelJS from 'exceljs';
import { dialog, BrowserWindow } from './electron-shim.js';
import path from 'node:path';
import os from 'node:os';

export interface ExportColumn { header: string; key: string; width?: number }

/**
 * Export sink. Desktop uses the native save dialog; the web demo server
 * switches to 'download' once at boot, and exports come back as
 * { fileName, mime, dataBase64 } for the browser to download.
 */
export type ExportSink = 'dialog' | 'download';
let exportSink: ExportSink = 'dialog';
export function setExportSink(s: ExportSink): void { exportSink = s; }

type ExportOutcome =
  | { ok: true; filePath: string }
  | { ok: true; fileName: string; mime: string; dataBase64: string }
  | { ok: false; error: string };

async function deliver(
  suggestedName: string,
  wb: ExcelJS.Workbook,
): Promise<ExportOutcome> {
  if (exportSink === 'download') {
    const buf = await wb.xlsx.writeBuffer();
    return {
      ok: true,
      fileName: suggestedName,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dataBase64: Buffer.from(buf as ArrayBuffer).toString('base64'),
    };
  }
  const win = BrowserWindow.getFocusedWindow();
  const r = await dialog.showSaveDialog(win ?? undefined as never, {
    title: 'Export Excel',
    defaultPath: path.join(os.homedir(), 'Documents', suggestedName),
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, error: 'cancelled' };
  await wb.xlsx.writeFile(r.filePath);
  return { ok: true, filePath: r.filePath };
}

function styleSheet(ws: ExcelJS.Worksheet, columns: ExportColumn[]): void {
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columns.length)}1` };
}

/** FR-GLB-04 / FR-BKP-04: Excel export with a save dialog (desktop) or download (web). */
export async function exportExcel(
  suggestedName: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
): Promise<ExportOutcome> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Report');
  styleSheet(ws, columns);
  for (const row of rows) ws.addRow(row);
  return deliver(suggestedName, wb);
}

/** FR-BKP-04: one-click "export everything" — one workbook, one sheet per module. */
export async function exportEverything(
  sheets: { name: string; columns: ExportColumn[]; rows: Record<string, unknown>[] }[],
): Promise<ExportOutcome> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    styleSheet(ws, s.columns);
    for (const row of s.rows) ws.addRow(row);
  }
  return deliver(`invexom-ems-full-export-${new Date().toISOString().slice(0, 10)}.xlsx`, wb);
}
