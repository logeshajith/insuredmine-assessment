const express = require('express');

const router = express.Router();

// GET /api/debug/cpu-load?seconds=60
// Keeps this worker's CPU busy, to demo the auto-restart.
router.get('/cpu-load', (req, res) => {
  const seconds = Math.min(parseInt(req.query.seconds, 10) || 60, 120);
  const stopAt = Date.now() + seconds * 1000;

  // Busy for 200ms, then give a tiny break so timers (the CPU monitor) can still run
  const burn = () => {
    const end = Date.now() + 200;
    while (Date.now() < end) { /* busy loop */ }
    if (Date.now() < stopAt) setImmediate(burn);
  };
  setImmediate(burn);

  res.status(202).json({ message: `Creating CPU load for ${seconds}s`, pid: process.pid });
});

module.exports = router;