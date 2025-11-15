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

    // Initialize Firebase Admin
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(process.env.FIREBASE_ADMIN_KEY)
        ),
      });
    }

    const db = admin.firestore();

    // --------------------------------------------------------------------
    // 1️⃣ LOAD API KEY DOCUMENT (OPTION 1)
    // --------------------------------------------------------------------
    const apiKeySnap = await db
      .collection("api_keys")
      .where("key", "==", key)
      .limit(1)
      .get();

    if (apiKeySnap.empty) {
      return res.status(403).json({ error: "Invalid API key" });
    }

    const apiDoc = apiKeySnap.docs[0];
    const apiData = apiDoc.data();

    if (apiData.status !== "active") {
      return res.status(403).json({ error: "API key disabled" });
    }

    // --------------------------------------------------------------------
    // 2️⃣ RATE LIMIT LOGIC
    // --------------------------------------------------------------------
    const today = new Date().toISOString().split("T")[0]; // yyyy-mm-dd
    let usedToday = apiData.usedToday || 0;
    const dailyLimit = apiData.dailyLimit || 1000;
    const resetDate = apiData.resetDate || today;

    // If new day → reset counter
    if (resetDate !== today) {
      usedToday = 0;
    }

    // Check if over limit
    if (usedToday >= dailyLimit) {
      return res.status(429).json({ error: "Daily API limit reached" });
    }

    // Update usage
    await apiDoc.ref.update({
      usedToday: usedToday + 1,
      resetDate: today,
      lastUsedAt: admin.firestore.Timestamp.now(),
    });

    // --------------------------------------------------------------------
    // 3️⃣ LOOKUP VERIFICATION RECORD
    // --------------------------------------------------------------------
    const snapshot = await db
      .collection("verifications")
      .where("key", "==", key)
      .where("nia", "==", nia)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: "Verification not found" });
    }

    const data = snapshot.docs[0].data();

    // --------------------------------------------------------------------
    // 4️⃣ DEBUG MODE
    // --------------------------------------------------------------------
    if (debug === "1") {
      return res.status(200).json({
        debug: {
          request: { key, nia },
          apiKeyDoc: apiData,
          returnedRecord: data,
        },
      });
    }

    // --------------------------------------------------------------------
    // 5️⃣ SUCCESS
    // --------------------------------------------------------------------
    return res.status(200).json(data);

  } catch (err) {
    console.error("🔥 VERIFY API ERROR:", err);
    return res.status(500).json({
      error: "Server failed",
      details: err.message,
    });
  }
}
