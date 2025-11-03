// admin.js — PART 1 of 3
// Imports (ES module). Ensure your <script type="module"> matches this.
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

// -------------------- CONFIG: paste your Firebase config here --------------------
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID" // optional
};
// ----------------------------------------------------------------------------------

// Global references (initialized in initFirebase)
let app = null;
let auth = null;
let db = null;
let analytics = null;

// State for audit log pagination
const auditState = {
  lastSnapshot: null,
  pageSize: 50,
  loading: false,
  finished: false
};

// -------------------- Utility helpers --------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function showToast(message, { type = "info", timeout = 4000 } = {}) {
  // Minimal toast: adapt to your UI framework or replace with your own component.
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = message;
  Object.assign(t.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    background: "#111",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: "8px",
    zIndex: 9999,
    opacity: 0,
    transition: "opacity .2s ease"
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => (t.style.opacity = 1));
  setTimeout(() => {
    t.style.opacity = 0;
    setTimeout(() => t.remove(), 300);
  }, timeout);
}

// Small helper to handle permission errors gracefully
function handlePermissionError(err, fallbackMessage = "Permission error") {
  console.warn("Firebase permission error:", err?.message ?? err);
  showToast(fallbackMessage, { type: "error", timeout: 6000 });
}

// -------------------- Firebase init --------------------
async function initFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    // Init analytics only if supported in this browser environment.
    // Wrap in try/catch because it's common to get permission errors if measurementId missing or blocked.
    try {
      const supported = await analyticsSupported();
      if (supported) {
        analytics = getAnalytics(app);
        console.info("Analytics initialized");
      } else {
        console.info("Analytics not supported in this environment");
      }
    } catch (err) {
      // Don't break the whole app if analytics fails — log and show small notice.
      console.warn("Analytics init failed:", err?.message ?? err);
      // Only show a toast if it's a permission/forbidden type error
      if (err && /permission|insufficient|not allowed|blocked/i.test(err.message || "")) {
        handlePermissionError(err, "Analytics: insufficient permissions or blocked.");
      }
      analytics = null;
    }

    // Wire auth state
    onAuthStateChanged(auth, (user) => {
      if (user) {
        console.info("User signed in:", user.uid);
        onUserSignedIn(user);
      } else {
        console.info("No user signed in");
        onUserSignedOut();
      }
    });

    return { app, auth, db, analytics };
  } catch (err) {
    console.error("Firebase initialization error:", err);
    showToast("Unable to initialize app — check console for details", { type: "error" });
    throw err;
  }
}

// -------------------- Auth handlers --------------------
async function onUserSignedIn(user) {
  // Update UI: show user, hide login etc. (hooks into your DOM)
  const uid = user.uid;
  // Example: load user profile/permissions
  try {
    const p = await getUserPermissions(uid);
    applyPermissionsToUI(p);
    // Kick off initial data loads that require auth
    loadInitialData();
  } catch (err) {
    if (err?.code?.includes("permission") || /insufficient/i.test(err?.message || "")) {
      handlePermissionError(err, "You don't have permission to access some admin data.");
    } else {
      console.error("Error loading user permissions:", err);
    }
  }
}

function onUserSignedOut() {
  // Reset UI, show sign-in button, etc.
  applyPermissionsToUI({}); // remove any privileged UI
  // Optionally redirect to login page if this is a protected admin area
  // location.href = "/login.html";
}

// Example sign-out helper
async function doSignOut() {
  try {
    await signOut(auth);
    showToast("Signed out");
  } catch (err) {
    console.error("Sign out failed", err);
    showToast("Sign out failed", { type: "error" });
  }
}

// -------------------- Permissions & profile --------------------
async function getUserPermissions(uid) {
  // Reads from a "users" doc that contains roles/permissions.
  if (!db) throw new Error("Firestore not initialized");
  try {
    const docRef = doc(db, "users", uid);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return {};
    return snap.data()?.permissions || snap.data() || {};
  } catch (err) {
    if (err?.code === "permission-denied" || /insufficient/i.test(err?.message || "")) {
      handlePermissionError(err, "Can't read user permissions (permission denied).");
      return {};
    }
    throw err;
  }
}

function applyPermissionsToUI(permObj = {}) {
  // Minimal example: toggle elements with data-permission="X"
  $$("[data-permission]").forEach((el) => {
    const needed = el.getAttribute("data-permission");
    const allowed = !!permObj[needed] || (permObj.roles && permObj.roles.includes("admin"));
    el.style.display = allowed ? "" : "none";
  });
}

