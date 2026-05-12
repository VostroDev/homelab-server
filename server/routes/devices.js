const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');

// GET  /api/devices
router.get('/', (req, res) => {
  res.json(db.getDevices.all());
});

// GET  /api/devices/:id
router.get('/:id', (req, res) => {
  const device = db.getDeviceById.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Not found' });
  res.json(device);
});

// POST /api/devices  { name }
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  const token = uuidv4().replace(/-/g, '').substring(0, 16);
  const info  = db.createDevice(name.trim(), token);
  res.status(201).json(db.getDeviceById.get(info.lastInsertRowid));
});

// DELETE /api/devices/:id
router.delete('/:id', (req, res) => {
  db.deleteDevice.run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
