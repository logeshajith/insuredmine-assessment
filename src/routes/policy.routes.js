const express = require('express');
const controller = require('../controllers/policy.controller');

const router = express.Router();

router.get('/search', controller.searchByUsername);
router.get('/summary', controller.aggregateByUser);

module.exports = router;