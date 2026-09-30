const express = require('express');
const controller = require('../controllers/message.controller');

const router = express.Router();

router.post('/schedule', controller.scheduleMessage);
router.get('/scheduled', controller.listScheduled);
router.get('/', controller.listMessages);

module.exports = router;