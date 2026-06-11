const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const db = admin.firestore();

// ── POST /login ──────────────────────────────────────────────────────────────
// Body: { username: string, password: string }
// Returns: { status: 'ok'|'invalid'|'cooldown'|'error', user?, hours?, mins?, ... }
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ status: "error", message: "Missing credentials" });
    }

    const snap = await db.collection("users")
      .where("username", "==", username.toUpperCase())
      .get();

    if (snap.empty) {
      return res.json({ status: "invalid" });
    }

    let matched = null;
    let matchedDocId = null;

    snap.forEach((docSnap) => {
      const u = docSnap.data();
      if (u.password === password) {
        matched = u;
        matchedDocId = docSnap.id;
      }
    });

    if (!matched) {
      return res.json({ status: "invalid" });
    }

    // ── Cooldown check (test role only) ──────────────────────────────────────
    if ((matched.role || "").toLowerCase() === "test") {
      const cooldownUntil = matched.cooldownuntil || "";
      if (cooldownUntil !== "") {
        const until = new Date(cooldownUntil);
        const now = new Date();
        if (until > now) {
          const diffMs = until - now;
          const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
          const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          return res.json({
            status: "cooldown",
            hours: diffHrs,
            mins: diffMins,
            cooldownUntil: until.toISOString(),
            username: matched.username || username,
            cooldownhours: matched.cooldownhours || 24,
          });
        }
      }
    }

    // ── Generate session token and write to Firestore ─────────────────────────
    const token = generateToken();
    await db.collection("users").doc(matchedDocId).update({
      activeSessionToken: token,
    });

    // Never send password back to client
    const { password: _pw, ...safeUser } = matched;

    return res.json({
      status: "ok",
      token,
      user: { ...safeUser, _docId: matchedDocId },
    });
  } catch (e) {
    console.error("Login error:", e);
    return res.status(500).json({ status: "error" });
  }
});

// ── POST /set-cooldown ────────────────────────────────────────────────────────
// Body: { docId: string, hours: number }
// Sets cooldownuntil = now + hours on the user document
app.post("/set-cooldown", async (req, res) => {
  try {
    const { docId, hours } = req.body || {};
    if (!docId || !hours) {
      return res.status(400).json({ ok: false, message: "Missing docId or hours" });
    }

    const cooldownUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    await db.collection("users").doc(docId).update({ cooldownuntil: cooldownUntil });
    return res.json({ ok: true, cooldownUntil });
  } catch (e) {
    console.error("Set-cooldown error:", e);
    return res.status(500).json({ ok: false });
  }
});

// ── GET /session/:docId ───────────────────────────────────────────────────────
// Returns current activeSessionToken for the user — used for session-watch polling
app.get("/session/:docId", async (req, res) => {
  try {
    const docSnap = await db.collection("users").doc(req.params.docId).get();
    if (!docSnap.exists) return res.status(404).json({ token: "" });
    const token = (docSnap.data() || {}).activeSessionToken || "";
    return res.json({ token });
  } catch (e) {
    console.error("Session fetch error:", e);
    return res.status(500).json({ token: "" });
  }
});

// ── POST /verify-session ──────────────────────────────────────────────────────
// Body: { docId: string, token: string }
// Returns { valid: true|false }
app.post("/verify-session", async (req, res) => {
  try {
    const { docId, token } = req.body || {};
    if (!docId || !token) return res.json({ valid: false });
    const docSnap = await db.collection("users").doc(docId).get();
    if (!docSnap.exists) return res.json({ valid: false });
    const stored = (docSnap.data() || {}).activeSessionToken || "";
    return res.json({ valid: stored === token });
  } catch (e) {
    return res.status(500).json({ valid: false });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateToken() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let t = "";
  for (let i = 0; i < 64; i++) {
    t += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return t;
}

module.exports = app;
