const express = require('express');
const { getWaitTime } = require('../controllers/analyticsController');

const router = express.Router();

router.get('/wait-time', getWaitTime);

module.exports = router;
