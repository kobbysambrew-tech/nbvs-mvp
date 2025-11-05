// admin.js — Modern Admin Dashboard with full CRUD + Verify + Wallet + Logs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, deleteDoc,
  query, orderBy, limit, startAfter, where
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
let app=null, auth=null, db=null, analytics=null;
let currentUser=null, currentUserRole=null;

// -------------------- HELPERS --------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
function showToast(msg, {type="info", timeout=4000}={}) {
  const t = document.createElement("div");
  t.textContent=msg;
  t.style.position="fixed"; t.style.right="16px"; t.style.bottom="16px";
  t.style.background=type==="error"?"#b00020":"#111"; t.style.color="#fff";
  t.style.padding="10px 14px"; t.style.borderRadius="8px"; t.style.zIndex=9999;
  t.style.opacity=0; t.style.transition=".18s";
  document.body.appendChild(t);
  requestAnimationFrame(()=>t.style.opacity=1);
  setTimeout(()=>{ t.style.opacity=0; setTimeout(()=>t.remove(),220); }, timeout);
}
function escapeHtml(s=""){return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
function handlePermissionError(err,friendly){console.warn("Permission error:",err); showToast(friendly||"Permission problem (see console)",{type:"error",timeout:6000});}

// -------------------- INIT FIREBASE --------------------
export async function initFirebase(){
  try{
    app=initializeApp(firebaseConfig);
    auth=getAuth(app);
    db=getFirestore(app);
    try{ if(await analyticsSupported()) analytics=getAnalytics(app); } catch(e){ analytics=null; }

    onAuthStateChanged(auth, async (user)=>{
      currentUser=user||null;
      if(!user) return window.location.href="/dashboard.html";

      try{
        const uDoc=await getDoc(doc(db,"users",user.uid));
        if(!uDoc.exists()){ await signOut(auth); return window.location.href="/dashboard.html"; }
        currentUserRole=(uDoc.data().role||"user").toLowerCase();
        if(!["superadmin","staff"].includes(currentUserRole)){ await signOut(auth); return window.location.href="/dashboard.html"; }
        $("#admin-role").textContent=currentUserRole||"";
        setupBindings(); await loadInitialData();
      }catch(err){ console.error("Role check failed",err); showToast("Role check failed",{type:"error"}); await signOut(auth).catch(()=>{}); window.location.href="/dashboard.html"; }
    });
    return {app, auth, db, analytics};
  }catch(err){ console.error("initFirebase failed:",err); showToast("Firebase init failed",{type:"error"}); }
}

// -------------------- SIGN OUT --------------------
export async function doSignOut(){ try{ await signOut(auth); showToast("Signed out"); window.location.href="/dashboard.html"; } catch(e){ console.error("Sign out failed",e); showToast("Sign out failed",{type:"error"}); } }

// -------------------- UI & TAB BINDINGS --------------------
function setupBindings(){
  $("#btn-logout")?.addEventListener("click",()=>doSignOut());

  const tabs=[
    {btn:"#tab-dashboard", sec:"#section-dashboard", fn:loadStats},
    {btn:"#tab-verify", sec:"#section-verify"},
    {btn:"#tab-users", sec:"#section-users", fn:loadUsers},
    {btn:"#tab-logs", sec:"#section-logs", fn:loadSearchLogs},
    {btn:"#tab-wallet", sec:"#section-wallet", fn:loadWallet},
    {btn:"#tab-audit", sec:"#section-audit", fn:loadAuditLogs}
  ];
  function showSection(secId){ tabs.forEach(t=>$(t.sec).style.display=t.sec===secId?"block":"none"); tabs.forEach(t=>$(t.btn).classList.toggle("active",t.sec===secId)); }
  tabs.forEach(t=>$(t.btn)?.addEventListener("click",()=>{showSection(t.sec); t.fn?.();}));

  // Verify buttons
  $("#btn-verify-name")?.addEventListener("click",()=>adminVerify("name"));
  $("#btn-verify-id")?.addEventListener("click",()=>adminVerify("id"));
  $("#btn-verify-phone")?.addEventListener("click",()=>adminVerify("phone"));
  $("#btn-verify-email")?.addEventListener("click",()=>adminVerify("email"));

  // Add Record Modal
  const modal=$("#modal-add-user");
  const btnAdd=$("#btn-add-user");
  const btnCancel=$("#btn-cancel-user");
  btnAdd.onclick=()=>{ modal.style.display="flex"; };
  btnCancel.onclick=()=>{ modal.style.display="none"; };
  window.onclick=(e)=>{ if(e.target===modal) modal.style.display="none"; };

  $("#btn-save-user")?.addEventListener("click", async ()=>{
    const data={
      name: $("#add-name").value.trim(),
      nia: $("#add-nia").value.trim(),
      dob: $("#add-dob").value,
      region: $("#add-region").value.trim(),
      status: $("#add-status").value,
      criminal: $("#add-criminal").value.trim()
    };
    if(!data.name || !data.nia){ return showToast("Name and NIA required",{type:"error"}); }
    try{ await addDoc(collection(db,"records"), data); showToast("Record added"); modal.style.display="none"; loadUsers(); } 
    catch(err){ handlePermissionError(err,"Cannot add record"); }
  });

  // Staff restrictions
  if(currentUserRole==="staff") document.querySelectorAll(".admin-only").forEach(e=>e.style.display="none");
}

// -------------------- INITIAL LOAD --------------------
async function loadInitialData(){ await Promise.all([loadStats(), loadAnalyticsUI(), loadAuditLogs()]); }

// -------------------- VERIFY --------------------
export async function adminVerify(mode){
  const input=$("#verify-input"), output=$("#verify-output");
  if(!input||!output) return showToast("Verify UI missing",{type:"error"});
  const raw=input.value.trim(); if(!raw) return showToast("Enter name or ID",{type:"error"});
  output.innerHTML=`<div class="loader-sm">Loading…</div>`;
  try{
    let field=mode==="id"?"nia":mode==="phone"?"phone":mode==="email"?"email":"name";
    const q=query(collection(db,"records"), where(field,"==",raw), limit(1));
    const snap=await getDocs(q);
    if(snap.empty){ output.innerHTML=`<div style="color:#b00020">No match found</div>`; return; }
    const r=snap.docs[0].data();
    output.innerHTML=`
      <div class="verify-card">
        <div><strong>Name:</strong>${escapeHtml(r.name||"—")}</div>
        <div><strong>NIA:</strong>${escapeHtml(r.nia||"—")}</div>
        <div><strong>Status:</strong>${escapeHtml(r.status||"—")}</div>
        <div><strong>Region:</strong>${escapeHtml(r.region||"—")}</div>
        <div><strong>DOB:</strong>${escapeHtml(r.dob||"—")}</div>
        <div><strong>Criminal:</strong>${escapeHtml(r.criminal||"—")}</div>
      </div>`;
  }catch(err){ handlePermissionError(err,"Cannot verify"); output.innerHTML=`<div style="color:#b00020">Error verifying</div>`; }
}

// -------------------- USERS --------------------
export async function loadUsers(){
  if(!db) return;
  const tbody=$("#users-body"); if(!tbody) return;
  tbody.innerHTML=`<tr><td colspan="5">Loading…</td></tr>`;
  try{
    const snap=await getDocs(collection(db,"records"));
    tbody.innerHTML="";
    snap.forEach(s=>{
      const r=s.data();
      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td>${escapeHtml(s.id)}</td>
        <td>${escapeHtml(r.name||"—")}</td>
        <td>${escapeHtml(r.nia||"—")}</td>
        <td>${escapeHtml(r.status||"—")}</td>
        <td>
          ${currentUserRole==="superadmin"?`<button class="btn delete" data-id="${s.id}">Delete</button>`:""}
        </td>`;
      tbody.appendChild(tr);
    });
    // Attach delete event
    $$("button.delete").forEach(btn=>{
      btn.onclick=async ()=>{ 
        const id=btn.dataset.id;
        if(confirm("Delete this record?")){ try{ await deleteDoc(doc(db,"records",id)); showToast("Record deleted"); loadUsers(); } catch(err){ handlePermissionError(err,"Cannot delete"); } }
      };
    });
  }catch(err){ handlePermissionError(err,"Cannot load records"); tbody.innerHTML=`<tr><td colspan="5">Failed to load records</td></tr>`; }
}

// -------------------- SEARCH LOGS --------------------
export async function loadSearchLogs(){
  if(!db) return;
  const tbody=$("#searchlogs-body"); if(!tbody) return;
  tbody.innerHTML=`<tr><td colspan="4">Loading…</td></tr>`;
  try{
    const snap=await getDocs(query(collection(db,"search_logs"), orderBy("timestamp","desc"), limit(100)));
    tbody.innerHTML="";
    snap.forEach(d=>{
      const row=d.data();
      const date=row.timestamp?.seconds?new Date(row.timestamp.seconds*1000).toLocaleString():"";
      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td>${escapeHtml(date)}</td>
                <td>${escapeHtml(row.user||"—")}</td>
        <td>${escapeHtml(row.query||"—")}</td>
        <td>${escapeHtml(JSON.stringify(row.result||{}))}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch(err){ handlePermissionError(err,"Cannot load search logs"); }
}

// -------------------- WALLET & TRANSACTIONS --------------------
export async function loadWallet(){
  if(!db) return;
  const body=$("#wallet-body"); const txBody=$("#wallettx-body");
  if(!body||!txBody) return;

  body.innerHTML=`<tr><td colspan="3">Loading…</td></tr>`;
  txBody.innerHTML=`<tr><td colspan="4">Loading…</td></tr>`;

  try{
    const [walletSnap, txSnap]=await Promise.all([
      getDocs(collection(db,"wallet")),
      getDocs(query(collection(db,"wallet_transactions"), orderBy("timestamp","desc"), limit(200)))
    ]);

    body.innerHTML="";
    walletSnap.forEach(s=>{
      const d=s.data();
      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td>${escapeHtml(s.id)}</td>
        <td>$${Number(d.balance||0).toFixed(2)}</td>
        <td>${currentUserRole==="superadmin"?`<button class="btn delete" data-id="${s.id}">Delete</button>`:""}</td>
      `;
      body.appendChild(tr);
    });

    txBody.innerHTML="";
    txSnap.forEach(t=>{
      const x=t.data();
      const date=x.timestamp?.seconds?new Date(x.timestamp.seconds*1000).toLocaleString():"";
      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td>${escapeHtml(date)}</td>
        <td>${escapeHtml(x.user||"—")}</td>
        <td>${escapeHtml(x.type||"—")}</td>
        <td>$${Number(x.amount||0).toFixed(2)}</td>
      `;
      txBody.appendChild(tr);
    });
  } catch(err){ handlePermissionError(err,"Cannot load wallet"); }
}

// -------------------- STATS --------------------
export async function loadStats(){
  if(!db) return;
  try{
    const [usersSnap, searchesSnap, walletSnap, txSnap]=await Promise.all([
      getDocs(collection(db,"users")),
      getDocs(collection(db,"search_logs")),
      getDocs(collection(db,"wallet")),
      getDocs(collection(db,"wallet_transactions"))
    ]);

    $("#stat-users").textContent=usersSnap.size;
    $("#stat-searches").textContent=searchesSnap.size;
    $("#stat-transactions").textContent=txSnap.size;

    let total=0;
    walletSnap.forEach(d=>{ total+=Number(d.data()?.balance||0); });
    $("#stat-wallet").textContent=`$${total.toFixed(2)}`;
  } catch(err){ handlePermissionError(err,"Cannot load stats"); }
}

// -------------------- AUDIT LOGS --------------------
const auditState={pageSize:50,lastSnapshot:null,loading:false,finished:false};
export async function loadAuditLogs(reset=false){
  if(!db||auditState.loading) return;
  if(reset){ auditState.lastSnapshot=null; auditState.finished=false; }
  if(auditState.finished) return;

  auditState.loading=true;
  try{
    let q=query(collection(db,"audit_logs"), orderBy("timestamp","desc"), limit(auditState.pageSize));
    if(auditState.lastSnapshot) q=query(collection(db,"audit_logs"), orderBy("timestamp","desc"), startAfter(auditState.lastSnapshot), limit(auditState.pageSize));
    const snap=await getDocs(q);
    if(snap.empty){ auditState.finished=true; return; }
    auditState.lastSnapshot=snap.docs[snap.docs.length-1];
    const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderAuditRows(rows);
    if(snap.docs.length<auditState.pageSize) auditState.finished=true;
  }catch(err){ handlePermissionError(err,"Cannot load audit logs"); }
  finally{ auditState.loading=false; }
}
function renderAuditRows(rows){
  const tbody=$("#audit-logs-body");
  if(!tbody) return;
  rows.forEach(r=>{
    const tr=document.createElement("tr");
    const ts=r.timestamp?.seconds?new Date(r.timestamp.seconds*1000).toLocaleString():r.timestamp||"";
    tr.innerHTML=`
      <td>${escapeHtml(ts)}</td>
      <td>${escapeHtml(r.user||"")}</td>
      <td>${escapeHtml(r.action||"")}</td>
      <td>${escapeHtml(JSON.stringify(r.meta||{}))}</td>
    `;
    tbody.appendChild(tr);
  });
}

// -------------------- ANALYTICS --------------------
export async function loadAnalyticsUI(){
  const el=$("#analytics-status");
  if(!el) return;
  try{ el.textContent=analytics?"Analytics active ✓":"Analytics not active."; }
  catch(err){ console.error(err); el.textContent="Analytics error"; }
}

// -------------------- DOM READY --------------------
document.addEventListener("DOMContentLoaded", ()=>{
  if(document.body.matches("[data-admin-page]")) initFirebase().catch(console.error);
});

