-- Phase 2 — Order Management. Run once in the Supabase SQL Editor. Idempotent.

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique,
  member_id uuid references members(id) on delete set null,
  customer_name text,
  member_number text,
  contact text,
  order_type text default 'wine',        -- wine | mystery_box | merchandise
  fulfilment text default 'collection',  -- collection | delivery
  payment_status text default 'unpaid',  -- unpaid | paid
  status text default 'pending',         -- pending|paid|packed|ready|collected|delivered|cancelled
  items jsonb default '[]',              -- [{code, description, qty, price}]
  discount numeric default 0,
  total numeric default 0,
  notes text,
  created_at timestamptz default now()
);
create index if not exists orders_created_idx on orders (created_at desc);

-- Server-side only (admin functions use the service-role key; members don't read this yet).
alter table orders enable row level security;
