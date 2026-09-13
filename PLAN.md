# Tiffany's Pickleball Court — Project Plan

This is the working project plan. It will be expanded one planning step at a time and updated with Tiffany's decisions before implementation begins.

## Planning checklist

- [x] Step 1: Inventory every screen in the reference HTML
- [x] Step 2: Identify conflicts between the design and build specification
- [x] Step 3: List required assumptions and confidence levels
- [x] Step 4: List everything required before Phase 1
- [ ] Step 5: Propose the project file and folder structure
- [ ] Review and incorporate final corrections
- [ ] Begin Phase 1 only after the plan is approved

## Step 1 — Screen inventory

### Mobile customer flow

1. **Sign in** — Lets customers sign in, recover a password, create an account, or continue with Google or Facebook. Guest checkout has been removed by decision.
2. **Select court** — Shows all three indoor courts, court photos, and the number of available slots. It also promotes Sunday unli play.
3. **Select time** — Lets the customer choose a date and one-hour slot. Each slot shows its price or status, including booked, open play, and Sunday unli play.
4. **Court fee and paddles** — Summarizes the selected court and time, supports paddle rental quantities, and calculates the total.
5. **GCash payment** — Shows the amount due, a 30-minute slot-hold countdown, GCash QR code, account details, and payment instructions.
6. **Send payment proof** — Accepts a receipt screenshot, GCash reference number, and an optional note for Tiffany.
7. **Thank-you confirmation** — Displays the booking reference, schedule, court, paddles, amount, and GCash reference, with directions, calendar export, and another-booking actions.

### Desktop customer screens

8. **Customer booking — day rail** — A combined page with navigation, rates, dates, hourly availability, open play, a booking summary, paddle selection, GCash checkout, and court location details.
9. **Customer booking — hour-by-court grid** — An alternative layout that shows every court and hour in one grid for comparison before payment.

### Owner screens

10. **Owner dashboard / Today** — Shows daily metrics, a live three-court timeline, upcoming bookings, the receipt-verification queue, open play, and Sunday unli play. The mockup provides walk-in, court-blocking, and open-play actions, but walk-ins have since been removed from the approved scope.
11. **Owner schedule — hour-by-court grid** — Shows hourly rows across the three courts, including bookings, open play, unverified payments, blocked periods, and a court-blocking panel.
12. **Owner schedule — horizontal court lanes** — An alternative schedule with a horizontal timeline per court, movable/resizable blocks, and an open-play publishing panel.
13. **Owner bookings and payment verification** — Provides search, filters, CSV export, booking/payment statuses, and receipt-review actions.

### Design references that are not complete screens

The mockup includes navigation or buttons for these areas, but does not provide their complete screens:

- Customer **My bookings**
- Dedicated customer **Open play**
- Dedicated **Rates**
- Owner **Courts & rates**
- Owner **Reports/Money**
- Owner open-play participant management
- Walk-in booking form (shown or referenced by the design, but removed from the approved product scope)
- Password recovery and account creation
- Customer unli-play registration

### Screens beyond the build specification

The distinct **Owner bookings and payment-verification screen** is not part of the specification's final three-screen owner structure. The specification places the verification queue on **Today** and booking records on **Money**.

The design also introduces UI behavior not expressly defined in the specification: saving the GCash QR, adding a booking to a calendar, calling/getting directions, requesting a replacement receipt, and dragging bookings to move or resize them.

## Step 2 — Design and specification decisions

Step 2 remains in progress. Decisions will be recorded here as Tiffany resolves each conflict.

### Resolved decisions

#### Authentication requirement

- Guest checkout is removed.
- A customer must have an account before completing a booking.
- Password login uses email, not a mobile number. Do not build phone-number authentication or phone OTP.
- Logged-out visitors may view court availability. They must sign in before they can reserve or join.

#### Ordinary court bookings and cost sharing

- The system will not calculate or manage per-player prices for ordinary court bookings.
- One customer is responsible for each court reservation and pays the full court fee.
- The customer and the other players may divide the cost privately; that arrangement is outside the system.
- Do not store an ordinary booking's player count, player cap, individual shares, or individual player payments.
- Remove the proposed formula that divides the court rate by a player cap.
- Customers may reserve multiple consecutive one-hour slots in one booking.

#### Regular open play

