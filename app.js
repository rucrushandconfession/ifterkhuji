// =============================
// app.js (FULL REPLACE)
// ✅ Loading overlay on entry
// ✅ Food pin by iftarType
// ✅ Map click anywhere -> open modal + auto set location
// ✅ Pick mode dim only (blur OFF in CSS)
// ✅ Premium popup
// ✅ FIX: submit button text never shows "সাইনিং হচ্ছে…"
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
   0) Firebase Config (EXACT)
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
   Loading overlay
============================= */
const loadingOverlay = document.getElementById("loadingOverlay");
const showLoading = () => loadingOverlay?.classList.remove("hidden");
const hideLoading = () => loadingOverlay?.classList.add("hidden");
showLoading();

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

const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap",
  updateWhenIdle: true,
  keepBuffer: 2,
}).addTo(map);

map.on("drag", () => map.panInsideBounds(rajshahiBounds, { animate: false }));
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
   3) Bottom Sheet Drag
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

const addSpotBtn = document.getElementById("addSpotBtn");
const modal = document.getElementById("addSpotModal");
const closeModalBtn = document.getElementById("closeModal");

const spotNameEl = document.getElementById("spotName");
const spotAreaEl = document.getElementById("spotArea");
const iftarTypeEl = document.getElementById("iftarType");

const pickLocationBtn = document.getElementById("pickLocationBtn");
const pickedLatLngEl = document.getElementById("pickedLatLng");
const submitSpotBtn = document.getElementById("submitSpotBtn");

/* =============================
   5) Auth state → FIX: no "সাইনিং হচ্ছে…"
============================= */
function syncSubmitBtnState() {
  if (!submitSpotBtn) return;

  // লেখা সবসময় আগের মতো থাকবে
  submitSpotBtn.textContent = "স্পট যোগ করুন";

  // auth না থাকলে শুধু disable
  submitSpotBtn.disabled = !auth.currentUser?.uid;
}

onAuthStateChanged(auth, (u) => {
  me = u;
  authReady = !!u?.uid;
  syncSubmitBtnState();
});

/* =============================
   6) Data + markers + list
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

function getBadge(truth, fake) {
  const t = Number(truth || 0);
  const f = Number(fake || 0);
  if (t === 0 && f === 0) return { text: "নতুন", cls: "neutral", icon: "⏳" };
  if (f > t) return { text: "ভুয়া", cls: "bad", icon: "⚠️" };
  return { text: "নিশ্চিত", cls: "good", icon: "✓" };
}

function typeLabel(t) {
  if (t === "biriyani") return "বিরিয়ানি";
  if (t === "chinese") return "চাইনিজ";
  if (t === "mixed") return "মিশ্র";
  return "মিশ্র";
}

function typeEmoji(t) {
  if (t === "biriyani") return "🍛";
  if (t === "chinese") return "🍜";
  if (t === "mixed") return "🍽️";
  return "🍽️";
}

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

    if (!s.iftarType) s.iftarType = "mixed";
  }

  spots = newSpots;
}

/* =============================
   Food pin icon (by type)
============================= */
function makeFoodPinIcon(iftarType) {
  const emoji = typeEmoji(iftarType);
  return L.divIcon({
    className: "",
    html: `
      <div class="foodPin">
        <div class="foodPinInner">${emoji}</div>
      </div>
    `,
    iconSize: [38, 50],
    iconAnchor: [19, 48],
    popupAnchor: [0, -52],
  });
}

/* =============================
   Premium popup
============================= */
function buildPopupHtml(spot) {
  const truth = spot.truthCount ?? 0;
  const fake = spot.fakeCount ?? 0;
  const badge = getBadge(truth, fake);

  const title = escapeHtml(spot.name || "");
  const area = escapeHtml(spot.area || "");
  const tLabel = escapeHtml(typeLabel(spot.iftarType || "mixed"));

  return `
    <div class="spotCard">
      <div class="spotCardHeader">
        <div class="left">
          <div class="u">👤 <span>User</span></div>
          <div class="spotName">${title}</div>
        </div>
        <div class="badge">${badge.icon} ${badge.text}</div>
      </div>

      <div class="spotCardBody">
        <div class="spotRow">
          <div>📍 ${area}</div>
          <div style="color:#64748b;font-weight:800;white-space:nowrap;">
            ${typeEmoji(spot.iftarType)} ${tLabel}
          </div>
        </div>

        <div class="spotActions">
          <button class="spotAct good" data-act="truth" data-id="${spot.id}">
            👍 ${truth} সত্যি
          </button>
          <button class="spotAct bad" data-act="fake" data-id="${spot.id}">
            👎 ${fake} ভুয়া
          </button>
        </div>
      </div>
    </div>
  `;
}

