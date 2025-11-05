// admin.js — Modern Admin Dashboard
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs,
  query, orderBy, limit, startAfter, where, addDoc, deleteDoc
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
let app=null, auth=null, db=null, analytics=null, currentUser=null, currentUserRole=null;

// -------------------- HELPERS --------------------
const $ = (sel)=>document.querySelector(sel);
function showToast(msg,{type="info",timeout=4000}={}){ const t=document.createElement("div"); t.textContent=msg; t.style.cssText="position:fixed;right:16px;bottom:16px;background:"+(type==="error"?"#b00020":"#111")+";color:#fff;padding:10px 14px;border-radius:8px;z-index:9999;opacity:0;transition:opacity .2s"; document.body.appendChild(t); requestAnimationFrame(()=>t.style.opacity=1); setTimeout(()=>{t.style.opacity=0; setTimeout(()=>t.remove(),220)},timeout); }
function escapeHtml(s=""){ return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function handlePermissionError(err,friendly){ console.warn("Permission error:",err); showToast(friendly||"Permission problem", {type:"error", timeout:6000}); }

// -------------------- FIREBASE INIT --------------------
async function initFirebase(){
  app=initializeApp(firebaseConfig);
  auth=getAuth(app);
  db=getFirestore(app);
  try{ if(await analyticsSupported()) analytics=getAnalytics(app);}catch(e){analytics=null;}
  onAuthStateChanged(auth,async(user)=>{
    currentUser=user||null;
    if(!user){ window.location.href="/dashboard.html"; return; }
    try{
      const uDoc=await getDoc(doc(db,"users",user.uid));
      if(!uDoc.exists()){ await signOut(auth); showToast("No user record", {type:"error"}); window.location.href="/dashboard.html"; return; }
      const role=(uDoc.data().role||"user").toLowerCase();
      currentUserRole=role;
      if(role!=="superadmin" && role!=="staff"){ await signOut(auth); showToast("Not authorized", {type:"error"}); window.location.href="/dashboard.html"; return; }
      $("#admin-role").textContent=role;
      setupBindings();
      await loadInitialData();
    }catch(err){ console.error(err); showToast("Role check failed", {type:"error"}); await signOut(auth); window.location.href="/dashboard.html"; }
  });
}

// -------------------- SIGN OUT --------------------
async function doSignOut(){ if(!auth) return; try{ await signOut(auth); showToast("Signed out"); window.location.href="/dashboard.html"; }catch(e){ showToast("Sign out failed",{type:"error"});} }

// -------------------- BINDINGS --------------------
function setupBindings(){
  $("#btn-logout").onclick=doSignOut;

  // Tabs
  const tabs=["dashboard","verify","users","wallet","logs","audit"];
  tabs.forEach(t=>{
    $("#tab-"+t).onclick=()=>{ showSection(t); if(t==="dashboard") loadStats(); if(t==="users") loadUsers(); if(t==="wallet") loadWallet(); if(t==="logs") loadSearchLogs(); if(t==="audit") loadAuditLogs(); };
  });

  // Verify buttons
  $("#btn-verify-name").onclick=()=>adminVerify("name");
  $("#btn-verify-id").onclick=()=>adminVerify("id");
  $("#btn-verify-phone").onclick=()=>adminVerify("phone");
  $("#btn-verify-email").onclick=()=>adminVerify("email");

  // Add record modal
  const modal=$("#modal-add-user"), btnAdd=$("#btn-add-user"), btnCancel=$("#btn-cancel-user"), btnSave=$("#btn-save-user");
  if(btnAdd) btnAdd.onclick=()=>{ modal.style.display="flex"; };
  if(btnCancel) btnCancel.onclick=()=>{ modal.style.display="none"; };
  if(btnSave) btnSave.onclick=saveNewRecord;

  // Close modal on click outside
  window.onclick=(e)=>{ if(e.target===modal) modal.style.display="none"; };

  // Staff restrictions
  if(currentUserRole==="staff"){ document.querySelectorAll(".admin-only, .btn.delete").forEach(el=>el.style.display="none"); }
}
function showSection(sec){ ["dashboard","verify","users","wallet","logs","audit"].forEach(s=>$("#section-"+s).style.display=s===sec?"block":"none"); $("#tab-"+sec).classList.add("active"); tabs.forEach(t=>{ if(t!==sec) $("#tab-"+t).classList.remove("active"); }); }

// -------------------- INITIAL LOAD --------------------
async function loadInitialData(){ await Promise.all([loadStats(), loadAnalyticsUI(), loadAuditLogs()]); }

// -------------------- VERIFY --------------------
async function adminVerify(mode){
  const input=$("#verify-input"), output=$("#verify-output");
  if(!input||!output) return;
  const raw=input.value.trim(); if(!raw){ showToast("Enter value",{type:"error"}); return; }
  output.innerHTML="<div>Loading…</div>";
  try{
    let field="name"; if(mode==="id") field="nia"; else if(mode==="phone") field="phone"; else if(mode==="email") field="email";
    const snap=await getDocs(query(collection(db,"records"),where(field,"==",raw),limit(1)));
    if(snap.empty){ output.innerHTML=`<div style="color:#b00020">No match found</div>`; return; }
    const rec=snap.docs[0].data();
    output.innerHTML=`<div class="verify-card">
      <div><strong>Name:</strong> ${escapeHtml(rec.name||"—")}</div>
      <div><strong>NIA:</strong> ${escapeHtml(rec.nia||"—")}</div>
      <div><strong>Status:</strong> ${escapeHtml(rec.status||"—")}</div>
      <div><strong>Region:</strong> ${escapeHtml(rec.region||"—")}</div>
      <div><strong>DOB:</strong> ${escapeHtml(rec.dob||"—")}</div>
      <div><strong>Criminal:</strong> ${escapeHtml(rec.criminal||"—")}</div>
    </div>`;
  }catch(err){ handlePermissionError(err,"Cannot verify"); output.innerHTML="<div style='color:#b00020'>Error verifying</div>"; }
}
window.adminVerify=adminVerify;

// -------------------- USERS / RECORDS --------------------
async function loadUsers(){
  if(!db) return;
  const tbody=$("#users-body"); if(!tbody) return; tbody.innerHTML="<tr><td colspan='5'>Loading…</td></tr>";
  try{
    const snap=await getDocs(collection(db,"records")); tbody.innerHTML="";
    snap.forEach(s=>{
      const r=s.data();
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${escapeHtml(s.id)}</td><td>${escapeHtml(r.name||"—")}</td><td>${escapeHtml(r.nia||"—")}</td><td>${escapeHtml(r.status||"—")}</td>
        <td>${currentUserRole==="superadmin"?`<button class="btn delete" data-id="${s.id}">Delete</button>`:""}</td>`;
      tbody.appendChild(tr);
      if(currentUserRole==="superadmin") tr.querySelector(".btn.delete").onclick=()=>deleteRecord(s.id);
    });
  }catch(err){ handlePermissionError(err,"Cannot load records"); tbody.innerHTML="<tr><td colspan='5'>Failed</td></tr>"; }
}

async function saveNewRecord(){
  const name=$("#add-name").value.trim(), nia=$("#add-nia").value.trim(), dob=$("#add-dob").value, region=$("#add-region").value.trim(), status=$("#add-status").value, criminal=$("#add-criminal").value.trim();
  if(!name||!nia){ showToast("Name & NIA required",{type:"error"}); return; }
  try{ await addDoc(collection(db,"records"),{name,nia,dob,region,status,criminal}); showToast("Record added"); $("#modal-add-user").style.display="none"; loadUsers(); }catch(err){ handlePermissionError(err,"Cannot add record"); }
}

async function deleteRecord(id){ try{ await deleteDoc(doc(db,"records",id)); showToast("Record deleted"); loadUsers(); }catch(err){ handlePermissionError(err,"Cannot delete record"); } }

// -------------------- WALLET --------------------
async function loadWallet(){
  if(!db) return;
  const body=$("#wallet-body"), txBody=$("#wallettx-body"); if(!body||!txBody) return;
  body.innerHTML="<tr><td colspan='3'>Loading…</td></tr>"; txBody.innerHTML="<tr><td colspan='4'>Loading…</td></tr>";
  try{
    const [walletSnap, txSnap]=await Promise.all([getDocs(collection(db,"wallet")), getDocs(query(collection(db,"wallet_transactions"),orderBy("timestamp","desc"),limit(200)))]);
    body.innerHTML=""; walletSnap.forEach(s=>{
      const d=s.data(); const tr=document.createElement("tr");
      tr.innerHTML=`<td>${escapeHtml(s.id)}</td><td>$${Number(d.balance||0).toFixed(2)}</td>${currentUserRole==="superadmin"?`<td><button class="btn delete" data-id="${s.id}">Delete</button></td>`:""}`;
      body.appendChild(tr);
    });
    txBody.innerHTML=""; txSnap.forEach(t=>{
      const x=t.data(), date=x.timestamp?.seconds?new Date(x.timestamp.seconds*1000).toLocaleString():"";
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${escapeHtml(date)}</td><td>${escapeHtml(x.user||"—")}</td><td>${escapeHtml(x.type||"—")}</td><td>$${Number(x.amount||0).toFixed(2)}</td>`;
      txBody.appendChild(tr);
    });
  }catch(err){ handlePermissionError(err,"Cannot load wallet"); }
}

// -------------------- STATS --------------------
async function loadStats(){
  if(!db) return;
  try{
    const [usersSnap, searchesSnap, walletSnap, txSnap]=await Promise.all([getDocs(collection(db,"users")), getDocs(collection(db,"search_logs")), getDocs(collection(db,"wallet")), getDocs(collection(db,"wallet_transactions"))]);
    $("#stat-users").textContent=usersSnap.size; $("#stat-searches").textContent=searchesSnap.size; $("#stat-transactions").textContent=txSnap.size;
    let total=0; walletSnap.forEach(d=>{ total+=Number(d.data()?.balance||0); }); $("#stat-wallet").textContent=`$${total.toFixed(2)}`;
  }catch(err){ handlePermissionError(err,"Cannot load stats"); }
}

// -------------------- SEARCH LOGS --------------------
async function loadSearchLogs(){
  if(!db) return;
  const tbody=$("#searchlogs-body"); if(!tbody) return; tbody.innerHTML="<tr><td colspan='4'>Loading…</td></tr>";
  try{
    const snap=await getDocs(query(collection(db,"search_logs"),orderBy("timestamp","desc"),limit(100))); tbody.innerHTML="";
    snap.forEach(d=>{
      const row=d.data(), date=row.timestamp?.seconds?new Date(row.timestamp.seconds*1000).toLocaleString():"";
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${escapeHtml(date)}</td><td>${escapeHtml(row.user||"—")}</td><td>${escapeHtml(row.query||"—")}</td><td>${escapeHtml(JSON.stringify(row.result||{}))}</td>`;
      tbody.appendChild(tr);
    });
  }catch(err){ handlePermissionError(err,"Cannot load search logs"); }
}

// -------------------- AUDIT LOGS --------------------
const auditState={pageSize:50,lastSnapshot:null,loading:false,finished:false};
async function loadAuditLogs(reset=false){
  if(!db||auditState.loading) return;
  if(reset){ auditState.lastSnapshot=null; auditState.finished=false; }
  if(auditState.finished) return;
  auditState.loading=true;
  try{
    let q=query(collection(db,"audit_logs"), orderBy("timestamp","desc"), limit(auditState.pageSize));
    if(auditState.lastSnapshot) q=query(collection(db,"audit_logs"), orderBy("timestamp","desc"), startAfter(auditState.lastSnapshot), limit(auditState.pageSize));
    const snap=await getDocs(q); if(snap.empty){ auditState.finished=true; return; }
    auditState.lastSnapshot=snap.docs[snap.docs.length-1]; const rows=snap.docs.map(d=>({id:d.id,...d.data()})); renderAuditRows(rows);
    if(snap.docs.length<auditState.pageSize) auditState.finished=true;
  }catch(err){ handlePermissionError(err,"Cannot load audit logs"); } finally{ auditState.loading=false; }
}
function renderAuditRows(rows){
  const tbody=$("#audit-logs-body"); if(!tbody) return;
  rows.forEach(r=>{
    const tr=document.createElement("tr");
    const ts=r.timestamp?.seconds?new Date(r.timestamp.seconds*1000).toLocaleString():r.timestamp||"";
    tr.innerHTML=`<td>${escapeHtml(ts)}</td><td>${escapeHtml(r.user||"")}</td><td>${escapeHtml(r.action||"")}</td><td>${escapeHtml(JSON.stringify(r.meta||{}))}</td>`;
    tbody.appendChild(tr);
  });
}

// -------------------- ANALYTICS --------------------
async function loadAnalyticsUI(){ const el=$("#analytics-status"); if(!el) return; try{ el.textContent=analytics?"Analytics active ✓":"Analytics not active."; }catch(err){ el.textContent="Analytics error"; } }

// -------------------- DOM READY --------------------
document.addEventListener("DOMContentLoaded",()=>{ if(document.body.matches("[data-admin-page]")) initFirebase().catch(console.error); });

// -------------------- EXPORTS --------------------
window.admin={ initFirebase, doSignOut, loadStats, loadUsers, loadSearchLogs, loadWallet, loadAuditLogs, loadAnalyticsUI, adminVerify };
