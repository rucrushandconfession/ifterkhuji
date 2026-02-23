import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* Firebase Config */
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

const SESSION_CACHE_KEY = "free-ifter:spots-votes:v2";
const SESSION_CACHE_TTL_MS = 3 * 60 * 1000;
const SUBMIT_COOLDOWN_MS = 60 * 1000;
const SUBMIT_COOLDOWN_KEY = "free-ifter:last-submit-ts";
const DATA_CACHE_PATH = "/__spots_cache__";
const SPOTS_FETCH_LIMIT = 250;
const VOTES_FETCH_LIMIT = 500;

let me = null;
let authReady = false;
let fetchedRemoteThisPageLoad = false;

/* Loading overlay */
const loadingOverlay = document.getElementById("loadingOverlay");
const showLoading = () => loadingOverlay?.classList.remove("hidden");
const hideLoading = () => loadingOverlay?.classList.add("hidden");
showLoading();

/* Helpers */
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

function withTimeout(promise, ms, msg = "Timeout") {
  let t;
  const timeoutPromise = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(msg)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(t));
}

function v(el) {
  return (el?.value || "").trim();
}

function debounce(fn, wait = 150) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

let nextRaf = 0;
function rafOnce(fn) {
  cancelAnimationFrame(nextRaf);
  nextRaf = requestAnimationFrame(fn);
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function roundCoord(value) {
  return Number(value).toFixed(5);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (n) => (n * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getRemainingCooldownMs() {
  const lastSubmit = Number(localStorage.getItem(SUBMIT_COOLDOWN_KEY) || 0);
  const remaining = SUBMIT_COOLDOWN_MS - (Date.now() - lastSubmit);
  return Math.max(0, remaining);
}

function setSubmitCooldownNow() {
  localStorage.setItem(SUBMIT_COOLDOWN_KEY, String(Date.now()));
}

function readSessionCache() {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || !Array.isArray(parsed?.spots) || !Array.isArray(parsed?.votes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionCache(spotsRows, voteRows) {
  try {
    sessionStorage.setItem(
      SESSION_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        spots: spotsRows,
        votes: voteRows,
      })
    );
  } catch {
    // ignore quota/storage errors
  }
}

async function readDataCacheFromCacheStorage() {
  if (!("caches" in window)) return null;
  try {
    const cache = await caches.open("free-ifter-data-v1");
    const response = await cache.match(DATA_CACHE_PATH);
    if (!response) return null;
    const parsed = await response.json();
    if (!Array.isArray(parsed?.spots) || !Array.isArray(parsed?.votes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeDataCacheToCacheStorage(spotsRows, voteRows) {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open("free-ifter-data-v1");
    await cache.put(
      DATA_CACHE_PATH,
      new Response(
        JSON.stringify({
          savedAt: Date.now(),
          spots: spotsRows,
          votes: voteRows,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      )
    );
  } catch {
    // ignore cache failures
  }
}

function isSessionCacheFresh(savedAt) {
  return Date.now() - Number(savedAt || 0) <= SESSION_CACHE_TTL_MS;
}

signInAnonymously(auth).catch((e) => console.error("Anonymous auth error:", e));

/* Map */
const rajshahiCenter = [24.3745, 88.6042];
const rajshahiBounds = L.latLngBounds([24.3, 88.5], [24.45, 88.7]);

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
window.addEventListener(
  "resize",
  debounce(() => map.invalidateSize(), 180),
  { passive: true }
);

function isInRajshahi(lat, lng) {
  return lat >= 24.3 && lat <= 24.45 && lng >= 88.5 && lng <= 88.7;
}

/* Countdown */
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

      rafOnce(() => {
        countdownEl.textContent = `${h}ঘ ${m}মি ${s}সে`;
      });
    }, 1000);
  } catch {
    countdownEl.textContent = "--";
  }
}
startCountdown();

/* Bottom sheet drag */
const sheet = document.getElementById("sheet");
const handle = document.getElementById("sheetHandle");
const MIN_H = Math.round(window.innerHeight * 0.16);
const MID_H = Math.round(window.innerHeight * 0.42);
const MAX_H = Math.round(window.innerHeight * 0.86);
let currentH = MID_H;
sheet.style.height = `${currentH}px`;

function setSheetHeight(h) {
  currentH = Math.max(MIN_H, Math.min(MAX_H, h));
  rafOnce(() => {
    sheet.style.height = `${currentH}px`;
  });
}
let startY = 0;
let startH = 0;
let dragging = false;

function onStart(e) {
  dragging = true;
  sheet.style.transition = "none";
  startY = e.touches ? e.touches[0].clientY : e.clientY;
  startH = currentH;
  document.addEventListener("mousemove", onMove, { passive: true });
  document.addEventListener("mouseup", onEnd, { passive: true });
  document.addEventListener("touchmove", onMove, { passive: false });
  document.addEventListener("touchend", onEnd, { passive: true });
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
handle.addEventListener("mousedown", onStart, { passive: true });
handle.addEventListener("touchstart", onStart, { passive: true });

/* UI refs */
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
const sheetMetaEl = document.querySelector(".sheetMeta");

/* Near me sort */
let sortMode = "newest";
let userLocation = null;

if (sheetMetaEl) {
  sheetMetaEl.setAttribute("role", "button");
  sheetMetaEl.setAttribute("tabindex", "0");
}

function updateNearMeState() {
  if (!sheetMetaEl) return;
  sheetMetaEl.setAttribute("aria-pressed", sortMode === "nearest" ? "true" : "false");
}

/* Button state */
function syncSubmitBtnState() {
  if (!submitSpotBtn) return;
  submitSpotBtn.textContent = "স্পট যোগ করুন";
  submitSpotBtn.disabled = false;
}

onAuthStateChanged(auth, (u) => {
  me = u;
  authReady = !!u?.uid;
  syncSubmitBtnState();
});

/* Pick toast + shake message helpers */
let pickToastEl = null;
function showPickToast() {
  if (pickToastEl) return;
  pickToastEl = document.createElement("div");
  pickToastEl.className = "pickToast";
  pickToastEl.textContent = "📍 এখন ম্যাপে ক্লিক করুন";
  document.body.appendChild(pickToastEl);
}
function hidePickToast() {
  pickToastEl?.remove();
  pickToastEl = null;
}

let submitting = false;
function flashBtn(msg, ms = 1200) {
  if (!submitSpotBtn) return;

  submitSpotBtn.disabled = false;
  submitSpotBtn.textContent = msg;
  submitSpotBtn.classList.remove("shake");
  requestAnimationFrame(() => submitSpotBtn.classList.add("shake"));

  submitting = false;

  setTimeout(() => {
    submitSpotBtn.classList.remove("shake");
    syncSubmitBtnState();
  }, ms);
}

/* Data */
let spots = [];
let spotsById = new Map();
const markerLayer = L.layerGroup().addTo(map);
const markerBySpot = new Map();

const firestoreCache = {
  loaded: false,
  spots: null,
  votes: null,
  inFlight: null,
};

function clearFirestoreCache() {
  firestoreCache.loaded = false;
  firestoreCache.spots = null;
  firestoreCache.votes = null;
  firestoreCache.inFlight = null;
}

function applyRowsToMemory(spotsRows, voteRows) {
  firestoreCache.spots = spotsRows;
  firestoreCache.votes = voteRows;
  firestoreCache.loaded = true;
}

async function fetchFirestoreDataOnce() {
  if (firestoreCache.loaded && firestoreCache.spots && firestoreCache.votes) {
    return { spots: firestoreCache.spots, votes: firestoreCache.votes };
  }

  if (firestoreCache.inFlight) return firestoreCache.inFlight;

  const sessionCached = readSessionCache();
  if (sessionCached?.spots && sessionCached?.votes) {
    applyRowsToMemory(sessionCached.spots, sessionCached.votes);
    if (isSessionCacheFresh(sessionCached.savedAt)) {
      return { spots: firestoreCache.spots, votes: firestoreCache.votes };
    }
  }

  if (!sessionCached) {
    const swCached = await readDataCacheFromCacheStorage();
    if (swCached?.spots && swCached?.votes) {
      applyRowsToMemory(swCached.spots, swCached.votes);
      if (isSessionCacheFresh(swCached.savedAt)) {
        writeSessionCache(swCached.spots, swCached.votes);
        return { spots: firestoreCache.spots, votes: firestoreCache.votes };
      }
    }
  }

  if (fetchedRemoteThisPageLoad) {
    return { spots: firestoreCache.spots || [], votes: firestoreCache.votes || [] };
  }

  firestoreCache.inFlight = Promise.all([
    getDocs(query(collection(db, "spots"), orderBy("createdAt", "desc"), limit(SPOTS_FETCH_LIMIT))),
    getDocs(query(collection(db, "votes"), orderBy("createdAt", "desc"), limit(VOTES_FETCH_LIMIT))),
  ])
    .then(([spotSnap, voteSnap]) => {
      const spotRows = [];
      const voteRows = [];

      spotSnap.forEach((d) => {
        spotRows.push({ id: d.id, ...(d.data() || {}) });
      });

      voteSnap.forEach((d) => {
        voteRows.push(d.data() || {});
      });

      applyRowsToMemory(spotRows, voteRows);
      fetchedRemoteThisPageLoad = true;
      writeSessionCache(spotRows, voteRows);
      writeDataCacheToCacheStorage(spotRows, voteRows);

      return { spots: spotRows, votes: voteRows };
    })
    .catch((error) => {
      if (firestoreCache.spots && firestoreCache.votes) {
        return { spots: firestoreCache.spots, votes: firestoreCache.votes };
      }
      throw error;
    })
    .finally(() => {
      firestoreCache.inFlight = null;
    });

  return firestoreCache.inFlight;
}

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
  return "মিশ্র";
}
function typeEmoji(t) {
  if (t === "biriyani") return "🍛";
  if (t === "chinese") return "🍜";
  return "🍽️";
}

function sortSpotsInPlace() {
  if (sortMode === "nearest" && userLocation) {
    for (const s of spots) {
      if (typeof s.lat !== "number" || typeof s.lng !== "number") {
        s.distanceKm = Number.POSITIVE_INFINITY;
        continue;
      }
      s.distanceKm = haversineKm(userLocation.lat, userLocation.lng, s.lat, s.lng);
    }

    spots.sort((a, b) => {
      const diff = (a.distanceKm || Number.POSITIVE_INFINITY) - (b.distanceKm || Number.POSITIVE_INFINITY);
      if (diff !== 0) return diff;
      return toMillis(b.createdAt) - toMillis(a.createdAt);
    });
    return;
  }

  spots.sort((a, b) => {
    const diff = toMillis(b.createdAt) - toMillis(a.createdAt);
    if (diff !== 0) return diff;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
}

async function loadSpotsAndVotes() {
  const { spots: cachedSpots, votes: cachedVotes } = await fetchFirestoreDataOnce();

  const nextSpots = cachedSpots.map((row) => ({
    ...row,
    truthCount: 0,
    fakeCount: 0,
    myVote: null,
  }));

  const votesBySpot = new Map();
  for (const vote of cachedVotes) {
    if (!vote?.spotId || !vote?.value) continue;
    if (!votesBySpot.has(vote.spotId)) votesBySpot.set(vote.spotId, []);
    votesBySpot.get(vote.spotId).push(vote);
  }

  for (const s of nextSpots) {
    const arr = votesBySpot.get(s.id) || [];
    let t = 0;
    let f = 0;
    let my = null;

    for (const vote of arr) {
      if (vote.value === "truth") t++;
      if (vote.value === "fake") f++;
      if (me?.uid && vote.uid === me.uid) my = vote.value;
    }

    s.truthCount = t;
    s.fakeCount = f;
    s.myVote = my;
    if (!s.iftarType) s.iftarType = "mixed";
  }

  spots = nextSpots;
  sortSpotsInPlace();
  spotsById = new Map(spots.map((spot) => [spot.id, spot]));
}

/* Pins */
function makeFoodPinIcon(iftarType) {
  const emoji = typeEmoji(iftarType);
  return L.divIcon({
    className: "",
    html: `<div class="foodPin"><div class="foodPinInner">${emoji}</div></div>`,
    iconSize: [38, 50],
    iconAnchor: [19, 48],
    popupAnchor: [0, -52],
  });
}

/* Popup */
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
    map.closePopup(openedPopup);
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
}

map.on("popupopen", (ev) => {
  const root = ev?.popup?._contentNode;
  if (!root) return;
  root.addEventListener("click", async (e) => {
    const btn = e.target.closest(".spotAct");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const spotId = btn.getAttribute("data-id");
    const act = btn.getAttribute("data-act");
    await castVote(spotId, act);
  });
});

/* Render */
function renderMarkers() {
  markerLayer.clearLayers();
  markerBySpot.clear();

  for (const s of spots) {
    if (typeof s.lat !== "number" || typeof s.lng !== "number") continue;
    const icon = makeFoodPinIcon(s.iftarType || "mixed");
    const marker = L.marker([s.lat, s.lng], { icon });
    marker.on("click", () => openSpotPopup([s.lat, s.lng], s));
    marker.addTo(markerLayer);
    markerBySpot.set(s.id, marker);
  }
}

function createListCard(s) {
  const truth = s.truthCount ?? 0;
  const fake = s.fakeCount ?? 0;
  const badge = getBadge(truth, fake);
  const tLabel = escapeHtml(typeLabel(s.iftarType || "mixed"));

  const card = document.createElement("div");
  card.className = "card";
  card.setAttribute("data-spot", s.id);

  card.innerHTML = `
    <div class="cardHeader">
      <div class="cardUser">👤 User</div>
      <div class="cardBadge ${badge.cls}">
        <span>${badge.icon}</span> ${badge.text}
      </div>
    </div>

    <div class="cardBody">
      <div class="title">${escapeHtml(s.name || "")}</div>
      <div class="meta">📍 ${escapeHtml(s.area || "")} • ${typeEmoji(
    s.iftarType
  )} ${tLabel}</div>

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
  `;

  return card;
}

function renderList() {
  countEl.textContent = String(spots.length);

  if (!spots.length) {
    listEl.innerHTML = `<div class="empty">কোনো স্পট নেই</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  for (const s of spots) frag.appendChild(createListCard(s));

  listEl.replaceChildren(frag);
}

listEl.addEventListener(
  "click",
  async (e) => {
    const voteBtn = e.target.closest(".voteBtn");
    if (voteBtn) {
      e.stopPropagation();
      const spotId = voteBtn.getAttribute("data-id");
      const value = voteBtn.getAttribute("data-v");
      await castVote(spotId, value);
      return;
    }

    const card = e.target.closest(".card");
    if (!card) return;

    const id = card.getAttribute("data-spot");
    const s = spotsById.get(id);
    if (!s) return;
    map.setView([s.lat, s.lng], Math.max(map.getZoom(), 14), { animate: true });
    openSpotPopup([s.lat, s.lng], s);
  },
  { passive: true }
);

/* Voting */
async function castVote(spotId, value) {
  try {
    const u = await ensureAuthReady();
    me = u;
    authReady = true;
  } catch {
    return;
  }

  const voteId = `${spotId}_${me.uid}`;
  const s = spotsById.get(spotId);
  if (!s) return;

  if (s.myVote === "truth") s.truthCount = Math.max(0, (s.truthCount || 0) - 1);
  if (s.myVote === "fake") s.fakeCount = Math.max(0, (s.fakeCount || 0) - 1);
  if (value === "truth") s.truthCount = (s.truthCount || 0) + 1;
  if (value === "fake") s.fakeCount = (s.fakeCount || 0) + 1;

  s.myVote = value;
  renderList();

  try {
    await setDoc(doc(db, "votes", voteId), {
      spotId,
      uid: me.uid,
      value,
      createdAt: serverTimestamp(),
    });

    if (Array.isArray(firestoreCache.votes)) {
      const withoutMine = firestoreCache.votes.filter(
        (vote) => !(vote?.spotId === spotId && vote?.uid === me.uid)
      );
      firestoreCache.votes = [...withoutMine, { spotId, uid: me.uid, value }];
      firestoreCache.loaded = true;
      writeSessionCache(firestoreCache.spots || [], firestoreCache.votes);
      writeDataCacheToCacheStorage(firestoreCache.spots || [], firestoreCache.votes);
    }
  } catch (e) {
    console.error("Vote write failed:", e);
    clearFirestoreCache();
    await refreshAll();
  }
}

/* Add Spot (map click + pick mode) */
let pickMode = false;
let pickedLatLng = null;
let pickPreviewMarker = null;

function setPicked(lat, lng) {
  pickedLatLng = { lat, lng };
  pickedLatLngEl.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  if (pickPreviewMarker) markerLayer.removeLayer(pickPreviewMarker);
  const currentType = iftarTypeEl?.value || "mixed";
  pickPreviewMarker = L.marker([lat, lng], { icon: makeFoodPinIcon(currentType) });
  markerLayer.addLayer(pickPreviewMarker);
}

function openModal() {
  modal.classList.remove("hidden");
  syncSubmitBtnState();
}
function closeModal() {
  modal.classList.add("hidden");
  modal.classList.remove("pickMode");
  modal.classList.remove("picking");
  hidePickToast();
  pickMode = false;
  pickedLatLng = null;
  pickedLatLngEl.textContent = "📍 ম্যাপ থেকে লোকেশন দিন";
  if (pickPreviewMarker) {
    markerLayer.removeLayer(pickPreviewMarker);
    pickPreviewMarker = null;
  }
}

addSpotBtn.addEventListener("click", openModal, { passive: true });
closeModalBtn.addEventListener("click", closeModal, { passive: true });

pickLocationBtn.addEventListener(
  "click",
  () => {
    pickMode = true;

    modal.classList.add("picking");
    modal.classList.remove("pickMode");

    pickedLatLngEl.textContent = "📍 এখন ম্যাপে ক্লিক করুন";
    showPickToast();
  },
  { passive: true }
);

map.on("click", (e) => {
  const { lat, lng } = e.latlng;

  if (!isInRajshahi(lat, lng)) {
    if (!modal.classList.contains("hidden")) {
      pickedLatLngEl.textContent = "⚠️ রাজশাহীর ভিতরে লোকেশন দিন";
    }
    return;
  }

  if (pickMode) {
    pickMode = false;

    modal.classList.remove("picking");
    modal.classList.remove("hidden");
    hidePickToast();

    setPicked(lat, lng);
    return;
  }

  openModal();
  setPicked(lat, lng);
});

iftarTypeEl?.addEventListener(
  "change",
  () => {
    if (!pickedLatLng) return;
    const { lat, lng } = pickedLatLng;
    if (pickPreviewMarker) markerLayer.removeLayer(pickPreviewMarker);
    pickPreviewMarker = L.marker([lat, lng], {
      icon: makeFoodPinIcon(v(iftarTypeEl) || "mixed"),
    });
    markerLayer.addLayer(pickPreviewMarker);
  },
  { passive: true }
);

/* Submit */
submitSpotBtn.addEventListener("click", submitSpot);

async function submitSpot() {
  if (submitting) return;
  submitting = true;

  const failSafe = setTimeout(() => {
    submitSpotBtn.disabled = false;
    submitSpotBtn.textContent = "⚠️ নেট সমস্যা (আবার চেষ্টা করুন)";
    submitting = false;
    setTimeout(syncSubmitBtnState, 1500);
  }, 12000);

  try {
    const name = (spotNameEl?.value || "").trim();
    const area = (spotAreaEl?.value || "").trim();
    const iftarType = (iftarTypeEl?.value || "mixed").trim();

    if (!name) return flashBtn("⚠️ স্পটের নাম দিন");
    if (!area) return flashBtn("⚠️ এলাকা দিন");
    if (!pickedLatLng) return flashBtn("⚠️ লোকেশন দিন");

    const remainingCooldownMs = getRemainingCooldownMs();
    if (remainingCooldownMs > 0) {
      return flashBtn(`⚠️ ${Math.ceil(remainingCooldownMs / 1000)} সেকেন্ড পরে দিন`, 1500);
    }

    const duplicateExists = spots.some((s) => {
      if (typeof s.lat !== "number" || typeof s.lng !== "number") return false;
      return (
        normalizeText(s.name) === normalizeText(name) &&
        normalizeText(s.area) === normalizeText(area) &&
        roundCoord(s.lat) === roundCoord(pickedLatLng.lat) &&
        roundCoord(s.lng) === roundCoord(pickedLatLng.lng)
      );
    });

    if (duplicateExists) {
      return flashBtn("⚠️ একই স্পট আগেই আছে", 1600);
    }

    const u = await ensureAuthReady();
    me = u;
    authReady = true;

    if (!isInRajshahi(pickedLatLng.lat, pickedLatLng.lng)) {
      return flashBtn("⚠️ রাজশাহীর ভিতরে দিন", 1000);
    }

    submitSpotBtn.disabled = true;
    submitSpotBtn.textContent = "⏳ সাবমিট হচ্ছে…";

    const docRef = await withTimeout(
      addDoc(collection(db, "spots"), {
        name,
        area,
        iftarType,
        lat: pickedLatLng.lat,
        lng: pickedLatLng.lng,
        createdBy: me.uid,
        createdAt: serverTimestamp(),
      }),
      9000,
      "Firestore timeout"
    );

    setSubmitCooldownNow();

    const newSpot = {
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
    };

    spots.unshift(newSpot);
    sortSpotsInPlace();
    spotsById = new Map(spots.map((spot) => [spot.id, spot]));

    if (Array.isArray(firestoreCache.spots)) {
      firestoreCache.spots = [
        {
          id: newSpot.id,
          name: newSpot.name,
          area: newSpot.area,
          iftarType: newSpot.iftarType,
          lat: newSpot.lat,
          lng: newSpot.lng,
          createdBy: newSpot.createdBy,
          createdAt: newSpot.createdAt,
        },
        ...firestoreCache.spots,
      ];
      firestoreCache.loaded = true;
      writeSessionCache(firestoreCache.spots, firestoreCache.votes || []);
      writeDataCacheToCacheStorage(firestoreCache.spots, firestoreCache.votes || []);
    }

    renderMarkers();
    renderList();

    spotNameEl.value = "";
    spotAreaEl.value = "";
    iftarTypeEl.value = "mixed";

    closeModal();
  } catch (e) {
    console.error("Submit failed:", e);

    const msg = String(e?.message || "").toLowerCase();
    if (msg.includes("permission")) flashBtn("⚠️ Permission denied", 1400);
    else if (msg.includes("timeout")) flashBtn("⚠️ নেট স্লো (আবার চেষ্টা করুন)", 1400);
    else flashBtn("⚠️ সাবমিট হয়নি (আবার চেষ্টা করুন)", 1400);
  } finally {
    clearTimeout(failSafe);
    submitting = false;
    syncSubmitBtnState();
  }
}

async function activateNearestSort() {
  if (!navigator.geolocation) {
    sortMode = "newest";
    updateNearMeState();
    return;
  }

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      });
    });

    userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
    sortMode = "nearest";
  } catch {
    sortMode = "newest";
  } finally {
    updateNearMeState();
    sortSpotsInPlace();
    spotsById = new Map(spots.map((spot) => [spot.id, spot]));
    renderList();
  }
}

async function toggleNearestSort() {
  if (sortMode === "nearest") {
    sortMode = "newest";
    updateNearMeState();
    sortSpotsInPlace();
    spotsById = new Map(spots.map((spot) => [spot.id, spot]));
    renderList();
    return;
  }

  await activateNearestSort();
}

sheetMetaEl?.addEventListener(
  "click",
  () => {
    requestAnimationFrame(() => {
      toggleNearestSort();
    });
  },
  { passive: true }
);

sheetMetaEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleNearestSort();
  }
});

/* Boot */
async function refreshAll() {
  await loadSpotsAndVotes();
  renderMarkers();
  renderList();
}

function waitForTilesLoaded(timeoutMs = 9000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve(true);
      }
    };
    tiles.once("load", finish);
    setTimeout(finish, timeoutMs);
  });
}

(async function boot() {
  try {
    await refreshAll();

    const sessionCached = readSessionCache();
    const shouldRevalidate = !sessionCached || !isSessionCacheFresh(sessionCached.savedAt);
    if (shouldRevalidate && !fetchedRemoteThisPageLoad) {
      clearFirestoreCache();
      await refreshAll();
    }

    await waitForTilesLoaded();
    setTimeout(hideLoading, 250);
  } catch (e) {
    console.error("Boot error:", e);
    listEl.innerHTML = `<div class="empty">ডাটা লোড হচ্ছে না</div>`;
    setTimeout(hideLoading, 1200);
  }
})();
