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
├─ index.html                 Member PWA — all screens, wired to app.js
├─ admin.html                 Manager admin panel — wired to admin.js
├─ manifest.webmanifest       Installable app config
├─ service-worker.js          Push handling + safe cache
├─ netlify.toml               Deploy config (SW no-cache, SPA fallback)
├─ .env.example               Every key, client vs secret
├─ css/
│  ├─ tokens.css              LOCKED "Hushed Luxury" design system
│  ├─ app.css                 Member screen components (ported from prototype)
│  └─ admin.css               Admin screen components (ported from prototype)
├─ js/
│  ├─ config.js               Public-safe keys (fill in VAPID public)
│  ├─ app.js                  Member: install gate, register, push, router, live data
│  └─ admin.js                Admin: passphrase gate, AI post, broadcast, draw, etc.
├─ icons/                     icon-192/512, maskable-512, badge-72, apple-touch (generated)
└─ supabase/
   ├─ schema.sql              All Phase 1 tables + RLS scaffolding (already run)
   ├─ phase1-extra.sql        RUN THIS TOO — membership-number sequence + upsert constraints
   └─ functions/
      ├─ member-api/          Public, service-role: register, save push sub, RSVP, waitlist
      ├─ admin-api/           Token-gated, service-role: stats, members, draw, staff, suppliers, settings
      ├─ send-push/           Broadcast → Web Push (VAPID), logs to feed  (token-gated)
      └─ generate-post/       Manager photo + note → polished copy (Claude), never invents a price (token-gated)
```

## Status — what's been built
- **Member app** is complete: install gate (iOS instructions / Android `beforeinstallprompt`
  / desktop), registration with hard 18+ gate + separate POPIA marketing consent, push
  subscribe, Home, Discovery Box (waiting-list vs live via the `settings` flag), Wine
  Library + detail, Member Specials, Events + RSVP, real QR Membership Card, Notifications
  feed, re-engagement banner. Catalogue reads fall back to seed content against an empty DB.
- **Admin app** is complete: passphrase sign-in, dashboard, AI "Generate post" with the
  no-invented-price guardrail + client-side branded-template compositing, Broadcast
  composer (audience + channels), Prize Draw, Staff Champions, Insights, Members (+ CSV
  export), Suppliers (tier cycling), Discovery Box mode switch.
- **Security model:** member PII never touches the anon client. All member writes go
  through `member-api`; all admin reads/writes through `admin-api`. The anon key is used
  only for public catalogue reads (RLS public-read policies).

## What you finish at your computer (needs your accounts)
1. Run `supabase/phase1-extra.sql` (after `schema.sql`).
2. Generate VAPID keys → public into `js/config.js`, private into Supabase secrets.
3. Set the `ADMIN_TOKEN` secret (this IS the manager's admin passphrase) and `ANTHROPIC_API_KEY`.
4. Deploy the four Edge Functions.
5. **Rotate the exposed `service_role` key** before real members register (see below).
6. Connect to Netlify, point DNS at it, set Supabase Site URL, deploy.
7. Test on a phone (install → register → enable alerts → fire a test push).
8. Generate per-zone QR codes with `?source=` — last.

---

## Setup steps (run these in order)

### 1. Supabase
- Create a project. Copy the **Project URL**, **anon key**, **service-role key**.
- SQL editor → run `supabase/schema.sql`, then `supabase/phase1-extra.sql`.

### 2. Keys
- VAPID keypair: `npx web-push generate-vapid-keys`
- Put the **public** key in `js/config.js` (`VAPID_PUBLIC_KEY`); keep **private/secret**
  values out of the client. (`SUPABASE_URL` + `SUPABASE_ANON_KEY` are already in `config.js`.)
- Choose a long random **admin passphrase** — this becomes `ADMIN_TOKEN` and is what the
  manager types to sign into `admin.html`. It is never stored in the front end.

### 3. Edge Functions
```
supabase functions deploy member-api      # public (verify_jwt on); service-role inside
supabase functions deploy admin-api        # token-gated
supabase functions deploy send-push        # token-gated
supabase functions deploy generate-post    # token-gated

supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:ashley@duncanbrown.co.za
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set ADMIN_TOKEN=<your-long-random-admin-passphrase>
```
> `member-api` is public (it only performs safe member writes) but still requires the anon
> JWT that the app sends automatically. `admin-api`, `send-push` and `generate-post` reject
> any request without the matching `x-admin-token`.

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
