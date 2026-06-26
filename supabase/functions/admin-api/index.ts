// supabase/functions/admin-api/index.ts
// Token-gated, service-role admin API for the manager panel (admin.html / admin.js).
// Every call must carry `x-admin-token` matching the ADMIN_TOKEN secret. Uses the
// service-role key internally so member PII never touches the anon client.
//
// Deploy:  supabase functions deploy admin-api
//          supabase secrets set ADMIN_TOKEN=<a long random passphrase>
//
// Body: { action, ...payload }

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function monthKey(d = new Date()) { return d.toISOString().slice(0, 7); }
function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // ---- auth ----
  const expected = Deno.env.get('ADMIN_TOKEN');
  const provided = req.headers.get('x-admin-token') || '';
  if (!expected || provided !== expected) return json({ error: 'Unauthorised' }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { action } = payload;
  const supabase = db();

  try {
    switch (action) {
      case 'ping': return json({ ok: true });

      /* ---------------- STATS / INSIGHTS ---------------- */
      case 'stats': {
        const month = monthKey();
        const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
        const [{ count: members }, { count: thisWeek }, { count: enabled }, { count: waitlist }] = await Promise.all([
          supabase.from('members').select('id', { count: 'exact', head: true }),
          supabase.from('members').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
          supabase.from('members').select('id', { count: 'exact', head: true }).eq('notif_permission_granted', true),
          supabase.from('discovery_box_waitlist').select('member_id', { count: 'exact', head: true }),
        ]);
        // prize entrants = members who joined this month
        const { count: entrants } = await supabase.from('members').select('id', { count: 'exact', head: true }).gte('created_at', month + '-01');
        // zones
        const { data: zoneRows } = await supabase.from('members').select('signup_source');
        const zones: Record<string, number> = {};
        (zoneRows || []).forEach((r) => { const k = (r.signup_source || 'app'); zones[k] = (zones[k] || 0) + 1; });
        // discovery box mode
        const { data: setting } = await supabase.from('settings').select('value').eq('key', 'discovery_box_mode').maybeSingle();
        const mode = (setting?.value ?? 'waitlist').toString().replace(/"/g, '');

        const total = members || 0;
        return json({
          members: total,
          members_this_week: thisWeek || 0,
          fully_enabled: total ? Math.round(((enabled || 0) / total) * 100) : 0,
          waitlist: waitlist || 0,
          prize_entrants: entrants || 0,
          zones,
          discovery_box_mode: mode,
          push_open_rate: null,   // wire to delivery logs when available
          email_open_rate: null,
        });
      }

      /* ---------------- MEMBERS ---------------- */
      case 'members': {
        const { data, error } = await supabase.from('members')
          .select('id, first_name, surname, mobile, email, membership_number, preferred_store, signup_source, marketing_consent, notif_permission_granted, created_at')
          .order('created_at', { ascending: false }).limit(2000);
        if (error) return json({ error: error.message }, 400);
        return json({ members: data });
      }

      /* ---------------- PRIZE DRAW ---------------- */
      case 'draw-status': {
        const month = monthKey();
        const { count: entrants } = await supabase.from('members').select('id', { count: 'exact', head: true }).gte('created_at', month + '-01');
        const { data: draw } = await supabase.from('prize_draws').select('*').eq('month', month).maybeSingle();
        let winner = null;
        if (draw?.winner_member_id) {
          const { data: m } = await supabase.from('members').select('first_name, surname, membership_number, signup_source').eq('id', draw.winner_member_id).maybeSingle();
          if (m) winner = { name: `${m.first_name} ${m.surname}`, meta: `Member No. ${m.membership_number} · joined via ${m.signup_source || 'app'}` };
        }
        const { data: pastRows } = await supabase.from('prize_draws').select('*').eq('status', 'drawn').neq('month', month).order('month', { ascending: false }).limit(12);
        const past = [] as any[];
        for (const p of pastRows || []) {
          let name = '—';
          if (p.winner_member_id) { const { data: m } = await supabase.from('members').select('first_name, surname').eq('id', p.winner_member_id).maybeSingle(); if (m) name = `${m.first_name} ${m.surname[0]}.`; }
          past.push({ month_label: monthLabel(p.month), name, prize: p.prize });
        }
        return json({ month: month, month_label: monthLabel(month), entrants: entrants || 0, winner, past });
      }

      case 'run-draw': {
        const month = monthKey();
        const { data: pool } = await supabase.from('members').select('id, first_name, surname, membership_number, signup_source').gte('created_at', month + '-01');
        if (!pool || !pool.length) return json({ winner: null });
        const pick = pool[Math.floor(Math.random() * pool.length)];
        await supabase.from('prize_draws').upsert(
          { month, status: 'drawn', winner_member_id: pick.id, prize: '1st: R3,000 drinks hamper', drawn_at: new Date().toISOString() },
          { onConflict: 'month' },
        );
        return json({ winner: { name: `${pick.first_name} ${pick.surname}`, meta: `Member No. ${pick.membership_number} · joined via ${pick.signup_source || 'app'}` } });
      }

      /* ---------------- STAFF CHAMPIONS ---------------- */
      case 'staff-leaderboard': {
        const month = monthKey();
        const { data: staff } = await supabase.from('staff').select('id, name').eq('active', true);
        const { data: signups } = await supabase.from('members').select('staff_id').gte('created_at', month + '-01').not('staff_id', 'is', null);
        const counts: Record<string, number> = {};
        (signups || []).forEach((s) => { if (s.staff_id) counts[s.staff_id] = (counts[s.staff_id] || 0) + 1; });
        const list = (staff || []).map((s) => ({ name: s.name, count: counts[s.id] || 0 })).sort((a, b) => b.count - a.count);
        return json({ month_label: monthLabel(month), staff: list });
      }
      case 'add-staff': {
        const { name, code, store } = payload;
        if (!name || !code) return json({ error: 'name and code required' }, 400);
        const { error } = await supabase.from('staff').insert({ name, code, store: store || 'Beacon Isle', active: true });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      /* ---------------- SUPPLIERS ---------------- */
      case 'suppliers': {
        const { data } = await supabase.from('suppliers').select('*').order('name');
        return json({ suppliers: data || [] });
      }
      case 'add-supplier': {
        const { name, tier } = payload;
        if (!name) return json({ error: 'name required' }, 400);
        const { error } = await supabase.from('suppliers').insert({ name, tier: tier || 'featured', active: true });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      case 'set-supplier-tier': {
        const { id, tier } = payload;
        if (!id || !tier) return json({ error: 'id and tier required' }, 400);
        await supabase.from('suppliers').update({ tier }).eq('id', id);
        return json({ ok: true });
      }

      /* ---------------- SETTINGS ---------------- */
      case 'set-setting': {
        const { key, value } = payload;
        if (!key) return json({ error: 'key required' }, 400);
        await supabase.from('settings').upsert({ key, value: JSON.stringify(value) }, { onConflict: 'key' });
        // keep discovery_boxes status in sync with the mode flag
        if (key === 'discovery_box_mode') {
          await supabase.from('discovery_boxes').update({ status: value === 'live' ? 'live' : 'waitlist' }).neq('status', 'past');
        }
        return json({ ok: true });
      }

      /* ---------------- IMAGE UPLOAD ---------------- */
      case 'upload-image': {
        const { imageBase64, imageMediaType = 'image/jpeg' } = payload;
        if (!imageBase64) return json({ error: 'imageBase64 required' }, 400);
        const ext = (imageMediaType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const name = `post-${Date.now()}.${ext}`;
        const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
        const { error } = await supabase.storage.from('post-images').upload(name, bytes, { contentType: imageMediaType, upsert: true });
        if (error) return json({ error: error.message }, 400);
        const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(name);
        return json({ url: publicUrl });
      }

      /* ---------------- CREATE POST (audited draft→published special) ---------------- */
      case 'create-post': {
        const { postType, title, body, price, kicker, source_photo, image_url } = payload;
        const category = ({ 'Member Special': 'Wine', 'New Arrival': 'Wine', 'Discovery Box': 'Box' } as any)[postType] || postType;
        const { data, error } = await supabase.from('specials').insert({
          category, title: title || 'Member Special',
          member_price: price ? Number(String(price).replace(/[^\d.]/g, '')) : null,
          link: kicker || null,
          status: 'published',
          ai_generated: true,
          source_photo_url: image_url || (source_photo ? 'uploaded' : null),
        }).select('id').single();
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true, id: data.id });
      }

      default: return json({ error: 'Unknown action: ' + action }, 400);
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
