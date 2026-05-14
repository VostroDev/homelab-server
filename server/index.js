const express = require('express');
const http    = require('http');
const path    = require('path');
const WebSocket = require('ws');
const aedes   = require('aedes')();
const net     = require('net');

const db = require('./db');
const dashboardRoutes = require('./routes/dashboards');
const deviceRoutes    = require('./routes/devices');
const widgetRoutes    = require('./routes/widgets');

const MQTT_PORT  = process.env.MQTT_PORT  || 1883;
const HTTP_PORT  = process.env.HTTP_PORT  || 3000;

// ── MQTT broker (Aedes — embedded, no Mosquitto install needed) ─────────────

const mqttServer = net.createServer(aedes.handle);
mqttServer.listen(MQTT_PORT, () => {
  console.log(`[MQTT] Broker listening on port ${MQTT_PORT}`);
});

// Track which tokens are currently online
const onlineDevices = new Set();

aedes.on('client', (client) => {
  const token = tokenFromClientId(client.id);
  if (token) {
    onlineDevices.add(token);
    broadcastDeviceStatus(token, true);
    console.log(`[MQTT] Device connected: ${client.id}`);
  }
});

aedes.on('clientDisconnect', (client) => {
  const token = tokenFromClientId(client.id);
  if (token) {
    onlineDevices.delete(token);
    broadcastDeviceStatus(token, false);
    console.log(`[MQTT] Device disconnected: ${client.id}`);
  }
});

aedes.on('publish', (packet, client) => {
  if (!client) return; // ignore broker-internal publishes
  const topic = packet.topic;
  const payload = packet.payload.toString();

  // home/{token}/sensor/{pin}
  const sensorMatch = topic.match(/^home\/([^/]+)\/sensor\/(.+)$/);
  if (sensorMatch) {
    const [, token, pin] = sensorMatch;
    const value = parseFloat(payload);
    if (!isNaN(value)) {
      const device = db.getDeviceByToken.get(token);
      if (device) {
        db.insertSensorData(device.id, pin, value);
        broadcastSensorUpdate(token, pin, value);
      }
    }
    return;
  }

  // home/{token}/status
  const statusMatch = topic.match(/^home\/([^/]+)\/status$/);
  if (statusMatch) {
    const [, token] = statusMatch;
    broadcastDeviceStatus(token, payload === 'online');
  }
});

function tokenFromClientId(clientId) {
  // Convention: ESP32 sets clientId = "homelab-{token}"
  const m = clientId && clientId.match(/^homelab-(.+)$/);
  return m ? m[1] : null;
}

// ── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/dashboards', dashboardRoutes);
app.use('/api/devices',    deviceRoutes);
app.use('/api/widgets',    widgetRoutes);

// Convenience: expose online-device list
app.get('/api/status', (req, res) => {
  res.json({ online: [...onlineDevices] });
});

// Send a control value from browser → MQTT → ESP32
app.post('/api/control', (req, res) => {
  const { token, pin, value } = req.body;
  if (!token || !pin || value === undefined) {
    return res.status(400).json({ error: 'token, pin, value required' });
  }
  const topic = `home/${token}/control/${pin}`;
  const packet = {
    cmd:     'publish',
    topic,
    payload: Buffer.from(String(value)),
    qos:     1,
    retain:  true,
    dup:     false,
  };
  aedes.publish(packet, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    console.log(`[CTRL] ${topic} = ${value}`);
    res.json({ ok: true });
  });
});

// Sensor history for a graph widget.
// Optional ?window= param: 5m | 1h | 6h | 24h | 3d (default: 1h)
// Server buckets the data so the browser always receives ~60 averaged points.
app.get('/api/sensor-history', (req, res) => {
  const { token, pin, window: windowParam = '1h' } = req.query;
  if (!token || !pin) return res.status(400).json({ error: 'token and pin required' });
  const device = db.getDeviceByToken.get(token);
  if (!device) return res.status(404).json({ error: 'device not found' });

  const WINDOWS = {
    '5m':  { minutes:     5, bucket: 5 / 60       }, // ~5-second buckets
    '1h':  { minutes:    60, bucket: 1             }, // 1-minute buckets
    '6h':  { minutes:   360, bucket: 6             }, // 6-minute buckets
    '24h': { minutes:  1440, bucket: 24            }, // 24-minute buckets
    '3d':  { minutes:  4320, bucket: 72            }, // 72-minute buckets
  };

  const cfg = WINDOWS[windowParam] ?? WINDOWS['1h'];
  let rows = db.getSensorHistoryWindowed(device.id, pin, cfg.minutes, cfg.bucket);

  // Fallback: if the time window returned nothing (e.g. data is older than the window),
  // return the last 80 raw readings so the chart is never blank on load.
  if (!rows.length) {
    rows = db.getSensorHistory.all(device.id, pin).reverse();
  }

  res.json(rows);
});

// ── HTTP + WebSocket server ──────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  // Send current online devices immediately on connect
  ws.send(JSON.stringify({ type: 'online_devices', tokens: [...onlineDevices] }));
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function broadcastSensorUpdate(token, pin, value) {
  broadcast({ type: 'sensor', token, pin, value, ts: Date.now() });
}

function broadcastDeviceStatus(token, online) {
  broadcast({ type: 'device_status', token, online });
}

// Global Express error handler — catches any unhandled route errors
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

server.listen(HTTP_PORT, () => {
  const ifaces = require('os').networkInterfaces();
  let localIP = 'localhost';
  const candidates = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      candidates.push({ name, address: iface.address });
    }
  }
  // Prefer real WiFi/LAN addresses over Docker/VM bridge interfaces.
  // Docker typically uses 172.17.x.x and 172.18.x.x; skip those.
  const preferred = candidates.find(c => /^192\.168\./.test(c.address))
    ?? candidates.find(c => /^10\./.test(c.address))
    ?? candidates.find(c => {
      const second = parseInt(c.address.split('.')[1], 10);
      return /^172\./.test(c.address) && second >= 16 && second <= 31
        && !['172.17', '172.18', '172.19'].some(p => c.address.startsWith(p));
    })
    ?? candidates[0];
  if (preferred) localIP = preferred.address;
  console.log(`[HTTP] Server running at http://localhost:${HTTP_PORT}`);
  console.log(`[HTTP] Network access: http://${localIP}:${HTTP_PORT}`);
  console.log(`[MQTT] ESP32 broker IP for students: ${localIP}:${MQTT_PORT}`);
});
