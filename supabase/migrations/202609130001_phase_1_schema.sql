-- Tiffany's Pickleball Court - Phase 1 database schema
-- Run this file once in the Supabase SQL Editor.
-- The transaction makes the migration all-or-nothing if any statement fails.

begin;

set local timezone = 'Asia/Manila';
set local search_path = public, extensions, pg_catalog;

create extension if not exists btree_gist with schema extensions;

create sequence public.public_reference_seq;

create or replace function public.next_public_reference()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select
    'TPC-' ||
    pg_catalog.to_char(
      pg_catalog.timezone('Asia/Manila', pg_catalog.statement_timestamp()),
      'YYMM'
    ) ||
    '-' ||
    pg_catalog.lpad(
      pg_catalog.nextval('public.public_reference_seq')::text,
      4,
      '0'
    );
$$;

create or replace function public.is_valid_court_period(
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with local_times as (
    select
      pg_catalog.timezone('Asia/Manila', p_starts_at) as starts_local,
      pg_catalog.timezone('Asia/Manila', p_ends_at) as ends_local
  )
  select
    p_ends_at > p_starts_at
    and pg_catalog.date_trunc('hour', starts_local) = starts_local
    and pg_catalog.date_trunc('hour', ends_local) = ends_local
    and pg_catalog.mod(
      extract(epoch from (p_ends_at - p_starts_at))::bigint,
      3600
    ) = 0
    and starts_local >= pg_catalog.date_trunc('day', starts_local) + interval '8 hours'
    and ends_local <= pg_catalog.date_trunc('day', starts_local) + interval '1 day'
  from local_times;
$$;

create table public.business_settings (
  id                         smallint primary key default 1,
  timezone_name              text not null default 'Asia/Manila',
  opening_hour               smallint not null default 8,
  closing_hour               smallint not null default 24,
  paddle_price_per_hour      integer not null default 50,
  open_play_price_per_player integer not null default 120,
  sunday_unli_price          integer not null default 120,
  hold_minutes               integer not null default 30,
  constraint business_settings_single_row check (id = 1),
  constraint business_settings_timezone check (timezone_name = 'Asia/Manila'),
  constraint business_settings_hours check (
    opening_hour = 8 and closing_hour = 24
  ),
  constraint business_settings_prices check (
    paddle_price_per_hour >= 0
    and open_play_price_per_player > 0
    and sunday_unli_price > 0
  ),
  constraint business_settings_hold check (hold_minutes between 1 and 120)
);

insert into public.business_settings (id) values (1);

create table public.courts (
  id        smallint primary key,
  name      text not null unique,
  is_active boolean not null default true,
  constraint court_id_positive check (id > 0),
  constraint court_name_present check (pg_catalog.length(pg_catalog.btrim(name)) > 0)
);

insert into public.courts (id, name) values
  (1, 'Court 1'),
  (2, 'Court 2'),
  (3, 'Court 3');

create table public.rate_blocks (
  id             integer generated always as identity primary key,
  label          text not null,
  start_hour     smallint not null,
  end_hour       smallint not null,
  price_per_hour integer not null,
  constraint rate_block_hours check (
    start_hour between 0 and 23
    and end_hour between 1 and 24
    and end_hour > start_hour
  ),
  constraint rate_block_price_positive check (price_per_hour > 0),
  constraint rate_block_label_present check (pg_catalog.length(pg_catalog.btrim(label)) > 0),
  constraint rate_blocks_do_not_overlap exclude using gist (
    int4range(start_hour::integer, end_hour::integer, '[)') with &&
  )
);

insert into public.rate_blocks (label, start_hour, end_hour, price_per_hour) values
  ('Morning', 8, 12, 200),
  ('Midday', 12, 16, 250),
  ('Evening', 16, 24, 300);

create table public.customers (
  id           uuid primary key default pg_catalog.gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name    text not null,
  phone        text not null,
  email        text not null,
  is_coach     boolean not null default false,
  created_at   timestamptz not null default pg_catalog.now(),
  constraint customer_name_present check (pg_catalog.length(pg_catalog.btrim(full_name)) >= 2),
  constraint customer_phone_present check (
    phone ~ '^(09[0-9]{9}|\+639[0-9]{9})$'
  ),
  constraint customer_email_present check (position('@' in email) > 1)
);

create index customers_phone_idx on public.customers (phone);
create index customers_email_lower_idx on public.customers (pg_catalog.lower(email));

create table public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.admin_users
      where user_id = (select auth.uid())
    );
