import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  getCountFromServer,
  doc,
  updateDoc,
  increment,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

// 🔥 Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCDh_qL3jiCMHROK0_Soul2Wsv3t3y4wv0",
  authDomain: "nbvs-ghana.firebaseapp.com",
  projectId: "nbvs-ghana",
  storageBucket: "nbvs-ghana.firebasestorage.app",
  messagingSenderId: "702636577113",
  appId: "1:702636577113:web:8369b43a2aa43aeb95fc48",
  measurementId: "G-2FHFSQRMZX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM elements
const loginPanel = document.getElementById("loginPanel");
const adminPanel = document.getElementById("adminPanel");
const searchSection = document.getElementById("searchSection");
const loginBtn = document.getElementById("loginBtn");
const loginMsg = document.getElementById("loginMsg");
const logoutBtn = document.getElementById("logoutBtn");

// ✅ Admin Login
loginBtn.addEventListener("click", async () => {
  const pass = document.getElementById("adminPass").value.trim();
  if (pass === "nbvs2008") {
    localStorage.setItem("isAdmin", "true");
    loginPanel.classList.add("hidden");
    adminPanel.classList.remove("hidden");
    searchSection.classList.remove("hidden");

    // Log admin login
    await trackStat("adminLogins");

    alert("✅ Admin access granted");
  } else {
    loginMsg.textContent = "❌ Wrong password!";
  }
});

// ✅ Logout
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("isAdmin");
  location.reload();
});

// ✅ Keep Admin Session Active
window.onload = () => {
  if (localStorage.getItem("isAdmin") === "true") {
    loginPanel.classList.add("hidden");
    adminPanel.classList.remove("hidden");
    searchSection.classList.remove("hidden");
  }
};

// ✅ Track Stats in Firestore
async function trackStat(type) {
  const ref = doc(db, "stats", "global");
  try {
    await setDoc(ref, { totalSearches: 0, adminLogins: 0 }, { merge: true });
    if (type === "search") {
      await updateDoc(ref, { totalSearches: increment(1) });
    } else if (type === "adminLogins") {
      await updateDoc(ref, { adminLogins: increment(1) });
    }
  } catch (e) {
    console.error("Stats update failed:", e);
  }
}

// ✅ Add New Record
document.getElementById("addRecordBtn").addEventListener("click", async () => {
  const name = document.getElementById("name").value.trim();
  const nia = document.getElementById("nia").value.trim();
  const dob = document.getElementById("dob").value;
  const region = document.getElementById("region").value;
  const criminal = document.getElementById("criminal").value;
  const driving = document.getElementById("driving").value;
  const address = document.getElementById("address").value;
  const credit = document.getElementById("credit").value;
  const status = document.getElementById("status").value;

  if (!name || !nia) {
    alert("⚠️ Please fill in Name and NIA ID");
    return;
  }

  try {
    await addDoc(collection(db, "records"), {
      name,
      nia,
      dob,
      region,
      criminal,
      driving,
      address,
      credit,
      status
    });
    alert("✅ Record saved successfully!");
  } catch (error) {
    console.error(error);
    alert("❌ Failed to save record.");
  }
});

// ✅ Search Record (by name or NIA)
document.getElementById("searchBtn").addEventListener("click", async () => {
  const searchValue = document.getElementById("searchInput").value.trim().toLowerCase();
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "🔎 Searching...";

  await trackStat("search");

  const allDocs = await getDocs(collection(db, "records"));
  const matches = [];

  allDocs.forEach((docSnap) => {
    const r = docSnap.data();
    if (
      r.name?.toLowerCase() === searchValue ||
      r.nia?.toLowerCase() === searchValue
    ) {
      matches.push(r);
    }
  });

  if (matches.length === 0) {
    resultsDiv.innerHTML = "❌ No record found.";
    return;
  }

  resultsDiv.innerHTML = "";
  matches.forEach((r) => {
    resultsDiv.innerHTML += `
      <div class="card">
        <strong>${r.name}</strong><br>
        NIA ID: ${r.nia}<br>
        Region: ${r.region}<br>
        Status: ${r.status || "N/A"}<br>
        DOB: ${r.dob || "N/A"}<br>
        Criminal: ${r.criminal || "N/A"}<br>
        Driving: ${r.driving || "N/A"}<br>
        Address: ${r.address || "N/A"}<br>
        Credit: ${r.credit || "N/A"}
      </div>
    `;
  });
});

// ✅ Show All Records
document.getElementById("showAllBtn").addEventListener("click", async () => {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "📄 Loading all records...";
  const allDocs = await getDocs(collection(db, "records"));
  resultsDiv.innerHTML = "";

  allDocs.forEach((docSnap) => {
    const r = docSnap.data();
    resultsDiv.innerHTML += `
      <div class="card">
        <strong>${r.name}</strong><br>
        NIA ID: ${r.nia}<br>
        Region: ${r.region}<br>
        Status: ${r.status || "N/A"}
      </div>
    `;
  });
});
