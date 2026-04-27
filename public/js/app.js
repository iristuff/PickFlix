/* PickFlix shared frontend utilities (vanilla JS) */
(() => {
  function resetBodyNavStyles() {
    if (!document.body) return;
    document.body.style.opacity = "";
    document.body.style.transform = "";
    document.body.style.transition = "";
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", resetBodyNavStyles);
  } else {
    resetBodyNavStyles();
  }
  window.addEventListener("pageshow", (ev) => {
    if (ev.persisted) resetBodyNavStyles();
  });

  const STORAGE_KEY = "pickflix";

  function safeJsonParse(str, fallback) {
    try {
      const v = JSON.parse(str);
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }

  function getStore() {
    return safeJsonParse(localStorage.getItem(STORAGE_KEY) || "{}", {});
  }

  function setStore(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next || {}));
  }

  /**
   * Save just the username into our local store (without touching session code / host flags).
   *
   * Why:
   * - Guest mode still uses username for sessions.
   * - Authenticated mode also wants a friendly display name.
   */
  function saveUsername(username) {
    const prev = getStore();
    setStore({
      ...prev,
      username: (username || "").toString(),
    });
  }

  function getSession() {
    const s = getStore();
    return {
      sessionCode: (s.sessionCode || "").toString(),
      username: (s.username || "").toString(),
      isHost: Boolean(s.isHost),
    };
  }

  function saveSession({ sessionCode, username, isHost }) {
    const prev = getStore();
    setStore({
      ...prev,
      sessionCode: (sessionCode || "").toString(),
      username: (username || "").toString(),
      isHost: Boolean(isHost),
    });
  }

  function clearSession() {
    const prev = getStore();
    // We keep username so guest mode remains convenient and
    // authenticated users still see their saved name on the home screen.
    setStore({ ...prev, sessionCode: "", isHost: false });
  }

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }
  function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function escapeHtml(str) {
    return (str ?? "").toString().replace(/[&<>"']/g, (c) => {
      switch (c) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
        default:
          return c;
      }
    });
  }

  function ensureOverlays() {
    if (!qs("#pfLoader")) {
      const loader = document.createElement("div");
      loader.id = "pfLoader";
      loader.className = "loader-overlay";
      loader.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
      document.body.appendChild(loader);
    }
    if (!qs("#pfToasts")) {
      const wrap = document.createElement("div");
      wrap.id = "pfToasts";
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }
  }

  function setLoading(isLoading) {
    ensureOverlays();
    const el = qs("#pfLoader");
    if (!el) return;
    el.classList.toggle("show", Boolean(isLoading));
  }

  function toast(message, variant = "info", { ms = 2600 } = {}) {
    ensureOverlays();
    const wrap = qs("#pfToasts");
    if (!wrap) return;
    const t = document.createElement("div");
    t.className = `toast ${variant}`;
    t.textContent = message;
    wrap.appendChild(t);
    window.setTimeout(() => {
      t.style.opacity = "0";
      t.style.transform = "translateY(10px)";
      window.setTimeout(() => t.remove(), 220);
    }, ms);
  }

  function showMsg(el, message, variant) {
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("hidden", "error", "success");
    if (variant) el.classList.add(variant);
    if (!message) el.classList.add("hidden");
  }

  function toUpper6(inputEl) {
    if (!inputEl) return;
    inputEl.addEventListener("input", () => {
      inputEl.value = inputEl.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    });
  }

  function tmdbPosterUrl(movie, size = "w342") {
    const path = movie?.posterPath ?? movie?.poster_path ?? movie?.poster ?? "";
    if (!path) return "";
    if (typeof path === "string" && path.startsWith("http")) return path;
    return `https://image.tmdb.org/t/p/${size}${path}`;
  }

  function normalizeMovie(raw) {
    const tmdbId = raw?.tmdbId ?? raw?.tmdb_id ?? raw?.id ?? raw?._id ?? "";
    const title = raw?.title ?? raw?.name ?? "Untitled";
    const year =
      raw?.year ??
      raw?.releaseYear ??
      (raw?.release_date ? String(raw.release_date).slice(0, 4) : "") ??
      "";
    const rating = raw?.rating ?? raw?.vote_average ?? raw?.score ?? "";
    const addedBy = raw?.addedBy ?? raw?.added_by ?? raw?.added_by_user ?? "";
    return {
      tmdbId,
      title,
      year,
      rating,
      addedBy,
      posterUrl: tmdbPosterUrl(raw),
      raw,
    };
  }

  async function apiFetch(url, { method = "GET", headers = {}, body, timeoutMs = 12000 } = {}) {
    const controller = new AbortController();
    const id = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      // If the user is signed in with Firebase, attach the ID token.
      // This is optional (guest mode still works).
      const token = await getFirebaseToken().catch(() => "");
      const res = await fetch(url, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => "");
      if (!res.ok) {
        const msg =
          (data && typeof data === "object" && (data.error || data.message)) ||
          (typeof data === "string" && data) ||
          `Request failed (${res.status})`;
        const err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } finally {
      window.clearTimeout(id);
    }
  }

  function requireSession({ allowMissing = false } = {}) {
    const s = getSession();
    if (allowMissing) return s;
    if (!s.sessionCode || !s.username) {
      window.location.href = "/index.html";
    }
    return s;
  }

  function navigate(path) {
    document.body.style.transition = "opacity 0.2s ease, transform 0.2s ease";
    requestAnimationFrame(() => {
      document.body.style.opacity = "0";
      document.body.style.transform = "translateY(6px)";
    });
    window.setTimeout(() => {
      window.location.href = path;
    }, 200);
  }

  // ---------------------------
  // Firebase Auth helpers
  // ---------------------------
  // We use dynamic imports so this file can stay a normal <script> (not type="module").
  // That keeps existing pages working without changing how they load app.js.
  let _firebaseLoaded = false;
  let _firebaseAuthModule = null;
  let _firebaseConfigModule = null;

  async function loadFirebase() {
    if (_firebaseLoaded) return { auth: _firebaseConfigModule?.auth, firebaseAuth: _firebaseAuthModule };
    _firebaseLoaded = true;

    try {
      // Local module that initializes Firebase and exports `auth`
      _firebaseConfigModule = await import("/js/firebase-config.js");

      // Firebase Auth SDK functions (sign in/out, onAuthStateChanged, etc.)
      _firebaseAuthModule = await import("https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js");
    } catch (e) {
      // If Firebase isn't configured yet, we just behave like guest mode.
      _firebaseConfigModule = null;
      _firebaseAuthModule = null;
    }

    return { auth: _firebaseConfigModule?.auth, firebaseAuth: _firebaseAuthModule };
  }

  /**
   * getCurrentUser()
   *
   * Returns the currently signed-in Firebase user (or null).
   * Uses onAuthStateChanged so it works even on first page load.
   */
  async function getCurrentUser() {
    const { auth, firebaseAuth } = await loadFirebase();
    if (!auth || !firebaseAuth?.onAuthStateChanged) return null;

    return await new Promise((resolve) => {
      const unsubscribe = firebaseAuth.onAuthStateChanged(auth, (user) => {
        try {
          unsubscribe();
        } catch {
          // ignore
        }
        resolve(user || null);
      });
    });
  }

  /**
   * getFirebaseToken()
   *
   * If a user is logged in, returns a Firebase ID token string.
   * If not logged in (or Firebase isn't configured), returns "".
   */
  async function getFirebaseToken() {
    const { firebaseAuth } = await loadFirebase();
    const user = await getCurrentUser();
    if (!user) return "";
    if (typeof user.getIdToken !== "function") return "";

    // getIdToken() returns a JWT the server can verify with Firebase Admin.
    return await user.getIdToken();
  }

  window.PickFlix = {
    qs,
    qsa,
    escapeHtml,
    apiFetch,
    setLoading,
    toast,
    showMsg,
    toUpper6,
    normalizeMovie,
    getSession,
    saveSession,
    saveUsername,
    clearSession,
    requireSession,
    navigate,
    getCurrentUser,
    getFirebaseToken,
  };
})();

