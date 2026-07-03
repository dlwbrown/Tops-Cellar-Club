-- Phase 2 — Magazine becomes editorial. Run once in the Supabase SQL Editor. Idempotent.
alter table magazines
  add column if not exists category text default 'Article',   -- Article | Promotion | Wine Education | News | Seasonal
  add column if not exists excerpt text,
  add column if not exists body text;
