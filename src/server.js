require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const connectDB = require('./db');
const sessionRoutes = require('./routes/sessionRoutes');
const voteRoutes = require('./routes/voteRoutes');
const movieRoutes = require('./routes/movieRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

// Middleware
app.use(cors());
// Compress JSON + HTML responses (smaller payloads = faster page/API loads)
app.use(compression());
app.use(express.json());
// Cache static assets in the browser for a bit (safe: filenames are stable in this app)
app.use(express.static('public', { maxAge: '1h' }));

// Connect to MongoDB
connectDB();

// Routes
app.use('/api/sessions', sessionRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/auth', authRoutes);

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'PickFlix server is running!' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