let openedPopup = null;

function openSpotPopup(latlng, spot) {
  if (openedPopup) {
    try { map.closePopup(openedPopup); } catch {}
    openedPopup = null;
  }

  const popup = L.popup({
    className: "spotPopup",
    closeButton: false,
    autoPan: true,
    offset: L.point(0, -10),
    maxWidth: 360,
  })
    .setLatLng(latlng)
    .setContent(buildPopupHtml(spot));

  openedPopup = popup;
  popup.openOn(map);

  setTimeout(() => {
    const root = document.querySelector(".leaflet-popup.spotPopup");
    if (!root) return;

    root.querySelectorAll(".spotAct").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const spotId = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        await castVote(spotId, act);
      });
    });
  }, 0);
}

function renderMarkers() {
  markerLayer.clearLayers();

  for (const s of spots) {
    if (typeof s.lat !== "number" || typeof s.lng !== "number") continue;
    const icon = makeFoodPinIcon(s.iftarType || "mixed");
    const m = L.marker([s.lat, s.lng], { icon });
    m.on("click", () => openSpotPopup([s.lat, s.lng], s));
    markerLayer.addLayer(m);
  }
}

function renderList() {
  countEl.textContent = String(spots.length);

  if (!spots.length) {
    listEl.innerHTML = `<div class="empty">কোনো স্পট নেই</div>`;
    return;
  }

  listEl.innerHTML = spots.map((s) => {
    const truth = s.truthCount ?? 0;
    const fake = s.fakeCount ?? 0;
    const badge = getBadge(truth, fake);
    const tLabel = escapeHtml(typeLabel(s.iftarType || "mixed"));

    return `
      <div class="card" data-spot="${s.id}">
        <div class="cardHeader">
          <div class="cardUser">👤 User</div>
          <div class="cardBadge ${badge.cls}">
            <span>${badge.icon}</span> ${badge.text}
          </div>
        </div>

        <div class="cardBody">
          <div class="title">${escapeHtml(s.name || "")}</div>
          <div class="meta">📍 ${escapeHtml(s.area || "")} • ${typeEmoji(s.iftarType)} ${tLabel}</div>

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
  }).join("");

  listEl.querySelectorAll(".voteBtn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const spotId = btn.getAttribute("data-id");
      const value = btn.getAttribute("data-v");
      await castVote(spotId, value);
    });
  });

  listEl.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.getAttribute("data-spot");
      const s = spots.find(x => x.id === id);
      if (!s) return;
      map.setView([s.lat, s.lng], Math.max(map.getZoom(), 14), { animate: true });
      openSpotPopup([s.lat, s.lng], s);
    });
  });
}

/* =============================
   Voting
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

  if (s.myVote === "truth") s.truthCount = Math.max(0, (s.truthCount || 0) - 1);
  if (s.myVote === "fake") s.fakeCount = Math.max(0, (s.fakeCount || 0) - 1);

  if (value === "truth") s.truthCount = (s.truthCount || 0) + 1;
  if (value === "fake") s.fakeCount = (s.fakeCount || 0) + 1;

  s.myVote = value;
  renderList();

  if (openedPopup) {
    try {
      openedPopup.setContent(buildPopupHtml(s));
      setTimeout(() => {
        const root = document.querySelector(".leaflet-popup.spotPopup");
        if (!root) return;
        root.querySelectorAll(".spotAct").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = btn.getAttribute("data-id");
            const act = btn.getAttribute("data-act");
            await castVote(id, act);
          });
        });
      }, 0);
    } catch {}
  }

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
   Add Spot Modal + Map Pick
============================= */
let pickMode = false;
let pickedLatLng = null;
let pickPreviewMarker = null;

function setPicked(lat, lng) {
  pickedLatLng = { lat, lng };
  if (pickedLatLngEl) pickedLatLngEl.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  if (pickPreviewMarker) markerLayer.removeLayer(pickPreviewMarker);
  pickPreviewMarker = L.marker([lat, lng], { icon: makeFoodPinIcon(iftarTypeEl?.value || "mixed") });
  markerLayer.addLayer(pickPreviewMarker);
}

function openModal() {
  modal?.classList.remove("hidden");
  syncSubmitBtnState();
}

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

addSpotBtn?.addEventListener("click", () => openModal());
closeModalBtn?.addEventListener("click", closeModal);

pickLocationBtn?.addEventListener("click", () => {
  pickMode = true;
  modal?.classList.add("pickMode");
  if (pickedLatLngEl) pickedLatLngEl.textContent = "📍 এখন ম্যাপে ক্লিক করুন";
});

// ✅ Map click: open modal + auto set location (inside Rajshahi)
map.on("click", (e) => {
  const { lat, lng } = e.latlng;

  if (!isInRajshahi(lat, lng)) {
    if (!modal?.classList.contains("hidden")) {
      if (pickedLatLngEl) pickedLatLngEl.textContent = "⚠️ রাজশাহীর ভিতরে লোকেশন দিন";
    }
    return;
  }

  if (pickMode) {
    pickMode = false;
    modal?.classList.remove("pickMode");
    setPicked(lat, lng);
    return;
  }

  openModal();
  setPicked(lat, lng);
});

iftarTypeEl?.addEventListener("change", () => {
  if (!pickedLatLng) return;
  const { lat, lng } = pickedLatLng;
  if (pickPreviewMarker) markerLayer.removeLayer(pickPreviewMarker);
  pickPreviewMarker = L.marker([lat, lng], { icon: makeFoodPinIcon(iftarTypeEl.value || "mixed") });
  markerLayer.addLayer(pickPreviewMarker);
});

submitSpotBtn?.addEventListener("click", submitSpot);

async function submitSpot() {
  // ✅ FIX: never show "সাইনিং হচ্ছে…"
  submitSpotBtn.textContent = "স্পট যোগ করুন";

  try {
    const u = await ensureAuthReady();
    me = u;
    authReady = true;
  } catch (e) {
    console.error(e);
    syncSubmitBtnState();
    return;
  }

  const name = (spotNameEl?.value || "").trim();
  const area = (spotAreaEl?.value || "").trim();
  const iftarType = (iftarTypeEl?.value || "").trim();

  if (!name || !area || !iftarType) {
    submitSpotBtn.disabled = false;
    submitSpotBtn.textContent = "⚠️ সব ঘর পূরণ করুন";
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
      iftarType,
      lat: pickedLatLng.lat,
      lng: pickedLatLng.lng,
      createdBy: me.uid,
      createdAt: serverTimestamp(),
    });

    spots.unshift({
      id: docRef.id,
      name,
      area,
      iftarType,
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
    if (iftarTypeEl) iftarTypeEl.value = "";

    closeModal();
  } catch (e) {
    console.error("Spot submit failed:", e);
    submitSpotBtn.disabled = false;
    submitSpotBtn.textContent = "⚠️ পারমিশন/নেট সমস্যা";
    setTimeout(syncSubmitBtnState, 1200);
  } finally {
    // ensure state text is restored after errors
    syncSubmitBtnState();
  }
}

/* =============================
   Refresh + Boot
============================= */
async function refreshAll() {
  await loadSpotsAndVotes();
  renderMarkers();
  renderList();
}

function waitForTilesLoaded(timeoutMs = 9000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(true);
    };
    tiles.once("load", finish);
    setTimeout(finish, timeoutMs);
  });
}

(async function boot() {
  try {
    await refreshAll();
    await waitForTilesLoaded();
    setTimeout(hideLoading, 250);
  } catch (e) {
    console.error("Boot error:", e);
    listEl.innerHTML = `<div class="empty">ডাটা লোড হচ্ছে না</div>`;
    setTimeout(hideLoading, 1200);
  }
})();
