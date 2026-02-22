// ================= FIREBASE IMPORT =================
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
  deleteDoc,
  writeBatch,
  increment,
  where,
  getDocs,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// ================= FIREBASE CONFIG =================
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

// ================= AUTH (Anonymous background) =================
let UID = null;

const authReady = new Promise(async (resolve, reject) => {
  try {
    if (auth.currentUser) return resolve(auth.currentUser);
    const cred = await signInAnonymously(auth);
    resolve(cred.user);
  } catch (err) {
    reject(err);
  }
});

authReady.then(u => UID = u.uid).catch(() => {
  alert("Firebase Auth সমস্যা। Anonymous Enable + Authorized Domain চেক করুন।");
});

onAuthStateChanged(auth, (u)=>{ if(u) UID = u.uid; });

// ================= MAP =================
const RAJSHAHI = [24.3745, 88.6042];

const map = L.map("map", {
  scrollWheelZoom:false,
  doubleClickZoom:false,
  tap:true
}).setView(RAJSHAHI, 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);

const cluster = L.markerClusterGroup();
map.addLayer(cluster);

// ================= BOUNDS =================
function insideRajshahi(lat,lng){
  return lat>=24.33 && lat<=24.42 && lng>=88.56 && lng<=88.70;
}

// ================= UI REFERENCES =================
const listEl = document.getElementById("list");
const totalPill = document.getElementById("totalPill");
const pendingPill = document.getElementById("pendingPill");
const iftarCountdown = document.getElementById("iftarCountdown");
const searchInput = document.getElementById("searchInput");
const chipsRow = document.getElementById("chipsRow");

const spotForm = document.getElementById("spotForm");
const spotName = document.getElementById("spotName");
const spotArea = document.getElementById("spotArea");
const foodType = document.getElementById("foodType");

let picked=null;
let pinMarker=null;

map.on("click",(e)=>{
  picked={lat:e.latlng.lat,lng:e.latlng.lng};
  if(pinMarker) pinMarker.setLatLng(e.latlng);
  else pinMarker=L.marker(e.latlng,{draggable:true}).addTo(map);
});

// ================= DUPLICATE CHECK =================
function normalizeName(s){
  return s.trim().toLowerCase().replace(/\s+/g," ");
}

function haversine(aLat,aLng,bLat,bLng){
  const R=6371000;
  const toRad=x=>x*Math.PI/180;
  const dLat=toRad(bLat-aLat);
  const dLng=toRad(bLng-aLng);
  const s=Math.sin(dLat/2)**2+
    Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}

async function isDuplicate(nameLower,lat,lng){
  const q1=query(collection(db,"spots_approved"),where("nameLower","==",nameLower),limit(20));
  const q2=query(collection(db,"spots_pending"),where("nameLower","==",nameLower),limit(20));
  const [s1,s2]=await Promise.all([getDocs(q1),getDocs(q2)]);
  for(const snap of [s1,s2]){
    for(const d of snap.docs){
      const s=d.data();
      if(haversine(lat,lng,s.lat,s.lng)<=150) return true;
    }
  }
  return false;
}

// ================= SUBMIT PENDING =================
spotForm.addEventListener("submit",async(e)=>{
  e.preventDefault();

  try{
    if(!UID) await authReady;

    const name=spotName.value.trim();
    const area=spotArea.value.trim();
    const type=foodType.value;

    if(!name||!area||!type||!picked) return alert("সব তথ্য দিন");
    if(!insideRajshahi(picked.lat,picked.lng)) return alert("রাজশাহী বাইরে");

    const nameLower=normalizeName(name);

    if(await isDuplicate(nameLower,picked.lat,picked.lng))
      return alert("ডুপ্লিকেট মনে হচ্ছে");

    await addDoc(collection(db,"spots_pending"),{
      name,
      nameLower,
      area,
      type,
      lat:picked.lat,
      lng:picked.lng,
      createdBy:UID,
      createdAt:serverTimestamp(),
      status:"pending"
    });

    alert("Pending জমা হয়েছে");
    spotForm.reset();
  }
  catch(err){
    console.error(err);
    alert("Submit failed");
  }
});

