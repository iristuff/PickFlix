const axios = require('axios');
const Session = require('../models/Session');

function buildTmdbAuth() {
  const raw = (process.env.TMDB_API_KEY || '').trim();
  // TMDB v3 API key is typically a 32-char hex string.
  const looksLikeV3Key = /^[a-f0-9]{32}$/i.test(raw);
  if (!raw) return { headers: {}, params: {} };
  if (looksLikeV3Key) {
    return { headers: {}, params: { api_key: raw } };
  }
  // Otherwise assume it's a v4 Read Access Token (Bearer).
  return { headers: { Authorization: `Bearer ${raw}` }, params: {} };
}

// SEARCH MOVIES VIA TMDB
// POST /api/movies/search
const searchMovies = async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const auth = buildTmdbAuth();
    if (!process.env.TMDB_API_KEY || !String(process.env.TMDB_API_KEY).trim()) {
      return res.status(500).json({
        error: 'TMDB_API_KEY is not set on the server'
      });
    }

    // Call TMDB API
    const response = await axios.get(
      'https://api.themoviedb.org/3/search/movie',
      {
        headers: auth.headers,
        params: {
          ...auth.params,
          query,
          include_adult: false,
          language: 'en-US',
          page: 1
        }
      }
    );

    // Format the results
    const movies = response.data.results.slice(0, 10).map(movie => ({
      tmdbId: String(movie.id),
      title: movie.title,
      poster: movie.poster_path 
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` 
        : null,
      year: movie.release_date 
        ? movie.release_date.slice(0, 4) 
        : 'Unknown',
      overview: movie.overview,
      rating: movie.vote_average
    }));

    res.status(200).json({ 
      query,
      totalResults: movies.length,
      movies 
    });

  } catch (error) {
    const status = error?.response?.status || 500;
    const tmdbMsg =
      error?.response?.data?.status_message ||
      error?.response?.data?.status_message?.toString?.() ||
      error?.message;
    console.error('searchMovies error:', tmdbMsg);
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: tmdbMsg || 'TMDB request failed'
    });
  }
};

// ADD MOVIE TO SESSION POOL
// POST /api/movies/add
const addMovie = async (req, res) => {
  try {
    const { sessionCode, username, movie } = req.body;

    // Validate inputs
    if (!sessionCode || !username || !movie) {
      return res.status(400).json({ 
        error: 'sessionCode, username and movie are required' 
      });
    }

    // Find the session
    const session = await Session.findOne({ 
      code: sessionCode.toUpperCase() 
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Can only add movies during setup phase
    if (session.status !== 'setup') {
      return res.status(400).json({ 
        error: 'Can only add movies during setup phase' 
      });
    }

    // Check if movie already in pool
    const alreadyAdded = session.movies.some(
      m => m.tmdbId === movie.tmdbId
    );

    if (alreadyAdded) {
      return res.status(400).json({ 
        error: 'This movie is already in the pool' 
      });
    }

    // Add movie to pool
    session.movies.push({
      tmdbId: movie.tmdbId,
      title: movie.title,
      poster: movie.poster || '',
      year: movie.year || '',
      genre: movie.genre || [],
      rating: movie.rating || 0,
      runtime: movie.runtime || 0,
      overview: movie.overview || '',
      addedBy: username
    });

    await session.save();

    res.status(201).json({
      message: `${movie.title} added to pool`,
      movies: session.movies
    });

  } catch (error) {
    console.error('addMovie error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// REMOVE MOVIE FROM SESSION POOL
// DELETE /api/movies/remove
const removeMovie = async (req, res) => {
  try {
    const { sessionCode, username, tmdbId } = req.body;

    if (!sessionCode || !username || !tmdbId) {
      return res.status(400).json({ 
        error: 'sessionCode, username and tmdbId are required' 
      });
    }

    const session = await Session.findOne({ 
      code: sessionCode.toUpperCase() 
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Can only remove during setup phase
    if (session.status !== 'setup') {
      return res.status(400).json({ 
        error: 'Can only remove movies during setup phase' 
      });
    }

    // Find the movie
    const movie = session.movies.find(m => m.tmdbId === tmdbId);

    if (!movie) {
      return res.status(404).json({ error: 'Movie not found in pool' });
    }

    // Only the person who added it can remove it
    if (movie.addedBy !== username) {
      return res.status(403).json({ 
        error: 'You can only remove movies you added' 
      });
    }

    // Remove the movie
    session.movies = session.movies.filter(m => m.tmdbId !== tmdbId);
    await session.save();

    res.status(200).json({
      message: 'Movie removed from pool',
      movies: session.movies
    });

  } catch (error) {
    console.error('removeMovie error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { searchMovies, addMovie, removeMovie };