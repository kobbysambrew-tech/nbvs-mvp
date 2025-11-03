// FULL ADMIN.JS (COMBINED PARTS 1–3)
// ---------------------------------------------------------------
// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
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
import {
  getAnalytics,
  isSupported as analyticsSupported
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-analytics.js";

// ---------------------------------------------------------------
// Firebase Config
// ---------------------------------------------------------------
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

let app = null;
let auth = null;
let db = null;
let analytics = null;

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showToast(message, { type = "info", timeout = 4000 } = {}) {
  const t = document.createElement("div");
  t.textContent = message;
  t.style.position = "fixed";
  t.style.right = "16px";
  t.style.bottom = "16px";
  t.style.background = "#111";
  t.style.color = "#fff";
  t.style.padding = "10px 14px";
  t.style.borderRadius = "8px";
  t.style.zIndex = 9999;
  t.style.opacity = 0;
  t.style.transition = "opacity .2s";
  document.body.appendChild(t);
  requestAnimationFrame(() => (t.style.opacity = 1));
  setTimeout(() => {
    t.style.opacity = 0;
    setTimeout(() => t.remove(), 300);
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

function handlePermissionError(err, msg) {
  console.warn("Permission error:", err);
  showToast(msg, { type: "error", timeout: 6000 });
}

// ---------------------------------------------------------------
// Init Firebase
// ---------------------------------------------------------------
async function initFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    try {
      const supported = await analyticsSupported();
      if (supported) analytics = getAnalytics(app);
    } catch (e) {
      console.warn("Analytics failed:", e);
      analytics = null;
    }

    onAuthStateChanged(auth, (user) => {
      if (user) onUserSignedIn(user);
      else onUserSignedOut();
    });
  } catch (err) {
    console.error("Init error", err);
    showToast("Initialization failed", { type: "error" });
  }
}

// ---------------------------------------------------------------
// Auth Handlers
// ---------------------------------------------------------------
async function onUserSignedIn(user) {
  try {
    const p = await getUserPermissions(user.uid);
    applyPermissionsToUI(p);
    loadInitialData();
  } catch (err) {
    handlePermissionError(err, "Unable to load permissions");
  }
}

function onUserSignedOut() {
  applyPermissionsToUI({});
}

async function doSignOut() {
  try {
    await signOut(auth);
    showToast("Signed out");
  } catch (err) {
    showToast("Sign-out failed", { type: "error" });
  }
}

async function getUserPermissions(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data().permissions || {} : {};
  } catch (err) {
    handlePermissionError(err, "Permission denied reading profile");
    return {};
  }
}

function applyPermissionsToUI(perm = {}) {
  $$('[data-permission]').forEach((el) => {
    const need = el.getAttribute('data-permission');
    const allowed = perm[need] || perm.roles?.includes('admin');
    el.style.display = allowed ? '' : 'none';
  });
}

// ---------------------------------------------------------------
// Initial Load
// ---------------------------------------------------------------
function loadInitialData() {
  loadStats();
  loadAnalyticsUI();
  loadAuditLogs();
}

// ---------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------
const auditState = {
  lastSnapshot: null,
  pageSize: 50,
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
  auditState.loading = true;

  try {
    let qy = query(
      collection(db, "audit_logs"),
      orderBy("timestamp", "desc"),
      limit(auditState.pageSize)
    );

    if (auditState.lastSnapshot) {
      qy = query(
        collection(db, "audit_logs"),
        orderBy("timestamp", "desc"),
        startAfter(auditState.lastSnapshot),
        limit(auditState.pageSize)
      );
    }

    const snap = await getDocs(qy);
    if (snap.empty) {
      auditState.finished = true;
      auditState.loading = false;
      return;
    }

    auditState.lastSnapshot = snap.docs[snap.docs.length - 1];
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAuditRows(rows);

    if (snap.docs.length < auditState.pageSize) auditState.finished = true;
  } catch (err) {
    handlePermissionError(err, "Cannot load audit logs");
  } finally {
    auditState.loading = false;
  }
}

function renderAuditRows(rows) {
  const tbody = $("#audit-logs-body");
  if (!tbody) return;
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.timestamp ? new Date(r.timestamp.seconds * 1000).toLocaleString() : "")}</td>
      <td>${escapeHtml(r.user || "")}</td>
      <td>${escapeHtml(r.action || "")}</td>
      <td>${escapeHtml(JSON.stringify(r.meta || {}))}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------------------
// VERIFY SYSTEM
// ---------------------------------------------------------------
window.adminVerify = async function verifyUser(mode) {
  const input = $("#verify-input");
  const output = $("#verify-output");
  if (!input || !output) return;

  const value = input.value.trim();
  if (!value) {
    showToast("Enter a value", { type: "error" });
    return;
  }

  output.innerHTML = `Checking…`;

  try {
    const result = await searchVerification(mode, value);
    if (!result) {
      output.innerHTML = `<span>No match found</span>`;
      return;
    }
    renderVerificationResult(result);
  } catch (err) {
    handlePermissionError(err, "Verification failed");
  }
};

