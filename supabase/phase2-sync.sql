-- Phase 2 — Import sync history + rollback. Run once. Idempotent.
create table if not exists sync_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  added int default 0,
  updated int default 0,
  undo jsonb,               -- { updates:[{product_code,name,size,soh,selling_price}], inserts:[codes] }
  rolled_back boolean default false,
  note text
);
create index if not exists sync_history_created_idx on sync_history (created_at desc);
alter table sync_history enable row level security;
