// ===================== Firebase (Module) =====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// ===================== Firebase Config =====================
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
const auth = getAuth(app);

// ===================== Constants =====================
// RU center + bounds (approx RU + Kazla area)
const RU_CENTER = [24.3636, 88.6241];
const RU_BOUNDS = L.latLngBounds(
  L.latLng(24.345, 88.595),
  L.latLng(24.385, 88.655)
);

// Collections
const COL_PENDING = "spots_pending";
const COL_APPROVED = "spots_approved";
const COL_VOTES = "votes";
const COL_PRESENCE = "presence";

// ===================== DOM =====================
const listWrap = document.getElementById("listWrap");
const liveCountEl = document.getElementById("liveCount");
const pendingCountEl = document.getElementById("pendingCount");
const clockText = document.getElementById("clockText");

const searchInput = document.getElementById("searchInput");
const gpsBtn = document.getElementById("gpsBtn");

const visitCount = document.getElementById("visitCount");
const onlineCount = document.getElementById("onlineCount");

// Add modal controls
const openAddBtn = document.getElementById("openAddBtn");
const addModal = document.getElementById("addModal");
const closeAddBtn = document.getElementById("closeAddBtn");
const addFormMount = document.getElementById("addFormMount");

// Sort dropdown (custom)
const sortDD = document.getElementById("sortDD");
const sortBtn = document.getElementById("sortBtn");
const sortMenu = document.getElementById("sortMenu");
const sortLabel = document.getElementById("sortLabel");

// Filter chips
const chipEls = Array.from(document.querySelectorAll(".chip"));

// ===================== State =====================
let UID = null;
let myPos = null; // {lat,lng}
let filter = "all";
let sortMode = "latest"; // latest | truth | distance
let approvedCache = []; // [{id,...}]
let markers = [];
let pickedLatLng = null;

// ===================== Map =====================
const map = L.map("map", {
  zoomControl: false,
  scrollWheelZoom: true
}).setView(RU_CENTER, 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

// limit to RU area visually (optional) - comment out if you don't want a rectangle
// L.rectangle(RU_BOUNDS, { color: "#16a34a", weight: 1, fillOpacity: 0.05 }).addTo(map);

function clearMarkers() {
  for (const m of markers) map.removeLayer(m);
  markers = [];
}

function addMarker(lat, lng, html) {
  const m = L.marker([lat, lng]).addTo(map);
  if (html) m.bindPopup(html);
  markers.push(m);
}

// pick location from map
map.on("click", (e) => {
  pickedLatLng = e.latlng;
  // if modal is open, update fields
  const latEl = document.getElementById("spotLat");
  const lngEl = document.getElementById("spotLng");
  if (latEl && lngEl) {
    latEl.value = pickedLatLng.lat.toFixed(5);
    lngEl.value = pickedLatLng.lng.toFixed(5);
  }
});

// ===================== Utils =====================
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function typeLabel(t) {
  if (t === "mix") return "মিক্স ইফতার";
  if (t === "khichuri") return "খিচুড়ি";
  if (t === "biriyani") return "বিরিয়ানি";
  return "ইফতার";
}

function foodsForType(t) {
  if (t === "mix") return ["বেগুনি", "ছোলা", "পেঁয়াজু", "হালিম", "শরবত"];
  if (t === "khichuri") return ["খিচুড়ি"];
  if (t === "biriyani") return ["বিরিয়ানি"];
  return [];
}

function distanceKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sa = Math.sin(dLat/2)**2 +
    Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180) *
    Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(sa));
}

// device id
const DEVICE_KEY = "ifter_device_id_v4";
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (id) return id;
  id = "dev_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}
const deviceId = getDeviceId();

// ===================== Modal open/close =====================
function openAdd() {
  addModal?.classList.remove("hidden");
}
function closeAdd() {
  addModal?.classList.add("hidden");
}
openAddBtn?.addEventListener("click", openAdd);
closeAddBtn?.addEventListener("click", closeAdd);
addModal?.addEventListener("click", (e) => { if (e.target === addModal) closeAdd(); });

