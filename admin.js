// admin.js — FULL (Option B: full admin feature set)
// Collections expected (exactly): records, search_logs, users, wallet, wallet_transactions, stats, audit_logs

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  where
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getAnalytics, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-analytics.js";

// ------------------------------
// Paste your real firebase config below
// ------------------------------
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

// ------------------------------
// Globals
// ------------------------------
let app = null;
let auth = null;
let db = null;
let analytics = null;

// ------------------------------
// Small utilities
// ------------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showToast(message, { type = "info", timeout = 4000 } = {}) {
  const t = document.createElement("div");
  t.className = `admin-toast admin-toast-${type}`;
  t.textContent = message;
  Object.assign(t.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    background: type === "error" ? "#b00020" : "#111",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: "8px",
    zIndex: 9999,
    opacity: 0,
    transition: "opacity .18s ease"
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => (t.style.opacity = 1));
  setTimeout(() => {
    t.style.opacity = 0;
    setTimeout(() => t.remove(), 220);
  }, timeout);
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function handlePermissionError(err, friendly = "Permission error") {
  console.warn("Permission error:", err);
  showToast(friendly, { type: "error", timeout: 6000 });
}

// ------------------------------
// Initialize Firebase
// ------------------------------
async function initFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    try {
      if (await analyticsSupported()) {
        analytics = getAnalytics(app);
        console.info("Analytics enabled");
      } else {
        analytics = null;
      }
    } catch (e) {
      analytics = null;
      console.info("Analytics not available:", e?.message ?? e);
    }

    onAuthStateChanged(auth, (user) => {
      if (user) {
        onUserSignedIn(user);
      } else {
        onUserSignedOut();
      }
    });

    // If the page is the admin page auto-load initial data after init
    if (document.body.matches("[data-admin-page]")) {
      // Delay slightly so any UI elements have mounted
      setTimeout(() => loadInitialData().catch((e) => console.warn(e)), 50);
    }

    return { app, auth, db, analytics };
  } catch (err) {
    console.error("Firebase initialization failed:", err);
    showToast("Failed to initialize Firebase (check console)", { type: "error" });
    throw err;
  }
}

// ------------------------------
// Auth handlers (minimal — expand if you use auth roles)
// ------------------------------
async function onUserSignedIn(user) {
  console.info("Signed in:", user.uid);
  loadInitialData().catch((e) => console.error(e));
}

function onUserSignedOut() {
  console.info("No user signed in");
  // Optionally redirect to login if needed
  // location.href = '/login.html'
}

async function doSignOut() {
  if (!auth) return;
  try {
    await signOut(auth);
    showToast("Signed out");
  } catch (e) {
    console.error("Sign out failed", e);
    showToast("Sign out failed", { type: "error" });
  }
}

// ------------------------------
// Initial data loaders
// ------------------------------
async function loadInitialData() {
  try {
    await Promise.all([loadStats(), loadAnalyticsUI(), loadAuditLogs()]);
  } catch (e) {
    console.warn("Initial load partial failure:", e);
  }
}

// ------------------------------
// AUDIT LOGS (paginated read-only)
// ------------------------------
const auditState = {
  pageSize: 50,
  lastSnapshot: null,
  loading: false,
  finished: false
};

async function loadAuditLogs(reset = false) {
  if (!db) return;
  if (auditState.loading) return;
  if (reset) {
    auditState.lastSnapshot = null;
    auditState.finished = false;
  }
  if (auditState.finished) return;

  auditState.loading = true;
  try {
    let q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(auditState.pageSize));
    if (auditState.lastSnapshot) {
      q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), startAfter(auditState.lastSnapshot), limit(auditState.pageSize));
    }
    const snap = await getDocs(q);
    if (snap.empty) {
      auditState.finished = true;
      return;
    }
    auditState.lastSnapshot = snap.docs[snap.docs.length - 1];
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAuditRows(rows);
    if (snap.docs.length < auditState.pageSize) auditState.finished = true;
  } catch (err) {
    if (/permission|insufficient/i.test(err?.message || "")) handlePermissionError(err, "Cannot read audit logs (permission denied).");
    else console.error("loadAuditLogs error:", err);
  } finally {
    auditState.loading = false;
  }
}

