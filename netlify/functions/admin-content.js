// Netlify Function: admin content management (wines, events, Discovery Boxes).
// Lets the manager add/edit/delete catalogue content without touching Supabase.
// Auto-deploys with the site, so we never depend on a manual Supabase deploy.
//
// Requires Netlify env vars:
//   SUPABASE_SERVICE_ROLE_KEY  (secret) — bypasses RLS for writes
//   ADMIN_TOKEN                (secret) — the manager passphrase; gates this function
//
// Security: every request must carry header  x-admin-token  matching ADMIN_TOKEN.

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://wwwrrtmuisdgkkwxyjdo.supabase.co').replace(/\/$/, '');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(obj, statusCode = 200) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

// whitelist of writable columns per table (ignore anything else the client sends)
const FIELDS = {
  wines: ['name', 'producer', 'region', 'country', 'varietal', 'story', 'food_pairings', 'serving_temp', 'tasting_notes', 'awards', 'facts', 'image_url', 'avg_rating'],
  events: ['type', 'title', 'description', 'datetime', 'location', 'capacity', 'image_url', 'status'],
  discovery_boxes: ['month', 'title', 'image_url', 'price', 'included', 'availability', 'status'],
  magazines: ['title', 'issue_date', 'cover_url', 'content_ref'],
};

function pick(table, body) {
  const out = {};
  for (const k of FIELDS[table]) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return json({ error: 'POST only' }, 405);

  const adminToken = (process.env.ADMIN_TOKEN || '').trim();
  if (!adminToken) return json({ error: 'ADMIN_TOKEN not configured in Netlify.' }, 500);
  if ((event.headers['x-admin-token'] || '') !== adminToken) return json({ error: 'Unauthorised' }, 401);

  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured in Netlify.' }, 500);

  const rest = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { action } = payload;

  // map an action to its table
  const TABLE = {
    'list-wines': 'wines', 'save-wine': 'wines', 'delete-wine': 'wines',
    'list-events': 'events', 'save-event': 'events', 'delete-event': 'events',
    'list-boxes': 'discovery_boxes', 'save-box': 'discovery_boxes', 'delete-box': 'discovery_boxes',
    'list-mags': 'magazines', 'save-mag': 'magazines', 'delete-mag': 'magazines',
  };
  const table = TABLE[action];
  if (!table) return json({ error: 'Unknown action: ' + action }, 400);

  const order = table === 'events' ? 'datetime.asc' : table === 'discovery_boxes' ? 'created_at.desc' : table === 'magazines' ? 'issue_date.desc' : 'name.asc';

  try {
    // LIST
    if (action.startsWith('list-')) {
      const res = await rest(`${table}?select=*&order=${order}`);
      const rows = await res.json();
      if (!res.ok) return json({ error: rows.message || 'Load failed' }, 400);
      return json({ items: Array.isArray(rows) ? rows : [] });
    }

    // DELETE
    if (action.startsWith('delete-')) {
      const { id } = payload;
      if (!id) return json({ error: 'id required' }, 400);
      const res = await rest(`${table}?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      if (!res.ok) return json({ error: await res.text() }, 400);
      return json({ ok: true });
    }

    // SAVE (insert or update)
    if (action.startsWith('save-')) {
      const body = pick(table, payload);
      if (table !== 'discovery_boxes' && !body.title && !body.name) return json({ error: 'Name/title required' }, 400);
      // numeric coercions
      if (body.capacity !== undefined && body.capacity !== null && body.capacity !== '') body.capacity = parseInt(body.capacity, 10) || null;
      if (body.price !== undefined && body.price !== null && body.price !== '') body.price = parseFloat(body.price) || null;
      if (body.avg_rating !== undefined && body.avg_rating !== null && body.avg_rating !== '') body.avg_rating = parseFloat(body.avg_rating) || 0;

      const { id } = payload;
      if (id) {
        const res = await rest(`${table}?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
        const rows = await res.json();
        if (!res.ok) return json({ error: rows.message || JSON.stringify(rows) }, 400);
        return json({ ok: true, item: Array.isArray(rows) ? rows[0] : rows });
      }
      const res = await rest(table, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
      const rows = await res.json();
      if (!res.ok) return json({ error: rows.message || JSON.stringify(rows) }, 400);
      return json({ ok: true, item: Array.isArray(rows) ? rows[0] : rows });
    }

    return json({ error: 'Unhandled action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
};
