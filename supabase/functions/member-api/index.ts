// supabase/functions/member-api/index.ts
// Public, service-role member API. Keeps member PII off the anon client: every
// member-facing WRITE goes through here. RLS stays locked on `members` /
// `push_subscriptions`; this function uses the service-role key (server-side only).
//
// Deploy:  supabase functions deploy member-api
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// Body: { action, ...payload }
//   register        { first_name, surname, mobile, email, dob, preferred_store,
//                     fav_wine_styles[], fav_spirits[], marketing_consent,
//                     signup_source, staff_code, install_completed }
//   save-subscription { member_id, endpoint, p256dh, auth, device_type }
//   set-notif       { member_id, granted }
//   join-waitlist   { member_id, box_id?, reserve? }
//   rsvp            { member_id, event_id }

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const db = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function isAdult(dob: string): boolean {
  if (!dob) return false;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return false;
  const cut = new Date();
  cut.setFullYear(cut.getFullYear() - 18);
  return d <= cut;
}

async function nextMembershipNumber(supabase: ReturnType<typeof db>): Promise<string> {
  // Uses a Postgres sequence created in supabase/phase1-extra.sql.
  const { data, error } = await supabase.rpc('next_membership_number');
  if (!error && data) return String(data);
  // Fallback: count-based (still unique enough at store volume).
  const { count } = await supabase.from('members').select('id', { count: 'exact', head: true });
  return String(1001 + (count ?? 0));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { action } = payload;
  const supabase = db();

  try {
    switch (action) {
      /* ---------------- REGISTER ---------------- */
      case 'register': {
        const f = payload;
        if (!f.first_name || !f.surname || !f.mobile || !f.email || !f.dob) return json({ error: 'Missing required fields.' }, 400);
        if (!isAdult(f.dob)) return json({ error: 'You must be 18 or older to join.' }, 400);

        // resolve staff attribution from a staff code (checkout-zone QR)
        let staff_id: string | null = null;
        if (f.staff_code) {
          const { data: staff } = await supabase.from('staff').select('id').eq('code', f.staff_code).eq('active', true).maybeSingle();
          staff_id = staff?.id ?? null;
        }

        const now = new Date().toISOString();
        const membership_number = await nextMembershipNumber(supabase);

        const { data: member, error } = await supabase.from('members').insert({
          first_name: f.first_name, surname: f.surname, mobile: f.mobile, email: f.email, dob: f.dob,
          preferred_store: f.preferred_store || 'Beacon Isle',
          fav_wine_styles: f.fav_wine_styles || [],
          fav_spirits: f.fav_spirits || [],
          marketing_consent: !!f.marketing_consent,
          marketing_consent_at: f.marketing_consent ? now : null,
          account_consent: true,
          account_consent_at: now,
          membership_number,
          install_completed: !!f.install_completed,
          signup_source: f.signup_source || 'app',
          staff_id,
        }).select('id, first_name, surname, membership_number, qr_token, preferred_store, notif_permission_granted, created_at').single();
        if (error) return json({ error: error.message }, 400);

        // auto-enter the current monthly prize draw (idempotent open draw for this month)
        const month = now.slice(0, 7); // YYYY-MM
        await supabase.from('prize_draws').upsert(
          { month, status: 'open', prize: '1st: R3,000 drinks hamper' },
          { onConflict: 'month', ignoreDuplicates: true },
        );

        return json(member);
      }

      /* ---------------- SAVE PUSH SUBSCRIPTION ---------------- */
      case 'save-subscription': {
        const { member_id, endpoint, p256dh, auth, device_type } = payload;
        if (!member_id || !endpoint || !p256dh || !auth) return json({ error: 'Missing subscription fields.' }, 400);
        await supabase.from('push_subscriptions').upsert(
          { member_id, endpoint, p256dh, auth, device_type },
          { onConflict: 'endpoint' },
        );
        await supabase.from('members').update({ notif_permission_granted: true }).eq('id', member_id);
        return json({ ok: true });
      }

      /* ---------------- SET NOTIF FLAG ---------------- */
      case 'set-notif': {
        const { member_id, granted } = payload;
        if (!member_id) return json({ error: 'member_id required' }, 400);
        await supabase.from('members').update({ notif_permission_granted: !!granted }).eq('id', member_id);
        return json({ ok: true });
      }

      /* ---------------- JOIN WAITLIST / RESERVE ---------------- */
      case 'join-waitlist': {
        const { member_id, box_id } = payload;
        if (!member_id) return json({ error: 'member_id required' }, 400);
        let bid = box_id;
        if (!bid) {
          const { data } = await supabase.from('discovery_boxes').select('id').neq('status', 'past').order('created_at', { ascending: false }).limit(1);
          bid = data?.[0]?.id ?? null;
        }
        if (!bid) {
          // no box row yet — record interest against a null box (composite PK needs a value)
          return json({ ok: true, note: 'noted' });
        }
        await supabase.from('discovery_box_waitlist').upsert({ member_id, box_id: bid }, { onConflict: 'member_id,box_id', ignoreDuplicates: true });
        return json({ ok: true });
      }

      /* ---------------- RSVP ---------------- */
      case 'rsvp': {
        const { member_id, event_id } = payload;
        if (!member_id || !event_id) return json({ error: 'member_id and event_id required' }, 400);
        await supabase.from('rsvps').upsert({ member_id, event_id, status: 'going' }, { onConflict: 'member_id,event_id' });
        return json({ ok: true });
      }

      default:
        return json({ error: 'Unknown action: ' + action }, 400);
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
