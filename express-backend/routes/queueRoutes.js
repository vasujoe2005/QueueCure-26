const express = require('express');
const {
  callNext,
  cancelVisit,
  completeVisit,
  createVisit,
  listQueue,
  lookupPatient,
  trackVisit,
} = require('../controllers/queueController');

const router = express.Router();

router.get('/', listQueue);
router.get('/patients/:contact', lookupPatient);
router.get('/track', trackVisit);
router.get('/track/:token', trackVisit);
router.post('/visits', createVisit);
router.post('/call-next', callNext);
router.patch('/visits/:id/complete', completeVisit);
router.patch('/visits/:id/cancel', cancelVisit);
router.post('/cancel/:token', cancelVisit);

module.exports = router;
