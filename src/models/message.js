const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    message: { type: String, required: true },
    scheduledFor: { type: Date, required: true }, // the time the user asked for
    insertedAt: { type: Date, required: true },   // the time it was actually inserted
    // Link to the job; unique so the same job can never insert twice
    scheduledMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduledMessage', unique: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);