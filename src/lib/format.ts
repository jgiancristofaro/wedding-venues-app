export function money(n: number | null | undefined, opts: { compact?: boolean; currency?: string } = {}): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (opts.compact && Math.abs(n) >= 1000) {
    const k = n / 1000;
    return `$${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: opts.currency ?? 'USD', maximumFractionDigits: 0 }).format(n);
}

export function range(lo: number | null, hi: number | null): string {
  if (lo == null || hi == null) return '';
  if (Math.abs(hi - lo) < Math.max(500, lo * 0.01)) return '';
  return `${money(lo, { compact: true })}–${money(hi, { compact: true })}`;
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function shortDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function plural(n: number, w: string) {
  return `${n} ${w}${n === 1 ? '' : 's'}`;
}

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
