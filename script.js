// ✅ Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-app.js";
import { 
  getFirestore, collection, addDoc, getDocs, query, where 
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

// ✅ Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCDh_qL3jiCMHROK0_Soul2Wsv3t3y4wv0",
  authDomain: "nbvs-ghana.firebaseapp.com",
  projectId: "nbvs-ghana",
  storageBucket: "nbvs-ghana.firebasestorage.app",
  messagingSenderId: "702636577113",
  appId: "1:702636577113:web:8369b43a2aa43aeb95fc48",
  measurementId: "G-2FHFSQRMZX"
};

// ✅ Initialize Firebase + Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ✅ Add a new record to Firestore
document.getElementById("addRecordBtn").addEventListener("click", async () => {
  const newRecord = {
    name: document.getElementById("name").value.trim(),
    nia: document.getElementById("nia").value.trim(),
    dob: document.getElementById("dob").value.trim(),
    region: document.getElementById("region").value.trim(),
    criminal: document.getElementById("criminal").value.trim(),
    driving: document.getElementById("driving").value.trim(),
    address: document.getElementById("address").value.trim(),
    credit: document.getElementById("credit").value.trim(),
    status: document.getElementById("status").value.trim(),
  };

  if (!newRecord.name) {
    alert("⚠️ Please enter a name before saving!");
    return;
  }

  try {
    await addDoc(collection(db, "records"), newRecord);
    alert("✅ Record saved successfully!");
    document.querySelectorAll("input").forEach(input => input.value = "");
  } catch (error) {
    console.error("Error adding record:", error);
    alert("❌ Failed to save record.");
  }
});

// ✅ Search records (case-insensitive)
document.getElementById("searchBtn").addEventListener("click", async () => {
  const searchValue = document.getElementById("searchInput").value.trim().toLowerCase();
  const resultsDiv = document.getElementById("results");

  if (!searchValue) {
    resultsDiv.innerHTML = "<p>⚠️ Please enter a name to search.</p>";
    return;
  }

  resultsDiv.innerHTML = "<p>Searching...</p>";

  try {
    const snapshot = await getDocs(collection(db, "records"));
    const records = snapshot.docs.map(doc => doc.data());

    // Find record by partial match
    const found = records.filter(r => 
      r.name && r.name.toLowerCase().includes(searchValue)
    );

    if (found.length === 0) {
      resultsDiv.innerHTML = "<p>❌ No records found.</p>";
      return;
    }

    resultsDiv.innerHTML = found.map(r => `
      <div class="record">
        <h3>${r.name}</h3>
        <p><strong>NIA ID:</strong> ${r.nia || "N/A"}</p>
        <p><strong>DOB:</strong> ${r.dob || "N/A"}</p>
        <p><strong>Region:</strong> ${r.region || "N/A"}</p>
        <p><strong>Criminal Record:</strong> ${r.criminal || "N/A"}</p>
        <p><strong>Driving License:</strong> ${r.driving || "N/A"}</p>
        <p><strong>Address:</strong> ${r.address || "N/A"}</p>
        <p><strong>Credit Score:</strong> ${r.credit || "N/A"}</p>
        <span class="badge ${r.status}">${r.status}</span>
      </div>
    `).join("");
  } catch (error) {
    console.error("Error fetching records:", error);
    resultsDiv.innerHTML = "<p>⚠️ Error fetching data from Firebase.</p>";
  }
});

// ✅ Add sample records once (optional)
async function addSampleData() {
  const samples = [
    {
      name: "Ama Serwaa",
      nia: "GHA-2039485",
      dob: "1994-07-12",
      region: "Greater Accra",
      status: "Verified",
      criminal: "Clean",
      driving: "Valid",
      address: "Accra, Ghana",
      credit: "750"
    },
    {
      name: "Kofi Mensah",
      nia: "GHA-3948571",
      dob: "1990-03-21",
      region: "Ashanti",
      status: "Verified",
      criminal: "Clean",
      driving: "Suspended (Minor offense)",
      address: "Kumasi, Ghana",
      credit: "710"
    },
    {
      name: "Abena Owusu",
      nia: "GHA-9384756",
      dob: "1988-09-10",
      region: "Western",
      status: "Pending",
      criminal: "Under Review",
      driving: "Valid",
      address: "Takoradi, Ghana",
      credit: "680"
    }
  ];

  for (const record of samples) {
    await addDoc(collection(db, "records"), record);
  }
  alert("✅ Sample records added!");
}
// Uncomment next line once to add them automatically, then re-comment it:
 //addSampleData();
