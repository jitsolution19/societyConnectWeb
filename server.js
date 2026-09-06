const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'admin123';

// ---------- helpers ----------

function getCampaignSummary(campaign) {
  const tiers = db
    .prepare('SELECT * FROM discount_tiers WHERE campaign_id = ? ORDER BY min_units ASC')
    .all(campaign.id);

  const totalUnitsRow = db
    .prepare(
      `SELECT COALESCE(SUM(units_requested), 0) AS total
       FROM bookings WHERE campaign_id = ? AND status != 'CANCELLED'`
    )
    .get(campaign.id);
  const totalUnits = totalUnitsRow.total;

  const bookingCountRow = db
    .prepare(`SELECT COUNT(*) AS c FROM bookings WHERE campaign_id = ? AND status != 'CANCELLED'`)
    .get(campaign.id);

  let currentTier = null;
  let nextTier = null;
  for (const tier of tiers) {
    if (totalUnits >= tier.min_units) currentTier = tier;
    else if (!nextTier) nextTier = tier;
  }

  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(campaign.service_id);

  return {
    ...campaign,
    service,
    tiers,
    total_units: totalUnits,
    booking_count: bookingCountRow.c,
    current_discount_percentage: currentTier ? currentTier.discount_percentage : 0,
    next_tier: nextTier,
    units_to_next_tier: nextTier ? Math.max(nextTier.min_units - totalUnits, 0) : 0,
    threshold_reached: totalUnits >= campaign.min_threshold_units,
  };
}

// ---------- auth (simplified for demo — replace with real OTP/SSO in production) ----------

app.post('/api/auth/login', (req, res) => {
  const { name, phone, flat_number } = req.body;
  if (!phone || !flat_number) {
    return res.status(400).json({ error: 'phone and flat_number are required' });
  }
  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) {
    const result = db
      .prepare('INSERT INTO users (name, phone, flat_number, role) VALUES (?, ?, ?, ?)')
      .run(name || 'Resident', phone, flat_number, 'member');
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  }
  res.json({ user });
});

app.post('/api/auth/admin-login', (req, res) => {
  const { passcode } = req.body;
  if (passcode !== ADMIN_PASSCODE) {
    return res.status(401).json({ error: 'Incorrect passcode' });
  }
  const admin = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
  res.json({ user: admin });
});

// ---------- services (the catalog — how future services get added) ----------

app.get('/api/services', (req, res) => {
  const services = db.prepare('SELECT * FROM services WHERE is_active = 1').all();
  res.json({ services });
});

app.post('/api/admin/services', (req, res) => {
  const { name, description, unit_label, custom_fields } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = db
    .prepare(
      `INSERT INTO services (name, description, unit_label, custom_fields, is_active)
       VALUES (?, ?, ?, ?, 1)`
    )
    .run(name, description || '', unit_label || 'Units', JSON.stringify(custom_fields || []));
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ service });
});

// ---------- campaigns (member-facing) ----------

app.get('/api/campaigns', (req, res) => {
  const statusFilter = req.query.status;
  let campaigns;
  if (statusFilter) {
    campaigns = db.prepare('SELECT * FROM campaigns WHERE status = ? ORDER BY created_at DESC').all(statusFilter);
  } else {
    campaigns = db
      .prepare("SELECT * FROM campaigns WHERE status NOT IN ('CANCELLED') ORDER BY created_at DESC")
      .all();
  }
  res.json({ campaigns: campaigns.map(getCampaignSummary) });
});

app.get('/api/campaigns/:id', (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  res.json({ campaign: getCampaignSummary(campaign) });
});

app.post('/api/campaigns/:id/bookings', (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!['ACTIVE', 'THRESHOLD_REACHED'].includes(campaign.status)) {
    return res.status(400).json({ error: 'This campaign is no longer accepting bookings' });
  }

  const { user_id, units_requested, preferred_slot, notes, custom_field_values } = req.body;
  if (!user_id || !units_requested) {
    return res.status(400).json({ error: 'user_id and units_requested are required' });
  }

  const result = db
    .prepare(
      `INSERT INTO bookings (user_id, campaign_id, units_requested, preferred_slot, notes, custom_field_values, status)
       VALUES (?, ?, ?, ?, ?, ?, 'OPTED_IN')`
    )
    .run(
      user_id,
      campaign.id,
      units_requested,
      preferred_slot || '',
      notes || '',
      JSON.stringify(custom_field_values || {})
    );

  // Auto state transition: if the new total meets the threshold, flip campaign status
  const summary = getCampaignSummary(campaign);
  if (summary.threshold_reached && campaign.status === 'ACTIVE') {
    db.prepare("UPDATE campaigns SET status = 'THRESHOLD_REACHED' WHERE id = ?").run(campaign.id);
  }

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ booking, campaign: getCampaignSummary({ ...campaign, status: db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaign.id).status }) });
});

