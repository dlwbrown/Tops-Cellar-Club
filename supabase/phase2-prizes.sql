-- Phase 2 — Prizes & Lucky Draw. Run once in the Supabase SQL Editor. Idempotent.

create table if not exists prizes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  value numeric,
  qty_available int default 1,
  qty_awarded int default 0,
  start_date date,
  end_date date,
  is_bonus boolean default false,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists prize_wins (
  id uuid primary key default gen_random_uuid(),
  prize_id uuid references prizes(id) on delete set null,
  prize_name text,
  prize_value numeric,
  member_id uuid references members(id) on delete set null,
  member_name text,
  member_number text,
  drawn_by text,
  range_start date,
  range_end date,
  created_at timestamptz default now()
);

create index if not exists prize_wins_created_idx on prize_wins (created_at desc);
