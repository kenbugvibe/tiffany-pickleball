# Tiffany's Pickleball Court — Build Spec

A booking and management system for a 3 court pickleball business in Panabo City, Davao del Norte.

This document is the project brief. Paste it into Claude Code as your first message, then work through the phases one at a time.

---

## 1. Who uses this

**Customers** book courts from their phone. Most traffic will be mobile. They pick a day, pick a court, pick an hour, optionally rent paddles, pay via GCash, and upload a screenshot of the receipt.

**Tiffany** is the only owner-side user. There are no staff accounts, no permission levels, and no audit log. She verifies GCash receipts, blocks courts for maintenance, schedules open play, and checks revenue.

---

## 2. Stack

| Layer | Choice | Plan |
|---|---|---|
| Framework | Next.js (App Router, TypeScript) | Free |
| Database, auth, file storage | Supabase | Free tier |
| Hosting | Vercel | Hobby (free) |
| Customer email | Resend | Free, 3,000/month |
| Owner alerts | Telegram Bot API | Free |
| Styling | Tailwind CSS | Free |

Do not add a state management library, an ORM, or a component library. Use the Supabase JS client directly and plain React state. This project is small enough that extra layers only add failure points.

---

## 3. Business rules

These come from the existing design. Encode them in the database, not hardcoded in components.

**Operating hours:** 8:00 AM to 12:00 midnight, daily. Bookings are 1 hour slots.

**Court rates (per hour, per court):**

| Window | Rate |
|---|---|
| 8:00 AM to 12:00 NN | PHP 200 |
| 12:00 NN to 4:00 PM | PHP 250 |
| 4:00 PM to 12:00 MN | PHP 300 |

**Paddle rental:** PHP 50 per paddle, per hour.

**Open play:** Tiffany publishes a session on a specific court and hour with a player cap. The per head price is the slot rate divided by the cap. A PHP 300 evening slot with a cap of 10 is PHP 30 per player. Customers join individually.

**Sunday unli play:** Every Sunday, 7:00 PM to 12:00 MN, all three courts. Flat PHP 120 per player, stay as long as you like. This is not hourly and does not use the rate table.

**Payment:** GCash only, manual verification. There is no GCash API available for a business this size, so do not attempt to automate confirmation. The customer sends money, screenshots the receipt, and uploads it. Tiffany approves or rejects.

---

## 4. Database schema

Run this in the Supabase SQL editor. Do not let the app create tables at runtime.

```sql
create extension if not exists btree_gist;

set timezone = 'Asia/Manila';

-- Courts
create table courts (
  id           int primary key,
  name         text not null,
  is_active    boolean not null default true
);

insert into courts (id, name) values (1, 'Court 1'), (2, 'Court 2'), (3, 'Court 3');

-- Rate windows
create table rate_blocks (
  id            serial primary key,
  label         text not null,
  start_hour    int  not null check (start_hour between 0 and 23),
  end_hour      int  not null check (end_hour between 1 and 24),
  price_per_hour int not null,
  sunday_only   boolean not null default false
);

insert into rate_blocks (label, start_hour, end_hour, price_per_hour) values
  ('Morning', 8, 12, 200),
  ('Midday', 12, 16, 250),
  ('Evening', 16, 24, 300);

-- Customers
create table customers (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  full_name    text not null,
  phone        text,
  email        text,
  is_coach     boolean not null default false,
  created_at   timestamptz not null default now()
);

create index on customers (phone);
create index on customers (auth_user_id);

-- Bookings. Blocked courts and walk-ins live here too.
create table bookings (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references customers(id) on delete set null,
  court_id      int  not null references courts(id),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  kind          text not null check (kind in ('regular','walk_in','blocked','open_play','unli','recurring')),
  paddle_count  int  not null default 0 check (paddle_count >= 0),
  court_fee     int  not null default 0,
  paddle_fee    int  not null default 0,
  total_amount  int  not null default 0,
  status        text not null default 'pending'
                check (status in ('pending','confirmed','cancelled','no_show')),
  block_reason  text,
  internal_note text,
  created_at    timestamptz not null default now(),
  constraint valid_range check (ends_at > starts_at)
);

-- THE IMPORTANT ONE. Makes double booking impossible at the database level.
alter table bookings add constraint no_overlap
  exclude using gist (
    court_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled');

create index on bookings (starts_at);
create index on bookings (status);

-- Payments
create table payments (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references bookings(id) on delete cascade,
  amount       int  not null,
  gcash_ref    text,
  receipt_path text,
  status       text not null default 'unverified'
               check (status in ('unverified','verified','rejected','refunded')),
  verified_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index on payments (status);

-- Open play sessions
create table open_play_sessions (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references bookings(id) on delete cascade,
  price_per_player int not null,
  max_players      int not null check (max_players > 0),
  is_published     boolean not null default false
);

create table open_play_signups (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references open_play_sessions(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  amount_due  int not null,
  status      text not null default 'pending'
              check (status in ('pending','paid','cancelled')),
  created_at  timestamptz not null default now(),
  unique (session_id, customer_id)
);

-- Recurring bookings (coaches, weekly regulars)
create table recurring_bookings (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  court_id     int  not null references courts(id),
  weekday      int  not null check (weekday between 0 and 6),
  start_hour   int  not null,
  duration_hrs int  not null default 1,
  valid_from   date not null,
  valid_until  date,
  is_active    boolean not null default true
);
```

**Why open play sessions point at a booking:** an open play block occupies a real court for a real hour. Reusing the bookings table means the overlap constraint protects it automatically. You do not have to write separate conflict logic.

**Why recurring bookings do not generate rows forever:** a scheduled job materialises the next 8 weeks of rows into `bookings` with `kind = 'recurring'`. If a coach cancels one week, you delete that single booking row, not the recurring rule.