- Regular open play remains part of the system.
- Tiffany can publish an open-play event on the customer calendar for a chosen day and time.
- Customers can enter or join the published open-play event individually.
- Regular open play costs a flat **PHP 120 per person**. Do not calculate its price by dividing the court's hourly rate by the player cap.
- Open-play customers use the same GCash proof and manual verification process as ordinary bookings.
- Do not enforce or display an open-play participant capacity for the initial version. Capacity may be added later.
- This is separate from an ordinary court reservation, where one customer books and pays for the whole court.
- Sunday unli play remains a separate business rule and is not changed by this decision.

#### Court blocking and customer contact

- Tiffany may block a court even when the selected period contains bookings.
- The affected customers must be notified before their bookings are cancelled and the court is blocked.
- Customer notifications use email, not SMS.

#### Optional design features

- The optional design features remain open for consideration during the relevant build phase.
- Do not silently include them. Add each feature only after it is discussed and approved during implementation.

#### Booking and payment confirmation

- Uploading a receipt reserves the court but leaves the booking in `pending` status.
- The booking becomes `confirmed` only after Tiffany verifies the payment.
- If Tiffany rejects a receipt, cancel the reservation, release the slot immediately, and email the customer.
- A request-for-another-receipt workflow is not included initially and may be considered later.

#### Sunday unli registration

- One PHP 120 registration covers the complete Sunday session from 7:00 PM–12:00 midnight.
- Customers do not select an individual court or hour for Sunday unli.
- Each participant pays PHP 120 and uploads their own GCash receipt for manual verification.

#### Regular open-play duration and entry

- Tiffany selects an open-play start and end time in one-hour increments.
- An event may span multiple consecutive hours.
- The price remains PHP 120 per participant for the complete published event.
- One customer account may register only once for each open-play event.

#### Blocking an occupied court

When Tiffany blocks a period containing existing bookings, the system must:

1. Show all affected bookings.
2. Ask Tiffany to confirm the action.
3. Email the affected customers.
4. Cancel the affected bookings.
5. Create the court block.
6. Mark verified payments as `refund_pending`.
7. Let Tiffany manually return the money and mark each payment as `refunded`.

#### Recurring-booking conflicts

- An existing reservation wins when a generated recurring occurrence would overlap it.
- Skip only the conflicting recurring occurrence and alert Tiffany.

#### Customer and booking identifiers

- Required customer fields are full name, email address, and Philippine mobile number.
- Public booking references use `TPC-YYMM-####`, for example `TPC-2609-0163`.

#### Walk-ins

- Walk-in bookings are removed from the product.
- Do not include a walk-in button, walk-in form, `walk_in` booking kind, or walk-in payment workflow.

### Unresolved Step 2 decisions

- Whether the owner console uses three consolidated screens or the larger navigation shown in the mockup
- Whether the owner calendar is a day grid, horizontal day lanes, a week view, or more than one view
- Where the full booking list and receipt-review tools belong
- Whether revenue and occupancy remain visible on Today
- How the five booking steps should be numbered

## Step 3 — Assumption register

Items marked **Confident** are supported by the build specification, reference design, or a decision Tiffany has already made. Items marked **Guessing** are not safe to implement until Tiffany confirms them.

### Business and court rules

- **Confident —** The business operates three courts named Court 1, Court 2, and Court 3 in Panabo City, Davao del Norte.
- **Confident —** The design describes all three courts as indoor courts.
- **Confident —** Normal operating hours are daily from 8:00 AM until 12:00 midnight in the `Asia/Manila` timezone.
- **Confident —** Court rates are PHP 200 from 8:00 AM–12:00 NN, PHP 250 from 12:00 NN–4:00 PM, and PHP 300 from 4:00 PM–12:00 MN.
- **Confident —** Paddle rental costs PHP 50 per paddle per hour.
- **Guessing —** The maximum paddle quantity is eight; that limit appears in the design logic but not in the build specification.
- **Confident —** A customer may reserve several adjacent one-hour slots as one multi-hour booking.

### Customer accounts and access

- **Confident —** Guest checkout is removed; a customer needs an account to complete a booking.
- **Confident —** Google and Facebook sign-in remain supported unless Tiffany removes them later.
- **Confident —** Password login uses email. Mobile-number login and phone OTP are excluded because they add messaging costs.
- **Confident —** Logged-out visitors can browse availability but must sign in before reserving a slot or joining open play.
- **Confident —** A phone number is collected in the customer profile so Tiffany can contact the customer.
- **Confident —** Every customer account requires a full name, email address, and Philippine mobile number.

### Ordinary bookings and GCash payments

