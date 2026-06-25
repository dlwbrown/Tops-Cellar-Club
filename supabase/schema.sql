-- TOPS Cellar Selection Club — database schema (Phase 1)
-- Run in the Supabase SQL editor (or via the CLI) against YOUR project.
-- RLS is enabled; the broadcast/AI/admin work happens in Edge Functions using the
-- service-role key, which bypasses RLS. Member-facing reads use the anon key.

-- ============ MEMBERS ============
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  surname text not null,
  mobile text not null,
  email text not null,
  dob date not null,                         -- enforce 18+ in the app AND a check below
  preferred_store text,
  fav_wine_styles text[] default '{}',
  fav_spirits text[] default '{}',
  marketing_consent boolean default false,
  marketing_consent_at timestamptz,
  account_consent boolean default false,
  account_consent_at timestamptz,
  membership_number text unique,
  qr_token uuid default gen_random_uuid(),
  install_completed boolean default false,
  notif_permission_granted boolean default false,
  signup_source text,                        -- entrance / wine / whisky / checkout / event
  staff_id uuid,                             -- Club Champion attribution
  created_at timestamptz default now(),
  constraint members_age_18 check (dob <= (current_date - interval '18 years'))
);

-- ============ PUSH ============
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_type text,
  created_at timestamptz default now()
);

-- ============ NOTIFICATIONS / IN-APP FEED ============
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  image_url text,
  link text,
  audience jsonb default '{"type":"all"}',   -- {type:'all'} | {type:'store',value} | {type:'taste',value}
  channels text[] default '{push,in_app}',
  sent_by text,
  sent_at timestamptz default now()
);

create table if not exists notification_reads (
  member_id uuid references members(id) on delete cascade,
  notification_id uuid references notifications(id) on delete cascade,
  read_at timestamptz default now(),
  primary key (member_id, notification_id)
);

-- ============ STAFF (CLUB CHAMPION) ============
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  store text,
  active boolean default true
);

-- ============ PRIZE DRAWS ============
create table if not exists prize_draws (
  id uuid primary key default gen_random_uuid(),
  month text not null,                       -- '2026-08'
  status text default 'open',                -- open | drawn
  winner_member_id uuid references members(id),
  prize text,
  drawn_at timestamptz
);

-- ============ SUPPLIERS ============
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tier text default 'featured',              -- featured | discovery_box | premier
  brand_story text,
  logo_url text,
  featured_month text,
  active boolean default true
);

-- ============ CATALOGUE ============
create table if not exists wines (
  id uuid primary key default gen_random_uuid(),
  name text not null, producer text, region text, country text, varietal text,
  story text, food_pairings text, serving_temp text, tasting_notes text,
  awards text, facts text, image_url text, avg_rating numeric default 0,
  created_at timestamptz default now()
);

create table if not exists discovery_boxes (
  id uuid primary key default gen_random_uuid(),
  month text, title text, image_url text, price numeric,
  included jsonb default '[]', availability text,
  status text default 'waitlist',            -- waitlist | live | past
  created_at timestamptz default now()
);

create table if not exists discovery_box_waitlist (
  member_id uuid references members(id) on delete cascade,
  box_id uuid references discovery_boxes(id),
  created_at timestamptz default now(),
  primary key (member_id, box_id)
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  type text, title text, description text, datetime timestamptz,
  location text, capacity int, image_url text,
  status text default 'confirmed',
  ai_generated boolean default false, source_photo_url text
);

create table if not exists rsvps (
  member_id uuid references members(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  status text default 'going',
  primary key (member_id, event_id)
);

create table if not exists specials (
  id uuid primary key default gen_random_uuid(),
  category text, title text, member_price numeric, normal_price numeric,
  image_url text, link text, valid_until date,
  status text default 'draft',               -- draft | approved | published
  ai_generated boolean default false, source_photo_url text,
  created_at timestamptz default now()
);

create table if not exists competitions (
  id uuid primary key default gen_random_uuid(),
  title text, description text, image_url text,
  opens date, closes date, status text default 'draft', winner text
);

create table if not exists magazines (
  id uuid primary key default gen_random_uuid(),
  title text, issue_date date, cover_url text, content_ref text
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  wine_id uuid references wines(id) on delete cascade,
  rating int check (rating between 1 and 5), note text, photo_url text,
  approved boolean default false, created_at timestamptz default now()
);

create table if not exists favourites (
  member_id uuid references members(id) on delete cascade,
  wine_id uuid references wines(id) on delete cascade,
  primary key (member_id, wine_id)
);

create table if not exists tasting_notes (
  member_id uuid references members(id) on delete cascade,
  wine_id uuid references wines(id) on delete cascade,
  note text, created_at timestamptz default now(),
  primary key (member_id, wine_id)
);

-- ============ SETTINGS (feature flags, e.g. Discovery Box mode) ============
create table if not exists settings (
  key text primary key,
  value jsonb
);
insert into settings (key, value) values ('discovery_box_mode', '"waitlist"')
  on conflict (key) do nothing;   -- flip to "live" in September

-- ============ RLS ============
-- Enable RLS on member-data tables. Public catalogue tables can be read with anon.
alter table members enable row level security;
alter table push_subscriptions enable row level security;
alter table reviews enable row level security;
alter table favourites enable row level security;
alter table tasting_notes enable row level security;

-- Public read for catalogue/content (anon key):
alter table wines enable row level security;
alter table discovery_boxes enable row level security;
alter table events enable row level security;
alter table specials enable row level security;
alter table competitions enable row level security;
alter table magazines enable row level security;
alter table suppliers enable row level security;

create policy "public read wines" on wines for select using (true);
create policy "public read boxes" on discovery_boxes for select using (true);
create policy "public read events" on events for select using (true);
create policy "public read specials" on specials for select using (status = 'published');
create policy "public read competitions" on competitions for select using (true);
create policy "public read magazines" on magazines for select using (true);
create policy "public read suppliers" on suppliers for select using (true);
create policy "public read approved reviews" on reviews for select using (approved = true);

-- NOTE: member self-service policies (a member reading/updating only their own row)
-- depend on how you wire auth. If using Supabase Auth, gate on auth.uid().
-- All admin writes, broadcasts, prize draws and AI posting run server-side in
-- Edge Functions with the service-role key and bypass RLS.
