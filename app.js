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
  getDoc,
  setDoc,
  where,
  limit,
  getDocs,
  writeBatch,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

/** ✅ আপনার Firebase config */
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
signInAnonymously(auth);

let UID = null;
onAuthStateChanged(auth, (u) => { UID = u?.uid || null; });

/** Rajshahi center */
const RAJSHAHI = [24.3745, 88.6042];
const map = L.map("map").setView(RAJSHAHI, 14);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

const cluster = L.markerClusterGroup();
map.addLayer(cluster);

/** UI elements */
const searchInput = document.getElementById("searchInput");
const chipsRow = document.getElementById("chipsRow");
const listEl = document.getElementById("list");
const totalPill = document.getElementById("totalPill");
const pendingPill = document.getElementById("pendingPill");
const iftarCountdownEl = document.getElementById("iftarCountdown");
const sheetTitleMain = document.getElementById("sheetTitleMain");
const sheetTitleSub = document.getElementById("sheetTitleSub");
const centerBtn = document.getElementById("centerBtn");
const gpsBtn = document.getElementById("gpsBtn");

const addSpotBtn = document.getElementById("addSpotBtn");
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

const totalVisitsEl = document.getElementById("totalVisits");
const onlineNowEl = document.getElementById("onlineNow");

/** Bounds (Rajshahi box) */
function insideRajshahi(lat, lng){
  return lat >= 24.33 && lat <= 24.42 && lng >= 88.56 && lng <= 88.70;
}

/** Foods */
function foodsByType(type){
  if (type === "মিক্স ইফতার") return ["বেগুনি","ছোলা","পেঁয়াজু","হালিম","শরবত"];
  if (type === "খিচুড়ি") return ["খিচুড়ি"];
  if (type === "বিরিয়ানি") return ["বিরিয়ানি"];
  return [];
}
foodType.addEventListener("change", () => {
  const t = foodType.value || "মিক্স ইফতার";
  foodInfo.textContent = `${t} = ${foodsByType(t).join(", ")}`;
});

/** Modal */
function openModal(){
  modal.hidden = false;
  modalBackdrop.hidden = false;
}
function closeModal(){
  modal.hidden = true;
  modalBackdrop.hidden = true;
}
addSpotBtn.addEventListener("click", openModal);
closeModalBtn.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);

/** Pin picking */
let picked = null;
let pinMarker = null;
let pickArmed = false;

