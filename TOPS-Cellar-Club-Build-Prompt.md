# TOPS CELLAR SELECTION CLUB — BUILD PROMPT

A build brief for an installable Progressive Web App (PWA). Read the whole brief before writing code. Build Phase 1 first; Phases 2 and 3 are scoped but not for the initial release.

---

## 1. WHAT WE'RE BUILDING

A premium, installable web app (PWA) for the TOPS Cellar Selection Club, run out of TOPS at SPAR Beacon Isle with the ambition to scale to a national, multi-store platform.

The app should feel like a luxury wine lifestyle brand — a premium wine magazine, not a retail shopping cart. Design references: Vivino, Apple, MasterClass, Airbnb.

The core purpose is community: wine discovery, education, and exclusive member experiences. The core mechanic is the admin posting content (specials, magazine, events, general info) that pushes a notification to every registered member's phone.

---

## 1A. BRAND, LAUNCH & PLAN CONTEXT

Source: the TOPS Cellar Selection Club Marketing Strategy and Supplier Partnership Proposal. The app must serve this plan, not a generic spec.

### Brand
- This is a **TOPS at SPAR** sub-brand. The parent palette (TOPS red, black, white, gold) is already in every in-store poster and QR zone — the app must not clash with it.
- **Direction (confirmed): Option A — "Hushed Luxury."** The app is the elevated, quiet counterpart to the bold red TOPS in-store signage — a deliberate contrast (premium club vs retail). No TOPS red in-app; the palette is near-black, antique gold and wine. Full tokens in section 11.
- Taglines in use: *"More than a retailer. Your growth partner."* · *"Discover. Savour. Share."* · *"Discover. Experience. Enjoy."*
- Logo lockup: `tops!` at SPAR + "Cellar Selection Club" (script "Club").
- Store / contact: TOPS at SPAR Beacon Isle, Plettenberg Bay, Western Cape · 044 533 5514 · ashley@duncanbrown.co.za.

### Launch timeline (the build serves these dates)
- **June** — branding, supplier presentations, signup landing page, print QR materials.
- **July** — signup campaign + staff competition + social teasers begin.
- **August** — **official Club launch**: registration live, first newsletter, first prize draw, first tasting events, Discovery Box **waiting list** opens.
- **September** — Discovery Box subscriptions open, first box ships.
- Member targets: **500 by Aug, 750 by Sep, 1,000 by Oct.** Discovery Box subscribers: 50 by Oct, 100 by Dec.

### Pre-launch / phased state (IMPORTANT for the build)
Boxes don't ship until September, so at launch the app runs in a **pre-launch mode**:
- Discovery Box screen shows **"Join the Discovery Box priority list"**, not "Reserve my box" / "Order". Capture interest; don't take orders yet.
- An admin switch flips Discovery Box from **waiting-list mode → live ordering** when September lands. Build this as a feature flag, not a code change.

### Multi-zone QR + signup-source tracking
Signup happens from several in-store QR codes — **Entrance, Wine Section, Whisky Section, Checkout** — plus future tasting events. Each QR encodes the same app with a **`?source=` parameter** (e.g. `?source=whisky`). On registration, store the source on the member record so analytics can show **where members signed up**. (See section 9.)

### Staff "Club Champion" competition
Every signup is credited to the cashier/staff member who drove it. The signup flow (or a checkout-zone QR variant) must capture **staff attribution**, and the admin panel needs a **staff leaderboard** with a monthly winner. Prizes are run by the store (R500 voucher / case of beer / restaurant voucher) — the app just tracks counts per staff member per month.

### Monthly member prize draw
Every member is **auto-entered** into the monthly draw on registration — a core signup incentive. Admin needs a **"draw a winner"** tool (random pick from eligible members for the month), winner announcement, and past-winners list. Headline prizes: 1st R3,000 drinks hamper, 2nd case of wine, 3rd R500 TOPS voucher. This is the Competitions module's first real use.

### Supplier partnership tiers
Suppliers join at one of three tiers, which the supplier portal and admin must reflect:
- **Featured Partner** — newsletter + social feature, competition + tasting opportunities, performance report.
- **Discovery Box Partner** — all of the above **+ Discovery Box inclusion + early access + direct sampling**.
- **Premier Partner** — all of the above **+ in-store/shelf visibility + category exclusivity + priority support + detailed reporting**.
Admin assigns a tier per supplier and controls which suppliers are featured each month.

