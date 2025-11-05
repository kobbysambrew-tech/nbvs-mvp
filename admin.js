// admin.js — Full Admin Dashboard
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, query, orderBy, limit, startAfter, where, addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getAnalytics, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-analytics.js";

// -------------------- CONFIG --------------------
const firebaseConfig = {
  apiKey: "AIzaSyCDh_qL3jiCMHROK0_Soul2Wsv3t3y4wv0",
  authDomain: "nbvs-ghana.firebaseapp.com",
  projectId: "nbvs-ghana",
  storageBucket: "nbvs-ghana.firebasestorage.app",
  messagingSenderId: "702636577113",
  appId: "1:702636577113:web:8369b43a2aa43aeb95fc48",
  measurementId: "G-2FHFSQRMZX"
};

// -------------------- GLOBALS --------------------
let app = null, auth = null, db = null, analytics = null, currentUser = null, currentUserRole = null;

// -------------------- HELPERS --------------------
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

function showToast(message, { type = "info", timeout = 4000 } = {}) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.right = "16px";
  toast.style.bottom = "16px";
  toast.style.background = type === "error" ? "#b00020" : "#111";
  toast.style.color = "#fff";
  toast.style.padding = "10px 14px";
  toast.style.borderRadius = "8px";
  toast.style.zIndex = 9999;
  toast.style.opacity = 0;
  toast.style.transition = "opacity 0.2s";
  document.body.appendChild(toast);
  requestAnimationFrame(() => (toast.style.opacity = 1));
  setTimeout(() => {
    toast.style.opacity = 0;
    setTimeout(() => toast.remove(), 220);
  }, timeout);
}

function escapeHtml(s = "") {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function handlePermissionError(err, friendly) {
  console.warn("Permission error:", err);
  showToast(friendly || "Permission problem (see console)", { type: "error", timeout: 6000 });
}

// -------------------- FIREBASE INIT --------------------
async function initFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    try { if (await analyticsSupported()) analytics = getAnalytics(app); } catch { analytics = null; }

    onAuthStateChanged(auth, async user => {
      currentUser = user || null;
      if (!user) { window.location.href = "/dashboard.html"; return; }

      try {
        const uDoc = await getDoc(doc(db, "users", user.uid));
        if (!uDoc.exists()) { await signOut(auth); showToast("No user record", { type: "error" }); window.location.href = "/dashboard.html"; return; }
        const role = (uDoc.data().role || "user").toLowerCase();
        currentUserRole = role;
        if (role !== "superadmin" && role !== "staff") { await signOut(auth); showToast("Not authorized", { type: "error" }); window.location.href = "/dashboard.html"; return; }

        $("#admin-role").textContent = role;
        setupBindings();
        await loadInitialData();
      } catch (err) { console.error(err); showToast("Role check failed", { type: "error" }); await signOut(auth); window.location.href = "/dashboard.html"; }
    });

  } catch (err) { console.error("initFirebase failed:", err); showToast("Firebase init failed", { type: "error" }); }
}

// -------------------- SIGN OUT --------------------
async function doSignOut() {
  if (!auth) return;
  try { await signOut(auth); showToast("Signed out"); window.location.href = "/dashboard.html"; }
  catch (err) { showToast("Sign out failed", { type: "error" }); }
}

// -------------------- UI BINDINGS --------------------
function setupBindings() {
  $("#btn-logout")?.addEventListener("click", doSignOut);

  const tabs = ["dashboard", "verify", "users", "wallet", "logs", "audit"];
  tabs.forEach(tab => {
    $("#tab-" + tab)?.addEventListener("click", () => {
      showSection(tab);
      if (tab === "dashboard") loadStats();
      if (tab === "users") loadUsers();
      if (tab === "wallet") loadWallet();
      if (tab === "logs") loadSearchLogs();
      if (tab === "audit") loadAuditLogs();
    });
  });

  $("#btn-verify-name")?.addEventListener("click", () => adminVerify("name"));
  $("#btn-verify-id")?.addEventListener("click", () => adminVerify("id"));
  $("#btn-verify-phone")?.addEventListener("click", () => adminVerify("phone"));
  $("#btn-verify-email")?.addEventListener("click", () => adminVerify("email"));

  // Add record modal
  const modal = $("#modal-add-user");
  $("#btn-add-user")?.addEventListener("click", () => modal.style.display = "flex");
  $("#btn-cancel-user")?.addEventListener("click", () => modal.style.display = "none");
  $("#btn-save-user")?.addEventListener("click", saveNewRecord);
  window.onclick = e => { if (e.target === modal) modal.style.display = "none"; }

  if (currentUserRole === "staff") {
    document.querySelectorAll(".admin-only, .delete-btn").forEach(el => el.style.display = "none");
  }
}

