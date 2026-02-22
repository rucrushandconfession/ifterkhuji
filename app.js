import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, getDocs, query, where,
  doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* =============================
   Firebase (YOUR CONFIG)
============================= */
const firebaseConfig = {
  apiKey: "YOUR_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let me = null;

// auth
signInAnonymously(auth).catch(console.error);
onAuthStateChanged(auth, (u) => { me = u; });

/* =============================
   Rajshahi-only Map
============================= */
const rajshahiCenter = [24.3745, 88.6042];
const rajshahiBounds = L.latLngBounds([24.30, 88.50], [24.45, 88.70]);

const map = L.map("map", {
  zoomControl: false,
  maxBounds: rajshahiBounds,
  maxBoundsViscosity: 1.0,
}).setView(rajshahiCenter, 13);

L.control.zoom({ position: "bottomright" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap",
}).addTo(map);

map.on("drag", () => map.panInsideBounds(rajshahiBounds, { animate: false }));

/* =============================
   Countdown (Rajshahi Maghrib)
============================= */
const countdownEl = document.getElementById("countdown");

async function startCountdown() {
  try {
    const res = await fetch("https://api.aladhan.com/v1/timingsByCity?city=Rajshahi&country=Bangladesh&method=2");
    const js = await res.json();
    const maghrib = js?.data?.timings?.Maghrib;
    if (!maghrib) throw new Error("No Maghrib");

    setInterval(() => {
      const now = new Date();
      const [mh, mm] = maghrib.split(":").map(Number);
      const target = new Date(now);
      target.setHours(mh, mm, 0, 0);
      if (target.getTime() < now.getTime()) target.setDate(target.getDate() + 1);

      const diff = target.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      countdownEl.textContent = `${h}ঘ ${m}মি ${s}সে`;
    }, 1000);
  } catch (e) {
    countdownEl.textContent = "—";
  }
}
startCountdown();

/* =============================
   Bottom Sheet Drag
============================= */
const sheet = document.getElementById("sheet");
const handle = document.getElementById("sheetHandle");

const MIN_H = Math.round(window.innerHeight * 0.16);
const MID_H = Math.round(window.innerHeight * 0.42);
const MAX_H = Math.round(window.innerHeight * 0.86);

let currentH = MID_H;
setSheetHeight(currentH);

function setSheetHeight(h){
  currentH = Math.max(MIN_H, Math.min(MAX_H, h));
  sheet.style.height = `${currentH}px`;
}

let startY = 0, startH = 0, dragging = false;

function onStart(e){
  dragging = true;
  sheet.style.transition = "none";
  startY = (e.touches ? e.touches[0].clientY : e.clientY);
  startH = currentH;

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onEnd);
  document.addEventListener("touchmove", onMove, { passive: false });
  document.addEventListener("touchend", onEnd);
}

function onMove(e){
  if (!dragging) return;
  if (e.cancelable) e.preventDefault();
  const y = (e.touches ? e.touches[0].clientY : e.clientY);
  const dy = startY - y;
  setSheetHeight(startH + dy);
}

function snapToNearest(){
  const dMin = Math.abs(currentH - MIN_H);
  const dMid = Math.abs(currentH - MID_H);
  const dMax = Math.abs(currentH - MAX_H);
  let target = MID_H;
  if (dMin <= dMid && dMin <= dMax) target = MIN_H;
  else if (dMax <= dMid && dMax <= dMin) target = MAX_H;

  sheet.style.transition = "height 220ms cubic-bezier(.2,.8,.2,1)";
  setSheetHeight(target);
  setTimeout(()=> sheet.style.transition = "", 240);
}

function onEnd(){
  dragging = false;
  snapToNearest();
  document.removeEventListener("mousemove", onMove);
  document.removeEventListener("mouseup", onEnd);
  document.removeEventListener("touchmove", onMove);
  document.removeEventListener("touchend", onEnd);
}

handle.addEventListener("mousedown", onStart);
handle.addEventListener("touchstart", onStart, { passive: true });