$$;

create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.customers
  where auth_user_id = (select auth.uid());
$$;

create table public.sunday_unli_sessions (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  reference        text not null unique default public.next_public_reference(),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  price_per_player integer not null default 120,
  status           text not null default 'draft',
  customer_note    text,
  created_at       timestamptz not null default pg_catalog.now(),
  constraint sunday_unli_status check (status in ('draft', 'published', 'cancelled')),
  constraint sunday_unli_price_positive check (price_per_player > 0),
  constraint sunday_unli_exact_window check (
    extract(
      isodow from pg_catalog.timezone('Asia/Manila', starts_at)
    ) = 7
    and pg_catalog.timezone('Asia/Manila', starts_at)::time = time '19:00'
    and pg_catalog.timezone('Asia/Manila', ends_at) =
      pg_catalog.date_trunc(
        'day',
        pg_catalog.timezone('Asia/Manila', starts_at)
      ) + interval '1 day'
  )
);

create table public.bookings (
  id                        uuid primary key default pg_catalog.gen_random_uuid(),
  reference                 text not null unique default public.next_public_reference(),
  customer_id               uuid references public.customers(id) on delete restrict,
  court_id                  smallint not null references public.courts(id) on delete restrict,
  sunday_unli_session_id    uuid references public.sunday_unli_sessions(id) on delete cascade,
  starts_at                 timestamptz not null,
  ends_at                   timestamptz not null,
  kind                      text not null,
  paddle_count              integer not null default 0,
  court_fee                 integer not null default 0,
  paddle_fee                integer not null default 0,
  total_amount              integer not null default 0,
  status                    text not null default 'pending',
  hold_expires_at           timestamptz,
  payment_proof_submitted_at timestamptz,
  block_reason              text,
  customer_note             text,
  internal_note             text,
  recurring_rule_id         uuid,
  created_at                timestamptz not null default pg_catalog.now(),
  constraint booking_kind check (
    kind in ('regular', 'blocked', 'open_play', 'sunday_unli', 'recurring')
  ),
  constraint booking_status check (
    status in ('pending', 'confirmed', 'cancelled', 'no_show')
  ),
  constraint booking_paddles_nonnegative check (paddle_count >= 0),
  constraint booking_amounts_nonnegative check (
    court_fee >= 0 and paddle_fee >= 0 and total_amount >= 0
  ),
  constraint booking_valid_operating_period check (
    public.is_valid_court_period(starts_at, ends_at)
  ),
  constraint booking_customer_matches_kind check (
    (
      kind in ('regular', 'recurring')
      and customer_id is not null
      and sunday_unli_session_id is null
    )
    or (
      kind in ('blocked', 'open_play')
      and customer_id is null
      and sunday_unli_session_id is null
    )
    or (
      kind = 'sunday_unli'
      and customer_id is null
      and sunday_unli_session_id is not null
    )
  ),
  constraint booking_block_reason check (
    kind <> 'blocked'
    or (
      block_reason is not null
      and pg_catalog.length(pg_catalog.btrim(block_reason)) > 0
    )
  ),
  constraint booking_unli_court_unique unique (sunday_unli_session_id, court_id),
  constraint active_bookings_do_not_overlap exclude using gist (
    court_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status <> 'cancelled')
);

create index bookings_starts_at_idx on public.bookings (starts_at);
create index bookings_customer_idx on public.bookings (customer_id, starts_at desc);
create index bookings_status_idx on public.bookings (status, starts_at);
create index bookings_active_holds_idx on public.bookings (hold_expires_at)
where status = 'pending' and hold_expires_at is not null;

create or replace function public.prepare_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duration_hours integer;
  v_priced_hours integer;
  v_court_fee integer;
  v_paddle_price integer;
  v_hold_minutes integer;
