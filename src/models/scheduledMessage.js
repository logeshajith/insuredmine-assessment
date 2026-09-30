const mongoose = require('mongoose');

const scheduledMessageSchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true },
    scheduledAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'done', 'failed'],
      default: 'pending',
    },
    lockedAt: { type: Date },    // when a worker picked the job
    processedAt: { type: Date }, // when the message was inserted
    error: { type: String },
  },
  { timestamps: true }
);

// Scheduler looks for pending jobs by time, so index both
scheduledMessageSchema.index({ status: 1, scheduledAt: 1 });

module.exports = mongoose.model('ScheduledMessage', scheduledMessageSchema);