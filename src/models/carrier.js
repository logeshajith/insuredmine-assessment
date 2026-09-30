const mongoose = require('mongoose');

const carrierSchema = new mongoose.Schema(
  { company_name: { type: String, required: true, unique: true, trim: true } },
  { timestamps: true }
);

module.exports = mongoose.model('Carrier', carrierSchema);