# The Point · Hotel Ops

Independent operations system for **The Point Boutique Hotel, Johor Bahru**. It runs alongside the
managers' PMS so the owner can see real occupancy, cash and profit, and check every booking against the PMS.

**Live demo:** https://moulisankar999.github.io/point-hotel-ops/ (demo data only, stored in your browser)

| Demo login | Role | Password |
|---|---|---|
| `mouli` | CEO / GM (everything) | `demo1234` |
| `ops` | Operations Manager | `demo1234` |
| `manager` | Manager | `demo1234` |
| `frontdesk` | Front Desk | `demo1234` |
| `housekeeping` | Housekeeping Supervisor | `demo1234` |

Demo users and the password are only shown in demo mode. In Supabase mode, logins are real accounts that the CEO creates.

## Features
- **Live room board.** Shows 60 rooms (50–100 configurable) with occupied / available / dirty / cleaning / inspecting / maintenance status. It also covers occupancy %, arrivals and departures, and a rooms × days calendar with blocked dates.
- **Booking entry.**
  - Walk-ins and advance bookings.
  - The **PMS ref no. is mandatory**. Walk-ins without one need a reason and get flagged.
  - Duplicate refs are rejected, and overlapping room dates are prevented.
  - Smart auto-fill suggests free rooms and recognises returning guests by phone number.
  - The rate is filled from the room type, and selling below the floor needs a reason.
- **Fraud-proofing.**
  - Immutable audit trail of every change (who, when, before/after, reason).
  - Bookings are never deleted. Cancel, void and no-show need a reason.
  - Edits after check-out need Manager+ and a reason.
  - Ghost-occupancy report: housekeeping saw a room in use with no guest checked in.
  - Below-floor, no-PMS-ref and unpaid-balance flags.
  - Daily reconciliation compares payments collected with the counted cash.
- **Realtime alerts** (bell + toast) for check-ins, check-outs, walk-ins, cancellations and flags.
- **Housekeeping.** Tasks are created automatically from check-outs and stayovers. Each room follows dirty → cleaning → clean → inspected → available.
- **P&L.**
  - Daily and monthly views.
  - Fixed monthly costs (all start at RM 0) are pro-rated per day. Ad-hoc expenses are added on top.
  - KPIs: occupancy, ADR, RevPAR and net profit.
  - Printable / PDF.
- **Users.** Roles are CEO/GM, Ops Manager, Manager, Front Desk and Housekeeping Supervisor. Each role only sees its own screens.
- Light and dark mode, and works on phones.

## Development
```bash
npm install
npm run dev        # demo mode
npm test           # unit tests (overlap, occupancy, P&L, validation)
npm run build
```

## Architecture
- `src/lib/logic.ts`: pure, tested business rules (availability, occupancy, P&L, reconciliation, validation).
- `src/data/service.ts`: domain actions with permission checks, shared by both back-ends.
- `src/data/demoStore.ts`: localStorage + BroadcastChannel demo (multi-tab realtime), audits every write.
- `src/data/supabaseStore.ts`: Supabase back-end. It is used automatically when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set.
- `supabase/migrations/…_point_hotel_ops_init.sql` contains:
  - the schema and role-based RLS
  - audit triggers and the append-only audit log
  - no-delete triggers
  - reason rules, the exclusion constraint against double-booking and the unique PMS ref
  - alert triggers and the realtime publication
- `supabase/functions/admin-users`: CEO-only edge function to create, disable and enable staff logins and to reset passwords.

## Going live on Supabase (not done yet)
1. Create a **new, dedicated** Supabase project (region: Singapore), once the cost is approved. Do not reuse any other project.
2. Apply the migration: `supabase link --project-ref <ref>`, then `supabase db push`. You can also paste the SQL into the SQL editor.
   The migration has not been run against a database yet, so review it and test it on a branch or staging project first.
3. Deploy the edge function: `supabase functions deploy admin-users`.
4. Create the first CEO login:
   - Go to Auth → Users → Add user, with email `mouli@staff.thepoint.internal`, a strong password, and auto-confirm turned on.
   - Then run in the SQL editor:
     `insert into profiles (id, username, full_name, role) values ('<auth user id>', 'mouli', 'Mouli Sankar', 'ceo');`
5. In Auth settings, turn off public sign-ups.
6. Build with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set (repo secrets for the Pages build), then redeploy.
7. Sign in as CEO and complete the setup:
   - Fix rooms and room types in **Settings** to match the real hotel.
   - Enter the fixed monthly costs in **Expenses**.
   - Create staff logins in **Users**.
