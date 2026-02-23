:root{
  --bg:#f6f7f6;
  --text:#0f172a;
  --muted:#64748b;

  --green:#275130;
  --green2:#2f6b3a;

  --card:#ffffff;
  --border: rgba(2,6,23,0.08);

  --radius-xl: 26px;
  --radius-lg: 20px;
  --radius-md: 16px;

  --shadow-sm: 0 6px 16px rgba(2,6,23,0.08);
  --shadow-md: 0 14px 30px rgba(2,6,23,0.12);
}

*{ box-sizing: border-box; }
html,body{ height:100%; }

body{
  margin:0;
  font-family: "Hind Siliguri", system-ui, -apple-system, Segoe UI, Roboto, Arial;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

/* =========================
   LOADING OVERLAY
========================= */
.loadingOverlay{
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: rgba(246,247,246,0.96);
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 18px;
}
.loadingOverlay.hidden{ display:none; }

.loadingCard{
  width: min(520px, 100%);
  background: #fff;
  border: 1px solid rgba(2,6,23,0.08);
  border-radius: 22px;
  box-shadow: 0 18px 40px rgba(2,6,23,0.12);
  padding: 18px 18px 16px;
  text-align:center;
}
.loadingIcon{
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: linear-gradient(135deg, var(--green2), var(--green));
  display:flex;
  align-items:center;
  justify-content:center;
  margin: 0 auto 10px;
  font-size: 30px;
  box-shadow: 0 12px 26px rgba(2,6,23,0.18);
  color:#fff;
}
.loadingTitle{
  font-weight: 900;
  font-size: 20px;
  color: #1f3f27;
}
.loadingSub{
  margin-top: 6px;
  font-weight: 800;
  color: var(--muted);
  font-size: 14px;
}
.loadingBar{
  margin: 14px auto 0;
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: rgba(2,6,23,0.08);
  overflow:hidden;
}
.loadingBar span{
  display:block;
  height: 100%;
  width: 45%;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--green2), var(--green));
  animation: slidebar 1.1s ease-in-out infinite;
}
@keyframes slidebar{
  0%{ transform: translateX(-60%); }
  50%{ transform: translateX(120%); }
  100%{ transform: translateX(260%); }
}

/* =========================
   TOP BAR
========================= */
.topbar{
  position: fixed;
  left:0; right:0; top:0;
  z-index: 1200;

  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;

  padding: 12px;

  background: rgba(246,247,246,0.94);
  backdrop-filter: blur(10px);
}

.brand{
  font-weight: 900;
  font-size: 18px;
  color: #1f3f27;

  background: #fff;
  border: 1px solid var(--border);
  border-radius: 18px;

  padding: 10px 14px;
  box-shadow: var(--shadow-sm);
}

.countdownPill{
  display:flex;
  flex-direction:column;
  align-items:flex-end;
  gap:2px;

  background: var(--green);
  color:#fff;

  border-radius: 18px;
  padding: 10px 14px;
  box-shadow: 0 6px 16px rgba(2,6,23,0.12);
}
.countdownPill .label{
  font-size: 12px;
  font-weight: 700;
  opacity: .9;
}
.countdownPill .time{
  font-size: 16px;
  font-weight: 900;
  letter-spacing: .2px;
}

/* =========================
   MAP
========================= */
#map{
  position: fixed;
  left: 0;
  right: 0;
  top: 64px;
  bottom: 0;
  z-index: 1;
}

/* =========================
   BOTTOM SHEET
========================= */
.sheet{
  position: fixed;
  left: 10px;
  right: 10px;
  bottom: 10px;
  z-index: 1300;

  height: 42vh;
  max-height: 86vh;
  min-height: 14vh;

  background: var(--green);
  color: #fff;

  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);

  display:flex;
  flex-direction: column;
  will-change: height;
}

.sheetHandle{
  width: 64px;
  height: 6px;
  border-radius: 999px;
  background: rgba(255,255,255,0.45);
  margin: 10px auto 10px;
}

.sheetHeader{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 10px;
  padding: 0 14px 10px;
}

.sheetTitle{
  font-weight: 900;
  font-size: 18px;
  display:flex;
  align-items:center;
  gap: 10px;
}

.sheetMeta{
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.22);
  border-radius: 999px;
  padding: 8px 12px;
  font-weight: 900;
}

