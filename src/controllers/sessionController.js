const Session = require('../models/Session');

// Generate a random 6 character code
const generateCode = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
};

// CREATE SESSION
// POST /api/sessions/create
const createSession = async (req, res) => {
  try {
    const { username } = req.body;

    // Validate username was provided
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Generate unique code
    let code;
    let exists = true;
    while (exists) {
      code = generateCode();
      exists = await Session.findOne({ code });
    }

    // Create new session
    const session = new Session({
      code,
      host: username,
      participants: [username]
    });

    await session.save();

    res.status(201).json({
      message: 'Session created successfully',
      session: {
        code: session.code,
        host: session.host,
        participants: session.participants,
        movies: session.movies,
        status: session.status
      }
    });

  } catch (error) {
    console.error('createSession error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// JOIN SESSION
// POST /api/sessions/join
const joinSession = async (req, res) => {
  try {
    const { code, username } = req.body;

    // Validate inputs
    if (!code || !username) {
      return res.status(400).json({ error: 'Code and username are required' });
    }

    // Find the session
    const session = await Session.findOne({ code: code.toUpperCase() });

    // Session not found
    if (!session) {
      return res.status(404).json({ error: 'Session not found. Check your code.' });
    }

    // Session already completed
    if (session.status === 'completed') {
      return res.status(400).json({ error: 'This session has already ended.' });
    }

    // Session already in voting phase
    if (session.status === 'voting') {
      return res.status(400).json({ error: 'Voting has already started. You cannot join now.' });
    }

    // Username already taken in this session
    if (session.participants.includes(username)) {
      return res.status(400).json({ error: 'Username already taken in this session.' });
    }

    // Add participant
    session.participants.push(username);
    await session.save();

    res.status(200).json({
      message: 'Joined session successfully',
      session: {
        code: session.code,
        host: session.host,
        participants: session.participants,
        movies: session.movies,
        status: session.status
      }
    });

  } catch (error) {
    console.error('joinSession error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// GET SESSION
// GET /api/sessions/:code
const getSession = async (req, res) => {
  try {
    const { code } = req.params;

    // This endpoint is polled often by clients, so use lean() for faster reads.
    const session = await Session.findOne({ code: code.toUpperCase() }).lean();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.status(200).json({ session });

  } catch (error) {
    console.error('createSession error:', error.message);
    res.status(500).json({ error: error.message });
}
};

// UPDATE SESSION STATUS (setup → voting → completed)
// PUT /api/sessions/:code/status
const updateStatus = async (req, res) => {
  try {
    const { code } = req.params;
    const { username, status } = req.body;

    const session = await Session.findOne({ code: code.toUpperCase() });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Only host can change status
    if (session.host !== username) {
      return res.status(403).json({ error: 'Only the host can change session status' });
    }

    // Validate status transition
    const validTransitions = {
      'setup': 'voting',
      'voting': 'completed'
    };

    if (validTransitions[session.status] !== status) {
      return res.status(400).json({ 
        error: `Cannot change status from ${session.status} to ${status}` 
      });
    }

    // Need at least 1 movie to start voting
    if (status === 'voting' && session.movies.length === 0) {
      return res.status(400).json({ 
        error: 'Add at least one movie before starting voting' 
      });
    }

    session.status = status;
    await session.save();

    res.status(200).json({
      message: `Session status updated to ${status}`,
      session: {
        code: session.code,
        status: session.status
      }
    });

  } catch (error) {
    console.error('createSession error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { createSession, joinSession, getSession, updateStatus };