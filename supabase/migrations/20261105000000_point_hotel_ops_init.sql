-- =====================================================================
-- The Point Boutique Hotel · Hotel Ops · initial schema
-- Target: a NEW, dedicated Supabase project (Postgres 15+).
-- STATUS: written for review — NOT yet applied to any database.
--
-- Principles
--  * Every write is recorded in an append-only audit_log (DB triggers,
--    so it cannot be bypassed from the browser).
--  * Bookings can never be hard-deleted; cancel / void / no-show need a reason.
--  * Edits to a booking after check-out (or after cancel/void) need
--    Manager+ and a reason.
--  * Double-booking and duplicate PMS refs are rejected by constraints.
--  * Staff-identity / timestamp columns are set by the server, never trusted
--    from the client.
--  * Alerts are raised by triggers and pushed over Realtime.
-- =====================================================================

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type app_role       as enum ('ceo', 'ops_manager', 'manager', 'front_desk', 'housekeeping');
create type hk_status      as enum ('dirty', 'cleaning', 'clean', 'inspected', 'ready');
create type booking_type   as enum ('advance', 'walk_in');
create type booking_status as enum ('reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'void');
create type payment_method as enum ('cash', 'card', 'online', 'transfer');
create type alert_type     as enum ('check_in', 'check_out', 'walk_in', 'advance', 'cancel', 'flag');
create type hk_task_kind   as enum ('checkout', 'stayover', 'adhoc');
create type hk_task_status as enum ('pending', 'in_progress', 'done', 'inspected');

-- ---------------------------------------------------------------- tables
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete restrict,
  username      text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  full_name     text not null check (length(btrim(full_name)) > 0),
  role          app_role not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  change_reason text
);

create table public.settings (
  id             int primary key default 1 check (id = 1),
  hotel_name     text not null default 'The Point Boutique Hotel',
  city           text not null default 'Johor Bahru',
  currency       text not null default 'RM',
  timezone       text not null default 'Asia/Kuala_Lumpur',
  check_in_time  text not null default '15:00',
  check_out_time text not null default '12:00',
  change_reason  text
);

create table public.room_types (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  base_rate     numeric(10,2) not null check (base_rate > 0),
  rate_floor    numeric(10,2) not null check (rate_floor > 0),
  max_pax       int not null default 2 check (max_pax between 1 and 10),
  change_reason text,
  check (rate_floor <= base_rate)
);

create table public.rooms (
  id                 uuid primary key default gen_random_uuid(),
  number             text not null unique,
  floor              int not null,
  type_id            uuid not null references public.room_types (id),
  hk_status          hk_status not null default 'ready',
  out_of_order       boolean not null default false,
  out_of_order_reason text,
  hk_seen_occupied   boolean not null default false,
  hk_seen_at         timestamptz,
  hk_seen_by         uuid references public.profiles (id),
  active             boolean not null default true,
  change_reason      text
);

create table public.room_blocks (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms (id),
  date_from     date not null,
  date_to       date not null,             -- exclusive
  reason        text not null check (length(btrim(reason)) >= 3),
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  active        boolean not null default true,
  change_reason text,
  check (date_to > date_from)
);

create sequence public.booking_code_seq start 1001;