begin
  if new.reference is null or pg_catalog.btrim(new.reference) = '' then
    new.reference := public.next_public_reference();
  end if;

  if not public.is_valid_court_period(new.starts_at, new.ends_at) then
    raise exception 'Booking must use whole-hour slots between 8:00 AM and midnight Asia/Manila';
  end if;

  v_duration_hours :=
    extract(epoch from (new.ends_at - new.starts_at))::integer / 3600;

  if new.kind in ('regular', 'recurring') then
    if new.customer_id is null then
      raise exception 'Customer is required for regular and recurring bookings';
    end if;

    select
      pg_catalog.count(*)::integer,
      coalesce(pg_catalog.sum(rb.price_per_hour), 0)::integer
    into v_priced_hours, v_court_fee
    from pg_catalog.generate_series(0, v_duration_hours - 1) as slot(offset_hours)
    join public.rate_blocks rb
      on extract(
        hour from pg_catalog.timezone(
          'Asia/Manila',
          new.starts_at + slot.offset_hours * interval '1 hour'
        )
      )::integer >= rb.start_hour
      and extract(
        hour from pg_catalog.timezone(
          'Asia/Manila',
          new.starts_at + slot.offset_hours * interval '1 hour'
        )
      )::integer < rb.end_hour;

    if v_priced_hours <> v_duration_hours then
      raise exception 'Every booking hour must have a configured court rate';
    end if;

    select paddle_price_per_hour, hold_minutes
    into v_paddle_price, v_hold_minutes
    from public.business_settings
    where id = 1;

    new.court_fee := v_court_fee;
    new.paddle_fee := new.paddle_count * v_paddle_price * v_duration_hours;
    new.total_amount := new.court_fee + new.paddle_fee;

    if tg_op = 'INSERT' and new.kind = 'regular' then
      if new.starts_at <= pg_catalog.statement_timestamp() then
        raise exception 'A customer booking must start in the future';
      end if;

      new.status := 'pending';
      new.hold_expires_at :=
        pg_catalog.statement_timestamp() + pg_catalog.make_interval(mins => v_hold_minutes);
      new.payment_proof_submitted_at := null;
      new.block_reason := null;
      new.internal_note := null;
      new.sunday_unli_session_id := null;
      new.recurring_rule_id := null;
    elsif new.kind = 'recurring' then
      new.hold_expires_at := null;
    end if;
  else
    new.customer_id := null;
    new.paddle_count := 0;
    new.court_fee := 0;
    new.paddle_fee := 0;
    new.total_amount := 0;
    new.hold_expires_at := null;
  end if;

  return new;
end;
$$;

create trigger prepare_booking_before_write
before insert or update of
  reference,
  customer_id,
  starts_at,
  ends_at,
  kind,
  paddle_count
on public.bookings
for each row execute function public.prepare_booking();

create table public.open_play_sessions (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  reference        text not null unique default public.next_public_reference(),
  booking_id       uuid not null unique references public.bookings(id) on delete cascade,
  title            text not null default 'Open play',
  price_per_player integer not null default 120,
  is_published     boolean not null default false,
  customer_note    text,
  created_at       timestamptz not null default pg_catalog.now(),
  constraint open_play_title_present check (pg_catalog.length(pg_catalog.btrim(title)) > 0),
  constraint open_play_price_positive check (price_per_player > 0)
);

create or replace function public.validate_open_play_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.bookings
    where id = new.booking_id
      and kind = 'open_play'
      and status <> 'cancelled'
  ) then
    raise exception 'Open-play session must reference an active open-play booking';
  end if;

  return new;
end;
$$;

create trigger validate_open_play_booking_before_write
before insert or update of booking_id
on public.open_play_sessions
for each row execute function public.validate_open_play_booking();

create table public.open_play_signups (
  id              uuid primary key default pg_catalog.gen_random_uuid(),
  reference       text not null unique default public.next_public_reference(),
  session_id      uuid not null references public.open_play_sessions(id) on delete cascade,
  customer_id     uuid not null references public.customers(id) on delete restrict,
  amount_due      integer not null default 0,
  status          text not null default 'pending',
  hold_expires_at timestamptz,
  payment_proof_submitted_at timestamptz,
  created_at      timestamptz not null default pg_catalog.now(),
  constraint open_play_signup_status check (
    status in ('pending', 'confirmed', 'cancelled', 'no_show')
  ),
  constraint open_play_signup_amount_positive check (amount_due > 0)
);

create unique index open_play_one_active_signup_per_customer
on public.open_play_signups (session_id, customer_id)
where status <> 'cancelled';

