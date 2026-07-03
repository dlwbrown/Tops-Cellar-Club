// Netlify Function: broadcast — logs an in-app notification and sends Web Push to
// the targeted audience only. Auto-deploys with the site.
//
// Netlify env: SUPABASE_SERVICE_ROLE_KEY, ADMIN_TOKEN,
//              VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
//
// Body: { title, body, image?, link?, audience?: {type:'all'|'membership'|'store'|'taste', value?}, channels?, sent_by? }

const webpush = require('web-push');
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://wwwrrtmuisdgkkwxyjdo.supabase.co').replace(/\/$/, '');

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
  const rest = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });

  let p; try { p = JSON.parse(event.body || '{}'); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { title, body, image, link, audience = { type: 'all' }, channels = ['push', 'in_app'], sent_by } = p;
  if (!title) return json({ error: 'title required' }, 400);

  // 1) log the in-app notification (powers the feed + analytics)
  let notifId = null;
  try {
    const r = await rest('notifications', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ title, body, image_url: image, link, audience, channels, sent_by }) });
    const rows = await r.json(); notifId = Array.isArray(rows) ? rows[0]?.id : rows?.id;
  } catch {}

  let pushed = 0;
  if (channels.includes('push')) {
    const pub = (process.env.VAPID_PUBLIC_KEY || '').trim(), priv = (process.env.VAPID_PRIVATE_KEY || '').trim();
    if (!pub || !priv) return json({ ok: true, notification_id: notifId, pushed: 0, note: 'Saved in-app. Add VAPID keys in Netlify to also send push.' });
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@topscellarclub.co.za', pub, priv);

    // 2) resolve the audience to member ids (null = everyone)
    let memberIds = null;
    try {
      if (audience.type === 'membership' && audience.value) {
        const d = await (await rest(`members?select=id&membership_type=eq.${encodeURIComponent(audience.value)}`)).json();
        memberIds = (d || []).map((m) => m.id);
      } else if (audience.type === 'store' && audience.value) {
        const d = await (await rest(`members?select=id&preferred_store=eq.${encodeURIComponent(audience.value)}`)).json();
        memberIds = (d || []).map((m) => m.id);
      } else if (audience.type === 'taste' && audience.value) {
        const d = await (await rest(`members?select=id&fav_wine_styles=cs.{${encodeURIComponent(audience.value)}}`)).json();
        memberIds = (d || []).map((m) => m.id);
      }
    } catch {}
    if (memberIds && !memberIds.length) return json({ ok: true, notification_id: notifId, pushed: 0 });

    // 3) subscriptions for those members
    let subQ = 'push_subscriptions?select=endpoint,p256dh,auth,member_id';
    if (memberIds) subQ += `&member_id=in.(${memberIds.map((i) => `"${i}"`).join(',')})`;
    const subs = await (await rest(subQ)).json();
    const payload = JSON.stringify({ title, body, image, link });
    await Promise.all((Array.isArray(subs) ? subs : []).map(async (s) => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); pushed++; }
      catch (err) { if (err && (err.statusCode === 404 || err.statusCode === 410)) await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); }
    }));
  }

  return json({ ok: true, notification_id: notifId, pushed });
};