create table public.bookings (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  type            booking_type not null,
  pms_ref         text,
  no_pms_reason   text,
  room_id         uuid not null references public.rooms (id),
  guest_name      text not null check (length(btrim(guest_name)) > 0),
  phone           text not null check (phone ~ '^[+0-9][0-9 -]{6,}$'),
  id_no           text,
  pax             int not null check (pax >= 1),
  check_in        date not null,
  check_out       date not null,           -- exclusive
  rate            numeric(10,2) not null check (rate > 0),
  amount          numeric(12,2) not null check (amount >= 0),
  payment_method  payment_method not null,
  status          booking_status not null default 'reserved',
  notes           text,
  below_floor     boolean not null default false,
  discount_reason text,
  status_reason   text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  checked_in_at   timestamptz,
  checked_in_by   uuid references public.profiles (id),
  checked_out_at  timestamptz,
  checked_out_by  uuid references public.profiles (id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id),
  change_reason   text,
  constraint bookings_dates_valid check (check_out > check_in),
  -- advance bookings must carry the PMS ref; walk-ins need the ref or a reason
  constraint bookings_pms_ref_required check (
    (type = 'advance' and pms_ref is not null and length(btrim(pms_ref)) > 0)
    or (type = 'walk_in' and (coalesce(length(btrim(pms_ref)), 0) > 0 or coalesce(length(btrim(no_pms_reason)), 0) > 0))
  ),
  -- cancel / void / no-show must say why
  constraint bookings_status_reason_required check (
    status not in ('cancelled', 'void', 'no_show') or coalesce(length(btrim(status_reason)), 0) >= 5
  ),
  constraint bookings_below_floor_reason check (not below_floor or coalesce(length(btrim(discount_reason)), 0) > 0),
  -- no double-booking: a room cannot hold two live bookings on the same night
  constraint bookings_no_overlap exclude using gist (
    room_id with =, daterange(check_in, check_out, '[)') with &&
  ) where (status in ('reserved', 'checked_in'))
);
create unique index bookings_pms_ref_unique on public.bookings (upper(btrim(pms_ref)))
  where pms_ref is not null and status not in ('cancelled', 'void');
create index bookings_dates_idx on public.bookings (check_in, check_out);
create index bookings_room_idx on public.bookings (room_id);

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings (id),
  date          date not null default (now() at time zone 'Asia/Kuala_Lumpur')::date,
  method        payment_method not null,
  amount        numeric(12,2) not null check (amount <> 0),
  note          text,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  change_reason text
);
create index payments_date_idx on public.payments (date);

create table public.alerts (
  id            uuid primary key default gen_random_uuid(),
  type          alert_type not null,
  title         text not null,
  message       text not null,
  booking_id    uuid references public.bookings (id),
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  read_by       uuid[] not null default '{}'
);
create index alerts_created_idx on public.alerts (created_at desc);

create table public.hk_tasks (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  room_id       uuid not null references public.rooms (id),
  kind          hk_task_kind not null,
  status        hk_task_status not null default 'pending',
  assignee      uuid references public.profiles (id),
  note          text,
  done_at       timestamptz,
  inspected_at  timestamptz,
  updated_by    uuid references public.profiles (id),
  change_reason text
);
create unique index hk_tasks_one_per_kind on public.hk_tasks (date, room_id, kind) where kind <> 'adhoc';

create table public.fixed_expenses (
  id             uuid primary key default gen_random_uuid(),
  category       text not null unique,
  monthly_amount numeric(12,2) not null default 0 check (monthly_amount >= 0),
  active         boolean not null default true,
  change_reason  text
);

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  category      text not null,
  description   text not null check (length(btrim(description)) > 0),
  amount        numeric(12,2) not null check (amount > 0),
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  change_reason text
);

create table public.cash_counts (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  amount        numeric(12,2) not null check (amount >= 0),
  note          text,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  change_reason text
);

create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  at         timestamptz not null default now(),
  user_id    uuid,
  user_name  text not null,
  entity     text not null,
  entity_id  text not null,
  action     text not null check (action in ('insert', 'update', 'delete', 'login', 'logout')),
  reason     text,
  before     jsonb,
  after      jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

-- ---------------------------------------------------------------- helpers
-- role of the signed-in user; NULL when not signed in or deactivated
create or replace function public.app_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.has_role(variadic roles app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = any (roles), false)
$$;

create or replace function public.is_manager_plus() returns boolean
language sql stable as $$ select public.has_role('ceo', 'ops_manager', 'manager') $$;

create or replace function public.staff_name(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select full_name from public.profiles where id = uid), 'System')
$$;

create or replace function public.kl_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kuala_Lumpur')::date $$;

-- ---------------------------------------------------------------- audit (append-only)
create or replace function public.tg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'change_reason' end;
  v_after  jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'change_reason' end;
  v_reason text  := case when tg_op in ('INSERT', 'UPDATE') then (to_jsonb(new) ->> 'change_reason') else (to_jsonb(old) ->> 'change_reason') end;
