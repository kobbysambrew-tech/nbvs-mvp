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

    // Initialize Firebase Admin ONCE
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(process.env.FIREBASE_ADMIN_KEY)
        ),
      });
    }

    const db = admin.firestore();

    // --------------------------------------
    // RATE LIMIT SYSTEM (per API key)
    // --------------------------------------
    const apiKeyRef = db.collection("api_keys").doc(key.toString());
    const apiKeySnap = await apiKeyRef.get();

    if (!apiKeySnap.exists) {
      return res.status(403).json({ error: "Invalid API key" });
    }

    const apiData = apiKeySnap.data();

    const limitPerMinute = Number(apiData.limitPerMinute || 10);
    const limitPerDay = Number(apiData.limitPerDay || 200);

    let minuteCount = Number(apiData.minuteCount || 0);
    let dayCount = Number(apiData.dayCount || 0);

    const lastReset = apiData.lastReset
      ? apiData.lastReset.toMillis()
      : 0;

    const now = Date.now();

    // Reset minute counter every 60 seconds
    if (now - lastReset >= 60 * 1000) {
      minuteCount = 0;
    }

    // Reset daily counter at midnight
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

    // Update rate-limit counters
    await apiKeyRef.update({
      minuteCount: minuteCount + 1,
      dayCount: dayCount + 1,
      lastReset: admin.firestore.Timestamp.now(),
    });

    // --------------------------------------
    // FIRESTORE QUERY (verifications)
    // --------------------------------------
    const snapshot = await db
      .collection("verifications")
      .where("key", "==", key)
      .where("nia", "==", nia)
      .get();

    // Debug mode
    if (debug === "1") {
      return res.status(200).json({
        debug: {
          received: { key, nia },
          rateLimits: {
            limitPerMinute,
            limitPerDay,
            minuteCount,
            dayCount,
          },
          results: snapshot.size,
          docs: snapshot.docs.map((d) => ({
            id: d.id,
            data: d.data(),
          })),
        },
      });
    }

    if (snapshot.empty) {
      return res.status(404).json({ error: "Verification not found" });
    }

    // Return the first matched document
    return res.status(200).json(snapshot.docs[0].data());

  } catch (err) {
    console.error("🔥 API ERROR:", err);
    return res.status(500).json({
      error: "Server failed",
      details: err.message,
    });
  }
}