// ================= LIVE APPROVED LIST =================
let approvedCache=[];

onSnapshot(query(collection(db,"spots_approved"),orderBy("createdAt","desc")),snap=>{
  approvedCache=snap.docs.map(d=>({id:d.id,...d.data()}));
  render();
});

onSnapshot(collection(db,"spots_pending"),snap=>{
  pendingPill.textContent=`⏳ Pending: ${snap.size}টি`;
});

// ================= RENDER =================
function render(){
  cluster.clearLayers();
  listEl.innerHTML="";

  approvedCache.forEach(s=>{
    cluster.addLayer(L.marker([s.lat,s.lng]));

    const card=document.createElement("div");
    card.className="card";
    card.innerHTML=`
      <div class="cardTitle">${escapeHtml(s.name)}</div>
      <div class="cardSub">${escapeHtml(s.area)} • ${escapeHtml(s.type)}</div>
      <div class="voteRow">
        <button data-act="vote" data-id="${s.id}" data-v="truth">👍 ${s.truthCount||0}</button>
        <button data-act="vote" data-id="${s.id}" data-v="fake">👎 ${s.fakeCount||0}</button>
        <button data-act="report" data-id="${s.id}">🚩 ${s.reportsCount||0}</button>
      </div>
    `;
    listEl.appendChild(card);
  });

  totalPill.textContent=`🌙 লাইভ স্পট: ${approvedCache.length}টি`;
}

// ================= VOTE / REPORT =================
listEl.addEventListener("click",async(e)=>{
  const btn=e.target.closest("button");
  if(!btn) return;

  const id=btn.dataset.id;
  const act=btn.dataset.act;
  if(!UID) await authReady;

  if(act==="vote"){
    const voteId=`${id}_${UID}`;
    const voteRef=doc(db,"votes",voteId);
    if((await getDoc(voteRef)).exists()) return alert("আগে vote দিয়েছেন");

    const batch=writeBatch(db);
    batch.set(voteRef,{spotId:id,uid:UID,createdAt:serverTimestamp()});
    batch.update(doc(db,"spots_approved",id),{
      [btn.dataset.v==="truth"?"truthCount":"fakeCount"]:increment(1)
    });
    await batch.commit();
  }

  if(act==="report"){
    const reportId=`${id}_${UID}`;
    const reportRef=doc(db,"reports",reportId);
    if((await getDoc(reportRef)).exists()) return alert("আগে রিপোর্ট করেছেন");

    const batch=writeBatch(db);
    batch.set(reportRef,{spotId:id,uid:UID,createdAt:serverTimestamp()});
    batch.update(doc(db,"spots_approved",id),{
      reportsCount:increment(1)
    });
    await batch.commit();
  }
});

// ================= COUNTDOWN =================
loadCountdown();
async function loadCountdown(){
  try{
    const res=await fetch("https://api.aladhan.com/v1/timingsByCity?city=Rajshahi&country=Bangladesh&method=2");
    const json=await res.json();
    startCountdown(json.data.timings.Maghrib);
  }catch{}
}

function startCountdown(time){
  function tick(){
    const now=new Date();
    const [hh,mm]=time.split(":").map(Number);
    const target=new Date(now);
    target.setHours(hh,mm,0,0);
    let diff=target-now;
    if(diff<0) target.setDate(target.getDate()+1),diff=target-now;

    const h=Math.floor(diff/3600000);
    const m=Math.floor((diff%3600000)/60000);
    const s=Math.floor((diff%60000)/1000);
    iftarCountdown.textContent=`🌙 ${h}h ${m}m ${s}s বাকি`;
  }
  tick();
  setInterval(tick,1000);
}

// ================= VISITOR COUNT =================
const statsRef=doc(db,"stats","global");
setDoc(statsRef,{totalVisits:increment(1)},{merge:true});

onSnapshot(statsRef,snap=>{
  document.getElementById("totalVisits").textContent=
    `👁️ Visits: ${snap.data()?.totalVisits||0}`;
});

// ================= UTIL =================
function escapeHtml(str){
  return str.replace(/[&<>"']/g,(m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",
    '"':"&quot;","'":"&#039;"
  })[m]);
}
