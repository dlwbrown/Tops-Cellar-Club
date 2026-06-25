// supabase/functions/send-push/index.ts
// Sends a broadcast as Web Push to targeted members, and logs it to `notifications`
// (so it also appears in the in-app feed). Runs server-side with the service-role key.
//
// Secrets to set:
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:ashley@duncanbrown.co.za
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// Body: { title, body, image?, link?, audience?: {type:'all'|'store'|'taste', value?}, channels?: string[], sent_by? }

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { title, body, image, link, audience = { type: 'all' }, channels = ['push', 'in_app'], sent_by } =
      await req.json();
    if (!title) return json({ error: 'title required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1) log to notifications (powers in-app feed + analytics)
    const { data: note } = await supabase
      .from('notifications')
      .insert({ title, body, image_url: image, link, audience, channels, sent_by })
      .select()
      .single();

    let pushed = 0;
    if (channels.includes('push')) {
      webpush.setVapidDetails(
        Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com',
        Deno.env.get('VAPID_PUBLIC_KEY')!,
        Deno.env.get('VAPID_PRIVATE_KEY')!
      );

      // 2) resolve audience -> member ids
      let memberIds: string[] | null = null;
      if (audience.type === 'store') {
        const { data } = await supabase.from('members').select('id').eq('preferred_store', audience.value);
        memberIds = (data ?? []).map((m) => m.id);
      } else if (audience.type === 'taste') {
        const { data } = await supabase.from('members').select('id').contains('fav_wine_styles', [audience.value]);
        memberIds = (data ?? []).map((m) => m.id);
      } // 'all' -> null (no filter)

      // 3) fetch subscriptions
      let q = supabase.from('push_subscriptions').select('endpoint, p256dh, auth, member_id');
      if (memberIds) q = q.in('member_id', memberIds);
      const { data: subs } = await q;

      const payload = JSON.stringify({ title, body, image, link });
      await Promise.all(
        (subs ?? []).map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload
            );
            pushed++;
          } catch (err: any) {
            // 404/410 => stale subscription, clean it up
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
            }
          }
        })
      );
    }

    // TODO: if channels.includes('email') -> call your email Edge Function here.

    return json({ ok: true, notification_id: note?.id, pushed });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
