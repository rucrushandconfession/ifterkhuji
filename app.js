// =============================
// app.js (FULL REPLACE - FIXED + PREMIUM POPUP)
// Project: free-ifter (Rajshahi Iftar)
// - Rajshahi locked map
// - Iftar countdown (Rajshahi Maghrib)
// - Smooth bottom sheet drag
// - Add spot modal + map click pick (FIXED: modal no longer blocks map)
// - Firestore spots load + add
// - Voting (truth/fake) 1 per user (docId spotId_uid)
// - Premium popup like your 2nd screenshot (green header + votes)
// - Auth "signing..." stuck fix (await ensureAuthReady)
// =============================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* =============================
   0) Firebase Config (YOUR PROJECT)
============================= */
const firebaseConfig = {
  apiKey: "AIzaSyA6SZeKVmNAsd4eAlieCTC7zQzYMenwJEA",
  authDomain: "free-ifter.firebaseapp.com",
  projectId: "free-ifter",
  storageBucket: "free-ifter.firebasestorage.app",
  messagingSenderId: "380765313810",
  appId: "1:380765313810:web:6b7a87bf350cba858f71cb",
  measurementId: "G-18J6SR9913",
};

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);

let me = null;
let authReady = false;

/* =============================
   Helper: wait for auth (NO STUCK)
============================= */
function ensureAuthReady(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (auth.currentUser?.uid) return resolve(auth.currentUser);

    const t = setTimeout(() => {
      unsub?.();
      reject(new Error("Auth timeout"));
    }, timeoutMs);

    const unsub = onAuthStateChanged(auth, (u) => {
      if (u?.uid) {
        clearTimeout(t);
        unsub?.();
        resolve(u);
      }
    });
  });
}

// Start anonymous sign-in
signInAnonymously(auth).catch((e) => console.error("Anonymous auth error:", e));

/* =============================
   1) Rajshahi Map (LOCKED)
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

// Fix blank/grey tiles on load
setTimeout(() => map.invalidateSize(true), 350);

function isInRajshahi(lat, lng) {
  return lat >= 24.30 && lat <= 24.45 && lng >= 88.50 && lng <= 88.70;
}

/* =============================
   2) Iftar Countdown (Rajshahi)
============================= */
const countdownEl = document.getElementById("countdown");