create or replace function public.prepare_open_play_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price integer;
  v_hold_minutes integer;
begin
  select price_per_player
  into v_price
  from public.open_play_sessions
  where id = new.session_id
    and is_published = true;

  if v_price is null then
    raise exception 'Open-play session is not published';
  end if;

  select hold_minutes
  into v_hold_minutes
  from public.business_settings
  where id = 1;

  new.amount_due := v_price;
  new.status := 'pending';
  new.hold_expires_at :=
    pg_catalog.statement_timestamp() + pg_catalog.make_interval(mins => v_hold_minutes);
  new.payment_proof_submitted_at := null;

  return new;
end;
$$;

create trigger prepare_open_play_signup_before_insert
before insert on public.open_play_signups
for each row execute function public.prepare_open_play_signup();

create table public.sunday_unli_signups (
  id              uuid primary key default pg_catalog.gen_random_uuid(),
  reference       text not null unique default public.next_public_reference(),
  session_id      uuid not null references public.sunday_unli_sessions(id) on delete cascade,
  customer_id     uuid not null references public.customers(id) on delete restrict,
  amount_due      integer not null default 0,
  status          text not null default 'pending',
  hold_expires_at timestamptz,
  payment_proof_submitted_at timestamptz,
  created_at      timestamptz not null default pg_catalog.now(),
  constraint sunday_unli_signup_status check (
    status in ('pending', 'confirmed', 'cancelled', 'no_show')
  ),
  constraint sunday_unli_signup_amount_positive check (amount_due > 0)
);

create unique index sunday_unli_one_active_signup_per_customer
on public.sunday_unli_signups (session_id, customer_id)
where status <> 'cancelled';

create or replace function public.prepare_sunday_unli_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price integer;
  v_hold_minutes integer;
begin
  select price_per_player
  into v_price
  from public.sunday_unli_sessions
  where id = new.session_id
    and status = 'published';

  if v_price is null then
    raise exception 'Sunday unli session is not published';
  end if;

  select hold_minutes
  into v_hold_minutes
  from public.business_settings
  where id = 1;

  new.amount_due := v_price;
  new.status := 'pending';
  new.hold_expires_at :=
    pg_catalog.statement_timestamp() + pg_catalog.make_interval(mins => v_hold_minutes);
  new.payment_proof_submitted_at := null;

  return new;
end;
$$;

create trigger prepare_sunday_unli_signup_before_insert
before insert on public.sunday_unli_signups
for each row execute function public.prepare_sunday_unli_signup();

create table public.payments (
  id                    uuid primary key default pg_catalog.gen_random_uuid(),
  booking_id            uuid unique references public.bookings(id) on delete cascade,
  open_play_signup_id   uuid unique references public.open_play_signups(id) on delete cascade,
  sunday_unli_signup_id uuid unique references public.sunday_unli_signups(id) on delete cascade,
  amount                integer not null default 0,
  gcash_ref             text not null,
  receipt_path          text not null,
  status                text not null default 'unverified',
  verified_at           timestamptz,
  refunded_at           timestamptz,
  created_at            timestamptz not null default pg_catalog.now(),
  constraint payment_one_parent check (
    pg_catalog.num_nonnulls(
      booking_id,
      open_play_signup_id,
      sunday_unli_signup_id
    ) = 1
  ),
  constraint payment_amount_positive check (amount > 0),
  constraint payment_gcash_ref_present check (pg_catalog.length(pg_catalog.btrim(gcash_ref)) > 0),
  constraint payment_receipt_present check (pg_catalog.length(pg_catalog.btrim(receipt_path)) > 0),
  constraint payment_status check (
    status in ('unverified', 'verified', 'rejected', 'refund_pending', 'refunded')
  )
);

create index payments_status_idx on public.payments (status, created_at);

