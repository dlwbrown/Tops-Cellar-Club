# TOPS Cellar Selection Club — Admin Guide

The manager panel runs at **topscellarclub.co.za/admin.html**. Sign in with your manager passphrase.

## One-time setup (Netlify environment variables)

The app's secure features run on Netlify Functions. They need three environment variables set in **Netlify → Site configuration → Environment variables**. After adding or changing any of them, you must **trigger a new deploy** (Netlify → Deploys → Trigger deploy) — variables only take effect on a fresh deploy.

- **ANTHROPIC_API_KEY** — your Anthropic API key. Powers the AI Sommelier and the AI "Generate post" copywriting.
- **SUPABASE_SERVICE_ROLE_KEY** — from Supabase → Settings → API → reveal `service_role`. Powers favourites, ratings, RSVP, the Cellar, and the catalogue manager. Keep it secret.
- **ADMIN_TOKEN** — your admin passphrase (the one you sign in with). Authorises the admin tools (catalogue manager and AI Generate post).

## Dashboard

Your home base: key stats (members, waiting list, push open rate, prize entrants) and quick links to every tool.

## Create a post (with AI)

1. Tap **Create a post**.
2. Choose the post type (Member Special, New Arrival, Event, Competition, Box).
3. Optionally add a photo — you can **choose from your library or take one**.
4. Type a rough line (e.g. "nederburg heritage R89.99 fri–sun"). Including the price is best — the AI never guesses one.
5. Tap **Generate post**. The AI writes a polished headline, kicker and body.
6. Review and edit the copy. **Price is optional** — leave it blank and no price badge shows.
7. Use the **Include a picture** toggle to show or hide the bottle/photo (turn off for a clean text-only poster).
8. Tap **Save card** to download the designed poster, or **Approve & send** to publish and broadcast it.

## Manage catalogue

Add, edit and remove content without touching the database. **Dashboard → Manage catalogue**:

- **Wines** — name, producer, region, varietal, story, pairing, tasting notes, awards, rating, image. These appear in the member app's Discover list and become favouritable/ratable.
- **Events** — title, date & time, location, capacity, description, image. These show under Events with RSVP.
- **Discovery Boxes** — title, month, price, what's inside (one item per line), availability, status, image.

Tap any item to edit it; tap **+ Add** to create one. Changes appear in the member app the next time a member opens it.

### How the Discovery Box reaches the main screen

The member home screen shows the **newest box whose status is not "Past"**. To feature this month's box, edit it (or add a new one) and set its status to **Waiting list** or **Live**. Set last month's box to **Past** so only the current one shows. The button wording (priority list vs reserve) is controlled by **Discovery Box mode** below.

## Broadcast

**Send a broadcast** pushes a notification to members. Set a title, message, optional image and deep link, choose the audience (all / by store / by taste) and channels (push / in-app / email), and send.

## Prize draw

Run the **monthly prize draw**. Every signup is auto-entered. Draw or re-draw a winner; past winners are listed.

## Staff Champions

Track signups by team member. Add staff with a signup code; the month's top performer wins the voucher.

## Suppliers

Manage partner suppliers and cycle their tier (Featured / Box / Premier).

## Insights

Membership progress vs target, signups by store zone, push/email open rates, and waiting-list numbers. Export the member list as CSV.

## Members

Search and browse all members.

## Discovery Box mode

Switch the member-facing Discovery Box between **Waiting list** (pre-September: "Join the priority list") and **Live ordering** ("Reserve — collect in store").

## Install QR poster

**Dashboard → Install QR poster** shows a printable QR code that members scan in store to install the app. Print it or save the image for signage.

## Reset test data

Clears all test members, notifications and prize draws (keeps the account you specify). Wines, events, specials, staff and settings are untouched. Use before going live.

---

*Tip: after any change to environment variables, always trigger a fresh Netlify deploy.*
