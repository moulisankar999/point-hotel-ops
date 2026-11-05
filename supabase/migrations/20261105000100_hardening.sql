-- Hardening after Supabase advisors (security + performance)

-- fixed search_path on remaining functions
alter function public.is_manager_plus() set search_path = public;
alter function public.kl_today() set search_path = public;
alter function public.tg_block_delete() set search_path = public;
alter function public.tg_audit_immutable() set search_path = public;

-- keep btree_gist out of the API schema
create schema if not exists extensions;
alter extension btree_gist set schema extensions;

-- trigger functions are never called directly
do $$
declare f text;
begin
  foreach f in array array['tg_audit()', 'tg_block_delete()', 'tg_audit_immutable()', 'tg_stamp_created()', 'tg_bookings_server_fields()',
    'tg_rooms_guard()', 'tg_hk_tasks_stamp()', 'tg_profiles_guard()', 'tg_payments_guard()', 'tg_bookings_alerts()', 'tg_rooms_alerts()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- RLS helpers: signed-in staff only (needed by policies), never anon
revoke all on function public.app_role() from public, anon;
revoke all on function public.has_role(variadic app_role[]) from public, anon;
revoke all on function public.is_manager_plus() from public, anon;
revoke all on function public.staff_name(uuid) from public, anon;
revoke all on function public.kl_today() from public, anon;
grant execute on function public.app_role() to authenticated;
grant execute on function public.has_role(variadic app_role[]) to authenticated;
grant execute on function public.is_manager_plus() to authenticated;
grant execute on function public.staff_name(uuid) to authenticated;
grant execute on function public.kl_today() to authenticated;

-- per-statement auth.uid() in the cash-count policy
drop policy cash_read on public.cash_counts;
create policy cash_read on public.cash_counts for select to authenticated
  using (public.is_manager_plus() or created_by = (select auth.uid()));

-- cover foreign keys
create index if not exists alerts_booking_idx        on public.alerts (booking_id);
create index if not exists alerts_created_by_idx     on public.alerts (created_by);
create index if not exists bookings_checked_in_by_idx  on public.bookings (checked_in_by);
create index if not exists bookings_checked_out_by_idx on public.bookings (checked_out_by);
create index if not exists bookings_created_by_idx   on public.bookings (created_by);
create index if not exists bookings_updated_by_idx   on public.bookings (updated_by);
create index if not exists cash_counts_created_by_idx on public.cash_counts (created_by);
create index if not exists expenses_created_by_idx   on public.expenses (created_by);
create index if not exists hk_tasks_assignee_idx     on public.hk_tasks (assignee);
create index if not exists hk_tasks_room_idx         on public.hk_tasks (room_id);
create index if not exists hk_tasks_updated_by_idx   on public.hk_tasks (updated_by);
create index if not exists payments_booking_idx      on public.payments (booking_id);
create index if not exists payments_created_by_idx   on public.payments (created_by);
create index if not exists room_blocks_created_by_idx on public.room_blocks (created_by);
create index if not exists room_blocks_room_idx      on public.room_blocks (room_id);
create index if not exists rooms_hk_seen_by_idx      on public.rooms (hk_seen_by);
create index if not exists rooms_type_idx            on public.rooms (type_id);
