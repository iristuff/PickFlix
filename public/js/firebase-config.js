/**
 * Firebase client config (browser-side).
 *
 * This uses the Firebase *modular* SDK (v9+ style) with ESM imports.
 * Because this project has **no bundler**, we import from the Firebase CDN.
 *
 * You will paste your real config values from:
 * Firebase console → Project settings → Your apps → "Firebase SDK snippet" (Config)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

// Placeholder values — replace with your real Firebase config.
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// initializeApp() boots up the Firebase client SDK in the browser.
// It does NOT sign a user in; it just configures Firebase for this page.
export const firebaseApp = initializeApp(firebaseConfig);

// getAuth() creates the Firebase Auth client instance.
// We'll use this to sign in/out and read the current user.
export const auth = getAuth(firebaseApp);

