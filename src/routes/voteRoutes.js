const express = require('express');
const router = express.Router();
const { 
  submitVote, 
  getVotes, 
  getResults 
} = require('../controllers/voteController');

router.post('/submit', submitVote);
router.get('/:code', getVotes);
router.get('/:code/results', getResults);

module.exports = router;