- **Confident —** One customer books the entire court and is responsible for the full court fee.
- **Confident —** Cost sharing between that customer and other players is private and is not stored or calculated by the system.
- **Confident —** GCash is the only online payment method, and there is no automated GCash payment confirmation.
- **Confident —** The selected slot is held for 30 minutes while the customer pays and uploads proof.
- **Confident —** A pending hold prevents another customer from taking the same court and time.
- **Confident —** If no proof is submitted before the hold expires, a scheduled job cancels the hold and releases the slot.
- **Confident —** Receipt upload reserves the slot but leaves the booking pending until Tiffany approves it.
- **Confident —** Tiffany manually reviews every submitted GCash receipt and can approve or reject it.
- **Confident —** Rejecting a receipt cancels the reservation, releases the court immediately, and emails the customer.
- **Guessing —** Customers cannot cancel bookings directly in the app and must contact Tiffany. No cancellation policy or self-service cancellation flow is defined.
- **Confident —** Public booking references use `TPC-YYMM-####`, for example `TPC-2609-0163`.

### Regular open play

- **Confident —** Tiffany can publish a regular open-play event on the customer calendar for a chosen court, day, and time.
- **Confident —** Customers join a published regular open-play event individually for a flat PHP 120 per person.
- **Confident —** The court-rate-divided-by-player-cap formula is removed.
- **Confident —** An open-play event occupies its assigned court and prevents an ordinary booking from overlapping it.
- **Confident —** The initial version does not enforce or display a regular open-play participant capacity.
- **Confident —** Tiffany chooses an open-play start and end in one-hour increments, and an event may span multiple hours while remaining PHP 120 per participant for the complete event.
- **Confident —** Every participant follows the GCash proof and manual verification process for their own PHP 120 open-play entry.
- **Confident —** A customer account may join each open-play event only once.

### Sunday unli play

- **Confident —** Sunday unli play runs every Sunday from 7:00 PM–12:00 midnight, uses all three courts, and costs PHP 120 per player.
- **Confident —** Customers register once for the entire five-hour Sunday unli period and do not select a court or individual hour.
- **Guessing —** Sunday unli play has no participant cap; neither source defines one.
- **Confident —** Each Sunday unli participant uploads an individual GCash receipt for manual verification.

### Owner operations

- **Confident —** Tiffany is the only owner-side account. There are no staff roles, permission levels, or audit log.
- **Guessing —** The final owner console will use the specification's three destinations: Today, Calendar, and Money. The design shows additional destinations.
- **Guessing —** Calendar will include both a week view and a detailed day view. The specification asks for a week view, while the mockups only show day views.
- **Guessing —** The full booking table and CSV export will live on Money, while the short verification queue remains on Today.
- **Confident —** Tiffany can block an occupied period. The system first shows affected bookings and asks for confirmation, then emails the customers, cancels the bookings, creates the block, and marks verified payments as refund pending until Tiffany manually completes each refund.
- **Guessing —** Moving and resizing bookings by dragging will not be included unless Tiffany explicitly approves the feature.
- **Confident —** Walk-in bookings and the walk-in UI are removed. Tiffany can publish open play, block courts, and manage recurring bookings.
- **Confident —** Recurring rules materialize the next eight weeks of court bookings.
- **Confident —** When a recurring occurrence conflicts with an existing booking, the existing booking wins, that occurrence is skipped, and Tiffany is alerted.

### Notifications

- **Confident —** Tiffany receives Telegram alerts for new receipt uploads and cancellations. A capacity alert is excluded while open play has no enforced capacity.
- **Confident —** Customers receive email through Resend. Customer SMS notifications are excluded.
- **Guessing —** The two-hour reminder for an unverified receipt is excluded unless Tiffany approves it and selects a notification channel.
- **Confident —** Rejecting a receipt cancels and releases the reservation. Receipt resubmission is not included initially and remains an optional future feature.

### Interface and optional behavior

- **Confident —** The product is mobile-first, uses at least 44-pixel tap targets, and shows time slots in two columns on phones.
- **Confident —** The reference design's green, gold, and cream palette and its Zilla Slab, DM Sans, and IBM Plex Mono typography guide the interface.
- **Guessing —** The five booking steps are court, time, paddles, GCash payment, and receipt proof; sign-in and confirmation sit outside the numbered steps.
- **Guessing —** The desktop customer page uses the day-rail layout rather than the alternative hour-by-court grid.
- **Confident —** Save QR, add to calendar, call, directions, receipt resubmission, and drag/resize remain optional. Each may be considered during its relevant phase but is not included automatically.
- **Guessing —** Customer My Bookings, dedicated Open Play, password recovery, account creation, and participant-management screens need new designs based on the existing visual system.