/* =============================
   Spots + Voting
============================= */
const listEl = document.getElementById("list");
const countEl = document.getElementById("spotCount");

let spots = []; // {id,name,area,lat,lng, truthCount,fakeCount, myVote}

await loadSpotsAndVotes();
renderMarkers();
renderList();

async function loadSpotsAndVotes(){
  // 1) load spots
  const spotSnap = await getDocs(collection(db, "spots"));
  spots = [];
  spotSnap.forEach(d => {
    spots.push({ id: d.id, ...d.data(), truthCount: 0, fakeCount: 0, myVote: null });
  });

  // 2) load all votes for these spots (simple approach)
  // votes collection বড় হলে পরে optimize করবো
  const voteSnap = await getDocs(collection(db, "votes"));
  const voteBySpot = new Map();

  voteSnap.forEach(d => {
    const v = d.data();
    if (!v?.spotId || !v?.value) return;
    if (!voteBySpot.has(v.spotId)) voteBySpot.set(v.spotId, []);
    voteBySpot.get(v.spotId).push({ id: d.id, ...v });
  });

  // 3) apply counts + my vote
  for (const s of spots){
    const arr = voteBySpot.get(s.id) || [];
    let truth = 0, fake = 0;
    let myVote = null;

    for (const v of arr){
      if (v.value === "truth") truth++;
      if (v.value === "fake") fake++;
      if (me?.uid && v.uid === me.uid) myVote = v.value;
    }

    s.truthCount = truth;
    s.fakeCount = fake;
    s.myVote = myVote;
  }
}

function renderMarkers(){
  spots.forEach(s => {
    const m = L.marker([s.lat, s.lng]).addTo(map);
    m.bindPopup(`<b>${escapeHtml(s.name)}</b><br>${escapeHtml(s.area)}`);
  });
}

function renderList(){
  countEl.textContent = String(spots.length);

  if (!spots.length){
    listEl.innerHTML = `<div class="empty">কোনো স্পট নেই</div>`;
    return;
  }

  listEl.innerHTML = spots.map(s => `
    <div class="card">
      <div class="icon">🍽️</div>

      <div class="main">
        <div class="title">${escapeHtml(s.name || "")}</div>
        <div class="meta">
          <span>📍 ${escapeHtml(s.area || "")}</span>
        </div>

        <div class="voteRow" style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="voteBtn good ${s.myVote==="truth" ? "active":""}" data-id="${s.id}" data-v="truth">
            👍 ${s.truthCount} সত্যি
          </button>
          <button class="voteBtn bad ${s.myVote==="fake" ? "active":""}" data-id="${s.id}" data-v="fake">
            👎 ${s.fakeCount} ভুয়া
          </button>
        </div>
      </div>
    </div>
  `).join("");

  // bind events
  listEl.querySelectorAll(".voteBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const v = btn.getAttribute("data-v");
      await castVote(id, v);
    });
  });
}

async function castVote(spotId, value){
  if (!me?.uid){
    // auth slow হলে
    return;
  }

  const voteId = `${spotId}_${me.uid}`;

  try{
    await setDoc(doc(db, "votes", voteId), {
      spotId,
      uid: me.uid,
      value,
      createdAt: serverTimestamp()
    });

    // optimistic update
    const s = spots.find(x => x.id === spotId);
    if (!s) return;

    // previous vote remove
    if (s.myVote === "truth") s.truthCount = Math.max(0, s.truthCount - 1);
    if (s.myVote === "fake") s.fakeCount = Math.max(0, s.fakeCount - 1);

    // new vote add
    if (value === "truth") s.truthCount += 1;
    if (value === "fake") s.fakeCount += 1;

    s.myVote = value;

    renderList();
  }catch(e){
    console.error(e);
  }
}

function escapeHtml(str){
  return String(str||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
// =============================
// Add Spot Button Action
// =============================
const addSpotBtn = document.getElementById("addSpotBtn");

addSpotBtn.addEventListener("click", () => {
  alert("স্পট যোগ করার ফর্ম পরের ধাপে যুক্ত হবে 🙂");
});
