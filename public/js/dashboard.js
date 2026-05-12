// ── Dashboard controller ──────────────────────────────────────────────────────

const params      = new URLSearchParams(location.search);
const DASH_ID     = parseInt(params.get('id'));
let   widgets     = [];
let   devices     = [];
let   editMode    = false;
let   selectedType = null;
let   dragSrcId   = null;

if (!DASH_ID) { window.location.href = '/'; }

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  // Load dashboard meta
  const dashRes = await fetch(`/api/dashboards/${DASH_ID}`);
  if (!dashRes.ok) { window.location.href = '/'; return; }
  const dash = await dashRes.json();
  document.title = `${dash.name} — HomeLab`;
  document.getElementById('dash-title').textContent = dash.name;

  // Load devices for the add-widget panel
  const devRes = await fetch('/api/devices');
  devices = await devRes.json();
  populateDeviceSelect();

  // Load widgets
  await loadWidgets();

  // WebSocket for live data
  connectWS();
})();

// ── WebSocket ─────────────────────────────────────────────────────────────────
let ws;
function connectWS() {
  ws = new WebSocket(`ws://${location.host}/ws`);

  ws.onopen = () => {
    // Get current online state for the device status indicator
    fetch('/api/status').then(r => r.json()).then(data => {
      updateAllDeviceStatus(new Set(data.online));
    });
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    if (msg.type === 'online_devices') {
      updateAllDeviceStatus(new Set(msg.tokens));
    }

    if (msg.type === 'device_status') {
      updateDeviceStatusBadge(msg.token, msg.online);
    }

    if (msg.type === 'sensor') {
      // Deliver to every widget on this dashboard that matches token+pin
      widgets.forEach(w => {
        if (w.auth_token === msg.token && w.pin_name === msg.pin) {
          const card = document.getElementById(`wc-${w.id}`);
          if (card) WIDGET_TYPES[w.type].update(card, msg.value);
        }
      });
    }
  };

  ws.onclose = () => setTimeout(connectWS, 3000);
  ws.onerror = () => ws.close();
}

function updateAllDeviceStatus(onlineSet) {
  widgets.forEach(w => updateDeviceStatusBadge(w.auth_token, onlineSet.has(w.auth_token)));
}

function updateDeviceStatusBadge(token, online) {
  // Per-widget status dots
  document.querySelectorAll(`[data-token="${token}"] .status-dot`).forEach(d => {
    d.classList.toggle('online', online);
  });
  // Header status badge (shows first device used on this dashboard)
  const firstMatch = widgets.find(w => w.auth_token === token);
  if (firstMatch) {
    const dot   = document.getElementById('status-dot');
    const label = document.getElementById('status-label');
    const area  = document.getElementById('dev-status');
    if (dot && label) {
      area.style.display = 'flex';
      dot.classList.toggle('online', online);
      label.textContent = online ? 'online' : 'offline';
    }
  }
}

// ── Widget loading & rendering ────────────────────────────────────────────────
async function loadWidgets() {
  const res = await fetch(`/api/widgets?dashboard_id=${DASH_ID}`);
  widgets   = await res.json();
  renderGrid();
}

function renderGrid() {
  const grid = document.getElementById('widget-grid');
  if (!widgets.length) {
    grid.innerHTML = `
      <div class="empty-dash">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        <p>No widgets yet. Click <strong>Edit → Add Widget</strong> to build your dashboard.</p>
      </div>
      <div class="add-placeholder" onclick="openAddPanel()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        Add first widget
      </div>`;
    initGraphCharts([]);
    return;
  }

  grid.innerHTML = widgets.map(w => WIDGET_TYPES[w.type].renderCard(w)).join('') +
    `<div class="add-placeholder" onclick="openAddPanel()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      Add widget
    </div>`;

  attachDragHandlers();
  initGraphCharts(widgets);
  widgets.filter(w => w.type === 'graph').forEach(w => {
    const savedRange = localStorage.getItem(`graph-range-${w.id}`) || '1h';
    // Reflect saved range on the pill buttons
    const card = document.getElementById(`wc-${w.id}`);
    card?.querySelectorAll('.range-pill').forEach(p => {
      p.classList.toggle('active', p.textContent === savedRange);
    });
    fetchGraphRange(w, savedRange);
  });
}

