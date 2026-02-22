import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy, limit,
  doc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* ========= 1) Firebase Config (আপনারটা বসান) ========= */
const firebaseConfig = {
  apiKey: "YOUR_KEY",
  authDomain: "YOUR_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/* ========= 2) UI refs ========= */
const $ = (id) => document.getElementById(id);

const liveCountEl = $("liveCount");
const clockEl = $("clock");
const qEl = $("q");
const btnGPS = $("btnGPS");
const fabAdd = $("fabAdd");
const modal = $("modal");
const btnClose = $("btnClose");
const btnSubmit = $("btnSubmit");
const btnPick = $("btnPick");

const nameEl = $("name");
const areaEl = $("area");
const typeEl = $("type");
const itemsEl = $("items");
const notesEl = $("notes");
const latlngEl = $("latlng");

const todayList = $("todayList");
const sortEl = $("sort");
const onlineEl = $("online");
const visitsEl = $("visits");

let currentUser = null;

/* ========= 3) Map init ========= */
const map = L.map("map").setView([24.375, 88.59], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap",
}).addTo(map);

const cluster = L.markerClusterGroup();
map.addLayer(cluster);

let pickMode = false;
let pickedLatLng = null;

function inRajshahi(lat, lng) {
  return lat >= 24.30 && lat <= 24.45 && lng >= 88.50 && lng <= 88.70;
}

/* ========= 4) Auth ========= */
async function ensureAuth() {
  try {
    await signInAnonymously(auth);
  } catch (e) {
    console.error("signInAnonymously error:", e);
    alert("Auth error. Firebase Auth → Anonymous enable + authorized domain check করুন।");
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  console.log("AUTH:", user?.uid);
  if (user?.uid) {
    heartbeatPresence(user.uid);
    incrementVisitsOnce(); // client-only visits
  }
});

ensureAuth();

/* ========= 5) Presence + Visits ========= */
async function heartbeatPresence(uid) {
  // update every 20s
  const ref = doc(db, "presence", uid);

  const tick = async () => {
    try {
      await setDoc(ref, { lastSeen: new Date() }, { merge: true });
    } catch (e) {
      console.warn("presence write blocked:", e?.message || e);
    }
  };

  await tick();
  setInterval(tick, 20000);

  // online count (client-side estimate: last 60s)
  setInterval(async () => {
    try {
      const snap = await getDocs(collection(db, "presence"));
      const now = Date.now();
      let online = 0;
      snap.forEach(d => {
        const t = d.data()?.lastSeen?.toDate?.() || null;
        if (t && (now - t.getTime()) <= 60000) online++;
      });
      onlineEl.textContent = String(online);
    } catch {
      onlineEl.textContent = "0";
    }
  }, 15000);
}

// Visits: client-side; rules এ write বন্ধ করলে এটা ignore হবে
let visitDone = false;
async function incrementVisitsOnce() {
  if (visitDone) return;
  visitDone = true;

  try {
    // এখানে stats write বন্ধ থাকলে fail হবে—এটাই safe ডিফল্ট
    // আপনি যদি visits রাখতে চান, stats rules isAdmin/Cloud Function করুন
    visitsEl.textContent = "0";
  } catch {
    visitsEl.textContent = "0";
  }
}

/* ========= 6) Clock ========= */
function updateClock() {
  const now = new Date();
  const h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  clockEl.textContent = `${hh}:${m} ${ampm}`;
}
setInterval(updateClock, 1000);
updateClock();

/* ========= 7) Load spots ========= */
let allSpots = [];  // {id, ...data}
let currentFilter = "all";

async function loadSpots() {
  cluster.clearLayers();
  allSpots = [];

  const qSpots = query(collection(db, "spots"), orderBy("createdAt", "desc"), limit(500));
  const snap = await getDocs(qSpots);

  snap.forEach((d) => {
    const data = d.data();
    allSpots.push({ id: d.id, ...data });

    const marker = L.marker([data.lat, data.lng]);
    marker.bindPopup(popupHtml(d.id, data));
    cluster.addLayer(marker);
  });

  liveCountEl.textContent = String(allSpots.length);
  renderTodayList();
  focusFromURL();
}

