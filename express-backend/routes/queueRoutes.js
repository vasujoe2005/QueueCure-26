const express = require('express');
const {
  addPatient,
  callNext,
  completePatient,
  listQueue,
} = require('../controllers/queueController');

const router = express.Router();

router.get('/', listQueue);
router.post('/patients', addPatient);
router.post('/call-next', callNext);
router.patch('/patients/:id/complete', completePatient);

module.exports = router;
