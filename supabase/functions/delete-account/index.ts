// Permanently deletes the caller's account: storage objects first, then the auth user
// (which cascades to every owned row via foreign keys).
import { cors, getUser, json, serviceClient } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  const user = await getUser(req);
  if (!user) return json(req, { error: 'Sign in required' }, 401);
  const { confirm } = await req.json().catch(() => ({}));
  if (confirm !== 'DELETE') return json(req, { error: 'Confirmation missing' }, 400);
  const db = serviceClient();
  const bucket = db.storage.from('documents');
  // remove all objects under <uid>/
  for (let i = 0; i < 50; i++) {
    const { data: dirs } = await bucket.list(user.id, { limit: 1000 });
    if (!dirs?.length) break;
    const paths: string[] = [];
    for (const d of dirs) {
      const { data: files } = await bucket.list(`${user.id}/${d.name}`, { limit: 1000 });
      if (files?.length) paths.push(...files.map((f) => `${user.id}/${d.name}/${f.name}`));
      else paths.push(`${user.id}/${d.name}`);
    }
    await bucket.remove(paths);
  }
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return json(req, { error: error.message }, 500);
  return json(req, { ok: true });
});