.list{
  margin: 0 10px 12px;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: var(--radius-lg);

  padding: 10px;
  overflow: auto;
  flex: 1;
}

.empty{
  padding: 14px 12px;
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.14);
  font-weight: 800;
  text-align: center;
}

/* =========================
   LIST CARD UI
========================= */
.card{
  border-radius: 22px;
  overflow: hidden;
  margin-bottom: 14px;
  box-shadow: 0 10px 22px rgba(2,6,23,0.12);
  background: transparent;
}

.cardHeader{
  background: linear-gradient(135deg, var(--green2), var(--green));
  color: #fff;
  padding: 14px 14px 12px;

  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 10px;
}
.cardUser{ font-weight: 900; opacity: .95; }

.cardBadge{
  font-weight: 900;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.22);
  display:flex;
  align-items:center;
  gap: 8px;
  white-space: nowrap;
}
.cardBadge.bad{
  background: rgba(255, 90, 90, 0.18);
  border-color: rgba(255, 150, 150, 0.25);
}
.cardBadge.neutral{ background: rgba(255,255,255,0.14); }

.cardBody{
  background: #fff;
  color: #0f172a;
  padding: 14px;
}

.title{ font-weight: 900; font-size: 17px; line-height: 1.25; }

.meta{
  margin-top: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}

.voteRow{
  margin-top: 12px;
  display:flex;
  gap: 12px;
  flex-wrap: wrap;
}