// ===================== Inject Add Form =====================
function injectAddForm() {
  if (!addFormMount) return;

  addFormMount.innerHTML = `
    <form id="spotForm">
      <label>স্পট/মসজিদের নাম *</label>
      <input id="spotName" required placeholder="যেমন: RU কেন্দ্রীয় মসজিদ"/>

      <label>এলাকা/পয়েন্ট *</label>
      <input id="spotArea" required placeholder="যেমন: কাজলা / RU"/>

      <label>ইফতারের ধরন *</label>
      <select id="spotType" required>
        <option value="mix">মিক্স ইফতার (বেগুনি, ছোলা, পেঁয়াজু, হালিম, শরবত)</option>
        <option value="khichuri">খিচুড়ি</option>
        <option value="biriyani">বিরিয়ানি</option>
      </select>

      <div class="row">
        <div>
          <label>lat *</label>
          <input id="spotLat" placeholder="ম্যাপে ক্লিক করুন" readonly />
        </div>
        <div>
          <label>lng *</label>
          <input id="spotLng" placeholder="ম্যাপে ক্লিক করুন" readonly />
        </div>
      </div>

      <div class="hint">✅ ম্যাপে ক্লিক করলে lat/lng বসবে। RU bounds এর বাইরে হলে ব্লক হবে।</div>

      <button class="btn-primary" id="spotSubmitBtn" type="submit">Submit (Pending)</button>
      <div class="hint" id="spotMsg"></div>
    </form>
  `;

  const form = document.getElementById("spotForm");
  const spotType = document.getElementById("spotType");
  const msg = document.getElementById("spotMsg");

  // show foods info on change
  spotType.addEventListener("change", () => {
    const foods = foodsForType(spotType.value);
    msg.textContent = foods.length ? `এই টাইপে: ${foods.join(", ")}` : "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";

    const btn = document.getElementById("spotSubmitBtn");
    btn.disabled = true;
    btn.textContent = "Submitting…";

    try {
      const name = document.getElementById("spotName").value.trim();
      const area = document.getElementById("spotArea").value.trim();
      const type = document.getElementById("spotType").value;

      const lat = Number(document.getElementById("spotLat").value);
      const lng = Number(document.getElementById("spotLng").value);

      if (!name || name.length < 3) throw new Error("নাম কমপক্ষে ৩ অক্ষর দিন");
      if (!area || area.length < 2) throw new Error("এলাকা কমপক্ষে ২ অক্ষর দিন");
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("ম্যাপে ক্লিক করে লোকেশন সেট করুন");

      const ll = L.latLng(lat, lng);
      if (!RU_BOUNDS.contains(ll)) throw new Error("শুধু RU/রাজশাহী বিশ্ববিদ্যালয় কেন্দ্রিক লোকেশন দিন (bounds এর বাইরে)");

      // write pending
      await addDoc(collection(db, COL_PENDING), {
        name,
        area,
        type,
        foods: foodsForType(type),
        lat,
        lng,
        status: "pending",
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
        uid: UID || null,
        deviceId
      });

      msg.textContent = "✅ Pending জমা হয়েছে! Admin approve করলে লাইভ হবে।";
      msg.style.color = "#166534";

      // reset
      form.reset();
      pickedLatLng = null;

      setTimeout(() => closeAdd(), 500);

    } catch (err) {
      console.error(err);
      msg.textContent = "❌ " + (err?.message || "Submit failed");
      msg.style.color = "#b91c1c";
      alert(msg.textContent);
    } finally {
      btn.disabled = false;
      btn.textContent = "Submit (Pending)";
    }
  });
}
injectAddForm();

// ===================== Filters =====================
chipEls.forEach((c) => {
  c.addEventListener("click", () => {
    chipEls.forEach(x => x.classList.remove("active"));
    c.classList.add("active");
    filter = c.dataset.filter || "all";
    render();
  });
});

// Search
searchInput?.addEventListener("input", render);

// ===================== iOS-safe dropdown =====================
function closeDD() { sortDD?.classList.remove("open"); }

sortBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  sortDD?.classList.toggle("open");
});

sortMenu?.addEventListener("click", (e) => {
  const item = e.target.closest(".dd-item");
  if (!item) return;
  sortMode = item.dataset.sort || "latest";

  if (sortMode === "latest") sortLabel.textContent = "সর্বশেষ";
  if (sortMode === "truth") sortLabel.textContent = "সত্যি বেশি";
  if (sortMode === "distance") sortLabel.textContent = "দূরত্ব (GPS)";

  closeDD();
  render();
});

document.addEventListener("click", closeDD);

