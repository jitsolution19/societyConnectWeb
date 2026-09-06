# Society Bulk-Service Booking App — Detailed Development Plan

## 1. Product Vision

A platform where a **Society Admin** posts service campaigns (starting with AC cleaning, expanding later to pest control, deep cleaning, sofa washing, etc.), **members opt in** to the ones they want, and once enough members join, the admin uses that combined demand to negotiate a **bulk discount with a vendor**.

The system must be built so that launching a brand-new service in the future is a **configuration action for the admin**, not a new development cycle for engineering. This means no service-specific logic should be hardcoded — everything is driven by a generic "Campaign" model.

---

## 2. Core Concept: The Campaign Engine

Every service (AC cleaning today, pest control tomorrow) is just an instance of a generic **Campaign**. A campaign has:

- A service type (from a manageable list, not hardcoded)
- A booking window (start date → deadline)
- One or more discount tiers based on total units booked
- Optional custom fields per service (e.g., "number of ACs" for AC cleaning, "carpet area" for pest control)

**Flow:**

```
Admin creates a Campaign (service + tiers + deadline)
        │
        ▼
Members are notified (push/SMS/in-app)
        │
        ▼
Members opt in with quantity + preferred slot
        │
        ▼
Live progress bar shows bookings vs. next discount tier
        │
        ├── Threshold met → Admin notified → Vendor contacted → Discount locked
        └── Deadline passes, threshold not met → Admin decides: extend, lower tier, or cancel
        │
        ▼
Vendor assigned → Slots scheduled → Service completed → Feedback collected
```

This single engine handles every future service without new code — only new campaign entries and optional custom fields.

---

## 3. Users & Roles

| Role | Capabilities |
|---|---|
| **Member** | Verify flat/unit, browse active campaigns, opt in with quantity/slot, track booking status, get notified, rate service after completion |
| **Society Admin** | Create/manage campaigns, set discount tiers and deadlines, view live opt-in analytics, export vendor-ready reports, mark vendor assigned, close/cancel campaigns, manage member list |
| **Super Admin (you, the platform owner)** *(optional, for multi-society scaling)* | Onboard new societies, manage service catalog, view platform-wide usage |

---

## 4. Feature Breakdown

### 4.1 Member App (Mobile — React Native or Flutter)

- **Onboarding & Auth:** Phone number + OTP, flat/unit number entry, admin approval or auto-verify via a society invite code
- **Home / Active Campaigns Feed:** Cards showing each live campaign, current opt-in count, progress bar toward next discount tier, days left
- **Opt-In Flow:** Enter quantity (e.g., number of ACs), pick a preferred date/time slot, add notes, confirm
- **My Bookings:** Status tracking — `Opted-In → Confirmed → Vendor Assigned → Scheduled → Completed`
- **Notifications:** New campaign posted, threshold unlocked, deadline reminder, vendor assigned, service day reminder
- **Profile:** Flat details, booking history, saved preferences

### 4.2 Admin Web Portal (React / Next.js)

- **Campaign Creator:** Pick service type, set tiered discounts (e.g., 1–10 units = 10% off, 10–25 = 20% off, 25+ = 30% off), set deadline, optional custom fields
- **Live Dashboard:** Real-time opt-in count, total units, tier currently unlocked, list of participating flats
- **Vendor Export:** One click to generate an Excel/PDF summary (unit count, flat-wise breakdown, contact list) ready to send to a vendor for quotation
- **Campaign State Manager:** `Draft → Active → Threshold Reached → Negotiating → Vendor Assigned → Scheduled → Completed / Cancelled`
- **Service Catalog Manager:** Add a new service type (name, description, custom fields) — this is how future services get introduced without a code deployment
- **Member & Society Management:** Approve new members, manage flat list, broadcast announcements

### 4.3 Backend & Database (Node.js/Python + PostgreSQL)

- REST or GraphQL API layer
- Role-based access control (RBAC)
- Scheduled jobs: auto-notify on tier unlock, auto-close campaigns past deadline, reminder notifications
- Push notification service (Firebase Cloud Messaging) + SMS fallback (Twilio/MSG91)
- Report generation service (Excel/PDF export)

---

## 5. Data Model