### Email newsletter structure (the Phase-2 magazine mirrors this)
Welcome · Upcoming Events · Featured Wines · Featured Spirits · Member Specials · Competitions · Discovery Box Update · Supplier Spotlight.

### Discovery stats (for supplier-facing/admin copy, not member-facing claims)
70% of purchase decisions are influenced by discovery · 3× more likely to buy after sampling · 75% stick with brands they discover · 15–30% sales lift on featured products.

---

## 2. TECH STACK (FIXED)

- **Front end:** installable PWA — vanilla HTML/CSS/JS or a lightweight framework. Must include a valid web app manifest and service worker.
- **Backend / database / auth:** Supabase.
- **Hosting:** Netlify.
- **Push:** Web Push (VAPID) via a Supabase Edge Function. No native app, no app stores.
- **Email (backup channel):** Supabase Edge Function calling an email provider (e.g. Resend/SendGrid).

This is a PWA only. There is no iOS or Android store build. Do not introduce Capacitor or any native wrapper.

---

## 2A. SETUP & SEQUENCING (READ FIRST)

### Architecture decision (fixed)
- **Domain:** client-owned, registered/managed via cPanel.
- **DNS:** stays at cPanel. Add records pointing the app domain at Netlify — **do not switch nameservers to Netlify** (that would break the client's existing email). Email MX records remain on cPanel, untouched.
- **Hosting:** the app is hosted on **Netlify** (git push-to-deploy, free auto-SSL). cPanel is used only to own the domain and manage DNS — it does not serve the app.
- **Backend:** Supabase, unchanged by the domain choice. Edge Functions (push + email) run on Supabase, not on the host.

### DNS records to add in cPanel
Use a subdomain (simplest, recommended) **or** the apex:
- **Subdomain (e.g. `app.cellarclub.co.za`):** `CNAME` → the Netlify site target (`<site>.netlify.app`).
- **Apex (e.g. `cellarclub.co.za`):** `A` record → Netlify's load-balancer IP, plus `www` `CNAME` → the Netlify site. (Use Netlify's current published values.)
- Leave all existing **MX** and email-related records in place.
- Netlify provisions SSL for the custom domain automatically once DNS resolves.

### Supabase change for the custom domain
- In Supabase Auth settings, set **Site URL** to the live custom domain and add it to **allowed redirect URLs / CORS origins**. This is the only Supabase change the domain requires.

### Split of responsibilities
**Client sets up, separately, before the build deploys:**
- Supabase project (provides `SUPABASE_URL`, anon key, service-role key).
- Netlify site connected to the repo.
- App domain in cPanel + DNS records above pointing at Netlify.
- Accounts hold member PII, billing and secret keys, so they cannot be created inside the build.

