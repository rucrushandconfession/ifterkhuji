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
  increment,
  runTransaction,
  getDoc
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

/** Rajshahi bounds + center */
const RAJSHAHI_CENTER = [24.3745, 88.6042];
const RAJSHAHI_ZOOM = 13;
const RAJSHAHI_BOUNDS_COORDS = [
  [24.22, 88.45], // south-west
  [24.55, 88.82]  // north-east
];
const RAJSHAHI_BOUNDS = L.latLngBounds(RAJSHAHI_BOUNDS_COORDS);

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
const visitorsPill = document.getElementById("visitorsPill");
const visitorFooterCounts = document.getElementById("visitorFooterCounts");

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
const sheetEl = document.getElementById("sheet");
const sheetHandle = document.getElementById("sheetHandle");
const sheetCollapseBtn = document.getElementById("sheetCollapseBtn");

/** Leaflet map */
const map = L.map("map", {
  center: RAJSHAHI_CENTER,
  zoom: RAJSHAHI_ZOOM,
  minZoom: 11,
  maxZoom: 18,
  maxBounds: RAJSHAHI_BOUNDS,
  maxBoundsViscosity: 1.0
});
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
L.rectangle(RAJSHAHI_BOUNDS, {
  color: "#1e7f43",
  weight: 1,
  fill: false,
  opacity: 0.35
}).addTo(map);
const markersLayer = L.layerGroup().addTo(map);

/** Pin */
let pinMarker = null;
let pickedLatLng = null;
let mapPickArmed = false;

/** Anti-spam (client-side soft rate limit) */
const LAST_SUBMIT_KEY = "ifter_last_submit_ts_v1";
const SUBMIT_COOLDOWN_MS = 60 * 1000; // 1 মিনিটে ১টা সাবমিট (soft)

/** Visitor counter */
const VISITOR_COUNTER_DOC = doc(db, "meta", "visitorCounter");
const VISITOR_UNIQUE_COLLECTION = "visitorUnique";
const VISITOR_CACHE_KEY = "visitor_counts_cache_v1";
const VISITOR_HIT_GUARD_MS = 10 * 1000;

/** Approved cache */
let spotsCache = [];

initBottomSheet();
initVisitorCounter();

/** Food package */
function getFoodDetails(type) {
  if (type === "মিক্স ইফতার") return ["বেগুনি", "ছোলা", "পেঁয়াজু", "হালিম", "শরবত"];
  if (type === "খিচুড়ি") return ["খিচুড়ি"];
  if (type === "বিরিয়ানি") return ["বিরিয়ানি"];
  return [];
}



/** Bottom sheet drag/snap */
const SHEET_SNAP = {
  MIN: 12,
  MID: 45,
  MAX: 85
};
let sheetCurrentVh = SHEET_SNAP.MID;
let sheetTargetVh = SHEET_SNAP.MID;
let sheetRafId = 0;
let isSheetDragging = false;
let sheetStartY = 0;
let sheetStartVh = SHEET_SNAP.MID;
let lastDragY = 0;
let lastDragTs = 0;
let sheetVelocityPxPerMs = 0;
const SHEET_RUBBER_FACTOR = 0.35;
let snapIndicatorTimer = null;

function initBottomSheet() {
  applySheetState(sheetCurrentVh, true);

  sheetHandle?.addEventListener("pointerdown", startSheetDrag);
  document.querySelector(".sheetHeader")?.addEventListener("pointerdown", startSheetDrag);
  document.getElementById("list")?.addEventListener("pointerdown", (e) => {
    if (!sheetEl.classList.contains("at-max")) startSheetDrag(e);
  });

  sheetCollapseBtn?.addEventListener("click", () => animateSheetTo(SHEET_SNAP.MID));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") animateSheetTo(SHEET_SNAP.MID);
  });

  window.addEventListener("resize", () => applySheetState(sheetCurrentVh, true));
}