function popupHtml(spotId, s) {
  const typeName =
    s.type === "mix" ? "মিক্স ইফতার" :
    s.type === "khichuri" ? "খিচুড়ি" :
    s.type === "biriyani" ? "বিরিয়ানি" : s.type;

  const items = (s.items || "").trim();
  const notes = (s.notes || "").trim();

  return `
    <div style="min-width:220px">
      <div style="font-weight:900;font-size:16px">${escapeHtml(s.name || "")}</div>
      <div style="margin-top:6px;font-weight:800;opacity:.85">${escapeHtml(s.area || "")} • ${typeName}</div>
      ${items ? `<div style="margin-top:6px">🍽️ ${escapeHtml(items)}</div>` : ""}
      ${notes ? `<div style="margin-top:6px">📝 ${escapeHtml(notes)}</div>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button onclick="window.__vote('${spotId}','truth')" style="padding:8px 10px;border-radius:999px;border:0;background:#275130;color:#fff;font-weight:900;cursor:pointer">সত্যি</button>
        <button onclick="window.__vote('${spotId}','fake')" style="padding:8px 10px;border-radius:999px;border:0;background:#111827;color:#fff;font-weight:900;cursor:pointer">ভুয়া</button>
        <button onclick="window.__report('${spotId}')" style="padding:8px 10px;border-radius:999px;border:1px solid rgba(0,0,0,.15);background:#fff;font-weight:900;cursor:pointer">রিপোর্ট</button>
        <button onclick="window.__share('${spotId}')" style="padding:8px 10px;border-radius:999px;border:1px solid rgba(0,0,0,.15);background:#fff;font-weight:900;cursor:pointer">শেয়ার</button>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ========= 8) Filters + Search ========= */
document.querySelectorAll(".chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderTodayList();
  });
});

qEl.addEventListener("input", () => renderTodayList());
sortEl.addEventListener("change", () => renderTodayList());

function renderTodayList() {
  const text = (qEl.value || "").trim().toLowerCase();

  let list = allSpots.slice();

  // filter by type
  if (currentFilter === "mix") list = list.filter(s => s.type === "mix");
  if (currentFilter === "khichuri") list = list.filter(s => s.type === "khichuri");
  if (currentFilter === "biriyani") list = list.filter(s => s.type === "biriyani");

  // "truthy" placeholder: sorting will do more; without server aggregation we just sort later
  if (text) {
    list = list.filter(s => {
      const hay = `${s.name||""} ${s.area||""} ${s.items||""} ${s.notes||""}`.toLowerCase();
      return hay.includes(text);
    });
  }

  // sort
  if (sortEl.value === "recent") {
    // createdAt desc already
  }

  todayList.innerHTML = "";

  if (!list.length) {
    todayList.innerHTML = `<div class="empty">কোনো স্পট পাওয়া যায়নি</div>`;
    return;
  }

  list.slice(0, 50).forEach((s) => {
    const div = document.createElement("div");
    div.className = "cardItem";
    div.innerHTML = `
      <div class="title">${escapeHtml(s.name || "")}</div>
      <div class="meta">${escapeHtml(s.area || "")} • ${typeLabel(s.type)}</div>
      <div class="actions">
        <button class="btnSmall btnLight" data-go="${s.id}">ম্যাপে দেখুন</button>
        <button class="btnSmall btnGhost" data-share="${s.id}">শেয়ার</button>
      </div>
    `;
    div.querySelector("[data-go]").addEventListener("click", () => focusSpot(s.id));
    div.querySelector("[data-share]").addEventListener("click", () => shareSpot(s.id));
    todayList.appendChild(div);
  });
}

function typeLabel(t){
  if (t === "mix") return "মিক্স";
  if (t === "khichuri") return "খিচুড়ি";
  if (t === "biriyani") return "বিরিয়ানি";
  return t || "-";
}

/* ========= 9) Focus / Share ========= */
function focusSpot(id) {
  const s = allSpots.find(x => x.id === id);
  if (!s) return;
  map.setView([s.lat, s.lng], 16);
}

function shareSpot(id) {
  const url = new URL(window.location.href);
  url.searchParams.set("spot", id);
  navigator.clipboard?.writeText(url.toString());
  alert("শেয়ার লিংক কপি হয়েছে ✅");
}

