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
updateDoc,
increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
getAuth,
GoogleAuthProvider,
signInWithPopup,
onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

/* Firebase Config */
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
const provider = new GoogleAuthProvider();

let user=null;
onAuthStateChanged(auth,(u)=>{user=u});

/* Map */
const RU=[24.3636,88.6295];
const map=L.map("map").setView(RU,15);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);

L.circle(RU,{radius:3500}).addTo(map);

let markers=L.layerGroup().addTo(map);

/* Countdown */
async function loadCountdown(){
const res=await fetch("https://api.aladhan.com/v1/timingsByCity?city=Rajshahi&country=Bangladesh&method=2");
const json=await res.json();
const maghrib=json.data.timings.Maghrib;
startCountdown(maghrib);
}
function startCountdown(time){
function tick(){
const now=new Date();
const [h,m]=time.split(":").map(Number);
let target=new Date();
target.setHours(h,m,0,0);
if(target<now) target.setDate(target.getDate()+1);
const diff=target-now;
const hh=Math.floor(diff/3600000);
const mm=Math.floor((diff%3600000)/60000);
const ss=Math.floor((diff%60000)/1000);
document.getElementById("countdown").innerText=
`ইফতার (${time}) বাকি: ${hh}:${mm}:${ss}`;
}
setInterval(tick,1000);
}
loadCountdown();

/* Login */
document.getElementById("loginBtn").onclick=()=>signInWithPopup(auth,provider);

/* Add Spot */
document.getElementById("addBtn").onclick=async()=>{
if(!user){alert("Login করুন");return;}

let name=prompt("স্পট নাম:");
let type=prompt("টাইপ: মিক্স ইফতার / খিচুড়ি / বিরিয়ানি");

map.once("click",async(e)=>{
const lat=e.latlng.lat;
const lng=e.latlng.lng;

const center=L.latLng(RU[0],RU[1]);
if(center.distanceTo(e.latlng)>3500){
alert("RU এর বাইরে!");
return;
}

await addDoc(collection(db,"spots"),{
name,
type,
lat,
lng,
good:0,
bad:0,
createdAt:serverTimestamp()
});

alert("Submitted!");
});
};

/* Listen */
const q=query(collection(db,"spots"),orderBy("createdAt","desc"));
onSnapshot(q,(snap)=>{
markers.clearLayers();
document.getElementById("list").innerHTML="";
snap.forEach(d=>{
const s=d.data();
const id=d.id;

L.marker([s.lat,s.lng]).addTo(markers);

document.getElementById("list").innerHTML+=`
<div class="card">
<b>${s.name}</b><br>
${s.type}<br>
<button onclick="vote('${id}','good')">👍 ${s.good||0}</button>
<button onclick="vote('${id}','bad')">👎 ${s.bad||0}</button>
</div>
`;
});
});

/* Vote */
window.vote=async(id,type)=>{
await updateDoc(doc(db,"spots",id),{
[type]:increment(1)
});
};