### Technical and data handling

- **Confident —** The stack is Next.js App Router with TypeScript, Supabase, Vercel, Resend, Telegram, and Tailwind CSS.
- **Confident —** The app uses the Supabase JavaScript client directly, plain React state, and no ORM, component library, or separate state-management library.
- **Confident —** Rates and availability rules live in the database instead of being duplicated as component constants.
- **Confident —** Money is stored as whole Philippine pesos, never floating-point values.
- **Confident —** Revenue includes only confirmed bookings backed by verified payments.
- **Confident —** Receipt images are compressed to approximately 300 KB before upload and support direct camera capture on phones.
- **Guessing —** Receipt files are stored privately and opened by Tiffany through short-lived signed URLs. The specification requires storage but does not define access rules.
- **Confident —** Row-level security applies to every table, and public availability exposes no customer identity.
- **Guessing —** Expired holds and recurring-booking generation run frequently enough through Vercel Cron to keep availability current; the exact schedules are not yet defined.

## Step 4 — What is needed before Phase 1

Phase 1 creates and tests the database. The items below are divided into true Phase 1 blockers and credentials or assets that can wait until later.

### Decisions required before the database schema is final

- [x] **Confirmation lifecycle:** Receipt upload reserves the slot; Tiffany's approval changes the booking from pending to confirmed.
- [x] **Sunday unli registration:** One PHP 120 signup covers the complete Sunday 7:00 PM–12:00 midnight session without selecting a court or hour.
- [x] **Sunday unli payment:** Every participant uploads an individual GCash receipt for manual verification.
- [x] **Regular open-play duration:** Tiffany may publish multi-hour events using one-hour increments; PHP 120 covers the complete event.
- [x] **Rejected receipt behavior:** Rejection cancels and releases the reservation immediately and emails the customer.
- [x] **Court-blocking transaction:** Show affected bookings, confirm, email customers, cancel bookings, create the block, and track manual refunds through refund-pending and refunded states.
- [x] **Walk-ins:** Remove walk-in bookings and their payment workflow entirely.
- [x] **Recurring-booking conflicts:** Keep the existing reservation, skip the conflicting occurrence, and alert Tiffany.
- [x] **Public booking reference:** Use `TPC-YYMM-####`.
- [x] **Required profile fields:** Require full name, email address, and Philippine mobile number.

### Supabase setup required to run Phase 1

- [x] A Supabase account owned by Tiffany or the business
- [x] A new Supabase project for this application
- [x] The project's region and project name selected during project creation
- [ ] Access to the project's SQL Editor so the Phase 1 migration can be run
- [ ] Tiffany's owner email address, so an administrator Auth user can be identified for RLS testing
- [ ] Agreement on execution: either Tiffany runs the supplied SQL in the Supabase SQL Editor, or explicitly asks Codex to operate the browser while Tiffany handles private sign-in prompts

Do **not** send the database password, service-role secret, or account password in chat. They are not needed for writing or reviewing the schema. The Supabase project URL and publishable/anon client key will be needed when application development begins, but they do not need to be shared before the SQL-only portion of Phase 1.

### Phase 1 sample data

The following known values are enough to prepare safe sample rows:

- [x] Courts: Court 1, Court 2, and Court 3
- [x] Timezone: `Asia/Manila`
- [x] Operating hours: 8:00 AM–12:00 midnight
- [x] Court rates: PHP 200 / PHP 250 / PHP 300 by the approved time windows
- [x] Paddle fee: PHP 50 per paddle per hour
- [x] Regular open play: PHP 120 per participant, with no capacity enforcement initially
- [x] Multi-hour ordinary court bookings are allowed through consecutive one-hour slots
- [x] Use fictitious names, phone numbers, bookings, and receipts for database tests instead of real customer information

### Phase 1 execution decision

- [x] Codex prepares and explains the Phase 1 SQL.
- [x] Tiffany runs the SQL in the Supabase SQL Editor so private account credentials do not need to be shared.

### Items needed later, not before Phase 1

- GCash recipient name, mobile number, and QR image
- Exact court address, map link, and public contact number
- Final logo files and court photographs
- Resend account, verified sender/domain, and API key
- Telegram bot token and Tiffany's Telegram chat ID
- Google and Facebook OAuth application credentials
- Vercel account, project access, and final domain name
- Final cancellation/refund policy and customer-facing terms

These later-phase credentials and assets should not delay the database schema work.
