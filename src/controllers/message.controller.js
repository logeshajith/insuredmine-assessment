const mongoose = require('mongoose');
const ScheduledMessage = require('../models/scheduledMessage');
const Message = require('../models/message');

const DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/;   // 2026-10-05
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/; // 00:00 to 23:59

// Checks the date really exists (e.g. rejects 2026-02-30)
function isRealDate(day) {
  const [y, m, d] = day.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

// POST /api/messages/schedule
exports.scheduleMessage = async (req, res) => {
  const { message, day, time } = req.body || {};

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: '"message" is required' });
  }
  if (message.length > 1000) {
    return res.status(400).json({ error: '"message" must be 1000 characters or less' });
  }
  if (typeof day !== 'string' || !DAY_REGEX.test(day) || !isRealDate(day)) {
    return res.status(400).json({ error: '"day" must be a valid date in YYYY-MM-DD format' });
  }
  if (typeof time !== 'string' || !TIME_REGEX.test(time)) {
    return res.status(400).json({ error: '"time" must be in HH:mm format (24-hour), e.g. "14:30"' });
  }

  // Combine day + time + timezone, e.g. "2026-10-05T10:30:00+05:30"
  const offset = process.env.TIMEZONE_OFFSET || '+05:30';
  const scheduledAt = new Date(`${day}T${time}:00${offset}`);

  if (scheduledAt <= new Date()) {
    return res.status(400).json({ error: 'Scheduled time must be in the future' });
  }

  const job = await ScheduledMessage.create({ message: message.trim(), scheduledAt });

  res.status(201).json({
    message: 'Message scheduled successfully',
    id: job._id,
    scheduledAt: job.scheduledAt, // UTC time stored in DB
    scheduledLocal: `${day} ${time} (UTC${offset})`,
    status: job.status,
  });
};

// GET /api/messages/scheduled?status=pending
exports.listScheduled = async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const jobs = await ScheduledMessage.find(filter).sort({ scheduledAt: -1 }).limit(50).lean();
  res.json({ count: jobs.length, jobs });
};

// GET /api/messages  (messages that were actually inserted)
exports.listMessages = async (req, res) => {
  const messages = await Message.find().sort({ insertedAt: -1 }).limit(50).lean();
  res.json({ count: messages.length, messages });
};