function setPin(lat, lng){
  picked = {lat, lng};
  latlngPill.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  if (pinMarker) pinMarker.setLatLng([lat,lng]);
  else pinMarker = L.marker([lat,lng], { draggable:true }).addTo(map);
  pinMarker.on("dragend", () => {
    const ll = pinMarker.getLatLng();
    picked = { lat: ll.lat, lng: ll.lng };
    latlngPill.textContent = `📍 ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
  });
}

map.on("click", (e) => {
  if (!pickArmed) {
    // helpful: always allow pin set by tapping
    setPin(e.latlng.lat, e.latlng.lng);
    return;
  }
  setPin(e.latlng.lat, e.latlng.lng);
  pickArmed = false;
});

pickOnMapBtn.addEventListener("click", () => {
  pickArmed = true;
  closeModal();
  setTimeout(() => openModal(), 350);
});

/** GPS */
let userLatLng = null;
gpsBtn.addEventListener("click", () => {
  if (!navigator.geolocation) return alert("GPS সাপোর্ট নেই।");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLatLng = L.latLng(pos.coords.latitude, pos.coords.longitude);
      map.setView([userLatLng.lat, userLatLng.lng], 16);
      setPin(userLatLng.lat, userLatLng.lng);
    },
    () => alert("GPS permission পাওয়া যায়নি।")
  );
});

centerBtn.addEventListener("click", () => map.setView(RAJSHAHI, 14));

/** Bottom sheet drag */
const sheet = document.getElementById("sheet");
const handle = document.getElementById("sheetHandle");
const SHEET_MIN = 26;  // vh
const SHEET_MAX = 82;  // vh
let dragging = false;
let startY = 0;
let startH = 42;

function setSheetVh(vh){
  const clamped = Math.max(SHEET_MIN, Math.min(SHEET_MAX, vh));
  sheet.style.height = clamped + "vh";
}

function pointerDown(y){
  dragging = true;
  startY = y;
  startH = parseFloat(getComputedStyle(sheet).height) / window.innerHeight * 100;
  handle.style.cursor = "grabbing";
}
function pointerMove(y){
  if (!dragging) return;
  const dy = (y - startY) / window.innerHeight * 100;
  // drag up => dy negative => height increases
  setSheetVh(startH - dy);
}
function pointerUp(){
  dragging = false;
  handle.style.cursor = "grab";
}

handle.addEventListener("touchstart", (e)=>pointerDown(e.touches[0].clientY), {passive:true});
window.addEventListener("touchmove", (e)=>pointerMove(e.touches[0].clientY), {passive:true});
window.addEventListener("touchend", pointerUp);

handle.addEventListener("mousedown", (e)=>{ e.preventDefault(); pointerDown(e.clientY); });
window.addEventListener("mousemove", (e)=>pointerMove(e.clientY));
window.addEventListener("mouseup", pointerUp);

/** Search + filter state */
let filter = "all";
chipsRow.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  [...chipsRow.querySelectorAll(".chip")].forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  filter = btn.dataset.filter || "all";
  render();
});
searchInput.addEventListener("input", render);

/** Duplicate detector */
const DUP_RADIUS_M = 150;
function normalizeName(s){
  return String(s||"").trim().toLowerCase().replace(/\s+/g, " ");
}
function haversineM(aLat,aLng,bLat,bLng){
  const R = 6371000;
  const toRad = (x)=>x*Math.PI/180;
  const dLat = toRad(bLat-aLat);
  const dLng = toRad(bLng-aLng);
  const sa = Math.sin(dLat/2)**2 +
    Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(sa));
}
async function isDuplicate(nameLower, lat, lng){
  const q1 = query(collection(db,"spots_approved"), where("nameLower","==",nameLower), limit(20));
  const q2 = query(collection(db,"spots_pending"), where("nameLower","==",nameLower), limit(20));
  const [s1,s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  const chk = (snap)=>{
    for (const d of snap.docs){
      const s = d.data();
      const dist = haversineM(lat,lng,s.lat,s.lng);
      if (dist <= DUP_RADIUS_M) return true;
    }
    return false;
  };
  return chk(s1) || chk(s2);
}

/** Submit pending */
spotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!UID) return alert("অপেক্ষা করুন… UID তৈরি হচ্ছে।");

  const name = spotName.value.trim();
  const area = spotArea.value.trim();
  const type = foodType.value;

  if (!name || name.length < 3) return alert("নাম কমপক্ষে ৩ অক্ষর দিন।");
  if (!area || area.length < 2) return alert("এলাকা কমপক্ষে ২ অক্ষর দিন।");
  if (!type) return alert("টাইপ নির্বাচন করুন।");
  if (!picked) return alert("ম্যাপে ট্যাপ করে পিন সেট করুন।");

  const {lat,lng} = picked;
  if (!insideRajshahi(lat,lng)) return alert("রাজশাহী এলাকার বাইরে!");

  const nameLower = normalizeName(name);
  const foods = foodsByType(type);

  // duplicate check
  const dup = await isDuplicate(nameLower, lat, lng);
  if (dup) return alert("⚠️ ডুপ্লিকেট মনে হচ্ছে (একই নাম + কাছাকাছি)।");

  await addDoc(collection(db,"spots_pending"),{
    name,
    nameLower,
    area,
    type,
    foods,
    lat,lng,
    createdBy: UID,
    createdAt: serverTimestamp(),
    status: "pending"
  });

  alert("✅ Pending জমা হয়েছে। Admin approve করলে লাইভ হবে।");
  spotForm.reset();
  picked = null;
  latlngPill.textContent = "📍 পিন সেট হয়নি (ম্যাপে ট্যাপ করুন)";
  if (pinMarker) { map.removeLayer(pinMarker); pinMarker = null; }
  closeModal();
});

/** Approved cache */
let approvedCache = [];
let pendingCount = 0;

/** Listen approved */
const approvedQ = query(collection(db,"spots_approved"), orderBy("createdAt","desc"));
onSnapshot(approvedQ, (snap) => {
  approvedCache = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  render();
});

/** Listen pending count */
onSnapshot(collection(db,"spots_pending"), (snap) => {
  pendingCount = snap.size;
  pendingPill.textContent = `⏳ Pending: ${pendingCount}টি`;
});

/** Render list + markers */
function render(){
  // markers
  cluster.clearLayers();

  const qtxt = (searchInput.value || "").trim().toLowerCase();

  let filtered = approvedCache;

  if (filter !== "all") {
    if (filter === "truthy") {
      filtered = filtered.filter(s => Number(s.truthCount||0) > Number(s.fakeCount||0));
    } else {
      filtered = filtered.filter(s => (s.type||"") === filter);
    }
  }

  if (qtxt) {
    filtered = filtered.filter(s =>
      (s.name||"").toLowerCase().includes(qtxt) ||
      (s.area||"").toLowerCase().includes(qtxt) ||
      (s.type||"").toLowerCase().includes(qtxt)
    );
  }

  // list
  listEl.innerHTML = "";
  filtered.forEach((s) => {
    cluster.addLayer(
      L.marker([s.lat,s.lng]).bindPopup(`<b>${escapeHtml(s.name)}</b><br>${escapeHtml(s.area)}<br>${escapeHtml(s.type)}`)
    );

    const foods = Array.isArray(s.foods) ? s.foods : [];
    const distText = userLatLng ? formatDistance(userLatLng.distanceTo(L.latLng(s.lat,s.lng))) : null;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="cardTop">
        <div>
          <div class="cardTitle">${escapeHtml(s.name)}</div>
          <div class="cardSub">📍 ${escapeHtml(s.area)} • ${escapeHtml(s.type)}${distText ? ` • ${distText}` : ""}</div>
        </div>
        <div class="smallPill">Live</div>
      </div>

      <div class="tags">
        ${foods.map(f => `<span class="tag">${escapeHtml(f)}</span>`).join("")}
      </div>

      <div class="voteRow">
        <button class="voteBtn" data-act="vote" data-id="${s.id}" data-v="truth">👍 সত্যি ${Number(s.truthCount||0)}</button>
        <button class="voteBtn" data-act="vote" data-id="${s.id}" data-v="fake">👎 ভুয়া ${Number(s.fakeCount||0)}</button>
        <button class="voteBtn" data-act="report" data-id="${s.id}">🚩 রিপোর্ট ${Number(s.reportsCount||0)}</button>
        <button class="voteBtn" data-act="center" data-id="${s.id}">📍 Map</button>
        <button class="voteBtn" data-act="share" data-id="${s.id}">📤 Share</button>
      </div>

      <div class="cardSub" id="msg_${s.id}"></div>
    `;
    listEl.appendChild(card);
  });

  totalPill.textContent = `🌙 লাইভ স্পট: ${approvedCache.length}টি`;
}

