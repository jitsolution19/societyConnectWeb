# Greenview Society — Service Booking App

A ready-to-run demo of the Campaign Engine architecture: members opt into bulk-service
campaigns (starting with **AC Cleaning**), and the admin tracks bookings toward
discount tiers and assigns a vendor once the threshold is hit.

The app is built so that **adding a brand-new service later — pest control, sofa
washing, whatever — is an admin action, not a code change.**

## What's included

- **Member app** (`/`) — browse active campaigns, opt in, see progress toward the next
  discount tier, track "My Bookings."
- **Admin portal** (`/admin`) — create campaigns, manage discount tiers, watch live
  booking stats, export a vendor-ready CSV report, assign a vendor, and add new
  services to the catalog.
- **Backend API** (Express + SQLite) implementing the generic Campaign Engine:
  `Users → Services → Campaigns → Discount_Tiers → Bookings`.
- **Sample data** pre-seeded on first run: one active "AC Cleaning" campaign with
  three discount tiers and a handful of sample bookings, plus a second "Pest Control"
  service already sitting in the catalog (unused) to show how the system extends.

## Run it locally

Requires Node.js 18+.

```bash
npm install
npm start
```

Then open:

- Member app: **http://localhost:3000**
- Admin portal: **http://localhost:3000/admin** (passcode: `admin123`, change via the
  `ADMIN_PASSCODE` environment variable)

The database is a single SQLite file created automatically at `data/app.db` the first
time you run the app, pre-loaded with the sample campaign described above. Delete
that file (`rm -rf data`) to reset to a fresh seed.

### Try it as a member

Log in with an existing seeded resident to see bookings already in progress:

- Phone `9800000002`, flat `A-204` (Rahul Mehta — already opted in)

Or enter any new phone number and flat to join as a brand-new member.

### Try it as the admin

1. Go to `/admin`, sign in with passcode `admin123`.
2. Open the "Diwali Season AC Cleaning Drive" campaign to see live stats and the
   booking list.
3. Export the vendor CSV report from the campaign page.
4. Once you're happy with the numbers, use "Move to..." to advance the campaign
   status, and fill in the vendor form to lock in the discount — this automatically
   confirms every pending booking.
5. Visit "Service Catalog" and add a new service (e.g. "Sofa Deep Cleaning") to see
   how a future service gets introduced without touching any code, then create a
   campaign for it from "+ New Campaign."

## Deploying

This is a single Node process serving both the API and the static frontend — it
deploys anywhere that runs Node (Render, Railway, Fly.io, a VPS, etc.):

1. Push this project to a Git repo.
2. On your host, set the start command to `npm install && npm start`.
3. Set the `PORT` environment variable if your host requires a specific port (most
   platforms set this for you automatically).
4. Set `ADMIN_PASSCODE` to something real before going live.

**Note on the SQLite file:** `data/app.db` is written to local disk, which works
fine for a single-instance deploy or a pilot. For a production, multi-instance
deployment, swap `better-sqlite3` for a hosted Postgres database (the schema in
`db.js` maps almost directly onto the tables described in the original project
plan) and use a connection library like `pg` instead.

## Project structure

```
society-app/
├── server.js          # Express API + campaign-engine logic
├── db.js              # SQLite schema + seed data
├── package.json
├── public/
│   ├── index.html      # Member app shell
│   ├── member.js        # Member app logic
│   ├── admin.html       # Admin portal shell
│   ├── admin.js          # Admin portal logic
│   └── styles.css        # Shared design system
└── data/app.db         # Created automatically on first run (gitignored)
```

## Important: this is a demo, not production-hardened

Before real-world use, replace these simplifications:

- **Auth:** member login is currently phone + flat number only (no OTP verification),
  and admin login is a single shared passcode. Swap in real OTP/SMS verification and
  per-admin accounts with proper session/JWT-based auth.
- **Notifications:** there is no push/SMS notification sending yet — the UI reflects
  state changes only when a user reloads the page. Wire in Firebase Cloud Messaging
  and/or an SMS provider (Twilio, MSG91) for real alerts on tier-unlock, vendor
  assignment, and deadline reminders.
- **Multi-society support:** the schema has room for it (`society_id` on `Users`
  and `Campaigns`), but the UI currently assumes a single society.
- **Validation & rate limiting:** add server-side validation hardening and basic
  rate limiting before exposing this publicly.

## Extending to a new service (how it works under the hood)

1. Admin adds a row to `Services` via **Service Catalog → Add a new service**,
   specifying a name, a unit label (what members are counting — "Number of ACs,"
   "Carpet Area," etc.), and any custom fields specific to that service.
2. Admin creates a `Campaign` referencing that service, with its own discount tiers
   and deadline.
3. The member app, admin dashboard, progress bars, CSV export, and status flow all
   work automatically — none of that code is service-specific.
