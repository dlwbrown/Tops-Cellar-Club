# CLAUDE CODE — KICKOFF BRIEF: TOPS Cellar Selection Club

You are continuing an existing project. The repo already contains a scaffolded PWA plus the
full spec and approved visual prototypes. Your job is to assemble it into a working,
deployable app. Read `README.md` and `TOPS-Cellar-Club-Build-Prompt.md` first — they are the
source of truth. Do NOT redesign anything; the design is locked.

## What's already in the repo
- `index.html` — empty member app shell (mount point)
- `css/tokens.css` — LOCKED "Hushed Luxury" design system (use these tokens, don't change them)
- `js/config.js` — Supabase URL + anon key already filled in; VAPID public is a placeholder
- `js/app.js` — install-gate detection, registration, push subscribe, `?source=` capture
- `manifest.webmanifest`, `service-worker.js`, `netlify.toml`, `.env.example`
- `supabase/schema.sql` — already run on the project (all Phase 1 tables exist)
- `supabase/functions/send-push/` and `generate-post/` — Edge Function code, not yet deployed
- `cellar-club-prototype.html` — APPROVED member screens (port markup from here)
- `cellar-club-admin-prototype.html` — APPROVED admin screens (port markup from here)

## Design + brand (locked — see build prompt §1A and §11)
- "Hushed Luxury": near-black `#100f12`, antique gold `#c2a25a/#d8bd7e`, wine `#5e1a27`.
  Cormorant Garamond display + Inter body. No TOPS red in-app.
- Member is "Ashley" in the mockups — keep dynamic.

## Build order (do these in sequence)

### 1. Member app — port the prototype into the real app
Lift each screen's markup from `cellar-club-prototype.html` into real views in `index.html`
(or a small view system), styled only with `css/tokens.css`, wired to Supabase via `app.js`:
- Install gate (detect standalone; iOS = instructions, Android = `beforeinstallprompt`)
- Register (enforce 18+, separate marketing consent, capture `?source=`)
- Enable alerts → subscribe to push, save to `push_subscriptions`
- Home, Discovery Box (waitlist mode via `settings.discovery_box_mode`), Wine Library + detail,
  Member Specials, Events + RSVP, Membership Card (QR from `qr_token`), Notifications feed
- Membership is only granted once installed + notifications on (the gate).

### 2. Admin app — build `admin.html` + `js/admin.js`
Port from `cellar-club-admin-prototype.html`. PIN/login gate. Screens: dashboard, Create post
(AI), Broadcast, Prize draw, Staff Champions, Insights, Members, Suppliers. Admin writes go
through Edge Functions (service-role), not the anon client.

### 3. Edge Functions
- Deploy `send-push` and `generate-post`.
- Generate a VAPID keypair (`npx web-push generate-vapid-keys`): put PUBLIC in `js/config.js`,
  PRIVATE + `VAPID_SUBJECT` into `supabase secrets`. Set `ANTHROPIC_API_KEY` secret for
  `generate-post`.
- Wire the admin "Generate post" UI: photo + rough line → `generate-post` → copy returned;
  then cutout + branded-template compositing client-side (canvas/SVG) — do NOT AI-re-render
  the product. Guardrail: never invent a price (show "add price" if missing).
- Wire the Broadcast UI → `send-push` (audience: all / store / taste; channels).

### 4. Security (before go-live)
- The `service_role` key was exposed earlier; rotate/replace it in the Supabase dashboard.
  It must only live in `supabase secrets`, never in the front-end.

### 5. Deploy
- Confirm HTTPS. SPA fallback + service-worker no-cache are already in `netlify.toml`.
- Connect repo to Netlify (publish dir `.`).
- Custom domain via cPanel DNS (CNAME to Netlify; leave MX/email records alone).
- Set Supabase Auth Site URL + allowed origins to the live domain.

### 6. Test, then QR
- On a phone: install → register → enable alerts → fire a test `send-push` → confirm it lands.
- Generate one QR per zone pointing at the live domain with `?source=` (entrance/wine/whisky/
  checkout). Print posters only after the live URL is confirmed.

## Phasing
Build Phase 1 only (above). Magazine reader, My Cellar depth, AI Sommelier, social, supplier
portal, e-commerce are Phase 2/3 — leave stubs, don't build them now.

## Working style
- Keep it simple and dependency-light (vanilla JS, like the existing files), matching how the
  prototypes are written.
- Don't break the locked design tokens. Don't expose secrets client-side.
- After each major step, deploy/preview so it can be tested on a phone.
