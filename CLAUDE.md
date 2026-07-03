# Tops Cellar Selection — project notes for Claude

## ⚠️ ALWAYS keep the in-app guides in sync
Whenever you change, add, or remove a feature, you MUST update the matching guide(s)
so they always reflect the live app:
- **`USER-GUIDE.md`** — member-facing. Shown in the member app at Home → User guide.
- **`ADMIN-GUIDE.md`** — manager-facing. Shown in the admin panel at Dashboard → Admin guide.

These markdown files are fetched and rendered in-app (`mdToHtml` in `js/app.js` and
`js/admin.js`). Treat updating them as part of "done" for any feature change — not optional.

## Architecture
- Vanilla-JS PWA. Member app = `index.html` + `js/app.js` + `css/app.css`.
  Admin = `admin.html` + `js/admin.js` + `css/admin.css`. Shared tokens in
  `css/tokens.css` (**LOCKED — never edit**).
- Backend: Supabase (Postgres + RLS). Secure writes go through **Netlify Functions**
  in `netlify/functions/` (auto-deploy on push) — we use these instead of Supabase
  Edge Functions because the Supabase functions can't be deployed from this setup.
- Hosting: Netlify, production branch auto-deploys. Custom domain: topscellarclub.co.za.

## Netlify Functions (the real backend)
- `ask-sommelier.js` — AI Sommelier (needs `ANTHROPIC_API_KEY`).
- `member.js` — favourites, ratings, RSVP, get-cellar, save-subscription
  (needs `SUPABASE_SERVICE_ROLE_KEY`).
- `admin-content.js` — wines/events/Discovery Boxes CRUD
  (needs `SUPABASE_SERVICE_ROLE_KEY` + `ADMIN_TOKEN`).
- `generate-post.js` — AI post copywriting (needs `ANTHROPIC_API_KEY` + `ADMIN_TOKEN`).

## Required Netlify environment variables
`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_TOKEN`.
Env-var changes only take effect after a new deploy.

## Security rules
- NEVER put the service-role key, VAPID private key, or admin token in client code.
- Member PII writes go through Netlify Functions (service-role), never the anon client.
- `css/tokens.css` is locked — do not modify design tokens.
