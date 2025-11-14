// api/verify.js – Serverless Function for Vercel

const admin = require("firebase-admin");

// Load Firebase Admin only once
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("Firebase Admin initialized.");
  } catch (err) {
    console.error("Failed to init Firebase Admin:", err);
  }
}

const db = admin.firestore();

module.exports = async (req, res) => {
  try {
    // Allow GET only
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Only GET allowed" });
    }

    // User-provided query values
    const { key, nia } = req.query;

    // Require API key
    if (!key || key.trim() === "") {
      return res.status(400).json({ error: "Missing API key" });
    }

    // Require NIA parameter
    if (!nia || nia.trim() === "") {
      return res.status(400).json({ error: "Missing NIA number" });
    }

    // Fetch record (example: "citizens" collection)
    const docRef = db.collection("citizens").doc(nia);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({
        status: "not_found",
        message: "NIA record not found",
      });
    }

    return res.status(200).json({
      status: "success",
      data: docSnap.data(),
    });

  } catch (err) {
    console.error("Serverless verify error:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: err.toString(),
    });
  }
};