// ===================== GPS =====================
gpsBtn?.addEventListener("click", () => {
  if (!navigator.geolocation) return alert("GPS support নেই");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.setView([myPos.lat, myPos.lng], 16);
      alert("✅ GPS পাওয়া গেছে");
      render();
    },
    () => alert("GPS permission দিন")
  );
});

// ===================== Auth (Anonymous background) =====================
signInAnonymously(auth).catch((e) => console.error("Anon auth:", e));

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  UID = user.uid;

  // presence heartbeat
  try {
    const presRef = doc(db, COL_PRESENCE, deviceId);
    await setDoc(presRef, { uid: UID, deviceId, lastSeen: serverTimestamp() }, { merge: true });
    setInterval(() => {
      setDoc(presRef, { uid: UID, deviceId, lastSeen: serverTimestamp() }, { merge: true });
    }, 25_000);
  } catch (e) {
    console.warn("Presence error:", e?.message || e);
  }

  // visitor count (per day per device)
  try {
    const day = new Date().toISOString().slice(0, 10);
    const dayKey = "ifter_visit_day_v4";
    const last = localStorage.getItem(dayKey);

    if (last !== day) {
      const statsRef = doc(db, "stats", "global");
      const snap = await getDoc(statsRef);
      const cur = snap.exists() ? Number(snap.data()?.totalVisits || 0) : 0;
      await setDoc(statsRef, { totalVisits: cur + 1, updatedAt: serverTimestamp() }, { merge: true });
      localStorage.setItem(dayKey, day);
    }
  } catch (e) {
    console.warn("Visit error:", e?.message || e);
  }
});

// stats live
onSnapshot(doc(db, "stats", "global"), (snap) => {
  visitCount.textContent = Number(snap.data()?.totalVisits || 0);
});

// online live
onSnapshot(collection(db, COL_PRESENCE), (snap) => {
  const now = Date.now();
  let online = 0;
  snap.forEach(d => {
    const ms = d.data()?.lastSeen?.toMillis ? d.data().lastSeen.toMillis() : 0;
    if (ms && (now - ms <= 2 * 60 * 1000)) online++;
  });
  onlineCount.textContent = online;
});

// pending count
onSnapshot(collection(db, COL_PENDING), (snap) => {
  pendingCountEl.textContent = snap.size;
});

// approved live
onSnapshot(query(collection(db, COL_APPROVED), orderBy("createdAt", "desc")), (snap) => {
  approvedCache = [];
  snap.forEach(d => approvedCache.push({ id: d.id, ...d.data() }));
  liveCountEl.textContent = approvedCache.length;

  renderMarkers();
  render();
});

// ===================== Render =====================
function renderMarkers() {
  clearMarkers();
  approvedCache.forEach((s) => {
    const lat = Number(s.lat);
    const lng = Number(s.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    addMarker(
      lat,
      lng,
      `<b>${esc(s.name)}</b><br>${esc(s.area)}<br>${esc(typeLabel(s.type))}`
    );
  });
}

function buildCard(s) {
  const truth = Number(s.truthCount || 0);
  const fake = Number(s.fakeCount || 0);

  let distTxt = "";
  if (sortMode === "distance" && myPos && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng))) {
    const km = distanceKm(myPos, { lat: Number(s.lat), lng: Number(s.lng) });
    distTxt = ` • ${km.toFixed(2)} km`;
  }

  return `
    <div class="spot-card" data-id="${esc(s.id)}">
      <div class="spot-top">
        <div class="spot-ico">🥣</div>
        <div style="flex:1">
          <div class="spot-name">${esc(s.name)}</div>
          <div class="spot-meta">📍 ${esc(s.area)} • ${esc(typeLabel(s.type))}${distTxt}</div>
        </div>
        <div class="spot-type">${esc(typeLabel(s.type))}</div>
      </div>

      <div class="spot-badges">
        <button class="badge like" data-act="truth">👍 সত্যি <b>${truth}</b></button>
        <button class="badge fake" data-act="fake">👎 ভুয়া <b>${fake}</b></button>
        <button class="badge" style="background:#e5e7eb;color:#111" data-act="share">🔗 Share</button>
        <button class="badge" style="background:#dbeafe;color:#1e40af" data-act="map">📍 Map</button>
      </div>
    </div>
  `;
}