// ── Drag-to-reorder widgets ───────────────────────────────────────────────────
function attachDragHandlers() {
  widgets.forEach(w => {
    const card   = document.getElementById(`wc-${w.id}`);
    const handle = card?.querySelector('.drag-handle-widget');
    if (!card || !handle) return;

    handle.addEventListener('mousedown', () => { card.draggable = true; });
    handle.addEventListener('touchstart', () => { card.draggable = true; });
    document.addEventListener('mouseup', () => { card.draggable = false; }, { once: true });

    card.addEventListener('dragstart', (e) => {
      dragSrcId = w.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      card.draggable = false;
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (w.id !== dragSrcId) card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      if (w.id === dragSrcId) return;

      const srcIdx  = widgets.findIndex(x => x.id === dragSrcId);
      const tgtIdx  = widgets.findIndex(x => x.id === w.id);
      const [moved] = widgets.splice(srcIdx, 1);
      widgets.splice(tgtIdx, 0, moved);
      renderGrid();

      await fetch('/api/widgets/reorder', {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ ids: widgets.map(x => x.id) })
      });
    });
  });
}

// ── Edit mode ─────────────────────────────────────────────────────────────────
function enterEditMode() {
  editMode = true;
  document.body.classList.add('edit-mode');
  document.getElementById('view-actions').style.display = 'none';
  document.getElementById('edit-actions').style.display = 'flex';
}

function exitEditMode() {
  editMode = false;
  document.body.classList.remove('edit-mode');
  document.getElementById('view-actions').style.display = '';
  document.getElementById('edit-actions').style.display = 'none';
  closeAddPanel();
}

// ── Add widget panel ──────────────────────────────────────────────────────────
function populateDeviceSelect() {
  const sel = document.getElementById('w-device');
  sel.innerHTML = '<option value="">Select a device…</option>' +
    devices.map(d => `<option value="${d.id}">${escHtml(d.name)}</option>`).join('');
}

function openAddPanel() {
  document.getElementById('add-panel').classList.add('open');
}

function closeAddPanel() {
  document.getElementById('add-panel').classList.remove('open');
}

function selectType(type) {
  selectedType = type;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
  document.querySelector(`[data-type="${type}"]`).classList.add('selected');
  document.querySelectorAll('.config-section').forEach(s => s.classList.remove('visible'));
  const sec = document.getElementById(`cfg-${type}`);
  if (sec) sec.classList.add('visible');
}

async function submitAddWidget() {
  const label    = document.getElementById('w-label').value.trim();
  const deviceId = document.getElementById('w-device').value;
  const pin      = document.getElementById('w-pin').value.trim();

  if (!selectedType) { showToast('Please select a widget type'); return; }
  if (!label)        { showToast('Please enter a label'); return; }
  if (!deviceId)     { showToast('Please select a device'); return; }
  if (!pin)          { showToast('Please enter a pin name'); return; }

  const config = buildConfig();

  const res = await fetch('/api/widgets', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ dashboard_id: DASH_ID, device_id: parseInt(deviceId), type: selectedType, pin_name: pin, label, config })
  });
  if (!res.ok) { showToast('Error adding widget'); return; }
  const widget = await res.json();
  widgets.push(widget);
  renderGrid();
  showToast(`${widget.label} added`);

  // Reset form
  document.getElementById('w-label').value = '';
  document.getElementById('w-pin').value   = '';
  document.getElementById('w-device').value = '';
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.config-section').forEach(s => s.classList.remove('visible'));
  selectedType = null;
}

function buildConfig() {
  switch (selectedType) {
    case 'slider':
      return { min: parseFloat(document.getElementById('w-min').value) || 0,
               max: parseFloat(document.getElementById('w-max').value) || 255 };
    case 'gauge':
      return { min: parseFloat(document.getElementById('g-min').value) || 0,
               max: parseFloat(document.getElementById('g-max').value) || 100,
               unit: document.getElementById('g-unit').value.trim() };
    case 'graph':
      return { unit: document.getElementById('gr-unit').value.trim() };
    default:
      return {};
  }
}

// ── Remove widget ─────────────────────────────────────────────────────────────
async function removeWidget(id) {
  if (!confirm('Remove this widget?')) return;
  await fetch(`/api/widgets/${id}`, { method: 'DELETE' });
  widgets = widgets.filter(w => w.id !== id);
  if (window._charts?.[id]) { window._charts[id].destroy(); delete window._charts[id]; }
  renderGrid();
}

