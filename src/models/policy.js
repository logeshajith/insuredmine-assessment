const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const policySchema = new mongoose.Schema(
  {
    policyNumber: { type: String, required: true, unique: true, trim: true },
    policyStartDate: { type: Date, required: true },
    policyEndDate: { type: Date, required: true },
    premiumAmount: { type: Number, default: 0 },
    categoryId: { type: ObjectId, ref: 'LOB', required: true },
    companyId: { type: ObjectId, ref: 'Carrier', required: true },
    userId: { type: ObjectId, ref: 'User', required: true },
    agentId: { type: ObjectId, ref: 'Agent' },
  },
  { timestamps: true }
);

// Faster lookup of policies by user (used in search and summary)
policySchema.index({ userId: 1 });

module.exports = mongoose.model('Policy', policySchema);