app.get('/api/users/:id/bookings', (req, res) => {
  const bookings = db
    .prepare(
      `SELECT b.*, c.title AS campaign_title, s.name AS service_name
       FROM bookings b
       JOIN campaigns c ON c.id = b.campaign_id
       JOIN services s ON s.id = c.service_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`
    )
    .all(req.params.id);
  res.json({ bookings });
});

// ---------- admin ----------

app.get('/api/admin/campaigns', (req, res) => {
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
  res.json({ campaigns: campaigns.map(getCampaignSummary) });
});

app.post('/api/admin/campaigns', (req, res) => {
  const { service_id, title, description, start_date, end_date, min_threshold_units, tiers } = req.body;
  if (!service_id || !title || !start_date || !end_date || !tiers || !tiers.length) {
    return res.status(400).json({ error: 'service_id, title, start_date, end_date and at least one tier are required' });
  }

  const result = db
    .prepare(
      `INSERT INTO campaigns (service_id, title, description, start_date, end_date, min_threshold_units, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`
    )
    .run(service_id, title, description || '', start_date, end_date, min_threshold_units || 1);

  const insertTier = db.prepare(
    `INSERT INTO discount_tiers (campaign_id, min_units, discount_percentage) VALUES (?, ?, ?)`
  );
  for (const tier of tiers) {
    insertTier.run(result.lastInsertRowid, tier.min_units, tier.discount_percentage);
  }

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ campaign: getCampaignSummary(campaign) });
});

app.patch('/api/admin/campaigns/:id', (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const { status, vendor_name, vendor_contact } = req.body;
  const allowedStatuses = [
    'DRAFT', 'ACTIVE', 'THRESHOLD_REACHED', 'NEGOTIATING',
    'VENDOR_ASSIGNED', 'COMPLETED', 'CANCELLED',
  ];
  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  db.prepare(
    `UPDATE campaigns SET
      status = COALESCE(?, status),
      vendor_name = COALESCE(?, vendor_name),
      vendor_contact = COALESCE(?, vendor_contact)
     WHERE id = ?`
  ).run(status || null, vendor_name || null, vendor_contact || null, req.params.id);

  // If vendor assigned, move every OPTED_IN booking to CONFIRMED
  if (status === 'VENDOR_ASSIGNED') {
    db.prepare(
      `UPDATE bookings SET status = 'CONFIRMED' WHERE campaign_id = ? AND status = 'OPTED_IN'`
    ).run(req.params.id);
  }
  if (status === 'COMPLETED') {
    db.prepare(
      `UPDATE bookings SET status = 'COMPLETED' WHERE campaign_id = ? AND status IN ('CONFIRMED','SCHEDULED')`
    ).run(req.params.id);
  }

  const updated = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  res.json({ campaign: getCampaignSummary(updated) });
});

app.get('/api/admin/campaigns/:id/bookings', (req, res) => {
  const bookings = db
    .prepare(
      `SELECT b.*, u.name AS member_name, u.phone, u.flat_number
       FROM bookings b JOIN users u ON u.id = b.user_id
       WHERE b.campaign_id = ?
       ORDER BY b.created_at ASC`
    )
    .all(req.params.id);
  res.json({ bookings });
});

app.get('/api/admin/campaigns/:id/export.csv', (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const bookings = db
    .prepare(
      `SELECT b.id, u.name AS member_name, u.flat_number, u.phone,
              b.units_requested, b.preferred_slot, b.notes, b.custom_field_values, b.status
       FROM bookings b JOIN users u ON u.id = b.user_id
       WHERE b.campaign_id = ? AND b.status != 'CANCELLED'
       ORDER BY u.flat_number ASC`
    )
    .all(req.params.id);

  const header = ['Booking ID', 'Member', 'Flat', 'Phone', 'Units', 'Preferred Slot', 'Notes', 'Custom Fields', 'Status'];
  const rows = bookings.map((b) => [
    b.id, b.member_name, b.flat_number, b.phone, b.units_requested,
    b.preferred_slot, (b.notes || '').replace(/,/g, ';'), b.custom_field_values.replace(/,/g, ';'), b.status,
  ]);
  const csv = [header, ...rows].map((r) => r.join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="campaign-${req.params.id}-vendor-report.csv"`);
  res.send(csv);
});

app.get('/api/admin/members', (req, res) => {
  const members = db.prepare("SELECT * FROM users WHERE role = 'member' ORDER BY flat_number ASC").all();
  res.json({ members });
});

// ---------- fallback ----------

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Society service app running at http://localhost:${PORT}`);
  console.log(`Admin portal at http://localhost:${PORT}/admin (passcode: ${ADMIN_PASSCODE})`);
});
