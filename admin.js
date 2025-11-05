// admin.js — Full working admin dashboard with Superadmin/Staff roles
// Collections: records, users, wallet, wallet_transactions, search_logs, audit_logs, stats
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, deleteDoc, query, orderBy, startAfter, where, limit
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
  t.style.transition = "opacity .2s";
  document.body.appendChild(t);
  requestAnimationFrame(() => (t.style.opacity = 1));
  setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.remove(), 220); }, timeout);
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
    } catch { analytics = null; }

    onAuthStateChanged(auth, async (user) => {
      currentUser = user || null;
      if (!user) { window.location.href = "/dashboard.html"; return; }

      try {
        const uDoc = await getDoc(doc(db, "users", user.uid));
        if (!uDoc.exists()) { await signOut(auth); showToast("No user record found",{type:"error"}); window.location.href="/dashboard.html"; return; }

        const role = (uDoc.data().role || "user").toLowerCase();
        currentUserRole = role;
        if (role !== "superadmin" && role !== "staff") { await signOut(auth); showToast("Not authorized",{type:"error"}); window.location.href="/dashboard.html"; return; }

        $("#admin-role").textContent = role;
        setupBindings();
        await loadInitialData();
      } catch (err) { console.error(err); showToast("Role check failed",{type:"error"}); await signOut(auth); window.location.href="/dashboard.html"; }
    });
  } catch (err) { console.error(err); showToast("Firebase init failed",{type:"error"}); }
}

// -------------------- SIGN OUT --------------------
async function doSignOut() { if(!auth) return; try{ await signOut(auth); showToast("Signed out"); window.location.href="/dashboard.html"; } catch(err){ showToast("Sign out failed",{type:"error"}); } }

// -------------------- LOADERS --------------------
async function loadInitialData() {
  await Promise.all([loadStats(), loadAnalyticsUI(), loadAuditLogs(), loadUsers(), loadSearchLogs(), loadWallet()]);
}

// -------------------- STATS --------------------
async function loadStats() {
  if(!db) return;
  try{
    const [usersSnap, searchesSnap, walletSnap, txSnap] = await Promise.all([
      getDocs(collection(db,"users")),
      getDocs(collection(db,"search_logs")),
      getDocs(collection(db,"wallet")),
      getDocs(collection(db,"wallet_transactions"))
    ]);

    $("#stat-users").textContent = usersSnap.size;
    $("#stat-searches").textContent = searchesSnap.size;
    $("#stat-transactions").textContent = txSnap.size;

    let total = 0;
    walletSnap.forEach(d=>total+=Number(d.data()?.balance||0));
    $("#stat-wallet").textContent=`$${total.toFixed(2)}`;
  } catch(err){ handlePermissionError(err,"Cannot load stats"); }
}

// -------------------- USERS / RECORDS --------------------
async function loadUsers() {
  if(!db) return;
  const tbody = $("#users-body");
  if(!tbody) return;
  tbody.innerHTML="<tr><td colspan='5'>Loading…</td></tr>";

  try {
    const snap = await getDocs(collection(db,"records"));
    tbody.innerHTML="";
    snap.forEach(s=>{
      const r=s.data();
      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td>${escapeHtml(s.id)}</td>
        <td>${escapeHtml(r.name||"—")}</td>
        <td>${escapeHtml(r.nia||"—")}</td>
        <td>${escapeHtml(r.status||"—")}</td>
        <td>${currentUserRole==="superadmin"?`<button class="delete-btn" data-id="${s.id}">Delete</button>`:""}</td>
      `;
      tbody.appendChild(tr);
      if(currentUserRole==="superadmin") tr.querySelector(".delete-btn")?.addEventListener("click", ()=>deleteRecord(s.id));
    });
  } catch(err){ console.error(err); tbody.innerHTML="<tr><td colspan='5'>Failed</td></tr>"; }
}

async function saveNewRecord() {
  const name=$("#add-name").value.trim(), nia=$("#add-nia").value.trim(), status=$("#add-status").value.trim();
  if(!name || !nia){ showToast("Name & NIA required",{type:"error"}); return; }
  try {
    await addDoc(collection(db,"records"),{name,nia,status});
    showToast("Record added");
    $("#modal-add-user").style.display="none";
    loadUsers();
  } catch(err){ console.error(err); showToast("Cannot add record",{type:"error"}); }
}

async function deleteRecord(id) {
  try { await deleteDoc(doc(db,"records",id)); showToast("Record deleted"); loadUsers(); }
  catch(err){ console.error(err); showToast("Cannot delete record",{type:"error"}); }
}

// -------------------- SEARCH LOGS --------------------
async function loadSearchLogs() {
  if(!db) return;
  const tbody=$("#searchlogs-body");
  if(!tbody) return;
  tbody.innerHTML="<tr><td colspan='4'>Loading…</td></tr>";

  try {
    const snap=await getDocs(query(collection(db,"search_logs"),orderBy("timestamp","desc"),limit(100)));
    tbody.innerHTML="";
    snap.forEach(d=>{
      const row=d.data();
      const date=row.timestamp?.seconds?new Date(row.timestamp.seconds*1000).toLocaleString():"";
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${escapeHtml(date)}</td><td>${escapeHtml(row.user||"—")}</td><td>${escapeHtml(row.query||"—")}</td><td>${escapeHtml(JSON.stringify(row.result||{}))}</td>`;
      tbody.appendChild(tr);
    });
  } catch(err){ handlePermissionError(err,"Cannot load search logs"); }
}

