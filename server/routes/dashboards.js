const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET  /api/dashboards
router.get('/', (req, res) => {
  res.json(db.getDashboards.all());
});

// GET  /api/dashboards/:id
router.get('/:id', (req, res) => {
  const dash = db.getDashboardById.get(req.params.id);
  if (!dash) return res.status(404).json({ error: 'Not found' });
  res.json(dash);
});

// POST /api/dashboards  { name }
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  const info = db.createDashboard(name.trim());
  res.status(201).json(db.getDashboardById.get(info.lastInsertRowid));
});

// DELETE /api/dashboards/:id
router.delete('/:id', (req, res) => {
  db.deleteDashboard.run(req.params.id);
  res.json({ ok: true });
});

// PUT /api/dashboards/reorder  { ids: [3,1,2] }
router.put('/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  db.reorderDashboards(ids);
  res.json({ ok: true });
});

module.exports = router;