begin
  if tg_op = 'UPDATE' and v_before = v_after then return new; end if;
  insert into public.audit_log (user_id, user_name, entity, entity_id, action, reason, before, after)
  values (auth.uid(), public.staff_name(auth.uid()), tg_table_name, coalesce(v_after ->> 'id', v_before ->> 'id'), lower(tg_op), v_reason, v_before, v_after);
  return coalesce(new, old);
end $$;

create or replace function public.tg_block_delete() returns trigger
language plpgsql as $$
begin
  raise exception '% rows cannot be deleted. Cancel / void / deactivate instead (a reason is required).', tg_table_name;
end $$;

create or replace function public.tg_audit_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'The audit log is append-only.';
end $$;

create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function public.tg_audit_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.tg_audit_immutable();

-- ---------------------------------------------------------------- server-owned columns
create or replace function public.tg_stamp_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end $$;

create or replace function public.tg_bookings_server_fields() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_floor numeric;
  v_role  app_role := public.app_role();
  v_admin boolean  := auth.uid() is null;  -- service role / SQL editor
begin
  select rt.rate_floor into v_floor from public.rooms r join public.room_types rt on rt.id = r.type_id where r.id = new.room_id;
  new.pms_ref    := nullif(upper(btrim(coalesce(new.pms_ref, ''))), '');
  new.below_floor := v_floor is not null and new.rate < v_floor;
  new.updated_at := now();
  new.updated_by := auth.uid();

  if tg_op = 'INSERT' then
    new.code := 'TP-' || nextval('public.booking_code_seq');
    new.created_by := auth.uid();
    new.created_at := now();
    new.checked_in_at := null; new.checked_in_by := null;
    new.checked_out_at := null; new.checked_out_by := null;
    if new.status = 'checked_in' then
      new.checked_in_at := now(); new.checked_in_by := auth.uid();
    elsif new.status <> 'reserved' then
      raise exception 'New bookings start as reserved or checked_in.';
    end if;
    if new.type = 'walk_in' and new.check_in <> public.kl_today() and not v_admin then
      raise exception 'Walk-ins must check in today.';
    end if;
    if new.type = 'advance' and new.check_in < public.kl_today() and not v_admin then
      raise exception 'Advance bookings cannot start in the past.';
    end if;
  else
    -- immutable identity of a booking
    new.code := old.code; new.created_by := old.created_by; new.created_at := old.created_at;
    new.checked_in_at := old.checked_in_at; new.checked_in_by := old.checked_in_by;
    new.checked_out_at := old.checked_out_at; new.checked_out_by := old.checked_out_by;

    if new.status is distinct from old.status then
      if not (
        (old.status = 'reserved'   and new.status in ('checked_in', 'cancelled', 'no_show', 'void')) or
        (old.status = 'checked_in' and new.status in ('checked_out', 'void')) or
        (old.status = 'checked_out' and new.status = 'void') or
        (old.status = 'no_show' and new.status in ('reserved', 'void')) or
        v_admin
      ) then
        raise exception 'Booking cannot go from % to %.', old.status, new.status;
      end if;
      if new.status = 'checked_in' then new.checked_in_at := now(); new.checked_in_by := auth.uid(); end if;
      if new.status = 'checked_out' then new.checked_out_at := now(); new.checked_out_by := auth.uid(); end if;
      if new.status in ('cancelled', 'no_show', 'void') then
        if coalesce(length(btrim(new.change_reason)), 0) < 5 then
          raise exception 'A reason (at least 5 characters) is required to %.', new.status;
        end if;
        if old.status <> 'reserved' and not (public.is_manager_plus() or v_admin) then
          raise exception 'Only a Manager or above can void a checked-in or completed booking.';
        end if;
      end if;
    end if;

    -- edits after check-out / cancel / void: Manager+ and a reason
    if old.status in ('checked_out', 'cancelled', 'void') and not v_admin then
      if not public.is_manager_plus() then
        raise exception 'Only a Manager or above can change a booking after check-out, cancel or void.';
      end if;
      if coalesce(length(btrim(new.change_reason)), 0) < 5 then
        raise exception 'A reason (at least 5 characters) is required to change a closed booking.';
      end if;
    end if;

    -- front desk may only check a checked-in guest out (and shorten the stay when leaving early)
    if old.status = 'checked_in' and v_role = 'front_desk' then
      if (to_jsonb(new) - array['status', 'check_out', 'updated_at', 'updated_by', 'checked_out_at', 'checked_out_by', 'change_reason'])
         is distinct from (to_jsonb(old) - array['status', 'check_out', 'updated_at', 'updated_by', 'checked_out_at', 'checked_out_by', 'change_reason'])
         or new.check_out > old.check_out then
        raise exception 'Only a Manager or above can edit an in-house booking.';
      end if;
    end if;
  end if;

  if new.below_floor and coalesce(length(btrim(new.discount_reason)), 0) = 0 then
    raise exception 'Rate is below the room-type floor (RM %). A discount reason is required.', v_floor;
  end if;

  -- dates blocked by management
  if new.status in ('reserved', 'checked_in') and exists (
    select 1 from public.room_blocks k
    where k.room_id = new.room_id and k.active and daterange(k.date_from, k.date_to, '[)') && daterange(new.check_in, new.check_out, '[)')
  ) then
    raise exception 'Room is blocked for some of these dates.';
  end if;
  if new.status in ('reserved', 'checked_in') and (tg_op = 'INSERT' or new.room_id <> old.room_id)
     and exists (select 1 from public.rooms where id = new.room_id and (out_of_order or not active)) then
    raise exception 'Room is under maintenance or inactive.';
  end if;
  return new;
