/** Browser-side pdf.js helpers (lazy-loaded). */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { itemsToText, type PdfTextItem } from './pdfText';

let lib: typeof import('pdfjs-dist') | null = null;
export async function pdfjs() {
  if (lib) return lib;
  const [mod, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  mod.GlobalWorkerOptions.workerSrc = worker.default;
  lib = mod;
  return mod;
}

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const p = await pdfjs();
  return p.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
}

export async function pageText(doc: PDFDocumentProxy, n: number): Promise<string> {
  const page = await doc.getPage(n);
  const tc = await page.getTextContent();
  return itemsToText(tc.items as PdfTextItem[]);
}

export async function renderPage(doc: PDFDocumentProxy, n: number, scale = 1.5): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
  return canvas;
}

/** Extract embedded raster images (≥ 240px) from a page as data URLs — candidate gallery photos. */
export async function pageImages(doc: PDFDocumentProxy, n: number): Promise<string[]> {
  const p = await pdfjs();
  const page = await doc.getPage(n);
  const ops = await page.getOperatorList();
  const out: string[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== p.OPS.paintImageXObject) continue;
    const name = ops.argsArray[i][0] as string;
    const img = await new Promise<{ width: number; height: number; data?: Uint8ClampedArray; bitmap?: ImageBitmap; kind?: number } | null>((resolve) => {
      try {
        page.objs.get(name, (o: unknown) => resolve(o as never));
      } catch {
        resolve(null);
      }
      setTimeout(() => resolve(null), 1500);
    });
    if (!img || img.width < 240 || img.height < 180) continue;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    if (img.bitmap) ctx.drawImage(img.bitmap, 0, 0);
    else if (img.data) {
      const rgba = new Uint8ClampedArray(img.width * img.height * 4);
      const src = img.data;
      const channels = src.length / (img.width * img.height);
      for (let px = 0, j = 0; px < img.width * img.height; px++) {
        rgba[px * 4] = src[j];
        rgba[px * 4 + 1] = channels >= 3 ? src[j + 1] : src[j];
        rgba[px * 4 + 2] = channels >= 3 ? src[j + 2] : src[j];
        rgba[px * 4 + 3] = channels === 4 ? src[j + 3] : 255;
        j += Math.max(1, Math.round(channels));
      }
      ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
    } else continue;
    // downscale for storage
    const max = 1200;
    const s = Math.min(1, max / Math.max(c.width, c.height));
    const d = document.createElement('canvas');
    d.width = Math.round(c.width * s);
    d.height = Math.round(c.height * s);
    d.getContext('2d')!.drawImage(c, 0, 0, d.width, d.height);
    out.push(d.toDataURL('image/jpeg', 0.82));
    if (out.length >= 6) break;
  }
  return out;
}