**The build delivers (run/deployed against the client's projects):**
- App code, web app manifest, service worker.
- Supabase SQL schema / migrations (section 7).
- Edge Functions: push send (Web Push/VAPID) and email backup.
- VAPID keypair generation step (public key → client, private key → Edge Function secret).
- `netlify.toml` deploy config and environment-variable list.
- A README with exact step-by-step setup and deploy instructions.

### Build order
1. Client creates Supabase project (URL + keys).
2. Client adds the app domain in cPanel and points DNS at Netlify.
3. Set Supabase Site URL + allowed origins to the custom domain.
4. Build: run schema, deploy Edge Functions, set VAPID + email keys, deploy app to Netlify.
5. Confirm the live custom-domain URL works end-to-end (install, register, receive a test push).
6. Generate the QR codes pointing at the custom domain → print in-store posters. **Produce one QR per zone with a `?source=` tag** (entrance/wine/whisky/checkout) plus event-specific codes as needed, so signups are attributed by location and staff.

The QR is the **last** asset produced. It only encodes the final live URL.

### Fallback: self-hosting on cPanel (only if Netlify is ever dropped)
A PWA is static files, so it can run from cPanel `public_html`, but these are mandatory or the app silently fails:
- **AutoSSL / Let's Encrypt must be active** on the domain — service workers and push require HTTPS; no SSL = no push = broken app.
- **`.htaccess` cache rule** to stop `service-worker.js` and `manifest` being cached, or members get stuck on stale versions and never receive updates.
- Trade-off: manual file-upload deploys, no git push-to-deploy, no rollback. Not recommended for an app iterated on weekly.

---

## 3. THE NON-NEGOTIABLE ONBOARDING GATE — BUILD THIS CAREFULLY

Membership is only granted once the member is running the app as an installed Home Screen app **with notifications enabled**. This is the single most important behaviour in the app. Notifications are the product; if a member never installs, they never get value, so they don't get a membership card.

### Why it must be built as a gate, not a forced install
iOS Safari has **no install API** — you cannot trigger "Add to Home Screen" from code. So enforcement is: detect install + notification state, and **withhold the membership card and member benefits until both are true.** A user who refuses simply doesn't complete membership.

### Required onboarding flow (entered via the in-store QR code)

1. **QR scan** opens the app in the mobile browser.
2. **Detect platform and display mode** on load:
   - iOS vs Android vs desktop.
   - Standalone (installed) vs browser tab — use the `display-mode: standalone` media query and `navigator.standalone`.
3. **If NOT installed**, show a blocking, branded onboarding screen — the user cannot proceed to registration from here:
   - **iOS:** clear visual instructions — tap the Share icon → "Add to Home Screen" → open the app from the new icon. Show the actual iOS share glyph and step images.
   - **Android:** fire the `beforeinstallprompt` event and present a single "Install the Cellar Club" button that triggers the native install prompt.
   - Copy should sell it, not apologise: *"The Cellar Club lives on your Home Screen — install to unlock your membership card, Discovery Box alerts and member-only specials."*
4. **User installs and re-opens from the Home Screen icon.** App now detects standalone mode → unlocks the registration screen.
5. **Registration** (fields in section 4).
6. **Request notification permission** — must be triggered by a user tap ("Enable my member alerts"), and on iOS this only works from the installed app. Subscribe to push and save the subscription to Supabase.
7. **Only when installed AND notification permission granted AND push subscription saved** → mark membership active, generate membership number + QR card, land on Home.

### Ongoing enforcement
- On every launch, re-check standalone mode and notification permission.
- If a member later disables notifications or somehow opens outside the installed app, show a soft re-engagement screen prompting them to re-enable, and flag `notif_permission_granted = false` on their record.
- Admin analytics must show how many members are fully enabled vs lapsed.

### Honest fallback (build it, don't surface it as the main path)
Because push can silently lapse, **email is the backup channel** for must-land messages (box ready, birthday, event tonight). Every member also has an **in-app notification feed** so nothing is ever lost even if a push fails.

---

## 3A. ONBOARDING SCREEN COPY (USE VERBATIM)

Microcopy for the install-gate screens shown right after the QR scan. Tone: premium, warm, never apologetic — the install is a privilege, not a hurdle.

**Both platforms — top of the gate screen**
> **Welcome to the Cellar Selection Club**
> Add the club to your Home Screen to unlock your membership card, Discovery Box alerts and member-only specials.

**iOS install steps (show with the real share glyph + images)**
> 1. Tap the **Share** icon below.
> 2. Choose **Add to Home Screen**.
> 3. Open the **Cellar Club** from your Home Screen to continue.

**Android**
> Tap **Install the Cellar Club** to add it to your phone, then open it to continue.
> *(Button triggers the native install prompt via `beforeinstallprompt`.)*

**Notification permission prompt (after registration, on user tap)**
> **One last thing — switch on your alerts.**
> We'll let you know the moment your Discovery Box is ready, when new member specials drop, and when tasting tickets go live.
> [ Enable my member alerts ]

**Re-engagement (notifications later disabled)**
> **Your alerts are off.** Turn them back on so you don't miss your Discovery Box collection, events and member-only pricing.
> [ Re-enable alerts ]

---

## 4. REGISTRATION — DATA CAPTURED

- First Name
- Surname
- Mobile Number
- Email Address
- Date of Birth *(used as a hard age gate — see compliance)*
- Preferred Store
- Favourite Wine Styles (multi-select)
- Favourite Spirits (multi-select)
- Marketing consent (separate, explicit checkbox — see compliance)
- Notification permission (handled via the OS prompt, recorded against the member)
- **Signup source** — read silently from the QR `?source=` parameter (entrance / wine / whisky / checkout / event-name); not a user field.
- **Staff attribution** — the cashier/staff member who drove the signup (captured at the checkout zone or via a staff code); powers the Club Champion leaderboard.

On completion the member becomes a **Cellar Selection Club Member** with a unique membership number and QR membership card, and is **auto-entered into the current monthly prize draw**.

---

## 5. COMPLIANCE — NOT OPTIONAL

- **Age gate (18+):** the DOB field must reject anyone under 18. A liquor-marketing app may not onboard minors. Block, don't just warn.
- **POPIA:** record explicit, timestamped consent for (a) account creation and (b) marketing/notifications, kept **separate**. Marketing consent must not be a condition of having an account.
- **Opt-out:** every member can turn off notifications and marketing email from a settings screen at any time. Email must carry an unsubscribe link.
- **Data:** store consent flags and timestamps on the member record.

---

## 6. ADMIN PANEL + BROADCAST (PHASE 1 CORE)

A secure, role-gated admin dashboard (separate login, not exposed to members).

### Content management
- **Primary, must-be-effortless path: posting a special with a photo — see section 6A (simple posting + AI post generator).** The admin is a manager with limited tech skills; this flow is the priority.
- Post and edit: Discovery Boxes, Wines, Events, Member Specials, Competitions, Magazine, and free-form general notices/announcements.
- Upload images for all of the above.
- Approve member reviews.
- Manage the member database; export member list (CSV).
- View analytics (section 9).

### Launch-plan controls (from section 1A)
- **Discovery Box mode flag** — flip between *waiting-list* (pre-September) and *live ordering*.
- **Staff "Club Champion" leaderboard** — signups credited per staff member per month, with a monthly winner. Manage staff list/codes.
- **Monthly prize draw** — every member auto-entered; admin runs a random "draw a winner," posts the announcement, and keeps a past-winners list.
- **Supplier tiers** — assign each supplier a tier (Featured / Discovery Box / Premier) and set which suppliers are featured this month.

### Broadcast composer — the headline admin feature
A "Send Notification" screen the admin uses to push **anything** — a special, a new magazine, a price drop, a general notice — to members' phones.

Fields:
- **Title** and **body**.
- **Optional image.**
- **Optional deep link** — tapping the notification opens the relevant in-app screen (e.g. the special, the box, the event).
- **Audience targeting:**
  - All members
  - By preferred store
  - By favourite wine style / spirit
- **Channel toggle:** Push / Email / In-app only (or combination).

### How the send works (build note)
- Member push subscriptions are stored in a `push_subscriptions` table.
- A **Supabase Edge Function** signs and sends each message via the Web Push protocol using VAPID keys. **The front end cannot send push securely — it must go server-side.**
- Every broadcast is written to a `notifications` table so it also appears in each targeted member's in-app feed, and logged for analytics.

---

## 6A. SIMPLE POSTING + AI POST GENERATOR (PHASE 1 CORE)

The admin will mostly be a store manager with **limited tech skills**. The day-to-day job is posting a special with an image. That path must be effortless; everything else in the admin can be secondary.

### Design rules for the admin
- One primary screen: **create a post**. No markdown, no jargon, no settings exposed.
- Pick a **post type** (Member Special / New Arrival / Event / Competition / Discovery Box) — this selects the right branded template automatically.
- Inputs: **a photo** (snap or upload) and, optionally, **one rough line of text**. Nothing else is required.
- Everything is a draft until the manager taps approve. Nothing reaches members by accident.

### The "Generate post" button (the AI element)
On tap, a **Supabase Edge Function** does two things:

1. **Copy (LLM, vision-capable — e.g. Claude via the Anthropic API):** reads the photo and/or the manager's rough line and returns a polished **headline + body + price callout** in the club's voice. Key guardrails:
   - **Never invents a price or product claim.** It uses the price the manager typed or one legibly visible in the photo; if neither, it returns the post with a "⚠ add price" flag rather than guessing.
   - No health claims; tone stays on-brand and age-appropriate (liquor).
2. **Image (template compositing — NOT generative re-rendering):** cleanly cuts the product out of the messy phone background and places it on a **branded TOPS card** (logo, black/gold/red frame per the agreed design language, price badge, post-type ribbon). Optional light tidy-up (crop/levels) that does **not** alter the product itself.
   - **Do not** use AI to re-render or restyle the actual bottle/label — it misrepresents branded product. Cutout + template only.

### Approve and deploy
- The manager sees the finished card + copy **exactly as members will**, and can edit any text inline.
- **Approve & send** → choose channel (Push / In-app / Email / Web) → publishes via the broadcast engine in section 6.
- Posts carry a status: `draft → approved → published`, an `ai_generated` flag, and the original `source_photo_url` for audit.

### Build notes
- The generator produces a draft record that flows into the existing specials/events/competitions + notifications tables (add `status`, `ai_generated`, `source_photo_url` fields), so there is no separate publishing path to maintain.
- Each generation is one Edge Function call (small per-call AI cost) — fine at store volume; no key is ever exposed client-side.
- Keep a small library of **branded templates** so output is consistent regardless of who posts.

---

## 7. DATA MODEL (STARTING SKELETON)

- **members** — id, first_name, surname, mobile, email, dob, preferred_store, fav_wine_styles, fav_spirits, marketing_consent (+timestamp), account_consent (+timestamp), membership_number, qr_token, install_completed, notif_permission_granted, **signup_source**, **staff_id**, created_at
- **push_subscriptions** — member_id, endpoint, p256dh, auth, device_type, created_at
- **notifications** — id, title, body, image_url, link, audience (json), channels, sent_by, sent_at
- **notification_reads** — member_id, notification_id, read_at
- **staff** — id, name, code, store, active *(Club Champion attribution)*
- **prize_draws** — id, month, status, winner_member_id, prize, drawn_at *(members auto-entered by signup month)*
- **suppliers** — id, name, tier (featured/discovery_box/premier), brand_story, logo_url, featured_month, active
- **discovery_box_waitlist** — member_id, box_id (nullable), created_at *(pre-September interest capture)*
- **settings** — key, value *(holds the Discovery Box waiting-list vs live-ordering flag)*
- **wines** — id, name, producer, region, country, varietal, story, food_pairings, serving_temp, tasting_notes, awards, facts, image_url, avg_rating
- **discovery_boxes** — id, month, title, image_url, price, included (json), availability, status
- **events** — id, type, title, description, datetime, location, capacity, image_url
- **rsvps** — member_id, event_id, status
- **specials** — id, category, title, member_price, normal_price, image_url, link, valid_until
- **competitions** — id, title, description, image_url, opens, closes, status, winner
- **magazines** — id, title, issue_date, cover_url, content_ref
- **reviews** — id, member_id, wine_id, rating, note, photo_url, approved
- **favourites** — member_id, wine_id
- **tasting_notes** — member_id, wine_id, note, created_at

---

## 8. FEATURE SET BY PHASE

### PHASE 1 — LAUNCHABLE CLUB APP (build this now)
- Forced-install onboarding gate (section 3)
- Registration + age gate + consent (sections 4–5)
- Digital Membership Card — unique QR code + membership number, scannable in store
- Home dashboard — "Welcome back / Good evening [Name]", hero banner, current Discovery Box, upcoming event, featured wine, quick actions, notifications feed
- Discovery Box — current month (image, price, what's included). **At launch: "Join the Discovery Box priority list" (waiting-list mode); flips to "Reserve / Collect In Store" via admin flag in September.** View previous boxes.
- Wine Library — per-wine page: bottle image, story, region, producer, food pairings, serving temperature, tasting notes, awards, facts, customer rating, favourite button
- Member Specials — member-only pricing across Wine, Whisky, Gin, Rum, Brandy, Tequila, Craft Beer; clickable; save offer
- Events — calendar/list, RSVP, add to calendar, directions
- Monthly prize draw — auto-entry on signup; winner announcement screen
- In-app notifications feed
- Admin panel + broadcast composer, launch-plan controls, staff Club Champion leaderboard (section 6)

### PHASE 2
- Digital Magazine — swipeable pages, embedded video; sections: Welcome, Wine Pages, Meet the Winemaker, Events, Member Specials, Cocktail Recipes, Duncan's Picks, Member Experiences, Vote for Your Favourite
- My Cellar — rate wines, tasting notes, favourites, track previous boxes, wish list, personal journal
- Discovery Calendar — magazine release, box release, collection dates, tastings, competitions, supplier events
- Competitions — enter, winner announcements, past winners
- Discover — browse/filter by country, region, varietal, producer, price, occasion, food pairing, sweetness, body
- In-app QR scanner — scan bottles/shelf-talkers/posters to unlock videos, pairings, interviews, recipes, content

### PHASE 3
- AI Wine Assistant (Sommelier) — natural-language pairing/recommendations, via a Supabase Edge Function proxying an LLM so the API key is never exposed client-side
- Personalisation engine — recommendations from purchases, ratings, favourite varietals/producers, past boxes
- Social community — photos, comments, likes, follow wineries
- Supplier content portals — brand story, videos, gallery, events, competitions, releases
- E-commerce / online ordering, subscription billing, loyalty points, digital gift cards, referral rewards, Apple Pay / Google Pay, AR bottle scanning, winemaker live streams, in-app chat

---

## 9. ANALYTICS (ADMIN)

Track: installs/registrations, members fully enabled vs lapsed (install + notifications), active users, **signups by QR zone** (entrance/wine/whisky/checkout/event), **signups per staff member (Club Champion leaderboard)**, **progress vs member targets (500/750/1,000)**, waiting-list size, Discovery Box reservations, magazine reads, wine ratings, favourite wines, competition/prize-draw entries, event attendance, and **push delivery + open rates per broadcast.** Email engagement targets to surface: open rate >30%, click rate >10%.

---

## 10. NOTIFICATION TYPES TO SUPPORT

Box ready for collection · magazine now available · new member specials · tasting tickets available · reminder about tonight's event · competition closes tomorrow · Happy Birthday · exclusive weekend offers · new wines added.

(Birthday and box-ready should also fire via email as backup.)

---

## 11. DESIGN SYSTEM — "HUSHED LUXURY" (LOCKED)

Confirmed direction: **Option A — Hushed Luxury.** Premium wine-magazine feel, no TOPS red in-app (the in-store signage stays red by intention; the app is the elevated, quiet counterpart). Build every screen from these tokens.

### Colour
- Background: `#100f12` (near-black)
- Surface / cards: `#1a1a1e`
- Paper / primary text: `#f7f4ee`
- Muted text: `#8a857c`
- Gold: `#c2a25a` · Gold bright (accents/CTA): `#d8bd7e`
- Wine accent: `#5e1a27`, deepening to `#3d121b` / `#240a10` (hero gradients, detailing)
- Hairlines/dividers: `rgba(194,162,90,.26)`

### Type
- Display / headings: **Cormorant Garamond** (600; italics for emphasis, e.g. the member's name in gold).
- Body / UI: **Inter** (400–600).
- Labels/eyebrows: Inter, uppercase, letter-spaced, gold.

### Components
- Primary button: gold gradient `#d8bd7e → #c2a25a`, dark text `#241a08`, pill radius.
- Hero: wine gradient with a faint diagonal texture and gold hairline border; serif headline; gold price.
- Cards: dark surface, subtle light border, generous spacing.
- Bottom nav: blurred dark bar, gold-bright active state.

### Overall
- Minimalist, elegant, large imagery, beautiful photography, magazine-quality typography, restrained motion.
- Must look and behave like a real app once installed: full-screen standalone, custom splash, themed (dark) status bar, app icon.
- The Home Screen preview (`cellar-club-home-compare.html`, Option A) is the reference implementation.

> AI-generated manager posts (section 6A) use this same palette and templates, so all in-app content stays consistent.

---

## 12. OUT OF SCOPE FOR NOW

No native app, no app stores, no Capacitor. No payment processing in Phase 1 (reservations are "collect in store"). Online ordering and billing are Phase 3.
