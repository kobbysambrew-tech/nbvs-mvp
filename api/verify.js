// /api/verify.js

import admin from "firebase-admin";

export default async function handler(req, res) {
  try {
    const key = req.query.key;
    const nia = req.query.nia;
    const debug = req.query.debug;

    // Return error if missing
    if (!key || !nia) {
      return res.status(400).json({ error: "Missing key or nia" });
    }

    // Initialize Firebase admin ONLY once
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.CLIENT_KEY)),
      });
    }

    const db = admin.firestore();

    // Debug object to collect logs
    const dbg = {
      received: { key, nia },
      firestoreProject: admin.app().options.credential.projectId,
      query: "WHERE key == key AND nia == nia",
      results: null,
      documents: [],
      error: null
    };

    // Run Firestore query
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

    // If debug=1, return debug info
    if (debug === "1") {
      return res.status(200).json({ debug: dbg });
    }

    // If no match
    if (snapshot.empty) {
      return res.status(404).json({ error: "Verification not found" });
    }

    // Return the first matched document normally
    return res.status(200).json(snapshot.docs[0].data());

  } catch (err) {
    console.error("🔥 Server error:", err);
    return res.status(500).json({ error: "Server failed", details: err.message });
  }
}
