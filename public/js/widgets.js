// ── Widget Renderers ──────────────────────────────────────────────────────────
// Each render function returns an HTML string.
// Each widget also exposes an update(cardEl, value) function via the
// updateWidget(id, value) dispatcher in dashboard.js

const WIDGET_TYPES = {

  // ── Switch ──────────────────────────────────────────────────────────────────
  switch: {
    label: 'Switch',
    renderCard(w) {
      const config = safeJSON(w.config);
      return `
        <div class="widget-card" id="wc-${w.id}" data-id="${w.id}" data-type="switch" data-token="${w.auth_token}" data-pin="${w.pin_name}">
          ${editControls(w)}
          <div class="widget-header">
            <div>
              <div class="widget-label">${escHtml(w.label)}</div>
              <div class="widget-pin">${escHtml(w.device_name)} · ${escHtml(w.pin_name)}</div>
            </div>
          </div>
          <div class="switch-body">
            <div class="switch-value off" id="sw-val-${w.id}">OFF</div>
            <label class="toggle" id="sw-${w.id}" title="Toggle">
              <input type="checkbox" id="sw-chk-${w.id}"
                     onchange="onSwitchChange(${w.id}, this.checked)">
              <div class="toggle-track"><div class="toggle-thumb"></div></div>
            </label>
          </div>
        </div>`;
    },
    update(cardEl, value) {
      const on  = parseFloat(value) !== 0 && value !== 'OFF' && value !== '0';
      const chk = cardEl.querySelector('input[type=checkbox]');
      const val = cardEl.querySelector('.switch-value');
      if (chk) chk.checked = on;
      if (val) { val.textContent = on ? 'ON' : 'OFF'; val.className = `switch-value ${on ? 'on' : 'off'}`; }
    },
  },

  // ── Slider ──────────────────────────────────────────────────────────────────
  slider: {
    label: 'Slider',
    renderCard(w) {
      const cfg  = safeJSON(w.config);
      const min  = cfg.min  ?? 0;
      const max  = cfg.max  ?? 255;
      const unit = cfg.unit ?? '';
      return `
        <div class="widget-card" id="wc-${w.id}" data-id="${w.id}" data-type="slider" data-token="${w.auth_token}" data-pin="${w.pin_name}">
          ${editControls(w)}
          <div class="widget-header">
            <div>
              <div class="widget-label">${escHtml(w.label)}</div>
              <div class="widget-pin">${escHtml(w.device_name)} · ${escHtml(w.pin_name)}</div>
            </div>
          </div>
          <div class="slider-body">
            <div class="slider-val" id="sl-val-${w.id}">—${unit ? ' ' + escHtml(unit) : ''}</div>
            <input type="range" min="${min}" max="${max}" value="${min}"
                   id="sl-rng-${w.id}"
                   oninput="onSliderInput(${w.id}, this.value)"
                   onchange="onSliderCommit(${w.id}, this.value)">
          </div>
        </div>`;
    },
    update(cardEl, value) {
      const rng = cardEl.querySelector('input[type=range]');
      const val = cardEl.querySelector('[id^="sl-val-"]');
      const num = parseFloat(value);
      if (rng) rng.value = num;
      if (val) {
        const unit = (rng?.dataset.unit) ?? '';
        val.textContent = isNaN(num) ? '—' : `${Math.round(num)}${unit ? ' ' + unit : ''}`;
      }
    },
  },

  // ── Gauge ───────────────────────────────────────────────────────────────────
  gauge: {
    label: 'Gauge',
    renderCard(w) {
      const cfg  = safeJSON(w.config);
      const min  = cfg.min  ?? 0;
      const max  = cfg.max  ?? 100;
      const unit = cfg.unit ?? '';
      const r    = 50;
      const cx   = 60; const cy = 60;
      // Half-circle arc: from 180° to 0° (left to right across top)
      const circumference = Math.PI * r; // half circle
      return `
        <div class="widget-card" id="wc-${w.id}" data-id="${w.id}" data-type="gauge" data-token="${w.auth_token}" data-pin="${w.pin_name}"
             data-min="${min}" data-max="${max}" data-unit="${escHtml(unit)}">
          ${editControls(w)}
          <div class="widget-header">
            <div>
              <div class="widget-label">${escHtml(w.label)}</div>
              <div class="widget-pin">${escHtml(w.device_name)} · ${escHtml(w.pin_name)}</div>
            </div>
          </div>
          <div class="gauge-body">
            <div class="gauge-wrap">
              <svg class="gauge-svg" viewBox="10 15 100 55" width="120" height="70">
                <path class="gauge-arc-bg"
                  d="M15,60 a${r},${r} 0 0,1 ${r*2},0"
                  stroke-dasharray="${circumference}" stroke-dashoffset="0"/>
                <path class="gauge-arc-fill" id="gauge-fill-${w.id}"
                  d="M15,60 a${r},${r} 0 0,1 ${r*2},0"
                  stroke-dasharray="${circumference}"
                  stroke-dashoffset="${circumference}"/>
              </svg>
            </div>
            <div class="gauge-num" id="gauge-num-${w.id}">—</div>
            <div class="gauge-unit">${escHtml(unit)}</div>
          </div>
        </div>`;
    },
    update(cardEl, value) {
      const num  = parseFloat(value);
      const min  = parseFloat(cardEl.dataset.min ?? 0);
      const max  = parseFloat(cardEl.dataset.max ?? 100);
      const unit = cardEl.dataset.unit ?? '';
      const fill = cardEl.querySelector('[id^="gauge-fill-"]');
      const num_el = cardEl.querySelector('[id^="gauge-num-"]');
      if (fill) {
        const r     = 50;
        const total = Math.PI * r;
        const pct   = Math.max(0, Math.min(1, (num - min) / (max - min)));
        fill.style.strokeDashoffset = total - pct * total;
      }
      if (num_el) num_el.textContent = isNaN(num) ? '—' : num.toFixed(1);
    },
  },

  // ── Graph ───────────────────────────────────────────────────────────────────
  graph: {
    label: 'Graph',
    renderCard(w) {
      const cfg  = safeJSON(w.config);
      const unit = cfg.unit ?? '';
      const ranges = ['5m', '1h', '6h', '24h', '3d'];
      const pillsHTML = ranges.map(r =>
        `<button class="range-pill ${r === '1h' ? 'active' : ''}"
                 onclick="changeGraphRange(${w.id}, '${r}', this)">${r}</button>`
      ).join('');
      return `
        <div class="widget-card graph-card" id="wc-${w.id}" data-id="${w.id}" data-type="graph"
             data-token="${w.auth_token}" data-pin="${w.pin_name}" data-unit="${escHtml(unit)}" data-range="1h">
          ${editControls(w)}
          <div class="widget-header">
            <div>
              <div class="widget-label">${escHtml(w.label)}</div>
              <div class="widget-pin">${escHtml(w.device_name)} · ${escHtml(w.pin_name)}${unit ? ' · ' + escHtml(unit) : ''}</div>
            </div>
            <div class="range-pills">${pillsHTML}</div>
          </div>
          <div class="graph-body">
            <canvas id="graph-canvas-${w.id}"></canvas>
          </div>
        </div>`;
    },
    update(cardEl, value) {
      const id    = cardEl.dataset.id;
      const chart = window._charts?.[id];
      if (!chart) return;
      const num   = parseFloat(value);
      if (isNaN(num)) return;
      const range = cardEl.dataset.range ?? '1h';
      const ts    = fmtTimestamp(new Date(), range);
      chart.data.labels.push(ts);
      chart.data.datasets[0].data.push(num);
      if (chart.data.labels.length > 80) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
      }
      chart.update('quiet');
    },
  },
};

