// Netlify Function: upload an image to Supabase Storage and return its public URL.
// Auto-creates the public bucket on first use, so there's no manual setup.
//
// Netlify env: SUPABASE_SERVICE_ROLE_KEY, ADMIN_TOKEN
// Body: { imageBase64, mime?, prefix? }  ->  { url }

const crypto = require('crypto');
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://wwwrrtmuisdgkkwxyjdo.supabase.co').replace(/\/$/, '');
const BUCKET = 'wine-images';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (o, s = 200) => ({ statusCode: s, headers, body: JSON.stringify(o) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return json({ error: 'POST only' }, 405);

  const adminToken = (process.env.ADMIN_TOKEN || '').trim();
  if (!adminToken || (event.headers['x-admin-token'] || '') !== adminToken) return json({ error: 'Unauthorised' }, 401);
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured.' }, 500);
  const auth = { apikey: key, Authorization: `Bearer ${key}` };

  let p; try { p = JSON.parse(event.body || '{}'); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const b64 = (p.imageBase64 || '').replace(/^data:[^,]+,/, '');
  if (!b64) return json({ error: 'imageBase64 required' }, 400);
  const mime = p.mime || 'image/jpeg';
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const name = `${(p.prefix || 'img').replace(/[^a-z0-9]/gi, '')}-${crypto.randomUUID()}.${ext}`;

  try {
    // ensure the bucket exists (idempotent — ignore "already exists")
    await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
    }).catch(() => {});

    const bytes = Buffer.from(b64, 'base64');
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${name}`, {
      method: 'POST', headers: { ...auth, 'Content-Type': mime, 'x-upsert': 'true' }, body: bytes,
    });
    if (!up.ok) return json({ error: 'Upload failed: ' + (await up.text()) }, 400);
    return json({ url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${name}` });
  } catch (e) { return json({ error: String(e) }, 500); }
};
