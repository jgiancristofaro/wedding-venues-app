// Fetches an online brochure/"digital booklet" URL on the user's behalf.
// Returns the PDF/image bytes, or a clear explanation when the link is a viewer page we can't fetch.
import { cors, getUser, json } from '../_shared/http.ts';

const MAX = 25 * 1024 * 1024;
const PRIVATE =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?|metadata\.google)/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (!(await getUser(req))) return json(req, { error: 'Sign in required' }, 401);
  const { url } = await req.json().catch(() => ({ url: '' }));
  let u: URL;
  try {
    u = new URL(String(url));
  } catch {
    return json(req, { error: 'That doesn’t look like a valid link.' }, 400);
  }
  if (!/^https?:$/.test(u.protocol) || PRIVATE.test(u.hostname))
    return json(req, { error: 'Only public http(s) links can be fetched.' }, 400);
  let res: Response;
  try {
    res = await fetch(u, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VellumFetcher/1.0)' },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return json(
      req,
      { error: `Couldn’t reach that site (${(e as Error).message}).`, code: 'unreachable' },
      502,
    );
  }
  if (!res.ok)
    return json(
      req,
      { error: `The site responded with ${res.status}. It may block automated downloads.`, code: 'blocked' },
      502,
    );
  const type = res.headers.get('content-type') ?? '';
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX) return json(req, { error: 'That file is larger than 25 MB.', code: 'too_large' }, 413);
  if (/pdf|image\//.test(type)) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX)
      return json(req, { error: 'That file is larger than 25 MB.', code: 'too_large' }, 413);
    return new Response(buf, { headers: { ...cors(req), 'Content-Type': type } });
  }
  const html = (await res.text()).slice(0, 2_000_000);
  // Look for a direct PDF link inside the page
  const pdf = /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i.exec(html);
  if (pdf) return json(req, { redirectTo: new URL(pdf[1], u).toString(), code: 'pdf_link_found' });
  return json(
    req,
    {
      error:
        'This link opens a page viewer (like an online flipbook), not a downloadable file. Please download the PDF from the viewer, or take screenshots of the pages, and upload them here.',
      code: 'viewer',
    },
    422,
  );
});
