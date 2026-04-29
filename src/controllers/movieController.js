const axios = require('axios');
const Session = require('../models/Session');

/**
 * Simple in-memory cache for TMDB search results.
 *
 * Why caching helps:
 * - TMDB free tier has a daily request limit.
 * - Without caching, repeating the same search ("avatar") calls TMDB every time.
 * - With caching, we reuse recent results for a short time (TTL).
 *
 * Notes:
 * - This cache lives in the Node.js process memory.
 * - If the server restarts, the cache resets (that's OK for our use case).
 * - In a multi-server deployment, each server would have its own cache.
 */
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SEARCH_CACHE_MAX_KEYS = 200;

// Map<normalizedQuery, { movies: Array, expiresAt: number, createdAt: number }>
const searchCache = new Map();

function normalizeQuery(query) {
  return String(query || '').trim().toLowerCase();
}

function cleanupSearchCache(now = Date.now()) {
  // 1) Remove expired entries
  for (const [key, entry] of searchCache.entries()) {
    if (!entry || entry.expiresAt <= now) searchCache.delete(key);
  }

  // 2) Enforce max keys by removing oldest entries
  if (searchCache.size <= SEARCH_CACHE_MAX_KEYS) return;

  const entriesByAge = Array.from(searchCache.entries()).sort((a, b) => {
    const aCreated = Number(a[1]?.createdAt || 0);
    const bCreated = Number(b[1]?.createdAt || 0);
    return aCreated - bCreated; // oldest first
  });

  const extra = searchCache.size - SEARCH_CACHE_MAX_KEYS;
  for (let i = 0; i < extra; i++) {
    const k = entriesByAge[i]?.[0];
    if (k) searchCache.delete(k);
  }
}

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

    // Cleanup on request: keeps memory bounded without needing a separate timer.
    const now = Date.now();
    cleanupSearchCache(now);

    const normalizedQuery = normalizeQuery(query);
    const cachedEntry = searchCache.get(normalizedQuery);
    if (cachedEntry && cachedEntry.expiresAt > now) {
      return res.status(200).json({
        query,
        totalResults: cachedEntry.movies.length,
        movies: cachedEntry.movies,
        cached: true
      });
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

    // Save to cache for 10 minutes.
    // We cache the formatted movies array so the response stays consistent.
    searchCache.set(normalizedQuery, {
      movies,
      expiresAt: now + SEARCH_CACHE_TTL_MS,
      createdAt: now
    });

    // Enforce size after adding (in case this request pushed it over the cap).
    cleanupSearchCache(now);

    res.status(200).json({ 
      query,
      totalResults: movies.length,
      movies,
      cached: false
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