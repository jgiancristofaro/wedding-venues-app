/** Exports: XLSX/CSV, PDF reports, JSON/ZIP backup & restore. Heavy libs are lazy-loaded. */
import type { DocumentRecord, UserVenue, VenueNote, VenueView, WeddingProfile } from '../../domain/types';
import { CATEGORY_LABEL, CONFIDENCE_LABEL, type Estimate } from '../pricing';
import { downloadBlob, money } from '../format';

export interface ExportRow {
  v: VenueView;
  e: Estimate;
  notes: VenueNote[];
}

function textOf(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

export function rowsToRecords(rows: ExportRow[]) {
  return rows.map(({ v, e, notes }) => {
    const f = v.fields;
    const comp = (k: string) =>
      v.pricing.components
        .filter((c) => c.kind === k)
        .map((c) => c.rates.map((r) => r.amount).join('/'))
        .join('; ');
    return {
      Name: f.name,
      Source: v.kind === 'global' ? 'Global library' : v.mine?.globalId ? 'Saved from library' : 'Your venue',
      'Sample data': v.isSample ? 'yes' : '',
      Area: f.area ?? '',
      Region: f.region ?? '',
      Address: f.address ?? '',
      Website: f.website ?? '',
      'Contact email': f.contactEmail ?? '',
      'Contact phone': f.contactPhone ?? '',
      Type: f.venueType ?? '',
      Style: (f.styleTags ?? []).join(', '),
      Setting: f.setting ?? '',
      'Seated capacity': f.capacitySeated ?? '',
      'Standing capacity': f.capacityStanding ?? '',
      'Ceremony on-site': f.ceremonyOnSite == null ? '' : f.ceremonyOnSite ? 'yes' : 'no',
      Catering: f.cateringPolicy ?? '',
      Accommodations: f.accommodations == null ? '' : f.accommodations ? 'yes' : 'no',
      'Site fee(s)': comp('site_fee'),
      'F&B minimum(s)': comp('fnb_minimum'),
      'Per-person price(s)': comp('per_person'),
      'Tier price(s)': comp('capacity_tier'),
      'Buyout(s)': comp('buyout'),
      'Service charge %': v.pricing.charges?.serviceChargePct ?? '',
      'Tax %': v.pricing.charges?.taxPct ?? '',
      'Pricing as of': v.pricingAsOf ?? '',
      'Estimated total': e.total ?? '',
      'Per guest': e.perGuest ?? '',
      'Range low': e.low ?? '',
      'Range high': e.high ?? '',
      Confidence: CONFIDENCE_LABEL[e.confidence],
      ...Object.fromEntries(
        Object.entries(e.byCategory).map(([k, val]) => [
          CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL],
          val || '',
        ]),
      ),
      Assumptions: [...e.assumptions, ...e.missing].join(' | '),
      Status: v.mine?.status ?? '',
      'Shortlist rank': v.mine?.shortlistRank ?? '',
      Rating: v.mine?.rating ?? '',
      Tags: (v.mine?.tags ?? []).join(', '),
      Notes: notes
        .map((n) => `${n.kind === 'pro' ? '+ ' : n.kind === 'con' ? '- ' : ''}${textOf(n.html)}`)
        .join('\n'),
    };
  });
}