async function startCountdown() {
  try {
    const res = await fetch(
      "https://api.aladhan.com/v1/timingsByCity?city=Rajshahi&country=Bangladesh&method=2"
    );
    const js = await res.json();
    const maghrib = js?.data?.timings?.Maghrib;
    if (!maghrib) throw new Error("Maghrib missing");

    const [mh, mm] = maghrib.split(":").map(Number);

    setInterval(() => {
      const now = new Date();
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
    console.warn("Countdown error:", e);
    countdownEl.textContent = "--";
  }
}
startCountdown();

/* =============================
   3) Bottom Sheet Drag (Smooth)
============================= */
const sheet = document.getElementById("sheet");
const handle = document.getElementById("sheetHandle");

const MIN_H = Math.round(window.innerHeight * 0.16);
const MID_H = Math.round(window.innerHeight * 0.42);
const MAX_H = Math.round(window.innerHeight * 0.86);

let currentH = MID_H;
setSheetHeight(currentH);

function setSheetHeight(h) {
  currentH = Math.max(MIN_H, Math.min(MAX_H, h));
  sheet.style.height = `${currentH}px`;
}

let startY = 0;
let startH = 0;
let dragging = false;

function onStart(e) {
  dragging = true;
  sheet.style.transition = "none";
  startY = e.touches ? e.touches[0].clientY : e.clientY;
  startH = currentH;

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onEnd);
  document.addEventListener("touchmove", onMove, { passive: false });
  document.addEventListener("touchend", onEnd);
}

function onMove(e) {
  if (!dragging) return;
  if (e.cancelable) e.preventDefault();
  const y = e.touches ? e.touches[0].clientY : e.clientY;
  const dy = startY - y;
  setSheetHeight(startH + dy);
}

function snapToNearest() {
  const dMin = Math.abs(currentH - MIN_H);
  const dMid = Math.abs(currentH - MID_H);
  const dMax = Math.abs(currentH - MAX_H);

  let target = MID_H;
  if (dMin <= dMid && dMin <= dMax) target = MIN_H;
  else if (dMax <= dMid && dMax <= dMin) target = MAX_H;

  sheet.style.transition = "height 220ms cubic-bezier(.2,.8,.2,1)";
  setSheetHeight(target);
  setTimeout(() => (sheet.style.transition = ""), 240);
}

function onEnd() {
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
   4) UI Refs
============================= */
const listEl = document.getElementById("list");
const countEl = document.getElementById("spotCount");

// modal refs
const addSpotBtn = document.getElementById("addSpotBtn");
const modal = document.getElementById("addSpotModal");
const closeModalBtn = document.getElementById("closeModal");

const spotNameEl = document.getElementById("spotName");
const spotAreaEl = document.getElementById("spotArea");
const pickLocationBtn = document.getElementById("pickLocationBtn");
const pickedLatLngEl = document.getElementById("pickedLatLng");
const submitSpotBtn = document.getElementById("submitSpotBtn");

/* =============================
   5) Auth state → button sync
============================= */
function syncSubmitBtnState() {
  if (!submitSpotBtn) return;
  if (auth.currentUser?.uid) {
    submitSpotBtn.disabled = false;
    submitSpotBtn.textContent = "স্পট যোগ করুন";
  } else {
    submitSpotBtn.disabled = true;
    submitSpotBtn.textContent = "সাইনিং হচ্ছে…";
  }
}

onAuthStateChanged(auth, (u) => {
  me = u;
  authReady = !!u?.uid;
  syncSubmitBtnState();
});

/* =============================
   6) Helpers + Premium Popup HTML
============================= */
let spots = [];
let markerLayer = L.layerGroup().addTo(map);

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function timeAgoFromTimestamp(ts) {
  try {
    if (!ts) return "এইমাত্র";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const diff = Date.now() - d.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "এইমাত্র";
    if (m < 60) return `${m} মিনিট আগে`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ঘন্টা আগে`;
    const day = Math.floor(h / 24);
    return `${day} দিন আগে`;
  } catch {
    return "এইমাত্র";
  }
}

function buildPremiumPopupHTML(spot) {
  const title = escapeHtml(spot.name || "");
  const area = escapeHtml(spot.area || "");
  const truth = spot.truthCount ?? 0;
  const fake = spot.fakeCount ?? 0;

  const author = "User";
  const timeAgo = timeAgoFromTimestamp(spot.createdAt);

  return `
  <div class="pPopup">
    <div class="pHead">
      <div class="pHeadRow">
        <div class="pAuthor">👤 ${author}</div>
        <div class="pBadge">✓ নিশ্চিত</div>
      </div>
      <div class="pTitle">${title}</div>
    </div>

    <div class="pBody">
      <div class="pMetaRow">
        <div class="pMeta">📍 ${area}</div>
        <div class="pMeta">🕒 ${timeAgo}</div>
      </div>

      <div class="pVotes">
        <button class="pVote good" data-id="${spot.id}" data-v="truth" ${authReady ? "" : "disabled"}>
          👍 <span>${truth}</span> সত্যি
        </button>
        <button class="pVote bad" data-id="${spot.id}" data-v="fake" ${authReady ? "" : "disabled"}>
          👎 <span>${fake}</span> ভুয়া
        </button>
      </div>
    </div>
  </div>
  `;
}

/* =============================
   7) Load Spots + Votes
============================= */
async function loadSpotsAndVotes() {
  const spotSnap = await getDocs(collection(db, "spots"));
  const newSpots = [];
  spotSnap.forEach((d) => {
    const data = d.data() || {};
    newSpots.push({
      id: d.id,
      ...data,
      truthCount: 0,
      fakeCount: 0,
      myVote: null,
    });
  });

  const voteSnap = await getDocs(collection(db, "votes"));
  const votesBySpot = new Map();

  voteSnap.forEach((d) => {
    const v = d.data();
    if (!v?.spotId || !v?.value) return;
    if (!votesBySpot.has(v.spotId)) votesBySpot.set(v.spotId, []);
    votesBySpot.get(v.spotId).push(v);
  });

  for (const s of newSpots) {
    const arr = votesBySpot.get(s.id) || [];
    let t = 0, f = 0, my = null;

    for (const v of arr) {
      if (v.value === "truth") t++;
      if (v.value === "fake") f++;
      if (me?.uid && v.uid === me.uid) my = v.value;
    }

    s.truthCount = t;
    s.fakeCount = f;
    s.myVote = my;
  }

  spots = newSpots;
}

/* =============================
   8) Markers + Premium Popup
============================= */
function renderMarkers() {
  markerLayer.clearLayers();

  for (const s of spots) {
    if (typeof s.lat !== "number" || typeof s.lng !== "number") continue;

    const m = L.marker([s.lat, s.lng]);

    m.bindPopup(buildPremiumPopupHTML(s), {
      className: "premiumPopup",
      closeButton: true,
      autoPan: true,
      offset: [0, -10],
    });

    m.on("popupopen", (ev) => {
      const root = ev.popup.getElement();
      if (!root) return;

      const attachHandlers = () => {
        root.querySelectorAll(".pVote").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const spotId = btn.getAttribute("data-id");
            const value = btn.getAttribute("data-v");

            await castVote(spotId, value);

            const updated = spots.find((x) => x.id === spotId);
            if (updated) {
              ev.popup.setContent(buildPremiumPopupHTML(updated));
              setTimeout(attachHandlers, 0);
            }
          });
        });
      };

      attachHandlers();
    });

    markerLayer.addLayer(m);
  }
}

/* =============================
   9) Render List (Bottom Sheet)
============================= */
function renderList() {
  countEl.textContent = String(spots.length);

  if (!spots.length) {
    listEl.innerHTML = `<div class="empty">কোনো স্পট নেই</div>`;
    return;
  }

  listEl.innerHTML = spots
    .map((s) => {
      const truth = s.truthCount ?? 0;
      const fake = s.fakeCount ?? 0;

      return `
      <div class="card">
        <div class="icon">🍽️</div>
        <div class="main">
          <div class="title">${escapeHtml(s.name || "")}</div>
          <div class="meta">📍 ${escapeHtml(s.area || "")}</div>

          <div class="voteRow">
            <button class="voteBtn good ${s.myVote === "truth" ? "active" : ""}"
              data-id="${s.id}" data-v="truth" ${authReady ? "" : "disabled"}>
              👍 ${truth} সত্যি
            </button>

            <button class="voteBtn bad ${s.myVote === "fake" ? "active" : ""}"
              data-id="${s.id}" data-v="fake" ${authReady ? "" : "disabled"}>
              👎 ${fake} ভুয়া
            </button>
          </div>
        </div>
      </div>
    `;
    })
    .join("");

  listEl.querySelectorAll(".voteBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const spotId = btn.getAttribute("data-id");
      const value = btn.getAttribute("data-v");
      await castVote(spotId, value);
    });
  });
}

/* =============================
   10) Voting (1 per user)
============================= */
async function castVote(spotId, value) {
  try {
    const u = await ensureAuthReady();
    me = u;
    authReady = true;
  } catch {
    return;
  }

  const voteId = `${spotId}_${me.uid}`;
  const s = spots.find((x) => x.id === spotId);
  if (!s) return;

  // optimistic update
  if (s.myVote === "truth") s.truthCount = Math.max(0, (s.truthCount || 0) - 1);
  if (s.myVote === "fake") s.fakeCount = Math.max(0, (s.fakeCount || 0) - 1);

  if (value === "truth") s.truthCount = (s.truthCount || 0) + 1;
  if (value === "fake") s.fakeCount = (s.fakeCount || 0) + 1;

  s.myVote = value;

  renderList();
  renderMarkers();

  try {
    await setDoc(doc(db, "votes", voteId), {
      spotId,
      uid: me.uid,
      value,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Vote write failed:", e);
    await refreshAll();
  }
}

/* =============================
   11) Add Spot Modal + Map Pick
============================= */
let pickMode = false;
let pickedLatLng = null;
let pickPreviewMarker = null;

function closeModal() {
  modal?.classList.add("hidden");
  modal?.classList.remove("pickMode");

  pickMode = false;
  pickedLatLng = null;

  if (pickedLatLngEl) pickedLatLngEl.textContent = "📍 ম্যাপ থেকে লোকেশন দিন";

  if (pickPreviewMarker) {
    markerLayer.removeLayer(pickPreviewMarker);
    pickPreviewMarker = null;
  }
}

addSpotBtn?.addEventListener("click", () => {
  modal?.classList.remove("hidden");
  syncSubmitBtnState();
});

closeModalBtn?.addEventListener("click", closeModal);

pickLocationBtn?.addEventListener("click", () => {
  pickMode = true;
  modal?.classList.add("pickMode");
  if (pickedLatLngEl) pickedLatLngEl.textContent = "📍 এখন ম্যাপে ক্লিক করুন";
});

map.on("click", (e) => {
  if (!pickMode) return;

  const { lat, lng } = e.latlng;

  if (!isInRajshahi(lat, lng)) {
    if (pickedLatLngEl) pickedLatLngEl.textContent = "⚠️ রাজশাহীর ভিতরে লোকেশন দিন";
    return;
  }

  pickMode = false;
  modal?.classList.remove("pickMode");
  pickedLatLng = { lat, lng };

  if (pickedLatLngEl) {
    pickedLatLngEl.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  if (pickPreviewMarker) markerLayer.removeLayer(pickPreviewMarker);
  pickPreviewMarker = L.marker([lat, lng]).bindPopup("নতুন স্পট লোকেশন");
  markerLayer.addLayer(pickPreviewMarker);
});

submitSpotBtn?.addEventListener("click", submitSpot);

async function submitSpot() {
  submitSpotBtn.disabled = true;
  submitSpotBtn.textContent = "সাইনিং হচ্ছে…";

  try {
    const u = await ensureAuthReady();
    me = u;
    authReady = true;
  } catch (e) {
    console.error(e);
    submitSpotBtn.disabled = false;
    submitSpotBtn.textContent = "স্পট যোগ করুন";
    return;
  }

  const name = (spotNameEl?.value || "").trim();
  const area = (spotAreaEl?.value || "").trim();

  if (!name || !area) {
    submitSpotBtn.disabled = false;
    submitSpotBtn.textContent = "⚠️ নাম/এলাকা দিন";
    setTimeout(syncSubmitBtnState, 900);
    return;
  }

  if (!pickedLatLng) {
    submitSpotBtn.disabled = false;
    submitSpotBtn.textContent = "⚠️ লোকেশন দিন";
    setTimeout(syncSubmitBtnState, 900);
    return;
  }

  if (!isInRajshahi(pickedLatLng.lat, pickedLatLng.lng)) {
    submitSpotBtn.disabled = false;
    submitSpotBtn.textContent = "⚠️ রাজশাহীর ভিতরে দিন";
    setTimeout(syncSubmitBtnState, 900);
    return;
  }

  submitSpotBtn.disabled = true;
  submitSpotBtn.textContent = "⏳ সাবমিট হচ্ছে…";

  try {
    const docRef = await addDoc(collection(db, "spots"), {
      name,
      area,
      lat: pickedLatLng.lat,
      lng: pickedLatLng.lng,
      createdBy: me.uid,
      createdAt: serverTimestamp(),
    });

    spots.unshift({
      id: docRef.id,
      name,
      area,
      lat: pickedLatLng.lat,
      lng: pickedLatLng.lng,
      createdBy: me.uid,
      createdAt: new Date(),
      truthCount: 0,
      fakeCount: 0,
      myVote: null,
    });

    renderMarkers();
    renderList();

    if (spotNameEl) spotNameEl.value = "";
    if (spotAreaEl) spotAreaEl.value = "";
    closeModal();
  } catch (e) {
    console.error("Spot submit failed:", e);
    submitSpotBtn.disabled = false;
    submitSpotBtn.textContent = "⚠️ পারমিশন/নেট সমস্যা";
    setTimeout(syncSubmitBtnState, 1200);
  }
}

/* =============================
   12) Refresh + Boot
============================= */
async function refreshAll() {
  await loadSpotsAndVotes();
  renderMarkers();
  renderList();
}

(async function boot() {
  try {
    await loadSpotsAndVotes();
    renderMarkers();
    renderList();
  } catch (e) {
    console.error("Boot error:", e);
    listEl.innerHTML = `<div class="empty">ডাটা লোড হচ্ছে না</div>`;
  }
})();
