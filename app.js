 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/app.js b/app.js
index f32a977c0c15603afbdf56cdbc41400b30720401..d27a728ca24ba4f0751450817b239a535d294c5c 100644
--- a/app.js
+++ b/app.js
@@ -48,300 +48,369 @@ function ensureAuthReady(timeoutMs = 8000) {
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
 
+function debounce(fn, wait = 150) {
+  let t = null;
+  return (...args) => {
+    clearTimeout(t);
+    t = setTimeout(() => fn(...args), wait);
+  };
+}
+
+let rafToken = 0;
+function rafReplace(cb) {
+  cancelAnimationFrame(rafToken);
+  rafToken = requestAnimationFrame(cb);
+}
+
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
-setTimeout(() => map.invalidateSize(true), 350);
+function ensureInitialMapSize() {
+  map.invalidateSize(true);
+}
+const refreshMapSize = debounce(() => map.invalidateSize(), 180);
+setTimeout(ensureInitialMapSize, 350);
+window.addEventListener("resize", refreshMapSize, { passive: true });
 
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
 
-      countdownEl.textContent = `${h}ঘ ${m}মি ${s}সে`;
+      requestAnimationFrame(() => {
+        countdownEl.textContent = `${h}ঘ ${m}মি ${s}সে`;
+      });
     }, 1000);
-  } catch (e) {
+  } catch {
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
-  sheet.style.height = `${currentH}px`;
+  requestAnimationFrame(() => {
+    sheet.style.height = `${currentH}px`;
+  });
 }
-let startY = 0,
-  startH = 0,
-  dragging = false;
+let startY = 0;
+let startH = 0;
+let dragging = false;
 
 function onStart(e) {
   dragging = true;
   sheet.style.transition = "none";
   startY = e.touches ? e.touches[0].clientY : e.clientY;
   startH = currentH;
   document.addEventListener("mousemove", onMove);
   document.addEventListener("mouseup", onEnd);
   document.addEventListener("touchmove", onMove, { passive: false });
-  document.addEventListener("touchend", onEnd);
+  document.addEventListener("touchend", onEnd, { passive: true });
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
 
 /* Button state */
 function syncSubmitBtnState() {
   if (!submitSpotBtn) return;
   submitSpotBtn.textContent = "স্পট যোগ করুন";
-  // ✅ always clickable so empty-form message can show
   submitSpotBtn.disabled = false;
 }
 
 onAuthStateChanged(auth, (u) => {
   me = u;
   authReady = !!u?.uid;
   syncSubmitBtnState();
 });
 
-/* ✅ Pick toast + shake message helpers */
+/* Pick toast + shake message helpers */
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
 
-  // ✅ shake effect (CSS .shake)
   submitSpotBtn.classList.remove("shake");
-  void submitSpotBtn.offsetWidth; // reflow
+  submitSpotBtn.offsetWidth;
   submitSpotBtn.classList.add("shake");
 
-  // ✅ important: if we returned early, allow clicking again
   submitting = false;
 
   setTimeout(() => {
     submitSpotBtn.classList.remove("shake");
     syncSubmitBtnState();
   }, ms);
 }
 
-/* Data */
+/* Data + render state */
 let spots = [];
-let markerLayer = L.layerGroup().addTo(map);
+let spotsById = new Map();
+const markerLayer = L.layerGroup().addTo(map);
+const markerBySpot = new Map();
+let selectedSpotId = null;
+
+const sessionCache = {
+  spots: null,
+  votes: null,
+  at: 0,
+};
+const CACHE_TTL = 15000;
+
+let renderQueued = false;
+function scheduleRender() {
+  if (renderQueued) return;
+  renderQueued = true;
+  rafReplace(() => {
+    renderQueued = false;
+    renderAll();
+  });
+}
+
+function renderAll() {
+  renderMarkers();
+  renderList();
+}
 
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
 