---

## 5. Revenue queries

There is no revenue table. Create views instead.

```sql
create view revenue_daily as
select
  (b.starts_at at time zone 'Asia/Manila')::date as day,
  count(*)                                        as booking_count,
  sum(b.total_amount)                             as revenue,
  sum(extract(epoch from (b.ends_at - b.starts_at)) / 3600) as court_hours
from bookings b
join payments p on p.booking_id = b.id
where p.status = 'verified'
  and b.status = 'confirmed'
group by 1;
```

Week, month, and year totals are `sum(revenue)` over a date range on this view. Do not build separate weekly and monthly tables.

---

## 6. Row level security

Enable RLS on every table. Tiffany is identified by a single admin flag.

```sql
alter table bookings enable row level security;
alter table payments enable row level security;
alter table customers enable row level security;

create or replace function is_admin() returns boolean as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$ language sql stable;

create policy admin_all_bookings on bookings
  for all using (is_admin()) with check (is_admin());

create policy read_own_bookings on bookings
  for select using (
    customer_id in (select id from customers where auth_user_id = auth.uid())
  );

create policy create_own_bookings on bookings
  for insert with check (
    customer_id in (select id from customers where auth_user_id = auth.uid())
  );
```

Set Tiffany's role once, manually, in the Supabase dashboard under Authentication, then edit her user's `app_metadata` to `{"role": "admin"}`.

Availability must be readable by everyone including logged out visitors. Expose it through a database function that returns only court, time, and free/busy, never customer names.

---

## 7. Authentication

Use email plus password, Google, and Facebook. Supabase supports all three on the free tier.

**Do not use phone OTP.** SMS costs PHP 1 to 3 per message and there is no free tier. Collect the phone number as a normal form field on signup so Tiffany can call people, but do not use it to log in.

Allow guest checkout. Many customers will book once and never return. A guest booking creates a `customers` row with no `auth_user_id`. If they later sign up with the same phone number, link the records.

---

## 8. Notifications

**To Tiffany, via Telegram.** Create a bot through @BotFather, get the token, get her chat ID, store both as environment variables. Fire a message on: new booking with receipt uploaded, booking cancelled, open play session filling to capacity.

Telegram is the right choice here because it is free, instant, and delivers to her phone as a push notification. Email sits unread.

**To customers, via Resend.** Send on: booking submitted (slot held, awaiting verification), payment verified (confirmed, with booking reference), booking cancelled or rejected.

Send both from Next.js route handlers, not from the browser. Never expose API keys client side.

---

## 9. UI direction

The current design has too many owner screens. Collapse to three.

**Owner console**

1. **Today.** Live 3 court timeline for the current day, the verify queue, and a walk-in button. This is the screen Tiffany keeps open.
2. **Calendar.** Week view. Block courts, publish open play, manage recurring bookings.
3. **Money.** Date range picker, four numbers (collected, bookings, court hours, open play heads), a bar chart by day, a bookings table, and a CSV export button.

**Customer flow**

Keep it to the existing five steps, which are already well designed: pick court, pick hour, paddles, GCash QR, upload proof. Do not add screens.

**Mobile rules.** Tap targets minimum 44px. Time slot grid is 2 columns on phones, not 3. The GCash reference number field should use `inputmode="numeric"`. Receipt upload must accept camera capture directly.

---

## 10. Build phases

Complete and test each phase before starting the next. Do not build ahead.

### Phase 1: Database
Run all SQL above. Add sample data by hand in the table editor. Verify that inserting two overlapping bookings on the same court is rejected by the constraint.

**Done when:** the overlap constraint throws an error and the revenue view returns numbers.

### Phase 2: Customer booking
Availability grid, court selection, hour selection, paddle count, price calculation, GCash screen, receipt upload to Supabase Storage, confirmation screen with booking reference.

**Done when:** a booking made on a phone browser appears in the database with a receipt file attached.

### Phase 3: Owner Today screen
Login as admin, live court timeline, verify queue with one tap approve and reject, walk-in booking form.

**Done when:** Tiffany can approve a real receipt and the customer's status flips to confirmed.

### Phase 4: Notifications
Telegram on new booking, Resend on submitted and verified.

**Done when:** both fire reliably on a real booking.

### Phase 5: Money screen
Date range revenue, chart, bookings table with filters, CSV export.

**Done when:** the revenue number matches a hand count of verified payments for that week.

### Phase 6: Calendar, open play, recurring
Blocking courts, publishing open play with player caps and signups, recurring bookings with the 8 week materialisation job on Vercel Cron.

---

## 11. Things that will bite you

**Timezone.** Set `Asia/Manila` in Postgres, in the Next.js config, and in every date formatter. The default is UTC and an 8 hour shift is easy to miss until someone shows up at the wrong time.

**Peso formatting.** Store amounts as integers in pesos. No decimals, no floats. Format with `Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })`.

**Receipt file size.** Phone screenshots are 2 to 5 MB. Compress client side before upload or the free 1 GB storage fills in a few months. Target 300 KB.

**Sunday unli play does not use the rate table.** It is a separate code path. Test it explicitly.

**Held slots.** The design shows a 30 minute hold while the customer pays. Implement this as a `pending` booking that a cron job cancels after 30 minutes. The overlap constraint already blocks others from taking it.

**Supabase free tier pauses after 7 days of no activity.** During development this is fine, you just unpause it. Once live it will not happen because there will be traffic. If it does become an issue, Supabase Pro is USD 25 per month.

---

## 12. Costs

| Item | Cost |
|---|---|
| Everything above, free tiers | PHP 0 |
| Domain name | ~PHP 700 per year |
| Supabase Pro, only if you outgrow free | ~PHP 1,400 per month |

Start free. A 3 court business will not come close to the free tier limits.
