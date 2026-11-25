/** Rebuild readable lines from pdf.js text items (grouped by baseline, sorted left→right). Pure. */
export interface PdfTextItem {
  str: string;
  transform: number[]; // [a,b,c,d,e,f] — e = x, f = y
  width?: number;
  hasEOL?: boolean;
}

export function itemsToText(items: PdfTextItem[]): string {
  const rows: { y: number; parts: { x: number; s: string; w: number }[] }[] = [];
  for (const it of items) {
    if (!it.str) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, s: it.str, w: it.width ?? it.str.length * 5 });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) => {
      r.parts.sort((a, b) => a.x - b.x);
      let out = '';
      let end = -Infinity;
      for (const p of r.parts) {
        const gap = p.x - end;
        if (out && gap > 25) out += '  |  ';
        else if (out && gap > 1.5 && !out.endsWith(' ') && !p.s.startsWith(' ')) out += ' ';
        out += p.s;
        end = p.x + p.w;
      }
      return out.trim();
    })
    .filter(Boolean)
    .join('\n');
}
