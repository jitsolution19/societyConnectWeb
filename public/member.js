const state = {
  user: JSON.parse(localStorage.getItem('society_user') || 'null'),
};

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const modalRoot = document.getElementById('modal-root');

function fmtDate(d) {
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function daysLeft(endDate) {
  const diff = Math.ceil((new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'Closed';
  if (diff === 0) return 'Ends today';
  if (diff === 1) return '1 day left';
  return `${diff} days left`;
}

const STATUS_LABELS = {
  ACTIVE: { text: 'Open for booking', cls: '' },
  THRESHOLD_REACHED: { text: 'Discount unlocked!', cls: 'gold' },
  NEGOTIATING: { text: 'Finalizing with vendor', cls: 'gold' },
  VENDOR_ASSIGNED: { text: 'Vendor confirmed', cls: '' },
  COMPLETED: { text: 'Completed', cls: 'neutral' },
  CANCELLED: { text: 'Cancelled', cls: 'brick' },
  DRAFT: { text: 'Coming soon', cls: 'neutral' },
};

const BOOKING_STATUS_LABELS = {
  OPTED_IN: 'Opted in — awaiting threshold',
  CONFIRMED: 'Confirmed',
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// ---------- auth ----------

function showLogin() {
  loginScreen.hidden = false;
  appScreen.hidden = true;
}

function showApp() {
  loginScreen.hidden = true;
  appScreen.hidden = false;
  document.getElementById('who-name').textContent = `${state.user.name} · Flat ${state.user.flat_number}`;
  loadCampaigns();
  loadBookings();
}

document.getElementById('login-btn').addEventListener('click', async () => {
  const name = document.getElementById('login-name').value.trim();
  const flat_number = document.getElementById('login-flat').value.trim();
  const phone = document.getElementById('login-phone').value.trim();
  const errorEl = document.getElementById('login-error');
  errorEl.hidden = true;

  if (!phone || !flat_number) {
    errorEl.textContent = 'Please enter your flat number and phone number.';
    errorEl.hidden = false;
    return;
  }

  try {
    const { user } = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ name, phone, flat_number }),
    });
    state.user = user;
    localStorage.setItem('society_user', JSON.stringify(user));
    showApp();
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.hidden = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  state.user = null;
  localStorage.removeItem('society_user');
  showLogin();
});

// ---------- campaigns ----------

async function loadCampaigns() {
  const { campaigns } = await api('/api/campaigns');
  const container = document.getElementById('campaign-list');

  if (!campaigns.length) {
    container.innerHTML = `<div class="empty-state">No active campaigns right now. Check back soon!</div>`;
    return;
  }

  container.innerHTML = campaigns.map(renderCampaignCard).join('');

  campaigns.forEach((c) => {
    const btn = document.getElementById(`optin-btn-${c.id}`);
    if (btn) btn.addEventListener('click', () => openOptInModal(c));
  });
}

function renderCampaignCard(c) {
  const pctToNext = c.next_tier
    ? Math.min(100, Math.round((c.total_units / c.next_tier.min_units) * 100))
    : 100;
  const statusInfo = STATUS_LABELS[c.status] || { text: c.status, cls: '' };
  const canBook = ['ACTIVE', 'THRESHOLD_REACHED'].includes(c.status);

  const calloutText = c.next_tier
    ? `${c.units_to_next_tier} more ${c.service.unit_label.toLowerCase()} for ${c.next_tier.discount_percentage}% off`
    : `Top discount tier unlocked: ${c.current_discount_percentage}% off`;

  return `
    <div class="campaign-card">
      <div class="service-tag">${c.service.name}</div>
      <h3>${c.title}</h3>
      <p class="desc">${c.description || ''}</p>

      <div class="progress-track">
        <div class="progress-fill" style="width:${pctToNext}%"></div>
      </div>
      <div class="progress-meta">
        <span><strong>${c.total_units}</strong> ${c.service.unit_label.toLowerCase()} booked · <strong>${c.booking_count}</strong> flats joined</span>
        <span>Current: <strong>${c.current_discount_percentage}% off</strong></span>
      </div>

      <div class="callout">${calloutText}</div><br/>

      <div class="campaign-footer">
        <div>
          <span class="status-pill ${statusInfo.cls}">${statusInfo.text}</span>
          <div class="deadline">${daysLeft(c.end_date)} · ends ${fmtDate(c.end_date)}</div>
        </div>
        ${canBook ? `<button class="btn btn-primary" id="optin-btn-${c.id}">Opt In</button>` : ''}
      </div>
    </div>
  `;
}

// ---------- opt-in modal ----------

function openOptInModal(campaign) {
  const customFields = JSON.parse(campaign.service.custom_fields || '[]');

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <button class="modal-close" id="modal-close" aria-label="Close">&times;</button>
        <h3>Opt in — ${campaign.title}</h3>
        <p class="card-sub">You're booking ${campaign.service.name.toLowerCase()} as flat ${state.user.flat_number}.</p>

        <div class="field">
          <label for="oi-units">${campaign.service.unit_label}</label>
          <input id="oi-units" type="number" min="1" value="1" />
        </div>

        ${customFields.map((f, i) => `
          <div class="field">
            <label for="oi-custom-${i}">${f.label}</label>
            <input id="oi-custom-${i}" data-key="${f.key}" type="text" />
          </div>
        `).join('')}

        <div class="field">
          <label for="oi-slot">Preferred date & time</label>
          <input id="oi-slot" type="text" placeholder="e.g. 12 Sep, morning" />
        </div>

        <div class="field">
          <label for="oi-notes">Notes (optional)</label>
          <textarea id="oi-notes" rows="2" placeholder="Anything the vendor should know"></textarea>
        </div>

        <div id="oi-error" class="error-text" hidden></div>
        <button class="btn btn-primary btn-block" id="oi-submit">Confirm opt-in</button>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  document.getElementById('oi-submit').addEventListener('click', async () => {
    const units_requested = parseInt(document.getElementById('oi-units').value, 10);
    const preferred_slot = document.getElementById('oi-slot').value.trim();
    const notes = document.getElementById('oi-notes').value.trim();
    const errorEl = document.getElementById('oi-error');
    errorEl.hidden = true;

    const custom_field_values = {};
    customFields.forEach((f, i) => {
      custom_field_values[f.key] = document.getElementById(`oi-custom-${i}`).value.trim();
    });

    if (!units_requested || units_requested < 1) {
      errorEl.textContent = `Please enter a valid ${campaign.service.unit_label.toLowerCase()}.`;
      errorEl.hidden = false;
      return;
    }

    try {
      await api(`/api/campaigns/${campaign.id}/bookings`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: state.user.id,
          units_requested,
          preferred_slot,
          notes,
          custom_field_values,
        }),
      });
      closeModal();
      loadCampaigns();
      loadBookings();
    } catch (e) {
      errorEl.textContent = e.message;
      errorEl.hidden = false;
    }
  });
}

function closeModal() {
  modalRoot.innerHTML = '';
}

// ---------- my bookings ----------

async function loadBookings() {
  const { bookings } = await api(`/api/users/${state.user.id}/bookings`);
  const container = document.getElementById('booking-list');

  if (!bookings.length) {
    container.innerHTML = `<div class="empty-state">You haven't opted into anything yet. Join a campaign above to get started.</div>`;
    return;
  }

  container.innerHTML = bookings.map((b) => `
    <div class="booking-row">
      <div>
        <div class="title">${b.campaign_title}</div>
        <div class="sub">${b.units_requested} ${b.service_name === 'AC Cleaning' ? 'AC(s)' : 'unit(s)'} · ${b.preferred_slot || 'No slot set'}</div>
      </div>
      <span class="status-pill ${b.status === 'CANCELLED' ? 'brick' : b.status === 'COMPLETED' ? 'neutral' : ''}">${BOOKING_STATUS_LABELS[b.status] || b.status}</span>
    </div>
  `).join('');
}

// ---------- boot ----------

if (state.user) {
  showApp();
} else {
  showLogin();
}
