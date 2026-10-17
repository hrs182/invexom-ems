/**
 * Excel export utility: builds a real .xlsx workbook from flat row objects,
 * with one sheet per dataset and auto-sized columns.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWorkbook } from '../src/lib/exportExcel';

describe('buildWorkbook', () => {
  it('creates one sheet per dataset with object keys as headers', () => {
    const wb = buildWorkbook([
      {
        name: 'Students',
        rows: [
          { 'Adm No': 'INV/2026/0001', 'Name': 'Aarav Sharma', 'Class': 'I-A' },
          { 'Adm No': 'INV/2026/0002', 'Name': 'Diya Verma', 'Class': 'I-A' },
        ],
      },
      { name: 'Empty', rows: [] },
    ]);
    expect(wb.SheetNames).toEqual(['Students', 'Empty']);
    const back = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Students']);
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ 'Adm No': 'INV/2026/0001', 'Name': 'Aarav Sharma', 'Class': 'I-A' });
  });

  it('auto-sizes columns to content', () => {
    const wb = buildWorkbook([
      { name: 'S', rows: [{ 'A': 'x', 'Long Header Name': 'averyveryverylongvalue' }] },
    ]);
    const cols = wb.Sheets['S']['!cols'] as { wch: number }[];
    expect(cols).toHaveLength(2);
    expect(cols[1].wch).toBeGreaterThan(cols[0].wch);
  });

  it('truncates sheet names to 31 chars (Excel limit)', () => {
    const wb = buildWorkbook([{ name: 'A'.repeat(40), rows: [{ x: 1 }] }]);
    expect(wb.SheetNames[0]).toHaveLength(31);
  });
});
