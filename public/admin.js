const state = {
  admin: JSON.parse(localStorage.getItem('society_admin') || 'null'),
  services: [],
  campaigns: [],
};

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const mainContent = document.getElementById('main-content');
const modalRoot = document.getElementById('modal-root');

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

const STATUS_FLOW = ['DRAFT', 'ACTIVE', 'THRESHOLD_REACHED', 'NEGOTIATING', 'VENDOR_ASSIGNED', 'COMPLETED'];
const STATUS_LABELS = {
  DRAFT: 'Draft', ACTIVE: 'Active', THRESHOLD_REACHED: 'Threshold Reached',
  NEGOTIATING: 'Negotiating', VENDOR_ASSIGNED: 'Vendor Assigned',
  COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};

// ---------- auth ----------

function showLogin() { loginScreen.hidden = false; appScreen.hidden = true; }
function showApp() {
  loginScreen.hidden = true;
  appScreen.hidden = false;
  document.getElementById('who-name').textContent = state.admin.name;
  renderCampaignsView();
}

document.getElementById('admin-login-btn').addEventListener('click', async () => {
  const passcode = document.getElementById('admin-passcode').value;
  const errorEl = document.getElementById('admin-login-error');
  errorEl.hidden = true;
  try {
    const { user } = await api('/api/auth/admin-login', { method: 'POST', body: JSON.stringify({ passcode }) });
    state.admin = user;
    localStorage.setItem('society_admin', JSON.stringify(user));
    showApp();
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.hidden = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  state.admin = null;
  localStorage.removeItem('society_admin');
  showLogin();
});

document.getElementById('nav-campaigns').addEventListener('click', () => { setActiveNav('nav-campaigns'); renderCampaignsView(); });
document.getElementById('nav-new').addEventListener('click', () => { setActiveNav('nav-new'); renderNewCampaignView(); });
document.getElementById('nav-services').addEventListener('click', () => { setActiveNav('nav-services'); renderServicesView(); });
document.getElementById('nav-members').addEventListener('click', () => { setActiveNav('nav-members'); renderMembersView(); });

function setActiveNav(id) {
  document.querySelectorAll('.sidebar-item').forEach((el) => el.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ---------- data ----------

async function refreshData() {
  const [{ campaigns }, { services }] = await Promise.all([
    api('/api/admin/campaigns'),
    api('/api/services'),
  ]);
  state.campaigns = campaigns;
  state.services = services;
  renderCampaignNavList();
}

function renderCampaignNavList() {
  const el = document.getElementById('campaign-nav-list');
  el.innerHTML = state.campaigns.map((c) => `
    <button class="sidebar-item" data-campaign-id="${c.id}">
      ${c.title}
      <span class="meta">${STATUS_LABELS[c.status]} · ${c.total_units} ${c.service.unit_label.toLowerCase()}</span>
    </button>
  `).join('');
  el.querySelectorAll('[data-campaign-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setActiveNav(null);
      btn.classList.add('active');
      renderCampaignDetail(parseInt(btn.dataset.campaignId, 10));
    });
  });
}

// ---------- campaigns list view ----------