end $$;

create or replace function public.tg_rooms_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.hk_seen_occupied is distinct from old.hk_seen_occupied then
    new.hk_seen_at := case when new.hk_seen_occupied then now() end;
    new.hk_seen_by := case when new.hk_seen_occupied then auth.uid() end;
  else
    new.hk_seen_at := old.hk_seen_at; new.hk_seen_by := old.hk_seen_by;
  end if;
  -- front desk / housekeeping may only move housekeeping state
  if auth.uid() is not null and not public.is_manager_plus() then
    if (new.number, new.floor, new.type_id, new.out_of_order, new.out_of_order_reason, new.active)
       is distinct from (old.number, old.floor, old.type_id, old.out_of_order, old.out_of_order_reason, old.active) then
      raise exception 'Only a Manager or above can change room setup or maintenance.';
    end if;
  end if;
  return new;
end $$;

create or replace function public.tg_hk_tasks_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_by := auth.uid();
  return new;
end $$;

create or replace function public.tg_profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  new.id := old.id; new.username := old.username; new.created_at := old.created_at;
  if old.id = auth.uid() and (new.role <> old.role or not new.active) then
    raise exception 'You cannot change your own role or deactivate yourself.';
  end if;
  return new;
end $$;

-- payments are corrections-only after entry (manager+, reason)
create or replace function public.tg_payments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_by := old.created_by; new.created_at := old.created_at; new.booking_id := old.booking_id;
  if auth.uid() is not null and coalesce(length(btrim(new.change_reason)), 0) < 5 then
    raise exception 'A reason is required to change a recorded payment.';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- alerts (raised server-side)