// -------------------- WALLET --------------------
async function loadWallet() {
  if(!db) return;
  const body=$("#wallet-body"), txBody=$("#wallettx-body");
  if(!body||!txBody) return;
  body.innerHTML=txBody.innerHTML="<tr><td colspan='2'>Loading…</td></tr>";

  try {
    const [walletSnap, txSnap]=await Promise.all([
      getDocs(collection(db,"wallet")),
      getDocs(query(collection(db,"wallet_transactions"),orderBy("timestamp","desc"),limit(200)))
    ]);

    body.innerHTML="";
    walletSnap.forEach(s=>{
      const d=s.data();
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${escapeHtml(s.id)}</td><td>$${Number(d.balance||0).toFixed(2)}</td>`;
      body.appendChild(tr);
    });

    txBody.innerHTML="";
    txSnap.forEach(t=>{
      const x=t.data();
      const date=x.timestamp?.seconds?new Date(x.timestamp.seconds*1000).toLocaleString():"";
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${escapeHtml(date)}</td><td>${escapeHtml(x.user||"—")}</td><td>${escapeHtml(x.type||"—")}</td><td>$${Number(x.amount||0).toFixed(2)}</td>`;
      txBody.appendChild(tr);
    });
  } catch(err){ handlePermissionError(err,"Cannot load wallet"); }
}

// -------------------- VERIFY --------------------
async function adminVerify(mode) {
  const input=$("#verify-input"), output=$("#verify-output");
  if(!input || !output) return;
  const raw=input.value.trim();
  if(!raw){ showToast("Enter value",{type:"error"}); return; }
  output.innerHTML="<div>Loading…</div>";

  let field="name";
  if(mode==="id") field="nia";
  if(mode==="phone") field="phone";
  if(mode==="email") field="email";

  try{
    const snap=await getDocs(query(collection(db,"records"),where(field,"==",raw),limit(1)));
    if(snap.empty){ output.innerHTML="<div style='color:#b00020'>No match found</div>"; return; }
    const rec=snap.docs[0].data();
    output.innerHTML=`<div class="verify-card">
      <div><strong>Name:</strong> ${escapeHtml(rec.name||"—")}</div>
      <div><strong>NIA:</strong> ${escapeHtml(rec.nia||"—")}</div>
      <div><strong>Status:</strong> ${escapeHtml(rec.status||"—")}</div>
      <div><strong>Region:</strong> ${escapeHtml(rec.region||"—")}</div>
      <div><strong>DOB:</strong> ${escapeHtml(rec.dob||"—")}</div>
      <div><strong>Criminal:</strong> ${escapeHtml(rec.criminal||"—")}</div>
    </div>`;
  } catch(err){ console.error(err); showToast("Verification failed",{type:"error"}); output.innerHTML="<div style='color:#b00020'>Error verifying</div>"; }
}

// -------------------- AUDIT LOGS --------------------
async function loadAuditLogs() {
  if(!db) return;
  const tbody=$("#audit-logs-body");
  if(!tbody) return;
  tbody.innerHTML="<tr><td colspan='4'>Loading…</td></tr>";

  try{
    const snap=await getDocs(query(collection(db,"audit_logs"),orderBy("timestamp","desc"),limit(100)));
    tbody.innerHTML="";
    snap.forEach(d=>{
      const row=d.data();
      const date=row.timestamp?.seconds?new Date(row.timestamp.seconds*1000).toLocaleString():"";
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${escapeHtml(date)}</td><td>${escapeHtml(row.user||"—")}</td><td>${escapeHtml(row.action||"—")}</td><td>${escapeHtml(JSON.stringify(row.meta||{}))}</td>`;
      tbody.appendChild(tr);
    });
  } catch(err){ handlePermissionError(err,"Cannot load audit logs"); }
}

// -------------------- ANALYTICS --------------------
async function loadAnalyticsUI() {
  const el=$("#analytics-status");
  if(!el) return;
  el.textContent = analytics?"Analytics active ✓":"Analytics not active.";
}

// -------------------- UI BINDINGS --------------------
function setupBindings(){
  $("#btn-logout")?.addEventListener("click", doSignOut);
  $("#btn-add-user")?.addEventListener("click", ()=>$("#modal-add-user").style.display="flex");
  $("#btn-cancel-user")?.addEventListener("click", ()=>$("#modal-add-user").style.display="none");
  $("#btn-save-user")?.addEventListener("click", saveNewRecord);

  $("#btn-verify-name")?.addEventListener("click", ()=>adminVerify("name"));
  $("#btn-verify-id")?.addEventListener("click", ()=>adminVerify("id"));
  $("#btn-verify-phone")?.addEventListener("click", ()=>adminVerify("phone"));
  $("#btn-verify-email")?.addEventListener("click", ()=>adminVerify("email"));

  if(currentUserRole==="staff") document.querySelectorAll(".admin-only,.delete-btn").forEach(el=>el.style.display="none");

  const tabs=["dashboard","verify","users","wallet","logs","audit"];
  tabs.forEach(tab=>$("#tab-"+tab)?.addEventListener("click",()=>showSection(tab)));
  window.onclick=e=>{if(e.target===$("#modal-add-user")) $("#modal-add-user").style.display="none";};
}

function showSection(section){
  ["dashboard","verify","users","wallet","logs","audit"].forEach(sec=>$("#section-"+sec)?.classList.remove("active"));
  $("#section-"+section)?.classList.add("active");
}

// -------------------- DOM READY --------------------
document.addEventListener("DOMContentLoaded",()=>{
  setupBindings();
  initFirebase();
});

// -------------------- EXPORTS --------------------
window.admin={
  initFirebase, doSignOut, loadStats, loadUsers, loadSearchLogs,
  loadWallet, loadAuditLogs, loadAnalyticsUI, adminVerify, saveNewRecord, deleteRecord
};
