-- Phase 2 — Membership types for audience targeting. Run once. Idempotent.
alter table members add column if not exists membership_type text;  -- box | wine | premium (null = general)