-async function loadSpotsAndVotes() {
-  const spotSnap = await getDocs(collection(db, "spots"));
-  const newSpots = [];
+async function loadSpotsAndVotes(force = false) {
+  const now = Date.now();
+  const canUseCache =
+    !force &&
+    sessionCache.spots &&
+    sessionCache.votes &&
+    now - sessionCache.at <= CACHE_TTL;
+
+  let spotSnap;
+  let voteSnap;
+  if (canUseCache) {
+    spotSnap = sessionCache.spots;
+    voteSnap = sessionCache.votes;
+  } else {
+    [spotSnap, voteSnap] = await Promise.all([
+      getDocs(collection(db, "spots")),
+      getDocs(collection(db, "votes")),
+    ]);
+    sessionCache.spots = spotSnap;
+    sessionCache.votes = voteSnap;
+    sessionCache.at = now;
+  }
+
+  const nextSpots = [];
   spotSnap.forEach((d) => {
     const data = d.data() || {};
-    newSpots.push({
+    nextSpots.push({
       id: d.id,
       ...data,
       truthCount: 0,
       fakeCount: 0,
       myVote: null,
     });
   });
 
-  const voteSnap = await getDocs(collection(db, "votes"));
   const votesBySpot = new Map();
   voteSnap.forEach((d) => {
-    const v0 = d.data();
-    if (!v0?.spotId || !v0?.value) return;
-    if (!votesBySpot.has(v0.spotId)) votesBySpot.set(v0.spotId, []);
-    votesBySpot.get(v0.spotId).push(v0);
+    const vote = d.data();
+    if (!vote?.spotId || !vote?.value) return;
+    if (!votesBySpot.has(vote.spotId)) votesBySpot.set(vote.spotId, []);
+    votesBySpot.get(vote.spotId).push(vote);
   });
 
-  for (const s of newSpots) {
+  for (const s of nextSpots) {
     const arr = votesBySpot.get(s.id) || [];
-    let t = 0,
-      f = 0,
-      my = null;
-    for (const v0 of arr) {
-      if (v0.value === "truth") t++;
-      if (v0.value === "fake") f++;
-      if (me?.uid && v0.uid === me.uid) my = v0.value;
+    let t = 0;
+    let f = 0;
+    let my = null;
+
+    for (const vote of arr) {
+      if (vote.value === "truth") t++;
+      if (vote.value === "fake") f++;
+      if (me?.uid && vote.uid === me.uid) my = vote.value;
     }
+
     s.truthCount = t;
     s.fakeCount = f;
     s.myVote = my;
     if (!s.iftarType) s.iftarType = "mixed";
   }
 
-  spots = newSpots;
+  spots = nextSpots;
+  spotsById = new Map(nextSpots.map((spot) => [spot.id, spot]));
+  if (selectedSpotId && !spotsById.has(selectedSpotId)) selectedSpotId = null;
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
@@ -355,373 +424,423 @@ function buildPopupHtml(spot) {
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
 
-function openSpotPopup(latlng, spot) {
+function openSpotPopup(spot) {
+  if (!spot) return;
+
   if (openedPopup) {
-    try {
-      map.closePopup(openedPopup);
-    } catch {}
+    map.closePopup(openedPopup);
     openedPopup = null;
   }
 
   const popup = L.popup({
     className: "spotPopup",
     closeButton: false,
     autoPan: true,
     offset: L.point(0, -10),
     maxWidth: 360,
   })
-    .setLatLng(latlng)
+    .setLatLng([spot.lat, spot.lng])
     .setContent(buildPopupHtml(spot));
 
   openedPopup = popup;
   popup.openOn(map);
-
-  setTimeout(() => {
-    const root = document.querySelector(".leaflet-popup.spotPopup");
-    if (!root) return;
-    root.querySelectorAll(".spotAct").forEach((btn) => {
-      btn.addEventListener("click", async (e) => {
-        e.preventDefault();
-        e.stopPropagation();
-        const spotId = btn.getAttribute("data-id");
-        const act = btn.getAttribute("data-act");
-        await castVote(spotId, act);
-      });
-    });
-  }, 0);
 }
 
+map.on("popupopen", (ev) => {
+  const root = ev?.popup?._contentNode;
+  if (!root) return;
+  root.addEventListener("click", async (e) => {
+    const btn = e.target.closest(".spotAct");
+    if (!btn) return;
+    e.preventDefault();
+    e.stopPropagation();
+    const spotId = btn.getAttribute("data-id");
+    const act = btn.getAttribute("data-act");
+    await castVote(spotId, act);
+  });
+});
+
 /* Render */
 function renderMarkers() {
-  markerLayer.clearLayers();
+  const alive = new Set();
+
   for (const s of spots) {
     if (typeof s.lat !== "number" || typeof s.lng !== "number") continue;
-    const icon = makeFoodPinIcon(s.iftarType || "mixed");
-    const m = L.marker([s.lat, s.lng], { icon });
-    m.on("click", () => openSpotPopup([s.lat, s.lng], s));
-    markerLayer.addLayer(m);
+    alive.add(s.id);
+
+    let marker = markerBySpot.get(s.id);
+    if (!marker) {
+      marker = L.marker([s.lat, s.lng], { icon: makeFoodPinIcon(s.iftarType || "mixed") });
+      marker.on("click", () => {
+        selectedSpotId = s.id;
+        openSpotPopup(spotsById.get(s.id));
+      });
+      markerBySpot.set(s.id, marker);
+      marker.addTo(markerLayer);
+      continue;
+    }
+
+    marker.setLatLng([s.lat, s.lng]);
+    marker.setIcon(makeFoodPinIcon(s.iftarType || "mixed"));
   }
+
+  for (const [id, marker] of markerBySpot.entries()) {
+    if (alive.has(id)) continue;
+    markerLayer.removeLayer(marker);
+    markerBySpot.delete(id);
+  }
+}
+
+function createListCard(s) {
+  const truth = s.truthCount ?? 0;
+  const fake = s.fakeCount ?? 0;
+  const badge = getBadge(truth, fake);
+  const tLabel = escapeHtml(typeLabel(s.iftarType || "mixed"));
+
+  const card = document.createElement("div");
+  card.className = "card";
+  card.setAttribute("data-spot", s.id);
+
+  card.innerHTML = `
+    <div class="cardHeader">
+      <div class="cardUser">👤 User</div>
+      <div class="cardBadge ${badge.cls}">
+        <span>${badge.icon}</span> ${badge.text}
+      </div>
+    </div>
+
+    <div class="cardBody">
+      <div class="title">${escapeHtml(s.name || "")}</div>
+      <div class="meta">📍 ${escapeHtml(s.area || "")} • ${typeEmoji(
+    s.iftarType
+  )} ${tLabel}</div>
+
+      <div class="voteRow">
+        <button class="voteBtn good ${s.myVote === "truth" ? "active" : ""}"
+          data-id="${s.id}" data-v="truth" ${authReady ? "" : "disabled"}>
+          👍 ${truth} সত্যি
+        </button>
+
+        <button class="voteBtn bad ${s.myVote === "fake" ? "active" : ""}"
+          data-id="${s.id}" data-v="fake" ${authReady ? "" : "disabled"}>
+          👎 ${fake} ভুয়া
+        </button>
+      </div>
+    </div>
+  `;
+
+  return card;
 }
 
 function renderList() {
   countEl.textContent = String(spots.length);
 
   if (!spots.length) {
     listEl.innerHTML = `<div class="empty">কোনো স্পট নেই</div>`;
     return;
   }
 
-  listEl.innerHTML = spots
-    .map((s) => {
-      const truth = s.truthCount ?? 0;
-      const fake = s.fakeCount ?? 0;
-      const badge = getBadge(truth, fake);
-      const tLabel = escapeHtml(typeLabel(s.iftarType || "mixed"));
-
-      return `
-      <div class="card" data-spot="${s.id}">
-        <div class="cardHeader">
-          <div class="cardUser">👤 User</div>
-          <div class="cardBadge ${badge.cls}">
-            <span>${badge.icon}</span> ${badge.text}
-          </div>
-        </div>
+  const frag = document.createDocumentFragment();
+  for (const s of spots) {
+    frag.appendChild(createListCard(s));
+  }
+  listEl.replaceChildren(frag);
+}
 
-        <div class="cardBody">
-          <div class="title">${escapeHtml(s.name || "")}</div>
-          <div class="meta">📍 ${escapeHtml(s.area || "")} • ${typeEmoji(
-        s.iftarType
-      )} ${tLabel}</div>
-
-          <div class="voteRow">
-            <button class="voteBtn good ${s.myVote === "truth" ? "active" : ""}"
-              data-id="${s.id}" data-v="truth" ${authReady ? "" : "disabled"}>
-              👍 ${truth} সত্যি
-            </button>
-
-            <button class="voteBtn bad ${s.myVote === "fake" ? "active" : ""}"
-              data-id="${s.id}" data-v="fake" ${authReady ? "" : "disabled"}>
-              👎 ${fake} ভুয়া
-            </button>
-          </div>
-        </div>
-      </div>
-    `;
-    })
-    .join("");
-
-  listEl.querySelectorAll(".voteBtn").forEach((btn) => {
-    btn.addEventListener("click", async (e) => {
-      e.stopPropagation();
-      const spotId = btn.getAttribute("data-id");
-      const value = btn.getAttribute("data-v");
-      await castVote(spotId, value);
-    });
-  });
+function focusSpotOnMap(spot) {
+  if (!spot) return;
 
-  listEl.querySelectorAll(".card").forEach((card) => {
-    card.addEventListener("click", () => {
-      const id = card.getAttribute("data-spot");
-      const s = spots.find((x) => x.id === id);
-      if (!s) return;
-      map.setView([s.lat, s.lng], Math.max(map.getZoom(), 14), { animate: true });
-      openSpotPopup([s.lat, s.lng], s);
-    });
-  });
+  const targetZoom = Math.max(map.getZoom(), 14);
+  const center = map.getCenter();
+  const sameCenter = Math.abs(center.lat - spot.lat) < 0.00001 && Math.abs(center.lng - spot.lng) < 0.00001;
+  const sameZoom = map.getZoom() === targetZoom;
+
+  if (!sameCenter || !sameZoom) {
+    map.setView([spot.lat, spot.lng], targetZoom, { animate: true });
+  }
 }
 
+listEl.addEventListener("click", async (e) => {
+  const voteBtn = e.target.closest(".voteBtn");
+  if (voteBtn) {
+    e.stopPropagation();
+    const spotId = voteBtn.getAttribute("data-id");
+    const value = voteBtn.getAttribute("data-v");
+    await castVote(spotId, value);
+    return;
+  }
+
+  const card = e.target.closest(".card");
+  if (!card) return;
+
+  const id = card.getAttribute("data-spot");
+  const spot = spotsById.get(id);
+  if (!spot) return;
+
+  selectedSpotId = id;
+  focusSpotOnMap(spot);
+  openSpotPopup(spot);
+});
+
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
-  const s = spots.find((x) => x.id === spotId);
+  const s = spotsById.get(spotId);
   if (!s) return;
 
   if (s.myVote === "truth") s.truthCount = Math.max(0, (s.truthCount || 0) - 1);
   if (s.myVote === "fake") s.fakeCount = Math.max(0, (s.fakeCount || 0) - 1);
   if (value === "truth") s.truthCount = (s.truthCount || 0) + 1;
   if (value === "fake") s.fakeCount = (s.fakeCount || 0) + 1;
 
   s.myVote = value;
-  renderList();
+  scheduleRender();
 
   try {
     await setDoc(doc(db, "votes", voteId), {
       spotId,
       uid: me.uid,
       value,
       createdAt: serverTimestamp(),
     });
+    sessionCache.votes = null;
   } catch (e) {
     console.error("Vote write failed:", e);
-    await refreshAll();
+    await refreshAll(true);
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
-  const currentType = (iftarTypeEl?.value || "mixed");
+  const currentType = iftarTypeEl?.value || "mixed";
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
 
-addSpotBtn.addEventListener("click", () => openModal());
+addSpotBtn.addEventListener("click", openModal);
 closeModalBtn.addEventListener("click", closeModal);
 
 pickLocationBtn.addEventListener("click", () => {
   pickMode = true;
 
-  // ✅ map fully clear
   modal.classList.add("picking");
   modal.classList.remove("pickMode");
 
   pickedLatLngEl.textContent = "📍 এখন ম্যাপে ক্লিক করুন";
   showPickToast();
 });
 
 map.on("click", (e) => {
-  const { lat, lng } = e.latlng;
-
-  if (!isInRajshahi(lat, lng)) {
-    if (!modal.classList.contains("hidden")) {
-      pickedLatLngEl.textContent = "⚠️ রাজশাহীর ভিতরে লোকেশন দিন";
+  const lat = e.latlng.lat;
+  const lng = e.latlng.lng;
+  const inside = isInRajshahi(lat, lng);
+  const modalOpen = !modal.classList.contains("hidden");
+  const isPick = pickMode;
+
+  requestAnimationFrame(() => {
+    if (!inside) {
+      if (modalOpen) {
+        pickedLatLngEl.textContent = "⚠️ রাজশাহীর ভিতরে লোকেশন দিন";
+      }
+      return;
     }
-    return;
-  }
-
-  if (pickMode) {
-    pickMode = false;
 
-    // ✅ bring modal back
-    modal.classList.remove("picking");
-    modal.classList.remove("hidden");
-    hidePickToast();
+    if (isPick) {
+      pickMode = false;
+      modal.classList.remove("picking");
+      modal.classList.remove("hidden");
+      hidePickToast();
+      setPicked(lat, lng);
+      return;
+    }
 
+    openModal();
     setPicked(lat, lng);
-    return;
-  }
-
-  openModal();
-  setPicked(lat, lng);
+  });
 });
 
 iftarTypeEl?.addEventListener("change", () => {
   if (!pickedLatLng) return;
   const { lat, lng } = pickedLatLng;
   if (pickPreviewMarker) markerLayer.removeLayer(pickPreviewMarker);
-  pickPreviewMarker = L.marker([lat, lng], { icon: makeFoodPinIcon(v(iftarTypeEl) || "mixed") });
+  pickPreviewMarker = L.marker([lat, lng], {
+    icon: makeFoodPinIcon(v(iftarTypeEl) || "mixed"),
+  });
   markerLayer.addLayer(pickPreviewMarker);
 });
 
-/* ✅ Submit */
+/* Submit */
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
-    // ✅ validate first (empty form => message + shake)
     const name = (spotNameEl?.value || "").trim();
     const area = (spotAreaEl?.value || "").trim();
     const iftarType = (iftarTypeEl?.value || "mixed").trim();
 
     if (!name) return flashBtn("⚠️ স্পটের নাম দিন");
     if (!area) return flashBtn("⚠️ এলাকা দিন");
     if (!pickedLatLng) return flashBtn("⚠️ লোকেশন দিন");
 
-    // ✅ auth after validation
     const u = await ensureAuthReady();
-    me = u; authReady = true;
+    me = u;
+    authReady = true;
 
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
 
-    spots.unshift({
+    const newSpot = {
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
-    });
+    };
+
+    spots.unshift(newSpot);
+    spotsById.set(newSpot.id, newSpot);
+    selectedSpotId = newSpot.id;
 
-    renderMarkers();
-    renderList();
+    sessionCache.spots = null;
+    scheduleRender();
 
     spotNameEl.value = "";
     spotAreaEl.value = "";
     iftarTypeEl.value = "";
 
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
 
 /* Boot */
-async function refreshAll() {
-  await loadSpotsAndVotes();
-  renderMarkers();
-  renderList();
+async function refreshAll(force = false) {
+  await loadSpotsAndVotes(force);
+  scheduleRender();
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
-    await refreshAll();
+    await refreshAll(true);
     await waitForTilesLoaded();
     setTimeout(hideLoading, 250);
   } catch (e) {
     console.error("Boot error:", e);
     listEl.innerHTML = `<div class="empty">ডাটা লোড হচ্ছে না</div>`;
     setTimeout(hideLoading, 1200);
   }
 })();
 
EOF
)
