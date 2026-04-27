/**
 * Auth controller:
 * - syncUser: create/find the MongoDB profile for a Firebase user.
 * - getProfile: return the MongoDB user profile + session history.
 * - updateHistory: helper used internally by other controllers to save completed sessions.
 */

const User = require("../models/User");

/**
 * POST /api/auth/sync
 *
 * This is called from the frontend after Firebase login/register.
 * The request is authenticated by verifyFirebaseToken middleware.
 *
 * Request:
 * - Authorization: Bearer <Firebase ID token>
 * - Body: { username?: string } (username required when first creating profile)
 *
 * Response:
 * - { user: <Mongo User> }
 */
async function syncUser(req, res) {
  try {
    const { uid, email } = req.user || {};
    const usernameFromBody = (req.body?.username || "").trim();

    if (!uid) return res.status(401).json({ error: "Not authenticated." });
    if (!email) return res.status(400).json({ error: "Firebase token has no email." });

    let user = await User.findOne({ uid });
    if (!user) {
      if (!usernameFromBody) {
        return res.status(400).json({ error: "Username is required for new accounts." });
      }

      user = await User.create({
        uid,
        email,
        username: usernameFromBody,
        sessionHistory: [],
      });
    } else {
      // Keep email in sync if it ever changes in Firebase.
      if (user.email !== email) user.email = email;

      // Allow setting/updating username when provided.
      if (usernameFromBody && user.username !== usernameFromBody) user.username = usernameFromBody;

      await user.save();
    }

    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: "Failed to sync user profile." });
  }
}

/**
 * GET /api/auth/profile
 *
 * Protected route. Uses req.user.uid to find the Mongo profile.
 */
async function getProfile(req, res) {
  try {
    const { uid } = req.user || {};
    if (!uid) return res.status(401).json({ error: "Not authenticated." });

    const user = await User.findOne({ uid });
    if (!user) {
      return res.status(404).json({
        error: "No profile found. Call POST /api/auth/sync after signing in.",
      });
    }

    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load profile." });
  }
}

/**
 * updateHistory(uid, entry)
 *
 * This is NOT an API route. It's a helper other controllers can call when a
 * session completes (so the app stores a history card in the user's profile).
 */
async function updateHistory(uid, entry) {
  if (!uid) return;
  if (!entry || !entry.sessionCode || !entry.winner) return;

  await User.updateOne(
    { uid },
    {
      $push: {
        sessionHistory: {
          sessionCode: String(entry.sessionCode),
          winner: String(entry.winner),
          date: entry.date ? new Date(entry.date) : new Date(),
          participants: Number(entry.participants || 0),
        },
      },
    }
  );
}

module.exports = {
  syncUser,
  getProfile,
  updateHistory,
};

