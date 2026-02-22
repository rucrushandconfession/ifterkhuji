import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  doc,
  writeBatch,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** Firebase config (আপনার দেয়া) */
const firebaseConfig = {
  apiKey: "AIzaSyA6SZeKVmNAsd4eAlieCTC7zQzYMenwJEA",
  authDomain: "free-ifter.firebaseapp.com",
  projectId: "free-ifter",
  storageBucket: "free-ifter.firebasestorage.app",
  messagingSenderId: "380765313810",
  appId: "1:380765313810:web:6b7a87bf350cba858f71cb",
  measurementId: "G-18J6SR9913"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/** RU Center + radius */
const RU_CENTER = [24.3636, 88.6295];
const RU_RADIUS_M = 3500;

/** Device ID (localStorage) */
const DEVICE_KEY = "ifter_device_id_v1";
const deviceId = getOrCreateDeviceId();

/** DOM */
const searchInput = document.getElementById("searchInput");
const listEl = document.getElementById("list");
const totalPill = document.getElementById("totalPill");
const verifiedPill = document.getElementById("verifiedPill");
const iftarCountdownEl = document.getElementById("iftarCountdown");
const hintTextEl = document.getElementById("hintText");

const gpsBtn = document.getElementById("gpsBtn");
const addSpotBtn = document.getElementById("addSpotBtn");
const centerRuBtn = document.getElementById("centerRuBtn");

const modal = document.getElementById("modal");
const modalBackdrop = document.getElementById("modalBackdrop");
const closeModalBtn = document.getElementById("closeModalBtn");
const pickOnMapBtn = document.getElementById("pickOnMapBtn");
const spotForm = document.getElementById("spotForm");
const spotName = document.getElementById("spotName");
const spotArea = document.getElementById("spotArea");
const foodType = document.getElementById("foodType");
const foodInfo = document.getElementById("foodInfo");
const latlngPill = document.getElementById("latlngPill");

/** Leaflet map */
const map = L.map("map").setView(RU_CENTER, 15);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
L.circle(RU_CENTER, { radius: RU_RADIUS_M }).addTo(map);
const markersLayer = L.layerGroup().addTo(map);

/** Pin */
let pinMarker = null;
let pickedLatLng = null;
let mapPickArmed = false;

/** Anti-spam (client-side soft rate limit) */
const LAST_SUBMIT_KEY = "ifter_last_submit_ts_v1";
const SUBMIT_COOLDOWN_MS = 60 * 1000; // 1 মিনিটে ১টা সাবমিট (soft)

/** Approved cache */
let spotsCache = [];

/** Food package */
function getFoodDetails(type) {
  if (type === "মিক্স ইফতার") return ["বেগুনি", "ছোলা", "পেঁয়াজু", "হালিম", "শরবত"];
  if (type === "খিচুড়ি") return ["খিচুড়ি"];
  if (type === "বিরিয়ানি") return ["বিরিয়ানি"];
  return [];
}

/** Utils */
function isInsideRU(lat, lng) {
  const center = L.latLng(RU_CENTER[0], RU_CENTER[1]);
  const p = L.latLng(lat, lng);
  return center.distanceTo(p) <= RU_RADIUS_M;
}

function setPin(lat, lng) {
  pickedLatLng = { lat, lng };
  latlngPill.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  if (pinMarker) pinMarker.setLatLng([lat, lng]);
  else {
    pinMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
    pinMarker.on("dragend", () => {
      const ll = pinMarker.getLatLng();
      pickedLatLng = { lat: ll.lat, lng: ll.lng };
      latlngPill.textContent = `📍 ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
    });
  }
}

function openModal() {
  modal.hidden = false;
  modalBackdrop.hidden = false;
}
function closeModal() {
  modal.hidden = true;
  modalBackdrop.hidden = true;
  mapPickArmed = false;
}
closeModalBtn.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);

/** Map click */
map.on("click", (e) => {
  if (!mapPickArmed) {
    // normal map tap -> set pin anyway (helpful)
    setPin(e.latlng.lat, e.latlng.lng);
    hintTextEl.textContent = "✅ পিন সেট হয়েছে";
    return;
  }

  setPin(e.latlng.lat, e.latlng.lng);
  hintTextEl.textContent = "✅ পিন সেট হয়েছে, এখন ফর্ম সাবমিট করুন";
  mapPickArmed = false;
});

/** Top buttons */
centerRuBtn.addEventListener("click", () => map.setView(RU_CENTER, 15));

gpsBtn.addEventListener("click", () => {
  if (!navigator.geolocation) return alert("GPS সাপোর্ট নেই।");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setPin(lat, lng);
      map.setView([lat, lng], 16);
    },
    () => alert("GPS permission পাওয়া যায়নি।")
  );
});

addSpotBtn.addEventListener("click", () => openModal());

pickOnMapBtn.addEventListener("click", () => {
  mapPickArmed = true;
  hintTextEl.textContent = "📌 এখন ম্যাপে ট্যাপ করুন (পিন সেট হবে)";
  closeModal(); // ইউজার ম্যাপে ট্যাপ করবে, তারপর আবার modal খুলবে
  setTimeout(() => openModal(), 400);
});

/** Food info update */
foodType.addEventListener("change", () => {
  const type = foodType.value;
  if (!type) {
    foodInfo.textContent = "মিক্স ইফতার = বেগুনি, ছোলা, পেঁয়াজু, হালিম, শরবত";
    return;
  }
  foodInfo.textContent = `${type} = ${getFoodDetails(type).join(", ")}`;
});

/** Submit spot (NO LOGIN) */
spotForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // soft anti-spam cooldown
  const last = Number(localStorage.getItem(LAST_SUBMIT_KEY) || "0");
  const now = Date.now();
  if (now - last < SUBMIT_COOLDOWN_MS) {
    const wait = Math.ceil((SUBMIT_COOLDOWN_MS - (now - last)) / 1000);
    alert(`⏳ একটু অপেক্ষা করুন (${wait}s)।`);
    return;
  }

  const name = spotName.value.trim();
  const area = spotArea.value.trim();
  const type = foodType.value;

  if (name.length < 3 || area.length < 2 || !type) {
    alert("সব ফিল্ড ঠিকভাবে দিন।");
    return;
  }
  if (!pickedLatLng) {
    alert("ম্যাপে ট্যাপ করে পিন সেট করুন।");
    return;
  }

  const { lat, lng } = pickedLatLng;

  if (!isInsideRU(lat, lng)) {
    alert("❌ এই স্পট RU এলাকার বাইরে।");
    return;
  }

  const foods = getFoodDetails(type);

  try {
    await addDoc(collection(db, "spots"), {
      name,
      area,
      type,
      foods,
      lat,
      lng,
      truth: 0,
      fake: 0,
      deviceId,            // spam analysis (soft)
      createdAt: serverTimestamp()
    });

    localStorage.setItem(LAST_SUBMIT_KEY, String(Date.now()));

    alert("✅ স্পট যোগ হয়েছে!");
    spotForm.reset();
    pickedLatLng = null;
    latlngPill.textContent = "📍 পিন সেট হয়নি";
    if (pinMarker) { map.removeLayer(pinMarker); pinMarker = null; }
    closeModal();
  } catch (err) {
    console.error(err);
    alert("❌ যোগ হয়নি। Firestore Rules চেক করুন।");
  }
});

/** Real-time list */
const spotsQuery = query(collection(db, "spots"), orderBy("createdAt", "desc"));
onSnapshot(spotsQuery, (snap) => {
  const spots = [];
  snap.forEach((d) => spots.push({ id: d.id, ...d.data() }));
  spotsCache = spots;
  renderSpots();
});

searchInput.addEventListener("input", renderSpots);

function renderSpots() {
  // markers
  markersLayer.clearLayers();
  spotsCache.forEach((s) => {
    L.marker([s.lat, s.lng]).addTo(markersLayer)
      .bindPopup(`<b>${escapeHtml(s.name)}</b><br/>${escapeHtml(s.area)}<br/>${escapeHtml(s.type)}`);
  });

  const q = (searchInput.value || "").trim().toLowerCase();
  const filtered = q
    ? spotsCache.filter(s =>
        (s.name||"").toLowerCase().includes(q) ||
        (s.area||"").toLowerCase().includes(q) ||
        (s.type||"").toLowerCase().includes(q)
      )
    : spotsCache;

  listEl.innerHTML = "";
  filtered.forEach((s) => {
    const foods = Array.isArray(s.foods) ? s.foods : [];
    const votedKey = `voted_${s.id}`; // local lock
    const alreadyVoted = localStorage.getItem(votedKey) === "1";

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="cardTop">
        <div>
          <div class="cardTitle">${escapeHtml(s.name)}</div>
          <div class="cardSub">📍 ${escapeHtml(s.area)} • ${escapeHtml(s.type)}</div>
        </div>
        <div class="smallPill">RU</div>
      </div>

      <div class="tags">
        ${foods.map(f => `<span class="tag">${escapeHtml(f)}</span>`).join("")}
      </div>

      <div class="voteRow">
        <button class="voteBtn ${alreadyVoted ? "disabled":""}" data-id="${s.id}" data-v="truth" ${alreadyVoted?"disabled":""}>👍 সত্যি ${Number(s.truth||0)}</button>
        <button class="voteBtn ${alreadyVoted ? "disabled":""}" data-id="${s.id}" data-v="fake" ${alreadyVoted?"disabled":""}>👎 ভুয়া ${Number(s.fake||0)}</button>
        <button class="voteBtn" data-id="${s.id}" data-v="center">📍 Map</button>
      </div>
    `;
    listEl.appendChild(card);
  });

  totalPill.textContent = `🌙 আজকের স্পট: ${spotsCache.length}টি`;
  verifiedPill.textContent = `✓ নিশ্চিত: ${spotsCache.length}টি`;
}

/**
 * Vote once per device:
 * - আমরা batch write করি:
 *   1) votes/{spotId_deviceId} create (একবারই create সম্ভব; rules এ block)
 *   2) spots/{spotId} update increment
 */
listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const spotId = btn.dataset.id;
  const act = btn.dataset.v;
  if (!spotId || !act) return;

  const spot = spotsCache.find(s => s.id === spotId);
  if (!spot) return;

  if (act === "center") {
    map.setView([spot.lat, spot.lng], 17);
    return;
  }

  const votedKey = `voted_${spotId}`;
  if (localStorage.getItem(votedKey) === "1") {
    alert("✅ আপনি এই স্পটে আগে vote দিয়েছেন।");
    return;
  }

  const voteDocId = `${spotId}_${deviceId}`;
  const voteRef = doc(db, "votes", voteDocId);
  const spotRef = doc(db, "spots", spotId);

  try {
    const batch = writeBatch(db);

    // create vote ticket
    batch.set(voteRef, {
      spotId,
      deviceId,
      vote: act, // truth|fake
      createdAt: serverTimestamp()
    });

    // increment spot count
    batch.update(spotRef, {
      [act]: increment(1)
    });

    await batch.commit();

    localStorage.setItem(votedKey, "1");
  } catch (err) {
    console.error(err);
    alert("❌ Vote হয়নি (সম্ভবত আগে vote দেয়া আছে বা rules block করেছে)।");
  }
});

/** Iftar countdown (Rajshahi) */
loadIftarCountdown();
async function loadIftarCountdown() {
  try {
    const url = `https://api.aladhan.com/v1/timingsByCity?city=Rajshahi&country=Bangladesh&method=2`;
    const res = await fetch(url);
    const json = await res.json();
    const maghrib = json?.data?.timings?.Maghrib;
    if (!maghrib) throw new Error("Maghrib not found");
    startCountdown(maghrib);
  } catch {
    iftarCountdownEl.textContent = "⚠️ কাউন্টডাউন লোড হয়নি";
  }
}
function startCountdown(maghribHHMM) {
  function tick() {
    const now = new Date();
    const [hh, mm] = maghribHHMM.split(":").map(Number);
    const target = new Date(now);
    target.setHours(hh, mm, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);

    const diff = target - now;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);

    iftarCountdownEl.textContent =
      `🌙 ইফতার (${maghribHHMM}) বাকি: ${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }
  tick();
  setInterval(tick, 1000);
}
function pad2(n){ return String(n).padStart(2,"0"); }

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (id) return id;

  // simple random ID (soft device fingerprint)
  id = "dev_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}
