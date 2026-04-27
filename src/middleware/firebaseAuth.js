/**
 * Firebase Admin authentication middleware (server-side).
 *
 * Why this file exists:
 * - The frontend (Firebase Auth) signs users in and can produce an ID token.
 * - The backend should NOT trust "uid" coming from the client.
 * - Instead, the backend verifies the Firebase ID token using the Admin SDK.
 *
 * What you need to provide:
 * - A Firebase service account so the server can verify tokens.
 *
 * Recommended env var options (pick one):
 * - FIREBASE_SERVICE_ACCOUNT_JSON: the full JSON service account contents
 * - FIREBASE_SERVICE_ACCOUNT_BASE64: base64-encoded JSON service account
 *
 * Example (macOS zsh) using JSON directly:
 * export FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account", ... }'
 */

const admin = require("firebase-admin");

let _adminInitialized = false;

function initFirebaseAdmin() {
  if (_adminInitialized) return;

  // In Firebase Admin, credentials come from a "service account".
  // This is different from the frontend "firebaseConfig" object.
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  let serviceAccount = null;

  if (json) {
    serviceAccount = JSON.parse(json);
  } else if (b64) {
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    serviceAccount = JSON.parse(decoded);
  }

  if (!serviceAccount) {
    // We don't crash the server here so guest mode + existing APIs keep working.
    // Any route that requires auth will fail with a clear 401 until configured.
    console.warn(
      "[firebase-admin] Missing service account. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64."
    );
    _adminInitialized = true;
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  _adminInitialized = true;
}

/**
 * Express middleware to verify Firebase ID token.
 *
 * Reads: Authorization: Bearer <token>
 * Verifies: admin.auth().verifyIdToken(token)
 * Attaches: req.user = { uid, email }
 */
async function verifyFirebaseToken(req, res, next) {
  try {
    initFirebaseAdmin();

    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Missing Authorization: Bearer token." });
    }

    // If Admin SDK couldn't initialize (no service account), treat as unauthorized.
    if (!admin.apps || admin.apps.length === 0) {
      return res.status(401).json({
        error:
          "Server Firebase Admin is not configured. Ask the server owner to set FIREBASE_SERVICE_ACCOUNT_JSON.",
      });
    }

    const decoded = await admin.auth().verifyIdToken(token);

    // decoded has many fields; we keep only what we need.
    req.user = {
      uid: decoded.uid,
      email: decoded.email || "",
    };

    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired Firebase token." });
  }
}

module.exports = {
  verifyFirebaseToken,
};