create or replace function public.prepare_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount integer;
begin
  if pg_catalog.num_nonnulls(
    new.booking_id,
    new.open_play_signup_id,
    new.sunday_unli_signup_id
  ) <> 1 then
    raise exception 'Payment must belong to exactly one booking or signup';
  end if;

  if new.booking_id is not null then
    select total_amount
    into v_amount
    from public.bookings
    where id = new.booking_id
      and kind in ('regular', 'recurring')
      and status = 'pending'
      and (
        kind = 'recurring'
        or hold_expires_at > pg_catalog.statement_timestamp()
      );

    if v_amount is null then
      raise exception 'Booking is not awaiting payment';
    end if;

    update public.bookings
    set
      hold_expires_at = null,
      payment_proof_submitted_at = pg_catalog.statement_timestamp()
    where id = new.booking_id;
  elsif new.open_play_signup_id is not null then
    select amount_due
    into v_amount
    from public.open_play_signups
    where id = new.open_play_signup_id
      and status = 'pending'
      and hold_expires_at > pg_catalog.statement_timestamp();

    if v_amount is null then
      raise exception 'Open-play signup is not awaiting payment';
    end if;

    update public.open_play_signups
    set
      hold_expires_at = null,
      payment_proof_submitted_at = pg_catalog.statement_timestamp()
    where id = new.open_play_signup_id;
  else
    select amount_due
    into v_amount
    from public.sunday_unli_signups
    where id = new.sunday_unli_signup_id
      and status = 'pending'
      and hold_expires_at > pg_catalog.statement_timestamp();

    if v_amount is null then
      raise exception 'Sunday unli signup is not awaiting payment';
    end if;

    update public.sunday_unli_signups
    set
      hold_expires_at = null,
      payment_proof_submitted_at = pg_catalog.statement_timestamp()
    where id = new.sunday_unli_signup_id;
  end if;

  new.amount := v_amount;
  new.status := 'unverified';
  new.verified_at := null;
  new.refunded_at := null;

  return new;
end;
$$;

create trigger prepare_payment_before_insert
before insert on public.payments
for each row execute function public.prepare_payment();

