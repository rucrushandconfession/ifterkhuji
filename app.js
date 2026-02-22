import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, addDoc, onSnapshot,
  serverTimestamp, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// Firebase config
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

// DOM
const modal = document.getElementById("modal");
const openAdd = document.getElementById("openAdd");
const closeModal = document.getElementById("closeModal");
const submitBtn = document.getElementById("submitBtn");
const submitMsg = document.getElementById("submitMsg");
const qInput = document.getElementById("q");
const btnGPS = document.getElementById("btnGPS");

const nameInp = document.getElementById("name");
const areaInp = document.getElementById("area");
const typeSel = document.getElementById("type");
const latInp = document.getElementById("lat");
const lngInp = document.getElementById("lng");
const pickMap = document.getElementById("pickMap");

const listEl = document.getElementById("list");
const liveCountEl = document.getElementById("liveCount");
const pendingCountEl = document.getElementById("pendingCount");

const visitsEl = document.getElementById("visits");
const onlineEl = document.getElementById("online");

let uid = null;
let myLatLng = null;
let filter = "all";

// RU Center (Rajshahi University)
const RU_CENTER = [24.3636, 88.6241]; // near RU / Kazla
const RU_BOUNDS = L.latLngBounds(
  L.latLng(24.345, 88.595),
  L.latLng(24.385, 88.655)
);

// Map
const map = L.map("map", { zoomControl: false }).setView(RU_CENTER, 14);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

let markersLayer = L.layerGroup().addTo(map);
let approvedCache = [];

// Helpers
const bd = new Intl.DateTimeFormat("bn-BD", { hour: "2-digit", minute: "2-digit" });

function distanceKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s1 = Math.sin(dLat/2)**2 +
    Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s1));
}

function toast(msg){
  submitMsg.textContent = msg;
}

// Modal
openAdd.onclick = () => { modal.classList.add("show"); };
closeModal.onclick = () => { modal.classList.remove("show"); };

pickMap.onclick = () => {
  toast("Map এ ক্লিক করে লোকেশন সেট করুন…");
  modal.classList.remove("show");
  const once = (e) => {
    const { lat, lng } = e.latlng;
    latInp.value = lat.toFixed(5);
    lngInp.value = lng.toFixed(5);
    toast("✅ লোকেশন সেট হয়েছে। আবার Add খুলুন।");
    map.off("click", once);
  };
  map.on("click", once);
};

// Filters
document.querySelectorAll(".chip").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    filter = btn.dataset.filter;
    renderList();
  };
});

// Search
qInput.addEventListener("input", () => renderList());

// GPS
btnGPS.onclick = () => {
  if (!navigator.geolocation) return alert("GPS support নেই");
  navigator.geolocation.getCurrentPosition((pos) => {
    myLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    map.setView([myLatLng.lat, myLatLng.lng], 15);
    toast("✅ GPS পাওয়া গেছে");
  }, () => alert("GPS permission দিন"));
};

// Auth (Anonymous)
signInAnonymously(auth).catch(console.error);

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  uid = user.uid;

  // Presence
  try {
    await setDoc(doc(db, "presence", uid), { lastSeen: serverTimestamp() }, { merge: true });
    setInterval(() => {
      setDoc(doc(db, "presence", uid), { lastSeen: serverTimestamp() }, { merge: true });
    }, 30_000);
  } catch {}

  // Visitor count
  try {
    const stRef = doc(db, "stats", "global");
    const snap = await getDoc(stRef);
    const cur = snap.exists() ? Number(snap.data().totalVisits || 0) : 0;
    await setDoc(stRef, { totalVisits: cur + 1 }, { merge: true });
  } catch {}
});

// Listen stats
onSnapshot(doc(db, "stats", "global"), (snap) => {
  visitsEl.textContent = snap.exists() ? (snap.data().totalVisits || 0) : 0;
});

// Online now
onSnapshot(collection(db, "presence"), (snap) => {
  const now = Date.now();
  let online = 0;
  snap.forEach(d => {
    const ms = d.data()?.lastSeen?.toMillis ? d.data().lastSeen.toMillis() : 0;
    if (ms && now - ms < 2*60*1000) online++;
  });
  onlineEl.textContent = `🟢 Online: ${online}`;
});

// Approved + Pending counts
onSnapshot(collection(db, "spots_approved"), (snap) => {
  liveCountEl.textContent = snap.size;
  approvedCache = [];
  snap.forEach(d => approvedCache.push({ id: d.id, ...d.data() }));
  renderMarkers();
  renderList();
});

onSnapshot(collection(db, "spots_pending"), (snap) => {
  pendingCountEl.textContent = snap.size;
});

