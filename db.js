const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'app.db');
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

const isNewDb = !fs.existsSync(DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  flat_number TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- member | admin
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  unit_label TEXT NOT NULL DEFAULT 'Units',   -- e.g. "Number of ACs", "Carpet Area (sqft)"
  custom_fields TEXT NOT NULL DEFAULT '[]',   -- JSON array of {key, label, type}
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL REFERENCES services(id),
  title TEXT NOT NULL,
  description TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  min_threshold_units INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  -- DRAFT | ACTIVE | THRESHOLD_REACHED | NEGOTIATING | VENDOR_ASSIGNED | COMPLETED | CANCELLED
  vendor_name TEXT,
  vendor_contact TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discount_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  min_units INTEGER NOT NULL,
  discount_percentage REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  units_requested INTEGER NOT NULL,
  preferred_slot TEXT,
  notes TEXT,
  custom_field_values TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'OPTED_IN',
  -- OPTED_IN | CONFIRMED | SCHEDULED | COMPLETED | CANCELLED
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0) return; // already seeded

  const insertUser = db.prepare(
    `INSERT INTO users (name, phone, flat_number, role) VALUES (?, ?, ?, ?)`
  );
  const admin = insertUser.run('Priya Sharma (Admin)', '9800000001', 'Office', 'admin');
  const u1 = insertUser.run('Rahul Mehta', '9800000002', 'A-204', 'member');
  const u2 = insertUser.run('Sonal Kapoor', '9800000003', 'A-301', 'member');
  const u3 = insertUser.run('Arjun Nair', '9800000004', 'B-102', 'member');
  const u4 = insertUser.run('Fatima Sheikh', '9800000005', 'B-410', 'member');
  const u5 = insertUser.run('George Thomas', '9800000006', 'C-007', 'member');

  const insertService = db.prepare(
    `INSERT INTO services (name, description, unit_label, custom_fields, is_active) VALUES (?, ?, ?, ?, 1)`
  );
  const acService = insertService.run(
    'AC Cleaning',
    'Bulk AC servicing and deep cleaning by a certified technician, booked together across the society for a group discount.',
    'Number of ACs',
    JSON.stringify([{ key: 'ac_type', label: 'AC Type (Split/Window)', type: 'text' }])
  );

  // A second (inactive/draft) service to demonstrate the catalog is extensible
  insertService.run(
    'Pest Control',
    'Whole-home pest control treatment, booked in bulk for a society-wide discount.',
    'Carpet Area (sqft)',
    JSON.stringify([{ key: 'pest_focus', label: 'Main Concern (Cockroach/Termite/General)', type: 'text' }])
  );

  const insertCampaign = db.prepare(`
    INSERT INTO campaigns (service_id, title, description, start_date, end_date, min_threshold_units, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const today = new Date();
  const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const campaign = insertCampaign.run(
    acService.lastInsertRowid,
    'Diwali Season AC Cleaning Drive',
    'Get your ACs serviced before the festive season. The more flats that join, the bigger the discount for everyone.',
    today.toISOString().slice(0, 10),
    endDate.toISOString().slice(0, 10),
    6,
    'ACTIVE'
  );

  const insertTier = db.prepare(
    `INSERT INTO discount_tiers (campaign_id, min_units, discount_percentage) VALUES (?, ?, ?)`
  );
  insertTier.run(campaign.lastInsertRowid, 1, 10);
  insertTier.run(campaign.lastInsertRowid, 6, 20);
  insertTier.run(campaign.lastInsertRowid, 16, 30);

  const insertBooking = db.prepare(`
    INSERT INTO bookings (user_id, campaign_id, units_requested, preferred_slot, notes, custom_field_values, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertBooking.run(u1.lastInsertRowid, campaign.lastInsertRowid, 2, '2026-09-10 morning', '',
    JSON.stringify({ ac_type: 'Split' }), 'OPTED_IN');
  insertBooking.run(u2.lastInsertRowid, campaign.lastInsertRowid, 1, '2026-09-11 evening', 'Please call before arriving',
    JSON.stringify({ ac_type: 'Window' }), 'OPTED_IN');
  insertBooking.run(u3.lastInsertRowid, campaign.lastInsertRowid, 3, '2026-09-10 afternoon', '',
    JSON.stringify({ ac_type: 'Split' }), 'CONFIRMED');
  insertBooking.run(u4.lastInsertRowid, campaign.lastInsertRowid, 1, '2026-09-12 morning', '',
    JSON.stringify({ ac_type: 'Split' }), 'OPTED_IN');

  console.log('Database seeded with sample AC Cleaning campaign.');
}

seed();

module.exports = db;
