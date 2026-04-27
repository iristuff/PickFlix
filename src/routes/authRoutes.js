/**
 * Auth routes.
 *
 * These routes are "protected" which means:
 * - client must send a Firebase ID token
 * - server verifies it using Firebase Admin
 */

const express = require("express");
const router = express.Router();

const { verifyFirebaseToken } = require("../middleware/firebaseAuth");
const { syncUser, getProfile } = require("../controllers/authController");

// Called after Firebase login/register to create/sync Mongo profile
router.post("/sync", verifyFirebaseToken, syncUser);

// Fetch current user's profile + history
router.get("/profile", verifyFirebaseToken, getProfile);

module.exports = router;

