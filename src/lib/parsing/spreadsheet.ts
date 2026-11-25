/**
 * Spreadsheet reading for messy, real-world venue lists: multiple sheets, header rows not on row 1,
 * merged cells, blank rows and notes columns. SheetJS is injected so this stays testable in Node
 * and lazy-loaded in the browser.
 */
import type * as XLSXNS from '@e965/xlsx';
import { FIELD_DEFS } from '../../domain/fields';
import { EXTRA_TARGETS, normalizeHeader } from './columnMap';

type XLSX = typeof XLSXNS;

export interface SheetData {
  name: string;
  headerRow: number; // 0-based index in the cleaned grid
  headers: string[];
  rows: string[][]; // data rows (blank rows removed)
  /** Original sheet row numbers (1-based) for each data row, for provenance ("Sheet1 row 12"). */
  rowNumbers: number[];
  score: number; // how venue-list-like the sheet looks
}

const KNOWN = new Set(
  [...FIELD_DEFS.flatMap((f) => f.synonyms), ...EXTRA_TARGETS.flatMap((t) => t.synonyms)].map(
    normalizeHeader,
  ),
);

function cellText(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, ' ').trim();
}

function headerScore(row: string[]): number {
  const filled = [...new Set(row.filter(Boolean))];
  if (filled.length < 2) return 0;
  let known = 0;
  let texty = 0;
  for (const c of filled) {
    const n = normalizeHeader(c);
    if (
      KNOWN.has(n) ||
      (c.length < 30 &&
        [...KNOWN].some((k) => k.length > 3 && new RegExp(`(^| )${k.replace(/[$/%]/g, '')}( |$)`).test(n)))
    )
      known++;
    if (/[a-z]/i.test(c) && !/^\$|^\d/.test(c) && c.length < 40) texty++;
  }
  return known * 2 + texty * 0.5 - (filled.length - texty) * 0.5;
}

/** Read a grid with merged cells filled from their top-left value. */
export function sheetToGrid(XLSX: XLSX, ws: XLSXNS.WorkSheet): { grid: string[][]; rowNums: number[] } {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false, blankrows: true });
  const grid = aoa.map((r) => (r as unknown[]).map(cellText));
  for (const m of ws['!merges'] ?? []) {
    const v = grid[m.s.r]?.[m.s.c] ?? '';
    for (let r = m.s.r; r <= m.e.r; r++) {
      grid[r] ??= [];
      for (let c = m.s.c; c <= m.e.c; c++) if (!grid[r][c]) grid[r][c] = v;
    }
  }
  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0 } };
  const rowNums = grid.map((_, i) => i + 1 + range.s.r);
  return { grid, rowNums };
}

export function analyzeGrid(name: string, grid: string[][], rowNums: number[]): SheetData {
  // Header detection within first 25 rows
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(grid.length, 25); i++) {
    const s = headerScore(grid[i] ?? []);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  if (best < 0) best = grid.findIndex((r) => r.filter(Boolean).length >= 2);
  if (best < 0) return { name, headerRow: 0, headers: [], rows: [], rowNumbers: [], score: 0 };

  const width = Math.max(...grid.slice(best).map((r) => r.length), 0);
  const headers = Array.from({ length: width }, (_, c) => grid[best][c] || `Column ${c + 1}`);
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  for (let i = best + 1; i < grid.length; i++) {
    const r = Array.from({ length: width }, (_, c) => grid[i]?.[c] ?? '');
    const filled = r.filter(Boolean);
    if (!filled.length) continue; // blank row
    // Section titles / sub-headers spanning a merged row ("BROOKLYN") — every cell equal
    if (filled.length > 1 && filled.every((x) => x === filled[0])) continue;
    // Repeated header rows
    if (r.every((x, c) => !x || x === headers[c])) continue;
    rows.push(r);
    rowNumbers.push(rowNums[i]);
  }
  // Drop columns that are completely empty in data (except named)
  return {
    name,
    headerRow: best,
    headers,
    rows,
    rowNumbers,
    score: bestScore + Math.min(rows.length, 50) * 0.1,
  };
}

/** Parse a workbook (xlsx/xls/csv bytes) into analyzed sheets, best first. */
export function readWorkbook(
  XLSX: XLSX,
  data: ArrayBuffer | Uint8Array | string,
  opts: { csv?: boolean } = {},
): SheetData[] {
  const wb =
    typeof data === 'string' || opts.csv
      ? XLSX.read(typeof data === 'string' ? data : new TextDecoder().decode(data), {
          type: 'string',
          cellDates: true,
        })
      : XLSX.read(data, { type: 'array', cellDates: true });
  const sheets = wb.SheetNames.map((n) => {
    const { grid, rowNums } = sheetToGrid(XLSX, wb.Sheets[n]);
    return analyzeGrid(n, grid, rowNums);
  }).filter((s) => s.rows.length > 0);
  return sheets.sort((a, b) => b.score - a.score);
}