// ── Edit widget modal ─────────────────────────────────────────────────────────
function openEditWidget(id) {
  const w = widgets.find(x => x.id === id);
  if (!w) return;
  document.getElementById('ew-id').value    = id;
  document.getElementById('ew-label').value = w.label;

  const cfg    = safeJSON(w.config);
  let extraHTML = '';
  if (w.type === 'slider') {
    extraHTML = `
      <div class="inline-pair">
        <div class="form-group"><label>Min</label><input type="number" id="ew-min" value="${cfg.min ?? 0}"></div>
        <div class="form-group"><label>Max</label><input type="number" id="ew-max" value="${cfg.max ?? 255}"></div>
      </div>`;
  } else if (w.type === 'gauge') {
    extraHTML = `
      <div class="inline-pair">
        <div class="form-group"><label>Min</label><input type="number" id="ew-min" value="${cfg.min ?? 0}"></div>
        <div class="form-group"><label>Max</label><input type="number" id="ew-max" value="${cfg.max ?? 100}"></div>
      </div>
      <div class="form-group"><label>Unit</label><input type="text" id="ew-unit" value="${escHtml(cfg.unit ?? '')}"></div>`;
  } else if (w.type === 'graph') {
    extraHTML = `<div class="form-group"><label>Unit</label><input type="text" id="ew-unit" value="${escHtml(cfg.unit ?? '')}"></div>`;
  }
  document.getElementById('ew-config-fields').innerHTML = extraHTML;
  document.getElementById('edit-widget-modal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('edit-widget-modal').classList.remove('open');
}

async function saveEditWidget() {
  const id    = parseInt(document.getElementById('ew-id').value);
  const label = document.getElementById('ew-label').value.trim();
  if (!label) { showToast('Label cannot be empty'); return; }

  const w   = widgets.find(x => x.id === id);
  const cfg = {};
  if (w?.type === 'slider' || w?.type === 'gauge') {
    cfg.min = parseFloat(document.getElementById('ew-min')?.value) || 0;
    cfg.max = parseFloat(document.getElementById('ew-max')?.value) || 100;
  }
  if (w?.type === 'gauge' || w?.type === 'graph') {
    cfg.unit = document.getElementById('ew-unit')?.value.trim() || '';
  }

  const res = await fetch(`/api/widgets/${id}`, {
    method: 'PATCH', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ label, config: cfg })
  });
  const updated = await res.json();
  const idx = widgets.findIndex(x => x.id === id);
  if (idx !== -1) widgets[idx] = updated;
  closeEditModal();
  renderGrid();
}

document.getElementById('edit-widget-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('edit-widget-modal')) closeEditModal();
});

// ── Widget event handlers (called from inline HTML) ───────────────────────────

async function onSwitchChange(id, checked) {
  const w = widgets.find(x => x.id === id);
  if (!w) return;
  const value = checked ? '1' : '0';
  await fetch('/api/control', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ token: w.auth_token, pin: w.pin_name, value })
  });
  const card = document.getElementById(`wc-${id}`);
  if (card) WIDGET_TYPES.switch.update(card, value);
}

function onSliderInput(id, value) {
  const card = document.getElementById(`wc-${id}`);
  const val  = card?.querySelector('[id^="sl-val-"]');
  const w    = widgets.find(x => x.id === id);
  const cfg  = safeJSON(w?.config);
  const unit = cfg.unit ?? '';
  if (val) val.textContent = `${Math.round(value)}${unit ? ' ' + unit : ''}`;
}

async function onSliderCommit(id, value) {
  const w = widgets.find(x => x.id === id);
  if (!w) return;
  await fetch('/api/control', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ token: w.auth_token, pin: w.pin_name, value })
  });
}

// ── Graph range selector ──────────────────────────────────────────────────────
async function changeGraphRange(id, range, pillEl) {
  const w = widgets.find(x => x.id === id);
  if (!w) return;

  // Persist choice so it survives page reloads
  localStorage.setItem(`graph-range-${id}`, range);

  // Update active pill styling
  const card = document.getElementById(`wc-${id}`);
  card?.querySelectorAll('.range-pill').forEach(p => p.classList.remove('active'));
  if (pillEl) pillEl.classList.add('active');

  await fetchGraphRange(w, range);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}