function focusFromURL() {
  const url = new URL(window.location.href);
  const id = url.searchParams.get("spot");
  if (id) focusSpot(id);
}

/* ========= 10) Vote / Report (one per user per spot) ========= */
window.__share = (spotId) => shareSpot(spotId);

window.__vote = async (spotId, value) => {
  if (!currentUser?.uid) return alert("Login not ready. 2s পরে আবার দিন।");

  try {
    const voteId = `${spotId}_${currentUser.uid}`;
    await setDoc(doc(db, "votes", voteId), {
      spotId,
      uid: currentUser.uid,
      value,
      createdAt: new Date()
    });
    alert("ভোট রেকর্ড হয়েছে ✅");
  } catch (e) {
    console.error(e);
    alert("Vote failed: " + (e?.message || "permission"));
  }
};

window.__report = async (spotId) => {
  if (!currentUser?.uid) return alert("Login not ready. 2s পরে আবার দিন।");

  const reason = prompt("কেন রিপোর্ট করছেন? (সংক্ষেপে লিখুন)");
  if (!reason) return;

  try {
    const reportId = `${spotId}_${currentUser.uid}`;
    await setDoc(doc(db, "reports", reportId), {
      spotId,
      uid: currentUser.uid,
      reason,
      createdAt: new Date()
    });
    alert("রিপোর্ট জমা হয়েছে ✅");
  } catch (e) {
    console.error(e);
    alert("Report failed: " + (e?.message || "permission"));
  }
};

/* ========= 11) Add Spot flow ========= */
fabAdd.addEventListener("click", () => {
  modal.classList.remove("hidden");
});

btnClose.addEventListener("click", () => {
  modal.classList.add("hidden");
  pickMode = false;
});

btnPick.addEventListener("click", () => {
  pickMode = true;
  alert("ম্যাপে ট্যাপ/ক্লিক করে লোকেশন সিলেক্ট করুন।");
});

map.on("click", (e) => {
  if (!pickMode) return;
  pickedLatLng = e.latlng;
  latlngEl.textContent = `${pickedLatLng.lat.toFixed(6)}, ${pickedLatLng.lng.toFixed(6)}`;
  pickMode = false;
});

btnSubmit.addEventListener("click", async () => {
  if (!currentUser?.uid) return alert("Login not ready. 2s পরে আবার দিন।");

  const name = nameEl.value.trim();
  const area = areaEl.value.trim();
  const type = typeEl.value;
  const items = itemsEl.value.trim();
  const notes = notesEl.value.trim();

  if (!name || !area) return alert("নাম ও এলাকা বাধ্যতামূলক।");
  if (!pickedLatLng) return alert("Map থেকে লোকেশন দিন।");

  const lat = pickedLatLng.lat;
  const lng = pickedLatLng.lng;

  if (!inRajshahi(lat, lng)) {
    return alert("লোকেশন রাজশাহীর বাইরে। Rajshahi এর ভিতরের লোকেশন দিন।");
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = "Submitting...";

  try {
    await addDoc(collection(db, "spots"), {
      name,
      area,
      type,
      items,
      notes,
      lat,
      lng,
      createdBy: currentUser.uid,
      createdAt: new Date()
    });

    alert("স্পট যোগ হয়েছে ✅");
    modal.classList.add("hidden");

    // reset
    nameEl.value = "";
    areaEl.value = "";
    itemsEl.value = "";
    notesEl.value = "";
    pickedLatLng = null;
    latlngEl.textContent = "Map থেকে দিন";

    await loadSpots();
  } catch (e) {
    console.error(e);
    alert("Submit failed: " + (e?.message || "permission"));
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Submit";
  }
});

/* ========= 12) GPS ========= */
btnGPS.addEventListener("click", () => {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      map.setView([latitude, longitude], 16);
    },
    () => alert("GPS permission দিন / Location ON করুন।"),
    { enableHighAccuracy: true, timeout: 8000 }
  );
});

/* ========= init ========= */
loadSpots().catch((e) => {
  console.error(e);
  alert("Spots load failed: " + (e?.message || "permission"));
});
