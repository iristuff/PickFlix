const Vote = require('../models/Vote');
const Session = require('../models/Session');

// SUBMIT VOTE
// POST /api/votes/submit
const submitVote = async (req, res) => {
  try {
    const { sessionCode, username, rankings } = req.body;

    // Validate all fields are provided
    if (!sessionCode || !username || !rankings) {
      return res.status(400).json({ 
        error: 'sessionCode, username and rankings are required' 
      });
    }

    // Find the session
    const session = await Session.findOne({ 
      code: sessionCode.toUpperCase() 
    });

    // Session must exist
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Session must be in voting phase
    if (session.status !== 'voting') {
      return res.status(400).json({ 
        error: 'Session is not in voting phase' 
      });
    }

    //user must be a participant in the session
      if (!session.participants.includes(username)) {
        return res.status(403).json({
          error: 'User is not a participant in this session'
        });
      }

    // Rankings must be an array
    if (!Array.isArray(rankings) || rankings.length === 0) {
      return res.status(400).json({ 
        error: 'Rankings must be a non-empty array' 
      });
    }

    // Can't rank more movies than are in the pool
    if (rankings.length > session.movies.length) {
      return res.status(400).json({ 
        error: 'You cannot rank more movies than are in the pool' 
      });
    }

    // Max 3 rankings allowed
    if (rankings.length > 3) {
      return res.status(400).json({ 
        error: 'You can only rank up to 3 movies' 
      });
    }

    // Create the vote
    // If duplicate → MongoDB unique index will throw error
    const vote = new Vote({
      sessionCode: sessionCode.toUpperCase(),
      username,
      rankings
    });

    await vote.save();
    // Auto-complete session if everyone has voted
const totalVotes = await Vote.countDocuments({
  sessionCode: sessionCode.toUpperCase()
});

if (totalVotes >= session.participants.length) {
  session.status = 'completed';
  await session.save();
}
    

    res.status(201).json({ 
      message: 'Vote submitted successfully',
      vote: {
        sessionCode: vote.sessionCode,
        username: vote.username,
        rankings: vote.rankings
      }
    });

  } catch (error) {
    // Handle duplicate vote error from MongoDB
    if (error.code === 11000) {
      return res.status(400).json({ 
        error: 'You have already voted in this session' 
      });
    }
    console.error('submitVote error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// GET ALL VOTES FOR A SESSION
// GET /api/votes/:code
const getVotes = async (req, res) => {
  try {
    const { code } = req.params;

    const sessionCode = code.toUpperCase();

    // Most clients only need the vote count for progress UI.
    // Counting is much cheaper than returning the full vote list.
    const totalVotes = await Vote.countDocuments({ sessionCode });

    // Optional: include votes if explicitly requested (useful for debugging).
    const includeVotes = String(req.query?.includeVotes || '') === '1';
    const votes = includeVotes
      ? await Vote.find({ sessionCode }).lean()
      : undefined;

    res.status(200).json({ 
      sessionCode,
      totalVotes,
      ...(includeVotes ? { votes } : {})
    });

  } catch (error) {
    console.error('getVotes error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// CALCULATE RESULTS
// GET /api/votes/:code/results
const getResults = async (req, res) => {
  try {
    const { code } = req.params;

    const sessionCode = code.toUpperCase();

    // Read-only paths: lean() is faster and uses less memory.
    const session = await Session.findOne({ code: sessionCode }).lean();
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Build a lookup of TMDB ratings from the session movie pool.
    // We use the session's stored rating (from TMDB search) rather than trusting the client.
    const ratingByMovieId = {};
    (session.movies || []).forEach((m) => {
      ratingByMovieId[String(m.tmdbId)] = Number(m.rating || 0);
    });

    // Get all votes for this session
    const votes = await Vote.find({ sessionCode }).select('rankings').lean();

    // No votes submitted yet
    if (votes.length === 0) {
      return res.status(400).json({ 
        error: 'No votes submitted yet' 
      });
    }

    // Calculate weighted scores
    // scores is an object like:
    // { "movieId1": { title, points, first, second, third } }
    const scores = {};

    votes.forEach(vote => {
      vote.rankings.forEach(ranking => {

        // If we haven't seen this movie yet, initialize it
        if (!scores[ranking.movieId]) {
          scores[ranking.movieId] = {
            movieId: ranking.movieId,
            title: ranking.title,
            points: 0,      // total weighted points
            first: 0,       // number of 1st place votes
            second: 0,      // number of 2nd place votes
            third: 0        // number of 3rd place votes
          };
        }

        // Add points based on rank
        if (ranking.rank === 1) {
          scores[ranking.movieId].points += 3;
          scores[ranking.movieId].first += 1;
        } else if (ranking.rank === 2) {
          scores[ranking.movieId].points += 2;
          scores[ranking.movieId].second += 1;
        } else if (ranking.rank === 3) {
          scores[ranking.movieId].points += 1;
          scores[ranking.movieId].third += 1;
        }
      });
    });

    // Convert scores object to array and sort
    // Sorting rules:
    // 1. Most points wins
    // 2. Tie? -> most 1st place votes wins
    // 3. Still tied? -> most 2nd place votes wins
    // 4. Still tied? -> higher TMDB rating wins (vote_average)
    // 5. Still tied? -> stable fallback by movieId (so sort is deterministic)
    const sortedResults = Object.values(scores).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.first !== a.first) return b.first - a.first;
      if (b.second !== a.second) return b.second - a.second;

      // TMDB rating tie-breaker
      const ar = Number(ratingByMovieId[String(a.movieId)] || 0);
      const br = Number(ratingByMovieId[String(b.movieId)] || 0);
      if (br !== ar) return br - ar;

      return String(a.movieId).localeCompare(String(b.movieId));
    });

    // The winner is the first item after sorting
    const winner = sortedResults[0];

    // Check if tie breaking was used
    const tieBroken = sortedResults.length > 1 && 
      sortedResults[0].points === sortedResults[1].points;

    res.status(200).json({
      sessionCode: code.toUpperCase(),
      totalVotes: votes.length,
      winner,
      tieBroken,
      results: sortedResults
    });

  } catch (error) {
    console.error('getResults error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { submitVote, getVotes, getResults };