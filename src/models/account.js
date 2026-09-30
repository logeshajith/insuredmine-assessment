const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    accountName: { type: String, required: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

accountSchema.index({ accountName: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Account', accountSchema);