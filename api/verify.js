// api/verify.js - Node serverless function for Vercel using Firebase Admin

const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

/**
 * Vercel Node serverless route
 * GET /api/verify?key=API_KEY&nia=12345
 */
module.exports = async (req, res) => {
  try {
    // Only allow GET
    if (req.method !== "GET") {
      res.status(405).json({ status: "error", message: "Only GET allowed" });
      return;
    }

    const key = req.query.key;
    const nia = req.query.nia;

    if (!key) {
      res.status(400).json({ status: "error", message: "Missing API key" });
      return;
    }

    if (!nia) {
      res.status(400).json({ status: "error", message: "Missing NIA number" });
      return;
    }

    // Look up API key in Firestore
    const keySnap = await db
      .collection("api_keys")
      .where("key", "==", key)
      .limit(1)
      .get();

    if (keySnap.empty) {
      res.status(401).json({ status: "error", message: "Invalid API key" });
      return;
    }

    const keyDoc = keySnap.docs[0];
    const keyData = keyDoc.data();

    if (keyData.status === "disabled") {
      res.status(403).json({ status: "error", message: "API key disabled" });
      return;
    }

    if (
      typeof keyData.dailyLimit === "number" &&
      typeof keyData.usedToday === "number" &&
      keyData.usedToday >= keyData.dailyLimit
    ) {
      res
        .status(429)
        .json({ status: "error", message: "Daily API limit reached" });
      return;
    }

    // Search records by NIA
    const recSnap = await db
      .collection("records")
      .where("nia", "==", nia)
      .limit(1)
      .get();

    // Increment usage even if no record found
    const newUsedToday = (keyData.usedToday || 0) + 1;
    await keyDoc.ref.update({
      usedToday: newUsedToday,
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (recSnap.empty) {
      res.json({ status: "success", found: false });
      return;
    }

    const record = recSnap.docs[0].data();

    res.json({
      status: "success",
      found: true,
      record,
    });
  } catch (err) {
    console.error("API /verify error:", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
};