// -------------------- Load initial data (hook) --------------------
function loadInitialData() {
  // Start loading the parts of the admin panel that don't require complex params.
  // Keep each loader defensive to avoid breaking the whole page if one fails.
  loadAuditLogs().catch((e) => {
    console.error("loadAuditLogs failed:", e);
  });
  // add other loaders here (e.g., loadStats, loadSearchIndexPreview)
}
  
// -------------------- Audit log loader (paginated) --------------------
async function loadAuditLogs(reset = false) {
  if (!db) throw new Error("Firestore not initialized");
  if (auditState.loading) return;
  if (reset) {
    auditState.lastSnapshot = null;
    auditState.finished = false;
  }
  if (auditState.finished) {
    console.info("Audit logs: finished (no more pages)");
    return;
  }

  auditState.loading = true;
  try {
    let q = query(
      collection(db, "audit_logs"),
      orderBy("timestamp", "desc"),
      limit(auditState.pageSize)
    );
    if (auditState.lastSnapshot) {
      q = query(
        collection(db, "audit_logs"),
        orderBy("timestamp", "desc"),
        startAfter(auditState.lastSnapshot),
        limit(auditState.pageSize)
      );
    }

    const snap = await getDocs(q);
    if (snap.empty) {
      auditState.finished = true;
      auditState.loading = false;
      console.info("No audit log documents found (or finished).");
      return;
    }

    // Save the last document for next page
    auditState.lastSnapshot = snap.docs[snap.docs.length - 1];

    // Render logs into the table or UI component
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAuditRows(rows);

    // If less than pageSize returned, we reached the end
    if (snap.docs.length < auditState.pageSize) {
      auditState.finished = true;
    }
  } catch (err) {
    if (err?.code === "permission-denied" || /insufficient|permission/i.test(err?.message || "")) {
      handlePermissionError(err, "Cannot load audit logs — insufficient permissions.");
    } else {
      console.error("Error loading audit logs:", err);
      showToast("Failed to load audit logs (console for details)", { type: "error" });
    }
  } finally {
    auditState.loading = false;
  }
}

function renderAuditRows(rows) {
  // Minimal renderer — adapt to your table/dom structure.
  const tbody = $("#audit-logs-body");
  if (!tbody) {
    console.warn("Missing #audit-logs-body element in DOM — skipping renderAuditRows");
    return;
  }
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

// Quick HTML escape
function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// -------------------- Expose some functions globally for buttons to call --------------------
window.admin = {
  initFirebase,
  doSignOut,
  loadAuditLogs,
  loadInitialData
};

// Automatically initialize on script load (optional)
document.addEventListener("DOMContentLoaded", () => {
  // Only auto-init if we are in an admin page element; avoids running on other pages.
  if (document.body.matches("[data-admin-page]")) {
    initFirebase().catch((e) => {
      console.error("initFirebase failed:", e);
    });
  }
});
// ------------------------------
// VERIFY SYSTEM (PART 2)
// ------------------------------

/**
 * Entry point for the 3 verify buttons:
 * - Verify by phone
 * - Verify by email
 * - Verify by ID
 *
 * Each button passes a mode: "phone" | "email" | "id"
 */
window.adminVerify = async function verifyUser(mode) {
  const input = $("#verify-input");
  const output = $("#verify-output");

  if (!input) return showToast("Missing #verify-input in DOM", { type: "error" });
  if (!output) return showToast("Missing #verify-output in DOM", { type: "error" });

  const value = input.value.trim();
  if (!value) {
    showToast("Enter a value to verify", { type: "error" });
    return;
  }

  output.innerHTML = `<div class="loader-sm"></div> Checking…`;

  try {
    const result = await searchVerification(mode, value);
    if (!result) {
      output.innerHTML = `<span class="text-red-500">No matching record found.</span>`;
      return;
    }

    renderVerificationResult(result);
  } catch (err) {
    console.error("verifyUser error:", err);
    if (err?.code === "permission-denied" || /insufficient/i.test(err?.message || "")) {
      showToast("You do not have permission to verify records.", { type: "error" });
    } else {
      showToast("Verification failed — check console", { type: "error" });
    }
    output.innerHTML = `<span class="text-red-600">Error verifying user.</span>`;
  }
};

/**
 * Firestore lookup handler used by verifyUser()
 */
async function searchVerification(mode, value) {
  if (!db) throw new Error("Firestore not initialized");

  let field = "";
  if (mode === "phone") field = "phone";
  else if (mode === "email") field = "email";
  else if (mode === "id") field = "id_number";
  else throw new Error("Invalid verification mode");

  try {
    const q = query(
      collection(db, "verification"),
      where(field, "==", value),
      limit(1)
    );

    const snap = await getDocs(q);
    if (snap.empty) return null;

    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (err) {
    if (err?.code === "permission-denied") {
      handlePermissionError(err, "Permission denied while reading verification database.");
      return null;
    }
    throw err;
  }
}

/**
 * Renders the verification result box on the UI
 */
function renderVerificationResult(data) {
  const output = $("#verify-output");
  if (!output) return;

  const safe = escapeHtml;

  output.innerHTML = `
    <div class="verify-card">
      <h3 class="verify-title">Verification Result</h3>
      
      <div class="verify-row">
        <span class="verify-label">Name:</span>
        <span class="verify-value">${safe(data.name || "—")}</span>
      </div>

      <div class="verify-row">
        <span class="verify-label">Phone:</span>
        <span class="verify-value">${safe(data.phone || "—")}</span>
      </div>

      <div class="verify-row">
        <span class="verify-label">Email:</span>
        <span class="verify-value">${safe(data.email || "—")}</span>
      </div>

      <div class="verify-row">
        <span class="verify-label">ID Number:</span>
        <span class="verify-value">${safe(data.id_number || "—")}</span>
      </div>

      <div class="verify-row">
        <span class="verify-label">Status:</span>
        <span class="verify-value status-${safe(data.status || "unknown")}">
          ${safe(data.status || "unknown")}
        </span>
      </div>
    </div>
  `;
}

// ------------------------------
// BUTTON EVENT BINDING (VERIFY PAGE)
// ------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const btnPhone = $("#btn-verify-phone");
  const btnEmail = $("#btn-verify-email");
  const btnID = $("#btn-verify-id");

  if (btnPhone) btnPhone.onclick = () => window.adminVerify("phone");
  if (btnEmail) btnEmail.onclick = () => window.adminVerify("email");
  if (btnID) btnID.onclick = () => window.adminVerify("id");
});

