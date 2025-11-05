// admin.js — Final merged admin dashboard with Superadmin/Staff roles
// Collections expected: records, users, wallet, wallet_transactions, search_logs, audit_logs, stats
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
let app = null;
let auth = null;
let db = null;
let analytics = null;
let currentUser = null;
let currentUserRole = null;

// -------------------- HELPERS --------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showToast(message, { type = "info", timeout = 4000 } = {}) {
  const t = document.createElement("div");
  t.textContent = message;
  t.style.position = "fixed";
  t.style.right = "16px";
  t.style.bottom = "16px";
  t.style.background = type === "error" ? "#b00020" : "#111";
  t.style.color = "#fff";
  t.style.padding = "10px 14px";
  t.style.borderRadius = "8px";
  t.style.zIndex = 9999;
  t.style.opacity = 0;
  t.style.transition = "opacity .18s";
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

function handlePermissionError(err, friendly) {
  console.warn("Permission error:", err);
  showToast(friendly || "Permission problem (see console)", { type: "error", timeout: 6000 });
}

// -------------------- INIT FIREBASE --------------------
async function initFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    try {
      if (await analyticsSupported()) analytics = getAnalytics(app);
      else analytics = null;
    } catch (e) {
      analytics = null;
      console.info("Analytics init error:", e && e.message);
    }

    // Auth state listener: run role check before allowing admin UI
    onAuthStateChanged(auth, async (user) => {
      currentUser = user || null;
      if (!user) {
        // If not signed in, redirect to login
        if (!location.pathname.endsWith("/dashboard.html")) {
          window.location.href = "/dashboard.html";
        }
        return;
      }

      // Signed in -> check role in Firestore (collection: users, doc id = uid)
      try {
        const uDoc = await getDoc(doc(db, "users", user.uid));
        if (!uDoc.exists()) {
          // No role assigned: sign out and redirect
          await signOut(auth);
          showToast("No user record found. Contact owner.", { type: "error" });
          window.location.href = "/dashboard.html";
          return;
        }
        const role = (uDoc.data().role || "user").toLowerCase();
        currentUserRole = role;
        // Allow only superadmin or staff
        if (role !== "superadmin" && role !== "staff") {
          await signOut(auth);
          showToast("Not authorized for admin.", { type: "error" });
          window.location.href = "/dashboard.html";
          return;
        }
        // OK - allowed: show role and initialize UI
        const roleEl = $("#admin-role");
        if (roleEl) roleEl.textContent = role;
        // Setup UI according to role and load data
        setupBindings();
        await loadInitialData();
      } catch (err) {
        console.error("Role check failed", err);
        showToast("Role check failed (see console)", { type: "error" });
        await signOut(auth).catch(()=>{});
        window.location.href = "/dashboard.html";
      }
    });

    return { app, auth, db, analytics };
  } catch (err) {
    console.error("initFirebase failed:", err);
    showToast("Firebase init failed (see console)", { type: "error" });
  }
}

// -------------------- SIGN OUT --------------------
async function doSignOut() {
  if (!auth) return;
  try {
    await signOut(auth);
    showToast("Signed out");
    window.location.href = "/dashboard.html";
  } catch (e) {
    console.error("Sign out failed", e);
    showToast("Sign out failed", { type: "error" });
  }
}

// -------------------- ROLE-BASED BINDINGS & UI HIDING --------------------
function setupBindings() {
  // Logout button
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) logoutBtn.onclick = () => window.admin.doSignOut();

  // Show role in UI
  const roleEl = document.getElementById("admin-role");
  if (roleEl) roleEl.textContent = currentUserRole || "";

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

  // Verify buttons — your verify UI uses "name", "id" or phone/email modes
  const btnName = $("#btn-verify-name") || $("#btn-verify-phone") || $("#btn-verify-search");
  const btnID = $("#btn-verify-id");
  if (btnName) btnName.onclick = () => window.adminVerify("name");
  if (btnID) btnID.onclick = () => window.adminVerify("id");
  // extra mapping
  const btnPhone = $("#btn-verify-phone");
  const btnEmail = $("#btn-verify-email");
  if (btnPhone) btnPhone.onclick = () => window.adminVerify("phone");
  if (btnEmail) btnEmail.onclick = () => window.adminVerify("email");

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

  // STAFF UI RESTRICTIONS (hide admin-only elements)
  if (currentUserRole === "staff") {
    document.querySelectorAll(".admin-only").forEach(el => el.style.display = "none");
    document.querySelectorAll(".wallet-edit").forEach(el => el.style.display = "none");
    document.querySelectorAll(".delete-user").forEach(el => el.style.display = "none");
    console.log("Staff mode: restricted UI loaded");
  }
}