create or replace function public.raise_alert(p_type alert_type, p_title text, p_message text, p_booking uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.alerts (type, title, message, booking_id, created_by) values (p_type, p_title, p_message, p_booking, auth.uid());
$$;
revoke all on function public.raise_alert(alert_type, text, text, uuid) from public, anon, authenticated;

create or replace function public.tg_bookings_alerts() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_room text := (select number from public.rooms where id = new.room_id);
  v_tag  text := case when new.pms_ref is not null then 'PMS ' || new.pms_ref else 'NO PMS REF (' || coalesce(new.no_pms_reason, '-') || ')' end;
  v_by   text := public.staff_name(auth.uid());
  v_n    int  := new.check_out - new.check_in;
begin
  if tg_op = 'INSERT' then
    if new.status = 'checked_in' then
      perform public.raise_alert(case when new.type = 'walk_in' then 'walk_in' else 'check_in' end::alert_type,
        case when new.type = 'walk_in' then 'Walk-in check-in' else 'Check-in' end || ' · Room ' || v_room,
        new.guest_name || ' · ' || new.code || ' · ' || v_tag || ' · ' || v_n || 'n · RM ' || new.amount || ' · by ' || v_by, new.id);
    else
      perform public.raise_alert('advance', 'Advance booking · Room ' || v_room,
        new.guest_name || ' · ' || new.check_in || ' → ' || new.check_out || ' · ' || v_tag || ' · by ' || v_by, new.id);
    end if;
    if new.below_floor then
      perform public.raise_alert('flag', 'Below rate floor · Room ' || v_room,
        new.code || ' sold at RM ' || new.rate || '/night. Reason: ' || coalesce(new.discount_reason, '-'), new.id);
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'checked_in' then
      perform public.raise_alert('check_in', 'Check-in · Room ' || v_room, new.guest_name || ' · ' || new.code || ' · ' || v_tag || ' · by ' || v_by, new.id);
    elsif new.status = 'checked_out' then
      perform public.raise_alert('check_out', 'Check-out · Room ' || v_room, new.guest_name || ' · ' || new.code || ' · RM ' || new.amount || ' · by ' || v_by, new.id);
    elsif new.status in ('cancelled', 'void', 'no_show') then
      perform public.raise_alert('cancel',
        case new.status when 'void' then 'Voided' when 'no_show' then 'No-show' else 'Cancelled' end || ' · Room ' || v_room,
        new.code || ' · ' || new.guest_name || ' · Reason: ' || coalesce(new.status_reason, new.change_reason, '-') || ' · by ' || v_by, new.id);
    end if;
  elsif old.status in ('checked_out', 'cancelled', 'void') then
    perform public.raise_alert('flag', 'Closed booking edited · Room ' || v_room,
      new.code || ' · ' || new.guest_name || ' · by ' || v_by || ' · Reason: ' || coalesce(new.change_reason, '-'), new.id);
  end if;
  if new.below_floor and not old.below_floor then
    perform public.raise_alert('flag', 'Below rate floor · Room ' || v_room,
      new.code || ' changed to RM ' || new.rate || '/night. Reason: ' || coalesce(new.discount_reason, '-'), new.id);
  end if;
  return new;
end $$;

create or replace function public.tg_rooms_alerts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.hk_seen_occupied and not old.hk_seen_occupied
     and not exists (select 1 from public.bookings b where b.room_id = new.id and b.status = 'checked_in') then
    perform public.raise_alert('flag', 'Ghost occupancy · Room ' || new.number,
      'Housekeeping (' || public.staff_name(auth.uid()) || ') saw the room in use, but no guest is checked in.', null);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- triggers
create trigger bookings_server_fields before insert or update on public.bookings for each row execute function public.tg_bookings_server_fields();
create trigger bookings_alerts after insert or update on public.bookings for each row execute function public.tg_bookings_alerts();
create trigger rooms_guard before update on public.rooms for each row execute function public.tg_rooms_guard();
create trigger rooms_alerts after update on public.rooms for each row execute function public.tg_rooms_alerts();
create trigger hk_tasks_stamp before insert or update on public.hk_tasks for each row execute function public.tg_hk_tasks_stamp();
create trigger profiles_guard before update on public.profiles for each row execute function public.tg_profiles_guard();
create trigger payments_guard before update on public.payments for each row execute function public.tg_payments_guard();

do $$
declare t text;
begin
  foreach t in array array['room_blocks', 'payments', 'expenses', 'cash_counts'] loop
    execute format('create trigger %1$s_stamp before insert on public.%1$I for each row execute function public.tg_stamp_created()', t);
  end loop;
  foreach t in array array['profiles', 'settings', 'room_types', 'rooms', 'room_blocks', 'bookings', 'payments', 'hk_tasks', 'fixed_expenses', 'expenses', 'cash_counts'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function public.tg_audit()', t);
    execute format('create trigger %1$s_no_delete before delete on public.%1$I for each row execute function public.tg_block_delete()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RPCs
create or replace function public.mark_alerts_read(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.alerts set read_by = array_append(read_by, auth.uid())
  where id = any (p_ids) and not (auth.uid() = any (read_by)) and public.app_role() is not null;
$$;

create or replace function public.log_session(p_action text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_action not in ('login', 'logout') then return; end if;
  insert into public.audit_log (user_id, user_name, entity, entity_id, action)
  values (auth.uid(), public.staff_name(auth.uid()), 'session', auth.uid()::text, p_action);
end $$;

revoke all on function public.mark_alerts_read(uuid[]) from public, anon;
revoke all on function public.log_session(text) from public, anon;
grant execute on function public.mark_alerts_read(uuid[]) to authenticated;
grant execute on function public.log_session(text) to authenticated;

-- ---------------------------------------------------------------- row level security
alter table public.profiles       enable row level security;
alter table public.settings       enable row level security;
alter table public.room_types     enable row level security;
alter table public.rooms          enable row level security;
alter table public.room_blocks    enable row level security;
alter table public.bookings       enable row level security;
alter table public.payments       enable row level security;
alter table public.alerts         enable row level security;
alter table public.hk_tasks       enable row level security;
alter table public.fixed_expenses enable row level security;
alter table public.expenses       enable row level security;
alter table public.cash_counts    enable row level security;
alter table public.audit_log      enable row level security;

-- nobody (except service role) may delete, and anon gets nothing
revoke delete, truncate on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;

-- profiles: all staff read; CEO edits (creation happens in the admin-users edge function)
create policy profiles_read   on public.profiles for select to authenticated using (public.app_role() is not null);
create policy profiles_update on public.profiles for update to authenticated using (public.has_role('ceo')) with check (public.has_role('ceo'));

-- settings / room types: all staff read; CEO edits
create policy settings_read   on public.settings for select to authenticated using (public.app_role() is not null);
create policy settings_update on public.settings for update to authenticated using (public.has_role('ceo')) with check (public.has_role('ceo'));
create policy room_types_read  on public.room_types for select to authenticated using (public.app_role() is not null);
create policy room_types_write on public.room_types for insert to authenticated with check (public.has_role('ceo'));
create policy room_types_edit  on public.room_types for update to authenticated using (public.has_role('ceo')) with check (public.has_role('ceo'));

-- rooms: all staff read and update (column-level guard trigger limits non-managers to HK state); CEO adds rooms
create policy rooms_read   on public.rooms for select to authenticated using (public.app_role() is not null);
create policy rooms_update on public.rooms for update to authenticated using (public.app_role() is not null) with check (public.app_role() is not null);
create policy rooms_insert on public.rooms for insert to authenticated with check (public.has_role('ceo'));

-- blocks: everyone reads; managers+ create / lift
create policy blocks_read   on public.room_blocks for select to authenticated using (public.app_role() is not null);
create policy blocks_insert on public.room_blocks for insert to authenticated with check (public.is_manager_plus());
create policy blocks_update on public.room_blocks for update to authenticated using (public.is_manager_plus()) with check (public.is_manager_plus());

-- bookings: all staff read (housekeeping needs in-house status); front desk+ write (trigger enforces the rules)
create policy bookings_read   on public.bookings for select to authenticated using (public.app_role() is not null);
create policy bookings_insert on public.bookings for insert to authenticated with check (public.has_role('ceo', 'ops_manager', 'manager', 'front_desk'));
create policy bookings_update on public.bookings for update to authenticated
  using (public.has_role('ceo', 'ops_manager', 'manager', 'front_desk'))
  with check (public.has_role('ceo', 'ops_manager', 'manager', 'front_desk'));

-- payments: front desk+ read & add; managers+ correct (with reason)
create policy payments_read   on public.payments for select to authenticated using (public.has_role('ceo', 'ops_manager', 'manager', 'front_desk'));
create policy payments_insert on public.payments for insert to authenticated with check (public.has_role('ceo', 'ops_manager', 'manager', 'front_desk'));
create policy payments_update on public.payments for update to authenticated using (public.is_manager_plus()) with check (public.is_manager_plus());

-- alerts: managers+ read; inserted only by triggers; read-marking via RPC
create policy alerts_read on public.alerts for select to authenticated using (public.is_manager_plus());

-- housekeeping tasks
create policy hk_read   on public.hk_tasks for select to authenticated using (public.app_role() is not null);
create policy hk_insert on public.hk_tasks for insert to authenticated with check (public.app_role() is not null);
create policy hk_update on public.hk_tasks for update to authenticated
  using (public.has_role('ceo', 'ops_manager', 'manager', 'housekeeping'))
  with check (public.has_role('ceo', 'ops_manager', 'manager', 'housekeeping'));

-- fixed costs: CEO only
create policy fixed_read   on public.fixed_expenses for select to authenticated using (public.has_role('ceo'));
create policy fixed_insert on public.fixed_expenses for insert to authenticated with check (public.has_role('ceo'));
create policy fixed_update on public.fixed_expenses for update to authenticated using (public.has_role('ceo')) with check (public.has_role('ceo'));

-- ad-hoc expenses: managers+
create policy expenses_read   on public.expenses for select to authenticated using (public.is_manager_plus());
create policy expenses_insert on public.expenses for insert to authenticated with check (public.is_manager_plus());
create policy expenses_update on public.expenses for update to authenticated using (public.is_manager_plus()) with check (public.is_manager_plus());

-- cash counts: front desk records & sees its own; managers+ see all
create policy cash_read   on public.cash_counts for select to authenticated using (public.is_manager_plus() or created_by = auth.uid());
create policy cash_insert on public.cash_counts for insert to authenticated with check (public.has_role('ceo', 'ops_manager', 'manager', 'front_desk'));

-- audit log: CEO reads everything; managers read booking history; nobody writes directly
create policy audit_read on public.audit_log for select to authenticated
  using (public.has_role('ceo') or (public.is_manager_plus() and entity in ('bookings', 'payments', 'rooms', 'room_blocks', 'hk_tasks')));

-- ---------------------------------------------------------------- realtime
alter table public.bookings replica identity full;
alter table public.alerts   replica identity full;
alter publication supabase_realtime add table public.bookings, public.alerts, public.rooms, public.room_blocks, public.hk_tasks, public.payments;

-- ---------------------------------------------------------------- seed (reference data only; no guests)
insert into public.settings (id) values (1);

insert into public.room_types (code, name, base_rate, rate_floor, max_pax) values
  ('STQ', 'Standard Queen', 159, 129, 2),
  ('DLK', 'Deluxe King',    199, 169, 2),
  ('TWN', 'Deluxe Twin',    189, 159, 2),
  ('FAM', 'Family Room',    259, 219, 4),
  ('STE', 'Point Suite',    359, 299, 3);

-- 60 placeholder rooms (5 floors × 12). Adjust numbers/types in Settings → Rooms to match the real hotel.
insert into public.rooms (number, floor, type_id)
select f::text || lpad(i::text, 2, '0'), f,
       (select id from public.room_types where code = (array['STQ','STQ','STQ','STQ','DLK','DLK','DLK','TWN','TWN','TWN','FAM','STE'])[i])
from generate_series(1, 5) f, generate_series(1, 12) i;

insert into public.fixed_expenses (category, monthly_amount)
select c, 0 from unnest(array[
  'Salaries & wages', 'EPF / SOCSO / EIS', 'Rent / loan instalment', 'Electricity (TNB)', 'Water (Ranhill SAJ)', 'Internet & TV',
  'Laundry & linen', 'Guest amenities', 'OTA commissions', 'Maintenance contract', 'Insurance', 'Licences & permits (MBJB, tourism tax admin)',
  'Marketing & ads', 'PMS / software subscriptions', 'Security', 'Cleaning supplies', 'Pest control', 'Accounting & audit', 'Bank & card fees', 'Assessment & quit rent'
]) as c;
