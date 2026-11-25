import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { openPdf } from '../lib/parsing/pdf';

/** In-app viewer for PDFs (pdf.js), images and text, with page navigation. */
export function DocumentViewer({
  blob,
  mimeType,
  text,
  page,
  onPage,
  height = '70vh',
}: {
  blob?: Blob;
  mimeType: string;
  text?: string[];
  page?: number;
  onPage?: (n: number) => void;
  height?: string;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [n, setN] = useState(page ?? 1);
  const [scale, setScale] = useState(1.2);
  const [err, setErr] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgUrl, setImgUrl] = useState('');
  const isPdf = mimeType === 'application/pdf';

  useEffect(() => {
    if (page) setN(page);
  }, [page]);
  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    if (isPdf) {
      void blob
        .arrayBuffer()
        .then(openPdf)
        .then((d) => !cancelled && setDoc(d))
        .catch(() => setErr('This PDF could not be displayed.'));
    } else if (mimeType.startsWith('image/')) {
      const u = URL.createObjectURL(blob);
      setImgUrl(u);
      return () => {
        cancelled = true;
        URL.revokeObjectURL(u);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [blob, isPdf, mimeType]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let task: { cancel(): void; promise: Promise<unknown> } | null = null;
    void doc.getPage(Math.min(n, doc.numPages)).then((p) => {
      const vp = p.getViewport({ scale: scale * (window.devicePixelRatio > 1 ? 1.5 : 1) });
      const c = canvasRef.current!;
      c.width = vp.width;
      c.height = vp.height;
      c.style.width = `${vp.width / (window.devicePixelRatio > 1 ? 1.5 : 1)}px`;
      task = p.render({ canvasContext: c.getContext('2d')!, viewport: vp });
      task.promise.catch(() => undefined);
    });
    return () => task?.cancel();
  }, [doc, n, scale]);

  const total = doc?.numPages ?? text?.length ?? 1;
  const go = (x: number) => {
    const v = Math.max(1, Math.min(total, x));
    setN(v);
    onPage?.(v);
  };

  return (
    <div
      className="rounded-2xl border border-line bg-sunken flex flex-col overflow-hidden"
      style={{ height }}
    >
      <div className="flex items-center gap-1 p-2 border-b border-line bg-surface text-sm">
        <button
          className="icon-btn h-9 w-9"
          onClick={() => go(n - 1)}
          disabled={n <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="tabular-nums" aria-live="polite">
          Page {n} / {total}
        </span>
        <button
          className="icon-btn h-9 w-9"
          onClick={() => go(n + 1)}
          disabled={n >= total}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
        {isPdf && (
          <span className="ml-auto flex">
            <button
              className="icon-btn h-9 w-9"
              aria-label="Zoom out"
              onClick={() => setScale(Math.max(0.5, scale - 0.2))}
            >
              <ZoomOut size={16} />
            </button>
            <button
              className="icon-btn h-9 w-9"
              aria-label="Zoom in"
              onClick={() => setScale(Math.min(3, scale + 0.2))}
            >
              <ZoomIn size={16} />
            </button>
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3 flex justify-center">
        {err ? (
          <p className="text-sm text-muted">{err}</p>
        ) : isPdf && blob ? (
          <canvas ref={canvasRef} className="shadow-card bg-white max-w-none" aria-label={`Page ${n}`} />
        ) : imgUrl ? (
          <img src={imgUrl} alt="Uploaded document" className="max-w-full h-auto object-contain" />
        ) : (
          <pre className="whitespace-pre-wrap text-sm font-sans bg-surface p-4 rounded-xl w-full">
            {text?.[n - 1] ?? ''}
          </pre>
        )}
      </div>
    </div>
  );
}
