# TOPS Cellar Selection Club — Project Starter

This is the real codebase foundation for the Cellar Club PWA. It pairs with the full
spec in **TOPS-Cellar-Club-Build-Prompt.md** and the approved visual prototypes.

It is **not yet live** — going live needs your Supabase project, your domain and a deploy,
which you run at your computer (Claude Code is ideal for finishing this). Hand Claude Code
this folder plus the build prompt and work through the steps below.

---

## What's already here

```
cellar-club/
├─ index.html                 Member app shell (PWA)
├─ manifest.webmanifest       Installable app config
├─ service-worker.js          Push handling + safe cache
├─ netlify.toml               Deploy config (SW no-cache, SPA fallback)
├─ .env.example               Every key, client vs secret
├─ css/tokens.css             LOCKED "Hushed Luxury" design system
├─ js/
│  ├─ config.js               Public-safe keys (fill in)
│  └─ app.js                  Install gate, register, push subscribe, source capture
├─ icons/                     (add icon-192/512, maskable, badge-72)
└─ supabase/
   ├─ schema.sql              All Phase 1 tables + RLS scaffolding
   └─ functions/
      ├─ send-push/           Broadcast → Web Push (VAPID), logs to feed
      └─ generate-post/       Manager photo + note → polished copy (Claude), never invents a price
```

## What Claude Code finishes
1. **Port the screens.** Lift the markup from `cellar-club-prototype.html` (member) and
   `cellar-club-admin-prototype.html` (admin) into real views, wired to `app.js` / Supabase.
2. **Build `admin.html` + `js/admin.js`** for the manager tools (create post, broadcast,
   prize draw, staff leaderboard, insights, members, suppliers).
3. Wire the AI "Generate post" UI to the `generate-post` function, and image cutout +
   branded-template compositing (cutout via an image service; template in canvas/SVG).
4. Member self-service RLS policies (if using Supabase Auth).
5. Live deploy + end-to-end test (install → register → receive a real push).

---

## Setup steps (run these in order)

### 1. Supabase
- Create a project. Copy the **Project URL**, **anon key**, **service-role key**.
- SQL editor → run `supabase/schema.sql`.

### 2. Keys
- VAPID keypair: `npx web-push generate-vapid-keys`
- Put **public** values in `js/config.js`; keep **private/secret** values out of the client.

### 3. Edge Functions
```
supabase functions deploy send-push
supabase functions deploy generate-post
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:ashley@duncanbrown.co.za
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

### 4. Domain (cPanel → Netlify)
- Keep DNS at cPanel; **do not switch nameservers** (preserves your email).
- Subdomain route (simplest): `CNAME app → <site>.netlify.app`.
- Apex route: `A @ → Netlify IP` + `CNAME www → <site>.netlify.app`.
- In Supabase Auth, set **Site URL** + allowed origins to the live domain.

### 5. Deploy
- Connect the repo to Netlify (publish dir = `.`). Push to deploy.
- Confirm HTTPS is live (required — no SSL means no service worker means no push).

### 6. Test end-to-end on a phone
- Open the site → Add to Home Screen → open from the icon → register → enable alerts.
- From Supabase, call `send-push` with a test payload → confirm it lands.

### 7. QR codes (LAST)
- Generate one QR per zone pointing at the live domain with a source tag:
  `https://app.cellarclub.co.za/?source=entrance` (and `wine`, `whisky`, `checkout`).
- Print posters only after the live URL is confirmed.

---

## Launch reminders (from the plan)
- **⚠️ SECURITY — before real members register:** the `service_role` key was exposed during
  setup. At your computer, rotate or replace it in the Supabase dashboard
  (Project Settings → API Keys → Legacy API keys → reset `service_role`; or, on the new
  key model, create a fresh **secret key** and ignore the legacy one). It is only used
  server-side in Edge Functions via `supabase secrets` — never in the front-end. Safe to
  defer while the database is empty; must be done before go-live.
- **Pre-September:** Discovery Box runs in **waitlist** mode (`settings.discovery_box_mode`).
  Flip to `live` in September.
- **18+ age gate** is enforced in `app.js` and as a DB check — keep both.
- **POPIA:** marketing consent is separate from account creation and timestamped.
- Targets: 500 members by Aug, 750 Sep, 1,000 Oct.

> Models: the `generate-post` function uses `claude-sonnet-4-6`. Swap to a Haiku model
> for lower per-post cost if quality holds.