function startSheetDrag(e) {
  const interactive = e.target.closest("button, input, select, textarea, a");
  if (interactive && e.target !== sheetCollapseBtn) return;

  isSheetDragging = true;
  sheetEl.classList.add("dragging");
  document.body.classList.add("sheet-dragging");

  sheetStartY = e.clientY;
  sheetStartVh = sheetCurrentVh;
  lastDragY = e.clientY;
  lastDragTs = performance.now();
  sheetVelocityPxPerMs = 0;

  sheetEl.setPointerCapture?.(e.pointerId);
  sheetEl.addEventListener("pointermove", onSheetDragMove);
  sheetEl.addEventListener("pointerup", endSheetDrag);
  sheetEl.addEventListener("pointercancel", endSheetDrag);
}

function onSheetDragMove(e) {
  if (!isSheetDragging) return;
  const viewportHeight = window.innerHeight || 1;
  const deltaPx = e.clientY - sheetStartY;
  const deltaVh = (deltaPx / viewportHeight) * 100;
  const rawVh = sheetStartVh - deltaVh;
  const nextVh = applyRubberBand(rawVh, SHEET_SNAP.MIN, SHEET_SNAP.MAX);
  applySheetState(nextVh, true);

  const now = performance.now();
  const dt = Math.max(1, now - lastDragTs);
  sheetVelocityPxPerMs = (e.clientY - lastDragY) / dt;
  lastDragY = e.clientY;
  lastDragTs = now;
}

function endSheetDrag() {
  if (!isSheetDragging) return;
  isSheetDragging = false;
  sheetEl.classList.remove("dragging");
  document.body.classList.remove("sheet-dragging");

  sheetEl.removeEventListener("pointermove", onSheetDragMove);
  sheetEl.removeEventListener("pointerup", endSheetDrag);
  sheetEl.removeEventListener("pointercancel", endSheetDrag);

  const speed = sheetVelocityPxPerMs;
  if (Math.abs(speed) > 0.8) {
    const bounded = clamp(sheetCurrentVh, SHEET_SNAP.MIN, SHEET_SNAP.MAX);
    if (speed < 0) animateSheetTo(nextHigherSnap(bounded));
    else animateSheetTo(nextLowerSnap(bounded));
    return;
  }
  animateSheetTo(nearestSnap(clamp(sheetCurrentVh, SHEET_SNAP.MIN, SHEET_SNAP.MAX)));
}

function animateSheetTo(targetVh) {
  sheetTargetVh = clamp(targetVh, SHEET_SNAP.MIN, SHEET_SNAP.MAX);
  cancelAnimationFrame(sheetRafId);

  const step = () => {
    const diff = sheetTargetVh - sheetCurrentVh;
    if (Math.abs(diff) < 0.2) {
      applySheetState(sheetTargetVh, true);
      triggerSnapIndicator();
      return;
    }
    applySheetState(sheetCurrentVh + diff * 0.22, true);
    sheetRafId = requestAnimationFrame(step);
  };
  sheetRafId = requestAnimationFrame(step);
}

function applySheetState(visibleVh, updateCurrent = false) {
  const bounded = clamp(visibleVh, SHEET_SNAP.MIN, SHEET_SNAP.MAX);
  if (updateCurrent) sheetCurrentVh = visibleVh;

  const translateVh = SHEET_SNAP.MAX - visibleVh;
  const normalized = (bounded - SHEET_SNAP.MIN) / (SHEET_SNAP.MAX - SHEET_SNAP.MIN);
  const shadowAlpha = (0.12 + normalized * 0.28).toFixed(3);
  sheetEl.style.setProperty("--sheet-shadow", `0 10px 30px rgba(0,0,0,${shadowAlpha})`);
  sheetEl.style.transform = `translateY(${translateVh}vh)`;
  sheetEl.classList.toggle("at-max", bounded >= SHEET_SNAP.MAX - 1.2);
}