// ------------------------------
// MOBILE VIEW FIXES FOR VERIFY SECTION
// ------------------------------
(function fixVerifyMobile() {
  const style = document.createElement("style");
  style.innerHTML = `
    @media (max-width: 480px) {
      #verify-section {
        padding: 10px !important;
      }
      .verify-card {
        padding: 12px;
        font-size: 15px;
      }
      .verify-row {
        display: flex;
        justify-content: space-between;
        margin: 6px 0;
      }
      .verify-label {
        font-weight: 600;
      }
      #verify-input {
        width: 100% !important;
        font-size: 16px !important;
      }
      #verify-output {
        margin-top: 12px;
      }
    }
  `;
  document.head.appendChild(style);
})();
// -----------------------------------------
// PART 3 — STATS / USERS / SEARCH LOGS / WALLET
// -----------------------------------------

// ---------- Load Stats (global counts) ----------
async function loadStats() {
  if (!db) return;

  const elUsers = $("#stat-users");
  const elSearches = $("#stat-searches");
  const elWallet = $("#stat-wallet");
  const elTransactions = $("#stat-transactions");

  try {
    // USERS COUNT
    const usersSnap = await getDocs(collection(db, "users"));
    if (elUsers) elUsers.textContent = usersSnap.size;

    // SEARCH LOGS COUNT
    const searchSnap = await getDocs(collection(db, "search_logs"));
    if (elSearches) elSearches.textContent = searchSnap.size;

    // WALLET BALANCES
    const walletSnap = await getDocs(collection(db, "wallet"));
    let totalBalance = 0;
    walletSnap.forEach((d) => {
      const bal = Number(d.data()?.balance || 0);
      totalBalance += bal;
    });
    if (elWallet) elWallet.textContent = `$${totalBalance.toFixed(2)}`;

    // TRANSACTIONS COUNT
    const txSnap = await getDocs(collection(db, "wallettransactions"));
    if (elTransactions) elTransactions.textContent = txSnap.size;

  } catch (err) {
    console.error("loadStats error:", err);
    if (/permission|insufficient/i.test(err?.message || "")) {
      showToast("No permission to read stats", { type: "error" });
    }
  }
}


