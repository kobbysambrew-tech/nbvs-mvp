// Firebase SDK imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCDh_qL3jiCMHROK0_Soul2Wsv3t3y4wv0",
  authDomain: "nbvs-ghana.firebaseapp.com",
  projectId: "nbvs-ghana",
  storageBucket: "nbvs-ghana.firebasestorage.app",
  messagingSenderId: "702636577113",
  appId: "1:702636577113:web:8369b43a2aa43aeb95fc48",
  measurementId: "G-2FHFSQRMZX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Make admin panel always visible for now (for testing)
document.getElementById("adminPanel").style.display = "block";

// Add record to Firestore
document.getElementById("addRecordBtn").addEventListener("click", async () => {
  const name = document.getElementById("name").value;
  const nia = document.getElementById("nia").value;
  const dob = document.getElementById("dob").value;
  const region = document.getElementById("region").value;
  const status = document.getElementById("status").value;
  const criminal = document.getElementById("criminal").value;
  const driving = document.getElementById("driving").value;

  try {
    await addDoc(collection(db, "records"), {
      name, nia, dob, region, status, criminal, driving
    });
    alert("✅ Record added successfully!");
  } catch (error) {
    console.error("Error adding record: ", error);
    alert("❌ Failed to add record.");
  }
});

// Search for a record
document.getElementById("searchBtn").addEventListener("click", async () => {
  const searchValue = document.getElementById("searchInput").value.trim();
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "Searching...";

  try {
    const q = query(collection(db, "records"), where("name", "==", searchValue));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      resultsDiv.innerHTML = "<p>❌ No record found.</p>";
      return;
    }

    resultsDiv.innerHTML = "";
    querySnapshot.forEach((doc) => {
      const r = doc.data();
      resultsDiv.innerHTML += `
        <div class="record">
          <h3>${r.name}</h3>
          <p><strong>NIA ID:</strong> ${r.nia}</p>
          <p><strong>Date of Birth:</strong> ${r.dob}</p>
          <p><strong>Region:</strong> ${r.region}</p>
          <p><strong>Status:</strong> ${r.status}</p>
          <p><strong>Criminal Record:</strong> ${r.criminal}</p>
          <p><strong>Driving License:</strong> ${r.driving}</p>
        </div>
      `;
    });
  } catch (error) {
    console.error("Error fetching records: ", error);
    resultsDiv.innerHTML = "<p>⚠️ Error fetching data.</p>";
  }
});