function applyRubberBand(value, min, max) {
  if (value < min) return min - (min - value) * SHEET_RUBBER_FACTOR;
  if (value > max) return max + (value - max) * SHEET_RUBBER_FACTOR;
  return value;
}

function triggerSnapIndicator() {
  sheetEl.classList.remove("snap-indicator");
  void sheetEl.offsetWidth;
  sheetEl.classList.add("snap-indicator");
  clearTimeout(snapIndicatorTimer);
  snapIndicatorTimer = setTimeout(() => {
    sheetEl.classList.remove("snap-indicator");
  }, 320);
}

function nearestSnap(vh) {
  const points = [SHEET_SNAP.MIN, SHEET_SNAP.MID, SHEET_SNAP.MAX];
  return points.reduce((best, p) =>
    Math.abs(p - vh) < Math.abs(best - vh) ? p : best
  , points[0]);
}
function nextHigherSnap(vh) {
  if (vh < SHEET_SNAP.MID) return SHEET_SNAP.MID;
  return SHEET_SNAP.MAX;
}
function nextLowerSnap(vh) {
  if (vh > SHEET_SNAP.MID) return SHEET_SNAP.MID;
  return SHEET_SNAP.MIN;
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/** Utils */
function isInsideRajshahi(lat, lng) {
  return RAJSHAHI_BOUNDS.contains(L.latLng(lat, lng));
}

function showBanglaToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.left = "50%";
  toast.style.bottom = "calc(42vh + 24px)";
  toast.style.transform = "translateX(-50%)";
  toast.style.background = "rgba(17,17,17,.92)";
  toast.style.color = "#fff";
  toast.style.padding = "10px 14px";
  toast.style.borderRadius = "999px";
  toast.style.fontFamily = "'Hind Siliguri', sans-serif";
  toast.style.fontSize = "13px";
  toast.style.zIndex = "2600";
  toast.style.boxShadow = "0 8px 20px rgba(0,0,0,.28)";
  toast.style.pointerEvents = "none";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1800);
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
  if (!isInsideRajshahi(e.latlng.lat, e.latlng.lng)) {
    showBanglaToast("শুধু রাজশাহী এলাকার স্পট যোগ করা যাবে");
    return;
  }

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
centerRuBtn.addEventListener("click", () => map.fitBounds(RAJSHAHI_BOUNDS));

