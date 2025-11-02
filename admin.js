// admin.js — patched: DOMContentLoaded safe + defensive checks + audit
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-app.js";
import {
  getFirestore, collection, collectionGroup, doc, addDoc, getDocs, getDoc,
  updateDoc, deleteDoc, query, orderBy, limit, startAfter, startAt, where
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

/* ========== FIREBASE CONFIG ========== */
const firebaseConfig = {
  apiKey:"AIzaSyCDh_qL3jiCMHROK0_Soul2Wsv3t3y4wv0",
  authDomain:"nbvs-ghana.firebaseapp.com",
  projectId:"nbvs-ghana",
  storageBucket:"nbvs-ghana.firebasestorage.app",
  messagingSenderId:"702636577113",
  appId:"1:702636577113:web:8369b43a2aa43aeb95fc48"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ========== REFS & STATE ========== */
const recordsRef = collection(db, "records");
const logsRef = collection(db, "search_logs");
const PAGE_SIZE = 10;

let lastVisible = null;
let firstVisible = null;
let currentPage = 1;
let currentSnapshot = [];
let selectedIds = new Set();
let activeFilter = "ALL";
let activeSearch = "";

/* Audit UI */
let auditBodyEl = null; // set later

/* ========== ADMIN USER ========== */
const ADMIN_USER = "Aubrey";

/* ========== HELPERS ========== */
function toCSVRow(arr){ return arr.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(","); }
function parseCSV(text){
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l=>l.length);
  return lines.map(line=>{
    const regex = /,(?=(?:[^"]*"[^"]*")*[^"]*$)/;
    return line.split(regex).map(p => p.replace(/^"|"$/g,""));
  });
}
function escapeHtml(str){ return String(str ?? "").replace(/[&<>"']/g, s=>({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"':'&quot;', "'":'&#39;' }[s])); }
async function sha256Hex(input) {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2,'0')).join('');
}

/* ========== AUDIT LOGIC ========== */
function auditCollectionForDate(dateKey){ return collection(db, "audit_logs", dateKey, "events"); }

async function getLastEventHash(dateKey){
  try{
    const q = query(auditCollectionForDate(dateKey), orderBy("timestamp","desc"), limit(1));
    const snap = await getDocs(q);
    if(snap.empty) return "";
    return snap.docs[0].data().hash || "";
  } catch(err){
    console.error("getLastEventHash error", err);
    return "";
  }
}

async function appendAudit(event){
  try{
    const now = new Date();
    const timestamp = now.toISOString();
    const dateKey = timestamp.slice(0,10);

    const payload = {
      action: event.action,
      admin: ADMIN_USER,
      targetId: event.targetId ?? null,
      details: event.details ?? "",
      meta: event.meta ?? null,
      timestamp
    };

    const prev = await getLastEventHash(dateKey);
    const hashInput = prev + JSON.stringify(payload);
    const hash = await sha256Hex(hashInput);

    await addDoc(auditCollectionForDate(dateKey), { ...payload, prevHash: prev, hash });

    return true;
  } catch(err){
    console.error("appendAudit error", err);
    return false;
  }
}

/* ========== MAIN: run after DOM ready ========== */
document.addEventListener("DOMContentLoaded", () => {
  try {
    // DOM shortcuts (safe)
    const recordsTable = document.getElementById("recordsTable");
    const analyticsBody = document.getElementById("analyticsBody");
    const totalLogsEl = document.getElementById("totalLogs");
    const totalRecordsEl = document.getElementById("totalRecords");
    const panelImport = document.getElementById("panelImport");
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const sidebar = document.getElementById("sidebar");
    const themeBtn = document.getElementById("themeBtn");

    // quick null guards
    if(!recordsTable) console.warn("Warning: #recordsTable not found");
    if(!panelImport) console.warn("Warning: #panelImport not found");

    // helper wrappers that reference DOM elements above
    function setActiveNav(id){
      document.querySelectorAll("#nav button").forEach(b=>b.classList.remove("active"));
      const el = document.getElementById(id);
      if(el) el.classList.add("active");
    }

    window.showSection = function(name){
      const map = {
        records: "navRecords",
        analytics: "navAnalytics",
        import: "navImport",
        wallet: "navWallet",
        audit: "navAudit"
      };
      setActiveNav(map[name] || "navRecords");

      if(name === "records"){
        const el = document.getElementById("recordsSection");
        if(el) el.scrollIntoView({behavior:"smooth"});
      } else if(name === "analytics"){
        const el = document.getElementById("analyticsSection");
        if(el) el.scrollIntoView({behavior:"smooth"});
      } else if(name === "import"){
        if(panelImport) panelImport.scrollIntoView({behavior:"smooth"});
      } else if(name === "wallet"){
        const walletBtn = document.getElementById("openWalletBtn");
        if(walletBtn) walletBtn.scrollIntoView({behavior:"smooth"});
      } else if(name === "audit"){
        const el = document.getElementById("auditSection");
        if(el) el.scrollIntoView({behavior:"smooth"});
      }

      if(window.innerWidth < 980 && sidebar) sidebar.style.transform = "translateX(-120%)";
    };

    window.logout = async function(){
      try{ await appendAudit({ action: "logout", details: "Admin logged out" }); } catch(e){ console.error(e); }
      window.location.href = "dashboard.html";
    };
    window.openWallet = function(){ window.location.href = "wallet.html"; };

    // mobile hamburger
    if(hamburgerBtn && sidebar){
      hamburgerBtn.addEventListener("click", ()=>{
        const isHidden = sidebar.style.transform === "" || sidebar.style.transform === "translateX(-120%)";
        sidebar.style.transform = isHidden ? "translateX(0)" : "translateX(-120%)";
      });
    }

    // theme toggle
    function initTheme(){
      if(localStorage.getItem("nbvs-theme")==="light") document.body.classList.add("light");
      if(themeBtn){
        themeBtn.addEventListener("click", ()=>{
          document.body.classList.toggle("light");
          if(document.body.classList.contains("light")) localStorage.setItem("nbvs-theme","light");
          else localStorage.removeItem("nbvs-theme");
        });
      }
    }

    // section observer
    function initSectionObserver(){
      try {
        const options = { root: null, rootMargin: '0px', threshold: 0.25 };
        const sectionObserver = new IntersectionObserver((entries)=>{
          entries.forEach(e=>{
            if(e.isIntersecting){
              if(e.target.id === "analyticsSection") setActiveNav("navAnalytics");
              else if(e.target.id === "recordsSection") setActiveNav("navRecords");
              else if(e.target.id === "panelImport") setActiveNav("navImport");
              else if(e.target.id === "auditSection") setActiveNav("navAudit");
            }
          });
        }, options);

        const els = [document.getElementById("recordsSection"), document.getElementById("analyticsSection"), panelImport, document.getElementById("auditSection")];
        els.forEach(el=>{ if(el) sectionObserver.observe(el); });
      } catch(err){ console.error("initSectionObserver error", err); }
    }

    /* RECORDS / RENDER logic (uses closures for DOM refs) */
    function buildQuery(direction="first"){
      let q = query(recordsRef, orderBy("name"), limit(PAGE_SIZE));
      if(activeFilter !== "ALL"){
        q = query(recordsRef, where("status","==", activeFilter), orderBy("name"), limit(PAGE_SIZE));
      }
      if(direction === "next" && lastVisible){
        q = query(recordsRef, orderBy("name"), startAfter(lastVisible), limit(PAGE_SIZE));
      }
      if(direction === "prev" && firstVisible && currentPage > 1){
        q = query(recordsRef, orderBy("name"), startAt(firstVisible), limit(PAGE_SIZE));
      }
      return q;
    }

    async function loadPage(direction="first"){
      try{
        const snap = await getDocs(buildQuery(direction));
        currentSnapshot = snap.docs;
        if(!snap.empty){
          firstVisible = snap.docs[0];
          lastVisible = snap.docs[snap.docs.length - 1];
        }
        let docs = currentSnapshot;
        if(activeSearch.trim() !== ""){
          const s = activeSearch.toLowerCase();
          docs = docs.filter(ds => {
            const d = ds.data();
            return (d.name?.toLowerCase().includes(s) || d.nia?.toLowerCase().includes(s));
          });
        }
        renderTable(docs);
        const pageInfoEl = document.getElementById("pageInfo");
        if(pageInfoEl) pageInfoEl.textContent = `Page ${currentPage}`;
      } catch(err){
        console.error("loadPage error", err);
        alert("Error loading records (see console).");
      }
    }

    function renderTable(docs){
      const recordsTableEl = document.getElementById("recordsTable");
      if(!recordsTableEl) return;
      recordsTableEl.innerHTML = "";
      selectedIds.clear();
      const selectAllEl = document.getElementById("selectAll");
      if(selectAllEl) selectAllEl.checked = false;

      docs.forEach(docSnap=>{
        const d = docSnap.data();
        const id = docSnap.id;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="width:40px"><input type="checkbox" class="rowCheckbox" data-id="${id}"></td>
          <td>${escapeHtml(d.name)}</td>
          <td>${escapeHtml(d.nia)}</td>
          <td>${escapeHtml(d.region)}</td>
          <td>${escapeHtml(d.status)}</td>
          <td>
            <button class="secondary" onclick="openEditModal('${id}')">Edit</button>
            <button style="background:var(--red);color:#fff;border:none;padding:6px 8px;border-radius:6px;cursor:pointer" onclick="deleteRecord('${id}')">Delete</button>
          </td>
        `;
        recordsTableEl.appendChild(tr);
      });

      document.querySelectorAll(".rowCheckbox").forEach(cb=>{
        cb.addEventListener("change", e=>{
          const id = e.target.dataset.id;
          if(e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
        });
      });
    }

    // Wire UI controls (safe guards for missing elements)
    const nextBtn = document.getElementById("nextPageBtn");
    const prevBtn = document.getElementById("prevPageBtn");
    const selectAllEl = document.getElementById("selectAll");
    const filterSelect = document.getElementById("filterSelect");
    const globalSearch = document.getElementById("globalSearch");
    const downloadCsvBtn = document.getElementById("downloadCsvBtn");
    const exportSelectedBtn = document.getElementById("exportSelectedBtn");
    const multiDeleteBtn = document.getElementById("multiDeleteBtn");
    const addBtn = document.getElementById("addBtn");
    const importBtn = document.getElementById("importBtn");
    const clearImportBtn = document.getElementById("clearImportBtn");
    const csvFileEl = document.getElementById("csvFile");
    const openWalletBtn = document.getElementById("openWalletBtn");

    if(nextBtn) nextBtn.addEventListener("click", ()=>{ currentPage++; loadPage("next"); });
    if(prevBtn) prevBtn.addEventListener("click", ()=>{ if(currentPage>1){ currentPage--; loadPage("prev"); }});
    if(selectAllEl) selectAllEl.addEventListener("change", e=>{
      const boxes = document.querySelectorAll(".rowCheckbox");
      selectedIds.clear();
      boxes.forEach(cb=>{ cb.checked = e.target.checked; if(e.target.checked) selectedIds.add(cb.dataset.id); });
    });
    if(filterSelect) filterSelect.addEventListener("change", e=>{ activeFilter = e.target.value; currentPage=1; loadPage(); });
    if(globalSearch) globalSearch.addEventListener("input", e=>{ activeSearch = e.target.value; loadPage(); });

    if(downloadCsvBtn) downloadCsvBtn.addEventListener("click", async ()=>{
      try{
        const snaps = await getDocs(recordsRef);
        let out = []; out.push(toCSVRow(["name","nia","dob","region","address","criminal","driving","credit","status"]));
        snaps.forEach(s=>{ const d=s.data(); out.push(toCSVRow([d.name,d.nia,d.dob,d.region,d.address,d.criminal,d.driving,d.credit,d.status])); });
        const blob=new Blob([out.join("\n")],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="nbvs-records-all.csv"; a.click();
        appendAudit({ action: "download_all_records", details: `Downloaded all records (count ${snaps.size})`, meta: { count: snaps.size } });
      }catch(err){ console.error(err); alert("Error downloading CSV"); }
    });

    if(exportSelectedBtn) exportSelectedBtn.addEventListener("click", async ()=>{
      if(selectedIds.size===0) return alert("No rows selected.");
      try{
        let out=[]; out.push(toCSVRow(["name","nia","dob","region","address","criminal","driving","credit","status"]));
        for(const id of selectedIds){ const snap = await getDoc(doc(db,"records",id)); if(snap.exists()){ const d=snap.data(); out.push(toCSVRow([d.name,d.nia,d.dob,d.region,d.address,d.criminal,d.driving,d.credit,d.status])); } }
        const blob=new Blob([out.join("\n")],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="nbvs-selected.csv"; a.click();
        appendAudit({ action: "export_selected", details: `Exported ${selectedIds.size} selected records`, meta: { ids: Array.from(selectedIds) } });
      }catch(err){ console.error(err); alert("Error exporting selected"); }
    });

    if(multiDeleteBtn) multiDeleteBtn.addEventListener("click", async ()=>{
      if(selectedIds.size===0) return alert("No rows selected.");
      if(!confirm(`Delete ${selectedIds.size} selected records?`)) return;
      const ids = Array.from(selectedIds);
      for(const id of ids) await deleteDoc(doc(db,"records",id));
      alert("Deleted selected records");
      appendAudit({ action: "multi_delete", details: `Deleted ${ids.length} records`, meta: { ids } });
      loadPage("first");
    });

    if(addBtn) addBtn.addEventListener("click", async ()=>{
      try{
        const rec = {
          name: document.getElementById("nameInput").value.trim(),
          nia: document.getElementById("niaInput").value.trim(),
          dob: document.getElementById("dobInput").value.trim(),
          region: document.getElementById("regionInput").value.trim(),
          address: document.getElementById("addressInput").value.trim(),
          criminal: document.getElementById("criminalInput").value.trim(),
          driving: document.getElementById("drivingInput").value.trim(),
          credit: document.getElementById("creditInput").value.trim(),
          status: document.getElementById("statusInput").value
        };
        if(!rec.name || !rec.nia) return alert("Please provide Name and NIA.");
        const addedRef = await addDoc(recordsRef, rec);
        alert("Record added.");
        appendAudit({ action: "add_record", targetId: addedRef.id, details: `Added ${rec.name}`, meta: { nia: rec.nia } });
        ["nameInput","niaInput","dobInput","regionInput","addressInput","criminalInput","drivingInput","creditInput"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
        loadPage("first");
      }catch(err){ console.error(err); alert("Error adding record"); }
    });

    // single delete and edit modal rely on global functions (keep them)
    window.deleteRecord = async function(id){
      if(!confirm("Delete this record?")) return;
      await deleteDoc(doc(db,"records",id));
      appendAudit({ action: "delete_record", targetId: id, details: `Deleted record ${id}` });
      loadPage("first");
    };

    const modalBackdrop = document.getElementById("modalBackdrop");
    let editingId = null;
    window.openEditModal = async function(id){
      try{
        editingId = id;
        const snap = await getDoc(doc(db,"records",id));
        if(!snap.exists()) return alert("Record not found.");
        const d = snap.data();
        document.getElementById("modal_name").value = d.name || "";
        document.getElementById("modal_nia").value = d.nia || "";
        document.getElementById("modal_dob").value = d.dob || "";
        document.getElementById("modal_region").value = d.region || "";
        document.getElementById("modal_address").value = d.address || "";
        document.getElementById("modal_criminal").value = d.criminal || "";
        document.getElementById("modal_driving").value = d.driving || "";
        document.getElementById("modal_credit").value = d.credit || "";
        document.getElementById("modal_status").value = d.status || "Verified";
        if(modalBackdrop) modalBackdrop.style.display = "flex";
      }catch(err){ console.error("openEditModal error", err); }
    };

    const modalCancel = document.getElementById("modalCancel");
    const modalSave = document.getElementById("modalSave");
    if(modalCancel) modalCancel.addEventListener("click", ()=>{ editingId=null; if(modalBackdrop) modalBackdrop.style.display = "none"; });
    if(modalSave) modalSave.addEventListener("click", async ()=>{
      if(!editingId) return;
      const updates = {
        name: document.getElementById("modal_name").value.trim(),
        nia: document.getElementById("modal_nia").value.trim(),
        dob: document.getElementById("modal_dob").value.trim(),
        region: document.getElementById("modal_region").value.trim(),
        address: document.getElementById("modal_address").value.trim(),
        criminal: document.getElementById("modal_criminal").value.trim(),
        driving: document.getElementById("modal_driving").value.trim(),
        credit: document.getElementById("modal_credit").value.trim(),
        status: document.getElementById("modal_status").value
      };
      await updateDoc(doc(db,"records",editingId), updates);
      appendAudit({ action: "update_record", targetId: editingId, details: `Updated record ${editingId}`, meta: { updates } });
      alert("Record updated.");
      editingId=null; if(modalBackdrop) modalBackdrop.style.display = "none"; loadPage("first");
    });

    // import CSV
    if(importBtn){
      importBtn.addEventListener("click", ()=>{
        const file = csvFileEl?.files?.[0];
        if(!file) return alert("Select CSV file.");
        const reader = new FileReader();
        reader.onload = async (e)=>{
          try{
            document.getElementById("importStatus").innerText = "Parsing CSV...";
            const rows = parseCSV(e.target.result);
            if(rows.length < 2){ document.getElementById("importStatus").innerText = "No rows to import."; return; }
            let imported = 0;
            const ids = [];
            for(let i=1;i<rows.length;i++){
              const cols = rows[i]; if(cols.length < 9) continue;
              const record = { name:cols[0]||"", nia:cols[1]||"", dob:cols[2]||"", region:cols[3]||"", address:cols[4]||"", criminal:cols[5]||"", driving:cols[6]||"", credit:cols[7]||"", status:cols[8]||"Verified" };
              const ref = await addDoc(recordsRef, record);
              ids.push(ref.id);
              imported++; document.getElementById("importStatus").innerText = `Imported ${imported} rows...`;
            }
            document.getElementById("importStatus").innerText = `Imported ${imported} records.`;
            appendAudit({ action: "bulk_import", details: `Imported ${imported} rows via CSV`, meta: { count: imported, ids } });
            loadPage("first");
          }catch(err){ console.error(err); document.getElementById("importStatus").innerText = "Import failed. See console."; }
        };
        reader.readAsText(file);
      });
    }
    if(clearImportBtn) clearImportBtn.addEventListener("click", ()=>{ if(csvFileEl) csvFileEl.value=""; const st = document.getElementById("importStatus"); if(st) st.innerText=""; });

    if(openWalletBtn) openWalletBtn.addEventListener("click", ()=>{ window.location.href = "wallet.html"; });

    // analytics
    async function loadAnalytics(){
      try{
        const snaps = await getDocs(query(logsRef, orderBy("timestamp","desc")));
        const analyticsBodyEl = document.getElementById("analyticsBody");
        if(!analyticsBodyEl) return;
        analyticsBodyEl.innerHTML = ""; let count = 0;
        snaps.forEach(s=>{
          const d = s.data();
          const ts = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleString() : (d.timestamp ? new Date(d.timestamp).toLocaleString() : "");
          analyticsBodyEl.innerHTML += `<tr><td>${escapeHtml(d.term)}</td><td>${escapeHtml(d.platform)}</td><td>${ts}</td></tr>`;
          count++;
        });
        if(totalLogsEl) totalLogsEl.textContent = count;
      } catch(err){ console.error("loadAnalytics error", err); }
    }

    // audit logs load
    async function loadAuditLogs(limitCount = 200){
      try{
        auditBodyEl = auditBodyEl || document.getElementById("auditBody");
        if(!auditBodyEl) return;
        const q = query(collectionGroup(db, "events"), orderBy("timestamp","desc"), limit(limitCount));
        const snaps = await getDocs(q);
        auditBodyEl.innerHTML = "";
        snaps.forEach(s=>{
          const d = s.data();
          const ts = d.timestamp || "";
          auditBodyEl.innerHTML += `<tr>
            <td>${escapeHtml(d.action)}</td>
            <td>${escapeHtml(d.admin || "")}</td>
            <td>${escapeHtml(d.targetId || "")}</td>
            <td>${escapeHtml(String(d.details || ""))}</td>
            <td>${escapeHtml(d.prevHash || "").slice(0,10)}</td>
            <td>${escapeHtml(d.hash || "").slice(0,10)}</td>
            <td>${escapeHtml(String(ts).slice(0,19))}</td>
          </tr>`;
        });
      }catch(err){ console.error("loadAuditLogs error", err); }
    }

    // totals
    async function loadTotals(){
      try{
        const snaps = await getDocs(recordsRef);
        if(totalRecordsEl) totalRecordsEl.textContent = snaps.size;
      }catch(err){ console.error("loadTotals error", err); }
    }

    // init wiring
    function init(){
      initTheme();
      initSectionObserver();
      loadPage("first");
      loadAnalytics();
      loadTotals();

      document.querySelectorAll("#nav button").forEach(b=>{
        b.addEventListener("click", ()=> showSection(b.dataset.section));
      });

      const navAudit = document.getElementById("navAudit");
      if(navAudit) navAudit.addEventListener("click", async ()=>{
        showSection("audit");
        await loadAuditLogs();
      });

      if(window.innerWidth >= 980 && sidebar) sidebar.style.transform = "translateX(0)";
    }

    // call init
    init();

  } catch (err) {
    console.error("FATAL admin.js init error:", err);
    alert("admin.js initialization error — check console.");
  }
});

