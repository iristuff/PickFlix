const mongoose = require('mongoose');

const rankingSchema = new mongoose.Schema({
  movieId: { 
    type: String, 
    required: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  rank: { 
    type: Number, 
    required: true,
    min: 1,
    max: 3
  }
});

const voteSchema = new mongoose.Schema({
  sessionCode: {
    type: String,
    required: true,
    uppercase: true
  },
  username: {
    type: String,
    required: true
  },
  rankings: {
    type: [rankingSchema],
    required: true,
    validate: {
      validator: function(rankings) {
        return rankings.length >= 1 && rankings.length <= 3;
      },
      message: 'Must rank between 1 and 3 movies'
    }
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
});

voteSchema.index({ sessionCode: 1, username: 1 }, { unique: true });

module.exports = mongoose.model('Vote', voteSchema);