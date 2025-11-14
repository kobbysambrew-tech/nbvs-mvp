import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";

// --- Firebase config (same as your admin.js) ---
const firebaseConfig = {
  apiKey: "AIzaSyCDh_qL3jiCMHROK0_Soul2Wsv3t3y4wv0",
  authDomain: "nbvs-ghana.firebaseapp.com",
  projectId: "nbvs-ghana",
  storageBucket: "nbvs-ghana.firebasestorage.app",
  messagingSenderId: "702636577113",
  appId: "1:702636577113:web:8369b43a2aa43aeb95fc48",
  measurementId: "G-2FHFSQRMZX"
};

// --- Ensure Firebase doesn't reinitialize on hot reload ---
if (!getApps().length) initializeApp(firebaseConfig);

const db = getFirestore();

export default async function handler(req, res) {
  try {
    // --- Validate method ---
    if (req.method !== "GET") {
      return res.status(405).json({ status: "error", message: "Only GET allowed" });
    }

    // --- Read query params ---
    const key = req.query.key;
    const nia = req.query.nia;

    // --- Missing API key ---
    if (!key) {
      return res.status(400).json({ status: "error", message: "Missing API key" });
    }

    // --- Missing NIA ---
    if (!nia) {
      return res.status(400).json({ status: "error", message: "Missing NIA number" });
    }

    // --- Find API key in Firestore ---
    const keyRef = collection(db, "api_keys");
    const q = query(keyRef, where("key", "==", key));
    const snap = await getDocs(q);

    if (snap.empty) {
      return res.status(401).json({ status: "error", message: "Invalid API key" });
    }

    const keyDoc = snap.docs[0];
    const keyData = keyDoc.data();

    // --- Check if disabled ---
    if (keyData.status === "disabled") {
      return res.status(403).json({ status: "error", message: "API key disabled" });
    }

    // --- Check daily limit ---
    if (keyData.usedToday >= keyData.dailyLimit) {
      return res.status(429).json({ status: "error", message: "Daily API limit reached" });
    }

    // --- Search the records collection ---
    const recSnap = await getDocs(query(
      collection(db, "records"),
      where("nia", "==", nia)
    ));

    if (recSnap.empty) {
      // Log usage anyway (important)
      await updateDoc(doc(db, "api_keys", keyDoc.id), {
        usedToday: keyData.usedToday + 1,
        lastUsedAt: new Date()
      });

      return res.json({ status: "success", found: false });
    }

    const record = recSnap.docs[0].data();

    // --- Update key usage ---
    await updateDoc(doc(db, "api_keys", keyDoc.id), {
      usedToday: keyData.usedToday + 1,
      lastUsedAt: new Date()
    });

    // --- Return result ---
    return res.json({
      status: "success",
      found: true,
      record: record
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Server error" });
  }
}