```
Users
 ├─ id, name, phone, flat_number, role (Admin/Member), society_id

Services            (the catalog — new rows here = new services, no code change)
 ├─ id, name, description, custom_fields (JSON schema), is_active

Campaigns
 ├─ id, service_id, society_id, title, start_date, end_date,
 ├─ min_threshold_units, status (DRAFT/ACTIVE/THRESHOLD_REACHED/
 ├─ NEGOTIATING/VENDOR_ASSIGNED/COMPLETED/CANCELLED)

Discount_Tiers
 ├─ id, campaign_id, min_units, discount_percentage

Bookings
 ├─ id, user_id, campaign_id, units_requested, preferred_slot,
 ├─ custom_field_values (JSON), status (OPTED_IN/CONFIRMED/
 ├─ SCHEDULED/COMPLETED/CANCELLED)

Vendors  (optional, for tracking vendor history per service)
 ├─ id, name, contact_info, service_id, rating

Notifications_Log
 ├─ id, user_id, campaign_id, type, sent_at
```

Using a `custom_fields` JSON column on `Services` and `custom_field_values` JSON on `Bookings` is what lets you add a completely new service (say, "sofa washing" needing "number of seats") without touching the schema or backend code — just define the field once in the admin's Service Catalog Manager.

---

## 6. Recommended Tech Stack

| Layer | Recommendation | Why |
|---|---|---|
| Mobile app | React Native (or Flutter) | Single codebase for iOS + Android |
| Admin web portal | Next.js + Tailwind | Fast to build, good for dashboards |
| Backend | Node.js (NestJS/Express) or Python (FastAPI/Django) | Either works well; pick based on team familiarity |
| Database | PostgreSQL | Relational integrity for bookings/tiers, JSON columns for flexible custom fields |
| Notifications | Firebase Cloud Messaging + Twilio/MSG91 (SMS) | Push + SMS fallback for non-smartphone-savvy residents |
| Hosting | AWS/GCP with a managed Postgres (RDS/Cloud SQL) | Standard, scalable, low-ops |
| File exports | `exceljs` / `pdfkit` (Node) or `openpyxl` / `reportlab` (Python) | For vendor-ready reports |

---

## 7. Development Roadmap

| Phase | Duration | Key Deliverables |
|---|---|---|
| **1. Requirements & Data Architecture** | Week 1–2 | Finalize schema (above), define all campaign/booking state transitions, decide on custom-field design for future services |
| **2. UI/UX Design** | Week 2–3 | Wireframes + high-fidelity screens; prioritize clarity for non-tech-savvy residents (big progress bars, simple opt-in flow, minimal steps) |
| **3. Backend & Admin Portal** | Week 4–6 | Auth + RBAC, campaign/booking APIs, admin dashboard, vendor export, service catalog manager |
| **4. Member Mobile App** | Week 6–9 | Auth/OTP, campaign feed, opt-in flow, booking tracker, push notifications, deep links from notifications into the right campaign |
| **5. Testing & Pilot Launch** | Week 10–12 | Internal QA, beta test with 1–2 wing admins, run a real pilot AC-cleaning campaign in one block, collect feedback, fix issues |
| **6. Full Rollout** | Week 13+ | Society-wide launch, onboard all members, admin training session |

**Total estimated timeline: ~12–13 weeks** for MVP with one pilot service (AC cleaning), architected to add new services without further core development.

---

## 8. Suggested Team

- 1 Product/Project lead (can be you, coordinating)
- 1–2 Backend developers
- 1–2 Frontend developers (web admin)
- 1–2 Mobile developers (or 1 if using React Native/Flutter for both platforms)
- 1 UI/UX designer (part-time is fine)
- 1 QA/tester (can be shared/part-time)

For a lean MVP, a small full-stack team of 2–3 developers plus a designer can realistically hit the roadmap above.

---

## 9. Pilot Launch Plan (Weeks 10–12)

1. Pick one wing/block of the society as the pilot group.
2. Admin creates a real "AC Cleaning" campaign with actual discount tiers.
3. Members in that block opt in through the app.
4. Validate: does the threshold-notification loop work end-to-end? Is the vendor export usable as-is to get a real quote?
5. Actually contact a vendor with the exported report and confirm the bulk discount is achievable.
6. Collect feedback from both members and the admin on friction points.
7. Fix critical issues, then roll out to the full society.

---

## 10. Future Extensibility (Adding a New Service Later)

Because of the Campaign Engine + Service Catalog design, launching "Pest Control" or "Sofa Washing" later should only require:

1. Admin adds a new entry in the **Service Catalog** (name, description, any custom fields like "carpet area" or "number of sofas").
2. Admin creates a new **Campaign** using that service.
3. Everything else — opt-in flow, progress bar, threshold logic, vendor export, notifications — works automatically, since it's all generic.

No new screens, no new backend endpoints, no app store re-submission needed for a new service.

---

## 11. Success Metrics to Track Post-Launch

- % of society members who install and verify their account
- Average opt-in rate per campaign
- % of campaigns that hit their discount threshold
- Average discount % achieved vs. individual market price
- Time from campaign creation to vendor assignment
- Member satisfaction rating post-service
