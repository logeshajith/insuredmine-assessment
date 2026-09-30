const mongoose = require('mongoose');

const uploadJobSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
    result: { type: mongoose.Schema.Types.Mixed },
    error: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UploadJob', uploadJobSchema);