export async function exportSheet(rows: ExportRow[], format: 'xlsx' | 'csv', filename = 'vellum-venues') {
  const XLSX = await import('@e965/xlsx');
  const ws = XLSX.utils.json_to_sheet(rowsToRecords(rows));
  if (format === 'csv') {
    downloadBlob(new Blob([XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv' }), `${filename}.csv`);
    return;
  }
  ws['!cols'] = [{ wch: 28 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Venues');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${filename}.xlsx`,
  );
}

async function pdfLibs() {
  const [{ jsPDF }, autoTable] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return { jsPDF, autoTable: autoTable.default };
}

const INK: [number, number, number] = [31, 27, 22];
const ACCENT: [number, number, number] = [52, 72, 60];

export async function compareReportPdf(rows: ExportRow[], profile: WeddingProfile) {
  const { jsPDF, autoTable } = await pdfLibs();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  doc.setFont('times', 'normal');
  doc.setFontSize(24);
  doc.setTextColor(...INK);
  doc.text('Venue comparison', 40, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Priced for ${profile.guestCount} guests · generated ${new Date().toLocaleDateString()} · estimates, not quotes`,
    40,
    68,
  );
  const recs = rowsToRecords(rows);
  const keys = [
    'Estimated total',
    'Per guest',
    'Confidence',
    'Venue & rental',
    'Food & beverage',
    'Add-ons',
    'Service & fees',
    'Tax',
    'Seated capacity',
    'Setting',
    'Catering',
    'Ceremony on-site',
    'Accommodations',
    'Area',
    'Pricing as of',
    'Status',
    'Rating',
  ];
  const fmt = (k: string, v: unknown) =>
    typeof v === 'number' &&
    /total|guest|rental|beverage|add-ons|fees|tax/i.test(k) &&
    k !== 'Seated capacity'
      ? money(v)
      : String(v ?? '');
  autoTable(doc, {
    startY: 84,
    head: [['', ...recs.map((r) => r.Name)]],
    body: keys.map((k) => [k, ...recs.map((r) => fmt(k, (r as Record<string, unknown>)[k]))]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: ACCENT, textColor: 255 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 120 } },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  doc.setFontSize(9);
  for (const r of rows) {
    if (y > 540) {
      doc.addPage();
      y = 50;
    }
    doc.setFont('helvetica', 'bold');
    doc.text(r.v.fields.name, 40, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize([...r.e.assumptions, ...r.e.missing].join(' • '), 700);
    doc.text(lines, 40, y + 12);
    y += 18 + lines.length * 11;
  }
  doc.save('vellum-comparison.pdf');
}

export async function onePagerPdf(row: ExportRow, _profile: WeddingProfile, photoDataUrl?: string) {
  const { jsPDF, autoTable } = await pdfLibs();
  const { v, e, notes } = row;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  let y = 50;
  if (photoDataUrl && /^data:image\/(png|jpe?g)/.test(photoDataUrl)) {
    try {
      doc.addImage(photoDataUrl, 'JPEG', 40, 36, 532, 200);
      y = 262;
    } catch {
      /* skip photo */
    }
  }
  doc.setFont('times', 'normal');
  doc.setFontSize(26);
  doc.setTextColor(...INK);
  doc.text(v.fields.name, 40, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    [v.fields.area, v.fields.region].filter(Boolean).join(', ') +
      (v.isSample ? ' · SAMPLE DATA (fictional)' : ''),
    40,
    y + 16,
  );
  doc.setFontSize(18);
  doc.text(`${money(e.total)}  ·  ${money(e.perGuest)}/guest`, 40, y + 46);
  doc.setFontSize(9);
  doc.text(
    `Estimated all-in for ${e.scenario.guests} guests · ${CONFIDENCE_LABEL[e.confidence]} confidence`,
    40,
    y + 60,
  );
  autoTable(doc, {
    startY: y + 72,
    head: [['Component', 'Detail', 'Amount']],
    body: e.lines.map((l) => [l.label, l.detail ?? '', money(l.amount)]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: ACCENT },
    columnStyles: { 2: { halign: 'right' } },
  });
  let ny = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  const facts = [
    ['Capacity', `${v.fields.capacitySeated ?? '?'} seated / ${v.fields.capacityStanding ?? '?'} standing`],
    ['Setting', v.fields.setting ?? ''],
    ['Catering', v.fields.cateringPolicy ?? ''],
    ['Ceremony on-site', v.fields.ceremonyOnSite ? 'Yes' : v.fields.ceremonyOnSite === false ? 'No' : ''],
    ['Curfew', v.fields.noiseCurfew ?? ''],
    [
      'Contact',
      [v.fields.contactName, v.fields.contactEmail, v.fields.contactPhone].filter(Boolean).join(' · '),
    ],
  ].filter((r) => r[1]);
  autoTable(doc, {
    startY: ny,
    body: facts,
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 110 } },
    theme: 'plain',
  });
  ny = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  const text = [
    ...e.assumptions.map((a) => `Assumption: ${a}`),
    ...e.missing.map((a) => `Missing: ${a}`),
    ...notes.map((n) => `${n.kind === 'pro' ? 'Pro' : n.kind === 'con' ? 'Con' : 'Note'}: ${textOf(n.html)}`),
  ];
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize(text.join('\n'), 532), 40, ny);
  doc.save(`${v.fields.name.replace(/[^\w]+/g, '-').toLowerCase()}.pdf`);
}

export interface Backup {
  app: 'vellum';
  version: 1;
  exportedAt: string;
  profile: WeddingProfile;
  venues: UserVenue[];
  notes: VenueNote[];
  documents: Omit<DocumentRecord, 'extractedText'>[];
}

export function makeBackup(
  profile: WeddingProfile,
  venues: UserVenue[],
  notes: VenueNote[],
  documents: DocumentRecord[],
): Backup {
  return {
    app: 'vellum',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile,
    venues,
    notes,
    documents: documents.map(({ extractedText: _x, ...d }) => d),
  };
}

export function parseBackup(text: string): Backup {
  const b = JSON.parse(text) as Backup;
  if (b.app !== 'vellum' || !Array.isArray(b.venues)) throw new Error('This file is not a Vellum backup.');
  return b;
}

export async function backupZip(
  b: Backup,
  getBlob: (d: DocumentRecord) => Promise<Blob>,
  docs: DocumentRecord[],
) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('vellum-backup.json', JSON.stringify(b, null, 2));
  for (const d of docs) {
    try {
      zip.file(`documents/${d.id}-${d.filename}`, await getBlob(d));
    } catch {
      /* skip missing */
    }
  }
  downloadBlob(
    await zip.generateAsync({ type: 'blob' }),
    `vellum-backup-${new Date().toISOString().slice(0, 10)}.zip`,
  );
}
