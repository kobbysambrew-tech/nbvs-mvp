<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";
// ---- wallet admin functions ----
// make sure these imports exist at top of your dashboard script:
// import { doc, getDoc, updateDoc, setDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

const WALLET_DOC = doc(db, "wallet", "global");
const TX_COLL = collection(db, "walletTransactions");

async function refreshGlobalBalance() {
  const s = await getDoc(WALLET_DOC);
  const bal = s.exists() ? (s.data().balance || 0) : 0;
  document.getElementById("globalBalance").textContent = `¢ ${bal}`;
}

document.getElementById("goWalletPage").addEventListener("click", () => {
  window.open("wallet.html", "_blank");
});

document.getElementById("adjBtn").addEventListener("click", async () => {
  const v = Number(document.getElementById("adjAmount").value || 0);
  if (!v) { document.getElementById("walletMsg").textContent = "Enter non-zero amount"; return; }
  // read-modify-write
  const s = await getDoc(WALLET_DOC);
  const current = s.exists() ? (s.data().balance || 0) : 0;
  const newBal = current + v;
  await updateDoc(WALLET_DOC, { balance: newBal });
  await addDoc(TX_COLL, { type: "admin-adjust", amount: v, timestamp: new Date(), note: "admin adjustment" });
  document.getElementById("walletMsg").textContent = `Done. New balance ¢ ${newBal}`;
  await refreshGlobalBalance();
});

document.getElementById("resetWalletBtn").addEventListener("click", async () => {
  if (!confirm("Reset global wallet to 0?")) return;
  await updateDoc(WALLET_DOC, { balance: 0 });
  await addDoc(TX_COLL, { type: "admin-reset", amount: 0, timestamp: new Date(), note: "reset to 0" });
  document.getElementById("walletMsg").textContent = "Wallet reset to ¢0";
  await refreshGlobalBalance();
});

// init balance on dashboard load
refreshGlobalBalance();

const firebaseConfig = {
  apiKey: "AIzaSyCDh_qL3jiCMHROK0_Soul2Wsv3t3y4wv0",
  authDomain: "nbvs-ghana.firebaseapp.com",
  projectId: "nbvs-ghana",
  storageBucket: "nbvs-ghana.appspot.com",
  messagingSenderId: "702636577113",
  appId: "1:702636577113:web:8369b43a2aa43aeb95fc48",
  measurementId: "G-2FHFSQRMZX"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Elements
const loginBtn = document.getElementById("loginBtn");
const loginPanel = document.getElementById("loginPanel");
const adminPanel = document.getElementById("adminPanel");
const searchSection = document.getElementById("searchSection");
const logoutBtn = document.getElementById("logoutBtn");
const loginMsg = document.getElementById("loginMsg");

// Stats init
if (!localStorage.getItem("loginCount")) localStorage.setItem("loginCount", 0);
if (!localStorage.getItem("searchCount")) localStorage.setItem("searchCount", 0);

// ✅ Admin login
loginBtn.addEventListener("click", () => {
  const pass = document.getElementById("adminPass").value.trim();
  if (pass === "nbvs2008") {
    localStorage.setItem("isAdmin", "true");
    let count = parseInt(localStorage.getItem("loginCount")) + 1;
    localStorage.setItem("loginCount", count);
    loginPanel.classList.add("hidden");
    adminPanel.classList.remove("hidden");
    searchSection.classList.remove("hidden");
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

// ✅ Keep admin logged in
window.onload = () => {
  if (localStorage.getItem("isAdmin") === "true") {
    loginPanel.classList.add("hidden");
    adminPanel.classList.remove("hidden");
    searchSection.classList.remove("hidden");
  }
};

// ✅ Add Record
document.getElementById("addRecordBtn").addEventListener("click", async () => {
  const name = document.getElementById("name").value;
  const nia = document.getElementById("nia").value;
  const dob = document.getElementById("dob").value;
  const region = document.getElementById("region").value;
  const criminal = document.getElementById("criminal").value;
  const driving = document.getElementById("driving").value;
  const address = document.getElementById("address").value;
  const credit = document.getElementById("credit").value;
  const status = document.getElementById("status").value;

  if (!name || !nia) {
    alert("⚠️ Please fill at least Name and NIA ID");
    return;
  }

  try {
    await addDoc(collection(db, "records"), {
      name, nia, dob, region, criminal, driving, address, credit, status
    });
    alert("✅ Record saved successfully!");
  } catch (error) {
    console.error(error);
    alert("❌ Failed to save record. Check Firestore rules or connection.");
  }
});

// ✅ Search Record
document.getElementById("searchBtn").addEventListener("click", async () => {
  let searches = parseInt(localStorage.getItem("searchCount")) + 1;
  localStorage.setItem("searchCount", searches);

  const searchValue = document.getElementById("searchInput").value.trim().toLowerCase();
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "Searching...";

  try {
    const allDocs = await getDocs(collection(db, "records"));
    const matches = [];

    allDocs.forEach((doc) => {
      const r = doc.data();
      if (r.name && r.name.toLowerCase() === searchValue || r.nia === searchValue) {
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
        <div class="record">
          <strong>${r.name}</strong><br>
          NIA ID: ${r.nia}<br>
          Region: ${r.region}<br>
          Status: ${r.status}<br>
        </div><hr>`;
    });
  } catch (err) {
    resultsDiv.innerHTML = "⚠️ Error fetching records.";
  }
});

// ✅ Show All Records
document.getElementById("showAllBtn").addEventListener("click", async () => {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "Loading all records...";

  const allDocs = await getDocs(collection(db, "records"));
  resultsDiv.innerHTML = "";

  allDocs.forEach((doc) => {
    const r = doc.data();
    resultsDiv.innerHTML += `
      <div class="record">
        <strong>${r.name}</strong><br>
        NIA ID: ${r.nia}<br>
        Region: ${r.region}<br>
        Status: ${r.status}<br>
      </div><hr>`;
  });
});
</script>
