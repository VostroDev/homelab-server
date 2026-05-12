// Uses the built-in node:sqlite module (available in Node.js 22+)
// No native compilation needed — no extra packages required.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'homelab.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

db.exec(`
  CREATE TABLE IF NOT EXISTS dashboards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS devices (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    auth_token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS widgets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    dashboard_id  INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    device_id     INTEGER NOT NULL REFERENCES devices(id)    ON DELETE CASCADE,
    type          TEXT    NOT NULL CHECK(type IN ('switch','graph','slider','gauge')),
    pin_name      TEXT    NOT NULL,
    label         TEXT    NOT NULL,
    grid_position INTEGER NOT NULL DEFAULT 0,
    config        TEXT    NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS sensor_data (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    pin_name    TEXT    NOT NULL,
    value       REAL    NOT NULL,
    recorded_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sensor_data_lookup
    ON sensor_data(device_id, pin_name, recorded_at DESC);
`);

// ── Helpers ───────────────────────────────────────────────────────────────────
// node:sqlite uses .all() / .get() / .run() on prepared statements,
// but parameters are positional (?). Named parameters use @name syntax.

// ── Dashboards ────────────────────────────────────────────────────────────────

const getDashboards = db.prepare(
  `SELECT * FROM dashboards ORDER BY order_index ASC, id ASC`
);

const getDashboardById = db.prepare(
  `SELECT * FROM dashboards WHERE id = ?`
);

const _createDashboard = db.prepare(
  `INSERT INTO dashboards (name, order_index)
   VALUES (?, (SELECT COALESCE(MAX(order_index),0)+1 FROM dashboards))`
);

function createDashboard(name) {
  return _createDashboard.run(name);
}

const deleteDashboard = db.prepare(`DELETE FROM dashboards WHERE id = ?`);

const _updateDashboardOrder = db.prepare(
  `UPDATE dashboards SET order_index = ? WHERE id = ?`
);

function reorderDashboards(orderedIds) {
  orderedIds.forEach((id, idx) => _updateDashboardOrder.run(idx, id));
}

// ── Devices ───────────────────────────────────────────────────────────────────

const getDevices       = db.prepare(`SELECT * FROM devices ORDER BY name`);
const getDeviceById    = db.prepare(`SELECT * FROM devices WHERE id = ?`);
const getDeviceByToken = db.prepare(`SELECT * FROM devices WHERE auth_token = ?`);

const _createDevice = db.prepare(
  `INSERT INTO devices (name, auth_token) VALUES (?, ?)`
);
function createDevice(name, auth_token) { return _createDevice.run(name, auth_token); }

const deleteDevice = db.prepare(`DELETE FROM devices WHERE id = ?`);

// ── Widgets ───────────────────────────────────────────────────────────────────

const getWidgetsByDashboard = db.prepare(`
  SELECT w.*, d.name AS device_name, d.auth_token
  FROM widgets w
  JOIN devices d ON d.id = w.device_id
  WHERE w.dashboard_id = ?
  ORDER BY w.grid_position ASC
`);

const _createWidget = db.prepare(`
  INSERT INTO widgets (dashboard_id, device_id, type, pin_name, label, grid_position, config)
  VALUES (?, ?, ?, ?, ?,
    (SELECT COALESCE(MAX(grid_position),0)+1 FROM widgets WHERE dashboard_id = ?),
    ?)
`);
function createWidget({ dashboard_id, device_id, type, pin_name, label, config }) {
  return _createWidget.run(dashboard_id, device_id, type, pin_name, label, dashboard_id, config);
}

const _updateWidget = db.prepare(
  `UPDATE widgets SET label = ?, config = ? WHERE id = ?`
);
function updateWidget({ id, label, config }) { return _updateWidget.run(label, config, id); }

const deleteWidget = db.prepare(`DELETE FROM widgets WHERE id = ?`);

const getWidgetById = db.prepare(`
  SELECT w.*, d.name AS device_name, d.auth_token
  FROM widgets w JOIN devices d ON d.id = w.device_id
  WHERE w.id = ?
`);

const _updateWidgetOrder = db.prepare(
  `UPDATE widgets SET grid_position = ? WHERE id = ?`
);
function reorderWidgets(orderedIds) {
  orderedIds.forEach((id, idx) => _updateWidgetOrder.run(idx, id));
}

// ── Sensor Data ───────────────────────────────────────────────────────────────

const _insertSensorData = db.prepare(
  `INSERT INTO sensor_data (device_id, pin_name, value) VALUES (?, ?, ?)`
);
let _insertCount = 0;
function insertSensorData(device_id, pin_name, value) {
  const result = _insertSensorData.run(device_id, pin_name, value);
  // Only trim every 100 inserts — the DELETE subquery is expensive under load
  if (++_insertCount % 100 === 0) trimSensorData(device_id, pin_name);
  return result;
}

const getSensorHistory = db.prepare(`
  SELECT value, recorded_at FROM sensor_data
  WHERE device_id = ? AND pin_name = ?
  ORDER BY recorded_at DESC LIMIT 100
`);

// Bucketed history for time-range graph scaling.
// windowMinutes and bucketMinutes are server-calculated numbers (not user input).
// Statements are cached by key so db.prepare() is only called once per window type.
const _windowedCache = new Map();
function getSensorHistoryWindowed(device_id, pin_name, windowMinutes, bucketMinutes) {
  const key = `${Math.round(windowMinutes)}-${bucketMinutes}`;
  if (!_windowedCache.has(key)) {
    _windowedCache.set(key, db.prepare(`
      SELECT
        ROUND(AVG(value), 4)  AS value,
        MIN(recorded_at)      AS recorded_at
      FROM sensor_data
      WHERE device_id = ? AND pin_name = ?
        AND recorded_at >= datetime('now', '-${Math.round(windowMinutes)} minutes')
      GROUP BY CAST(julianday(recorded_at) * 1440.0 / ${bucketMinutes} AS INTEGER)
      ORDER BY recorded_at ASC
      LIMIT 80
    `));
  }
  return _windowedCache.get(key).all(device_id, pin_name);
}

// Trim to 30,000 rows — supports 3 days at 10-second send intervals (25,920 rows)
const _trimSensorData = db.prepare(`
  DELETE FROM sensor_data
  WHERE id IN (
    SELECT id FROM sensor_data
    WHERE device_id = ? AND pin_name = ?
    ORDER BY recorded_at DESC
    LIMIT -1 OFFSET 30000
  )
`);
function trimSensorData(device_id, pin_name) { return _trimSensorData.run(device_id, pin_name); }

module.exports = {
  db,
  getDashboards, getDashboardById, createDashboard, deleteDashboard, reorderDashboards,
  getDevices, getDeviceById, getDeviceByToken, createDevice, deleteDevice,
  getWidgetsByDashboard, createWidget, updateWidget, deleteWidget, getWidgetById, reorderWidgets,
  insertSensorData, getSensorHistory, getSensorHistoryWindowed, trimSensorData,
};
