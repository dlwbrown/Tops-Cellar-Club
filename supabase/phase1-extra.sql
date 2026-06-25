-- TOPS Cellar Selection Club — Phase 1 addendum.
-- Run this in the Supabase SQL editor AFTER schema.sql. It adds the bits the
-- Edge Functions rely on: a real membership-number sequence and a couple of
-- constraints used by upserts. Safe to re-run (idempotent).

-- ---- Membership numbers: a proper sequence (no random collisions) ----
create sequence if not exists membership_seq start with 1001;

create or replace function next_membership_number()
returns text
language sql
as $$
  select lpad(nextval('membership_seq')::text, 4, '0');
$$;

-- ---- Prize draws: one open draw per month (member-api upserts on this) ----
create unique index if not exists prize_draws_month_uq on prize_draws (month);

-- ---- Specials: index for the member app's "published" reads ----
create index if not exists specials_status_idx on specials (status);

-- ---- Settings: make the Discovery Box mode flag readable by the anon client ----
-- (settings has no RLS enabled, so anon can already read it; this policy is a
--  no-op unless you later enable RLS on settings. Left here as documentation.)
-- alter table settings enable row level security;
-- create policy "public read settings" on settings for select using (true);
