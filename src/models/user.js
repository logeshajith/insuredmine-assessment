const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    dob: { type: Date },
    address: { type: String },
    phone: { type: String },
    state: { type: String },
    zip: { type: String },
    email: { type: String, lowercase: true, trim: true },
    gender: { type: String, default: null },
    userType: { type: String },
  },
  { timestamps: true }
);

// Emails repeat in the data, so one user = email + firstName
userSchema.index({ email: 1, firstName: 1 }, { unique: true });
// Faster search by name
userSchema.index({ firstName: 1 });

module.exports = mongoose.model('User', userSchema);