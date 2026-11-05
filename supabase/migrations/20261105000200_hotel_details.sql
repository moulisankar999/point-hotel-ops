-- Hotel contact details on the settings row (shown on login, sidebar and printed reports).
-- STATUS: applied to Supabase project gqufebtfyrofycnnbnpm on 2026-11-05.
alter table public.settings
  add column if not exists address     text,
  add column if not exists phone       text,
  add column if not exists email       text,
  add column if not exists website     text,
  add column if not exists star_rating int check (star_rating between 1 and 5);