// ---------- Load Users (admin list) ----------
async function loadUsers() {
  if (!db) return;

  const tbody = $("#users-body");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="4" class="text-center p-3">Loading...</td></tr>`;

  try {
    const snap = await getDocs(collection(db, "users"));

    tbody.innerHTML = "";
    snap.forEach((docSnap) => {
      const u = docSnap.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(docSnap.id)}</td>
        <td>${escapeHtml(u.name || "No Name")}</td>
        <td>${escapeHtml(u.email || "—")}</td>
        <td>${escapeHtml(u.role || "user")}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("loadUsers failed:", err);
    if (/permission|insufficient/i.test(err?.message || "")) {
      showToast("No permission to read users", { type: "error" });
    }
  }
}


// ---------- Load Search Logs ----------
async function loadSearchLogs() {
  if (!db) return;

  const tbody = $("#searchlogs-body");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="4" class="p-3 text-center">Loading…</td></tr>`;

  try {
    const q = query(
      collection(db, "search_logs"),
      orderBy("timestamp", "desc"),
      limit(100)
    );
    const snap = await getDocs(q);

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
    console.error("loadSearchLogs error:", err);
    if (/permission|insufficient/i.test(err?.message || "")) {
      showToast("No permission to read search logs", { type: "error" });
    }
  }
}


// ---------- Load Wallet / Transactions ----------
async function loadWallet() {
  if (!db) return;

  const tbody = $("#wallet-body");
  const tbodyTx = $("#wallettx-body");

  if (tbody) tbody.innerHTML = `<tr><td colspan="3">Loading…</td></tr>`;
  if (tbodyTx) tbodyTx.innerHTML = `<tr><td colspan="4">Loading…</td></tr>`;

  try {
    // WALLET ACCOUNTS
    const snap = await getDocs(collection(db, "wallet"));
    if (tbody) tbody.innerHTML = "";
    snap.forEach((s) => {
      const w = s.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(s.id)}</td>
        <td>$${Number(w.balance || 0).toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    });

    // TRANSACTIONS
    const txSnap = await getDocs(
      query(
        collection(db, "wallettransactions"),
        orderBy("timestamp", "desc"),
        limit(100)
      )
    );
    if (tbodyTx) tbodyTx.innerHTML = "";
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
    console.error("loadWallet error:", err);
    if (/permission|insufficient/i.test(err?.message || "")) {
      showToast("No permission to read wallet", { type: "error" });
    }
  }
}


// -----------------------------------------
// DASHBOARD ANALYTICS SECTION
// -----------------------------------------
async function loadAnalyticsUI() {
  // Uses the analytics object from Part 1 if available
  const el = $("#analytics-status");
  if (!el) return;

  try {
    if (!analytics) {
      el.textContent = "Analytics not enabled or blocked.";
      return;
    }
    el.textContent = "Analytics active ✓";
  } catch (err) {
    el.textContent = "Analytics error";
    console.error("Analytics UI error:", err);
  }
}


// -----------------------------------------
// TAB BUTTON EVENT BINDERS
// -----------------------------------------
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

  function showSection(sec) {
    [secDash, secVerify, secUsers, secLogs, secWallet].forEach((x) => {
      if (!x) return;
      x.style.display = x === sec ? "block" : "none";
    });
  }

  if (tabDash)
    tabDash.onclick = () => {
      showSection(secDash);
      loadStats();
      loadAnalyticsUI();
    };

  if (tabVerify)
    tabVerify.onclick = () => {
      showSection(secVerify);
    };

  if (tabUsers)
    tabUsers.onclick = () => {
      showSection(secUsers);
      loadUsers();
    };

  if (tabLogs)
    tabLogs.onclick = () => {
      showSection(secLogs);
      loadSearchLogs();
    };

  if (tabWallet)
    tabWallet.onclick = () => {
      showSection(secWallet);
      loadWallet();
    };
});


// -----------------------------------------
// MOBILE FIXES (DASHBOARD + TABLES)
// -----------------------------------------
(function addMobileFixes() {
  const style = document.createElement("style");
  style.innerHTML = `
    @media (max-width: 480px) {
      table {
        font-size: 14px;
      }
      td, th {
        padding: 6px 4px;
      }
      .stat-card {
        padding: 12px !important;
      }
      .stat-number {
        font-size: 22px !important;
      }
    }
  `;
  document.head.appendChild(style);
})();


// -----------------------------------------
// Expose utils
// -----------------------------------------
window.admin.loadStats = loadStats;
window.admin.loadUsers = loadUsers;
window.admin.loadSearchLogs = loadSearchLogs;
window.admin.loadWallet = loadWallet;
window.admin.loadAnalyticsUI = loadAnalyticsUI;

// END OF PART 3

