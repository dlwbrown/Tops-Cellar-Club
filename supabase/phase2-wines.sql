-- Phase 2 — Wine Database expansion.
-- Run once in the Supabase SQL Editor. Safe to re-run (idempotent).
-- Adds the enrichment + operational columns and a unique Product Code so the
-- price-list import can MERGE (never duplicate, never delete).

alter table wines
  add column if not exists product_code text,
  add column if not exists category text,
  add column if not exists vintage text,
  add column if not exists size text,
  add column if not exists alcohol numeric,
  add column if not exists cellaring_potential text,
  add column if not exists selling_price numeric,
  add column if not exists promo_price numeric,
  add column if not exists soh integer default 0,
  add column if not exists active boolean default true;

-- Unique Product Code (allows many NULLs for manually-added wines; enforces
-- uniqueness on real codes so imports upsert instead of duplicating).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wines_product_code_key'
  ) then
    alter table wines add constraint wines_product_code_key unique (product_code);
  end if;
end $$;

-- Helpful index for catalogue browsing at 10k+ products.
create index if not exists wines_active_name_idx on wines (active, name);
