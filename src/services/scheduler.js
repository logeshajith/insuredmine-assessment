const ScheduledMessage = require('../models/scheduledMessage');
const Message = require('../models/message');

// If a job stays "processing" longer than this, the worker probably restarted mid-job
const STUCK_AFTER_MS = 60 * 1000;

// Put stuck jobs back to "pending" so they get picked again
async function recoverStuckJobs() {
  const result = await ScheduledMessage.updateMany(
    { status: 'processing', lockedAt: { $lt: new Date(Date.now() - STUCK_AFTER_MS) } },
    { $set: { status: 'pending' }, $unset: { lockedAt: '' } }
  );
  if (result.modifiedCount) {
    console.warn(`[Scheduler] Recovered ${result.modifiedCount} stuck job(s)`);
  }
}

// Pick due jobs one by one and insert their messages
async function processDueMessages() {
  let job;

  // findOneAndUpdate is atomic: only ONE worker can claim a job,
  // even when several workers run this at the same time.
  while (
    (job = await ScheduledMessage.findOneAndUpdate(
      { status: 'pending', scheduledAt: { $lte: new Date() } },
      { $set: { status: 'processing', lockedAt: new Date() } },
      { sort: { scheduledAt: 1 }, returnDocument: 'after' }
    ))
  ) {
    try {
      // upsert + unique scheduledMessageId = never inserted twice
      await Message.updateOne(
        { scheduledMessageId: job._id },
        {
          $setOnInsert: {
            message: job.message,
            scheduledFor: job.scheduledAt,
            insertedAt: new Date(),
            scheduledMessageId: job._id,
          },
        },
        { upsert: true }
      );

      await ScheduledMessage.updateOne(
        { _id: job._id },
        { $set: { status: 'done', processedAt: new Date() }, $unset: { lockedAt: '' } }
      );

      console.log(`[Scheduler] Worker ${process.pid} inserted message "${job.message}"`);
    } catch (err) {
      await ScheduledMessage.updateOne({ _id: job._id }, { $set: { status: 'failed', error: err.message } });
      console.error(`[Scheduler] Failed job ${job._id}:`, err.message);
    }
  }
}

function startScheduler({ intervalMs = 5000 } = {}) {
  let running = false;

  const tick = async () => {
    if (running) return; // don't start a new round if the last one is still running
    running = true;
    try {
      await recoverStuckJobs();
      await processDueMessages();
    } catch (err) {
      console.error('[Scheduler] Error:', err.message);
    } finally {
      running = false;
    }
  };

  tick(); // run once at startup, so jobs missed during downtime are handled immediately
  const timer = setInterval(tick, intervalMs);

  return { stop: () => clearInterval(timer) };
}

module.exports = { startScheduler };