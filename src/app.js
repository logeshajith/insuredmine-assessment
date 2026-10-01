const express = require('express');

const app = express();
app.use(express.json());

// Health check: quick way to see the server is alive
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', pid: process.pid, time: new Date() });
});

app.use('/api/upload', require('./routes/upload.routes'));
app.use('/api/upload', require('./routes/upload.routes'));
app.use('/api/policies', require('./routes/policy.routes'));
app.use('/api/messages', require('./routes/message.routes'));

// Test-only route, disabled in production
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/debug', require('./routes/debug.routes'));
}

// 404 for unknown routes
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Multer errors (e.g. file too large) are client errors
app.use((err, req, res, next) => {
  if (err.name === 'MulterError') err.status = 400;
  next(err);
});

// Central error handler
app.use((err, req, res, next) => {
  const status = err.status || 500;
  // Log full details only for real server errors, not for bad user input
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

module.exports = app;