function renderAuditRows(rows) {
  const tbody = $("#audit-logs-body");
  if (!tbody) return;
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    const ts = r.timestamp ? (r.timestamp.seconds ? new Date(r.timestamp.seconds * 1000).toLocaleString() : String(r.timestamp)) : "";
    tr.innerHTML = `
      <td>${escapeHtml(ts)}</td>
      <td>${escapeHtml(r.user || "")}</td>
      <td>${escapeHtml(r.action || "")}</td>
      <td>${escapeHtml(JSON.stringify(r.meta || {}))}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ------------------------------
// VERIFY — uses collection `records`
// Modes supported by buttons: "name" and "id"
// ------------------------------
window.adminVerify = async function verifyUser(mode) {
  const input = $("#verify-input");
  const output = $("#verify-output");
  if (!input || !output) return showToast("Verify UI missing", { type: "error" });

  const raw = input.value?.trim();
  if (!raw) return showToast("Enter name or ID to verify", { type: "error" });

  output.innerHTML = `<div class="loader-sm">Loading…</div>`;

  try {
    const field = mode === "id" ? "nia" : "name";
    const q = query(collection(db, "records"), where(field, "==", raw), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) {
      output.innerHTML = `<div style="color:#b00020">No record found</div>`;
      return;
    }
    const rec = snap.docs[0].data();
    output.innerHTML = `
      <div class="verify-card">
        <div><strong>Name:</strong> ${escapeHtml(rec.name || "—")}</div>
        <div><strong>NIA / ID:</strong> ${escapeHtml(rec.nia || "—")}</div>
        <div><strong>Status:</strong> ${escapeHtml(rec.status || "—")}</div>
        <div><strong>Region:</strong> ${escapeHtml(rec.region || "—")}</div>
        <div><strong>DOB:</strong> ${escapeHtml(rec.dob || "—")}</div>
        <div><strong>Criminal:</strong> ${escapeHtml(rec.criminal || "—")}</div>
      </div>
    `;
  } catch (err) {
    if (/permission|insufficient/i.test(err?.message || "")) handlePermissionError(err, "Cannot verify (permission denied).");
    else {
      console.error("verifyUser error", err);
      showToast("Verification failed (check console)", { type: "error" });
    }
    output.innerHTML = `<div style="color:#b00020">Error during verification</div>`;
  }
};

// button binding done in DOMContentLoaded below

// ------------------------------
// STATS loader
// reads: users, search_logs, wallet, wallet_transactions, stats (if you use it)
// ------------------------------
async function loadStats() {
  if (!db) return;
  try {
    const [usersSnap, searchesSnap, walletSnap, txSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "search_logs")),
      getDocs(collection(db, "wallet")),
      getDocs(collection(db, "wallet_transactions"))
    ]);

    const elUsers = $("#stat-users");
    const elSearches = $("#stat-searches");
    const elWallet = $("#stat-wallet");
    const elTx = $("#stat-transactions");

    if (elUsers) elUsers.textContent = usersSnap.size;
    if (elSearches) elSearches.textContent = searchesSnap.size;
    if (elTx) elTx.textContent = txSnap.size;

    let total = 0;
    walletSnap.forEach((d) => {
      total += Number(d.data()?.balance || 0);
    });
    if (elWallet) elWallet.textContent = `$${total.toFixed(2)}`;
  } catch (err) {
    if (/permission|insufficient/i.test(err?.message || "")) handlePermissionError(err, "Cannot load stats (permission denied).");
    else console.error("loadStats error:", err);
  }
}

// ------------------------------
// USERS loader
// ------------------------------
async function loadUsers() {
  if (!db) return;
  const tbody = $("#users-body");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" class="p-3">Loading…</td></tr>`;

  try {
    const snap = await getDocs(collection(db, "users"));
    tbody.innerHTML = "";
    snap.forEach((s) => {
      const u = s.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(s.id)}</td>
        <td>${escapeHtml(u.name || "—")}</td>
        <td>${escapeHtml(u.email || "—")}</td>
        <td>${escapeHtml(u.role || "user")}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    if (/permission|insufficient/i.test(err?.message || "")) handlePermissionError(err, "Cannot load users (permission denied).");
    else console.error("loadUsers:", err);
    tbody.innerHTML = `<tr><td colspan="4" class="p-3">Failed to load users</td></tr>`;
  }
}

// ------------------------------
// SEARCH LOGS loader
// ------------------------------
async function loadSearchLogs() {
  if (!db) return;
  const tbody = $("#searchlogs-body");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" class="p-3">Loading…</td></tr>`;

  try {
    const snap = await getDocs(query(collection(db, "search_logs"), orderBy("timestamp", "desc"), limit(100)));
    tbody.innerHTML = "";
    snap.forEach((d) => {
      const row = d.data();
      const date = row.timestamp?.seconds ? new Date(row.timestamp.seconds * 1000).toLocaleString() : (row.timestamp || "");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(date)}</td>
        <td>${escapeHtml(row.user || "—")}</td>
        <td>${escapeHtml(row.query || "—")}</td>
        <td>${escapeHtml(JSON.stringify(row.result || {}))}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    if (/permission|insufficient/i.test(err?.message || "")) handlePermissionError(err, "Cannot load search logs (permission denied).");
    else console.error("loadSearchLogs:", err);
  }
}

// ------------------------------
// WALLET and TRANSACTIONS loader
// ------------------------------
async function loadWallet() {
  if (!db) return;
  const body = $("#wallet-body");
  const txBody = $("#wallettx-body");
  if (!body || !txBody) return;

  body.innerHTML = `<tr><td colspan="2" class="p-3">Loading…</td></tr>`;
  txBody.innerHTML = `<tr><td colspan="4" class="p-3">Loading…</td></tr>`;

  try {
    const [walletSnap, txSnap] = await Promise.all([
      getDocs(collection(db, "wallet")),
      getDocs(query(collection(db, "wallet_transactions"), orderBy("timestamp", "desc"), limit(200)))
    ]);

    body.innerHTML = "";
    walletSnap.forEach((s) => {
      const d = s.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(s.id)}</td>
        <td>$${Number(d.balance || 0).toFixed(2)}</td>
      `;
      body.appendChild(tr);
    });

    txBody.innerHTML = "";
    txSnap.forEach((t) => {
      const x = t.data();
      const date = x.timestamp?.seconds ? new Date(x.timestamp.seconds * 1000).toLocaleString() : (x.timestamp || "");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(date)}</td>
        <td>${escapeHtml(x.user || "—")}</td>
        <td>${escapeHtml(x.type || "—")}</td>
        <td>$${Number(x.amount || 0).toFixed(2)}</td>
      `;
      txBody.appendChild(tr);
    });
  } catch (err) {
    if (/permission|insufficient/i.test(err?.message || "")) handlePermissionError(err, "Cannot load wallet (permission denied).");
    else console.error("loadWallet:", err);
  }
}

// ------------------------------
// Analytics UI hint
// ------------------------------
async function loadAnalyticsUI() {
  const el = $("#analytics-status");
  if (!el) return;
  try {
    if (!analytics) {
      el.textContent = "Analytics not active.";
      return;
    }
    el.textContent = "Analytics active ✓";
  } catch (err) {
    console.error("loadAnalyticsUI error", err);
    el.textContent = "Analytics error";
  }
}

// ------------------------------
// Tab bindings, verify button bindings, mobile fixes
// ------------------------------
function setupBindings() {
  // Tabs
  const tabDash = $("#tab-dashboard");
  const tabVerify = $("#tab-verify");
  const tabUsers = $("#tab-users");
  const tabLogs = $("#tab-logs");
  const tabWallet = $("#tab-wallet");

  const secDash = $("#section-dashboard");
  const secVerify = $("#section-verify");
  const secUsers = $("#section-users");
  const secLogs = $("#section-searchlogs");
  const secWallet = $("#section-wallet");

  function showSection(sec) {
    [secDash, secVerify, secUsers, secLogs, secWallet].forEach((s) => {
      if (!s) return;
      s.style.display = s === sec ? "block" : "none";
    });
  }

  if (tabDash) tabDash.onclick = () => { showSection(secDash); loadStats(); loadAnalyticsUI(); };
  if (tabVerify) tabVerify.onclick = () => { showSection(secVerify); };
  if (tabUsers) tabUsers.onclick = () => { showSection(secUsers); loadUsers(); };
  if (tabLogs) tabLogs.onclick = () => { showSection(secLogs); loadSearchLogs(); };
  if (tabWallet) tabWallet.onclick = () => { showSection(secWallet); loadWallet(); };

  // Verify buttons — your verify UI uses "name" and "id" modes
  const btnName = $("#btn-verify-name") || $("#btn-verify-phone") || $("#btn-verify-search");
  const btnID = $("#btn-verify-id");
  if (btnName) btnName.onclick = () => window.adminVerify("name");
  if (btnID) btnID.onclick = () => window.adminVerify("id");

  // Minor mobile fixes (inline)
  (function addMobileFixes() {
    const st = document.createElement("style");
    st.innerHTML = `
      @media (max-width: 480px) {
        table { font-size: 13px; }
        td, th { padding: 6px 8px; }
      }
    `;
    document.head.appendChild(st);
  })();
}

// ------------------------------
// DOM ready
// ------------------------------
document.addEventListener("DOMContentLoaded", () => {
  setupBindings();
  // Only auto-init if flagged as admin page (avoids running on other pages).
  if (document.body.matches("[data-admin-page]")) {
    initFirebase().catch((e) => console.error("initFirebase failed", e));
  }
});

// ------------------------------
// Expose API
// ------------------------------
window.admin = {
  initFirebase,
  doSignOut,
  loadStats,
  loadUsers,
  loadSearchLogs,
  loadWallet,
  loadAuditLogs,
  loadAnalyticsUI,
  verifyUser: window.adminVerify
};