async function searchVerification(mode, value) {
  if (!db) return;

  const fields = {
    phone: "phone",
    email: "email",
    id: "id_number"
  };

  const field = fields[mode];
  const qy = query(
    collection(db, "verification"),
    where(field, "==", value),
    limit(1)
  );

  try {
    const snap = await getDocs(qy);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (err) {
    handlePermissionError(err, "Permission denied verifying");
    return null;
  }
}

function renderVerificationResult(d) {
  const out = $("#verify-output");
  out.innerHTML = `
    <div class="verify-card">
      <div><strong>Name:</strong> ${escapeHtml(d.name || "—")}</div>
      <div><strong>Phone:</strong> ${escapeHtml(d.phone || "—")}</div>
      <div><strong>Email:</strong> ${escapeHtml(d.email || "—")}</div>
      <div><strong>ID:</strong> ${escapeHtml(d.id_number || "—")}</div>
      <div><strong>Status:</strong> ${escapeHtml(d.status || "unknown")}</div>
    </div>
  `;
}

// ---------------------------------------------------------------
// Stats
// ---------------------------------------------------------------
async function loadStats() {
  if (!db) return;
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const searchSnap = await getDocs(collection(db, "search_logs"));
    const walletSnap = await getDocs(collection(db, "wallet"));
    const txSnap = await getDocs(collection(db, "wallettransactions"));

    $("#stat-users").textContent = usersSnap.size;
    $("#stat-searches").textContent = searchSnap.size;

    let total = 0;
    walletSnap.forEach((d) => total += Number(d.data().balance || 0));
    $("#stat-wallet").textContent = `$${total.toFixed(2)}`;

    $("#stat-transactions").textContent = txSnap.size;
  } catch (err) {
    handlePermissionError(err, "Cannot load stats");
  }
}

// ---------------------------------------------------------------
// Users
// ---------------------------------------------------------------
async function loadUsers() {
  const tbody = $("#users-body");
  tbody.innerHTML = "Loading...";

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
    handlePermissionError(err, "Cannot load users");
  }
}

// ---------------------------------------------------------------
// Search Logs
// ---------------------------------------------------------------
async function loadSearchLogs() {
  const tbody = $("#searchlogs-body");
  tbody.innerHTML = "Loading...";

  try {
    const snap = await getDocs(
      query(collection(db, "search_logs"), orderBy("timestamp", "desc"), limit(100))
    );
    tbody.innerHTML = "";
    snap.forEach((s) => {
      const d = s.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(new Date(d.timestamp.seconds * 1000).toLocaleString())}</td>
        <td>${escapeHtml(d.user || "—")}</td>
        <td>${escapeHtml(d.query || "—")}</td>
        <td>${escapeHtml(JSON.stringify(d.result || {}))}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    handlePermissionError(err, "Cannot load logs");
  }
}

// ---------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------
async function loadWallet() {
  const tbody = $("#wallet-body");
  const tbodyTx = $("#wallettx-body");
  tbody.innerHTML = "Loading...";
  tbodyTx.innerHTML = "Loading...";

  try {
    const snap = await getDocs(collection(db, "wallet"));
    tbody.innerHTML = "";
    snap.forEach((s) => {
      const w = s.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(s.id)}</td>
        <td>$${Number(w.balance || 0).toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    });

    const txSnap = await getDocs(
      query(collection(db, "wallettransactions"), orderBy("timestamp", "desc"), limit(100))
    );
    tbodyTx.innerHTML = "";
    txSnap.forEach((t) => {
      const x = t.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(new Date(x.timestamp.seconds * 1000).toLocaleString())}</td>
        <td>${escapeHtml(x.user || "—")}</td>
        <td>${escapeHtml(x.type || "—")}</td>
        <td>$${Number(x.amount || 0).toFixed(2)}</td>
      `;
      tbodyTx.appendChild(tr);
    });
  } catch (err) {
    handlePermissionError(err, "Cannot load wallet");
  }
}

// ---------------------------------------------------------------
// Analytics UI
// ---------------------------------------------------------------
async function loadAnalyticsUI() {
  const el = $("#analytics-status");
  if (!el) return;

  if (!analytics) {
    el.textContent = "Analytics not active";
    return;
  }

  el.textContent = "Analytics active ✓";
}

// ---------------------------------------------------------------
// Tab Switching
// ---------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
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

  function show(sec) {
    [secDash, secVerify, secUsers, secLogs, secWallet].forEach((x) => {
      if (!x) return;
      x.style.display = x === sec ? "block" : "none";
    });
  }

  tabDash.onclick = () => {
    show(secDash);
    loadStats();
    loadAnalyticsUI();
  };

  tabVerify.onclick = () => show(secVerify);

  tabUsers.onclick = () => {
    show(secUsers);
    loadUsers();
  };

  tabLogs.onclick = () => {
    show(secLogs);
    loadSearchLogs();
  };

  tabWallet.onclick = () => {
    show(secWallet);
    loadWallet();
  };
});

// ---------------------------------------------------------------
// Mobile Fix Styles
// ---------------------------------------------------------------
(function mobileFix() {
  const style = document.createElement("style");
  style.innerHTML = `
    @media (max-width:480px){
      table{font-size:14px;}
      td,th{padding:6px 4px;}
      .stat-number{font-size:22px !important;}
    }
  `;
  document.head.appendChild(style);
})();

// ---------------------------------------------------------------
// Export Global
// ---------------------------------------------------------------
window.admin = {
  initFirebase,
  doSignOut,
  loadStats,
  loadUsers,
  loadSearchLogs,
  loadWallet,
  loadAnalyticsUI,
  loadAuditLogs
};

document.addEventListener("DOMContentLoaded", () => {
  if (document.body.matches('[data-admin-page]')) {
    initFirebase();
  }
});
