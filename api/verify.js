/* ============================================================
   NBVS — FINAL VERIFY.JS (No free searches, Pay-Only, Safe)
   - No free searches at all
   - Staff & Superadmin can search unlimited
   - Public users must pay (wallet ≥ 30)
   - Rate limiting included
   - Logs every search
=============================================================== */

import { 
  getFirestore, doc, getDoc, updateDoc, collection, addDoc 
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

import { 
  getAuth, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

import { app } from "./firebase.js";

const db = getFirestore(app);
const auth = getAuth();

let currentUser = null;
let currentRole = "user";
let walletBalance = 0;
let lastSearchTime = 0;

/* ------------------------------
   RATE LIMIT: 1 search every 5 sec
------------------------------ */
function rateLimit() {
  const now = Date.now();
  if (now - lastSearchTime < 5000) {
    alert("Please wait a few seconds before searching again.");
    return false;
  }
  lastSearchTime = now;
  return true;
}

/* ------------------------------
   Load user info
------------------------------ */
async function loadUser() {
  return new Promise(resolve => {
    onAuthStateChanged(auth, async user => {
      if (!user) {
        currentUser = null;
        currentRole = "public";
        walletBalance = 0;
        resolve();
        return;
      }

      currentUser = user;

      const uDoc = await getDoc(doc(db, "users", user.uid));
      if (!uDoc.exists()) {
        currentRole = "user";
        walletBalance = 0;
        resolve();
        return;
      }

      const data = uDoc.data();
      currentRole = (data.role || "user").toLowerCase();
      walletBalance = data.wallet || 0;

      resolve();
    });
  });
}

/* ------------------------------
   Run search
------------------------------ */
async function runVerification() {
  if (!rateLimit()) return;

  const query = document.getElementById("searchInput").value.trim();
  if (!query) return alert("Enter a name or NIA ID");

  /* Staff + superadmin get unlimited searches */
  const isAdmin = (currentRole === "staff" || currentRole === "superadmin");

  /* Public MUST pay */
  if (!isAdmin) {
    if (walletBalance < 30) {
      return alert("Not enough balance — add funds first.");
    }
  }

  /* Charge ONLY public users */
  if (!isAdmin) {
    const newBalance = walletBalance - 30;
    await updateDoc(doc(db, "users", currentUser.uid), { wallet: newBalance });
    walletBalance = newBalance;
    updateWalletUI();
  }

  /* SEARCH FIRESTORE */
  const qDoc = await getDoc(doc(db, "records", query.toLowerCase()));
  let result = null;

  if (qDoc.exists()) {
    result = qDoc.data();
    displayResult(result);
  } else {
    document.getElementById("resultArea").innerHTML = "<p>No record found.</p>";
  }

  /* LOG SEARCH */
  await addDoc(collection(db, "search_logs"), {
    time: Date.now(),
    user: currentUser ? currentUser.uid : "public",
    query: query,
    found: qDoc.exists()
  });

  await addDoc(collection(db, "audit_logs"), {
    time: Date.now(),
    user: currentUser ? currentUser.uid : "public",
    action: "search",
    meta: { query, found: qDoc.exists() }
  });
}

/* ------------------------------
   Display record result
------------------------------ */
function displayResult(data) {
  document.getElementById("resultArea").innerHTML = `
    <strong>Name:</strong> ${data.name}<br>
    <strong>NIA:</strong> ${data.nia}<br>
    <strong>DOB:</strong> ${data.dob}<br>
    <strong>Region:</strong> ${data.region}<br>
    <strong>Address:</strong> ${data.address}<br>
    <strong>Criminal:</strong> ${data.criminal}<br>
    <strong>Driving:</strong> ${data.driving}<br>
    <strong>Credit:</strong> ${data.credit}<br>
    <strong>Status:</strong> ${data.status}
  `;
}

/* ------------------------------
   Update wallet text
------------------------------ */
function updateWalletUI() {
  document.getElementById("walletDisplay").innerText = `Balance: ₵${walletBalance}`;
}

/* ------------------------------
   Init
------------------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  await loadUser();
  updateWalletUI();

  document.getElementById("verifyBtn").onclick = runVerification;
});