function render() {
  if (!listWrap) return;

  const q = (searchInput?.value || "").trim().toLowerCase();
  let items = approvedCache.slice();

  // filter
  if (filter === "mix") items = items.filter(x => x.type === "mix");
  if (filter === "khichuri") items = items.filter(x => x.type === "khichuri");
  if (filter === "biriyani") items = items.filter(x => x.type === "biriyani");
  if (filter === "truth") items = items.sort((a,b)=>(Number(b.truthCount||0)-Number(a.truthCount||0)));

  // search
  if (q) {
    items = items.filter(x =>
      (x.name || "").toLowerCase().includes(q) ||
      (x.area || "").toLowerCase().includes(q) ||
      typeLabel(x.type).toLowerCase().includes(q)
    );
  }

  // sort
  if (sortMode === "latest") {
    items = items.sort((a,b)=>(Number(b.createdAtMs||0)-Number(a.createdAtMs||0)));
  }
  if (sortMode === "truth") {
    items = items.sort((a,b)=>(Number(b.truthCount||0)-Number(a.truthCount||0)));
  }
  if (sortMode === "distance" && myPos) {
    items = items
      .map(x => ({
        ...x,
        _d: (Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lng)))
          ? distanceKm(myPos, {lat:Number(x.lat), lng:Number(x.lng)})
          : 999999
      }))
      .sort((a,b)=>a._d-b._d);
  }

  if (!items.length) {
    listWrap.innerHTML = `<div class="empty">কোনো স্পট পাওয়া যায়নি</div>`;
    return;
  }

  listWrap.innerHTML = items.map(buildCard).join("");
}

// ===================== Card actions (vote/share/map) =====================
listWrap?.addEventListener("click", async (e) => {
  const card = e.target.closest(".spot-card");
  const btn = e.target.closest("button");
  if (!card || !btn) return;

  const id = card.dataset.id;
  const act = btn.dataset.act;
  const spot = approvedCache.find(x => x.id === id);
  if (!spot) return;

  if (act === "map") {
    map.setView([Number(spot.lat), Number(spot.lng)], 17);
    return;
  }

  if (act === "share") {
    const url = new URL(location.href);
    url.searchParams.set("spot", id);
    const text = `🌙 ইফতার স্পট: ${spot.name} (${spot.area}) — ${typeLabel(spot.type)}`;

    try {
      if (navigator.share) await navigator.share({ title: "ইফতার খুঁজুন", text, url: url.toString() });
      else {
        await navigator.clipboard.writeText(url.toString());
        alert("✅ Link copied");
      }
    } catch {}
    return;
  }

  if (act === "truth" || act === "fake") {
    await voteOnce(id, act);
  }
});

async function voteOnce(spotId, voteType) {
  const voteId = `${deviceId}_${spotId}`;
  const voteRef = doc(db, COL_VOTES, voteId);
  const already = await getDoc(voteRef);
  if (already.exists()) return alert("✅ এই ডিভাইস থেকে আগেই ভোট দেয়া হয়েছে");

  await setDoc(voteRef, {
    spotId,
    deviceId,
    uid: UID || null,
    voteType,
    createdAt: serverTimestamp()
  });

  // naive count update (admin rules should allow merge updates)
  const spotRef = doc(db, COL_APPROVED, spotId);
  const snap = await getDoc(spotRef);
  if (!snap.exists()) return;

  const cur = snap.data();
  const truth = Number(cur.truthCount || 0);
  const fake = Number(cur.fakeCount || 0);

  await setDoc(spotRef, {
    truthCount: voteType === "truth" ? truth + 1 : truth,
    fakeCount: voteType === "fake" ? fake + 1 : fake
  }, { merge: true });

  alert("✅ Vote counted");
}

// ===================== Clock (simple) =====================
const fmt = new Intl.DateTimeFormat("bn-BD", { hour: "2-digit", minute: "2-digit" });
setInterval(() => {
  clockText.textContent = fmt.format(new Date());
}, 1000);

// ===================== Auto-center shared spot (?spot=ID) =====================
(async function autoCenter() {
  try {
    const p = new URLSearchParams(location.search);
    const spotId = p.get("spot");
    if (!spotId) return;

    const snap = await getDoc(doc(db, COL_APPROVED, spotId));
    if (!snap.exists()) return;

    const s = snap.data();
    map.setView([Number(s.lat), Number(s.lng)], 17);
  } catch {}
})();