// -------------------- INITIAL LOADERS --------------------
async function loadInitialData() {
  try {
    await Promise.all([loadStats(), loadAnalyticsUI(), loadAuditLogs()]);
  } catch (e) {
    console.warn("Partial initial load error:", e);
  }
}

// -------------------- AUDIT LOGS (paginated) --------------------
const auditState = { pageSize: 50, lastSnapshot: null, loading: false, finished: false };

async function loadAuditLogs(reset = false) {
  if (!db) return;
  if (auditState.loading) return;
  if (reset) { auditState.lastSnapshot = null; auditState.finished = false; }
  if (auditState.finished) return;

  auditState.loading = true;
  try {
    let q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(auditState.pageSize));
    if (auditState.lastSnapshot) {
      q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), startAfter(auditState.lastSnapshot), limit(auditState.pageSize));
    }
    const snap = await getDocs(q);
    if (snap.empty) { auditState.finished = true; return; }
    auditState.lastSnapshot = snap.docs[snap.docs.length - 1];
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAuditRows(rows);
    if (snap.docs.length < auditState.pageSize) auditState.finished = true;
  } catch (err) {
    if (/permission|insufficient/i.test(err?.message || "")) handlePermissionError(err, "Cannot load audit logs (permission denied).");
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

// -------------------- VERIFY — uses collection "records" --------------------
window.adminVerify = async function verifyUser(mode) {
  const input = $("#verify-input");
  const output = $("#verify-output");
  if (!input || !output) return showToast("Verify UI missing", { type: "error" });
  const raw = input.value?.trim();
  if (!raw) return showToast("Enter name or ID", { type: "error" });

  output.innerHTML = `<div class="loader-sm">Loading…</div>`;
  try {
    let field = "name";
    if (mode === "id") field = "nia";
    if (mode === "phone") field = "phone";
    if (mode === "email") field = "email";

    const q = query(collection(db, "records"), where(field, "==", raw), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) {
      output.innerHTML = `<div style="color:#b00020">No match found</div>`;
      return;
    }
    const rec = snap.docs[0].data();
    output.innerHTML = `
      <div class="verify-card">
        <div><strong>Name:</strong> ${escapeHtml(rec.name || "—")}</div>
        <div><strong>NIA:</strong> ${escapeHtml(rec.nia || "—")}</div>
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
      showToast("Verification failed (see console)", { type: "error" });
    }
    output.innerHTML = `<div style="color:#b00020">Error verifying</div>`;
  }
};

// -------------------- STATS loader --------------------
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

// -------------------- USERS loader --------------------
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

// -------------------- SEARCH LOGS loader --------------------
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

// -------------------- WALLET and TRANSACTIONS loader --------------------
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

// -------------------- Analytics UI --------------------
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
    if (el) el.textContent = "Analytics error";
  }
}

// -------------------- DOM ready binding and init --------------------
document.addEventListener("DOMContentLoaded", () => {
  // Setup static bindings that don't rely on auth-role yet (e.g., tab clicks)
  // But full UI will only be loaded after role check in initFirebase
  // Keep minimal bindings so page is interactive even if not authed
  const minimalTabs = {
    "#tab-dashboard": () => { $("#section-dashboard").style.display = "block"; },
  };
  Object.keys(minimalTabs).forEach(k=>{
    const el = $(k);
    if (el) el.onclick = minimalTabs[k];
  });

  // Auto init if page has the attribute
  if (document.body.matches("[data-admin-page]")) {
    initFirebase().catch((e) => console.error("initFirebase failed", e));
  } else {
    // If someone opens admin.html without the marker, still init to redirect if needed
    initFirebase().catch(()=>{});
  }
});

// -------------------- Expose API --------------------
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
