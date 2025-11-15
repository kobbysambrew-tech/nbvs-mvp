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

    // ---- RATE LIMIT SYSTEM ----
    const apiKeyRef = db.collection("api_keys").doc(key);
    const apiKeySnap = await apiKeyRef.get();

    if (!apiKeySnap.exists) {
      return res.status(403).json({ error: "Invalid API key" });
    }

    const apiData = apiKeySnap.data();

    const limitPerMinute = apiData.limitPerMinute || 10;
    const limitPerDay = apiData.limitPerDay || 200;

    let minuteCount = apiData.minuteCount || 0;
    let dayCount = apiData.dayCount || 0;
    let lastReset = apiData.lastReset?.toMillis() || 0;

    const now = Date.now();

    // Reset minute counter every 60 sec
    if (now - lastReset >= 60 * 1000) {
      minuteCount = 0;
    }

    // Reset daily counter every midnight
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);

    if (now >= midnight.getTime() && lastReset < midnight.getTime()) {
      dayCount = 0;
    }

    // Enforce limits
    if (minuteCount >= limitPerMinute) {
      return res.status(429).json({ error: "Rate limit exceeded (per minute)" });
    }

    if (dayCount >= limitPerDay) {
      return res.status(429).json({ error: "Daily rate limit exceeded" });
    }

    // Update counters
    await apiKeyRef.update({
      minuteCount: minuteCount + 1,
      dayCount: dayCount + 1,
      lastReset: new Date()
    });

    // ---- END RATE LIMIT SYSTEM ----

    // Normal verification lookup
    const snapshot = await db
      .collection("verifications")
      .where("key", "==", key)
      .where("nia", "==", nia)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: "Verification not found" });
    }

    const data = snapshot.docs[0].data();

    if (debug === "1") {
      return res.status(200).json({
        debug: {
          apiKey: key,
          nia,
          minuteCount: minuteCount + 1,
          dayCount: dayCount + 1,
          lastReset: new Date(),
          found: data
        }
      });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: "Server failed", details: err.message });
  }
}