/** Vote/Report/Center/Share handlers */
listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const id = btn.dataset.id;
  const act = btn.dataset.act;
  if (!id || !act) return;

  const spot = approvedCache.find(x => x.id === id);
  if (!spot) return;

  if (!UID) return alert("অপেক্ষা করুন… UID তৈরি হচ্ছে।");

  if (act === "center") {
    map.setView([spot.lat, spot.lng], 17);
    return;
  }

  if (act === "share") {
    await shareSpot(spot);
    return;
  }

  if (act === "vote") {
    const v = btn.dataset.v; // truth|fake
    await voteOnce(id, v);
    return;
  }

  if (act === "report") {
    await reportOnce(id);
    return;
  }
});

async function voteOnce(spotId, voteType){
  const msgEl = document.getElementById(`msg_${spotId}`);
  msgEl.textContent = "";

  const voteId = `${spotId}_${UID}`;
  const voteRef = doc(db,"votes",voteId);
  const spotRef = doc(db,"spots_approved",spotId);

  const existing = await getDoc(voteRef);
  if (existing.exists()) {
    msgEl.textContent = "✅ আপনি আগে vote দিয়েছেন।";
    return;
  }

  const batch = writeBatch(db);
  batch.set(voteRef, { spotId, uid: UID, voteType, createdAt: serverTimestamp() });

  if (voteType === "truth") batch.update(spotRef, { truthCount: increment(1) });
  if (voteType === "fake") batch.update(spotRef, { fakeCount: increment(1) });

  try{
    await batch.commit();
    msgEl.textContent = "✅ Vote গ্রহণ করা হয়েছে।";
  } catch (err){
    console.error(err);
    msgEl.textContent = "❌ Vote হয়নি (rules/নেট সমস্যা)।";
  }
}

async function reportOnce(spotId){
  const msgEl = document.getElementById(`msg_${spotId}`);
  msgEl.textContent = "";

  const reportId = `${spotId}_${UID}`;
  const reportRef = doc(db,"reports",reportId);
  const spotRef = doc(db,"spots_approved",spotId);

  const existing = await getDoc(reportRef);
  if (existing.exists()) {
    msgEl.textContent = "✅ আপনি আগে রিপোর্ট করেছেন।";
    return;
  }

  const batch = writeBatch(db);
  batch.set(reportRef, { spotId, uid: UID, createdAt: serverTimestamp() });
  batch.update(spotRef, { reportsCount: increment(1) });

  try{
    await batch.commit();
    msgEl.textContent = "✅ রিপোর্ট পাঠানো হয়েছে।";
  } catch (err){
    console.error(err);
    msgEl.textContent = "❌ রিপোর্ট পাঠানো যায়নি।";
  }
}

/** Share */
async function shareSpot(spot){
  const url = new URL(window.location.href);
  url.searchParams.set("spot", spot.id);

  const text = `🌙 ইফতার স্পট: ${spot.name} (${spot.area})\nটাইপ: ${spot.type}\n`;
  const shareData = { title: "ইফতার খুঁজুন — রাজশাহী", text, url: url.toString() };

  try{
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(url.toString());
      alert("✅ লিংক কপি হয়েছে!");
    }
  } catch {
    // ignore cancel
  }
}

