# Tops Cellar Selection — Manager Guide

Everything you need to run the Club from your phone. Sign in to the admin panel with your manager passphrase.

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

## Manage Backend

Add, edit and remove everything members see — no technical knowledge needed. **Dashboard → Manage Backend**:

- **Wines** — name, producer, region, varietal, story, pairing, tasting notes, awards, rating, image. These appear in the member app's Discover list and become favouritable and ratable.
- **Events** — title, date & time, location, capacity, description, image. These show under Events with RSVP.
- **Discovery Boxes** — title, month, price, what's inside (one item per line), availability, status, image.
- **Magazine** — issues members can read (see below).

Tap any item to edit it; tap **+ Add** to create one. Tap **Delete** inside an item to remove it. Changes appear in the member app the next time a member opens it.

## Maintenance — wine database

**Dashboard → Maintenance** is where you keep the wine catalogue in sync with your price list.

### Import a price list (XLS or XLSX)

1. Tap **Choose spreadsheet** and pick your file. It should have the columns **Product Code, Product Description, Size, SOH, SP**.
2. You'll see a **preview**: how many products will be added, how many updated, any duplicate codes, and any rows ignored (missing a code). Nothing is saved yet.
3. Tap **Commit import** to apply it.

Imports **merge** by Product Code: for products already in the catalogue only the **size, stock and price** are updated; new codes are added as new products; and nothing is ever deleted or duplicated. Everything you've curated — **names, images, tasting notes, regions, producer, food pairing, ratings** — is **preserved** across every import, so you can re-import your price list daily without losing your work.

### Export the wine database

Tap **Export wine database (Excel)** to download the full catalogue in the same format. Edit it in Excel and re-import to make bulk changes.

### Enrich a wine

**Maintenance → Wines** (or Manage Backend → Wines) opens the full editor, where each wine can carry Product Code, category, producer, country, region, variety, vintage, size, alcohol %, tasting notes, food pairing, serving temperature, cellaring potential, bottle image, selling & promo price, stock, rating and an Active/Inactive switch. Fields can be filled in over time.

## Managing the Home screen

The member Home screen has three live areas you control:

### Discovery Box (the big hero)

The hero shows the **newest box whose status is not "Past."** To feature this month's box:

1. Go to **Manage Backend → Discovery Boxes**.
2. Edit the current box (or **+ Add** a new one) and set its **Status** to **Waiting list** or **Live**.
3. Set last month's box to **Past** so only the current one shows.

The button wording (priority list vs reserve) is set by **Discovery Box mode** further down.

### This week

The two "This week" cards update **automatically**:

- The first card shows your **current Discovery Box**.
- The second card shows your **next upcoming event**.

So to change what appears here, simply edit your Discovery Box and add/update events in **Manage Backend**. No separate step needed.

### Featured wine

The Home screen automatically features your **highest-rated wine**. To put a specific wine in that spot:

1. Go to **Manage Backend → Wines** and open the wine you want to feature.
2. Set its **Rating** to the highest value (e.g. 4.9 or 5.0) and save.

The top-rated wine is shown as the Featured wine. As members rate wines, the highest-rated one naturally takes the spot.

## Magazine

Give members something to read under **Cellar → Magazine**. In **Manage Backend → Magazine**:

1. Tap **+ Add an issue**.
2. Enter the **issue title** (e.g. "Meet the Winemaker").
3. Set the **issue date** (used for ordering — newest first).
4. Add a **cover image URL** so it looks great in the list.
5. Optionally add a **link to read** (a PDF or web page for the full issue).
6. **Save**. The issue appears in the member app's Magazine tab.

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

**Dashboard → Install QR poster** shows a printable QR code that members scan in store to install the app. **Print** it for signage or **Save image** to use it in other designs.

## Reset test data

Clears all test members, notifications and prize draws (keeps the account you specify). Wines, events, specials, staff and settings are untouched. Use before going live.

---

*Tip: members see your changes the next time they open the app. To tell them right away, send a Broadcast.*