async function renderCampaignsView() {
  await refreshData();
  mainContent.innerHTML = `
    <div class="card">
      <h2>All Campaigns</h2>
      <div class="card-sub">Every campaign ever created, across every service in the catalog.</div>
      <table>
        <thead><tr><th>Campaign</th><th>Service</th><th>Status</th><th>Units Booked</th><th>Flats Joined</th><th>Ends</th></tr></thead>
        <tbody>
          ${state.campaigns.map((c) => `
            <tr style="cursor:pointer" data-id="${c.id}">
              <td>${c.title}</td>
              <td>${c.service.name}</td>
              <td><span class="status-pill">${STATUS_LABELS[c.status]}</span></td>
              <td>${c.total_units}</td>
              <td>${c.booking_count}</td>
              <td>${new Date(c.end_date).toLocaleDateString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${state.campaigns.length === 0 ? '<p class="empty-state">No campaigns yet. Create one from the sidebar.</p>' : ''}
    </div>
  `;
  mainContent.querySelectorAll('tr[data-id]').forEach((row) => {
    row.addEventListener('click', () => renderCampaignDetail(parseInt(row.dataset.id, 10)));
  });
}

// ---------- campaign detail view ----------

async function renderCampaignDetail(id) {
  const { campaign: c } = await api(`/api/campaigns/${id}`);
  const { bookings } = await api(`/api/admin/campaigns/${id}/bookings`);

  const nextTierText = c.next_tier
    ? `${c.units_to_next_tier} more ${c.service.unit_label.toLowerCase()} unlocks ${c.next_tier.discount_percentage}% off`
    : 'Top tier already unlocked';

  mainContent.innerHTML = `
    <div class="card">
      <h2>${c.title}</h2>
      <div class="card-sub">${c.service.name} · ${STATUS_LABELS[c.status]}</div>

      <div class="stat-grid">
        <div class="stat-box"><div class="num">${c.total_units}</div><div class="label">${c.service.unit_label} booked</div></div>
        <div class="stat-box"><div class="num">${c.booking_count}</div><div class="label">Flats joined</div></div>
        <div class="stat-box"><div class="num">${c.current_discount_percentage}%</div><div class="label">Current discount</div></div>
        <div class="stat-box"><div class="num">${new Date(c.end_date).toLocaleDateString()}</div><div class="label">${nextTierText}</div></div>
      </div>

      <div class="toolbar">
        <a class="btn btn-ghost" href="/api/admin/campaigns/${c.id}/export.csv">Export vendor report (CSV)</a>
        ${renderStatusButtons(c)}
      </div>

      ${c.status === 'THRESHOLD_REACHED' || c.status === 'NEGOTIATING' ? renderVendorForm(c) : ''}
      ${c.vendor_name ? `<p class="card-sub">Vendor assigned: <strong>${c.vendor_name}</strong> ${c.vendor_contact ? '· ' + c.vendor_contact : ''}</p>` : ''}
    </div>

    <div class="card">
      <h2>Bookings (${bookings.length})</h2>
      <div class="card-sub">Every flat that has opted in, in the order they joined.</div>
      <table>
        <thead><tr><th>Flat</th><th>Member</th><th>${c.service.unit_label}</th><th>Preferred Slot</th><th>Status</th></tr></thead>
        <tbody>
          ${bookings.map((b) => `
            <tr>
              <td>${b.flat_number}</td>
              <td>${b.member_name}</td>
              <td>${b.units_requested}</td>
              <td>${b.preferred_slot || '—'}</td>
              <td><span class="status-pill">${b.status}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${bookings.length === 0 ? '<p class="empty-state">No bookings yet.</p>' : ''}
    </div>
  `;

  const cancelBtn = document.getElementById('cancel-campaign-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => updateCampaignStatus(c.id, 'CANCELLED'));

  const advanceBtn = document.getElementById('advance-status-btn');
  if (advanceBtn) advanceBtn.addEventListener('click', () => {
    const idx = STATUS_FLOW.indexOf(c.status);
    const next = STATUS_FLOW[idx + 1];
    if (next) updateCampaignStatus(c.id, next);
  });

  const vendorForm = document.getElementById('vendor-form');
  if (vendorForm) vendorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const vendor_name = document.getElementById('vendor-name').value.trim();
    const vendor_contact = document.getElementById('vendor-contact').value.trim();
    await api(`/api/admin/campaigns/${c.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'VENDOR_ASSIGNED', vendor_name, vendor_contact }),
    });
    renderCampaignDetail(c.id);
  });
}

function renderStatusButtons(c) {
  if (['COMPLETED', 'CANCELLED'].includes(c.status)) return '';
  const idx = STATUS_FLOW.indexOf(c.status);
  const nextStatus = STATUS_FLOW[idx + 1];
  const buttons = [];
  if (nextStatus && nextStatus !== 'VENDOR_ASSIGNED') {
    buttons.push(`<button class="btn btn-primary" id="advance-status-btn">Move to "${STATUS_LABELS[nextStatus]}"</button>`);
  }
  buttons.push(`<button class="btn btn-danger" id="cancel-campaign-btn">Cancel Campaign</button>`);
  return buttons.join('');
}

function renderVendorForm(c) {
  return `
    <form class="card" id="vendor-form" style="margin-top:16px; box-shadow:none;">
      <h2 style="font-size:16px;">Assign vendor & lock the discount</h2>
      <div class="two-col">
        <div class="field"><label for="vendor-name">Vendor name</label><input id="vendor-name" required /></div>
        <div class="field"><label for="vendor-contact">Vendor contact</label><input id="vendor-contact" /></div>
      </div>
      <button class="btn btn-primary" type="submit">Confirm Vendor & Notify Members</button>
    </form>
  `;
}

async function updateCampaignStatus(id, status) {
  await api(`/api/admin/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  renderCampaignDetail(id);
}

// ---------- new campaign view ----------

async function renderNewCampaignView() {
  if (!state.services.length) await refreshData();

  const today = new Date().toISOString().slice(0, 10);
  const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  mainContent.innerHTML = `
    <div class="card">
      <h2>New Campaign</h2>
      <div class="card-sub">Pick a service from the catalog and set discount tiers — no new code required, even for services added in the future.</div>
      <form id="new-campaign-form">
        <div class="field">
          <label for="nc-service">Service</label>
          <select id="nc-service">
            ${state.services.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label for="nc-title">Campaign title</label><input id="nc-title" required placeholder="e.g. Diwali Season AC Cleaning Drive" /></div>
        <div class="field"><label for="nc-desc">Description</label><textarea id="nc-desc" rows="2"></textarea></div>
        <div class="two-col">
          <div class="field"><label for="nc-start">Start date</label><input id="nc-start" type="date" value="${today}" /></div>
          <div class="field"><label for="nc-end">Booking deadline</label><input id="nc-end" type="date" value="${inTenDays}" /></div>
        </div>
        <div class="field"><label for="nc-threshold">Minimum units needed to unlock any discount</label><input id="nc-threshold" type="number" min="1" value="5" /></div>

        <label>Discount tiers</label>
        <div id="tier-rows">
          <div class="tier-row">
            <input type="number" min="1" placeholder="Min units" class="tier-min" value="1" />
            <input type="number" min="0" placeholder="Discount %" class="tier-pct" value="10" />
            <button type="button" class="btn btn-ghost remove-tier">Remove</button>
          </div>
          <div class="tier-row">
            <input type="number" min="1" placeholder="Min units" class="tier-min" value="10" />
            <input type="number" min="0" placeholder="Discount %" class="tier-pct" value="25" />
            <button type="button" class="btn btn-ghost remove-tier">Remove</button>
          </div>
        </div>
        <button type="button" class="btn btn-ghost" id="add-tier-btn" style="margin-bottom:20px;">+ Add another tier</button>
        <div id="nc-error" class="error-text" hidden></div>
        <button class="btn btn-primary" type="submit">Launch Campaign</button>
      </form>
    </div>
  `;

  document.getElementById('add-tier-btn').addEventListener('click', addTierRow);
  wireTierRemoveButtons();

  document.getElementById('new-campaign-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('nc-error');
    errorEl.hidden = true;

    const tiers = Array.from(document.querySelectorAll('#tier-rows .tier-row')).map((row) => ({
      min_units: parseInt(row.querySelector('.tier-min').value, 10),
      discount_percentage: parseFloat(row.querySelector('.tier-pct').value),
    }));

    try {
      await api('/api/admin/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          service_id: parseInt(document.getElementById('nc-service').value, 10),
          title: document.getElementById('nc-title').value.trim(),
          description: document.getElementById('nc-desc').value.trim(),
          start_date: document.getElementById('nc-start').value,
          end_date: document.getElementById('nc-end').value,
          min_threshold_units: parseInt(document.getElementById('nc-threshold').value, 10),
          tiers,
        }),
      });
      setActiveNav('nav-campaigns');
      renderCampaignsView();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });
}

function addTierRow() {
  const wrap = document.getElementById('tier-rows');
  const div = document.createElement('div');
  div.className = 'tier-row';
  div.innerHTML = `
    <input type="number" min="1" placeholder="Min units" class="tier-min" />
    <input type="number" min="0" placeholder="Discount %" class="tier-pct" />
    <button type="button" class="btn btn-ghost remove-tier">Remove</button>
  `;
  wrap.appendChild(div);
  wireTierRemoveButtons();
}

function wireTierRemoveButtons() {
  document.querySelectorAll('.remove-tier').forEach((btn) => {
    btn.onclick = () => btn.closest('.tier-row').remove();
  });
}

// ---------- service catalog view ----------

async function renderServicesView() {
  await refreshData();
  mainContent.innerHTML = `
    <div class="card">
      <h2>Service Catalog</h2>
      <div class="card-sub">This is how new services get introduced — add one here, then launch a campaign for it. No app update needed.</div>
      <table>
        <thead><tr><th>Service</th><th>Unit</th><th>Description</th></tr></thead>
        <tbody>
          ${state.services.map((s) => `
            <tr><td>${s.name}</td><td>${s.unit_label}</td><td>${s.description || ''}</td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>Add a new service</h2>
      <form id="new-service-form">
        <div class="field"><label for="ns-name">Service name</label><input id="ns-name" required placeholder="e.g. Sofa Deep Cleaning" /></div>
        <div class="field"><label for="ns-unit">What are members booking in? (unit label)</label><input id="ns-unit" required placeholder="e.g. Number of Sofas" /></div>
        <div class="field"><label for="ns-desc">Description</label><textarea id="ns-desc" rows="2"></textarea></div>
        <button class="btn btn-primary" type="submit">Add to Catalog</button>
      </form>
    </div>
  `;

  document.getElementById('new-service-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/admin/services', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('ns-name').value.trim(),
        unit_label: document.getElementById('ns-unit').value.trim(),
        description: document.getElementById('ns-desc').value.trim(),
        custom_fields: [],
      }),
    });
    renderServicesView();
  });
}

// ---------- members view ----------

async function renderMembersView() {
  const { members } = await api('/api/admin/members');
  mainContent.innerHTML = `
    <div class="card">
      <h2>Members (${members.length})</h2>
      <table>
        <thead><tr><th>Flat</th><th>Name</th><th>Phone</th></tr></thead>
        <tbody>
          ${members.map((m) => `<tr><td>${m.flat_number}</td><td>${m.name}</td><td>${m.phone}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- boot ----------

if (state.admin) showApp(); else showLogin();