/** Time-based UI + countdown */
loadIftarCountdown();
async function loadIftarCountdown() {
  try {
    const res = await fetch("https://api.aladhan.com/v1/timingsByCity?city=Rajshahi&country=Bangladesh&method=2");
    const json = await res.json();
    const maghrib = json?.data?.timings?.Maghrib;
    if (!maghrib) throw new Error("Maghrib missing");

    startCountdown(maghrib);
  } catch {
    iftarCountdownEl.textContent = "⚠️ কাউন্টডাউন লোড হয়নি";
  }
}

function startCountdown(maghribHHMM){
  function tick(){
    const now = new Date();
    const [hh,mm] = maghribHHMM.split(":").map(Number);
    const target = new Date(now);
    target.setHours(hh,mm,0,0);

    // if already passed today => countdown to next day
    let diff = target - now;
    if (diff <= 0) {
      // “ইফতার শেষ হয়েছে” text window: next 30 minutes after maghrib
      const endWindow = new Date(target);
      endWindow.setMinutes(endWindow.getMinutes() + 30);
      if (now <= endWindow) {
        sheetTitleMain.textContent = "✅ আজকের ইফতার শুরু হয়েছে";
      } else {
        sheetTitleMain.textContent = "🌙 আজকের ইফতার শেষ হয়েছে";
      }
      // next day countdown
      target.setDate(target.getDate() + 1);
      diff = target - now;
    } else {
      sheetTitleMain.textContent = "আজকের সক্রিয় স্পট";
    }

    const h = Math.floor(diff/3600000);
    const m = Math.floor((diff%3600000)/60000);
    const s = Math.floor((diff%60000)/1000);

    iftarCountdownEl.textContent = `🌙 ইফতার (${maghribHHMM}) বাকি: ${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }
  tick();
  setInterval(tick, 1000);
}
function pad2(n){ return String(n).padStart(2,"0"); }

/** Visitor count (Total + Online) */
const DEVICE_KEY = "ifter_device_id_v2";
const VISIT_DAY_KEY = "ifter_visit_day_v2";
const deviceId = getOrCreateDeviceId();

initVisitors();
async function initVisitors(){
  // total visits (once per day per device)
  try{
    const statsRef = doc(db,"stats","global");
    const dayKey = new Date().toISOString().slice(0,10);
    const last = localStorage.getItem(VISIT_DAY_KEY);

    if (last !== dayKey) {
      await setDoc(statsRef, { totalVisits: increment(1), updatedAt: serverTimestamp() }, { merge:true });
      localStorage.setItem(VISIT_DAY_KEY, dayKey);
    }

    onSnapshot(statsRef, (snap)=>{
      const d = snap.data() || {};
      totalVisitsEl.textContent = `👁️ Visits: ${Number(d.totalVisits || 0)}`;
    });

    // presence heartbeat
    const presRef = doc(db,"presence", deviceId);
    await setDoc(presRef, { uid: UID || null, deviceId, lastSeen: serverTimestamp() }, { merge:true });

    setInterval(async ()=>{
      try { await setDoc(presRef, { uid: UID || null, lastSeen: serverTimestamp() }, { merge:true }); } catch {}
    }, 25000);

    onSnapshot(collection(db,"presence"), (snap)=>{
      const now = Date.now();
      let online = 0;
      snap.forEach(d=>{
        const ms = d.data()?.lastSeen?.toMillis ? d.data().lastSeen.toMillis() : 0;
        if (ms && now - ms <= 2*60*1000) online++;
      });
      onlineNowEl.textContent = `🟢 Online: ${online}`;
    });

  }catch(err){
    console.error(err);
    totalVisitsEl.textContent = "👁️ Visits: -";
    onlineNowEl.textContent = "🟢 Online: -";
  }
}

/** URL param: ?spot=ID => auto center */
autoCenterFromURL();
async function autoCenterFromURL(){
  const params = new URLSearchParams(window.location.search);
  const spotId = params.get("spot");
  if (!spotId) return;

  const snap = await getDoc(doc(db,"spots_approved", spotId));
  if (!snap.exists()) return;
  const s = snap.data();
  map.setView([s.lat, s.lng], 17);
}

/** Helpers */
function formatDistance(m){
  if (m < 1000) return `📍 ${Math.round(m)}m দূরে`;
  return `📍 ${(m/1000).toFixed(1)}km দূরে`;
}
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function getOrCreateDeviceId(){
  let id = localStorage.getItem(DEVICE_KEY);
  if (id) return id;
  id = "dev_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}
