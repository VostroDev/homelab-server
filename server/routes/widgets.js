const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET  /api/widgets?dashboard_id=1
router.get('/', (req, res) => {
  const { dashboard_id } = req.query;
  if (!dashboard_id) return res.status(400).json({ error: 'dashboard_id required' });
  res.json(db.getWidgetsByDashboard.all(dashboard_id));
});

// POST /api/widgets  { dashboard_id, device_id, type, pin_name, label, config? }
router.post('/', (req, res) => {
  const { dashboard_id, device_id, type, pin_name, label, config } = req.body;
  const TYPES = ['switch', 'graph', 'slider', 'gauge'];
  if (!dashboard_id || !device_id || !TYPES.includes(type) || !pin_name || !label) {
    return res.status(400).json({ error: 'dashboard_id, device_id, type, pin_name, label required' });
  }
  const configStr = JSON.stringify(config || {});
  const info = db.createWidget({
    dashboard_id: parseInt(dashboard_id),
    device_id:    parseInt(device_id),
    type, pin_name,
    label: label.trim(),
    config: configStr,
  });
  res.status(201).json(db.getWidgetById.get(info.lastInsertRowid));
});

// PATCH /api/widgets/:id  { label?, config? }
router.patch('/:id', (req, res) => {
  const existing = db.getWidgetById.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const label  = req.body.label  ?? existing.label;
  const config = req.body.config ? JSON.stringify(req.body.config) : existing.config;
  db.updateWidget({ id: req.params.id, label, config });
  res.json(db.getWidgetById.get(req.params.id));
});

// DELETE /api/widgets/:id
router.delete('/:id', (req, res) => {
  db.deleteWidget.run(req.params.id);
  res.json({ ok: true });
});

// PUT /api/widgets/reorder  { ids: [3,1,2] }
router.put('/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  db.reorderWidgets(ids);
  res.json({ ok: true });
});

module.exports = router;
