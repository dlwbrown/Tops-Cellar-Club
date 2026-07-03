// Netlify Function: member writes (favourites, ratings, RSVP, cellar reads).
// Uses the Supabase service-role key (server-side only) to bypass RLS, exactly
// like the Supabase member-api did — but this auto-deploys with the site so we
// never depend on a manual Supabase function deploy again.
//
// Requires Netlify env var:  SUPABASE_SERVICE_ROLE_KEY  (secret)
// SUPABASE_URL is public; we read it from env with a safe fallback.

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://wwwrrtmuisdgkkwxyjdo.supabase.co').replace(/\/$/, '');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(obj, statusCode = 200) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return json({ error: 'POST only' }, 405);

  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured in Netlify.' }, 500);

  const rest = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { action } = payload;

  try {
    switch (action) {
      case 'save-subscription': {
        // One push subscription per member — deletes any previous ones first so a
        // re-installed app doesn't leave a stale subscription that double-notifies.
        const { member_id, endpoint, p256dh, auth, device_type } = payload;
        if (!member_id || !endpoint || !p256dh || !auth) return json({ error: 'Missing subscription fields.' }, 400);
        await rest(`push_subscriptions?member_id=eq.${member_id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
        const ins = await rest('push_subscriptions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ member_id, endpoint, p256dh, auth, device_type: device_type || null }) });
        if (!ins.ok) return json({ error: await ins.text() }, 400);
        await rest(`members?id=eq.${member_id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ notif_permission_granted: true }) });
        return json({ ok: true });
      }

      case 'get-cellar': {
        const { member_id } = payload;
        if (!member_id) return json({ error: 'member_id required' }, 400);
        const [favRes, revRes] = await Promise.all([
          rest(`favourites?member_id=eq.${member_id}&select=wine_id,wines(*)`),
          rest(`reviews?member_id=eq.${member_id}&select=rating,note,created_at,wines(*)&order=created_at.desc`),
        ]);
        const favRows = await favRes.json();
        const revRows = await revRes.json();
        const favourites = (Array.isArray(favRows) ? favRows : []).map((f) => ({ ...(f.wines || {}), wine_id: f.wine_id }));
        const ratings = (Array.isArray(revRows) ? revRows : []).map((r) => ({ ...(r.wines || {}), rating: r.rating, note: r.note, rated_at: r.created_at }));
        return json({ favourites, ratings });
      }

      case 'toggle-fav': {
        const { member_id, wine_id } = payload;
        if (!member_id || !wine_id) return json({ error: 'member_id and wine_id required' }, 400);
        const existRes = await rest(`favourites?member_id=eq.${member_id}&wine_id=eq.${wine_id}&select=wine_id`);
        const exist = await existRes.json();
        if (Array.isArray(exist) && exist.length) {
          await rest(`favourites?member_id=eq.${member_id}&wine_id=eq.${wine_id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
          return json({ favourited: false });
        }
        const ins = await rest('favourites', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ member_id, wine_id }) });
        if (!ins.ok) return json({ error: await ins.text() }, 400);
        return json({ favourited: true });
      }

      case 'add-rating': {
        const { member_id, wine_id, rating, note } = payload;
        if (!member_id || !wine_id || !rating) return json({ error: 'member_id, wine_id and rating required' }, 400);
        if (rating < 1 || rating > 5) return json({ error: 'rating must be 1–5' }, 400);
        const up = await rest('reviews?on_conflict=member_id,wine_id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ member_id, wine_id, rating, note: note || null }),
        });
        if (!up.ok) return json({ error: await up.text() }, 400);
        // recompute average for the wine
        const allRes = await rest(`reviews?wine_id=eq.${wine_id}&select=rating`);
        const all = await allRes.json();
        if (Array.isArray(all) && all.length) {
          const avg = all.reduce((s, r) => s + r.rating, 0) / all.length;
          await rest(`wines?id=eq.${wine_id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ avg_rating: Math.round(avg * 10) / 10 }) });
        }
        return json({ ok: true });
      }

      case 'rsvp': {
        const { member_id, event_id } = payload;
        if (!member_id || !event_id) return json({ error: 'member_id and event_id required' }, 400);
        const up = await rest('rsvps?on_conflict=member_id,event_id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ member_id, event_id, status: 'going' }),
        });
        if (!up.ok) return json({ error: await up.text() }, 400);
        return json({ ok: true });
      }

      default:
        return json({ error: 'Unknown action: ' + action }, 400);
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
};
