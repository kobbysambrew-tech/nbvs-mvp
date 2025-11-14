import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  try {
    const { key, nia } = req.query;

    if (!key || !nia) {
      return res.status(400).json({ error: "Missing key or nia" });
    }

    const docRef = db.collection("verifications").doc(key);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: "Verification not found" });
    }

    return res.status(200).json({ success: true, data: docSnap.data() });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: "SERVER_ERROR", details: err.message });
  }
}
