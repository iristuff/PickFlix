const mongoose = require('mongoose');

//blueprint for a movie session in the session pool
const movieSchema = new mongoose.Schema({
    tmdbId: { type: String, required: true },
    title: { type: String, required: true },
    poster: { type: String },
    year: { type: String },
    genre: { type: [String] },
    rating: { type: Number },
    runtime: { type: Number },
    overview: { type: String },
    addedBy: { type: String, required: true }
});

//blueprint for a session
const sessionSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        length: 6
    },
    host: {
        type: String,
        required: true
    },
    participants: {
        type: [String],
        default: []
    },
    movies: {
        type: [movieSchema],
        default: []
    },
    status: {
    type: String,
    enum: {
      values: ['setup', 'voting', 'completed'],
      message: '{VALUE} is not a valid status'
    },
    default: 'setup'
  },
    createdAt: {
        type: Date,
        default: Date.now,
        expries: '24h' // Session expires after 24 hours
    }
})

module.exports = mongoose.model('Session', sessionSchema);