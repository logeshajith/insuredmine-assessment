const express = require('express');
const path = require('path');
const multer = require('multer');
const controller = require('../controllers/upload.controller');

const router = express.Router();

// Save uploaded files in /uploads, keeping the file extension
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    const err = new Error('Only CSV or XLSX files are allowed');
    err.status = 400;
    cb(err);
  },
});

router.post('/', upload.single('file'), controller.upload);
router.get('/:jobId', controller.status);

module.exports = router;