function showSection(section) {
  ["dashboard","verify","users","wallet","logs","audit"].forEach(sec => $("#section-" + sec).style.display = sec === section ? "block" : "none");
}

// -------------------- INITIAL DATA LOAD --------------------
async function loadInitialData() {
  await Promise.all([loadStats(), loadAnalyticsUI(), loadAuditLogs()]);
}

// -------------------- VERIFY --------------------
async function adminVerify(mode) {
  const input = $("#verify-input");
  const output = $("#verify-output");
  if (!input || !output) return;
  const raw = input.value.trim();
  if (!raw) { showToast("Enter value", { type: "error" }); return; }
  output.innerHTML = "<div>Loading…</div>";

  let field = "name";
  if (mode === "id") field = "nia";
  if (mode === "phone") field = "phone";
  if (mode === "email") field = "email";

  try {
    const snap = await getDocs(query(collection(db, "records"), where(field, "==", raw), limit(1)));
    if (snap.empty) { output.innerHTML = "<div style='color:#b00020'>No match found</div>"; return; }
    const rec = snap.docs[0].data();
    output.innerHTML = `<div class="verify-card">
      <div><strong>Name:</strong> ${escapeHtml(rec.name || "—")}</div>
      <div><strong>NIA:</strong> ${escapeHtml(rec.nia || "—")}</div>
      <div><strong>Status:</strong> ${escapeHtml(rec.status || "—")}</div>
      <div><strong>Region:</strong> ${escapeHtml(rec.region || "—")}</div>
      <div><strong>DOB:</strong> ${escapeHtml(rec.dob || "—")}</div>
      <div><strong>Criminal:</strong> ${escapeHtml(rec.criminal || "—")}</div>
    </div>`;
  } catch (err) { handlePermissionError(err, "Cannot verify"); output.innerHTML = "<div style='color:#b00020'>Error verifying</div>"; }
}
window.adminVerify = adminVerify;

// -------------------- USERS / RECORDS --------------------
async function loadUsers() {
  if (!db) return;
  const tbody = $("#users-body");
  if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='5'>Loading…</td></tr>";

  try {
    const snap = await getDocs(collection(db, "records"));
    tbody.innerHTML = "";
    snap.forEach(s => {
      const r = s.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(s.id)}</td>
        <td>${escapeHtml(r.name || "—")}</td>
        <td>${escapeHtml(r.nia || "—")}</td>
        <td>${escapeHtml(r.status || "—")}</td>
        <td>${currentUserRole==="superadmin"?`<button class="delete-btn" data-id="${s.id}">Delete</button>`:""}</td>
      `;
      tbody.appendChild(tr);
      if (currentUserRole === "superadmin") tr.querySelector(".delete-btn").addEventListener("click", () => deleteRecord(s.id));
    });
  } catch(err) { handlePermissionError(err,"Cannot load records"); tbody.innerHTML = "<tr><td colspan='5'>Failed</td></tr>"; }
}

async function saveNewRecord() {
  const name = $("#add-name").value.trim();
  const nia = $("#add-nia").value.trim();
  const status = $("#add-status").value.trim();
  if (!name || !nia) { showToast("Name & NIA required",{type:"error"}); return; }

  try { await addDoc(collection(db,"records"),{name,nia,status}); showToast("Record added"); $("#modal-add-user").style.display="none"; loadUsers(); }
  catch(err){ handlePermissionError(err,"Cannot add record"); }
}

async function deleteRecord(id) { try{ await deleteDoc(doc(db,"records",id)); showToast("Record deleted"); loadUsers(); } catch(err){ handlePermissionError(err,"Cannot delete record"); } }

// -------------------- WALLET, STATS, LOGS, AUDIT --------------------
// ... Implement similarly as above

// -------------------- DOM READY --------------------
document.addEventListener("DOMContentLoaded", () => { if(document.body.matches("[data-admin-page]")) initFirebase().catch(console.error); });

window.admin = { initFirebase, doSignOut, loadUsers, adminVerify };
