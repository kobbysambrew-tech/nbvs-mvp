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

    // Initialize Firebase admin
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(process.env.FIREBASE_ADMIN_KEY)
        ),
      });
    }

    const db = admin.firestore();

    // --- STEP 1: Validate the API key (OPTION 1) ---
    const apiKeySnap = await db
      .collection("api_keys")
      .where("key", "==", key) // match the "key" field
      .limit(1)
      .get();

    if (apiKeySnap.empty) {
      return res.status(403).json({ error: "Invalid API key" });
    }

    const apiDoc = apiKeySnap.docs[0];
    const apiData = apiDoc.data();

    // RATE LIMIT DATA
    const dailyLimit = apiData.dailyLimit || 1000;
    const usedToday = apiData.usedToday || 0;
    const resetDate = apiData.resetDate;

    // Reset daily usage
    const today = new Date().toISOString().slice(0, 10);
    if (resetDate !== today) {
      await apiDoc.ref.update({
        usedToday: 0,
        resetDate: today,
      });
    }

    // Apply rate limit
    if (usedToday >= dailyLimit) {
      return res.status(429).json({ error: "Daily limit reached" });
    }

    // Increment usage
    await apiDoc.ref.update({
      usedToday: usedToday + 1,
      lastUsedAt: new Date(),
    });

    // --- STEP 2: Look up verification record ---
    const personSnap = await db
      .collection("verifications")
      .where("key", "==", key)
      .where("nia", "==", nia)
      .limit(1)
      .get();

    if (personSnap.empty) {
      return res.status(404).json({ error: "Verification not found" });
    }

    const data = personSnap.docs[0].data();

    // Debug mode
    if (debug === "1") {
      return res.status(200).json({
        debug: {
          keyReceived: key,
          niaReceived: nia,
          apiKeyUsed: apiData.key,
          docReturned: data,
          rateLimitToday: usedToday + 1,
        },
      });
    }

    // Success
    return res.status(200).json(data);
  } catch (err) {
    console.error("🔥 Server error:", err);
    return res.status(500).json({
      error: "Server failed",
      details: err.message,
    });
  }
}
