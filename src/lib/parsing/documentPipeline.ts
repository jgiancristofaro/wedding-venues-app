/**
 * Document import pipeline (browser): text extraction (pdf.js) → OCR fallback for scanned pages
 * (tesseract.js, lazy) → embedded photo extraction → heuristic field/pricing suggestions.
 */
import { sha256Hex } from '../format';
import { openPdf, pageImages, pageText, renderPage } from './pdf';
import { parseVenueText, type Extraction } from './textHeuristics';

export interface DocPage {
  n: number;
  text: string;
  source: 'text' | 'ocr' | 'paste';
}

export interface DocResult {
  kind: 'pdf' | 'image' | 'docx' | 'text';
  filename: string;
  mimeType: string;
  hash: string;
  pages: DocPage[];
  photos: string[];
  extraction: Extraction;
  warnings: string[];
}

export const MAX_PAGES = 40;
type Progress = (label: string, fraction: number) => void;

type OcrWorker = {
  recognize(img: HTMLCanvasElement | Blob | string): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
};
let ocrWorker: Promise<OcrWorker> | null = null;
async function ocr(img: HTMLCanvasElement | Blob): Promise<string> {
  ocrWorker ??= import('tesseract.js').then((t) => t.createWorker('eng') as Promise<OcrWorker>);
  const w = await ocrWorker;
  const r = await w.recognize(img);
  return r.data.text;
}

export async function processDocument(
  file: File | Blob,
  filename: string,
  progress: Progress = () => undefined,
): Promise<DocResult> {
  const buf = await file.arrayBuffer();
  const hash = await sha256Hex(buf);
  const name = filename.toLowerCase();
  const mime =
    file.type ||
    (name.endsWith('.pdf')
      ? 'application/pdf'
      : name.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : '');
  const warnings: string[] = [];
  const pages: DocPage[] = [];
  const photos: string[] = [];
  let kind: DocResult['kind'];

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    kind = 'pdf';
    progress('Opening PDF', 0.02);
    let doc;
    try {
      doc = await openPdf(buf);
    } catch {
      throw new Error('This PDF could not be opened. It may be damaged or password-protected.');
    }
    const total = Math.min(doc.numPages, MAX_PAGES);
    if (doc.numPages > MAX_PAGES)
      warnings.push(`Only the first ${MAX_PAGES} of ${doc.numPages} pages were read.`);
    for (let n = 1; n <= total; n++) {
      progress(`Reading page ${n} of ${total}`, 0.05 + (0.75 * (n - 1)) / total);
      let text = await pageText(doc, n);
      let source: DocPage['source'] = 'text';
      if (text.replace(/\s/g, '').length < 40) {
        progress(
          `Scanned page ${n} — running OCR (first time can take a few seconds)`,
          0.05 + (0.75 * (n - 0.5)) / total,
        );
        try {
          text = await ocr(await renderPage(doc, n, 2));
          source = 'ocr';
        } catch {
          warnings.push(`OCR failed on page ${n}; its text was skipped.`);
        }
      }
      pages.push({ n, text, source });
      if (photos.length < 8) {
        try {
          photos.push(...(await pageImages(doc, n)));
        } catch {
          /* image extraction is best-effort */
        }
      }
    }
  } else if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic)$/.test(name)) {
    kind = 'image';
    progress('Running OCR on the image (first time can take a few seconds)', 0.2);
    try {
      pages.push({ n: 1, text: await ocr(file instanceof Blob ? file : new Blob([buf])), source: 'ocr' });
    } catch {
      throw new Error(
        'We couldn’t read text from this image. Try a sharper screenshot, or type the details in manually.',
      );
    }
  } else if (name.endsWith('.docx') || mime.includes('wordprocessingml')) {
    kind = 'docx';
    progress('Reading Word document', 0.2);
    const mammoth = await import('mammoth');
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf });
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('img').forEach((img) => {
      if (img.src.startsWith('data:image') && photos.length < 8) photos.push(img.src);
    });
    div.querySelectorAll('p,li,h1,h2,h3,tr').forEach((el) => el.append('\n'));
    pages.push({ n: 1, text: div.textContent ?? '', source: 'text' });
  } else if (mime.startsWith('text/') || name.endsWith('.txt')) {
    kind = 'text';
    pages.push({ n: 1, text: new TextDecoder().decode(buf), source: 'paste' });
  } else {
    throw new Error('Unsupported file type. Upload a PDF, image, Word (.docx) or text file.');
  }

  progress('Finding prices and details', 0.9);
  const extraction = parseVenueText(pages.map((p) => p.text));
  if (pages.every((p) => !p.text.trim())) warnings.push('No readable text was found in this document.');
  progress('Done', 1);
  return {
    kind,
    filename,
    mimeType: mime || 'application/octet-stream',
    hash,
    pages,
    photos,
    extraction,
    warnings: [...warnings, ...extraction.warnings],
  };
}

export function processPastedText(text: string): DocResult {
  const pages = text.split(/\f/).map((t, i) => ({ n: i + 1, text: t, source: 'paste' as const }));
  const extraction = parseVenueText(pages.map((p) => p.text));
  return {
    kind: 'text',
    filename: 'Pasted text',
    mimeType: 'text/plain',
    hash: '',
    pages,
    photos: [],
    extraction,
    warnings: extraction.warnings,
  };
}