// Render markers
function renderMarkers(){
  markersLayer.clearLayers();
  approvedCache.forEach(s => {
    const lat = Number(s.lat);
    const lng = Number(s.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const m = L.marker([lat, lng]).addTo(markersLayer);
    m.bindPopup(`<b>${s.name || ""}</b><br/>${s.area || ""}<br/>${labelType(s.type)}`);
  });
}

function labelType(t){
  if (t === "mix") return "মিক্স ইফতার";
  if (t === "khichuri") return "খিচুড়ি";
  if (t === "biriyani") return "বিরিয়ানি";
  return "ইফতার";
}

// Render list
function renderList(){
  const queryText = (qInput.value || "").trim().toLowerCase();

  let items = approvedCache.slice();

  // filter
  if (filter === "mix") items = items.filter(x => x.type === "mix");
  if (filter === "khichuri") items = items.filter(x => x.type === "khichuri");
  if (filter === "biriyani") items = items.filter(x => x.type === "biriyani");
  if (filter === "truth") items = items.sort((a,b)=> (b.truthCount||0)-(a.truthCount||0));

  // search
  if (queryText) {
    items = items.filter(x =>
      (x.name||"").toLowerCase().includes(queryText) ||
      (x.area||"").toLowerCase().includes(queryText)
    );
  }

  // sort
  const sort = document.getElementById("sort").value;
  if (sort === "new") items = items.sort((a,b)=>(b.createdAtMs||0)-(a.createdAtMs||0));
  if (sort === "truth") items = items.sort((a,b)=>(b.truthCount||0)-(a.truthCount||0));
  if (sort === "near" && myLatLng) {
    items = items
      .map(x => ({...x, _d: distanceKm(myLatLng, {lat:Number(x.lat),lng:Number(x.lng)})}))
      .sort((a,b)=>a._d-b._d);
  }

  listEl.innerHTML = "";
  if (!items.length) {
    listEl.innerHTML = `<div class="item"><div class="itMain"><div class="itTitle">কোনো স্পট পাওয়া যায়নি</div></div></div>`;
    return;
  }

  items.forEach(s => {
    const truth = Number(s.truthCount||0);
    const fake = Number(s.fakeCount||0);

    const dist = (myLatLng && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)))
      ? ` • ${(distanceKm(myLatLng,{lat:Number(s.lat),lng:Number(s.lng)})).toFixed(2)} km`
      : "";

    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="badge">🥣</div>
      <div class="itMain">
        <div class="itTitle">${s.name||""}</div>
        <div class="itMeta">📍 ${s.area||""} • ${labelType(s.type)}${dist}</div>
        <div class="voteRow">
          <button class="vbtn truth" data-id="${s.id}" data-v="truth">👍 ${truth} সত্যি</button>
          <button class="vbtn fake" data-id="${s.id}" data-v="fake">👎 ${fake} ভুয়া</button>
          <button class="vbtn share" data-id="${s.id}">🔗 Share</button>
        </div>
      </div>
    `;
    listEl.appendChild(row);
  });
}

// Votes + Share
listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;

  // share
  if (btn.classList.contains("share")) {
    const url = location.origin + location.pathname + `?spot=${encodeURIComponent(id)}`;
    if (navigator.share) {
      try { await navigator.share({ title:"ইফতার খুঁজুন", url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      alert("✅ Link Copied");
    }
    return;
  }

  // vote
  const v = btn.dataset.v;
  if (!uid) return alert("UID তৈরি হচ্ছে... একটু পরে চেষ্টা করুন");

  // 1 device 1 vote (per spot)
  const deviceId = localStorage.getItem("deviceId") || (() => {
    const d = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("deviceId", d);
    return d;
  })();

  const voteKey = `${deviceId}_${id}`;
  const vr = doc(db, "votes", voteKey);
  const snap = await getDoc(vr);
  if (snap.exists()) return alert("✅ আপনি আগেই ভোট দিয়েছেন");

  await setDoc(vr, { spotId:id, deviceId, uid, v, at: serverTimestamp() });

  // Update counts (simple method)
  const spotRef = doc(db, "spots_approved", id);
  const spotSnap = await getDoc(spotRef);
  if (!spotSnap.exists()) return;

  const cur = spotSnap.data();
  const truth = Number(cur.truthCount||0);
  const fake = Number(cur.fakeCount||0);

  await setDoc(spotRef, {
    truthCount: v==="truth" ? truth+1 : truth,
    fakeCount: v==="fake" ? fake+1 : fake,
  }, { merge:true });

  alert("✅ Vote counted");
});

// Submit pending
submitBtn.onclick = async () => {
  const name = (nameInp.value||"").trim();
  const area = (areaInp.value||"").trim();
  const type = typeSel.value;

  const lat = Number(latInp.value);
  const lng = Number(lngInp.value);

  if (!name || !area) return alert("নাম এবং এলাকা দিন");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return alert("লোকেশন সেট করুন (Map থেকে দিন)");

  // RU bounds enforce
  const p = L.latLng(lat, lng);
  if (!RU_BOUNDS.contains(p)) {
    return alert("শুধু RU/রাজশাহী কেন্দ্রিক লোকেশন দিন (রেঞ্জের বাইরে)");
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";
  try {
    await addDoc(collection(db, "spots_pending"), {
      name, area, type,
      lat, lng,
      status:"pending",
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
      by: uid || null
    });
    alert("✅ Submitted! Pending queue তে গেছে");
    modal.classList.remove("show");
    nameInp.value = ""; areaInp.value = "";
  } catch (e) {
    console.error(e);
    alert("❌ Submit failed: " + (e?.message||""));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "🌙 Submit (Pending)";
  }
};

// Simple iftar time text (placeholder: countdown label only)
setInterval(()=>{
  // এখানে পরে RU ইফতার টাইম API/ডাটা দিলে exact countdown করবো
  const now = new Date();
  document.getElementById("iftarText").textContent = `সময়: ${bd.format(now)}`;
}, 1000);
