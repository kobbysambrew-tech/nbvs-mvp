// /api/verify.js

import admin from "firebase-admin";

export default async function handler(req, res) {
  try {
    const key = req.query.key;
    const nia = req.query.nia;
    const debug = req.query.debug;

    if (!key || !nia) {
      return res.status(400).json({ error: "Missing key or nia" });
    }

    // Initialize Firebase Admin only once
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(process.env.FIREBASE_ADMIN_KEY)
        ),
      });
    }

    const db = admin.firestore();

    // Debug object
    const dbg = {
      received: { key, nia },
      firestoreProject: admin.app().options.credential.projectId,
      query: "WHERE key == key AND nia == nia",
      results: null,
      documents: [],
      error: null,
    };

    // Query
    const snapshot = await db
      .collection("verifications")
      .where("key", "==", key)
      .where("nia", "==", nia)
      .get();

    dbg.results = snapshot.size;

    if (!snapshot.empty) {
      snapshot.forEach((doc) => {
        dbg.documents.push({ id: doc.id, data: doc.data() });
      });
    }
// ---- RATE LIMIT SYSTEM ----
const apiKeyRef = db.collection("api_keys").doc(key);
const apiKeySnap = await apiKeyRef.get();

if (!apiKeySnap.exists) {
  return res.status(403).json({ error: "Invalid API key" });
}

const apiData = apiKeySnap.data();

// defaults if missing
const limitPerMinute = apiData.limitPerMinute || 10;
const limitPerDay = apiData.limitPerDay || 200;

let minuteCount = apiData.minuteCount || 0;
let dayCount = apiData.dayCount || 0;
let lastReset = apiData.lastReset ? apiData.lastReset.toMillis() : 0;

const now = Date.now();

// Reset minute counter every 60s
if (now - lastReset >= 60 * 1000) {
  minuteCount = 0;
}

// Reset daily counter every 24 hours
const midnight = new Date();
midnight.setHours(0, 0, 0, 0);
if (now >= midnight.getTime() && lastReset < midnight.getTime()) {
  dayCount = 0;
}

// Check limits
if (minuteCount >= limitPerMinute) {
  return res.status(429).json({ error: "Rate limit exceeded (per minute)" });
}

if (dayCount >= limitPerDay) {
  return res.status(429).json({ error: "Daily rate limit exceeded" });
}

// Increase counters
await apiKeyRef.update({
  minuteCount: minuteCount + 1,
  dayCount: dayCount + 1,
  lastReset: now
});

// ---- END RATE LIMIT SYSTEM ----

    // Debug mode
    if (debug === "1") {
      return res.status(200).json({ debug: dbg });
    }

    // Not found
    if (snapshot.empty) {
      return res.status(404).json({ error: "Verification not found" });
    }

    // Return data
    return res.status(200).json(snapshot.docs[0].data());
  } catch (err) {
    console.error("🔥 Server error:", err);
    return res.status(500).json({
      error: "Server failed",
      details: err.message,
    });
  }
}
