const express = require('express');
const router = express.Router();
const { 
  searchMovies, 
  addMovie, 
  removeMovie 
} = require('../controllers/movieController');

router.post('/search', searchMovies);
router.post('/add', addMovie);
router.delete('/remove', removeMovie);

module.exports = router;