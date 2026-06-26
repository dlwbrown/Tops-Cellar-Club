# TOPS Cellar Selection Club — Go-Live Guide

A step-by-step checklist to take the app from this repo to a live, installable PWA that
sends push notifications. Do the parts **in order** — later steps depend on earlier ones.

Your Supabase project (already in `js/config.js`): `https://wwwrrtmuisdgkkwxyjdo.supabase.co`
Project ref (the bit before `.supabase.co`): **`wwwrrtmuisdgkkwxyjdo`**

---

## Part 0 — What you need before you start
- [ ] A **Supabase** account (the project above already exists).
- [ ] A **Netlify** account (free tier is fine).
- [ ] Login access to your **cPanel** (for the domain's DNS).
- [ ] A computer with **Node.js** installed — get it from https://nodejs.org (the "LTS" button).
- [ ] An **Anthropic API key** — from https://console.anthropic.com → API Keys (for the AI "Generate post" feature). You add a little credit; each post costs a fraction of a cent.

Estimated time: ~60–90 minutes the first time, mostly waiting on DNS/SSL.

---

## Part 1 — Get the finished code onto your live branch
The app was built on the branch `claude/new-session-9jbjna`. Netlify deploys from one
branch (usually `main`), so merge the work in first.

**Easiest (GitHub website):**
1. Go to your repo on GitHub → you'll see a banner for the `claude/new-session-9jbjna` branch → **Compare & pull request**.
2. Create the pull request, then **Merge** it into `main`.

(If you'd rather, ask Claude Code to open the PR for you.)

---

## Part 2 — Finish the database (Supabase SQL)
1. Supabase dashboard → your project → **SQL Editor** (left sidebar).
2. If you haven't already: open `supabase/schema.sql` from the repo, copy all of it, paste, click **Run**.
3. Open `supabase/phase1-extra.sql`, copy all of it, paste into a new query, click **Run**.
   *(This adds the membership-number sequence and a couple of constraints the app needs.)*
4. Check **Table Editor** — you should see `members`, `push_subscriptions`, `notifications`, `staff`, `suppliers`, etc.

---

## Part 3 — Generate your keys & passphrase
On your computer, open a terminal (Mac: Terminal app · Windows: "Command Prompt" or "PowerShell").

### 3a. VAPID keys (these make push work)
```
npx web-push generate-vapid-keys
```
It prints a **Public Key** and a **Private Key**. Keep this window open — you'll need both.

### 3b. Put the PUBLIC key in the app
1. Open `js/config.js` in the repo.
2. Replace `'YOUR-VAPID-PUBLIC-KEY'` with your **Public Key** (keep the quotes).
3. Commit & push that change (so Netlify will pick it up). The PRIVATE key never goes here.

### 3c. Pick your admin passphrase
Choose a long, random passphrase (e.g. from a password manager). This is **`ADMIN_TOKEN`** —
it's literally what you'll type to sign into `admin.html`. Write it down somewhere safe.

---

## Part 4 — Add the secret keys to Supabase
These are the SERVER-side secrets. They live only in Supabase, never in the app.

**In the dashboard:** Project → **Edge Functions** (left sidebar) → **Manage secrets** →
**Add new secret**, one at a time:

| Name | Value |
|------|-------|
| `VAPID_PUBLIC_KEY` | your VAPID **public** key |
| `VAPID_PRIVATE_KEY` | your VAPID **private** key |
| `VAPID_SUBJECT` | `mailto:ashley@duncanbrown.co.za` |
| `ANTHROPIC_API_KEY` | your Anthropic key (starts `sk-ant-`) |
| `ADMIN_TOKEN` | the admin passphrase you chose in 3c |

*(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are added automatically — don't add them.)*

---

## Part 5 — Deploy the four Edge Functions
There are four: `member-api`, `admin-api`, `send-push`, `generate-post`.

### Option A — Supabase CLI (recommended)
In your terminal, from inside the project folder:
```
npm install -g supabase
supabase login                       # opens your browser to authorise
supabase link --project-ref wwwrrtmuisdgkkwxyjdo
supabase functions deploy member-api
supabase functions deploy admin-api
supabase functions deploy send-push
supabase functions deploy generate-post
```

### Option B — No CLI (paste in the dashboard)
For each of the four functions:
1. Dashboard → **Edge Functions** → **Create a function** → name it exactly (e.g. `member-api`).
2. Open the matching `supabase/functions/<name>/index.ts` from the repo, copy everything,
   paste it over the sample code, click **Deploy**.
3. Repeat for the other three.

---

## Part 6 — SECURITY: rotate the exposed service-role key
The `service_role` key was exposed earlier in setup. Before real members register:
1. Dashboard → **Project Settings** → **API** (or **API Keys**).
2. Under **service_role** (Legacy keys: **reset**; new key model: **create a new secret key**).
3. You don't paste it anywhere — Supabase injects it into the functions automatically. This
   just invalidates the old one. Safe to do now while the database is empty.

---

## Part 7 — Deploy the app to Netlify
1. Netlify → **Add new site** → **Import an existing project** → **GitHub** → pick this repo.
2. Settings:
   - **Branch to deploy:** `main`
   - **Build command:** *(leave blank)*
   - **Publish directory:** `.` (a single dot)
3. Click **Deploy**. After a minute you get a URL like `https://random-name-123.netlify.app`.
4. Open it on your computer — you should see the install gate. ✅ The app is live (on the Netlify URL).

*(The `netlify.toml` in the repo already handles HTTPS, the SPA fallback, and stops the
service worker being cached — you don't configure those.)*

---

## Part 8 — Your custom domain (cPanel DNS → Netlify)
Use a subdomain like `app.cellarclub.co.za` (simplest, recommended).

1. Netlify → your site → **Domain settings** → **Add a domain** → type `app.cellarclub.co.za` → follow the prompts. Netlify shows you a target like `your-site.netlify.app`.
2. cPanel → **Zone Editor** (or "DNS Records") for your domain → **Add Record**:
   - **Type:** `CNAME`
   - **Name:** `app`
   - **Value / Points to:** `your-site.netlify.app` (the target Netlify gave you)
3. **Leave every other record alone** — especially `MX` and mail records, so your email keeps working. Do **not** change nameservers.
4. Wait. DNS takes 15 min–2 hrs. Netlify then auto-issues an SSL certificate — you'll see "HTTPS enabled" in Domain settings. **Don't go further until HTTPS is on** — push needs it.

---

## Part 9 — (Optional) Supabase Auth Site URL
This app identifies members by device, not Supabase passwords, so there's nothing to set
here for launch. If you later add member email/password login, set **Authentication →
URL Configuration → Site URL** to your live domain. Skip for now.

---

## Part 10 — Test end-to-end on a real phone
1. On your phone, open `https://app.cellarclub.co.za/?source=entrance`.
2. Follow the install gate (iPhone: Share → Add to Home Screen · Android: the Install button).
3. Open the app **from the Home Screen icon**, register, and tap **Enable my member alerts** (allow notifications).
4. On a computer, open `https://app.cellarclub.co.za/admin.html`, sign in with your admin
   passphrase, go to **Broadcast**, send a test message to **All members**.
5. The notification should land on your phone, and appear in the app's Notifications feed. 🎉

If it doesn't arrive: confirm HTTPS is on, the VAPID public key in `config.js` matches the
one in Supabase secrets, and that you opened the app from the installed icon (not a browser tab).

---

## Part 11 — QR codes (do this LAST)
Only once the live URL works end-to-end. Make one QR per zone, each with a `?source=` tag so
you can see where members sign up:

- Entrance → `https://app.cellarclub.co.za/?source=entrance`
- Wine section → `https://app.cellarclub.co.za/?source=wine`
- Whisky section → `https://app.cellarclub.co.za/?source=whisky`
- Checkout → `https://app.cellarclub.co.za/?source=checkout`

For staff attribution (Club Champion), add a staff code too, e.g.
`https://app.cellarclub.co.za/?source=checkout&staff=THANDI` (add the staff member and the
code `THANDI` first in **Admin → Staff Champions**).

Use any free QR generator, then print the posters.

---

## Quick reference — where each key lives
| Key | Lives in | Public? |
|-----|----------|---------|
| Supabase URL + anon key | `js/config.js` | ✅ safe to expose |
| VAPID **public** key | `js/config.js` + Supabase secret | ✅ |
| VAPID **private** key | Supabase secret only | ❌ never in the app |
| `ANTHROPIC_API_KEY` | Supabase secret only | ❌ |
| `ADMIN_TOKEN` (admin passphrase) | Supabase secret only; you type it to log in | ❌ |
| `service_role` key | Auto-injected into functions | ❌ |

## To change things after launch
- **Open Discovery Box ordering in September:** Admin → *Discovery Box mode* → Live ordering → Save.
- **Send any notification:** Admin → Broadcast.
- **Post a special with AI:** Admin → Create a post.
- **Edit content/code:** push to `main` → Netlify redeploys automatically.