// Called after graph cards are injected into the DOM — initialises Chart.js instances
function initGraphCharts(widgets) {
  window._charts = window._charts || {};
  widgets.filter(w => w.type === 'graph').forEach(w => {
    const canvas = document.getElementById(`graph-canvas-${w.id}`);
    if (!canvas) return;
    if (window._charts[w.id]) { window._charts[w.id].destroy(); }
    window._charts[w.id] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: '#4f8ef7',
          backgroundColor: 'rgba(79,142,247,0.08)',
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.4,
          fill: true,
        }]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#8892b0', maxTicksLimit: 6, font: { size: 10 } }, grid: { color: '#2e3350' } },
          y: { ticks: { color: '#8892b0', font: { size: 10 } }, grid: { color: '#2e3350' } },
        },
      },
    });
  });
}

// Fetch bucketed history for a given time range and load it into the chart.
// range = '5m' | '1h' | '6h' | '24h' | '3d'
async function fetchGraphRange(w, range) {
  try {
    const card  = document.getElementById(`wc-${w.id}`);
    const chart = window._charts?.[w.id];
    if (!chart) return;
    if (card) card.dataset.range = range;

    const res  = await fetch(`/api/sensor-history?token=${encodeURIComponent(w.auth_token)}&pin=${encodeURIComponent(w.pin_name)}&window=${range}`);
    if (!res.ok) { console.error('[Graph] server error', res.status); return; }
    const rows = await res.json();
    if (!rows.length) return;

    // SQLite returns "YYYY-MM-DD HH:MM:SS" — replace space with T for reliable ISO parsing
    chart.data.labels           = rows.map(r => fmtTimestamp(new Date(r.recorded_at.replace(' ', 'T') + 'Z'), range));
    chart.data.datasets[0].data = rows.map(r => r.value);
    chart.update();
  } catch (err) {
    console.error('[Graph] fetchGraphRange error:', err);
  }
}

// Format a Date for the X-axis label based on the active range
function fmtTimestamp(date, range) {
  if (range === '3d' || range === '24h') {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '6h') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Kept for backward compatibility — defaults to 1h range
async function seedGraphHistory(w) { return fetchGraphRange(w, '1h'); }

// ── Shared helpers ────────────────────────────────────────────────────────────

function editControls(w) {
  return `
    <div class="widget-edit-controls">
      <div class="drag-handle-widget" title="Drag to reorder">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/></svg>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="openEditWidget(${w.id})" style="padding:0.25rem 0.5rem">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="btn btn-danger btn-sm" onclick="removeWidget(${w.id})" style="padding:0.25rem 0.5rem">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M8 6V4h8v2"/></svg>
      </button>
    </div>`;
}

function safeJSON(str) {
  try { return JSON.parse(str) || {}; } catch (_) { return {}; }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