.voteBtn{
  flex: 1 1 140px;
  border: 0;
  cursor: pointer;
  border-radius: 999px;
  padding: 12px 14px;

  font-weight: 900;
  font-size: 14px;
  font-family: "Hind Siliguri", system-ui;

  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap: 8px;

  box-shadow: 0 6px 14px rgba(2,6,23,0.10);
  transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
}
.voteBtn:active{ transform: scale(0.98); }
.voteBtn.good{ background:#e9f7ee; color:#187a3b; }
.voteBtn.bad{ background:#fdeaea; color:#b42318; }
.voteBtn.active{ outline: 3px solid rgba(39,81,48,0.22); }
.voteBtn:disabled{ cursor:not-allowed; opacity: 0.6; }

/* =========================
   ✅ CTA ADD BUTTON
========================= */
.addSpotBtn{
  position: fixed;
  right: 16px;
  bottom: 118px;
  z-index: 1400;

  border: none;
  cursor: pointer;

  border-radius: 999px;
  padding: 12px 14px;

  background: linear-gradient(135deg, #b77a12, #d39b2c);
  color: #fff;

  font-weight: 900;
  font-size: 14px;
  font-family: "Hind Siliguri", system-ui;

  display:flex;
  align-items:center;
  justify-content:center;
  gap: 10px;

  box-shadow: 0 12px 26px rgba(2,6,23,0.24);
  transition: transform 120ms ease;
}
.addSpotBtn:active{ transform: scale(0.98); }

/* =========================
   MODAL
========================= */
.modal{
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(2,6,23,0.45);

  display:flex;
  align-items:center;
  justify-content:center;
  padding: 14px;
}
.modal.hidden{ display:none; }

.modalCard{
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0,0,0,0.25);
  position: relative;
}

.modalHeader{
  background: #b77a12;
  color: #fff;
  padding: 14px;
}
.modalTitle{ font-size: 18px; font-weight: 900; }
.modalSub{ margin-top: 4px; font-size: 13px; font-weight: 700; opacity: 0.95; }

.modalClose{
  position: absolute;
  top: 12px;
  right: 12px;

  border: 0;
  background: rgba(255,255,255,0.18);
  color: #fff;

  width: 36px;
  height: 36px;
  border-radius: 12px;

  font-size: 18px;
  cursor: pointer;
  font-weight: 900;
}

.modalBody{ padding: 14px; }
.modalBody label{ display:block; font-weight: 800; margin-top: 12px; }

.modalBody input,
.modalBody .select{
  width: 100%;
  margin-top: 6px;
  padding: 12px;

  border-radius: 14px;
  border: 1px solid rgba(2,6,23,0.12);

  font-family: "Hind Siliguri", system-ui;
  font-weight: 700;
  outline: none;
  background: #fff;
}

.modalBody input:focus,
.modalBody .select:focus{
  border-color: rgba(39,81,48,0.35);
  box-shadow: 0 0 0 4px rgba(39,81,48,0.12);
}

.pinRow{
  margin-top: 14px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 10px;
}

.pinText{ font-weight: 800; font-size: 13px; color: #334155; }

.pinBtn{
  border: 0;
  background: #eef2f7;
  border-radius: 999px;
  padding: 8px 12px;
  font-weight: 900;
  cursor: pointer;
  font-family: "Hind Siliguri", system-ui;
}

.submitBtn{
  margin-top: 18px;
  width: 100%;
  border: 0;
  border-radius: 16px;
  padding: 12px;
  background: var(--green);
  color: #fff;
  font-weight: 900;
  font-size: 15px;
  cursor: pointer;
  font-family: "Hind Siliguri", system-ui;
}
.submitBtn:disabled{ opacity: 0.65; cursor: not-allowed; }

/* ✅ PICK MODE: BLUR OFF (no blur) */
.modal.pickMode{
  background: rgba(2,6,23,0.06);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  pointer-events: none; /* map clickable */
}
.modal.pickMode .modalCard{
  opacity: 0.55;
  transform: scale(0.99);
  filter: none;
  pointer-events: none;
}

/* =========================
   FOOD PINS (by type)
========================= */
.foodPin{
  width: 38px;
  height: 38px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--green2), var(--green));
  box-shadow: 0 10px 18px rgba(2,6,23,0.20);
  border: 3px solid rgba(255,255,255,0.95);
  position: relative;
}
.foodPin:after{
  content:"";
  position:absolute;
  left: 50%;
  bottom: -12px;
  transform: translateX(-50%) rotate(45deg);
  width: 16px;
  height: 16px;
  background: linear-gradient(135deg, var(--green2), var(--green));
  border-right: 3px solid rgba(255,255,255,0.95);
  border-bottom: 3px solid rgba(255,255,255,0.95);
  border-radius: 4px;
  box-shadow: 0 10px 18px rgba(2,6,23,0.18);
}
.foodPinInner{
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: rgba(255,255,255,0.95);
  margin: 4px auto 0;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size: 14px;
  font-weight: 900;
}

/* =========================
   PREMIUM POPUP
========================= */
.leaflet-popup.spotPopup .leaflet-popup-content-wrapper{
  background: transparent !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  padding: 0 !important;
}
.leaflet-popup.spotPopup .leaflet-popup-content{ margin: 0 !important; }
.leaflet-popup.spotPopup .leaflet-popup-tip{ display:none !important; }
.leaflet-popup-close-button{ display:none !important; }

.spotCard{
  width: 320px;
  border-radius: 18px;
  overflow:hidden;
  box-shadow: 0 18px 40px rgba(2,6,23,0.22);
}

.spotCardHeader{
  background: linear-gradient(135deg, var(--green2), var(--green));
  color:#fff;
  padding: 12px 12px 10px;
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap: 10px;
}
.spotCardHeader .left{ min-width:0; }
.spotCardHeader .u{
  font-weight: 900;
  opacity: .95;
  display:flex;
  align-items:center;
  gap: 8px;
}
.spotCardHeader .spotName{
  margin-top: 6px;
  font-weight: 900;
  font-size: 18px;
  line-height: 1.15;
}
.spotCardHeader .badge{
  font-weight: 900;
  font-size: 13px;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.22);
  white-space: nowrap;
}

.spotCardBody{ background:#fff; padding: 12px; }

.spotRow{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(2,6,23,0.08);
  font-weight: 800;
}
.spotRow:last-child{ border-bottom: 0; }

.spotActions{
  margin-top: 10px;
  display:flex;
  gap: 12px;
}

.spotAct{
  flex:1;
  border:0;
  border-radius: 999px;
  padding: 11px 12px;
  font-weight: 900;
  cursor: pointer;
  display:flex;
  align-items:center;
  justify-content:center;
  gap: 8px;
}
.spotAct.good{ background:#e9f7ee; color:#187a3b; }
.spotAct.bad{ background:#fdeaea; color:#b42318; }

@media (max-width: 420px){
  .brand{ font-size: 16px; padding: 9px 12px; }
  .countdownPill .time{ font-size: 15px; }
  .voteBtn{ padding: 11px 12px; font-size: 13px; }
  .spotCard{ width: 290px; }
  .addSpotBtn{ right: 12px; bottom: 114px; font-size: 13px; }
}