gpsBtn.addEventListener("click", () => {
  if (!navigator.geolocation) return alert("GPS সাপোর্ট নেই।");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      if (!isInsideRajshahi(lat, lng)) {
        showBanglaToast("শুধু রাজশাহী এলাকার স্পট যোগ করা যাবে");
        map.fitBounds(RAJSHAHI_BOUNDS);
        return;
      }
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

  if (!isInsideRajshahi(lat, lng)) {
    showBanglaToast("শুধু রাজশাহী এলাকার স্পট যোগ করা যাবে");
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
  const rajshahiSpots = spotsCache.filter((s) => isInsideRajshahi(s.lat, s.lng));
  const outsideSpots = spotsCache.filter((s) => !isInsideRajshahi(s.lat, s.lng));

  // markers (Rajshahi-first; out-of-bound data shown only after Rajshahi results)
  markersLayer.clearLayers();
  [...rajshahiSpots, ...outsideSpots].forEach((s) => {
    L.marker([s.lat, s.lng]).addTo(markersLayer)
      .bindPopup(`<b>${escapeHtml(s.name)}</b><br/>${escapeHtml(s.area)}<br/>${escapeHtml(s.type)}`);
  });

  const q = (searchInput.value || "").trim().toLowerCase();
  const source = [...rajshahiSpots, ...outsideSpots];
  const filtered = q
    ? source.filter(s =>
        (s.name||"").toLowerCase().includes(q) ||
        (s.area||"").toLowerCase().includes(q) ||
        (s.type||"").toLowerCase().includes(q)
      )
    : source;

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
        <div class="smallPill">Rajshahi</div>
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

  totalPill.textContent = `🌙 আজকের স্পট: ${rajshahiSpots.length}টি`;
  verifiedPill.textContent = `✓ নিশ্চিত: ${rajshahiSpots.length}টি`;
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



async function initVisitorCounter() {
  const cached = readVisitorCache();
  if (cached) renderVisitorCounts(cached.total, cached.unique);

  try {
    const counts = isBotVisitor()
      ? await readVisitorCountsOnly()
      : await registerVisitorHit();

    if (!counts) return;
    renderVisitorCounts(counts.total, counts.unique);
    writeVisitorCache(counts.total, counts.unique);
  } catch (err) {
    console.error("visitor counter error", err);
  }
}

function isBotVisitor() {
  const ua = (navigator.userAgent || "").toLowerCase();
  return /(bot|crawler|spider|crawling|slurp|headless)/i.test(ua);
}

async function registerVisitorHit() {
  const uniqueId = getOrCreateVisitorId();
  const uniqueRef = doc(db, VISITOR_UNIQUE_COLLECTION, uniqueId);
  const now = Date.now();

  return runTransaction(db, async (tx) => {
    const [counterSnap, uniqueSnap] = await Promise.all([
      tx.get(VISITOR_COUNTER_DOC),
      tx.get(uniqueRef)
    ]);

    let total = Number(counterSnap.exists() ? counterSnap.data().total || 0 : 0);
    let unique = Number(counterSnap.exists() ? counterSnap.data().unique || 0 : 0);

    const hasUniqueDoc = uniqueSnap.exists();
    const uniqueData = hasUniqueDoc ? uniqueSnap.data() : {};
    const lastHitAt = Number(uniqueData.lastHitAt || 0);
    const tooFrequent = hasUniqueDoc && (now - lastHitAt) < VISITOR_HIT_GUARD_MS;

    if (!tooFrequent) {
      total += 1;
      if (!hasUniqueDoc) unique += 1;

      tx.set(VISITOR_COUNTER_DOC, {
        total,
        unique,
        updatedAt: now
      }, { merge: true });
    }

    tx.set(uniqueRef, {
      firstSeenAt: hasUniqueDoc ? Number(uniqueData.firstSeenAt || now) : now,
      lastHitAt: now,
      hitCount: Number(uniqueData.hitCount || 0) + 1
    }, { merge: true });

    return { total, unique };
  });
}

async function readVisitorCountsOnly() {
  const cached = readVisitorCache();
  if (cached) return cached;

  const snap = await getDoc(VISITOR_COUNTER_DOC);
  if (!snap.exists()) return { total: 0, unique: 0 };
  return {
    total: Number(snap.data().total || 0),
    unique: Number(snap.data().unique || 0)
  };
}

function renderVisitorCounts(total, unique) {
  const text = `Visitors: ${Number(total || 0)} | Unique: ${Number(unique || 0)}`;
  if (visitorsPill) visitorsPill.textContent = text;
  if (visitorFooterCounts) visitorFooterCounts.textContent = text;
}

function readVisitorCache() {
  try {
    const raw = localStorage.getItem(VISITOR_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const now = Date.now();
    if (now - Number(parsed.ts || 0) > 10 * 1000) return null;
    return {
      total: Number(parsed.total || 0),
      unique: Number(parsed.unique || 0)
    };
  } catch {
    return null;
  }
}

function writeVisitorCache(total, unique) {
  localStorage.setItem(VISITOR_CACHE_KEY, JSON.stringify({
    total: Number(total || 0),
    unique: Number(unique || 0),
    ts: Date.now()
  }));
}

function getOrCreateVisitorId() {
  const key = "ifter_unique_visitor_id_v1";
  let id = localStorage.getItem(key);
  if (id) return id;
  id = "visitor_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  localStorage.setItem(key, id);
  return id;
}

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