create or replace function public.expire_payment_holds()
returns table (
  bookings_cancelled integer,
  open_play_signups_cancelled integer,
  sunday_unli_signups_cancelled integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bookings
  set status = 'cancelled'
  where kind = 'regular'
    and status = 'pending'
    and payment_proof_submitted_at is null
    and hold_expires_at <= pg_catalog.statement_timestamp();

  get diagnostics bookings_cancelled = row_count;

  update public.open_play_signups
  set status = 'cancelled'
  where status = 'pending'
    and payment_proof_submitted_at is null
    and hold_expires_at <= pg_catalog.statement_timestamp();

  get diagnostics open_play_signups_cancelled = row_count;

  update public.sunday_unli_signups
  set status = 'cancelled'
  where status = 'pending'
    and payment_proof_submitted_at is null
    and hold_expires_at <= pg_catalog.statement_timestamp();

  get diagnostics sunday_unli_signups_cancelled = row_count;

  return next;
end;
$$;

create table public.recurring_bookings (
  id           uuid primary key default pg_catalog.gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete restrict,
  court_id     smallint not null references public.courts(id) on delete restrict,
  weekday      smallint not null,
  start_hour   smallint not null,
  duration_hrs smallint not null default 1,
  paddle_count integer not null default 0,
  valid_from   date not null,
  valid_until  date,
  is_active    boolean not null default true,
  created_at   timestamptz not null default pg_catalog.now(),
  constraint recurring_weekday check (weekday between 0 and 6),
  constraint recurring_start_hour check (start_hour between 8 and 23),
  constraint recurring_duration check (
    duration_hrs > 0 and start_hour + duration_hrs <= 24
  ),
  constraint recurring_paddles check (paddle_count >= 0),
  constraint recurring_date_range check (
    valid_until is null or valid_until >= valid_from
  )
);

create index recurring_bookings_active_idx
on public.recurring_bookings (is_active, weekday, valid_from);

alter table public.bookings
add constraint bookings_recurring_rule_fk
foreign key (recurring_rule_id)
references public.recurring_bookings(id)
on delete set null;

alter table public.bookings
add constraint bookings_recurring_rule_matches_kind
check (
  (kind = 'recurring' and recurring_rule_id is not null)
  or (kind <> 'recurring' and recurring_rule_id is null)
);

create table public.recurring_booking_skips (
  id                uuid primary key default pg_catalog.gen_random_uuid(),
  recurring_rule_id uuid not null references public.recurring_bookings(id) on delete cascade,
  occurrence_date   date not null,
  reason            text not null default 'conflict',
  created_at        timestamptz not null default pg_catalog.now(),
  constraint recurring_skip_reason_present check (
    pg_catalog.length(pg_catalog.btrim(reason)) > 0
  ),
  constraint recurring_skip_unique unique (recurring_rule_id, occurrence_date)
);

create or replace function public.payment_belongs_to_current_customer(
  p_booking_id uuid,
  p_open_play_signup_id uuid,
  p_sunday_unli_signup_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when p_booking_id is not null then exists (
        select 1
        from public.bookings b
        join public.customers c on c.id = b.customer_id
        where b.id = p_booking_id
          and c.auth_user_id = (select auth.uid())
      )
      when p_open_play_signup_id is not null then exists (
        select 1
        from public.open_play_signups s
        join public.customers c on c.id = s.customer_id
        where s.id = p_open_play_signup_id
          and c.auth_user_id = (select auth.uid())
      )
      when p_sunday_unli_signup_id is not null then exists (
        select 1
        from public.sunday_unli_signups s
        join public.customers c on c.id = s.customer_id
        where s.id = p_sunday_unli_signup_id
          and c.auth_user_id = (select auth.uid())
      )
      else false
    end;
$$;

alter table public.business_settings enable row level security;
alter table public.courts enable row level security;
alter table public.rate_blocks enable row level security;
alter table public.customers enable row level security;
alter table public.admin_users enable row level security;
alter table public.sunday_unli_sessions enable row level security;
alter table public.bookings enable row level security;
alter table public.open_play_sessions enable row level security;
alter table public.open_play_signups enable row level security;
alter table public.sunday_unli_signups enable row level security;
alter table public.payments enable row level security;
alter table public.recurring_bookings enable row level security;
alter table public.recurring_booking_skips enable row level security;

revoke all on table public.business_settings from anon, authenticated;
revoke all on table public.courts from anon, authenticated;
revoke all on table public.rate_blocks from anon, authenticated;
revoke all on table public.customers from anon, authenticated;
revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.sunday_unli_sessions from anon, authenticated;
revoke all on table public.bookings from anon, authenticated;
revoke all on table public.open_play_sessions from anon, authenticated;
revoke all on table public.open_play_signups from anon, authenticated;
revoke all on table public.sunday_unli_signups from anon, authenticated;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.recurring_bookings from anon, authenticated;
revoke all on table public.recurring_booking_skips from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on table
  public.business_settings,
  public.courts,
  public.rate_blocks,
  public.sunday_unli_sessions,
  public.open_play_sessions
to anon, authenticated;

grant update on table
  public.business_settings,
  public.courts
to authenticated;

grant insert, update, delete on table
  public.rate_blocks,
  public.sunday_unli_sessions,
  public.open_play_sessions
to authenticated;

grant select, insert on table public.customers to authenticated;
grant update (full_name, phone) on table public.customers to authenticated;

grant select, insert, update, delete on table
  public.admin_users,
  public.bookings,
  public.open_play_signups,
  public.sunday_unli_signups,
  public.payments,
  public.recurring_bookings,
  public.recurring_booking_skips
to authenticated;

grant usage, select on sequence public.public_reference_seq to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy business_settings_public_read
on public.business_settings for select
to anon, authenticated
using (true);

create policy business_settings_admin_all
on public.business_settings for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy courts_public_read
on public.courts for select
to anon, authenticated
using (true);

create policy courts_admin_all
on public.courts for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy rate_blocks_public_read
on public.rate_blocks for select
to anon, authenticated
using (true);

create policy rate_blocks_admin_all
on public.rate_blocks for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy customers_read_own
on public.customers for select
to authenticated
using (auth_user_id = (select auth.uid()));

create policy customers_create_own
on public.customers for insert
to authenticated
with check (
  auth_user_id = (select auth.uid())
  and pg_catalog.lower(email) = pg_catalog.lower((select auth.jwt() ->> 'email'))
  and is_coach = false
);

create policy customers_update_own
on public.customers for update
to authenticated
using (auth_user_id = (select auth.uid()))
with check (auth_user_id = (select auth.uid()));

create policy customers_admin_all
on public.customers for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy admin_users_read_own
on public.admin_users for select
to authenticated
using (user_id = (select auth.uid()));

create policy admin_users_admin_all
on public.admin_users for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy sunday_unli_sessions_public_read
on public.sunday_unli_sessions for select
to anon, authenticated
using (status = 'published');

create policy sunday_unli_sessions_admin_all
on public.sunday_unli_sessions for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy bookings_read_own
on public.bookings for select
to authenticated
using (customer_id = (select public.current_customer_id()));

create policy bookings_create_own_regular
on public.bookings for insert
to authenticated
with check (
  kind = 'regular'
  and status = 'pending'
  and customer_id = (select public.current_customer_id())
);

create policy bookings_admin_all
on public.bookings for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy open_play_sessions_public_read
on public.open_play_sessions for select
to anon, authenticated
using (is_published = true);

create policy open_play_sessions_admin_all
on public.open_play_sessions for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy open_play_signups_read_own
on public.open_play_signups for select
to authenticated
using (customer_id = (select public.current_customer_id()));

create policy open_play_signups_create_own
on public.open_play_signups for insert
to authenticated
with check (
  customer_id = (select public.current_customer_id())
  and status = 'pending'
);

create policy open_play_signups_admin_all
on public.open_play_signups for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy sunday_unli_signups_read_own
on public.sunday_unli_signups for select
to authenticated
using (customer_id = (select public.current_customer_id()));

create policy sunday_unli_signups_create_own
on public.sunday_unli_signups for insert
to authenticated
with check (
  customer_id = (select public.current_customer_id())
  and status = 'pending'
);

create policy sunday_unli_signups_admin_all
on public.sunday_unli_signups for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy payments_read_own
on public.payments for select
to authenticated
using (
  public.payment_belongs_to_current_customer(
    booking_id,
    open_play_signup_id,
    sunday_unli_signup_id
  )
);

create policy payments_create_own
on public.payments for insert
to authenticated
with check (
  status = 'unverified'
  and public.payment_belongs_to_current_customer(
    booking_id,
    open_play_signup_id,
    sunday_unli_signup_id
  )
);

create policy payments_admin_all
on public.payments for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy recurring_bookings_read_own
on public.recurring_bookings for select
to authenticated
using (customer_id = (select public.current_customer_id()));

create policy recurring_bookings_admin_all
on public.recurring_bookings for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy recurring_booking_skips_admin_all
on public.recurring_booking_skips for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create or replace function public.get_court_availability(p_day date)
returns table (
  court_id smallint,
  court_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  court_price integer,
  availability_status text,
  entry_id uuid,
  entry_price integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with slots as (
    select
      c.id as court_id,
      c.name as court_name,
      (
        p_day::timestamp + pg_catalog.make_interval(hours => slot_hour)
      ) at time zone 'Asia/Manila' as starts_at,
      (
        p_day::timestamp + pg_catalog.make_interval(hours => slot_hour + 1)
      ) at time zone 'Asia/Manila' as ends_at,
      slot_hour
    from public.courts c
    cross join public.business_settings settings
    cross join lateral pg_catalog.generate_series(
      settings.opening_hour::integer,
      settings.closing_hour::integer - 1
    ) as hours(slot_hour)
    where c.is_active = true
  )
  select
    slots.court_id,
    slots.court_name,
    slots.starts_at,
    slots.ends_at,
    rb.price_per_hour as court_price,
    case
      when occupied.id is null then 'available'
      when occupied.kind in ('regular', 'recurring') then 'booked'
      when occupied.kind = 'blocked' then 'blocked'
      when occupied.kind = 'open_play' and op.is_published then 'open_play'
      when occupied.kind = 'sunday_unli' and su.status = 'published' then 'sunday_unli'
      else 'booked'
    end as availability_status,
    case
      when occupied.kind = 'open_play' and op.is_published then op.id
      when occupied.kind = 'sunday_unli' and su.status = 'published' then su.id
      else null
    end as entry_id,
    case
      when occupied.kind = 'open_play' and op.is_published then op.price_per_player
      when occupied.kind = 'sunday_unli' and su.status = 'published' then su.price_per_player
      else null
    end as entry_price
  from slots
  join public.rate_blocks rb
    on slots.slot_hour >= rb.start_hour
    and slots.slot_hour < rb.end_hour
  left join lateral (
    select b.id, b.kind, b.sunday_unli_session_id
    from public.bookings b
    where b.court_id = slots.court_id
      and b.status <> 'cancelled'
      and b.starts_at < slots.ends_at
      and b.ends_at > slots.starts_at
    limit 1
  ) occupied on true
  left join public.open_play_sessions op
    on op.booking_id = occupied.id
  left join public.sunday_unli_sessions su
    on su.id = occupied.sunday_unli_session_id
  order by slots.starts_at, slots.court_id;
$$;

create or replace view public.revenue_daily
with (security_invoker = true)
as
with revenue_items as (
  select
    pg_catalog.timezone('Asia/Manila', b.starts_at)::date as day,
    p.amount as collected,
    1::integer as booking_count,
    (
      extract(epoch from (b.ends_at - b.starts_at)) / 3600
    )::numeric as court_hours,
    0::integer as open_play_heads,
    0::integer as sunday_unli_heads
  from public.payments p
  join public.bookings b on b.id = p.booking_id
  where p.status = 'verified'
    and b.status = 'confirmed'
    and b.kind in ('regular', 'recurring')

  union all

  select
    pg_catalog.timezone('Asia/Manila', b.starts_at)::date as day,
    p.amount as collected,
    0::integer as booking_count,
    0::numeric as court_hours,
    1::integer as open_play_heads,
    0::integer as sunday_unli_heads
  from public.payments p
  join public.open_play_signups signup on signup.id = p.open_play_signup_id
  join public.open_play_sessions session on session.id = signup.session_id
  join public.bookings b on b.id = session.booking_id
  where p.status = 'verified'
    and signup.status = 'confirmed'
    and b.status = 'confirmed'
    and session.is_published = true

  union all

  select
    pg_catalog.timezone('Asia/Manila', session.starts_at)::date as day,
    p.amount as collected,
    0::integer as booking_count,
    0::numeric as court_hours,
    0::integer as open_play_heads,
    1::integer as sunday_unli_heads
  from public.payments p
  join public.sunday_unli_signups signup on signup.id = p.sunday_unli_signup_id
  join public.sunday_unli_sessions session on session.id = signup.session_id
  where p.status = 'verified'
    and signup.status = 'confirmed'
    and session.status = 'published'
)
select
  day,
  pg_catalog.sum(collected)::bigint as collected,
  pg_catalog.sum(booking_count)::bigint as booking_count,
  pg_catalog.sum(court_hours)::numeric(10, 2) as court_hours,
  pg_catalog.sum(open_play_heads)::bigint as open_play_heads,
  pg_catalog.sum(sunday_unli_heads)::bigint as sunday_unli_heads
from revenue_items
group by day;

revoke all on function public.next_public_reference() from public;
revoke all on function public.is_valid_court_period(timestamptz, timestamptz) from public;
revoke all on function public.is_admin() from public;
revoke all on function public.current_customer_id() from public;
revoke all on function public.payment_belongs_to_current_customer(uuid, uuid, uuid) from public;
revoke all on function public.get_court_availability(date) from public;
revoke all on function public.prepare_booking() from public;
revoke all on function public.validate_open_play_booking() from public;
revoke all on function public.prepare_open_play_signup() from public;
revoke all on function public.prepare_sunday_unli_signup() from public;
revoke all on function public.prepare_payment() from public;
revoke all on function public.expire_payment_holds() from public;

grant execute on function public.next_public_reference() to authenticated, service_role;
grant execute on function public.is_valid_court_period(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.current_customer_id() to authenticated, service_role;
grant execute on function public.payment_belongs_to_current_customer(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.get_court_availability(date) to anon, authenticated, service_role;
grant execute on function public.prepare_booking() to authenticated, service_role;
grant execute on function public.validate_open_play_booking() to authenticated, service_role;
grant execute on function public.prepare_open_play_signup() to authenticated, service_role;
grant execute on function public.prepare_sunday_unli_signup() to authenticated, service_role;
grant execute on function public.prepare_payment() to authenticated, service_role;
grant execute on function public.expire_payment_holds() to service_role;

revoke all on table public.revenue_daily from anon, authenticated;
grant select on table public.revenue_daily to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy receipt_owner_upload
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy receipt_owner_read
on storage.objects for select
to authenticated
using (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy receipt_admin_read
on storage.objects for select
to authenticated
using (
  bucket_id = 'payment-receipts'
  and (select public.is_admin())
);

commit;
