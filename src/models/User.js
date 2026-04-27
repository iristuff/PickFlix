/**
 * User model (MongoDB) for app-specific profile data.
 *
 * Important concept:
 * - Firebase Auth is your "identity provider" (handles passwords, login, etc.)
 * - MongoDB stores your app's user profile data (username, session history, etc.)
 *
 * We link them using:
 * - uid: the Firebase user id (unique per Firebase project)
 */

const mongoose = require("mongoose");

const SessionHistorySchema = new mongoose.Schema(
  {
    sessionCode: { type: String, required: true },
    // winner is stored as a string for simplicity (movie title).
    // If later you want more detail, store a richer object.
    winner: { type: String, required: true },
    date: { type: Date, default: Date.now },
    participants: { type: Number, default: 0 },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true }, // Firebase UID
  username: { type: String, required: true },
  email: { type: String, required: true },
  sessionHistory: { type: [SessionHistorySchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", UserSchema);

