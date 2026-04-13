const express = require('express');
const router = express.Router();
const { 
  createSession, 
  joinSession, 
  getSession, 
  updateStatus 
} = require('../controllers/sessionController');

router.post('/create', createSession);
router.post('/join', joinSession);
router.get('/:code', getSession);
router.put('/:code/status', updateStatus);

module.exports = router;