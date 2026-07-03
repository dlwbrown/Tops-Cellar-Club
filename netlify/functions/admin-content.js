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
  wines: ['name', 'producer', 'region', 'country', 'varietal', 'story', 'food_pairings', 'serving_temp', 'tasting_notes', 'awards', 'facts', 'image_url', 'avg_rating', 'product_code', 'category', 'vintage', 'size', 'alcohol', 'cellaring_potential', 'selling_price', 'promo_price', 'soh', 'active'],
  events: ['type', 'title', 'description', 'datetime', 'location', 'capacity', 'image_url', 'status'],
  discovery_boxes: ['month', 'title', 'image_url', 'price', 'included', 'availability', 'status'],
  magazines: ['title', 'issue_date', 'cover_url', 'content_ref', 'category', 'excerpt', 'body'],
  prizes: ['name', 'description', 'image_url', 'value', 'qty_available', 'qty_awarded', 'start_date', 'end_date', 'is_bonus', 'active'],
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

  // ---- Wine price-list import (MERGE by product_code) ----
  if (action === 'list-wine-codes') {
    try {
      const res = await rest('wines?select=product_code&product_code=not.is.null&limit=100000');
      const rows = await res.json();
      if (!res.ok) return json({ error: rows.message || 'Load failed' }, 400);
      return json({ codes: (Array.isArray(rows) ? rows : []).map((r) => String(r.product_code)) });
    } catch (e) { return json({ error: String(e) }, 500); }
  }
  if (action === 'import-wines') {
    try {
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      // existing codes so we update price/stock only (never clobber curated names/enrichment)
      const cres = await rest('wines?select=product_code&product_code=not.is.null&limit=100000');
      const existing = new Set((await cres.json() || []).map((r) => String(r.product_code)));
      const news = [], upds = []; let skipped = 0;
      for (const r of rows) {
        const code = (r.product_code ?? '').toString().trim();
        if (!code) { skipped++; continue; }
        const size = r.size !== undefined ? String(r.size).trim() : undefined;
        const soh = (r.soh !== undefined && r.soh !== '') ? (parseInt(r.soh, 10) || 0) : undefined;
        const sp = (r.selling_price !== undefined && r.selling_price !== '') ? (parseFloat(String(r.selling_price).replace(/[^\d.]/g, '')) || null) : undefined;
        // Description (name) follows the import; enrichment (image, region, notes…) is
        // never in the payload, so it is preserved on existing wines.
        const nm = (r.name !== undefined && String(r.name).trim() !== '') ? String(r.name).trim() : code;
        const o = { product_code: code, name: nm };
        if (size !== undefined) o.size = size;
        if (soh !== undefined) o.soh = soh;
        if (sp !== undefined) o.selling_price = sp;
        if (existing.has(code)) upds.push(o); else news.push(o);
      }
      const post = async (arr) => {
        for (let i = 0; i < arr.length; i += 500) {
          const res = await rest('wines?on_conflict=product_code', {
            method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(arr.slice(i, i + 500)),
          });
          if (!res.ok) throw new Error(await res.text());
        }
      };
      if (upds.length) await post(upds);
      if (news.length) await post(news);
      return json({ ok: true, processed: upds.length + news.length, added: news.length, updated: upds.length, skipped });
    } catch (e) { return json({ error: String(e) }, 500); }
  }

  // ---- Prizes & Lucky Draw ----
  if (action === 'list-wins') {
    try {
      const res = await rest('prize_wins?select=*&order=created_at.desc&limit=1000');
      const rows = await res.json();
      if (!res.ok) return json({ error: rows.message || 'Load failed' }, 400);
      return json({ wins: Array.isArray(rows) ? rows : [] });
    } catch (e) { return json({ error: String(e) }, 500); }
  }
  if (action === 'draw-winner') {
    try {
      const { prize_id, start, end, drawn_by } = payload;
      if (!prize_id) return json({ error: 'prize_id required' }, 400);
      // load the prize
      const pr = await (await rest(`prizes?id=eq.${prize_id}&select=*`)).json();
      const prize = Array.isArray(pr) ? pr[0] : null;
      if (!prize) return json({ error: 'Prize not found' }, 404);
      const remaining = (prize.qty_available || 0) - (prize.qty_awarded || 0);
      if (prize.active === false || remaining <= 0) return json({ error: 'This prize is no longer available.' }, 400);

      // eligible members: joined within the qualifying range (inclusive)
      let q = 'members?select=id,first_name,surname,membership_number,created_at';
      if (start) q += `&created_at=gte.${start}T00:00:00`;
      if (end) q += `&created_at=lte.${end}T23:59:59`;
      q += '&limit=100000';
      let members = await (await rest(q)).json();
      members = Array.isArray(members) ? members : [];
      // prevent a member winning the SAME prize twice
      const prevWins = await (await rest(`prize_wins?prize_id=eq.${prize_id}&select=member_id`)).json();
      const won = new Set((Array.isArray(prevWins) ? prevWins : []).map((w) => w.member_id));
      const pool = members.filter((m) => !won.has(m.id));
      if (!pool.length) return json({ error: 'No qualifying members for that date range.' }, 400);

      // pick a winner (server-side)
      const winner = pool[Math.floor(Math.random() * pool.length)];
      const winnerName = `${winner.first_name || ''} ${winner.surname || ''}`.trim();

      // build a readable wheel (winner + up to 19 others), shuffled
      const others = pool.filter((m) => m.id !== winner.id);
      for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
      const sample = others.slice(0, 19).map((m) => `${m.first_name || ''} ${m.surname || ''}`.trim() || 'Member');
      const wheelNames = [...sample, winnerName];
      for (let i = wheelNames.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [wheelNames[i], wheelNames[j]] = [wheelNames[j], wheelNames[i]]; }
      const winnerIndex = wheelNames.lastIndexOf(winnerName);

      // record the win + decrement remaining
      await rest('prize_wins', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
        prize_id, prize_name: prize.name, prize_value: prize.value,
        member_id: winner.id, member_name: winnerName, member_number: winner.membership_number || null,
        drawn_by: drawn_by || 'admin', range_start: start || null, range_end: end || null,
      }) });
      const newAwarded = (prize.qty_awarded || 0) + 1;
      const patch = { qty_awarded: newAwarded };
      if (newAwarded >= (prize.qty_available || 0)) patch.active = false; // auto-unavailable at zero
      await rest(`prizes?id=eq.${prize_id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });

      return json({
        winner: { name: winnerName, number: winner.membership_number || '' },
        participants: pool.length,
        wheelNames, winnerIndex,
        remaining: (prize.qty_available || 0) - newAwarded,
      });
    } catch (e) { return json({ error: String(e) }, 500); }
  }

  // ---- Orders (save has custom order-number + total) ----
  if (action === 'save-order') {
    try {
      const p = payload;
      const items = Array.isArray(p.items) ? p.items.map((it) => ({
        code: String(it.code || ''), description: String(it.description || ''),
        qty: parseInt(it.qty, 10) || 0, price: parseFloat(it.price) || 0,
      })) : [];
      const sub = items.reduce((s, it) => s + it.qty * it.price, 0);
      const discount = parseFloat(p.discount) || 0;
      const total = Math.max(0, Math.round((sub - discount) * 100) / 100);
      const body = {
        member_id: p.member_id || null, customer_name: (p.customer_name || '').trim(),
        member_number: (p.member_number || '').trim() || null, contact: (p.contact || '').trim() || null,
        order_type: p.order_type || 'wine', fulfilment: p.fulfilment || 'collection',
        payment_status: p.payment_status || 'unpaid', status: p.status || 'pending',
        items, discount, total, notes: (p.notes || '').trim() || null,
      };
      if (p.id) {
        const res = await rest(`orders?id=eq.${p.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
        const rows = await res.json(); if (!res.ok) return json({ error: rows.message || JSON.stringify(rows) }, 400);
        return json({ ok: true, item: Array.isArray(rows) ? rows[0] : rows });
      }
      // next order number from the current count
      const cres = await rest('orders?select=id&limit=1', { headers: { Prefer: 'count=exact' } });
      let count = 0; const cr = cres.headers.get('content-range'); if (cr) { const m = cr.match(/\/(\d+)$/); if (m) count = parseInt(m[1], 10) || 0; }
      body.order_number = 'TCS-' + (1001 + count);
      const res = await rest('orders', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
      const rows = await res.json(); if (!res.ok) return json({ error: rows.message || JSON.stringify(rows) }, 400);
      return json({ ok: true, item: Array.isArray(rows) ? rows[0] : rows });
    } catch (e) { return json({ error: String(e) }, 500); }
  }

  // map an action to its table
  const TABLE = {
    'list-wines': 'wines', 'save-wine': 'wines', 'delete-wine': 'wines',
    'list-events': 'events', 'save-event': 'events', 'delete-event': 'events',
    'list-boxes': 'discovery_boxes', 'save-box': 'discovery_boxes', 'delete-box': 'discovery_boxes',
    'list-mags': 'magazines', 'save-mag': 'magazines', 'delete-mag': 'magazines',
    'list-prizes': 'prizes', 'save-prize': 'prizes', 'delete-prize': 'prizes',
    'list-orders': 'orders', 'delete-order': 'orders',
  };
  const table = TABLE[action];
  if (!table) return json({ error: 'Unknown action: ' + action }, 400);

  const order = table === 'events' ? 'datetime.asc' : (table === 'discovery_boxes' || table === 'prizes' || table === 'orders') ? 'created_at.desc' : table === 'magazines' ? 'issue_date.desc' : 'name.asc';

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
      for (const k of ['selling_price', 'promo_price', 'alcohol']) {
        if (body[k] === '' ) body[k] = null;
        else if (body[k] !== undefined && body[k] !== null) body[k] = parseFloat(String(body[k]).replace(/[^\d.]/g, '')) || null;
      }
      if (body.soh !== undefined) body.soh = (body.soh === '' || body.soh === null) ? 0 : (parseInt(body.soh, 10) || 0);
      if (body.product_code === '') body.product_code = null;
      if (body.value === '') body.value = null;
      else if (body.value !== undefined && body.value !== null) body.value = parseFloat(String(body.value).replace(/[^\d.]/g, '')) || null;
      for (const k of ['qty_available', 'qty_awarded']) {
        if (body[k] === '' || body[k] === null) body[k] = (k === 'qty_available' ? 1 : 0);
        else if (body[k] !== undefined) body[k] = parseInt(body[k], 10) || 0;
      }
      for (const k of ['start_date', 'end_date']) if (body[k] === '') body[k] = null;
      if (body.is_bonus !== undefined) body.is_bonus = (body.is_bonus === true || body.is_bonus === 'true' || body.is_bonus === 'on' || body.is_bonus === 1);
      if (body.active !== undefined) body.active = (body.active === true || body.active === 'true' || body.active === 'on' || body.active === 1);

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
