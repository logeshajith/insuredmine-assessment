const path = require('path');
const mongoose = require('mongoose');
const { Worker } = require('worker_threads');
const UploadJob = require('../models/uploadJob');

exports.upload = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a CSV or XLSX file in the "file" field' });
  }

  const job = await UploadJob.create({ fileName: req.file.originalname });

  // Start the background worker
  const worker = new Worker(path.join(__dirname, '../workers/importWorker.js'), {
    workerData: { filePath: req.file.path, mongoUri: process.env.MONGO_URI },
  });

  worker.on('message', async (msg) => {
    if (msg.ok) {
      await UploadJob.findByIdAndUpdate(job._id, { status: 'completed', result: msg.summary });
    } else {
      await UploadJob.findByIdAndUpdate(job._id, { status: 'failed', error: msg.error });
    }
  });

  worker.on('error', async (err) => {
    await UploadJob.findByIdAndUpdate(job._id, { status: 'failed', error: err.message });
  });

  // Reply immediately; the worker keeps running in the background
  res.status(202).json({
    message: 'File received. Import is running in the background.',
    jobId: job._id,
    statusUrl: `/api/upload/${job._id}`,
  });
};

exports.status = async (req, res) => {
  const { jobId } = req.params;
  if (!mongoose.isValidObjectId(jobId)) {
    return res.status(400).json({ error: 'Invalid job ID' });
  }
  const job = await UploadJob.findById(jobId).lean();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
};