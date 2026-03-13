// ═══════════════════════════════════════════════════
//  QC HELP SUPPORT v7 — app.js
//  Security · Performance · All Features Working
// ═══════════════════════════════════════════════════

// ╔══════════════════════════════════════════════╗
// ║  FIREBASE CONFIG — Your project              ║
// ╚══════════════════════════════════════════════╝
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyASU0ivb5KjUCvhNWv8gLmTD5ClHbAwzjs",
  authDomain:        "qchelp-93112.firebaseapp.com",
  databaseURL:       "https://qchelp-93112-default-rtdb.firebaseio.com",
  projectId:         "qchelp-93112",
  storageBucket:     "qchelp-93112.firebasestorage.app",
  messagingSenderId: "726164894798",
  appId:             "1:726164894798:web:55ce70fedc69e01a27ff1f",
  measurementId:     "G-BZ0BM8LFG8"
};

// ╔══════════════════════════════════════════════╗
// ║  CLOUDINARY CONFIG                           ║
// ║  Replace these with your own values:         ║
// ║  Dashboard → Settings → Upload Presets       ║
// ╚══════════════════════════════════════════════╝
const CLOUDINARY = {
  cloudName:   'dz0ozqboj',      // e.g. 'dxyz123abc'
  uploadPreset: 'qcplatform',  // unsigned upload preset name
  avatarFolder: 'qcplatform/avatars',
  postFolder:   'qcplatform/posts',
};

// ╔══════════════════════════════════════════════╗
// ║  PASTE YOUR UID HERE after first login       ║
// ║  Firebase Console → Auth → Users → your UID ║
// ╚══════════════════════════════════════════════╝
const ADMIN_UIDS = ["qtqDb9TaPCN3jjDKspnz2htLudm1"];

// ─── SPAM PROTECTION LIMITS ───────────────────────
const SPAM = {
  POST_INTERVAL_MS:   60_000,   // 1 min between posts
  COMMENT_INTERVAL_MS: 10_000,  // 10 sec between comments
  SOS_INTERVAL_MS:    300_000,  // 5 min between SOS
  MAX_POST_LEN:       2000,
  MAX_COMMENT_LEN:    500,
  MAX_NAME_LEN:       60,
  MAX_BRGY_LEN:       80,
  MAX_LOC_LEN:        200,
};

// ─── CACHE ────────────────────────────────────────
const CACHE = {
  posts:    new Map(),  // key → post obj
  users:    new Map(),  // uid → user obj
  TTL:      120_000,    // 2 min cache
  ts:       new Map(),  // key → timestamp
  set(ns, key, val){ this[ns].set(key, val); this.ts.set(ns+key, Date.now()); },
  get(ns, key){
    const t = this.ts.get(ns+key);
    if (!t || Date.now()-t > this.TTL) return null;
    return this[ns].get(key) ?? null;
  },
  invalidate(ns, key){ this[ns].delete(key); this.ts.delete(ns+key); },
  clear(){ this.posts.clear(); this.users.clear(); this.ts.clear(); }
};

// ─── SPAM TRACKING ────────────────────────────────
const lastAction = { post:0, comment:0, sos:0 };

// ─── FIREBASE INIT ────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db   = firebase.database();
// Firebase Storage removed — all media now uploaded to Cloudinary

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
let ME               = null;
let activeTab        = 'home';
let feedFilter       = 'all';
let feedSort         = 'newest';
let postTag          = 'General';
let postFeed         = 'feed';
let postUrgency      = 'medium';
let commentKey       = null;
let commentPostAuthorUID = null;
let reportTargetKey  = null;
let reportReason     = null;
let editKey          = null;
let editUrgency      = 'medium';
let offerPostKey     = null;
let offerChoice      = null;
let sharePostKey     = null;
let unread           = 0;
let notifications    = [];
let notifPanelOpen   = false;
let feedListener     = null;
let lfListener       = null;
let rpListener       = null;
let presenceRef      = null;
let touchY           = 0;
let leafletMap       = null;
let postImgFile      = null;
let particleRAF      = null;

// ─── DISASTER MODE ────────────────────────────────
let disasterModeActive = false;
let disasterModeListener = null;

// ─── COMMUNITY ALERTS ────────────────────────────
let alertListener = null;
let currentAlertKey = null;

// ─── ESCALATION ──────────────────────────────────
const ESCALATION_MS = 2 * 60 * 60 * 1000; // 2 hours
let escalationTimer = null;

// ─── ANON POSTS ──────────────────────────────────
let postAnon = false;

// ─── VOLUNTEER SYSTEM (Group B) ──────────────────
const VOLUNTEER_SKILLS = [
  { id:'medical',     label:'Medical Aid',       icon:'fa-heartbeat',       color:'#dc2626' },
  { id:'transport',   label:'Transportation',    icon:'fa-car',             color:'#2563eb' },
  { id:'counseling',  label:'Counseling',        icon:'fa-brain',           color:'#7c3aed' },
  { id:'rescue',      label:'Search & Rescue',   icon:'fa-life-ring',       color:'#ea580c' },
  { id:'food',        label:'Food Distribution', icon:'fa-utensils',        color:'#16a34a' },
  { id:'logistics',   label:'Logistics',         icon:'fa-boxes',           color:'#0891b2' },
  { id:'comms',       label:'Communications',    icon:'fa-broadcast-tower', color:'#9333ea' },
  { id:'tech',        label:'Tech Support',      icon:'fa-laptop',          color:'#0284c7' },
  { id:'legal',       label:'Legal Aid',         icon:'fa-balance-scale',   color:'#b45309' },
  { id:'childcare',   label:'Child Care',        icon:'fa-baby',            color:'#db2777' },
];

const AVAILABILITY_STATUS = {
  available: { label:'Available',  color:'#16a34a', dot:'#22c55e' },
  busy:      { label:'Busy',       color:'#d97706', dot:'#f59e0b' },
  offline:   { label:'Offline',    color:'#64748b', dot:'#94a3b8' },
};

// Skill→PostTag matching for smart volunteer matching
const SKILL_TAG_MAP = {
  medical:   ['Medical','Help Needed'],
  rescue:    ['Missing','Help Needed','Flood'],
  transport: ['Help Needed','Lost Person','Medical'],
  food:      ['Help Needed','General'],
  counseling:['Help Needed','General'],
  logistics: ['Flood','Help Needed','General'],
  comms:     ['Info','General'],
  tech:      ['Info','Power'],
  legal:     ['Info','General'],
  childcare: ['Help Needed','Missing'],
};

// ─── GROUP D — FUNCTIONAL FEATURES ───────────────

// Verified Org Types
const ORG_TYPES = {
  ngo:        { label:'NGO',              icon:'fa-hands-helping',  color:'#16a34a' },
  barangay:   { label:'Barangay Office',  icon:'fa-landmark',       color:'#2563eb' },
  hospital:   { label:'Hospital/Clinic',  icon:'fa-hospital',       color:'#dc2626' },
  rescue:     { label:'Rescue Team',      icon:'fa-life-ring',      color:'#ea580c' },
  business:   { label:'Local Business',   icon:'fa-store',          color:'#7c3aed' },
  school:     { label:'School/University',icon:'fa-graduation-cap', color:'#0891b2' },
  religious:  { label:'Religious Org',    icon:'fa-place-of-worship',color:'#b45309'},
  gov:        { label:'Government Agency',icon:'fa-building',       color:'#0284c7' },
};

// Community Resource Map — hardcoded QC resources + user-submitted
const QC_RESOURCES = [
  { name:'Quezon City General Hospital', type:'hospital', lat:14.6507, lng:121.0426, address:'Seminary Rd, Quezon City', phone:'8988-1111' },
  { name:'Philippine Heart Center',      type:'hospital', lat:14.6477, lng:121.0456, address:'East Ave, Quezon City',    phone:'8925-2401' },
  { name:'National Kidney Institute',    type:'hospital', lat:14.6478, lng:121.0449, address:'East Ave, Quezon City',    phone:'8981-0300' },
  { name:'QC Evacuation Center — Batasan', type:'evacuation', lat:14.6831, lng:121.0784, address:'Batasan Hills, QC' },
  { name:'QC Evacuation Center — Anonas', type:'evacuation', lat:14.6288, lng:121.0362, address:'Anonas, Quezon City' },
  { name:'Bureau of Fire Protection QC', type:'fire',     lat:14.6507, lng:121.0433, address:'Quezon City Hall Compound', phone:'8988-4242' },
  { name:'QC Disaster Risk Reduction Office', type:'drrm', lat:14.6508, lng:121.0427, address:'QC Hall, Elliptical Rd', phone:'8988-4243' },
  { name:'Quezon City Police District HQ', type:'police', lat:14.6461, lng:121.0417, address:'Camp Karingal, QC',     phone:'8722-0650' },
];

const RESOURCE_ICONS = {
  hospital:   { icon:'fa-hospital',     color:'#dc2626', bg:'#fee2e2' },
  evacuation: { icon:'fa-home',         color:'#2563eb', bg:'#dbeafe' },
  fire:       { icon:'fa-fire-truck',   color:'#ea580c', bg:'#ffedd5' },
  drrm:       { icon:'fa-shield-alt',   color:'#7c3aed', bg:'#ede9fe' },
  police:     { icon:'fa-shield-alt',   color:'#1d4ed8', bg:'#dbeafe' },
  shelter:    { icon:'fa-campground',   color:'#16a34a', bg:'#dcfce7' },
  food:       { icon:'fa-utensils',     color:'#d97706', bg:'#fef3c7' },
  ngo:        { icon:'fa-hands-helping',color:'#16a34a', bg:'#dcfce7' },
};

// Partnership state
let partnerListener = null;
let resourceMapInstance = null;
// Infinite scroll
let feedPage         = 0;
const PAGE_SIZE      = 10;
let allFeedPosts     = [];
let feedLoading      = false;
let feedExhausted    = false;
let feedRetryCount   = 0;

const ROLES = { resident:'Resident', nonresident:'Non-Resident' };
const TAGS  = {
  'General':    {a:'ta-gen',  c:'tc-gen'},
  'Help Needed':{a:'ta-help', c:'tc-help'},
  'Info':       {a:'ta-gen',  c:'tc-gen'},
  'Flood':      {a:'ta-flood',c:'tc-flood'},
  'Medical':    {a:'ta-med',  c:'tc-med'},
  'Missing':    {a:'ta-miss', c:'tc-miss'},
  'Power':      {a:'ta-pow',  c:'tc-pow'},
  'Traffic':    {a:'ta-traf', c:'tc-traf'},
  'Lost Person':{a:'ta-lost', c:'tc-lost'},
  'Lost Pet':   {a:'ta-lost', c:'tc-lost'},
  'Lost Item':  {a:'ta-lost', c:'tc-lost'},
  'Found':      {a:'ta-found',c:'tc-found'},
};
const EMOJIS = {
  'General':'General','Help Needed':'Help','Info':'Info','Flood':'Flood',
  'Medical':'Medical','Missing':'Missing','Power':'Power','Traffic':'Traffic',
  'Lost Person':'Lost Person','Lost Pet':'Lost Pet','Lost Item':'Lost Item','Found':'Found'
};

// Icon map for map markers
const TAG_ICONS = {
  'General':'fa-bullhorn','Help Needed':'fa-hand-holding-heart','Info':'fa-info-circle',
  'Flood':'fa-water','Medical':'fa-heartbeat','Missing':'fa-search',
  'Power':'fa-bolt','Traffic':'fa-car','Lost Person':'fa-user',
  'Lost Pet':'fa-paw','Lost Item':'fa-shopping-bag','Found':'fa-check-circle'
};
const VALID_TAGS  = new Set(Object.keys(TAGS));
const VALID_ROLES = new Set(['resident','nonresident']);
const VALID_FEEDS = new Set(['feed','lostfound','report']);
const VALID_URGENCY = new Set(['high','medium','low']);
const VALID_STATUS  = new Set(['pending','inprogress','resolved']);

// ═══════════════════════════════════════════════════
// SECURITY — Input Sanitization & Validation
// ═══════════════════════════════════════════════════
function sanitize(str, maxLen=500){
  if (typeof str !== 'string') return '';
  // Strip leading/trailing whitespace, collapse excessive whitespace
  str = str.trim().replace(/\s{3,}/g, '\n\n');
  // Remove null bytes and control characters except newlines/tabs
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Truncate
  return str.substring(0, maxLen);
}

function sanitizeStrict(str, maxLen=100){
  // Name/location fields — no newlines, no HTML-like content
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g,'').replace(/\s+/g,' ').substring(0, maxLen);
}

function esc(s){
  return String(s||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function validateEmail(email){
  return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email);
}

function validatePassword(pass){
  return typeof pass === 'string' && pass.length >= 6 && pass.length <= 128;
}

function validateName(name){
  return name && name.length >= 2 && name.length <= SPAM.MAX_NAME_LEN && /^[\p{L}\p{M}\s'-]+$/u.test(name);
}

function showFieldErr(id, msg){
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}

function clearFieldErrs(...ids){
  ids.forEach(id => showFieldErr(id, ''));
}

function isSpam(type){
  const now = Date.now();
  const limit = SPAM[type+'_INTERVAL_MS'] || 30000;
  if (now - lastAction[type] < limit){
    const rem = Math.ceil((limit - (now - lastAction[type])) / 1000);
    toast(`Please wait ${rem}s before ${type === 'post' ? 'posting' : 'commenting'} again.`, 'warn');
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  const pw = document.getElementById('pw');

  // Pull-to-refresh
  pw.addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, {passive:true});
  pw.addEventListener('touchend', e => {
    if (e.changedTouches[0].clientY - touchY > 80 && pw.scrollTop <= 0 && activeTab === 'home'){
      toast('Refreshing…'); reloadFeed();
    }
  }, {passive:true});

  // Infinite scroll
  pw.addEventListener('scroll', () => {
    if (activeTab !== 'home') return;
    if (pw.scrollTop + pw.clientHeight >= pw.scrollHeight - 250){
      loadMoreFeed();
    }
  }, {passive:true});

  // Close notif panel on outside click
  document.addEventListener('click', e => {
    if (!notifPanelOpen) return;
    const panel = document.getElementById('notifPanel');
    if (panel && !panel.contains(e.target) && !e.target.closest('.tn-bell')){
      hideNotifPanel();
    }
  });

  // Bell click handled by onclick attribute in HTML

  // Keyboard: close modals on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape'){
      document.querySelectorAll('.mo:not(.hidden)').forEach(m => {
        if (m.id !== 'postMO') closeMO(m.id);
      });
    }
  });

  loadWeather();
  renderBulletins();

  auth.onAuthStateChanged(async user => {
    if (user) {
      if (!user.emailVerified){
        hideSplash(); showAuth('verify');
        const el = document.getElementById('verifyTxt');
        if (el) el.textContent = `We sent a link to ${esc(user.email)}. Click it then tap Continue.`;
        return;
      }
      try {
        await loadProfile(user.uid);
        hideSplash();
        startApp();
      } catch(e){
        hideSplash();
        showErr('Failed to load profile. Check your connection.', ()=>location.reload());
      }
    } else {
      hideSplash();
      showAuth('login');
      startParticles();
    }
  });

  setTimeout(hideSplash, 5000);
});

function hideSplash(){
  const s = document.getElementById('splash');
  if (s && !s.classList.contains('out')){
    s.classList.add('out');
    setTimeout(() => { if (s) s.style.display='none'; }, 700);
  }
}

// ═══════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════
function showAuth(screen){
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('authWrap').classList.remove('hidden');
  ['login','register','verify','forgot'].forEach(s => {
    const el = document.getElementById('screen'+cap(s));
    if (el) el.classList.add('hidden');
  });
  const scr = document.getElementById('screen'+cap(screen));
  if (scr) scr.classList.remove('hidden');

  const slider = document.getElementById('atabSlider');
  const tabs   = document.getElementById('authTabs');
  const tl     = document.getElementById('tabLogin');
  const tr     = document.getElementById('tabRegister');
  const panel  = document.getElementById('authPanel');

  if (screen === 'login'){
    slider?.classList.remove('right');
    tl?.classList.add('active'); tl?.setAttribute('aria-selected','true');
    tr?.classList.remove('active'); tr?.setAttribute('aria-selected','false');
    if (tabs) tabs.style.display='flex';
  } else if (screen === 'register'){
    slider?.classList.add('right');
    tr?.classList.add('active'); tr?.setAttribute('aria-selected','true');
    tl?.classList.remove('active'); tl?.setAttribute('aria-selected','false');
    if (tabs) tabs.style.display='flex';
  } else {
    if (tabs) tabs.style.display='none';
  }
  if (panel) panel.scrollTop=0;
  startParticles();
}
function sw(screen){ showAuth(screen); }
function tpw(id,btn){
  const el = document.getElementById(id);
  if (!el) return;
  el.type = el.type === 'text' ? 'password' : 'text';
  btn.innerHTML = `<i class="fas fa-eye${el.type==='text'?'-slash':''}"></i>`;
  btn.setAttribute('aria-label', el.type==='text' ? 'Hide password' : 'Show password');
}

async function doLogin(){
  clearFieldErrs('liEmailErr','liPassErr');
  const email = (document.getElementById('liEmail')?.value||'').trim();
  const pass  = (document.getElementById('liPass')?.value||'');

  // Validation
  if (!email){ showFieldErr('liEmailErr','Email is required.'); return; }
  if (!validateEmail(email)){ showFieldErr('liEmailErr','Enter a valid email.'); return; }
  if (!pass){ showFieldErr('liPassErr','Password is required.'); return; }

  const btn = document.getElementById('liBtn'); setLoad(btn, true);
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch(e){
    showFieldErr('liPassErr', fbErr(e));
    setLoad(btn, false);
  }
}

function updatePwStrength(val) {
  const wrap = document.getElementById('pwStrengthWrap');
  const fill = document.getElementById('pwStrengthFill');
  const label = document.getElementById('pwStrengthLabel');
  if (!wrap || !fill || !label) return;
  if (!val || val.length === 0) { wrap.classList.remove('visible'); return; }
  wrap.classList.add('visible');
  let score = 0;
  if (val.length >= 6) score++;
  if (val.length >= 10) score++;
  if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  if (score <= 2) {
    fill.className = 'pw-strength-fill weak';
    label.className = 'pw-strength-label weak';
    label.innerHTML = '<i class="fas fa-times-circle" style="font-size:.7rem;margin-right:3px"></i>Weak password';
  } else if (score <= 3) {
    fill.className = 'pw-strength-fill fair';
    label.className = 'pw-strength-label fair';
    label.innerHTML = '<i class="fas fa-exclamation-circle" style="font-size:.7rem;margin-right:3px"></i>Fair password';
  } else {
    fill.className = 'pw-strength-fill strong';
    label.className = 'pw-strength-label strong';
    label.innerHTML = '<i class="fas fa-check-circle" style="font-size:.7rem;margin-right:3px"></i>Strong password';
  }
}

async function doRegister(){
  clearFieldErrs('rgNameErr','rgEmailErr','rgPassErr','rgPass2Err','rgBrgyErr');
  const name  = sanitizeStrict(document.getElementById('rgName')?.value||'', SPAM.MAX_NAME_LEN);
  const email = (document.getElementById('rgEmail')?.value||'').trim().toLowerCase();
  const pass  = (document.getElementById('rgPass')?.value||'');
  const pass2 = (document.getElementById('rgPass2')?.value||'');
  const brgy  = sanitizeStrict(document.getElementById('rgBrgy')?.value||'', SPAM.MAX_BRGY_LEN);
  const role  = document.getElementById('rgRole')?.value||'resident';

  // Validation
  let ok = true;
  if (!name || !validateName(name)){ showFieldErr('rgNameErr','Enter a valid full name (2–60 chars).'); ok=false; }
  if (!email || !validateEmail(email)){ showFieldErr('rgEmailErr','Enter a valid email address.'); ok=false; }
  if (!validatePassword(pass)){ showFieldErr('rgPassErr','Password must be at least 6 characters.'); ok=false; }
  if (pass !== pass2){ showFieldErr('rgPass2Err','Passwords do not match.'); ok=false; }
  if (!brgy || brgy.length < 2){ showFieldErr('rgBrgyErr','Enter your barangay.'); ok=false; }
  if (!VALID_ROLES.has(role)) return;
  if (!ok) return;

  const btn = document.getElementById('rgBtn'); setLoad(btn, true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({displayName: name});
    await db.ref('users/'+cred.user.uid).set({
      name, email, brgy, role,
      avatar:'', postCount:0, helpedCount:0,
      joined:Date.now(), badges:[], isAdmin:false, reputation:0,
      skills:[], availability:'offline', isVolunteer:false
    });
    await cred.user.sendEmailVerification();
    showAuth('verify');
    const el = document.getElementById('verifyTxt');
    if (el) el.textContent = `We sent a verification link to ${email}. Click it then tap Continue.`;
    toast('Account created! Check your email.','ok');
  } catch(e){
    if (e.code === 'auth/email-already-in-use'){
      showFieldErr('rgEmailErr','This email is already registered.');
    } else {
      toast(fbErr(e),'err');
    }
  }
  setLoad(btn, false);
}

async function checkVerified(){
  const btn = document.getElementById('verifyCheckBtn'); setLoad(btn,true);
  try {
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified){
      await loadProfile(auth.currentUser.uid);
      document.getElementById('authWrap').classList.add('hidden');
      startApp();
      toast('Email verified! Welcome!','ok');
    } else {
      toast('Not verified yet. Check your inbox.','warn');
    }
  } catch(e){ toast(fbErr(e),'err'); }
  setLoad(btn, false);
}

async function resendVerify(){
  const btn = document.getElementById('resendBtn');
  if (btn) btn.disabled = true;
  try {
    await auth.currentUser.sendEmailVerification();
    toast('Verification email resent!','ok');
  } catch(e){ toast(fbErr(e),'err'); }
  setTimeout(()=>{ if(btn) btn.disabled=false; }, 30000);
}

async function doForgot(){
  const email = (document.getElementById('fpEmail')?.value||'').trim().toLowerCase();
  if (!email || !validateEmail(email)) return toast('Enter a valid email','err');
  const btn = document.getElementById('fpBtn'); setLoad(btn,true);
  try {
    await auth.sendPasswordResetEmail(email);
    const el = document.getElementById('fpSuccess');
    if (el) el.classList.remove('hidden');
    toast('Reset link sent!','ok');
  } catch(e){ toast(fbErr(e),'err'); }
  setLoad(btn, false);
}

async function doLogout(){
  if (presenceRef) presenceRef.remove();
  detachListeners();
  CACHE.clear();
  await auth.signOut();
  ME = null; unread = 0;
  document.getElementById('mainApp').classList.add('hidden');
  showAuth('login');
  toast('Logged out. Ingat!');
}

async function changePassword(){
  const pw1 = document.getElementById('pwNew')?.value || '';
  const pw2 = document.getElementById('pwNew2')?.value || '';
  if (!validatePassword(pw1)) return toast('Minimum 6 characters','err');
  if (pw1 !== pw2) return toast('Passwords do not match','err');
  try {
    await auth.currentUser.updatePassword(pw1);
    document.getElementById('pwNew').value='';
    document.getElementById('pwNew2').value='';
    toast('Password changed!','ok');
  } catch(e){
    if (e.code==='auth/requires-recent-login') toast('Please log out and back in first','warn');
    else toast(fbErr(e),'err');
  }
}

// ═══════════════════════════════════════════════════
// CANVAS PARTICLES
// ═══════════════════════════════════════════════════
function startParticles(){
  const canvas = document.getElementById('authCanvas');
  if (!canvas || particleRAF) return;
  const ctx = canvas.getContext('2d');
  function resize(){ canvas.width=canvas.offsetWidth; canvas.height=canvas.offsetHeight; }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const P = Array.from({length:50}, () => ({
    x:Math.random()*canvas.width, y:Math.random()*canvas.height,
    r:Math.random()*2.5+.5, dx:(Math.random()-.5)*.4, dy:(Math.random()-.5)*.4,
    alpha:Math.random()*.5+.1, pulse:Math.random()*Math.PI*2
  }));

  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (let i=0;i<P.length;i++) for (let j=i+1;j<P.length;j++){
      const dx=P[i].x-P[j].x, dy=P[i].y-P[j].y;
      const d=Math.sqrt(dx*dx+dy*dy);
      if (d<90){
        ctx.beginPath();
        ctx.strokeStyle=`rgba(82,183,136,${.18*(1-d/90)})`;
        ctx.lineWidth=.6;
        ctx.moveTo(P[i].x,P[i].y); ctx.lineTo(P[j].x,P[j].y);
        ctx.stroke();
      }
    }
    P.forEach(p=>{
      p.pulse+=.02; const glow=.5+Math.sin(p.pulse)*.35;
      const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*3);
      g.addColorStop(0,`rgba(82,183,136,${p.alpha*glow})`);
      g.addColorStop(1,'rgba(82,183,136,0)');
      ctx.beginPath(); ctx.fillStyle=g;
      ctx.arc(p.x,p.y,p.r*3,0,Math.PI*2); ctx.fill();
      p.x+=p.dx; p.y+=p.dy;
      if(p.x<0) p.x=canvas.width;
      if(p.x>canvas.width) p.x=0;
      if(p.y<0) p.y=canvas.height;
      if(p.y>canvas.height) p.y=0;
    });
    particleRAF=requestAnimationFrame(draw);
  }
  draw();
}
function stopParticles(){
  if (particleRAF){ cancelAnimationFrame(particleRAF); particleRAF=null; }
}

// ═══════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════
async function loadProfile(uid){
  // Try cache
  const cached = CACHE.get('users', uid);
  if (cached){ ME={uid,...cached}; ME.isAdmin=ADMIN_UIDS.includes(uid)||ME.isAdmin; return; }

  const snap = await db.ref('users/'+uid).once('value');
  let data = snap.val();
  if (!data){
    const u = auth.currentUser;
    data={
      name: sanitizeStrict(u.displayName||'User', SPAM.MAX_NAME_LEN),
      email: u.email, brgy:'Quezon City', role:'resident',
      avatar:'', postCount:0, helpedCount:0,
      joined:Date.now(), badges:[], isAdmin:false, reputation:0,
      skills:[], availability:'offline', isVolunteer:false
    };
    await db.ref('users/'+uid).set(data);
  }
  CACHE.set('users', uid, data);
  ME = {uid,...data};
  ME.isAdmin = ADMIN_UIDS.includes(uid) || ME.isAdmin;
}

function calcReputation(u){
  return Math.max(0, (u.postCount||0)*10 + (u.helpedCount||0)*25);
}

function getRepBadge(rep){
  if (rep>=500) return `<span class="rep-badge rep-hero"><span class="rep-icon">H</span> Community Hero</span>`;
  if (rep>=200) return `<span class="rep-badge rep-champion"><span class="rep-icon">C</span> Champion</span>`;
  if (rep>=100) return `<span class="rep-badge rep-trusted"><span class="rep-icon">T</span> Trusted</span>`;
  if (rep>=30)  return `<span class="rep-badge rep-helper"><span class="rep-icon">H</span> Helper</span>`;
  return `<span class="rep-badge rep-new"><span class="rep-icon">N</span> New Member</span>`;
}

function getRepPct(rep){ return Math.min(100, Math.round(rep/5)); }

function getBadgeHTML(badges, isAdmin){
  let html='';
  if (isAdmin) html+='<span class="badge badge-admin"><i class="fas fa-shield-alt"></i> Admin</span>';
  if (!badges) return html;
  if (badges.includes('verified'))  html+='<span class="badge badge-verified"><i class="fas fa-check-circle"></i> Verified</span>';
  if (badges.includes('volunteer')) html+='<span class="badge badge-volunteer"><i class="fas fa-hands-helping"></i> Volunteer</span>';
  if (badges.includes('official'))  html+='<span class="badge badge-official"><i class="fas fa-landmark"></i> Official</span>';
  if (badges.includes('responder')) html+='<span class="badge badge-responder"><i class="fas fa-ambulance"></i> Responder</span>';
  if (badges.includes('moderator')) html+='<span class="badge badge-moderator"><i class="fas fa-tools"></i> Mod</span>';
  return html;
}

function el(id){ return document.getElementById(id); }
function setText(id, val){ const e=el(id); if(e) e.textContent=val; }
function setHTML(id, val){ const e=el(id); if(e) e.innerHTML=val; }

function refreshUI(){
  if (!ME) return;
  const ini       = initials(ME.name);
  const rep       = calcReputation(ME);
  const badgeHTML = getBadgeHTML(ME.badges||[], ME.isAdmin);
  const repBadge  = getRepBadge(rep);
  const repPct    = getRepPct(rep);

  setAv('tnAv',  ini,'#1B4332',ME.avatar);
  setAv('dAv',   ini,'#1B4332',ME.avatar);
  setAv('ccAv',  ini,'#1B4332',ME.avatar);
  setAv('lfAv',  ini,'#1B4332',ME.avatar);
  setAv('pmAv',  ini,'#1B4332',ME.avatar);
  setAv('cmtAv', ini,'#1B4332',ME.avatar);
  setAv('profAv',ini,'#1B4332',ME.avatar);
  setAv('setAvPrev',ini,'#1B4332',ME.avatar);
  setAv('curAv', ini,'#1B4332',ME.avatar);

  // Availability dot on topnav avatar
  const tnAvEl = el('tnAv');
  if (tnAvEl) {
    const avStatus = AVAILABILITY_STATUS[ME.availability||'offline'];
    tnAvEl.style.outline = `2px solid ${avStatus.dot}`;
    tnAvEl.style.outlineOffset = '1px';
  }

  setText('dName', ME.name);
  setText('dBrgy', ME.brgy);
  setHTML('dBadges', badgeHTML);
  setText('ccN', ME.name.split(' ')[0]);
  setText('pmBrgy', ME.brgy);
  setText('profName', ME.name);
  setHTML('profBadges', badgeHTML);
  setHTML('profBrgy','<i class="fas fa-map-marker-alt" aria-hidden="true"></i> '+esc(ME.brgy));
  setText('profRole', ROLES[ME.role]||ME.role);
  setText('psPosts',  ME.postCount||0);
  setText('psHelped', ME.helpedCount||0);
  setText('psJoined', fmtDate(ME.joined));
  setHTML('profRep', repBadge+' <span style="font-size:.75rem;color:var(--muted);margin-left:4px">'+rep+' pts</span>');

  const settRep = el('setReputation');
  if (settRep) settRep.innerHTML = repBadge+`<div class="rep-score-bar" style="margin-top:7px"><div class="rep-score-fill" style="width:${repPct}%"></div></div><small style="font-size:.7rem;color:var(--muted)">${rep} points · Level up at ${rep<30?30:rep<100?100:rep<200?200:rep<500?500:999} pts</small>`;

  // Volunteer section in settings
  const volSetStatus = el('setVolStatus');
  if (volSetStatus) volSetStatus.value = ME.availability || 'offline';
  renderVolSkillsPicker(ME.skills||[], ME.isVolunteer||false);

  // Profile volunteer skills display
  const profSkillsEl = el('profSkillsList');
  if (profSkillsEl){
    const skills = ME.skills||[];
    profSkillsEl.innerHTML = skills.length
      ? skills.map(sid => {
          const s = VOLUNTEER_SKILLS.find(x=>x.id===sid);
          return s ? `<span class="skill-chip" style="--sc:${s.color}"><i class="fas ${s.icon}"></i> ${s.label}</span>` : '';
        }).filter(Boolean).join('')
      : '<span style="color:var(--soft);font-size:.78rem">No skills listed yet</span>';
  }

  const sName = el('setName'); if(sName) sName.value = ME.name;
  const sBrgy = el('setBrgy'); if(sBrgy) sBrgy.value = ME.brgy;
  const sRole = el('setRole'); if(sRole) sRole.value = ME.role;
  setText('setEmail',   ME.email);
  setText('setVerified',auth.currentUser?.emailVerified?'Verified':'Not verified');
  setText('setJoined',  fmtDate(ME.joined));
  setHTML('setBadgeList', badgeHTML||'<span style="color:var(--soft);font-size:.8rem">No badges yet</span>');

  if (ME.isAdmin) el('adminNavBtn')?.classList.remove('hidden');

  // Sync availability quick-toggle buttons
  document.querySelectorAll('.avail-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.avail === (ME.availability||'offline'));
  });
}

function setAv(id, ini, col, url){
  const e = el(id); if (!e) return;
  if (url){
    e.style.background='transparent';
    e.innerHTML=`<img src="${esc(url)}" alt="${esc(ini)}" loading="lazy" onerror="this.parentElement.textContent='${esc(ini)}';this.parentElement.style.background='${col}'"/>`;
  } else {
    e.textContent=ini; e.style.background=col;
  }
}

async function saveProfile(){
  const name = sanitizeStrict(el('setName')?.value||'', SPAM.MAX_NAME_LEN);
  const brgy = sanitizeStrict(el('setBrgy')?.value||'', SPAM.MAX_BRGY_LEN);
  const role = el('setRole')?.value||'resident';
  if (!name || !validateName(name)) return toast('Enter a valid name (2–60 chars)','err');
  if (!brgy || brgy.length<2) return toast('Barangay cannot be empty','err');
  if (!VALID_ROLES.has(role)) return;
  await db.ref('users/'+ME.uid).update({name,brgy,role});
  CACHE.invalidate('users', ME.uid);
  ME={...ME,name,brgy,role}; refreshUI(); toast('Profile updated!','ok');
}

function triggerAvatarUpload(){ el('avInput')?.click(); }

async function uploadAvatar(input){
  const file = input.files[0]; if (!file) return;
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)){
    toast('Only JPG, PNG, or WebP images allowed','err'); input.value=''; return;
  }
  if (file.size > 5*1024*1024){ toast('Max file size is 5MB','err'); input.value=''; return; }
  showProgress('Compressing photo...', 5);
  try {
    const compressed = await compressImage(file, 400, 400, 0.80);
    showProgress('Uploading to Cloudinary...', 15);
    const url = await uploadToCloudinary(
      compressed,
      CLOUDINARY.avatarFolder,
      pct => updateProgress(15 + Math.round(pct * 0.82)) // maps 0-100 → 15-97
    );
    updateProgress(98);
    showProgress('Saving...', 98);
    await db.ref('users/'+ME.uid).update({ avatar: url });
    CACHE.invalidate('users', ME.uid);
    ME.avatar = url;
    refreshUI();
    toast('Profile photo updated!', 'ok');
  } catch(e) {
    console.error('Avatar upload error:', e);
    toast('Upload failed: ' + (e.message || 'Unknown error'), 'err');
  } finally {
    hideProgress();
    input.value = '';
  }
}

async function removeAvatar(){
  await db.ref('users/'+ME.uid).update({avatar:''});
  CACHE.invalidate('users', ME.uid);
  ME.avatar=''; refreshUI(); toast('Avatar removed','ok');
}

function openDelModal(){ el('delMO')?.classList.remove('hidden'); }
async function confirmDelete(){
  const confirm = el('delConfirm')?.value||'';
  if (confirm !== 'DELETE') return toast('Type DELETE exactly','err');
  try {
    await db.ref('users/'+ME.uid).remove();
    await auth.currentUser.delete();
    toast('Account deleted.','warn');
  } catch(e){
    if (e.code==='auth/requires-recent-login') toast('Log out and log in again first','warn');
    else toast(fbErr(e),'err');
  }
  closeMO('delMO');
}

// ═══════════════════════════════════════════════════
// CLOUDINARY UPLOAD
// Uploads a Blob/File to Cloudinary via unsigned preset.
// Returns the secure_url string on success.
// Works on all mobile browsers (uses FormData + fetch).
// ═══════════════════════════════════════════════════
async function uploadToCloudinary(blob, folder, onProgress){
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', CLOUDINARY.uploadPreset);
  formData.append('folder', folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/image/upload`;

    xhr.open('POST', url, true);

    // Progress tracking (works on all mobile browsers)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && typeof onProgress === 'function') {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.secure_url) {
            resolve(res.secure_url);
          } else {
            reject(new Error('Cloudinary did not return a URL. Check your upload preset.'));
          }
        } catch(e) {
          reject(new Error('Invalid response from Cloudinary.'));
        }
      } else {
        let msg = 'Upload failed (HTTP ' + xhr.status + ')';
        try {
          const err = JSON.parse(xhr.responseText);
          if (err.error?.message) msg = err.error.message;
        } catch(_) {}
        reject(new Error(msg));
      }
    };

    xhr.onerror  = () => reject(new Error('Network error — check your internet connection.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Try a smaller image.'));
    xhr.timeout  = 60000; // 60 second timeout

    xhr.send(formData);
  });
}

// ═══════════════════════════════════════════════════
// IMAGE COMPRESSION (canvas-based)
// ═══════════════════════════════════════════════════
function compressImage(file, maxW=800, maxH=800, quality=0.65){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let {width:w, height:h} = img;
      if (w > maxW || h > maxH){
        const ratio = Math.min(maxW/w, maxH/h);
        w = Math.round(w*ratio); h = Math.round(h*ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width=w; canvas.height=h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob=>{
        URL.revokeObjectURL(url);
        resolve(blob || file);
      }, file.type==='image/gif'?'image/gif':'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// ═══════════════════════════════════════════════════
// PROGRESS OVERLAY
// ═══════════════════════════════════════════════════
function showProgress(msg='Processing…', pct=0){
  const ov = el('progOverlay'); if (!ov) return;
  setText('progMsg', msg);
  ov.classList.remove('hidden');
  updateProgress(pct);
}
function updateProgress(pct){
  const bar = el('progBar'), pctEl = el('progPct'), circle = el('progCircle');
  if (bar) bar.style.width = pct+'%';
  if (pctEl) pctEl.textContent = Math.round(pct)+'%';
  if (circle){
    const circ = 113;
    circle.style.strokeDashoffset = circ - (circ * pct / 100);
  }
}
function hideProgress(){
  el('progOverlay')?.classList.add('hidden');
}

// ═══════════════════════════════════════════════════
// ERROR STATE
// ═══════════════════════════════════════════════════
function showErr(msg, retryFn){
  const wrap = el('feedWrap'); if (!wrap) return;
  const errEl = el('feedError');
  const skel  = el('skeletons');
  const list  = el('feedList');
  if (skel) skel.classList.add('hidden');
  if (list) list.innerHTML='';
  if (errEl){
    errEl.classList.remove('hidden');
    const h3 = errEl.querySelector('h3');
    const p  = errEl.querySelector('p');
    const btn= errEl.querySelector('.es-btn');
    if (h3) h3.textContent = 'Failed to load posts';
    if (p)  p.textContent  = msg || 'Check your connection and try again.';
    if (btn && retryFn){
      btn.onclick = retryFn;
      btn.classList.remove('hidden');
    }
  }
}

// ═══════════════════════════════════════════════════
// START APP
// ═══════════════════════════════════════════════════
function startApp(){
  el('authWrap')?.classList.add('hidden');
  el('mainApp')?.classList.remove('hidden');
  stopParticles(); refreshUI();
  goTab('home'); setupPresence(); updateStats();
  setInterval(updateStats, 60000);
  listenNotifications();
  listenDisasterMode();
  listenAlerts();
  startEscalationWatcher();
}

// ═══════════════════════════════════════════════════
// PRESENCE
// ═══════════════════════════════════════════════════
function setupPresence(){
  if (!ME) return;
  presenceRef = db.ref('online/'+ME.uid);
  presenceRef.set({name:sanitize(ME.name,60), t:Date.now()});
  presenceRef.onDisconnect().remove();
  setInterval(()=>{ if(presenceRef) presenceRef.set({name:sanitize(ME.name,60), t:Date.now()}); }, 60000);
}

async function updateOnline(){
  try {
    const snap = await db.ref('online').once('value');
    const now = Date.now(); let c=0;
    snap.forEach(s=>{ if(now-s.val().t<120000) c++; });
    setText('dOnline', c+' online now');
    setText('hOnline', c);
  } catch(e){}
}

async function updateStats(){
  try {
    const snap = await db.ref('posts').limitToLast(300).once('value');
    const today = new Date().toDateString(); let todayN=0, helped=0;
    snap.forEach(c=>{
      const p=c.val();
      if(new Date(p.t).toDateString()===today) todayN++;
      helped+=Object.keys(p.helpedBy||{}).length;
    });
    setText('hToday',  todayN);
    setText('hHelped', helped);
    updateOnline();
  } catch(e){}
}

// ═══════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════
function goTab(tab){
  document.querySelectorAll('.tp').forEach(p=>p.classList.remove('active','tp-enter'));
  document.querySelectorAll('.bb').forEach(b=>b.classList.remove('active'));
  activeTab = tab;
  const tabEl = el('tab-'+tab);
  if(tabEl){
    tabEl.classList.add('active');
    // Trigger page-in animation
    requestAnimationFrame(()=>{ tabEl.classList.add('tp-enter'); });
  }
  el('bb-'+tab)?.classList.add('active');

  if (tab==='activity')    { unread=0; updateBadge(); }
  if (tab==='account')     loadMyPosts();
  if (tab==='home')        { feedPage=0; allFeedPosts=[]; feedExhausted=false; attachFeedListener(); }
  if (tab==='lostfound')   attachLFListener();
  if (tab==='report')      attachRPListener();
  if (tab==='mapview')     initMapView();
  if (tab==='admin')       loadAdminDashboard();
  if (tab==='saved')       loadSavedPosts();
  if (tab==='settings')    refreshUI();
  if (tab==='supplies')    attachSupplyListener();
  if (tab==='impact')      loadImpactDashboard();
  if (tab==='partners')    loadPartners();
  if (tab==='resourcemap') initResourceMap();

  el('pw')?.scrollTo(0,0);
  const drawer = el('drawer');
  if (drawer && !drawer.classList.contains('hidden')){
    drawer.classList.add('hidden');
    el('dOverlay')?.classList.add('hidden');
  }
  if (notifPanelOpen) hideNotifPanel();
}

function toggleDrawer(){
  el('drawer')?.classList.toggle('hidden');
  el('dOverlay')?.classList.toggle('hidden');
}

// ═══════════════════════════════════════════════════
// FEED — Listeners & Infinite Scroll
// ═══════════════════════════════════════════════════
function detachListeners(){
  if (feedListener){      db.ref('posts').off('value',feedListener);     feedListener=null; }
  if (feedChangeWatcher){ db.ref('posts').off('child_added',feedChangeWatcher); feedChangeWatcher=null; }
  if (lfListener){        db.ref('posts').off('value',lfListener);       lfListener=null; }
  if (rpListener){        db.ref('posts').off('value',rpListener);       rpListener=null; }
}

// Track the timestamp of the newest post we've loaded
// so we can detect truly new posts without rebuilding the feed.
let feedNewestTs = 0;
let feedChangeWatcher = null;

function attachFeedListener(){
  el('skeletons')?.classList.remove('hidden');
  el('feedList').innerHTML='';
  el('feedEmpty')?.classList.add('hidden');
  el('feedError')?.classList.add('hidden');
  el('newBanner')?.classList.add('hidden');

  // Detach old realtime watcher if any
  if (feedListener){ db.ref('posts').off('value', feedListener); feedListener=null; }
  if (feedChangeWatcher){ db.ref('posts').off('child_added', feedChangeWatcher); feedChangeWatcher=null; }

  feedRetryCount = 0;

  // Realtime listener — loads all posts from /posts and filters client-side
  // so posts without a 'feed' field (older data) are still shown correctly.
  feedListener = db.ref('posts')
    .orderByChild('t')
    .on('value', snap => {
      el('skeletons')?.classList.add('hidden');
      el('feedError')?.classList.add('hidden');
      allFeedPosts = [];
      snap.forEach(c => {
        const p = c.val();
        if (!p || !p.body) return;
        // Only show posts intended for the main feed (or legacy posts with no feed field)
        const postFeedVal = p.feed || 'feed';
        if (postFeedVal !== 'feed') return;
        // Disaster mode: only show high urgency, SOS, or Help Needed
        if (disasterModeActive){
          const isUrgent = p.isSOS || p.urgency==='high' || p.tag==='Help Needed' || p.tag==='Flood' || p.tag==='Medical' || p.tag==='Missing';
          if (!isUrgent) return;
        }
        if (feedFilter!=='all' && p.tag!==feedFilter) return;
        const q = (el('searchBox')?.value||'').trim().toLowerCase();
        if (q && !p.body?.toLowerCase().includes(q) &&
                 !(p.authorName||'').toLowerCase().includes(q) &&
                 !(p.location||'').toLowerCase().includes(q)) return;
        CACHE.set('posts', c.key, p);
        allFeedPosts.push({key:c.key,...p});
      });
      sortPosts(allFeedPosts);
      feedNewestTs = allFeedPosts.length > 0 ? allFeedPosts[0].t : 0;
      feedPage=0; feedExhausted=false;
      el('feedList').innerHTML='';

      if (allFeedPosts.length === 0){
        el('feedEmpty')?.classList.remove('hidden');
        el('infLoader')?.classList.add('hidden');
      } else {
        el('feedEmpty')?.classList.add('hidden');
        renderFeedPage();
      }

      // After initial load, attach a SILENT watcher that only shows a banner
      // when a genuinely new post arrives — never rebuilds the feed
      startFeedChangeWatcher();
    }, () => {
      // onError callback
      el('skeletons')?.classList.add('hidden');
      feedRetryCount++;
      if (feedRetryCount <= 3){
        setTimeout(attachFeedListener, 2000*feedRetryCount);
      } else {
        showErr('Could not load posts. Check your connection.', reloadFeed);
      }
    });
}

let newPostCount = 0;
function startFeedChangeWatcher(){
  if (feedChangeWatcher){ db.ref('posts').off('child_added', feedChangeWatcher); }
  newPostCount = 0;

  feedChangeWatcher = db.ref('posts')
    .orderByChild('t').startAfter(feedNewestTs > 0 ? feedNewestTs : Date.now())
    .on('child_added', snap => {
      const p = snap.val();
      if (!p || !p.body) return;
      // Accept posts explicitly set to 'feed' OR legacy posts with no feed field
      const postFeedVal = p.feed || 'feed';
      if (postFeedVal !== 'feed') return;
      // Only show banner for posts added AFTER we loaded
      newPostCount++;
      const banner = el('newBanner');
      if (banner){
        banner.classList.remove('hidden');
        const txt = el('newBannerTxt');
        if (txt) txt.textContent = newPostCount === 1
          ? '1 new post'
          : newPostCount+' new posts';
      }
    });
}

function renderFeedPage(){
  const list  = el('feedList');
  const empty = el('feedEmpty');
  const start = feedPage * PAGE_SIZE;
  const chunk = allFeedPosts.slice(start, start+PAGE_SIZE);

  if (allFeedPosts.length===0){
    if (empty) empty.classList.remove('hidden');
    el('infLoader')?.classList.add('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  const frag = document.createDocumentFragment();
  chunk.forEach(p => {
    const div = document.createElement('div');
    div.innerHTML = buildCard(p);
    if (div.firstElementChild) frag.appendChild(div.firstElementChild);
  });
  list.appendChild(frag);
  feedPage++;

  const loader = el('infLoader');
  if (feedPage*PAGE_SIZE < allFeedPosts.length){
    if (loader) loader.classList.remove('hidden');
  } else {
    feedExhausted=true;
    if (loader) loader.classList.add('hidden');
  }
}

function loadMoreFeed(){
  if (feedLoading || feedExhausted || allFeedPosts.length===0) return;
  feedLoading=true;
  setTimeout(()=>{ renderFeedPage(); feedLoading=false; }, 300);
}

function sortPosts(posts){
  if (feedSort==='newest'){
    posts.sort((a,b)=>b.t-a.t);
  } else if (feedSort==='urgent'){
    const o = {high:0,medium:1,low:2};
    posts.sort((a,b)=>{
      const ua = a.isSOS?-1:(o[a.urgency]??1);
      const ub = b.isSOS?-1:(o[b.urgency]??1);
      return ua-ub || b.t-a.t;
    });
  } else if (feedSort==='supported'){
    posts.sort((a,b)=>Object.keys(b.likes||{}).length-Object.keys(a.likes||{}).length||b.t-a.t);
  }
}

function reloadFeed(){
  el('newBanner')?.classList.add('hidden');
  if (feedChangeWatcher){ db.ref('posts').off('child_added',feedChangeWatcher); feedChangeWatcher=null; }
  feedPage=0; allFeedPosts=[]; feedExhausted=false; feedRetryCount=0; newPostCount=0; feedNewestTs=0;
  CACHE.clear();
  attachFeedListener();
}

function setSort(sort, btn){
  feedSort=sort;
  document.querySelectorAll('.sort-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); attachFeedListener();
}

function setFilter(tag, btn){
  feedFilter=tag;
  document.querySelectorAll('#chips .chip').forEach(c=>c.classList.remove('active'));
  btn.classList.add('active'); attachFeedListener();
}

function attachLFListener(){
  if (lfListener){ db.ref('posts').off('value',lfListener); lfListener=null; }
  const list=el('lfList'), empty=el('lfEmpty');
  if(list) list.innerHTML='<div style="padding:18px;text-align:center;color:var(--muted);font-size:.85rem">Loading…</div>';

  lfListener = db.ref('posts').orderByChild('t').on('value', snap=>{
    if(!list) return;
    list.innerHTML='';
    let posts=[];
    snap.forEach(c=>{
      const p = c.val();
      if (!p || !p.body) return;
      // Include posts explicitly tagged lostfound; skip posts belonging to other feeds
      if ((p.feed || 'feed') !== 'lostfound') return;
      posts.push({key:c.key,...p});
    });
    posts.sort((a,b)=>b.t-a.t);
    if(empty) empty.classList.toggle('hidden', posts.length>0);
    if(posts.length===0) return;
    const frag=document.createDocumentFragment();
    posts.forEach(p=>{ const d=document.createElement('div'); d.innerHTML=buildCard(p); if(d.firstElementChild) frag.appendChild(d.firstElementChild); });
    list.appendChild(frag);
  }, ()=>toast('Failed to load Lost & Found posts','err'));
}

function attachRPListener(){
  if (rpListener){ db.ref('posts').off('value',rpListener); rpListener=null; }
  const list=el('reportList'), empty=el('reportEmpty');
  if(list) list.innerHTML='<div style="padding:18px;text-align:center;color:var(--muted);font-size:.85rem">Loading…</div>';

  rpListener = db.ref('posts').orderByChild('t').on('value', snap=>{
    if(!list) return;
    list.innerHTML='';
    let posts=[];
    snap.forEach(c=>{
      const p = c.val();
      if (!p || !p.body) return;
      // Include posts explicitly tagged report; skip posts belonging to other feeds
      if ((p.feed || 'feed') !== 'report') return;
      posts.push({key:c.key,...p});
    });
    posts.sort((a,b)=>b.t-a.t);
    if(empty) empty.classList.toggle('hidden', posts.length>0);
    if(posts.length===0) return;
    const frag=document.createDocumentFragment();
    posts.forEach(p=>{ const d=document.createElement('div'); d.innerHTML=buildCard(p); if(d.firstElementChild) frag.appendChild(d.firstElementChild); });
    list.appendChild(frag);
  }, ()=>toast('Failed to load reports','err'));
}

// ═══════════════════════════════════════════════════
// BUILD POST CARD
// ═══════════════════════════════════════════════════
function buildCard(p){
  if (!p || !p.authorUID) return '';
  const tc   = TAGS[p.tag]||TAGS['General'];
  const ini  = initials(p.authorName||'?');
  const col  = '#1B4332';
  const own  = ME && p.authorUID===ME.uid;
  const isAdm= ME && ME.isAdmin;
  const av   = p.authorAvatar
    ? `<img src="${esc(p.authorAvatar)}" alt="${esc(ini)}" loading="lazy" onerror="this.style.display='none'"/>`
    : ini;

  const liked  = !!(ME && p.likes  && p.likes[ME.uid]);
  const saved  = !!(ME && p.savedBy && p.savedBy[ME.uid]);
  const likeN  = Object.keys(p.likes||{}).length;
  const helpN  = Object.keys(p.helpedBy||{}).length;
  const cmtN   = p.commentCount||0;
  const volN   = Object.keys(p.volunteers||{}).length;

  const statusMap = {
    pending:   {cls:'sb-pending',   lbl:'Pending'},
    inprogress:{cls:'sb-inprogress',lbl:'In Progress'},
    resolved:  {cls:'sb-resolved',  lbl:'Resolved'}
  };
  const st  = statusMap[VALID_STATUS.has(p.status)?p.status:'pending'];
  const urgMap = {
    high:  {cls:'urg-high',lbl:'<span class="urgdot"></span> High'},
    medium:{cls:'urg-med', lbl:'<span class="urgdot"></span> Medium'},
    low:   {cls:'urg-low', lbl:'<span class="urgdot"></span> Low'}
  };
  const urg = urgMap[VALID_URGENCY.has(p.urgency)?p.urgency:'medium'];

  let authorBadge='';
  if (Array.isArray(p.authorBadges)){
    if (p.authorBadges.includes('verified'))  authorBadge+='<span class="badge badge-verified" aria-label="Verified"><i class="fas fa-check-circle"></i></span>';
    if (p.authorBadges.includes('official'))  authorBadge+='<span class="badge badge-official" aria-label="Official"><i class="fas fa-landmark"></i></span>';
  }
  if (p.authorIsAdmin) authorBadge+='<span class="badge badge-admin" aria-label="Admin"><i class="fas fa-shield-alt"></i></span>';

  const imgHTML = p.imageUrl
    ? `<img class="pimg" src="${esc(p.imageUrl)}" alt="Post image" loading="lazy" onclick="viewImg('${esc(p.imageUrl)}')" />`
    : '';
  const volHTML = volN>0
    ? `<span class="vol-badge"><i class="fas fa-user-check" style="margin-right:4px"></i>${volN} volunteer${volN>1?'s':''}</span>`
    : '';
  const editedHTML = p.edited
    ? '<span style="font-size:.65rem;color:var(--soft);margin-left:4px">(edited)</span>'
    : '';
  const escalationHTML = p.escalated
    ? `<span class="escalation-badge"><i class="fas fa-exclamation-triangle"></i> Needs Attention</span>`
    : '';
  const anonHTML = p.isAnon
    ? `<span class="anon-badge"><i class="fas fa-user-secret"></i> Anonymous</span>`
    : '';
  const timelineHTML = buildTimelineMini(p);
  const proofHTML = (p.status==='resolved' && p.proofPhotoUrl)
    ? `<div class="proof-photo-strip"><i class="fas fa-check-circle" style="color:var(--green)"></i> Resolved · <a href="${esc(p.proofPhotoUrl)}" target="_blank" rel="noopener noreferrer">View proof photo</a></div>`
    : '';

  const safeKey  = esc(p.key||'');
  const safeUID  = esc(p.authorUID||'');
  const safeStatus=esc(p.status||'pending');
  const safeUrg  = esc(p.urgency||'medium');
  const safeBody = esc((p.body||'').replace(/'/g,'&#39;').substring(0,120));
  const safeLoc  = esc((p.location||'').replace(/'/g,'&#39;'));

  return `<article class="pcard${p.escalated?' escalated-card':''}" id="pc-${safeKey}" aria-label="Post by ${esc(p.authorName)}">
  <div class="pcard-top ${tc.a}" aria-hidden="true"></div>
  ${escalationHTML}
  <div class="phead">
    <div class="pav" style="background:${p.isAnon?'#e2e8f0':(p.authorAvatar?'#eee':col)}" ${p.isAnon?'':`onclick="viewUser('${safeUID}')" role="button" tabindex="0" aria-label="View ${esc(p.authorName)}'s profile"`}>${p.isAnon?'<i class="fas fa-user-secret" style="font-size:1rem;color:#94a3b8;display:flex;align-items:center;justify-content:center;height:100%"></i>':av}</div>
    <div class="pmeta">
      <div class="pauth-row">
        <span class="pauth" ${p.isAnon?'':`onclick="viewUser('${safeUID}')" role="button" tabindex="0"`}>${p.isAnon?'<span class="anon-name"><i class="fas fa-user-secret"></i> Anonymous</span>':esc(p.authorName)}</span>
        ${p.isAnon?'':authorBadge}
        ${p.isAnon?'':`<span class="role-chip">${esc(ROLES[p.authorRole]||'Resident')}</span>`}
        <time class="ptime" datetime="${new Date(p.t).toISOString()}" title="${new Date(p.t).toLocaleString()}">${ago(p.t)}</time>
        ${editedHTML}
      </div>
      <div class="psub">
        <span class="ptchip ${tc.c}">${esc(p.tag)}</span>
        <span class="status-badge ${st.cls}">${st.lbl}</span>
        <span class="urg-badge ${urg.cls}">${urg.lbl}</span>
        ${p.location?`<span class="ploc"><i class="fas fa-map-marker-alt" style="font-size:.6rem;margin-right:2px"></i>${esc(p.location)}</span>`:''}
      </div>
      ${volHTML}
    </div>
  </div>
  <div class="pbody">${esc(p.body)}${imgHTML}</div>
  ${proofHTML}
  ${timelineHTML}
  <div class="pdiv" aria-hidden="true"></div>
  <div class="pacts" role="toolbar" aria-label="Post actions">
    <button class="pa${liked?' liked':''}" onclick="toggleLike('${safeKey}',this)" type="button" aria-label="${liked?'Unlike':'Like'} post">
      <i class="fa${liked?'s':'r'} fa-heart" aria-hidden="true"></i>
      <span id="lc-${safeKey}">${likeN}</span>
    </button>
    <button class="pa" onclick="openOfferHelp('${safeKey}')" type="button" aria-label="Offer help">
      <i class="fas fa-hands-helping" aria-hidden="true"></i> <span>${helpN}</span>
    </button>
    <button class="pa" onclick="openComments('${safeKey}','${safeUID}','${safeStatus}')" type="button" aria-label="Comments (${cmtN})">
      <i class="far fa-comment" aria-hidden="true"></i> <span id="cc-${safeKey}">${cmtN}</span>
    </button>
    <button class="pa" onclick="openTimeline('${safeKey}')" type="button" aria-label="View timeline" title="Help Timeline">
      <i class="fas fa-project-diagram" aria-hidden="true"></i>
    </button>
    <button class="pa" onclick="openCollabPanel('${safeKey}')" type="button" aria-label="Volunteer team" title="Volunteer Team">
      <i class="fas fa-users" aria-hidden="true"></i>${volN > 0 ? `<span style="font-size:.7rem;margin-left:2px">${volN}</span>` : ''}
    </button>
    ${(p.tag==='Help Needed'||p.tag==='Medical'||p.tag==='Flood'||p.tag==='Missing') ? `
    <button class="pa match-btn" onclick="openMatchVolunteers('${safeKey}','${esc(p.tag)}')" type="button" aria-label="Find volunteers" title="Find Matching Volunteers">
      <i class="fas fa-user-check" aria-hidden="true"></i>
    </button>` : ''}
    <button class="pa${saved?' bookmarked':''}" onclick="toggleSave('${safeKey}',this)" type="button" aria-label="${saved?'Remove bookmark':'Bookmark post'}">
      <i class="fa${saved?'s':'r'} fa-bookmark" aria-hidden="true"></i>
    </button>
    <button class="pa" onclick="openShareModal('${safeKey}','${safeBody}')" type="button" aria-label="Share post">
      <i class="fas fa-share-alt" aria-hidden="true"></i>
    </button>
    <button class="pa" onclick="openReportModal('${safeKey}')" type="button" aria-label="Report post">
      <i class="fas fa-flag" aria-hidden="true"></i>
    </button>
    ${(own||isAdm)?`
    <button class="pa" onclick="openEditModal('${safeKey}','${safeBody}','${safeLoc}','${safeUrg}')" type="button" aria-label="Edit post"><i class="fas fa-edit" aria-hidden="true"></i></button>
    <button class="pa del" onclick="deletePost('${safeKey}')" type="button" aria-label="Delete post"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>`:''}
  </div>
</article>`;
}

// ═══════════════════════════════════════════════════
// POST MODAL + IMAGE
// ═══════════════════════════════════════════════════
function openPost(tag='General', feed='feed'){
  postTag=VALID_TAGS.has(tag)?tag:'General';
  postFeed=VALID_FEEDS.has(feed)?feed:'feed';
  postImgFile=null; postUrgency='medium'; postAnon=false;
  const pmTxt=el('pmTxt'), pmLoc=el('pmLoc');
  if(pmTxt) pmTxt.value='';
  if(pmLoc) pmLoc.value='';
  setText('pmCC','0');
  const prev=el('postImgPreview');
  if(prev){ prev.classList.add('hidden'); prev.innerHTML=''; }
  const anonCb = el('anonCheck'); if(anonCb) anonCb.checked=false;
  const anonHint=el('anonHint'); if(anonHint) anonHint.classList.add('hidden');
  document.querySelectorAll('.ptag').forEach(b=>b.classList.toggle('active',b.dataset.tag===postTag));
  el('postUrgencyRow')?.querySelectorAll('.urg-btn').forEach(b=>b.classList.toggle('active',b.dataset.u==='medium'));
  el('postMO')?.classList.remove('hidden');
  setTimeout(()=>el('pmTxt')?.focus(), 300);
}

function pmCount(){
  const t=el('pmTxt'); if(!t) return;
  setText('pmCC', t.value.length);
}

function pickTag(btn){
  document.querySelectorAll('.ptag').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); postTag=btn.dataset.tag;
}

function pickPostUrgency(btn){
  el('postUrgencyRow')?.querySelectorAll('.urg-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); postUrgency=btn.dataset.u;
}

function previewPostImg(input){
  const file=input.files[0]; if(!file) return;
  if (!['image/jpeg','image/png','image/gif','image/webp'].includes(file.type)){
    toast('Only JPG, PNG, GIF, WebP images allowed','err'); input.value=''; return;
  }
  if (file.size>10*1024*1024){ toast('Max image size is 10MB','err'); input.value=''; return; }
  postImgFile=file;
  const reader=new FileReader();
  reader.onload=e=>{
    const prev=el('postImgPreview'); if(!prev) return;
    prev.classList.remove('hidden');
    prev.innerHTML=`<img src="${e.target.result}" alt="Preview" style="width:100%;max-height:180px;object-fit:cover;border-radius:10px"/>
      <button class="img-remove" onclick="removePostImg()" type="button" aria-label="Remove image"><i class="fas fa-times"></i></button>`;
  };
  reader.readAsDataURL(file);
  setText('imgHint', `${(file.size/1024/1024).toFixed(1)}MB • will compress`);
}

function removePostImg(){
  postImgFile=null;
  const prev=el('postImgPreview'); if(prev){ prev.classList.add('hidden'); prev.innerHTML=''; }
  const inp=el('postImg'); if(inp) inp.value='';
  setText('imgHint','Optional · Max 10MB');
}

async function submitPost(){
  if (isSpam('post')) return;
  const body = sanitize(el('pmTxt')?.value||'', SPAM.MAX_POST_LEN);
  const loc  = sanitizeStrict(el('pmLoc')?.value||'', SPAM.MAX_LOC_LEN);
  if (!body || body.length<3) return toast('Write something first (min 3 chars).','err');
  if (!VALID_URGENCY.has(postUrgency)) postUrgency='medium';
  if (!VALID_TAGS.has(postTag))        postTag='General';
  if (!VALID_FEEDS.has(postFeed))      postFeed='feed';

  const btn=el('postBtn'); setLoad(btn,true);
  let imageUrl='';

  try {
    if (postImgFile){
      showProgress('Compressing image...', 8);
      const compressed = await compressImage(postImgFile, 800, 800, 0.70);
      showProgress('Uploading to Cloudinary...', 18);
      imageUrl = await uploadToCloudinary(
        compressed,
        CLOUDINARY.postFolder,
        pct => updateProgress(18 + Math.round(pct * 0.75)) // maps 0-100 → 18-93
      );
      updateProgress(95);
    }

    showProgress('Saving post...', 96);
    const authorName  = postAnon ? 'Anonymous' : sanitize(ME.name,60);
    const authorBrgy  = postAnon ? 'Undisclosed' : sanitize(ME.brgy,80);
    const authorAvatar= postAnon ? '' : (ME.avatar||'');
    const authorBadges= postAnon ? [] : (ME.badges||[]);
    const authorIsAdm = postAnon ? false : (ME.isAdmin||false);
    await db.ref('posts').push({
      body, tag:postTag, feed:postFeed,
      location: loc||ME.brgy,
      t:Date.now(),
      authorUID:ME.uid, authorName, authorBrgy, authorRole:ME.role,
      authorAvatar, authorBadges, authorIsAdmin:authorIsAdm,
      likes:{}, helpedBy:{}, commentCount:0, isSOS:false,
      status:'pending', urgency:postUrgency, imageUrl, volunteers:{},
      isAnon: postAnon
    });

    await db.ref('users/'+ME.uid+'/postCount').transaction(n=>(n||0)+1);
    await updateReputation();
    ME.postCount=(ME.postCount||0)+1;
    setText('psPosts', ME.postCount);
    lastAction.post = Date.now();
    closeMO('postMO');
    hideProgress();
    toast('Posted to community!','ok');

    // Activity
    addActivityItem('post', ME.name+' posted', body.substring(0,60), Date.now());

    if (postFeed==='lostfound')     goTab('lostfound');
    else if (postFeed==='report')   goTab('report');
    else                            goTab('home');

  } catch(e){
    hideProgress();
    toast('Failed to post: '+(e.message||'Network error'),'err');
  }
  setLoad(btn,false);
}

// ═══════════════════════════════════════════════════
// EDIT POST
// ═══════════════════════════════════════════════════
function openEditModal(key, body, loc, urgency){
  editKey = key;
  editUrgency = VALID_URGENCY.has(urgency) ? urgency : 'medium';
  const etxt=el('editTxt'), eloc=el('editLoc'), ecc=el('editCC');
  if(etxt){ etxt.value=body||''; }
  if(ecc) ecc.textContent=(body||'').length;
  if(eloc) eloc.value=loc||'';
  el('editUrgency')?.querySelectorAll('.urg-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.u===editUrgency);
  });
  el('editMO')?.classList.remove('hidden');
  setTimeout(()=>el('editTxt')?.focus(), 300);
}

function pickUrgency(btn){
  const row=btn.closest('.urgency-row'); if(!row) return;
  row.querySelectorAll('.urg-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); editUrgency=btn.dataset.u;
}

async function saveEdit(){
  const body = sanitize(el('editTxt')?.value||'', SPAM.MAX_POST_LEN);
  const loc  = sanitizeStrict(el('editLoc')?.value||'', SPAM.MAX_LOC_LEN);
  if (!body || body.length<3) return toast('Post cannot be empty','err');
  if (!editKey) return;
  const btn=el('editBtn'); setLoad(btn,true);
  try {
    await db.ref('posts/'+editKey).update({
      body, location:loc||'', urgency:VALID_URGENCY.has(editUrgency)?editUrgency:'medium',
      edited:true, editedAt:Date.now()
    });
    CACHE.invalidate('posts', editKey);
    closeMO('editMO');
    toast('Post updated!','ok');
    // Patch DOM immediately
    const card=el('pc-'+editKey);
    if(card){
      const pb=card.querySelector('.pbody');
      if(pb){ const text=pb.firstChild; if(text&&text.nodeType===3) text.textContent=body; }
    }
  } catch(e){ toast('Failed to update: '+(e.message||'Network error'),'err'); }
  setLoad(btn,false);
}

// ═══════════════════════════════════════════════════
// DELETE POST
// ═══════════════════════════════════════════════════
async function deletePost(key){
  if (!confirm('Delete this post permanently?')) return;
  const card=el('pc-'+key);
  if(card){ card.style.transition='.3s'; card.style.opacity='0'; card.style.transform='scale(.95)'; }
  try {
    await db.ref('posts/'+key).remove();
    await db.ref('comments/'+key).remove();
    CACHE.invalidate('posts', key);
    if(ME) await db.ref('users/'+ME.uid+'/postCount').transaction(n=>Math.max(0,(n||1)-1));
    setTimeout(()=>card?.remove(), 300);
    toast('Post deleted','ok');
  } catch(e){
    if(card){ card.style.opacity='1'; card.style.transform='none'; }
    toast('Failed to delete: '+(e.message||'Network error'),'err');
  }
}

// ═══════════════════════════════════════════════════
// LIKE
// ═══════════════════════════════════════════════════
async function toggleLike(key, btn){
  if (!ME) return;
  const ref=db.ref('posts/'+key+'/likes/'+ME.uid);
  try {
    const snap=await ref.once('value');
    if(snap.exists()){
      await ref.remove(); btn.classList.remove('liked'); btn.querySelector('i').className='far fa-heart'; btn.setAttribute('aria-label','Like post');
    } else {
      await ref.set(true); btn.classList.add('liked'); btn.querySelector('i').className='fas fa-heart'; btn.setAttribute('aria-label','Unlike post');
    }
    const s2=await db.ref('posts/'+key+'/likes').once('value');
    const lc=el('lc-'+key); if(lc) lc.textContent=s2.numChildren();
  } catch(e){ toast('Could not update like','err'); }
}

// ═══════════════════════════════════════════════════
// OFFER HELP
// ═══════════════════════════════════════════════════
function openOfferHelp(key){
  offerPostKey=key; offerChoice=null;
  const note=el('offerNote'); if(note) note.value='';
  const btn=el('offerBtn'); if(btn) btn.disabled=true;
  document.querySelectorAll('.offer-opt').forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-checked','false'); });

  // Show volunteer's own skills as quick picks
  const skillsRow = el('offerMySkills');
  if (skillsRow){
    const mySkills = ME?.skills||[];
    if (mySkills.length > 0){
      skillsRow.classList.remove('hidden');
      const skillBtns = el('offerSkillBtns');
      if (skillBtns){
        skillBtns.innerHTML = mySkills.map(sid => {
          const s = VOLUNTEER_SKILLS.find(x=>x.id===sid);
          return s ? `<button class="offer-skill-chip" type="button" style="--sc:${s.color}"
            onclick="pickOffer(null,'I can help with ${s.label}.');pickOfferSkill(this)"
            data-offer="I can help with ${s.label}.">
            <i class="fas ${s.icon}"></i> ${s.label}
          </button>` : '';
        }).filter(Boolean).join('');
      }
    } else {
      skillsRow.classList.add('hidden');
    }
  }

  el('offerMO')?.classList.remove('hidden');
}

function pickOfferSkill(btn){
  el('offerSkillBtns')?.querySelectorAll('.offer-skill-chip').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  const obtn=el('offerBtn'); if(obtn) obtn.disabled=false;
  offerChoice = btn?.dataset.offer || offerChoice;
}

function pickOffer(btn, choice){
  document.querySelectorAll('.offer-opt').forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-checked','false'); });
  btn.classList.add('active'); btn.setAttribute('aria-checked','true');
  offerChoice=choice;
  const obtn=el('offerBtn'); if(obtn) obtn.disabled=false;
}

async function submitOffer(){
  if (!offerPostKey || !offerChoice) return;
  const note = sanitize(el('offerNote')?.value||'', 300);
  const btn=el('offerBtn'); setLoad(btn,true);
  try {
    await db.ref('posts/'+offerPostKey+'/volunteers/'+ME.uid).set({
      name:sanitize(ME.name,60), offer:offerChoice, note, t:Date.now(),
      skills: ME.skills||[], availability: ME.availability||'offline'
    });
    await db.ref('posts/'+offerPostKey+'/helpedBy/'+ME.uid).set(true);
    // Record firstVolunteerT if this is the first volunteer
    const volSnap = await db.ref('posts/'+offerPostKey+'/firstVolunteerT').once('value');
    if (!volSnap.exists()) {
      await db.ref('posts/'+offerPostKey+'/firstVolunteerT').set(Date.now());
    }
    await db.ref('users/'+ME.uid+'/helpedCount').transaction(n=>(n||0)+1);
    ME.helpedCount=(ME.helpedCount||0)+1;
    await updateReputation();

    const postSnap=await db.ref('posts/'+offerPostKey).once('value');
    const post=postSnap.val();
    if(post && post.authorUID!==ME.uid){
      await pushNotification(post.authorUID,'offer',`${ME.name} offered to help!`,offerChoice,offerPostKey);
    }
    closeMO('offerMO'); toast('Help offer sent!','ok');
    addActivityItem('help', ME.name+' offered help', offerChoice, Date.now());
  } catch(e){ toast('Failed to send offer: '+(e.message||'Network error'),'err'); }
  setLoad(btn,false);
}

// ═══════════════════════════════════════════════════
// BOOKMARK / SAVE
// ═══════════════════════════════════════════════════
async function toggleSave(key, btn){
  if (!ME) return;
  const ref=db.ref('posts/'+key+'/savedBy/'+ME.uid);
  try {
    const snap=await ref.once('value');
    if(snap.exists()){
      await ref.remove(); btn.classList.remove('bookmarked'); btn.querySelector('i').className='far fa-bookmark';
      btn.setAttribute('aria-label','Bookmark post'); toast('Removed from saved');
    } else {
      await ref.set(true); btn.classList.add('bookmarked'); btn.querySelector('i').className='fas fa-bookmark';
      btn.setAttribute('aria-label','Remove bookmark'); toast('Post saved!','ok');
    }
  } catch(e){ toast('Could not update bookmark','err'); }
}

async function loadSavedPosts(){
  const list=el('savedList'), empty=el('savedEmpty');
  if(!list) return;
  list.innerHTML='<div class="empty-fancy" style="padding:28px 16px"><i class="fas fa-spinner fa-spin" style="color:var(--soft)"></i><p style="color:var(--muted);margin-top:10px">Loading saved posts…</p></div>';
  try {
    const snap=await db.ref('posts').once('value');
    list.innerHTML=''; let posts=[];
    snap.forEach(c=>{ const p=c.val(); if(p.savedBy&&p.savedBy[ME.uid]) posts.push({key:c.key,...p}); });
    posts.sort((a,b)=>b.t-a.t);
    if(empty) empty.classList.toggle('hidden', posts.length>0);
    if(posts.length===0) return;
    const frag=document.createDocumentFragment();
    posts.forEach(p=>{ const d=document.createElement('div'); d.innerHTML=buildCard(p); if(d.firstElementChild) frag.appendChild(d.firstElementChild); });
    list.appendChild(frag);
  } catch(e){
    list.innerHTML='<div class="error-state"><div class="es-icon">⚠️</div><h3>Failed to load</h3><p>Check your connection.</p><button class="es-btn" onclick="loadSavedPosts()"><i class="fas fa-redo"></i> Retry</button></div>';
  }
}

// ═══════════════════════════════════════════════════
// SHARE
// ═══════════════════════════════════════════════════
function openShareModal(key, preview){
  sharePostKey=key;
  el('shareMO')?.classList.remove('hidden');
  const prev=el('sharePreview');
  if(prev){ prev.textContent=(preview||'').substring(0,80)+'…'; prev.classList.remove('hidden'); }
}

function doShare(platform){
  const url  = `${location.origin}${location.pathname}?post=${encodeURIComponent(sharePostKey)}`;
  const text = `Check this help request on QC Help Support:\n${url}`;
  if (platform==='copy'){
    if (navigator.clipboard){
      navigator.clipboard.writeText(url).then(()=>toast('Link copied!','ok')).catch(()=>toast('Copy failed','err'));
    } else {
      const ta=document.createElement('textarea'); ta.value=url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Link copied!','ok');
    }
    closeMO('shareMO'); return;
  }
  const urls = {
    facebook:  `https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    twitter:   `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
    messenger: `fb-messenger://share?link=${encodeURIComponent(url)}`,
    viber:     `viber://forward?text=${encodeURIComponent(text)}`,
    sms:       `sms:?body=${encodeURIComponent(text)}`,
  };
  if (urls[platform]) window.open(urls[platform],'_blank','noopener');
  toast('Opening share…','ok'); closeMO('shareMO');
}

// ═══════════════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════════════
let cmtDbListener = null;

async function openComments(key, authorUID, currentStatus){
  commentKey=key; commentPostAuthorUID=authorUID;
  const cmtList=el('cmtList');
  if(cmtList) cmtList.innerHTML='<div style="padding:16px;text-align:center;color:var(--muted);font-size:.85rem">Loading comments…</div>';
  el('cmtMO')?.classList.remove('hidden');

  const canChange = ME&&(ME.uid===authorUID||ME.isAdmin);
  const sc=el('statusChanger'); if(sc) sc.classList.toggle('hidden',!canChange);
  const ss=el('statusSel'); if(ss&&canChange) ss.value=VALID_STATUS.has(currentStatus)?currentStatus:'pending';

  try {
    const snap=await db.ref('posts/'+key).once('value');
    const p=snap.val();
    if(p){ setText('cmtPrev',(p.body||'').substring(0,100)+((p.body||'').length>100?'…':'')); }
  } catch(e){}

  if(cmtDbListener) db.ref('comments/'+commentKey).off('child_added',cmtDbListener);

  // Use child_added: appends new comments instead of rebuilding the entire list
  // First, load existing comments once
  cmtList.innerHTML='';
  try {
    const existing = await db.ref('comments/'+key).orderByChild('t').once('value');
    if (!existing.exists()){
      cmtList.innerHTML='<div style="padding:14px 0;text-align:center;color:var(--muted);font-size:.83rem">No comments yet. Be first!</div>';
    } else {
      existing.forEach(c=>{ appendComment(c.key, c.val(), key, cmtList); });
      cmtList.scrollTop=cmtList.scrollHeight;
    }
  } catch(e){}

  // Then listen only for new children added after now
  const afterTs = Date.now();
  cmtDbListener=db.ref('comments/'+key).orderByChild('t').startAfter(afterTs).on('child_added', snap=>{
    const cmtListEl = el('cmtList'); if(!cmtListEl) return;
    // Remove empty state if present
    const empty = cmtListEl.querySelector('div:not(.citem)');
    if(empty && !empty.id) empty.remove();
    appendComment(snap.key, snap.val(), key, cmtListEl);
    cmtListEl.scrollTop=cmtListEl.scrollHeight;
  });
}

function appendComment(cmtKey, cm, postKey, container){
  if(!cm || !container) return;
  const ini=initials(cm.authorName||'?');
  const av=cm.authorAvatar?`<img src="${esc(cm.authorAvatar)}" alt="${esc(ini)}" loading="lazy" onerror="this.style.display='none'"/>`:ini;
  const own=ME&&cm.authorUID===ME.uid;
  const div=document.createElement('div'); div.className='citem'; div.id='cmt-'+cmtKey;
  div.innerHTML=`<div class="cav" style="background:${cm.authorAvatar?'#eee':'#1B4332'};cursor:pointer" onclick="viewUser('${esc(cm.authorUID)}')" role="button" aria-label="View ${esc(cm.authorName)}'s profile">${av}</div>
    <div class="cbody">
      <strong onclick="viewUser('${esc(cm.authorUID)}')" role="button" tabindex="0">${esc(cm.authorName)}</strong>
      <p>${esc(cm.body)}</p>
      <small>${ago(cm.t)}</small>
    </div>
    ${(own||(ME&&ME.isAdmin))?`<button class="cdel" onclick="deleteComment('${cmtKey}','${esc(postKey)}')" type="button" aria-label="Delete comment"><i class="fas fa-trash-alt"></i></button>`:''}`;
  container.appendChild(div);
}

async function sendComment(){
  if (isSpam('comment')) return;
  const box=el('cmtBox'); if(!box) return;
  const body=sanitize(box.value, SPAM.MAX_COMMENT_LEN);
  if (!body || body.length<1 || !commentKey) return;
  box.value='';
  try {
    await db.ref('comments/'+commentKey).push({
      body, t:Date.now(),
      authorUID:ME.uid, authorName:sanitize(ME.name,60),
      authorBrgy:sanitize(ME.brgy,80), authorRole:ME.role,
      authorAvatar:ME.avatar||''
    });
    await db.ref('posts/'+commentKey+'/commentCount').transaction(n=>(n||0)+1);
    const cc=el('cc-'+commentKey); if(cc) cc.textContent=parseInt(cc.textContent||'0')+1;
    lastAction.comment = Date.now();
    if (commentPostAuthorUID && commentPostAuthorUID!==ME.uid){
      await pushNotification(commentPostAuthorUID,'comment',`${ME.name} commented on your post`,body.substring(0,60),commentKey);
    }
  } catch(e){ toast('Failed to send comment: '+(e.message||'Network error'),'err'); }
}

async function deleteComment(cmtKey, postKey){
  if (!confirm('Delete this comment?')) return;
  try {
    await db.ref('comments/'+postKey+'/'+cmtKey).remove();
    await db.ref('posts/'+postKey+'/commentCount').transaction(n=>Math.max(0,(n||1)-1));
    const el2=el('cmt-'+cmtKey);
    if(el2){ el2.style.opacity='0'; setTimeout(()=>el2.remove(),250); }
    const cc=el('cc-'+postKey); if(cc) cc.textContent=Math.max(0,parseInt(cc.textContent||'1')-1);
    toast('Comment deleted','ok');
  } catch(e){ toast('Failed to delete comment','err'); }
}

async function changePostStatus(newStatus){
  if (!commentKey || !VALID_STATUS.has(newStatus)) return;
  // If resolving, prompt for photo proof
  if (newStatus === 'resolved'){
    openProofModal(commentKey, newStatus);
    return;
  }
  await _applyStatusChange(commentKey, newStatus);
}

async function _applyStatusChange(postKey, newStatus, proofUrl){
  try {
    const updates = { status: newStatus };
    if (newStatus === 'inprogress') updates.inprogressAt = Date.now();
    if (newStatus === 'resolved'){
      updates.resolvedAt = Date.now();
      if (proofUrl) updates.proofPhotoUrl = proofUrl;
    }
    await db.ref('posts/'+postKey).update(updates);
    const card=el('pc-'+postKey);
    if(card){
      const statusMap={pending:{cls:'sb-pending',lbl:'Pending'},inprogress:{cls:'sb-inprogress',lbl:'In Progress'},resolved:{cls:'sb-resolved',lbl:'Resolved'}};
      const st=statusMap[newStatus]; const sb=card.querySelector('.status-badge');
      if(sb){ sb.className='status-badge '+st.cls; sb.textContent=st.lbl; }
      if (proofUrl){
        const proof = document.createElement('div');
        proof.className='proof-photo-strip';
        proof.innerHTML=`<i class="fas fa-check-circle" style="color:var(--green)"></i> Resolved · <a href="${esc(proofUrl)}" target="_blank" rel="noopener">View proof photo</a>`;
        card.querySelector('.pdiv')?.before(proof);
      }
    }
    CACHE.invalidate('posts', postKey);
    toast('Status updated!','ok');
    if(newStatus==='resolved') addActivityItem('resolve','Post resolved!',postKey,Date.now());
  } catch(e){ toast('Failed to update status','err'); }
}

let proofPostKey = null;
let proofImgFile = null;
let proofTargetStatus = 'resolved';

function openProofModal(postKey, newStatus){
  proofPostKey = postKey;
  proofTargetStatus = newStatus;
  proofImgFile = null;
  const prev = el('proofPreview'); if(prev){ prev.src=''; prev.classList.add('hidden'); }
  const hint = el('proofSkipHint'); if(hint) hint.classList.remove('hidden');
  el('proofMO')?.classList.remove('hidden');
}

function triggerProofUpload(){ el('proofInput')?.click(); }

function onProofSelected(input){
  const file = input.files[0]; if (!file) return;
  proofImgFile = file;
  const prev = el('proofPreview');
  if (prev){
    prev.src = URL.createObjectURL(file);
    prev.classList.remove('hidden');
  }
  const hint = el('proofSkipHint'); if(hint) hint.classList.add('hidden');
}

async function submitProof(skipPhoto){
  const btn = el('proofSubmitBtn'); setLoad(btn, true);
  let proofUrl = '';
  try {
    if (!skipPhoto && proofImgFile){
      showProgress('Uploading proof photo…', 10);
      const compressed = await compressImage(proofImgFile, 1000, 1000, 0.75);
      proofUrl = await uploadToCloudinary(compressed, 'qchelp/proofs', pct => updateProgress(10 + Math.round(pct*0.85)));
      hideProgress();
    }
    await _applyStatusChange(proofPostKey, proofTargetStatus, proofUrl);
    closeMO('proofMO');
  } catch(e){ toast('Failed: '+(e.message||'Error'),'err'); hideProgress(); }
  setLoad(btn, false);
}

function closeMO(id, e){
  if (e && e.target !== el(id)) return;
  el(id)?.classList.add('hidden');
  if (id==='cmtMO'){
    if (cmtDbListener && commentKey){
      db.ref('comments/'+commentKey).off('child_added',cmtDbListener);
      cmtDbListener=null;
    }
    commentKey=null;
  }
}

// ═══════════════════════════════════════════════════
// IMAGE FULLSCREEN
// ═══════════════════════════════════════════════════
function viewImg(url){
  const ov=document.createElement('div');
  ov.className='img-overlay';
  ov.setAttribute('role','dialog');
  ov.setAttribute('aria-label','Image fullscreen');
  ov.innerHTML=`<img src="${esc(url)}" alt="Post image"/>`;
  ov.onclick=()=>ov.remove();
  document.body.appendChild(ov);
}

// ═══════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════
async function pushNotification(targetUID, type, title, body, postKey){
  if (!targetUID || !type) return;
  try {
    await db.ref('notifications/'+targetUID).push({
      type, title:sanitize(title,100), body:sanitize(body,100), postKey, t:Date.now(), read:false
    });
  } catch(e){}
}

function listenNotifications(){
  if (!ME) return;
  db.ref('notifications/'+ME.uid).orderByChild('t').limitToLast(30).on('value', snap=>{
    notifications=[];
    snap.forEach(c=>notifications.unshift({key:c.key,...c.val()}));
    unread=notifications.filter(n=>!n.read).length;
    updateBadge();
    if (notifPanelOpen) renderNotifPanel();
  });
}

function toggleNotifPanel(){
  notifPanelOpen ? hideNotifPanel() : showNotifPanel();
}

function showNotifPanel(){
  notifPanelOpen=true;
  let panel=el('notifPanel');
  if (!panel){
    panel=document.createElement('div');
    panel.id='notifPanel';
    panel.className='notif-panel';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label','Notifications');
    document.body.appendChild(panel);
  }
  panel.classList.remove('hidden');
  panel.classList.remove('notif-panel-enter');
  void panel.offsetWidth; // force reflow
  panel.classList.add('notif-panel-enter');
  renderNotifPanel();
  // Mark all read after 1.5s
  setTimeout(async()=>{
    for (const n of notifications){
      if (!n.read) await db.ref('notifications/'+ME.uid+'/'+n.key+'/read').set(true).catch(()=>{});
    }
  }, 1500);
}

function hideNotifPanel(){
  notifPanelOpen=false;
  el('notifPanel')?.classList.add('hidden');
}

function renderNotifPanel(){
  const panel=el('notifPanel'); if(!panel) return;
  const icons={comment:'<i class="fas fa-comment"></i>',offer:'<i class="fas fa-hands-helping"></i>',help:'<i class="fas fa-hand-holding-heart"></i>',resolve:'<i class="fas fa-check-circle"></i>',post:'<i class="fas fa-bullhorn"></i>',escalation:'<i class="fas fa-exclamation-triangle"></i>',alert:'<i class="fas fa-satellite-dish"></i>'};
  panel.innerHTML=`<div class="notif-head">
    <h4><i class="fas fa-bell"></i> Notifications</h4>
    <button class="notif-clear" onclick="clearAllNotifs()" type="button">Clear all</button>
  </div>
  <div class="notif-list">${
    notifications.length===0
      ? '<div class="notif-empty">No notifications yet</div>'
      : notifications.map(n=>`
        <div class="notif-item${n.read?'':' unread'}" onclick="hideNotifPanel()" role="button" tabindex="0">
          <div class="ni-icon-design ni-${n.type||'post'}">${icons[n.type]||'<i class="fas fa-bell"></i>'}</div>
          <div class="ni-body">
            <strong>${esc(n.title)}</strong>
            <p>${esc(n.body)}</p>
            <small>${ago(n.t)}</small>
          </div>
        </div>`).join('')
  }</div>`;
}

async function clearAllNotifs(){
  try { await db.ref('notifications/'+ME.uid).remove(); } catch(e){}
  notifications=[]; unread=0; updateBadge(); renderNotifPanel();
  toast('Notifications cleared','ok');
}

function updateBadge(){
  const s = unread>99?'99+':String(unread);
  [el('nBadge'), el('bbBadge')].forEach(b=>{
    if(!b) return; b.textContent=s; b.classList.toggle('hidden',unread===0);
  });
}

// ═══════════════════════════════════════════════════
// REPUTATION
// ═══════════════════════════════════════════════════
async function updateReputation(){
  if (!ME) return;
  const rep=calcReputation(ME);
  try { await db.ref('users/'+ME.uid+'/reputation').set(rep); ME.reputation=rep; } catch(e){}
}

// ═══════════════════════════════════════════════════
// USER PROFILE MODAL
// ═══════════════════════════════════════════════════
async function viewUser(uid){
  if (!uid || uid==='undefined') return;
  el('userMO')?.classList.remove('hidden');
  const postList=el('umoPostList');
  if(postList) postList.innerHTML='<div style="padding:14px;text-align:center;color:var(--muted);font-size:.82rem">Loading…</div>';

  try {
    const cached=CACHE.get('users', uid);
    const snap = cached ? null : await db.ref('users/'+uid).once('value');
    const u = cached || snap?.val();
    if (!u){ toast('User not found','err'); closeMO('userMO'); return; }
    if (!cached) CACHE.set('users', uid, u);

    const ini=initials(u.name||'?');
    setAv('umoAv',ini,'#1B4332',u.avatar);
    setText('umoName',u.name||'Unknown');
    const rep=calcReputation(u);
    setHTML('umoBadges', getBadgeHTML(u.badges||[],ADMIN_UIDS.includes(uid)||u.isAdmin)+' '+getRepBadge(rep));
    setHTML('umoBrgy','<i class="fas fa-map-marker-alt" style="font-size:.7rem;margin-right:3px"></i>'+(u.brgy||'—'));
    setText('umoRole', ROLES[u.role]||u.role||'Resident');
    setText('umoPosts',  u.postCount||0);
    setText('umoHelped', u.helpedCount||0);
    setText('umoJoined', fmtDate(u.joined));
    const umoRep=el('umoRep');
    if(umoRep) umoRep.innerHTML=`<div class="rep-score-bar"><div class="rep-score-fill" style="width:${getRepPct(rep)}%"></div></div><div style="font-size:.72rem;color:var(--muted);margin-top:3px;text-align:center">Reputation: ${rep} pts</div>`;

    // Skills & availability
    const umoSkillsWrap = el('umoSkillsWrap');
    if (umoSkillsWrap){
      const skills = u.skills||[];
      const avStatus = AVAILABILITY_STATUS[u.availability||'offline'];
      umoSkillsWrap.innerHTML = `
        ${u.isVolunteer ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span class="avail-dot" style="background:${avStatus.dot};width:9px;height:9px;flex-shrink:0"></span>
          <span style="font-size:.78rem;color:${avStatus.color};font-weight:600">${avStatus.label}</span>
          <span class="vol-badge" style="margin-left:4px"><i class="fas fa-hands-helping" style="margin-right:4px"></i>Volunteer</span>
        </div>` : ''}
        ${skills.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px">${
          skills.map(sid => {
            const s = VOLUNTEER_SKILLS.find(x=>x.id===sid);
            return s ? `<span class="skill-chip" style="--sc:${s.color}"><i class="fas ${s.icon}"></i> ${s.label}</span>` : '';
          }).filter(Boolean).join('')
        }</div>` : ''}`;
    }

    const pSnap=await db.ref('posts').orderByChild('authorUID').equalTo(uid).limitToLast(5).once('value');
    if(!postList) return;
    postList.innerHTML='';
    let posts=[]; pSnap.forEach(c=>posts.push({key:c.key,...c.val()})); posts.sort((a,b)=>b.t-a.t);
    if(posts.length===0){ postList.innerHTML='<div style="color:var(--muted);font-size:.82rem;padding:8px 0">No posts yet.</div>'; return; }
    const frag=document.createDocumentFragment();
    posts.forEach(p=>{
      const tc=TAGS[p.tag]||TAGS['General'];
      const div=document.createElement('div');
      div.style.cssText='padding:9px 0;border-bottom:1px solid var(--border);font-size:.82rem';
      div.innerHTML=`<span class="ptchip ${tc.c}" style="font-size:.64rem">${esc(p.tag)}</span> ${esc((p.body||'').substring(0,60)+((p.body||'').length>60?'…':''))}<br/><span style="color:var(--soft);font-size:.7rem">${ago(p.t)}</span>`;
      frag.appendChild(div);
    });
    postList.appendChild(frag);
  } catch(e){
    if(postList) postList.innerHTML='<div style="color:var(--muted);font-size:.82rem">Failed to load.</div>';
  }
}

// ═══════════════════════════════════════════════════
// REPORT SYSTEM
// ═══════════════════════════════════════════════════
function openReportModal(postKey){
  reportTargetKey=postKey; reportReason=null;
  document.querySelectorAll('.rep-opt').forEach(b=>b.classList.remove('active'));
  const rn=el('repNote'); if(rn) rn.value='';
  const rb=el('repSubmitBtn'); if(rb) rb.disabled=true;
  el('reportMO')?.classList.remove('hidden');
}

function pickReport(btn, reason){
  document.querySelectorAll('.rep-opt').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); reportReason=reason;
  const rb=el('repSubmitBtn'); if(rb) rb.disabled=false;
}

async function submitReport2(){
  if (!reportTargetKey || !reportReason) return;
  const note=sanitize(el('repNote')?.value||'',300);
  try {
    await db.ref('reports').push({
      postKey:reportTargetKey, reason:reportReason, note,
      reportedBy:ME.uid, reporterName:sanitize(ME.name,60),
      t:Date.now(), status:'open'
    });
    closeMO('reportMO'); toast('Report submitted.','ok');
  } catch(e){ toast('Failed to submit report','err'); }
}

// ═══════════════════════════════════════════════════
// SOS
// ═══════════════════════════════════════════════════
async function broadcastSOS(){
  if (isSpam('sos')) return;
  const body=sanitize(el('sosT')?.value||'', 500);
  if (!body||body.length<5) return toast('Describe your emergency.','err');
  try {
    await db.ref('posts').push({
      body:'SOS ALERT: '+body, tag:'Help Needed', feed:'feed',
      location:sanitize(ME.brgy,80), t:Date.now(),
      authorUID:ME.uid, authorName:sanitize(ME.name,60),
      authorBrgy:sanitize(ME.brgy,80), authorRole:ME.role,
      authorAvatar:ME.avatar||'', authorBadges:ME.badges||[], authorIsAdmin:ME.isAdmin||false,
      likes:{}, helpedBy:{}, commentCount:0, isSOS:true,
      status:'pending', urgency:'high', imageUrl:'', volunteers:{}
    });
    const st=el('sosT'); if(st) st.value='';
    lastAction.sos=Date.now(); lastAction.post=Date.now();
    toast('SOS broadcast sent!','err');
    goTab('home');
  } catch(e){ toast('Failed to broadcast SOS: '+(e.message||'Network error'),'err'); }
}

// ═══════════════════════════════════════════════════
// REPORT ISSUE (issue-to-authorities)
// ═══════════════════════════════════════════════════
async function submitIssueReport(){
  if (isSpam('post')) return;
  const type=el('rType')?.value||'Issue';
  const loc =sanitizeStrict(el('rLoc')?.value||'', SPAM.MAX_LOC_LEN);
  const desc=sanitize(el('rDesc')?.value||'',1000);
  if (!loc||loc.length<3) return toast('Enter the location.','err');
  if (!desc||desc.length<5) return toast('Describe the issue.','err');
  const btn=el('rSubmitBtn'); setLoad(btn,true);
  try {
    await db.ref('posts').push({
      body:sanitize(type,100)+'\n'+desc, tag:'Info', feed:'report', location:loc,
      t:Date.now(), authorUID:ME.uid, authorName:sanitize(ME.name,60),
      authorBrgy:sanitize(ME.brgy,80), authorRole:ME.role,
      authorAvatar:ME.avatar||'', authorBadges:ME.badges||[], authorIsAdmin:ME.isAdmin||false,
      likes:{}, helpedBy:{}, commentCount:0, isSOS:false,
      status:'pending', urgency:'medium', imageUrl:'', volunteers:{}
    });
    const rd=el('rDesc'); if(rd) rd.value='';
    const rl=el('rLoc');  if(rl) rl.value='';
    lastAction.post=Date.now();
    toast('Issue reported!','ok');
  } catch(e){ toast('Failed to report: '+(e.message||'Network error'),'err'); }
  setLoad(btn,false);
}

// ═══════════════════════════════════════════════════
// MY POSTS
// ═══════════════════════════════════════════════════
async function loadMyPosts(){
  const list=el('myList'), empty=el('myEmpty');
  if(!list) return;
  list.innerHTML='<div style="padding:16px;color:var(--muted);text-align:center;font-size:.85rem">Loading…</div>';
  try {
    const snap=await db.ref('posts').orderByChild('authorUID').equalTo(ME.uid).once('value');
    list.innerHTML=''; let posts=[];
    snap.forEach(c=>posts.push({key:c.key,...c.val()})); posts.sort((a,b)=>b.t-a.t);
    if(empty) empty.classList.toggle('hidden',posts.length>0);
    if(posts.length===0) return;
    const frag=document.createDocumentFragment();
    posts.forEach(p=>{ const d=document.createElement('div'); d.innerHTML=buildCard(p); if(d.firstElementChild) frag.appendChild(d.firstElementChild); });
    list.appendChild(frag);
  } catch(e){
    list.innerHTML='<div class="error-state"><div class="es-icon">⚠️</div><h3>Failed to load</h3><button class="es-btn" onclick="loadMyPosts()"><i class="fas fa-redo"></i> Retry</button></div>';
  }
}

// ═══════════════════════════════════════════════════
// MAP VIEW
// ═══════════════════════════════════════════════════
const BRGY_COORDS = {
  'Batasan Hills':[14.7004,121.1031],'Commonwealth':[14.7074,121.0904],
  'Payatas':[14.7229,121.0972],'Bagong Silangan':[14.7134,121.0969],
  'Fairview':[14.7339,121.0397],'Novaliches':[14.7297,121.0292],
  'Cubao':[14.6197,121.0527],'Diliman':[14.6543,121.0593],
  'Quezon City':[14.676,121.044],'Batasan':[14.7004,121.1031],
  'Sauyo':[14.7150,121.0156],'Tandang Sora':[14.7042,121.0455],
};

async function initMapView(){
  if (typeof L==='undefined'){ toast('Map loading…'); setTimeout(initMapView,800); return; }
  if (!leafletMap){
    leafletMap=L.map('leafletMap').setView([14.676,121.044],12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© <a href="https://openstreetmap.org">OpenStreetMap</a>',maxZoom:19
    }).addTo(leafletMap);
  } else {
    leafletMap.invalidateSize();
    leafletMap.eachLayer(l=>{ if(l instanceof L.Marker) leafletMap.removeLayer(l); });
  }

  try {
    const snap=await db.ref('posts').limitToLast(100).once('value');
    const colorMap={'Help Needed':'#dc2626','Flood':'#2563eb','Medical':'#16a34a','Missing':'#9333ea'};
    const byLoc={};
    snap.forEach(c=>{ const p=c.val(); const loc=p.location||p.authorBrgy||''; if(!loc) return; if(!byLoc[loc]) byLoc[loc]=[]; byLoc[loc].push({key:c.key,...p}); });

    let count=0;
    Object.entries(byLoc).forEach(([loc,posts])=>{
      let coords=null;
      for(const[b,c] of Object.entries(BRGY_COORDS)){ if(loc.toLowerCase().includes(b.toLowerCase())){ coords=c; break; } }
      if(!coords) coords=[14.676+(Math.random()-.5)*.06,121.044+(Math.random()-.5)*.06];
      const p=posts[0]; const col=colorMap[p.tag]||'#6b7280';
      const icon=L.divIcon({
        html:`<div style="background:${col};width:32px;height:32px;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3)"><i class="fas fa-map-marker" style="font-size:12px;color:white"></i></div>`,
        iconSize:[32,32],iconAnchor:[16,16],className:''
      });
      L.marker(coords,{icon}).addTo(leafletMap)
        .bindPopup(`<strong>${esc(loc)}</strong><br/>${posts.length} post${posts.length>1?'s':''}<br/><small>${esc((p.body||'').substring(0,60))}…</small>`);
      count++;
    });

    const mapList=el('mapPostList'); if(!mapList) return;
    mapList.innerHTML='';
    const allP=[]; snap.forEach(c=>allP.push({key:c.key,...c.val()}));
    allP.sort((a,b)=>b.t-a.t).slice(0,8).forEach(p=>{ const d=document.createElement('div'); d.innerHTML=buildCard(p); if(d.firstElementChild) mapList.appendChild(d.firstElementChild); });
    if(count===0) mapList.innerHTML='<div class="empty-fancy"><div class="ef-icon-design"><i class="fas fa-map-marked-alt" style="font-size:1.8rem"></i></div><h3>No posts with locations yet</h3></div>';
  } catch(e){ toast('Failed to load map data','err'); }
}

// ═══════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════
let adminSection='posts';

async function loadAdminDashboard(){
  if (!ME||!ME.isAdmin){ toast('Admin access only','err'); goTab('home'); return; }
  try {
    const [postsSnap,usersSnap,reportsSnap,onlineSnap]=await Promise.all([
      db.ref('posts').once('value'), db.ref('users').once('value'),
      db.ref('reports').once('value'), db.ref('online').once('value')
    ]);
    setText('aTotalPosts', postsSnap.numChildren());
    setText('aTotalUsers', usersSnap.numChildren());
    setText('aReports',    reportsSnap.numChildren());
    const now=Date.now(); let online=0;
    onlineSnap.forEach(c=>{ if(now-c.val().t<120000) online++; });
    setText('aOnline', online);
    adminTab(adminSection, document.querySelector('.atab.active')||document.querySelector('.atab'));
  } catch(e){ toast('Failed to load admin data','err'); }
}

async function adminTab(section, btn){
  adminSection=section;
  document.querySelectorAll('.atab').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  const content=el('adminContent');
  if(!content) return;
  content.innerHTML='<div style="padding:16px;text-align:center;color:var(--muted)">Loading…</div>';

  try {
    if (section==='posts'){
      const snap=await db.ref('posts').limitToLast(50).once('value'); let posts=[];
      snap.forEach(c=>posts.push({key:c.key,...c.val()})); posts.sort((a,b)=>b.t-a.t);
      content.innerHTML=posts.length?posts.map(p=>`<div class="admin-row">
        <div class="admin-row-info"><strong>${esc((p.body||'').substring(0,60)+((p.body||'').length>60?'…':''))}</strong>
        <small>${esc(p.authorName||'?')} · ${esc(p.tag)} · ${ago(p.t)}</small></div>
        <button class="admin-del-btn" onclick="adminDeletePost('${esc(p.key)}')" type="button" aria-label="Delete post"><i class="fas fa-trash"></i></button>
      </div>`).join(''):'<div class="empty-fancy"><div class="ef-icon-design"><i class="fas fa-inbox" style="font-size:1.8rem"></i></div><h3>No posts</h3></div>';
    } else if (section==='users'){
      const snap=await db.ref('users').once('value'); let users=[];
      snap.forEach(c=>users.push({uid:c.key,...c.val()})); users.sort((a,b)=>(b.joined||0)-(a.joined||0));
      content.innerHTML=users.length?users.map(u=>`<div class="admin-row">
        <div class="admin-row-info">
          <strong>${esc(u.name||'?')} ${u.isAdmin?'<i class="fas fa-shield-alt"></i>':''} — Rep: ${calcReputation(u)}</strong>
          <small>${esc(u.email||'')} · ${esc(u.brgy||'')} · Posts:${u.postCount||0} · Helped:${u.helpedCount||0}</small>
          <div style="margin-top:4px">${getBadgeHTML(u.badges||[],ADMIN_UIDS.includes(u.uid)||u.isAdmin)}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <button class="admin-badge-btn" onclick="adminManageBadge('${esc(u.uid)}','${esc(u.name||'')}')" type="button" aria-label="Manage badges"><i class="fas fa-certificate"></i></button>
          <button class="admin-del-btn" onclick="adminDeleteUser('${esc(u.uid)}','${esc(u.name||'?')}')" type="button" aria-label="Remove user"><i class="fas fa-user-slash"></i></button>
        </div>
      </div>`).join(''):'<div class="empty-fancy"><div class="ef-icon-design"><i class="fas fa-users" style="font-size:1.8rem"></i></div><h3>No users</h3></div>';
    } else if (section==='reports'){
      const snap=await db.ref('reports').once('value'); let reports=[];
      snap.forEach(c=>reports.push({key:c.key,...c.val()})); reports.sort((a,b)=>b.t-a.t);
      content.innerHTML=reports.length?reports.map(r=>`<div class="admin-row">
        <div class="admin-row-info">
          <strong><i class="fas fa-flag" style="color:var(--red);margin-right:5px"></i>${esc(r.reason||'?')} — ${r.status==='open'?'<span style="color:var(--red)">Open</span>':'Closed'}</strong>
          <small>By ${esc(r.reporterName||'?')} · ${ago(r.t)}</small>
          ${r.note?`<small style="font-style:italic">"${esc(r.note)}"</small>`:''}
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <button class="admin-del-btn" onclick="adminDeletePost('${esc(r.postKey)}')" type="button" title="Delete post"><i class="fas fa-trash"></i></button>
          <button class="admin-badge-btn" onclick="adminCloseReport('${esc(r.key)}')" type="button" title="Close report"><i class="fas fa-check"></i></button>
        </div>
      </div>`).join(''):'<div class="empty-fancy"><div class="ef-icon">✅</div><h3>No reports</h3></div>';
    } else if (section==='alerts'){
      const snap=await db.ref('alerts').limitToLast(20).once('value');
      let alerts=[]; snap.forEach(c=>alerts.push({key:c.key,...c.val()})); alerts.sort((a,b)=>b.t-a.t);

      const dmSnap = await db.ref('disasterMode').once('value');
      const dm = dmSnap.val() || {};
      const dmActive = !!(dm && dm.active);

      content.innerHTML = `
        <div class="admin-feature-block">
          <div class="afb-head">
            <div class="afb-icon ${dmActive?'afb-red':'afb-green'}"><i class="fas fa-radiation-alt"></i></div>
            <div>
              <strong>Disaster Mode</strong>
              <p>${dmActive ? 'ACTIVE — Only urgent posts shown. Activated '+ago(dm.t||0)+' by '+(dm.activatedBy||'Admin') : 'Inactive — Feed showing all posts normally.'}</p>
            </div>
          </div>
          <div class="fg" style="margin:10px 0 8px">
            <input type="text" id="dmMsg" placeholder="Disaster message (optional)…" maxlength="200" class="admin-input" value="${dmActive?esc(dm.message||''):''}"/>
          </div>
          <button class="btn-${dmActive?'danger':'primary'} w100" id="dmToggleBtn" onclick="toggleDisasterMode()" type="button">
            <i class="fas fa-${dmActive?'toggle-off':'toggle-on'}"></i> ${dmActive?'Deactivate Disaster Mode':'Activate Disaster Mode'}
          </button>
        </div>
        <div class="admin-feature-block" style="margin-top:14px">
          <div class="afb-head">
            <div class="afb-icon afb-amber"><i class="fas fa-bullhorn"></i></div>
            <div><strong>Broadcast Alert</strong><p>Send an urgent message to all online users</p></div>
          </div>
          <select id="alertType" class="admin-input" style="margin:10px 0 8px">
            <option value="general">General Alert</option>
            <option value="flood">Flood Warning</option>
            <option value="medical">Medical Emergency</option>
            <option value="disaster">Disaster Alert</option>
            <option value="info">Info / Update</option>
          </select>
          <input type="text" id="alertTitle" placeholder="Alert title…" maxlength="100" class="admin-input" style="margin-bottom:8px"/>
          <textarea id="alertBody" placeholder="Alert message…" maxlength="300" class="admin-input" style="height:72px;resize:none;padding:9px 12px;font-family:inherit"></textarea>
          <button class="btn-primary w100" onclick="broadcastAlert()" type="button" style="margin-top:10px">
            <i class="fas fa-satellite-dish"></i> Broadcast Alert
          </button>
        </div>
        <div style="margin-top:16px">
          <div class="set-lbl" style="margin-bottom:10px"><i class="fas fa-history" style="margin-right:5px"></i>Recent Alerts</div>
          ${alerts.length ? alerts.map(a=>`<div class="admin-row">
            <div class="admin-row-info">
              <strong><span class="alert-type-badge alert-type-${a.type||'general'}">${a.type||'general'}</span> ${esc(a.title||'')}</strong>
              <small>${esc(a.body||'').substring(0,80)} · ${ago(a.t)} · by ${esc(a.sentBy||'?')}</small>
            </div>
          </div>`).join('') : '<div style="color:var(--soft);font-size:.83rem;padding:8px 0">No alerts sent yet.</div>'}
        </div>`;
    } else if (section==='orgs'){
      const [appSnap, partSnap] = await Promise.all([
        db.ref('orgApplications').once('value'),
        db.ref('partnerApplications').once('value'),
      ]);
      const apps=[]; appSnap.forEach(c=>{ const v=c.val(); if(v&&v.status==='pending') apps.push({key:c.key,...v}); });
      const parts=[]; partSnap.forEach(c=>{ const v=c.val(); if(v&&!v.verified) parts.push({key:c.key,...v}); });
      content.innerHTML = `
        <div style="margin-bottom:14px">
          <div class="set-lbl" style="margin-bottom:10px"><i class="fas fa-building" style="margin-right:5px"></i>Org Applications (${apps.length} pending)</div>
          ${apps.length?apps.map(a=>{
            const ot=ORG_TYPES[a.orgType]||ORG_TYPES['ngo'];
            return '<div class="admin-row"><div class="admin-row-info"><strong>'+esc(a.orgName||'?')+'</strong><small>'+esc(a.name||'?')+' · '+esc(a.email||'')+' · '+ago(a.t)+'</small><p style="font-size:.77rem;color:var(--muted);margin:4px 0">'+esc((a.orgDesc||'').substring(0,100))+'</p></div><div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0"><button class="admin-badge-btn" onclick="verifyOrg(\''+esc(a.uid)+'\',\''+esc(a.orgName)+'\',\''+esc(a.orgType)+'\')" type="button" title="Approve"><i class="fas fa-check"></i></button><button class="admin-del-btn" onclick="rejectOrgApp(\''+esc(a.key)+'\')" type="button" title="Reject"><i class="fas fa-times"></i></button></div></div>';
          }).join('') : '<p style="color:var(--soft);font-size:.82rem">No pending applications.</p>'}
        </div>
        <div>
          <div class="set-lbl" style="margin-bottom:10px"><i class="fas fa-handshake" style="margin-right:5px"></i>Partnership Requests (${parts.length} pending)</div>
          ${parts.length?parts.map(p=>{
            return '<div class="admin-row"><div class="admin-row-info"><strong>'+esc(p.orgName||'?')+'</strong><small>'+esc(p.submitterName||'?')+' · '+ago(p.t)+'</small><p style="font-size:.77rem;color:var(--muted);margin:4px 0">'+esc((p.desc||'').substring(0,100))+'</p></div><div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0"><button class="admin-badge-btn" onclick="approvePartner(\''+esc(p.key)+'\')" type="button" title="Approve"><i class="fas fa-check"></i></button><button class="admin-del-btn" onclick="rejectPartner(\''+esc(p.key)+'\')" type="button" title="Reject"><i class="fas fa-times"></i></button></div></div>';
          }).join('') : '<p style="color:var(--soft);font-size:.82rem">No pending partnership requests.</p>'}
        </div>`;
    }
  } catch(e){ content.innerHTML='<div class="error-state"><div class="es-icon">⚠️</div><h3>Failed to load</h3><button class="es-btn" onclick="adminTab(\''+section+'\'\)"><i class="fas fa-redo"></i> Retry</button></div>'; }
}

async function approvePartner(key){
  if (!ME || !ME.isAdmin) return;
  try {
    await db.ref('partnerApplications/'+key).transaction(p => {
      if (p){ p.verified=true; p.verifiedAt=Date.now(); }
      return p;
    });
    const snap = await db.ref('partnerApplications/'+key).once('value');
    const p = snap.val();
    if (p) await db.ref('partners').push({...p, verified:true, verifiedAt:Date.now()});
    toast('Partner approved!','ok'); adminTab('orgs');
  } catch(e){ toast('Failed','err'); }
}
async function rejectPartner(key){
  if (!ME || !ME.isAdmin || !confirm('Reject partnership?')) return;
  try { await db.ref('partnerApplications/'+key+'/verified').set('rejected'); toast('Rejected','ok'); adminTab('orgs'); }
  catch(e){ toast('Failed','err'); }
}

async function adminDeletePost(key){
  if (!key||!confirm('Delete this post?')) return;
  try { await db.ref('posts/'+key).remove(); await db.ref('comments/'+key).remove(); CACHE.invalidate('posts',key); toast('Post deleted','ok'); adminTab(adminSection); }
  catch(e){ toast('Failed to delete','err'); }
}
async function adminDeleteUser(uid,name){
  if (!confirm(`Remove user ${name}? This cannot be undone.`)) return;
  try { await db.ref('users/'+uid).remove(); CACHE.invalidate('users',uid); toast('User removed','ok'); adminTab('users'); }
  catch(e){ toast('Failed to remove user','err'); }
}
async function adminCloseReport(key){
  try { await db.ref('reports/'+key+'/status').set('closed'); toast('Report closed','ok'); adminTab('reports'); }
  catch(e){ toast('Failed','err'); }
}
async function adminManageBadge(uid,name){
  const badge=prompt(`Badge for ${name}:\nOptions: verified, volunteer, official, responder, moderator\n\nType badge to add, or leave blank to remove all:`);
  if (badge===null) return;
  try {
    const snap=await db.ref('users/'+uid+'/badges').once('value');
    let badges=snap.val()||[];
    if (!badge.trim()){ await db.ref('users/'+uid+'/badges').set([]); CACHE.invalidate('users',uid); toast('All badges removed','ok'); }
    else if (['verified','volunteer','official','responder','moderator'].includes(badge.trim())){
      if (badges.includes(badge.trim())){ toast('Badge already assigned','warn'); return; }
      badges.push(badge.trim()); await db.ref('users/'+uid+'/badges').set(badges); CACHE.invalidate('users',uid); toast(`Badge "${badge}" added!`,'ok');
    } else { toast('Invalid badge name','err'); return; }
    adminTab('users');
  } catch(e){ toast('Failed to update badge','err'); }
}

// ═══════════════════════════════════════════════════
// ACTIVITY FEED
// ═══════════════════════════════════════════════════
const activityItems=[];
function addActivityItem(type,title,desc,t){
  activityItems.unshift({type,title,desc,t});
  if(activityItems.length>50) activityItems.pop();
  renderActivity();
  if(activeTab!=='activity'){ unread++; updateBadge(); }
}
function renderActivity(){
  const list=el('actList'); if(!list) return;
  if(activityItems.length===0){
    list.innerHTML='<div class="empty-fancy"><div class="ef-icon-design"><i class="fas fa-bell" style="font-size:1.8rem"></i></div><h3>No activity yet</h3><p>Activity will appear here when things happen.</p></div>'; return;
  }
  const icons={help:'<i class="fas fa-hand-holding-heart" style="color:var(--green)"></i>',resolve:'<i class="fas fa-check-circle" style="color:var(--green)"></i>',post:'<i class="fas fa-bullhorn" style="color:var(--green)"></i>',comment:'<i class="fas fa-comment" style="color:var(--blue)"></i>'};
  list.innerHTML=activityItems.map(a=>`
    <div class="act-item${a.type==='help'?' act-help':a.type==='resolve'?' act-resolve':''}">
      <div class="act-icon">${icons[a.type]||'<i class="fas fa-bell"></i>'}</div>
      <div class="act-body"><strong>${esc(a.title)}</strong><p>${esc(a.desc)}</p><small>${ago(a.t)}</small></div>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════
let searchTimer=null;
function onSearch(){
  const q=(el('searchBox')?.value||'').trim();
  el('sClear')?.classList.toggle('hidden',!q);
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>{ if(activeTab==='home') attachFeedListener(); }, 350);
}
function clearSearch(){
  const sb=el('searchBox'); if(sb) sb.value='';
  el('sClear')?.classList.add('hidden');
  if(activeTab==='home') attachFeedListener();
}

// ═══════════════════════════════════════════════════
// WEATHER
// ═══════════════════════════════════════════════════
async function loadWeather(){
  setText('wTemp','--°'); setText('wDesc','Detecting location…'); setText('wCity','Getting your location…');
  if (!navigator.geolocation){ await fetchWeather(14.676,121.044,'Quezon City'); return; }
  navigator.geolocation.getCurrentPosition(
    async pos=>{
      const name=await reverseGeocode(pos.coords.latitude,pos.coords.longitude);
      await fetchWeather(pos.coords.latitude,pos.coords.longitude,name);
    },
    async ()=>await fetchWeather(14.676,121.044,'Quezon City (default)'),
    {timeout:8000,maximumAge:300000}
  );
}

async function reverseGeocode(lat,lon){
  try {
    const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,{headers:{'Accept-Language':'en'}});
    const d=await r.json(); const a=d.address||{};
    return [a.city||a.town||a.village||a.municipality,a.state,a.country_code?.toUpperCase()].filter(Boolean).join(', ')||'Your Location';
  } catch(e){ return `${lat.toFixed(2)}, ${lon.toFixed(2)}`; }
}

async function fetchWeather(lat,lon,cityName){
  try {
    const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Manila';
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,visibility,weather_code&timezone=${encodeURIComponent(tz)}`);
    if(!r.ok) throw new Error('Weather API error');
    const d=await r.json(); const c=d.current;
    setText('wCity',  cityName);
    setText('wTemp',  Math.round(c.temperature_2m)+'°');
    setText('wDesc',  wdesc(c.weather_code));
    setHTML('wIcon',  wicon(c.weather_code));
    setText('wHum',   c.relative_humidity_2m+'%');
    setText('wWind',  Math.round(c.wind_speed_10m)+'');
    setText('wVis',   c.visibility?(c.visibility/1000).toFixed(1):'--');
    const adv=el('advTxt');
    if(adv){
      if(c.weather_code>=95)      adv.textContent='Thunderstorm! Stay indoors. Avoid flooded roads.';
      else if(c.weather_code>=80) adv.textContent='Rain showers. Watch for flooding in low-lying areas.';
      else if(c.weather_code>=60) adv.textContent='Light rain. Drive carefully. Bring an umbrella.';
      else if(c.weather_code<=3)  adv.textContent='Clear weather. No active weather warnings.';
      else                        adv.textContent='Cloudy conditions. Check PAGASA for updates.';
    }
  } catch(e){
    setText('wDesc','Unable to load weather. Tap refresh.');
    setText('wCity', cityName);
  }
}

function wdesc(c){ if(c===0)return'Clear Sky';if(c<=3)return'Partly Cloudy';if(c<=49)return'Foggy';if(c<=67)return'Rainy';if(c<=82)return'Rain Showers';return'Thunderstorm'; }
function wicon(c){ if(c===0)return'<i class="fas fa-sun"></i>';if(c<=3)return'<i class="fas fa-cloud-sun"></i>';if(c<=49)return'<i class="fas fa-smog"></i>';if(c<=67)return'<i class="fas fa-cloud-rain"></i>';if(c<=82)return'<i class="fas fa-cloud-showers-heavy"></i>';return'<i class="fas fa-bolt"></i>'; }

// ═══════════════════════════════════════════════════
// BULLETINS
// ═══════════════════════════════════════════════════
function renderBulletins(){
  const items=[
    {t:'Free Vaccine Drive',b:'QC Health Dept offers free COVID & flu vaccines at all Barangay Health Centers. Bring your QC ID.',d:'March 10, 2026',u:false},
    {t:'Flood Preparedness Advisory',b:'PAGASA issued a Rainfall Advisory for NCR. Batasan Hills, Commonwealth, and Payatas residents stay alert.',d:'March 9, 2026',u:true},
    {t:'Water Interruption – Fairview & Novaliches',b:'MWSS maintenance on March 11. Water supply interrupted 6AM–6PM.',d:'March 8, 2026',u:false},
    {t:'Iskolar ng QC – Applications Open',b:'Scholarship applications open at Barangay Halls. Limited slots available.',d:'March 7, 2026',u:false},
    {t:'Libreng Sakay New Routes',b:'New routes added in Novaliches and Commonwealth. Check your Barangay Hall for schedules.',d:'March 6, 2026',u:false},
  ];
  const bl=el('bulletinList'); if(!bl) return;
  bl.innerHTML=items.map(i=>`
    <div class="bcard${i.u?' urgent':''}">
      <h4>${esc(i.t)}</h4>
      <p>${esc(i.b)}</p>
      <div class="bdate"><i class="fas fa-calendar-alt" style="margin-right:4px"></i>${esc(i.d)}</div>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════
// FOOTER LINKS — Privacy & Terms
// ═══════════════════════════════════════════════════
function openPrivacy(){
  openLegal('Privacy Policy','<h4>Information We Collect</h4><p>We collect your name, email address, barangay, and content you post (text, images, location). We also collect usage data to improve the platform.</p><h4>How We Use Your Information</h4><p>Your information is used to provide the QC Help Support service, display your posts, and send notifications. We do not sell your data.</p><h4>Data Storage</h4><p>Your data is stored securely using Firebase (Google) infrastructure. Images are stored in Firebase Storage.</p><h4>Your Rights</h4><p>You may delete your account and all associated data at any time from Settings. Deleting your account removes your profile and posts from our system.</p><h4>Contact</h4><p>For privacy concerns, use the Report Issue feature or contact your local Barangay Hall.</p><p style="margin-top:8px"><em>Last updated: March 2026</em></p>');
}

function openTerms(){
  openLegal('Terms of Service','<h4>Acceptance</h4><p>By using QC Help Support, you agree to these terms. If you disagree, please do not use the platform.</p><h4>User Responsibilities</h4><ul><li>Post only truthful and accurate information</li><li>Do not impersonate others or government officials</li><li>Do not post spam, harassment, or illegal content</li><li>Respect other community members</li></ul><h4>Content</h4><p>You retain ownership of content you post. By posting, you grant QC Help Support a license to display your content on the platform.</p><h4>Prohibited Uses</h4><p>False emergency reports, spam, hate speech, and impersonation are strictly prohibited and may result in account suspension.</p><h4>Disclaimer</h4><p>QC Help Support is a community platform. For life-threatening emergencies, always call 911 first. We are not responsible for the accuracy of user-posted content.</p><p style="margin-top:8px"><em>Last updated: March 2026</em></p>');
}

function openLegal(title, content){
  let sheet=document.getElementById('legalSheet');
  if(!sheet){
    sheet=document.createElement('div');
    sheet.id='legalSheet';
    sheet.className='legal-sheet';
    sheet.innerHTML=`<div class="legal-body"><div class="legal-head"><h3 id="legalTitle"></h3><button class="mclose" onclick="closeLegal()" type="button"><i class="fas fa-times"></i></button></div><div id="legalContent"></div></div>`;
    document.body.appendChild(sheet);
  }
  document.getElementById('legalTitle').textContent=title;
  document.getElementById('legalContent').innerHTML=content;
  sheet.classList.remove('hidden');
}

function closeLegal(){
  document.getElementById('legalSheet')?.classList.add('hidden');
}

// ═══════════════════════════════════════════════════
// FEATURE A1 — DISASTER MODE
// ═══════════════════════════════════════════════════
function listenDisasterMode(){
  if (disasterModeListener) db.ref('disasterMode').off('value', disasterModeListener);
  disasterModeListener = db.ref('disasterMode').on('value', snap => {
    const data = snap.val();
    const active = !!(data && data.active);
    disasterModeActive = active;
    applyDisasterMode(data);
  });
}

function applyDisasterMode(data){
  const banner = el('dmBanner');
  const body   = document.body;
  if (!banner) return;
  if (disasterModeActive){
    const msg = (data && data.message) ? data.message : 'DISASTER MODE ACTIVE — Only urgent requests are shown.';
    const since = (data && data.t) ? ' Activated '+ago(data.t)+'.' : '';
    el('dmBannerTxt').textContent = msg + since;
    banner.classList.remove('hidden');
    body.classList.add('disaster-mode');
    // If on home tab, reload feed to show only urgent posts
    if (activeTab === 'home') attachFeedListener();
  } else {
    banner.classList.add('hidden');
    body.classList.remove('disaster-mode');
    if (activeTab === 'home') attachFeedListener();
  }
}

async function toggleDisasterMode(){
  if (!ME || !ME.isAdmin) return;
  const btn = el('dmToggleBtn');
  if (btn) btn.disabled = true;
  try {
    const snap = await db.ref('disasterMode').once('value');
    const current = snap.val();
    if (current && current.active){
      await db.ref('disasterMode').set({ active: false, t: Date.now() });
      toast('Disaster Mode deactivated.', 'ok');
    } else {
      const msg = el('dmMsg')?.value?.trim() || 'DISASTER MODE ACTIVE — Only urgent requests are shown. Stay safe.';
      await db.ref('disasterMode').set({ active: true, message: sanitize(msg, 200), t: Date.now(), activatedBy: sanitize(ME.name, 60) });
      // Also broadcast an alert
      await broadcastAlertDirect('DISASTER MODE', msg, 'disaster');
      toast('Disaster Mode activated. Community notified.', 'ok');
    }
    loadAdminDashboard();
  } catch(e){ toast('Failed: ' + (e.message||'Error'), 'err'); }
  if (btn) btn.disabled = false;
}

// ═══════════════════════════════════════════════════
// FEATURE A2 — COMMUNITY ALERT SYSTEM
// ═══════════════════════════════════════════════════
function listenAlerts(){
  if (alertListener) db.ref('alerts').off('value', alertListener);
  alertListener = db.ref('alerts').orderByChild('t').limitToLast(1).on('child_added', snap => {
    const alert = snap.val();
    if (!alert || !alert.active) return;
    // Only show alerts from the last 24 hours
    if (Date.now() - alert.t > 86400000) return;
    currentAlertKey = snap.key;
    showAlertBanner(alert);
  });
}

function showAlertBanner(alert){
  const banner = el('alertBanner');
  if (!banner) return;
  const typeIcons = { disaster:'fa-radiation-alt', flood:'fa-water', medical:'fa-heartbeat', general:'fa-bullhorn', info:'fa-info-circle' };
  const icon = typeIcons[alert.type||'general'] || 'fa-bullhorn';
  el('alertBannerIcon').innerHTML = `<i class="fas ${icon}"></i>`;
  el('alertBannerTitle').textContent = alert.title || 'Community Alert';
  el('alertBannerBody').textContent  = alert.body  || '';
  el('alertBannerTime').textContent  = ago(alert.t);
  banner.className = 'alert-banner alert-type-'+(alert.type||'general');
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('alert-banner-show'), 50);
}

function dismissAlertBanner(){
  const banner = el('alertBanner');
  if (!banner) return;
  banner.classList.remove('alert-banner-show');
  setTimeout(() => banner.classList.add('hidden'), 380);
}

async function broadcastAlert(){
  if (!ME || !ME.isAdmin) return;
  const title = sanitize(el('alertTitle')?.value||'', 100);
  const body  = sanitize(el('alertBody')?.value||'', 300);
  const type  = el('alertType')?.value || 'general';
  if (!title || title.length < 3) return toast('Enter an alert title.', 'err');
  if (!body  || body.length  < 5) return toast('Enter an alert message.', 'err');
  await broadcastAlertDirect(title, body, type);
  el('alertTitle').value = '';
  el('alertBody').value  = '';
  toast('Alert broadcast to community!', 'ok');
}

async function broadcastAlertDirect(title, body, type){
  const alertData = { title: sanitize(title,100), body: sanitize(body,300), type, t: Date.now(), active: true, sentBy: sanitize(ME.name,60) };
  await db.ref('alerts').push(alertData);
  // Push notification to all online users (best-effort, limited to online collection)
  try {
    const onlineSnap = await db.ref('online').once('value');
    const pushPs = [];
    onlineSnap.forEach(c => {
      const uid = c.key;
      if (uid !== ME.uid) {
        pushPs.push(pushNotification(uid, 'alert', title, body, null));
      }
    });
    await Promise.allSettled(pushPs);
  } catch(e){}
}

// ═══════════════════════════════════════════════════
// FEATURE A3 — HELP REQUEST ESCALATION
// ═══════════════════════════════════════════════════
function startEscalationWatcher(){
  // Check every 15 minutes for unresolved high-urgency posts older than ESCALATION_MS
  if (escalationTimer) clearInterval(escalationTimer);
  runEscalationCheck();
  escalationTimer = setInterval(runEscalationCheck, 15 * 60 * 1000);
}

async function runEscalationCheck(){
  if (!ME || !ME.isAdmin) return; // Only admins trigger escalation notifications
  try {
    const cutoff = Date.now() - ESCALATION_MS;
    const snap = await db.ref('posts')
      .orderByChild('t')
      .once('value');
    const toEscalate = [];
    snap.forEach(c => {
      const p = c.val();
      if (!p) return;
      // Only check posts in the main feed (or legacy posts with no feed field)
      if ((p.feed || 'feed') !== 'feed') return;
      if (p.status === 'resolved' || p.status === 'inprogress') return;
      if (p.t > cutoff) return; // not old enough
      if (p.urgency !== 'high' && !p.isSOS) return; // only high urgency
      if (p.escalated) return; // already escalated
      toEscalate.push({ key: c.key, ...p });
    });

    for (const p of toEscalate){
      // Mark escalated
      await db.ref('posts/' + p.key + '/escalated').set(true);
      await db.ref('posts/' + p.key + '/escalatedAt').set(Date.now());
      // Notify the post author
      await pushNotification(p.authorUID, 'escalation',
        'Your help request needs attention!',
        'Your request has been unresolved for over 2 hours. Moderators have been notified.',
        p.key
      );
      // Notify admins
      for (const adminUID of ADMIN_UIDS){
        if (adminUID === 'PASTE_YOUR_UID_HERE') continue;
        await pushNotification(adminUID, 'escalation',
          'Unresolved request: ' + (p.body||'').substring(0,50),
          'High-urgency post by ' + (p.authorName||'?') + ' in ' + (p.location||p.authorBrgy||'unknown') + ' has been pending for 2+ hours.',
          p.key
        ).catch(()=>{});
      }
      addActivityItem('escalation', 'Escalated: ' + (p.body||'').substring(0,50), 'Unresolved for 2+ hours', Date.now());
    }
  } catch(e){}
}

// ═══════════════════════════════════════════════════
// FEATURE A4 — ANONYMOUS HELP REQUESTS
// ═══════════════════════════════════════════════════
function toggleAnon(checkbox){
  postAnon = checkbox.checked;
  const hint = el('anonHint');
  if (hint) hint.classList.toggle('hidden', !postAnon);
}

// ═══════════════════════════════════════════════════
// FEATURE A5 — HELP TIMELINE TRACKER
// ═══════════════════════════════════════════════════
function getTimelineSteps(post){
  const steps = [
    { key: 'posted',    label: 'Posted',             done: true,                                          t: post.t },
    { key: 'volunteers',label: 'Volunteers Joined',  done: Object.keys(post.volunteers||{}).length > 0,  t: post.firstVolunteerT || null },
    { key: 'inprogress',label: 'Assistance Delivered', done: post.status === 'inprogress' || post.status === 'resolved', t: post.inprogressAt || null },
    { key: 'resolved',  label: 'Resolved',           done: post.status === 'resolved',                   t: post.resolvedAt || null },
  ];
  return steps;
}

function buildTimelineMini(post){
  const steps = getTimelineSteps(post);
  const dots = steps.map((s,i) => {
    const cls = s.done ? 'tl-dot tl-done' : 'tl-dot';
    const tip = s.done && s.t ? ago(s.t) : s.label;
    return `<div class="tl-step">
      <div class="${cls}" title="${esc(tip)}"></div>
      ${i < steps.length-1 ? `<div class="tl-line${s.done?' tl-line-done':''}"></div>` : ''}
    </div>`;
  }).join('');
  const currentStep = steps.filter(s=>s.done).length;
  return `<div class="timeline-mini" title="Step ${currentStep} of ${steps.length}">
    <div class="tl-track">${dots}</div>
    <span class="tl-label">${steps[currentStep-1]?.label||'Posted'}</span>
  </div>`;
}

function buildTimelineFull(post){
  const steps = getTimelineSteps(post);
  return `<div class="timeline-full">
    <div class="tf-title"><i class="fas fa-project-diagram"></i> Help Timeline</div>
    ${steps.map((s, i) => `
      <div class="tf-step ${s.done?'tf-done':'tf-pending'}">
        <div class="tf-dot-col">
          <div class="tf-dot">${s.done ? '<i class="fas fa-check"></i>' : (i+1)}</div>
          ${i < steps.length-1 ? '<div class="tf-vline"></div>' : ''}
        </div>
        <div class="tf-info">
          <strong>${esc(s.label)}</strong>
          <span>${s.done ? (s.t ? ago(s.t) : 'Completed') : 'Pending'}</span>
        </div>
      </div>`).join('')}
  </div>`;
}

async function openTimeline(postKey){
  try {
    const snap = await db.ref('posts/'+postKey).once('value');
    const p = snap.val();
    if (!p) return toast('Post not found','err');
    const mo = el('timelineMO');
    const content = el('timelineContent');
    if (!mo || !content) return;
    content.innerHTML = buildTimelineFull({key:postKey,...p});
    mo.classList.remove('hidden');
  } catch(e){ toast('Failed to load timeline','err'); }
}

// ═══════════════════════════════════════════════════
// GROUP B1 — VOLUNTEER SKILL TAGGING
// ═══════════════════════════════════════════════════
function renderVolSkillsPicker(selectedSkills, isVolunteer){
  const wrap = el('volSkillsWrap'); if (!wrap) return;
  const arr = Array.isArray(selectedSkills) ? selectedSkills : [];
  wrap.innerHTML = VOLUNTEER_SKILLS.map(s => {
    const active = arr.includes(s.id);
    return `<button type="button" class="skill-pick-btn${active?' active':''}" data-skill="${s.id}"
      onclick="toggleSkill(this,'${s.id}')" style="--sc:${s.color}" aria-pressed="${active}">
      <i class="fas ${s.icon}"></i><span>${s.label}</span>
    </button>`;
  }).join('');
  const volToggle = el('volToggle');
  if (volToggle) volToggle.checked = isVolunteer;
}

function toggleSkill(btn, skillId){
  btn.classList.toggle('active');
  btn.setAttribute('aria-pressed', btn.classList.contains('active'));
}

async function saveVolunteerProfile(){
  const isVolunteer = el('volToggle')?.checked || false;
  const selectedBtns = el('volSkillsWrap')?.querySelectorAll('.skill-pick-btn.active') || [];
  const skills = Array.from(selectedBtns).map(b => b.dataset.skill).filter(Boolean);
  const availability = el('setVolStatus')?.value || 'offline';

  const btn = el('saveVolBtn'); setLoad(btn, true);
  try {
    await db.ref('users/'+ME.uid).update({ skills, isVolunteer, availability });
    CACHE.invalidate('users', ME.uid);
    ME.skills = skills; ME.isVolunteer = isVolunteer; ME.availability = availability;
    refreshUI();
    toast('Volunteer profile saved!', 'ok');
    addActivityItem('post', 'Profile updated', 'Volunteer skills updated', Date.now());
  } catch(e){ toast('Failed to save: '+(e.message||'Error'), 'err'); }
  setLoad(btn, false);
}

// ═══════════════════════════════════════════════════
// GROUP B2 — SMART VOLUNTEER MATCHING
// ═══════════════════════════════════════════════════
async function openMatchVolunteers(postKey, postTag){
  el('matchMO')?.classList.remove('hidden');
  const matchList = el('matchList');
  if (matchList) matchList.innerHTML = '<div class="match-loading"><i class="fas fa-spinner fa-spin"></i> Finding volunteers…</div>';

  try {
    const snap = await db.ref('users').once('value');
    const users = [];
    snap.forEach(c => {
      const u = c.val();
      if (!u || !u.isVolunteer) return;
      if (u.availability === 'offline') return;
      users.push({ uid: c.key, ...u });
    });

    // Score each volunteer
    const relevantSkills = Object.entries(SKILL_TAG_MAP)
      .filter(([,tags]) => tags.includes(postTag))
      .map(([skill]) => skill);

    const scored = users.map(u => {
      const skills = u.skills || [];
      const matchCount = skills.filter(s => relevantSkills.includes(s)).length;
      return { ...u, matchCount };
    }).sort((a,b) => {
      // Sort: available first, then by match count, then by reputation
      const avOrder = { available:0, busy:1, offline:2 };
      const avDiff = (avOrder[a.availability]||2) - (avOrder[b.availability]||2);
      if (avDiff !== 0) return avDiff;
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      return calcReputation(b) - calcReputation(a);
    });

    if (!matchList) return;
    if (scored.length === 0){
      matchList.innerHTML = '<div class="match-empty"><i class="fas fa-users-slash"></i><p>No available volunteers found right now.</p><small>Check back later or broadcast an SOS.</small></div>';
      return;
    }

    matchList.innerHTML = scored.map(u => {
      const avStatus = AVAILABILITY_STATUS[u.availability||'offline'];
      const ini = initials(u.name||'?');
      const skillChips = (u.skills||[]).map(sid => {
        const s = VOLUNTEER_SKILLS.find(x=>x.id===sid);
        return s ? `<span class="skill-chip-tiny" style="--sc:${s.color}"><i class="fas ${s.icon}"></i> ${s.label}</span>` : '';
      }).filter(Boolean).join('');
      const matchBadge = u.matchCount > 0
        ? `<span class="match-score-badge">${u.matchCount} skill${u.matchCount>1?'s':''} match</span>`
        : '';

      return `<div class="match-card" onclick="viewUser('${esc(u.uid)}')">
        <div class="match-av-wrap">
          <div class="match-av" style="background:${u.avatar?'#eee':'#1B4332'}">
            ${u.avatar ? `<img src="${esc(u.avatar)}" alt="${esc(ini)}" loading="lazy"/>` : ini}
          </div>
          <span class="avail-dot" style="background:${avStatus.dot}" title="${avStatus.label}"></span>
        </div>
        <div class="match-info">
          <div class="match-name-row">
            <strong>${esc(u.name||'?')}</strong>
            ${matchBadge}
          </div>
          <span class="match-avail" style="color:${avStatus.color}"><i class="fas fa-circle" style="font-size:.45rem;margin-right:3px"></i>${avStatus.label}</span>
          <div class="match-brgy"><i class="fas fa-map-marker-alt" style="font-size:.6rem;margin-right:3px"></i>${esc(u.brgy||'—')}</div>
          <div class="match-skills">${skillChips||'<span style="color:var(--soft);font-size:.72rem">No skills listed</span>'}</div>
        </div>
      </div>`;
    }).join('');

  } catch(e){
    if(matchList) matchList.innerHTML = '<div class="match-empty"><i class="fas fa-exclamation-triangle"></i><p>Failed to load volunteers.</p></div>';
  }
}

// ═══════════════════════════════════════════════════
// GROUP B3 — VOLUNTEER AVAILABILITY STATUS
// ═══════════════════════════════════════════════════
async function setAvailability(status){
  if (!ME || !AVAILABILITY_STATUS[status]) return;
  try {
    await db.ref('users/'+ME.uid+'/availability').set(status);
    CACHE.invalidate('users', ME.uid);
    ME.availability = status;
    refreshUI();
    // Update quick-toggle buttons
    document.querySelectorAll('.avail-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.avail === status);
    });
    toast('Status: ' + AVAILABILITY_STATUS[status].label, 'ok');
  } catch(e){ toast('Failed to update status','err'); }
}

// ═══════════════════════════════════════════════════
// GROUP B4 — COLLABORATIVE HELP REQUESTS
// Full volunteer team panel for a post
// ═══════════════════════════════════════════════════
async function openCollabPanel(postKey){
  el('collabMO')?.classList.remove('hidden');
  const panel = el('collabList');
  if (panel) panel.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted)"><i class="fas fa-spinner fa-spin"></i></div>';

  try {
    const snap = await db.ref('posts/'+postKey).once('value');
    const p = snap.val();
    if (!p){ toast('Post not found','err'); return; }

    const volunteers = p.volunteers || {};
    const volEntries = Object.entries(volunteers);
    const isAuthor = ME && p.authorUID === ME.uid;
    const isAdm = ME && ME.isAdmin;

    setText('collabPostTitle', (p.body||'').substring(0,80)+(p.body?.length>80?'…':''));
    el('collabPostTag').innerHTML = `<span class="ptchip ${(TAGS[p.tag]||TAGS['General']).c}">${esc(p.tag)}</span>`;

    if (!panel) return;
    if (volEntries.length === 0){
      panel.innerHTML = '<div class="collab-empty"><i class="fas fa-user-plus"></i><p>No volunteers yet.</p><small>Be the first to offer help!</small></div>';
    } else {
      panel.innerHTML = volEntries.map(([uid, v]) => {
        const ini = initials(v.name||'?');
        const canRemove = (isAuthor || isAdm) && uid !== p.authorUID;
        return `<div class="collab-vol-card" id="cv-${esc(uid)}">
          <div class="collab-av" onclick="viewUser('${esc(uid)}')">${ini}</div>
          <div class="collab-info">
            <strong onclick="viewUser('${esc(uid)}')">${esc(v.name||'?')}</strong>
            <span class="collab-offer">${esc(v.offer||'Helping out')}</span>
            ${v.note ? `<p class="collab-note">"${esc(v.note)}"</p>` : ''}
            <small>${ago(v.t)}</small>
          </div>
          ${canRemove ? `<button class="collab-remove" onclick="removeVolunteer('${esc(postKey)}','${esc(uid)}')" type="button" title="Remove"><i class="fas fa-times"></i></button>` : ''}
        </div>`;
      }).join('');
    }

    // Coordination notes
    const coordEl = el('collabCoordNotes');
    if (coordEl) coordEl.value = p.coordNotes || '';
    const coordWrap = el('collabCoordWrap');
    if (coordWrap) coordWrap.classList.toggle('hidden', !(isAuthor||isAdm));

    // Store postKey for coord save
    el('collabMO').dataset.postKey = postKey;

  } catch(e){ toast('Failed to load collaboration panel','err'); }
}

async function removeVolunteer(postKey, uid){
  if (!confirm('Remove this volunteer?')) return;
  try {
    await db.ref('posts/'+postKey+'/volunteers/'+uid).remove();
    await db.ref('posts/'+postKey+'/helpedBy/'+uid).remove();
    el('cv-'+uid)?.remove();
    toast('Volunteer removed','ok');
  } catch(e){ toast('Failed to remove','err'); }
}

async function saveCoordNotes(){
  const postKey = el('collabMO')?.dataset.postKey;
  if (!postKey) return;
  const notes = sanitize(el('collabCoordNotes')?.value||'', 500);
  try {
    await db.ref('posts/'+postKey+'/coordNotes').set(notes);
    toast('Notes saved!','ok');
  } catch(e){ toast('Failed to save notes','err'); }
}

// ═══════════════════════════════════════════════════
// GROUP B5 — SUPPLY & RESOURCE TRACKING
// ═══════════════════════════════════════════════════
const SUPPLY_TYPES = [
  { id:'food',      label:'Food',         icon:'fa-utensils',      color:'#16a34a' },
  { id:'water',     label:'Water',        icon:'fa-tint',          color:'#2563eb' },
  { id:'medicine',  label:'Medicine',     icon:'fa-pills',         color:'#dc2626' },
  { id:'shelter',   label:'Shelter',      icon:'fa-home',          color:'#92400e' },
  { id:'clothing',  label:'Clothing',     icon:'fa-tshirt',        color:'#7c3aed' },
  { id:'transport', label:'Transport',    icon:'fa-truck',         color:'#0891b2' },
  { id:'tools',     label:'Tools',        icon:'fa-tools',         color:'#d97706' },
  { id:'other',     label:'Other',        icon:'fa-box',           color:'#64748b' },
];

let supplyListener = null;

function goSupplies(){
  goTab('supplies');
}

function filterSupplies(type, btn){
  document.querySelectorAll('.sup-filter').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  const cards = document.querySelectorAll('#supplyList .supply-card');
  cards.forEach(c => {
    c.style.display = (type==='all' || c.dataset.type===type) ? '' : 'none';
  });
}

function attachSupplyListener(){
  const list = el('supplyList');
  const empty = el('supplyEmpty');
  if (list) list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted)"><i class="fas fa-spinner fa-spin"></i></div>';

  if (supplyListener) db.ref('supplies').off('value', supplyListener);

  supplyListener = db.ref('supplies').orderByChild('t').limitToLast(80).on('value', snap => {
    if (!list) return;
    list.innerHTML = '';
    const items = [];
    snap.forEach(c => items.unshift({ key: c.key, ...c.val() }));
    if (empty) empty.classList.toggle('hidden', items.length > 0);
    if (items.length === 0) return;

    const frag = document.createDocumentFragment();
    items.forEach(item => {
      const s = SUPPLY_TYPES.find(x => x.id === item.type) || SUPPLY_TYPES[7];
      const own = ME && item.postedBy === ME.uid;
      const div = document.createElement('div');
      div.className = 'supply-card';
      div.id = 'sc-' + item.key;
      div.dataset.type = item.type || 'other';
      div.innerHTML = `
        <div class="supply-icon" style="background:${s.color}15;color:${s.color}"><i class="fas ${s.icon}"></i></div>
        <div class="supply-body">
          <div class="supply-header">
            <strong>${esc(item.name||'Supply')}</strong>
            <span class="supply-qty${item.qty<=0?' supply-out':''}">${item.qty<=0?'Out of stock':(item.qty+' '+esc(item.unit||'units'))}</span>
          </div>
          <div class="supply-meta">
            <span class="supply-type-badge" style="background:${s.color}15;color:${s.color}"><i class="fas ${s.icon}"></i> ${s.label}</span>
            <span><i class="fas fa-map-marker-alt" style="font-size:.6rem;margin-right:3px"></i>${esc(item.location||'—')}</span>
          </div>
          ${item.note ? `<p class="supply-note">${esc(item.note)}</p>` : ''}
          <div class="supply-footer">
            <span class="supply-poster" onclick="viewUser('${esc(item.postedBy)}')">${esc(item.posterName||'?')}</span>
            <time>${ago(item.t)}</time>
            ${own ? `<button class="supply-del" onclick="deleteSupply('${esc(item.key)}')" type="button"><i class="fas fa-trash"></i></button>` : ''}
          </div>
        </div>`;
      frag.appendChild(div);
    });
    list.appendChild(frag);
  });
}

async function submitSupply(){
  const name     = sanitizeStrict(el('supName')?.value||'', 80);
  const type     = el('supType')?.value || 'other';
  const qty      = parseInt(el('supQty')?.value||'0');
  const unit     = sanitizeStrict(el('supUnit')?.value||'', 30);
  const location = sanitizeStrict(el('supLoc')?.value||'', 200);
  const note     = sanitize(el('supNote')?.value||'', 300);

  if (!name || name.length < 2) return toast('Enter a supply name','err');
  if (!location || location.length < 2) return toast('Enter a location','err');
  if (isNaN(qty) || qty < 0) return toast('Enter a valid quantity','err');

  const btn = el('supBtn'); setLoad(btn, true);
  try {
    await db.ref('supplies').push({
      name, type, qty, unit: unit||'units', location, note,
      t: Date.now(), postedBy: ME.uid, posterName: sanitize(ME.name,60),
      posterBrgy: sanitize(ME.brgy,80)
    });
    ['supName','supQty','supUnit','supLoc','supNote'].forEach(id => { const e=el(id); if(e) e.value=''; });
    closeMO('supplyMO');
    toast('Supply listed!','ok');
    addActivityItem('post', ME.name+' listed supplies', name, Date.now());
  } catch(e){ toast('Failed: '+(e.message||'Error'),'err'); }
  setLoad(btn, false);
}

async function deleteSupply(key){
  if (!confirm('Remove this supply listing?')) return;
  try {
    await db.ref('supplies/'+key).remove();
    el('sc-'+key)?.remove();
    toast('Removed','ok');
  } catch(e){ toast('Failed to remove','err'); }
}

// ═══════════════════════════════════════════════════
// GROUP D1 — VERIFIED ORGANIZATION PROFILES
// ═══════════════════════════════════════════════════
async function openOrgApply(){
  el('orgApplyMO')?.classList.remove('hidden');
}

async function submitOrgApplication(){
  const orgName  = sanitizeStrict(el('orgName')?.value||'', 100);
  const orgType  = el('orgType')?.value || '';
  const orgDesc  = sanitize(el('orgDesc')?.value||'', 500);
  const orgAddr  = sanitizeStrict(el('orgAddr')?.value||'', 200);
  const orgPhone = sanitizeStrict(el('orgPhone')?.value||'', 30);
  const orgEmail = sanitizeStrict(el('orgEmail')?.value||'', 100);
  const orgWeb   = sanitizeStrict(el('orgWeb')?.value||'', 200);

  if (!orgName || orgName.length < 3) return toast('Enter your organization name','err');
  if (!orgType) return toast('Select an organization type','err');
  if (!orgDesc || orgDesc.length < 20) return toast('Describe your organization (min 20 chars)','err');

  const btn = el('orgApplyBtn'); setLoad(btn, true);
  try {
    await db.ref('orgApplications').push({
      uid: ME.uid, name: sanitize(ME.name,60), email: ME.email,
      orgName, orgType, orgDesc, orgAddr, orgPhone, orgEmail, orgWeb,
      status: 'pending', t: Date.now()
    });
    closeMO('orgApplyMO');
    toast('Application submitted! Admins will review it.','ok');
    addActivityItem('post','Org application submitted', orgName, Date.now());
  } catch(e){ toast('Failed: '+(e.message||'Error'),'err'); }
  setLoad(btn, false);
}

async function verifyOrg(uid, orgName, orgType){
  if (!ME || !ME.isAdmin) return;
  try {
    const updates = {
      isOrg: true, orgName: sanitize(orgName,100),
      orgType, orgVerified: true, orgVerifiedAt: Date.now()
    };
    await db.ref('users/'+uid).update(updates);
    await db.ref('users/'+uid+'/badges').transaction(badges => {
      const b = badges || [];
      if (!b.includes('verified')) b.push('verified');
      if (!b.includes('official')) b.push('official');
      return b;
    });
    CACHE.invalidate('users', uid);
    toast('Organization verified!','ok');
    adminTab('orgs');
  } catch(e){ toast('Failed','err'); }
}

async function rejectOrgApp(key){
  if (!ME || !ME.isAdmin) return;
  if (!confirm('Reject this application?')) return;
  try {
    await db.ref('orgApplications/'+key+'/status').set('rejected');
    toast('Application rejected','ok');
    adminTab('orgs');
  } catch(e){ toast('Failed','err'); }
}

function buildOrgBadge(u){
  if (!u.isOrg || !u.orgVerified) return '';
  const ot = ORG_TYPES[u.orgType] || ORG_TYPES['ngo'];
  return `<span class="org-verified-badge" style="--oc:${ot.color}" title="${esc(u.orgName||'')}">
    <i class="fas ${ot.icon}"></i> ${ot.label} · <i class="fas fa-check-circle"></i> Verified
  </span>`;
}

// ═══════════════════════════════════════════════════
// GROUP D2 — IMPACT STATISTICS DASHBOARD
// ═══════════════════════════════════════════════════
async function loadImpactDashboard(){
  const content = el('impactContent');
  if (!content) return;
  content.innerHTML = '<div style="padding:32px;text-align:center;color:var(--muted)"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';

  try {
    const [postsSnap, usersSnap] = await Promise.all([
      db.ref('posts').once('value'),
      db.ref('users').once('value'),
    ]);

    const posts = []; postsSnap.forEach(c => posts.push({key:c.key,...c.val()}));
    const users = []; usersSnap.forEach(c => users.push({uid:c.key,...c.val()}));

    // Compute stats
    const now = Date.now();
    const day  = 86400000;
    const week = day * 7;

    const totalPosts    = posts.length;
    const resolvedPosts = posts.filter(p => p.status === 'resolved').length;
    const helpedTotal   = posts.reduce((s,p) => s + Object.keys(p.helpedBy||{}).length, 0);
    const sosTotal      = posts.filter(p => p.isSOS).length;
    const todayPosts    = posts.filter(p => now - p.t < day).length;
    const weekPosts     = posts.filter(p => now - p.t < week).length;
    const volunteers    = users.filter(u => u.isVolunteer).length;
    const orgs          = users.filter(u => u.isOrg && u.orgVerified).length;
    const resolveRate   = totalPosts > 0 ? Math.round(resolvedPosts/totalPosts*100) : 0;

    // Tag breakdown
    const tagCounts = {};
    posts.forEach(p => { tagCounts[p.tag||'General'] = (tagCounts[p.tag||'General']||0)+1; });
    const topTags = Object.entries(tagCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);

    // Weekly activity (last 7 days)
    const daily = Array.from({length:7}, (_,i) => {
      const d = new Date(now - (6-i)*day);
      const label = d.toLocaleDateString('en',{weekday:'short'});
      const count = posts.filter(p => {
        const pd = new Date(p.t);
        return pd.toDateString() === d.toDateString();
      }).length;
      return { label, count };
    });
    const maxDaily = Math.max(...daily.map(d=>d.count), 1);

    // Top contributors
    const topContribs = users
      .map(u => ({...u, rep: calcReputation(u)}))
      .sort((a,b) => b.rep - a.rep)
      .slice(0, 5);

    content.innerHTML = `
      <div class="impact-grid">
        <div class="impact-stat-card impact-primary">
          <div class="isc-icon"><i class="fas fa-bullhorn"></i></div>
          <div class="isc-val">${totalPosts}</div>
          <div class="isc-lbl">Total Posts</div>
          <div class="isc-sub">${todayPosts} today · ${weekPosts} this week</div>
        </div>
        <div class="impact-stat-card impact-green">
          <div class="isc-icon"><i class="fas fa-check-circle"></i></div>
          <div class="isc-val">${resolveRate}%</div>
          <div class="isc-lbl">Resolution Rate</div>
          <div class="isc-sub">${resolvedPosts} of ${totalPosts} resolved</div>
        </div>
        <div class="impact-stat-card impact-blue">
          <div class="isc-icon"><i class="fas fa-hands-helping"></i></div>
          <div class="isc-val">${helpedTotal}</div>
          <div class="isc-lbl">Help Offers Made</div>
          <div class="isc-sub">${volunteers} active volunteers</div>
        </div>
        <div class="impact-stat-card impact-red">
          <div class="isc-icon"><i class="fas fa-exclamation-triangle"></i></div>
          <div class="isc-val">${sosTotal}</div>
          <div class="isc-lbl">SOS Alerts Sent</div>
          <div class="isc-sub">${orgs} verified organizations</div>
        </div>
      </div>

      <div class="impact-section">
        <div class="impact-section-title"><i class="fas fa-chart-bar"></i> 7-Day Activity</div>
        <div class="impact-bar-chart">
          ${daily.map(d => `
            <div class="ibc-col">
              <div class="ibc-bar-wrap">
                <div class="ibc-bar" style="height:${Math.round(d.count/maxDaily*100)}%" title="${d.count} posts">
                  ${d.count > 0 ? `<span class="ibc-count">${d.count}</span>` : ''}
                </div>
              </div>
              <div class="ibc-label">${esc(d.label)}</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="impact-section">
        <div class="impact-section-title"><i class="fas fa-tags"></i> Post Breakdown</div>
        <div class="impact-tags">
          ${topTags.map(([tag, count]) => {
            const tc = TAGS[tag] || TAGS['General'];
            const pct = Math.round(count/totalPosts*100);
            return `<div class="impact-tag-row">
              <span class="ptchip ${tc.c}" style="min-width:90px">${esc(tag)}</span>
              <div class="impact-tag-bar-wrap">
                <div class="impact-tag-bar" style="width:${pct}%"></div>
              </div>
              <span class="impact-tag-count">${count} (${pct}%)</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div class="impact-section">
        <div class="impact-section-title"><i class="fas fa-medal"></i> Top Contributors</div>
        ${topContribs.map((u,i) => {
          const ini = initials(u.name||'?');
          const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
          return `<div class="impact-contrib-row" onclick="viewUser('${esc(u.uid)}')">
            <span class="impact-rank">${medals[i]||i+1}</span>
            <div class="impact-contrib-av" style="background:${u.avatar?'#eee':'#1B4332'}">
              ${u.avatar?`<img src="${esc(u.avatar)}" loading="lazy" alt="${esc(ini)}"/>`:'<span>'+esc(ini)+'</span>'}
            </div>
            <div class="impact-contrib-info">
              <strong>${esc(u.name||'?')}</strong>
              <small>${u.postCount||0} posts · ${u.helpedCount||0} helped · ${u.rep} pts</small>
            </div>
            ${getRepBadge(u.rep)}
          </div>`;
        }).join('')}
      </div>`;
  } catch(e){
    content.innerHTML = '<div class="error-state"><div class="es-icon">⚠️</div><h3>Failed to load stats</h3><button class="es-btn" onclick="loadImpactDashboard()"><i class="fas fa-redo"></i> Retry</button></div>';
  }
}

// ═══════════════════════════════════════════════════
// GROUP D3 — INTERACTIVE COMMUNITY RESOURCE MAP
// ═══════════════════════════════════════════════════
let resourceMapInited = false;
let rMap = null;

async function initResourceMap(){
  const mapEl = el('resourceMapEl');
  if (!mapEl) return;

  if (!window.L){ toast('Map library loading…','warn'); return; }

  const isFirstInit = !resourceMapInited;
  if (!resourceMapInited){
    rMap = L.map('resourceMapEl').setView([14.6760, 121.0437], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap', maxZoom:18
    }).addTo(rMap);
    resourceMapInited = true;
  } else {
    rMap.invalidateSize();
  }

  if (isFirstInit) {
    // Add hardcoded QC resources
    QC_RESOURCES.forEach(r => addResourceMarker(r));

    // Load user-submitted resources
    try {
      const snap = await db.ref('resources').once('value');
      snap.forEach(c => {
        const r = c.val();
        if (r && r.lat && r.lng) addResourceMarker({key:c.key,...r});
      });
    } catch(e){}
  }

  // Filter buttons — re-attach every time using event delegation
  document.querySelectorAll('.rmap-filter').forEach(btn => {
    btn.replaceWith(btn.cloneNode(true)); // remove old listeners
  });
  document.querySelectorAll('.rmap-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rmap-filter').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type;
      rMap.eachLayer(layer => {
        if (layer._resourceType){
          const show = type === 'all' || layer._resourceType === type;
          if (show) layer.addTo(rMap); else rMap.removeLayer(layer);
        }
      });
    });
  });
}

function addResourceMarker(r){
  if (!rMap || !r.lat || !r.lng) return;
  const ri = RESOURCE_ICONS[r.type] || RESOURCE_ICONS['ngo'];
  const icon = L.divIcon({
    html: `<div class="rmap-marker" style="background:${ri.bg};border-color:${ri.color}"><i class="fas ${ri.icon}" style="color:${ri.color}"></i></div>`,
    className: '', iconSize:[36,36], iconAnchor:[18,18], popupAnchor:[0,-18]
  });
  const marker = L.marker([r.lat, r.lng], {icon}).addTo(rMap);
  marker._resourceType = r.type;
  marker.bindPopup(`
    <div class="rmap-popup">
      <strong>${esc(r.name||'Resource')}</strong>
      ${r.address ? `<div><i class="fas fa-map-marker-alt"></i> ${esc(r.address)}</div>` : ''}
      ${r.phone   ? `<div><i class="fas fa-phone"></i> <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></div>` : ''}
      ${r.hours   ? `<div><i class="fas fa-clock"></i> ${esc(r.hours)}</div>` : ''}
    </div>`);
}

async function submitResource(){
  const name = sanitizeStrict(el('resName')?.value||'', 100);
  const type = el('resType')?.value||'';
  const addr = sanitizeStrict(el('resAddr')?.value||'', 200);
  const phone= sanitizeStrict(el('resPhone')?.value||'', 30);
  const hours= sanitizeStrict(el('resHours')?.value||'', 80);
  const lat  = parseFloat(el('resLat')?.value||'');
  const lng  = parseFloat(el('resLng')?.value||'');

  if (!name || name.length < 3) return toast('Enter resource name','err');
  if (!type) return toast('Select resource type','err');
  if (isNaN(lat)||isNaN(lng)) return toast('Enter valid coordinates','err');
  if (lat<14.4||lat>14.9||lng<120.9||lng>121.2) return toast('Coordinates outside QC area','err');

  const btn = el('resSubmitBtn'); setLoad(btn, true);
  try {
    const ref = await db.ref('resources').push({
      name, type, addr, phone, hours, lat, lng,
      postedBy: ME.uid, posterName: sanitize(ME.name,60), t: Date.now()
    });
    addResourceMarker({key:ref.key, name, type, address:addr, phone, hours, lat, lng});
    closeMO('resourceMO');
    toast('Resource added to map!','ok');
  } catch(e){ toast('Failed','err'); }
  setLoad(btn, false);
}

// ═══════════════════════════════════════════════════
// GROUP D4 — COMMUNITY PARTNERSHIP SYSTEM
// ═══════════════════════════════════════════════════
async function loadPartners(){
  const list = el('partnerList');
  if (list) list.innerHTML = '<div style="padding:28px;text-align:center;color:var(--muted)"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';

  try {
    const snap = await db.ref('partners').orderByChild('verified').equalTo(true).once('value');
    const partners = [];
    snap.forEach(c => partners.push({key:c.key,...c.val()}));
    partners.sort((a,b) => (b.t||0)-(a.t||0));

    if (!list) return;
    if (partners.length === 0){
      list.innerHTML = `<div class="empty-fancy"><div class="ef-icon-design"><i class="fas fa-handshake" style="font-size:1.8rem"></i></div><h3>No partners yet</h3><p>Organizations can apply to become community partners.</p></div>`;
      return;
    }

    list.innerHTML = partners.map(p => {
      const ot = ORG_TYPES[p.orgType] || ORG_TYPES['ngo'];
      return `<div class="partner-card">
        <div class="partner-logo" style="background:${ot.color}15;color:${ot.color}">
          ${p.logoUrl ? `<img src="${esc(p.logoUrl)}" alt="${esc(p.orgName)}" loading="lazy"/>` : `<i class="fas ${ot.icon}"></i>`}
        </div>
        <div class="partner-info">
          <div class="partner-name-row">
            <strong>${esc(p.orgName||'?')}</strong>
            <span class="partner-type-badge" style="background:${ot.color}15;color:${ot.color}"><i class="fas ${ot.icon}"></i> ${ot.label}</span>
          </div>
          ${p.desc ? `<p class="partner-desc">${esc(p.desc)}</p>` : ''}
          <div class="partner-links">
            ${p.phone ? `<a href="tel:${esc(p.phone)}" class="partner-link"><i class="fas fa-phone"></i> ${esc(p.phone)}</a>` : ''}
            ${p.email ? `<a href="mailto:${esc(p.email)}" class="partner-link"><i class="fas fa-envelope"></i> ${esc(p.email)}</a>` : ''}
            ${p.web   ? `<a href="${esc(p.web)}" target="_blank" rel="noopener" class="partner-link"><i class="fas fa-globe"></i> Website</a>` : ''}
          </div>
          ${p.services ? `<div class="partner-services">${p.services.map(s=>`<span class="skill-chip-tiny" style="--sc:#16a34a">${esc(s)}</span>`).join('')}</div>` : ''}
        </div>
        <span class="partner-verified-badge"><i class="fas fa-check-circle"></i> Partner</span>
      </div>`;
    }).join('');
  } catch(e){
    if(list) list.innerHTML = '<div class="error-state"><div class="es-icon">⚠️</div><h3>Failed to load</h3><button class="es-btn" onclick="loadPartners()"><i class="fas fa-redo"></i> Retry</button></div>';
  }
}

async function submitPartnerApplication(){
  const orgName = sanitizeStrict(el('partOrgName')?.value||'', 100);
  const orgType = el('partOrgType')?.value||'';
  const desc    = sanitize(el('partDesc')?.value||'', 500);
  const phone   = sanitizeStrict(el('partPhone')?.value||'', 30);
  const email   = sanitizeStrict(el('partEmail')?.value||'', 100);
  const web     = sanitizeStrict(el('partWeb')?.value||'', 200);
  const services= (el('partServices')?.value||'').split(',').map(s=>sanitizeStrict(s.trim(),50)).filter(Boolean).slice(0,8);

  if (!orgName || orgName.length < 3) return toast('Enter organization name','err');
  if (!orgType) return toast('Select organization type','err');
  if (!desc || desc.length < 20) return toast('Describe your services (min 20 chars)','err');

  const btn = el('partApplyBtn'); setLoad(btn, true);
  try {
    await db.ref('partnerApplications').push({
      uid: ME.uid, submitterName: sanitize(ME.name,60),
      orgName, orgType, desc, phone, email, web, services,
      verified: false, t: Date.now()
    });
    closeMO('partnerMO');
    toast('Partnership application submitted!','ok');
  } catch(e){ toast('Failed','err'); }
  setLoad(btn, false);
}

// ═══════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════
function v(id){ return (el(id)?.value||'').trim(); }
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function initials(n){ return (n||'?').trim().split(/\s+/).map(w=>w[0]||'').join('').substring(0,2).toUpperCase()||'?'; }

function ago(ts){
  if (!ts) return '—';
  const d=Date.now()-ts;
  if (d<60000)       return 'Just now';
  if (d<3600000)     { const m=Math.floor(d/60000); return m+' min'+(m>1?'s':'')+' ago'; }
  if (d<86400000)    { const h=Math.floor(d/3600000); return h+' hour'+(h>1?'s':'')+' ago'; }
  if (d<172800000)   return 'Yesterday';
  if (d<604800000)   { const dy=Math.floor(d/86400000); return dy+' days ago'; }
  if (d<2592000000)  { const w=Math.floor(d/604800000); return w+' week'+(w>1?'s':'')+' ago'; }
  try { return new Date(ts).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}); }
  catch(e){ return '—'; }
}

function fmtDate(ts){
  try { return new Date(ts).toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'}); }
  catch(e){ return '—'; }
}

function setLoad(btn,on){
  if (!btn) return;
  if (on){ btn._orig=btn.innerHTML; btn.innerHTML='<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>'; btn.disabled=true; }
  else   { btn.innerHTML=btn._orig||btn.innerHTML; btn.disabled=false; }
}

function fbErr(e){
  const m={
    'auth/email-already-in-use':  'This email is already registered.',
    'auth/invalid-email':         'Invalid email address.',
    'auth/wrong-password':        'Incorrect password.',
    'auth/user-not-found':        'No account with that email.',
    'auth/weak-password':         'Password too weak (min 6 chars).',
    'auth/too-many-requests':     'Too many attempts. Try again later.',
    'auth/network-request-failed':'Network error. Check your connection.',
    'auth/invalid-credential':    'Invalid email or password.',
    'auth/user-disabled':         'This account has been disabled.',
    'auth/requires-recent-login': 'Please log out and log back in first.',
    'permission-denied':          'You don\'t have permission for this action.',
    'unavailable':                'Network unavailable. Check your connection.',
  };
  return m[e.code] || e.message || 'Something went wrong. Please try again.';
}

let _tt;
function toast(msg,type=''){
  const t=el('toast'); if(!t) return;
  t.textContent=msg.substring(0,120);
  t.className='toast'+(type?' '+type:'');
  t.classList.remove('hidden');
  clearTimeout(_tt);
  _tt=setTimeout(()=>t.classList.add('hidden'), type==='err'?4500:3000);
}

// ═══════════════════════════════════════════════════
// GROUP C — UI/UX JAVASCRIPT
// ═══════════════════════════════════════════════════

// ── DARK MODE ──────────────────────────────────────
function initDarkMode(){
  const saved = localStorage.getItem('qch-theme');
  // Apply saved preference
  if(saved === 'dark'){
    document.body.classList.add('dark-mode');
    document.body.classList.remove('light-mode');
  } else if(saved === 'light'){
    document.body.classList.add('light-mode');
    document.body.classList.remove('dark-mode');
  }
  // If no saved pref, CSS media query handles it automatically
  updateThemeToggleUI();
}

function toggleDarkMode(){
  const isNowDark = document.body.classList.toggle('dark-mode');
  document.body.classList.toggle('light-mode', !isNowDark);
  localStorage.setItem('qch-theme', isNowDark ? 'dark' : 'light');
  updateThemeToggleUI();
}

function updateThemeToggleUI(){
  const isDark = document.body.classList.contains('dark-mode') ||
    (!document.body.classList.contains('light-mode') &&
     window.matchMedia('(prefers-color-scheme:dark)').matches);
  // Update toggle button in settings
  const btn = el('themeToggleBtn');
  if(btn){
    const icon  = btn.querySelector('.tm-icon');
    const label = btn.querySelector('.tm-label');
    if(icon)  icon.className  = `fas fa-${isDark ? 'sun' : 'moon'} tm-icon`;
    if(label) label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
  }
  // Reflect in command palette action label too
  const dmAction = CMD_ACTIONS?.find(a => a.label === 'Toggle Dark Mode');
  if(dmAction) dmAction.desc = isDark ? 'Switch to light theme' : 'Switch to dark theme';
}

// ── RIPPLE EFFECT ──────────────────────────────────
function addRipple(e){
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.4;
  const x = (e.clientX || rect.left + rect.width/2) - rect.left - size/2;
  const y = (e.clientY || rect.top  + rect.height/2) - rect.top  - size/2;
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
  btn.appendChild(ripple);
  ripple.addEventListener('animationend', ()=>ripple.remove(), {once:true});
}

function initRipples(){
  const sel = '.btn-primary,.btn-post,.btn-auth2,.btn-sos,.btn-danger,.cc-b,.ef-btn,.bb-fabcir';
  document.querySelectorAll(sel).forEach(btn=>{
    if(!btn._rippleInit){
      btn.addEventListener('click', addRipple);
      btn._rippleInit = true;
    }
  });
}

// ── COMMAND PALETTE ────────────────────────────────
const CMD_ACTIONS = [
  // Navigation
  { section:'Navigate', label:'Home Feed',        desc:'Go to community posts',       icon:'fa-home',           action:()=>goTab('home'),        shortcut:'H' },
  { section:'Navigate', label:'Map View',          desc:'See posts on map',             icon:'fa-map',            action:()=>goTab('mapview'),     shortcut:'M' },
  { section:'Navigate', label:'Resource Map',      desc:'Hospitals, evacuation centers',icon:'fa-map-marked-alt',action:()=>goTab('resourcemap') },
  { section:'Navigate', label:'Impact Dashboard',  desc:'Community statistics',         icon:'fa-chart-bar',      action:()=>goTab('impact') },
  { section:'Navigate', label:'Community Partners',desc:'Verified organizations',       icon:'fa-handshake',      action:()=>goTab('partners') },
  { section:'Navigate', label:'Supplies & Resources',desc:'Resource tracking',          icon:'fa-boxes',          action:()=>goTab('supplies') },
  { section:'Navigate', label:'Lost & Found',      desc:'Lost and found posts',         icon:'fa-search-location',action:()=>goTab('lostfound') },
  { section:'Navigate', label:'Activity',          desc:'Notifications and history',    icon:'fa-bell',           action:()=>goTab('activity'),    shortcut:'A' },
  { section:'Navigate', label:'Settings',          desc:'Account preferences',          icon:'fa-cog',            action:()=>goTab('settings'),    shortcut:'S' },
  { section:'Navigate', label:'Emergency',         desc:'Emergency contacts & SOS',     icon:'fa-ambulance',      action:()=>goTab('emergency') },
  { section:'Navigate', label:'Weather',           desc:'Current QC weather',           icon:'fa-cloud-sun',      action:()=>goTab('weather') },
  // Actions
  { section:'Actions',  label:'New Post',           desc:'Share with community',         icon:'fa-plus-circle',    action:()=>openPost(),           shortcut:'N' },
  { section:'Actions',  label:'Help Needed',        desc:'Request help',                 icon:'fa-hand-holding-heart', action:()=>openPost('Help Needed') },
  { section:'Actions',  label:'Report Flood',       desc:'Flood alert post',             icon:'fa-water',          action:()=>openPost('Flood') },
  { section:'Actions',  label:'Report Medical',     desc:'Medical alert post',           icon:'fa-heartbeat',      action:()=>openPost('Medical') },
  { section:'Actions',  label:'Send SOS',           desc:'Emergency SOS alert',          icon:'fa-exclamation-circle', action:()=>goTab('emergency') },
  { section:'Actions',  label:'Verify My Org',      desc:'Apply for org verification',   icon:'fa-building',       action:()=>{ el('orgApplyMO')?.classList.remove('hidden'); } },
  { section:'Actions',  label:'Become a Partner',   desc:'Community partnership',        icon:'fa-handshake',      action:()=>{ el('partnerMO')?.classList.remove('hidden'); } },
  { section:'Actions',  label:'Add Resource',       desc:'Add to resource map',          icon:'fa-map-marker-alt', action:()=>{ goTab('resourcemap'); setTimeout(()=>el('resourceMO')?.classList.remove('hidden'),400); } },
  { section:'Actions',  label:'Toggle Dark Mode',   desc:'Switch theme',                 icon:'fa-moon',           action:()=>toggleDarkMode() },
];

let cmdOpen = false;
let cmdIdx  = 0;
let cmdFiltered = [...CMD_ACTIONS];

function openCmd(){
  const ov = el('cmdOverlay'); if(!ov) return;
  ov.classList.remove('hidden');
  cmdOpen = true; cmdIdx = 0;
  const inp = el('cmdInput'); if(inp){ inp.value=''; inp.focus(); }
  renderCmdResults('');
}

function closeCmd(){
  el('cmdOverlay')?.classList.add('hidden');
  cmdOpen = false;
}

function renderCmdResults(q){
  const res = el('cmdResults'); if(!res) return;
  const query = q.toLowerCase().trim();
  cmdFiltered = CMD_ACTIONS.filter(a=>
    !query || a.label.toLowerCase().includes(query) || (a.desc||'').toLowerCase().includes(query) || (a.section||'').toLowerCase().includes(query)
  );
  if(cmdFiltered.length === 0){
    res.innerHTML = `<div style="padding:28px;text-align:center;color:var(--soft);font-size:.88rem">No actions found for "<em>${esc(q)}</em>"</div>`;
    return;
  }
  let html=''; let lastSection='';
  cmdFiltered.forEach((a,i)=>{
    if(a.section !== lastSection){
      html += `<div class="cmd-section-label">${esc(a.section)}</div>`;
      lastSection = a.section;
    }
    html += `<div class="cmd-item${i===cmdIdx?' cmd-selected':''}" role="option" data-idx="${i}" onclick="execCmd(${i})">
      <div class="cmd-icon"><i class="fas ${esc(a.icon)}"></i></div>
      <div class="cmd-item-body">
        <strong>${esc(a.label)}</strong>
        ${a.desc?`<span>${esc(a.desc)}</span>`:''}
      </div>
      ${a.shortcut?`<span class="cmd-item-shortcut">${esc(a.shortcut)}</span>`:''}
    </div>`;
  });
  res.innerHTML = html;
}

function execCmd(idx){
  const a = cmdFiltered[idx]; if(!a) return;
  closeCmd();
  setTimeout(()=>a.action(), 80);
}

function cmdMoveSel(dir){
  cmdIdx = Math.max(0, Math.min(cmdFiltered.length-1, cmdIdx+dir));
  document.querySelectorAll('.cmd-item').forEach((el,i)=>el.classList.toggle('cmd-selected', i===cmdIdx));
  const sel = document.querySelector('.cmd-item.cmd-selected');
  sel?.scrollIntoView({block:'nearest'});
}

// Keyboard handler
document.addEventListener('keydown', e=>{
  // Open with Cmd/Ctrl+K
  if((e.metaKey||e.ctrlKey) && e.key==='k'){
    e.preventDefault();
    cmdOpen ? closeCmd() : openCmd();
    return;
  }
  if(!cmdOpen) return;
  if(e.key==='Escape'){ closeCmd(); return; }
  if(e.key==='ArrowDown'){ e.preventDefault(); cmdMoveSel(1); return; }
  if(e.key==='ArrowUp'){   e.preventDefault(); cmdMoveSel(-1); return; }
  if(e.key==='Enter'){
    e.preventDefault();
    if(cmdFiltered[cmdIdx]) execCmd(cmdIdx);
    return;
  }
});

// Click outside to close
document.addEventListener('click', e=>{
  if(!cmdOpen) return;
  const ov = el('cmdOverlay');
  if(ov && !ov.classList.contains('hidden')){
    if(!el('cmdPalette')?.contains(e.target)) closeCmd();
  }
});

// Init on DOMContentLoaded
window.addEventListener('DOMContentLoaded', ()=>{
  initDarkMode();

  const cmdInput = el('cmdInput');
  if(cmdInput){
    cmdInput.addEventListener('input', e=>{
      cmdIdx = 0;
      renderCmdResults(e.target.value);
    });
  }

  // Ripples for static elements; dynamic ones get ripples via MutationObserver
  initRipples();
  const obs = new MutationObserver(()=>initRipples());
  obs.observe(document.body, {childList:true, subtree:true});

  // System dark mode change listener
  window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', updateThemeToggleUI);
});

// ═══════════════════════════════════════════════════════════════════
// QC PLATFORM v8.0 — ADVANCED FEATURES (40 Features)
// ═══════════════════════════════════════════════════════════════════

// ── STATE ─────────────────────────────────────────────────────────
let chatKey = null;
let chatListener = null;
let swipeStartX = 0;
let swipeStartY = 0;
let userLat = null;
let userLng = null;
let offlineQueue = [];
let isOnline = navigator.onLine;
let serviceWorkerReg = null;
const BRGY_COORDS_EXT = {
  'Batasan Hills':{lat:14.710,lng:121.095},
  'Commonwealth':{lat:14.720,lng:121.080},
  'Payatas':{lat:14.730,lng:121.100},
  'Bagong Silangan':{lat:14.722,lng:121.110},
  'Novaliches':{lat:14.760,lng:121.010},
  'Fairview':{lat:14.750,lng:121.045},
  'Quezon City':{lat:14.676,lng:121.043},
};

// ── FEATURE 9/10: URGENCY + PROGRESS DISPLAY ──────────────────────
// Already in buildCard via urg-badge. Enhanced labels:
const URGENCY_CONFIG = {
  high:   { cls:'urg-critical', label:'🔴 Critical',  color:'#dc2626' },
  medium: { cls:'urg-urgent',   label:'🟠 Urgent',    color:'#ea580c' },
  low:    { cls:'urg-normal',   label:'🟢 Normal',    color:'#16a34a' },
};

// ── FEATURE 14: SMART DISTANCE DISPLAY ────────────────────────────
function getDistKm(lat1,lng1,lat2,lng2){
  if(!lat1||!lat2) return null;
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLon=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function fmtDist(km){
  if(km===null) return '';
  if(km<1) return Math.round(km*1000)+'m away';
  return km.toFixed(1)+'km away';
}

function getUserLocation(){
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos=>{
    userLat=pos.coords.latitude;
    userLng=pos.coords.longitude;
  },()=>{},{timeout:5000});
}

// Inject distance into post cards after render
function injectDistances(){
  if(!userLat) return;
  document.querySelectorAll('.pcard').forEach(card=>{
    const loc=card.dataset.location||'';
    const bc=BRGY_COORDS_EXT[loc]||(typeof BRGY_COORDS!=='undefined'?BRGY_COORDS[loc]:null);
    if(!bc) return;
    const km=getDistKm(userLat,userLng,bc.lat,bc.lng);
    if(km===null) return;
    const distEl=card.querySelector('.pdist');
    if(distEl) distEl.textContent=fmtDist(km);
    else{
      const locEl=card.querySelector('.ploc');
      if(locEl) locEl.insertAdjacentHTML('afterend',`<span class="pdist"><i class="fas fa-location-arrow" style="font-size:.55rem;margin-right:2px;color:var(--green)"></i>${fmtDist(km)}</span>`);
    }
  });
}

// ── FEATURE 12: REAL-TIME CHAT PER POST ───────────────────────────
function openChat(postKey, postTitle){
  chatKey=postKey;
  if(chatListener){ db.ref('chats/'+chatKey).off('value',chatListener); chatListener=null; }
  const mo=el('chatMO'); if(!mo) return;
  const titleEl=el('chatTitle'); if(titleEl) titleEl.textContent='Chat: '+(postTitle||'Post').substring(0,50);
  const msgs=el('chatMsgs'); if(msgs){ msgs.innerHTML='<div class="chat-loading"><i class="fas fa-spinner fa-spin"></i></div>'; }
  mo.classList.remove('hidden');

  chatListener=db.ref('chats/'+chatKey)
    .orderByChild('t').limitToLast(50)
    .on('value', snap=>{
      if(!msgs) return;
      const list=[];
      snap.forEach(c=>list.push({key:c.key,...c.val()}));
      renderChatMessages(list);
    });
}

function renderChatMessages(msgs){
  const container=el('chatMsgs'); if(!container) return;
  if(msgs.length===0){
    container.innerHTML='<div class="chat-empty"><i class="fas fa-comment-dots"></i><p>No messages yet. Start coordinating!</p></div>';
    return;
  }
  container.innerHTML=msgs.map(m=>{
    const isMe=ME&&m.uid===ME.uid;
    const av=m.avatar?`<img src="${esc(m.avatar)}" alt="" loading="lazy" onerror="this.style.display='none'"/>`:(m.name||'?').charAt(0).toUpperCase();
    return `<div class="chat-msg${isMe?' chat-mine':''}">
      <div class="chat-av" style="background:${isMe?'var(--green)':'var(--bg2)'}">${av}</div>
      <div class="chat-bubble">
        ${!isMe?`<span class="chat-name">${esc(m.name||'Anonymous')}</span>`:''}
        <p>${esc(m.body)}</p>
        <time>${ago(m.t)}</time>
      </div>
    </div>`;
  }).join('');
  container.scrollTop=container.scrollHeight;
}

async function sendChatMessage(){
  if(!chatKey||!ME) return;
  const inp=el('chatInput'); if(!inp) return;
  const body=sanitize(inp.value||'',300);
  if(!body||body.length<1) return;
  inp.value='';
  try {
    await db.ref('chats/'+chatKey).push({
      uid:ME.uid, name:sanitize(ME.name,60),
      avatar:ME.avatar||'', body, t:Date.now()
    });
  } catch(e){ toast('Failed to send message','err'); }
}

function closeChat(){
  if(chatListener){ db.ref('chats/'+(chatKey||'')).off('value',chatListener); chatListener=null; }
  el('chatMO')?.classList.add('hidden');
  chatKey=null;
}

// Add chat button to cards — called when feed renders
function addChatButtons(){
  document.querySelectorAll('.pcard:not([data-chat-init])').forEach(card=>{
    card.dataset.chatInit='1';
    const key=card.id?.replace('pc-','');
    if(!key) return;
    const pacts=card.querySelector('.pacts');
    if(pacts&&!pacts.querySelector('.chat-btn')){
      const btn=document.createElement('button');
      btn.className='pa chat-btn';
      btn.type='button';
      btn.title='Open chat for this request';
      btn.setAttribute('aria-label','Open request chat');
      const title=card.querySelector('.pbody')?.textContent?.substring(0,50)||'';
      btn.innerHTML='<i class="fas fa-comment-alt"></i>';
      btn.onclick=()=>openChat(key,title);
      // Insert before delete/edit buttons
      pacts.insertBefore(btn,pacts.lastElementChild?.previousElementSibling||null);
    }
  });
}

// ── FEATURE 13: IMAGE GALLERY ──────────────────────────────────────
function openGallery(images){
  let idx=0;
  const overlay=document.createElement('div');
  overlay.className='gallery-overlay';
  const render=()=>{
    overlay.innerHTML=`
      <div class="gallery-inner">
        <button class="gallery-close" onclick="this.closest('.gallery-overlay').remove()" type="button"><i class="fas fa-times"></i></button>
        <button class="gallery-nav gallery-prev" onclick="" type="button"><i class="fas fa-chevron-left"></i></button>
        <img src="${esc(images[idx])}" alt="Image ${idx+1} of ${images.length}" class="gallery-img"/>
        <button class="gallery-nav gallery-next" onclick="" type="button"><i class="fas fa-chevron-right"></i></button>
        <div class="gallery-dots">${images.map((_,i)=>`<span class="gdot${i===idx?' active':''}"></span>`).join('')}</div>
      </div>`;
    overlay.querySelector('.gallery-prev').onclick=()=>{idx=(idx-1+images.length)%images.length;render();};
    overlay.querySelector('.gallery-next').onclick=()=>{idx=(idx+1)%images.length;render();};
  };
  render();
  document.body.appendChild(overlay);
}

// ── FEATURE 15: ACTIVITY FEED NAVIGATION ──────────────────────────
// Enhanced addActivityItem — already exists, add postKey linkage
function addActivityItemLinked(type, title, body, t, postKey){
  addActivityItem(type,title,body,t);
  // Patch last activity item with a postKey for navigation
  if(postKey){
    const actList=el('actList');
    if(actList){
      const last=actList.lastElementChild;
      if(last) last.dataset.postKey=postKey;
    }
  }
}

// Make activity items navigable
function initActivityNavigation(){
  const list=el('actList'); if(!list) return;
  list.addEventListener('click',e=>{
    const item=e.target.closest('.act-item');
    if(!item) return;
    const key=item.dataset.postKey;
    if(key){
      goTab('home');
      setTimeout(()=>{
        const card=el('pc-'+key);
        if(card){ card.scrollIntoView({behavior:'smooth',block:'center'}); card.classList.add('highlight-pulse'); setTimeout(()=>card.classList.remove('highlight-pulse'),2000); }
      },500);
    }
  });
}

// ── FEATURE 16: ENHANCED TOAST SYSTEM ─────────────────────────────
let _toastQueue=[];
let _toastActive=false;

function toastAdvanced(msg, type='', duration=0, action=null, actionLabel=''){
  _toastQueue.push({msg,type,duration,action,actionLabel});
  if(!_toastActive) processToastQueue();
}

function processToastQueue(){
  if(!_toastQueue.length){ _toastActive=false; return; }
  _toastActive=true;
  const {msg,type,duration,action,actionLabel}=_toastQueue.shift();
  const t=el('toast'); if(!t){ _toastActive=false; return; }
  const dur=duration||(type==='err'?4500:type==='ok'?2800:3000);
  const actionHtml=action&&actionLabel?`<button class="toast-action" onclick="this._act()">${esc(actionLabel)}</button>`:'';
  t.innerHTML=`<span>${esc(msg.substring(0,120))}</span>${actionHtml}`;
  t.className='toast'+(type?' '+type:'');
  t.classList.remove('hidden');
  if(action&&actionLabel){ const btn=t.querySelector('.toast-action'); if(btn) btn._act=()=>{action();t.classList.add('hidden');} }
  clearTimeout(_tt);
  _tt=setTimeout(()=>{ t.classList.add('hidden'); setTimeout(processToastQueue,300); }, dur);
}

// ── FEATURE 21: VOLUNTEER REPUTATION SYSTEM ───────────────────────
const REPUTATION_TIERS=[
  {min:0,   max:29,   label:'New Member',   icon:'fa-seedling',   color:'#6b7280'},
  {min:30,  max:99,   label:'Helper',       icon:'fa-hands-helping',color:'#2563eb'},
  {min:100, max:199,  label:'Trusted',      icon:'fa-shield-alt', color:'#7c3aed'},
  {min:200, max:499,  label:'Champion',     icon:'fa-star',       color:'#d97706'},
  {min:500, max:99999,label:'Community Hero',icon:'fa-crown',     color:'#dc2626'},
];

function getRepTier(pts){
  return REPUTATION_TIERS.find(t=>pts>=t.min&&pts<=t.max)||REPUTATION_TIERS[0];
}

function buildRepCard(u){
  const rep=calcReputation(u);
  const tier=getRepTier(rep);
  const next=REPUTATION_TIERS.find(t=>t.min>rep);
  const pct=next?Math.round((rep-tier.min)/(next.min-tier.min)*100):100;
  return `<div class="rep-card">
    <div class="rep-icon" style="background:${tier.color}18;color:${tier.color}"><i class="fas ${tier.icon}"></i></div>
    <div class="rep-info">
      <strong style="color:${tier.color}">${tier.label}</strong>
      <span>${rep} reputation points</span>
      <div class="rep-bar"><div class="rep-fill" style="width:${pct}%;background:${tier.color}"></div></div>
      ${next?`<small>${next.min-rep} pts to ${getRepTier(next.min).label}</small>`:'<small>Max tier reached!</small>'}
    </div>
  </div>`;
}

// ── FEATURE 23: AI HELP REQUEST CATEGORIZATION ────────────────────
const AI_KEYWORDS={
  Medical:   ['medical','hospital','injured','sick','medicine','ambulance','doctor','nurse','blood','hurt','pain','emergency','health'],
  Flood:     ['flood','water','river','rain','inundated','submerged','dam','overflow','drainage','typhoon','storm','bagyo'],
  Missing:   ['missing','lost','person','child','elderly','hindi','makita','nawala','search','find','locate'],
  'Help Needed':['help','assist','rescue','stranded','trapped','need','please','tulong','saklolo','food','hungry','shelter'],
  Power:     ['power','electricity','brownout','blackout','kuryente','wires','electric','generator'],
  Traffic:   ['traffic','accident','crash','road','street','blocked','car','vehicle','tropa'],
};

function aiCategorize(text){
  if(!text) return null;
  const t=text.toLowerCase();
  let best=null,bestScore=0;
  for(const [tag,kws] of Object.entries(AI_KEYWORDS)){
    const score=kws.filter(kw=>t.includes(kw)).length;
    if(score>bestScore){ bestScore=score; best=tag; }
  }
  return bestScore>=1?best:null;
}

function autoTagPost(textareaEl){
  const txt=textareaEl.value||'';
  const suggested=aiCategorize(txt);
  if(!suggested) return;
  const hint=el('aiTagHint');
  if(hint){
    hint.textContent=`AI suggests: ${suggested}`;
    hint.style.display='inline-flex';
    hint.onclick=()=>{ pickTagById(suggested); hint.style.display='none'; };
  }
}

function pickTagById(tag){
  document.querySelectorAll('.ptag').forEach(b=>b.classList.toggle('active',b.dataset.tag===tag));
  postTag=tag;
}

// ── FEATURE 24: NEARBY HELP DETECTION ─────────────────────────────
let _nearbyRetries = 0;
function loadNearbyPosts(){
  if(!userLat){
    getUserLocation();
    if(_nearbyRetries < 3){
      _nearbyRetries++;
      setTimeout(loadNearbyPosts, 2000);
    } else {
      // Fallback to QC center coords
      userLat = 14.676; userLng = 121.044;
      loadNearbyPosts();
    }
    return;
  }
  _nearbyRetries = 0;
  const container=el('nearbyPostList')||el('tab-nearby');
  if(!container) return;
  db.ref('posts').orderByChild('t').once('value').then(snap=>{
    const posts=[];
    snap.forEach(c=>{
      const p={key:c.key,...c.val()};
      // Only show main-feed posts (or legacy posts without a feed field)
      if ((p.feed || 'feed') !== 'feed') return;
      const bc=BRGY_COORDS_EXT[p.location]||(typeof BRGY_COORDS!=='undefined'?BRGY_COORDS[p.location]:null); if(bc){const km=getDistKm(userLat,userLng,bc.lat,bc.lng);if(km!==null&&km<10) posts.push({...p,distKm:km});}
    });
    posts.sort((a,b)=>a.distKm-b.distKm);
    const nearList=el('nearbyPostList'); if(!nearList) return;
    nearList.innerHTML=posts.length===0?'<div class="empty-fancy" style="padding:24px;text-align:center"><div class="ef-icon-design"><i class="fas fa-map-marker-alt" style="font-size:1.5rem"></i></div><h3>No nearby posts found</h3><p>No help requests within 10km of your location.</p></div>':posts.slice(0,10).map(p=>`<div class="nearby-item" onclick="goTab('home')" role="button" tabindex="0">
      <div class="nearby-tag" style="background:${(TAGS[p.tag]||TAGS.General).bg}15;color:${(TAGS[p.tag]||TAGS.General).bg}">${esc(p.tag)}</div>
      <div class="nearby-body"><strong>${esc((p.body||'').substring(0,80))}</strong><span><i class="fas fa-location-arrow" style="font-size:.6rem"></i> ${fmtDist(p.distKm)} · ${esc(p.location||'Unknown')}</span></div>
    </div>`).join('');
  });
}

// ── FEATURE 28: SWIPE GESTURES ────────────────────────────────────
const TABS_ORDER=['home','mapview','lostfound','activity','account'];
function initSwipeGestures(){
  const pw=el('pw'); if(!pw) return;
  pw.addEventListener('touchstart',e=>{
    swipeStartX=e.touches[0].clientX;
    swipeStartY=e.touches[0].clientY;
  },{passive:true});
  pw.addEventListener('touchend',e=>{
    const dx=e.changedTouches[0].clientX-swipeStartX;
    const dy=e.changedTouches[0].clientY-swipeStartY;
    if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*2){
      const cur=TABS_ORDER.indexOf(activeTab);
      if(cur===-1) return;
      if(dx<0&&cur<TABS_ORDER.length-1) goTab(TABS_ORDER[cur+1]);
      else if(dx>0&&cur>0)              goTab(TABS_ORDER[cur-1]);
    }
  },{passive:true});
}

// ── FEATURE 29: REAL-TIME ACTIVITY UPDATES ────────────────────────
let activityRTListener=null;
function startRealtimeActivity(){
  if(activityRTListener) return;
  activityRTListener=db.ref('posts').orderByChild('t').limitToLast(1).on('child_added',snap=>{
    const p={key:snap.key,...snap.val()};
    if(p.authorUID===ME?.uid) return;
    const nBanner=el('newBanner');
    if(nBanner&&activeTab==='home'){
      nBanner.classList.remove('hidden');
      setText('newBannerTxt',`New post in ${p.location||'community'}`);
    }
  });
}

function stopRealtimeActivity(){
  if(activityRTListener){ db.ref('posts').off('child_added',activityRTListener); activityRTListener=null; }
}

// ── FEATURE 30: PLATFORM IMPACT STATS IN HERO ─────────────────────
async function updateHeroStats(){
  try {
    const [postsSnap,onlineSnap]=await Promise.all([
      db.ref('posts').orderByChild('t').once('value'),
      db.ref('online').once('value')
    ]);
    let todayCount=0,helpedTotal=0;
    const day=86400000,now=Date.now();
    postsSnap.forEach(c=>{
      const p=c.val();
      if (!p) return;
      // Count only main-feed posts (or legacy posts without a feed field)
      if ((p.feed || 'feed') !== 'feed') return;
      if(now-p.t<day) todayCount++;
      helpedTotal+=Object.keys(p.helpedBy||{}).length;
    });
    setText('hToday',todayCount);
    setText('hOnline',onlineSnap.numChildren());
    setText('hHelped',helpedTotal);
  } catch(e){}
}

// ── FEATURE 31: DISASTER PREDICTION / WEATHER INTEGRATION ─────────
async function checkWeatherAlerts(){
  try {
    const snap=await db.ref('posts').orderByChild('tag').equalTo('Flood').limitToLast(5).once('value');
    let floodCount=0;
    const now=Date.now(),hour=3600000;
    snap.forEach(c=>{ if(now-c.val().t<hour*6) floodCount++; });
    if(floodCount>=3 && !el('weatherAlertBanner')?.dataset.shown){
      const banner=document.createElement('div');
      banner.id='weatherAlertBanner';
      banner.dataset.shown='1';
      banner.className='weather-alert-banner';
      banner.innerHTML=`<i class="fas fa-cloud-rain"></i> <strong>Flood Risk Detected</strong> — ${floodCount} flood reports in the last 6 hours. Stay alert. <button onclick="this.parentElement.remove()" type="button"><i class="fas fa-times"></i></button>`;
      el('tab-home')?.insertBefore(banner,el('hero')||el('tab-home').firstElementChild);
    }
  } catch(e){}
}

// ── FEATURE 32: AI EMERGENCY PRIORITY DETECTION ───────────────────
const CRITICAL_KEYWORDS=['911','critical','dying','dead','unconscious','fire','explosion','trapped','rescue','drowning','suicidal','attack','shooting','stabbing','sos'];
function detectCriticalPost(text){
  const t=(text||'').toLowerCase();
  return CRITICAL_KEYWORDS.some(kw=>t.includes(kw));
}

// In buildCard, if post is critical, tag it
// Called from submitPost to auto-set urgency:
function autoSetUrgency(text){
  if(detectCriticalPost(text)){
    const highBtn=document.querySelector('.urg-btn[data-u="high"]');
    if(highBtn){ el('postUrgencyRow')?.querySelectorAll('.urg-btn').forEach(b=>b.classList.remove('active')); highBtn.classList.add('active'); postUrgency='high'; }
    const hint=el('aiUrgencyHint'); if(hint){ hint.textContent='AI detected critical keywords — urgency set to High'; hint.style.display='block'; }
  }
}

// ── FEATURE 35: EVACUATION CENTER MARKERS ON MAP ──────────────────
const EVACUATION_CENTERS=[
  {name:'Batasan Hills Elementary',lat:14.706,lng:121.095,type:'evacuation'},
  {name:'Commonwealth Elem School',lat:14.722,lng:121.075,type:'evacuation'},
  {name:'Payatas B Evacuation Center',lat:14.731,lng:121.103,type:'evacuation'},
  {name:'QC Sports Club Shelter',lat:14.651,lng:121.048,type:'evacuation'},
  {name:'Novaliches High School',lat:14.763,lng:121.009,type:'evacuation'},
];

function addEvacuationMarkers(map){
  if(!map||typeof L==='undefined') return;
  EVACUATION_CENTERS.forEach(ec=>{
    const icon=L.divIcon({html:`<div class="map-evacuation-marker"><i class="fas fa-house-damage"></i></div>`,className:'',iconSize:[32,32],iconAnchor:[16,16]});
    L.marker([ec.lat,ec.lng],{icon}).addTo(map)
      .bindPopup(`<strong>${ec.name}</strong><br/><span style="color:#2563eb;font-size:.8rem">Evacuation Center</span>`);
  });
}

// ── FEATURE 36: OFFLINE MODE ──────────────────────────────────────
function initOfflineMode(){
  window.addEventListener('online',()=>{
    isOnline=true;
    toast('Back online! Syncing...','ok');
    syncOfflineQueue();
    el('offlineBanner')?.remove();
  });
  window.addEventListener('offline',()=>{
    isOnline=false;
    if(!el('offlineBanner')){
      const b=document.createElement('div');
      b.id='offlineBanner';
      b.className='offline-banner';
      b.innerHTML='<i class="fas fa-wifi-slash"></i> You\'re offline — posts will sync when reconnected';
      document.body.appendChild(b);
    }
  });
}

async function syncOfflineQueue(){
  if(!offlineQueue.length) return;
  const queue=[...offlineQueue]; offlineQueue=[];
  for(const item of queue){
    try { await db.ref(item.path).set(item.data); }
    catch(e){ offlineQueue.push(item); }
  }
  if(offlineQueue.length===0) toast('All offline posts synced!','ok');
}

function queueOfflinePost(data){
  offlineQueue.push({path:'posts',data});
  toast('Saved offline — will post when reconnected','');
  // Store to localStorage
  try { localStorage.setItem('qch-offline-queue',JSON.stringify(offlineQueue)); }
  catch(e){}
}

// ── FEATURE 37: CRISIS MAP MODE ───────────────────────────────────
function toggleCrisisMapMode(map){
  if(!map||typeof L==='undefined') return;
  // Change tile layer to dark disaster-mode style
  const isDM=document.body.classList.contains('disaster-mode')||false;
  if(isDM){
    // Add crisis overlay markers for rescue points
    const rescuePoints=[
      {name:'DRRM Command Post',lat:14.657,lng:121.037,color:'#dc2626'},
      {name:'QC Rescue Hub',lat:14.672,lng:121.056,color:'#dc2626'},
      {name:'NDRRMC Station',lat:14.643,lng:121.022,color:'#9333ea'},
    ];
    rescuePoints.forEach(rp=>{
      const icon=L.divIcon({html:`<div class="map-rescue-marker" title="${rp.name}"><i class="fas fa-first-aid"></i></div>`,className:'',iconSize:[34,34],iconAnchor:[17,17]});
      L.marker([rp.lat,rp.lng],{icon}).addTo(map).bindPopup(`<strong>${rp.name}</strong><br/><span style="color:#dc2626;font-size:.8rem">Rescue Point</span>`);
    });
    addEvacuationMarkers(map);
  }
}

// ── FEATURE 38: AI POST SUMMARIZATION ────────────────────────────
function summarizePost(body){
  if(!body||body.length<100) return body;
  // Heuristic summarization — take first sentence + keywords
  const sentences=body.split(/[.!?]+/).filter(s=>s.trim().length>10);
  if(sentences.length<=2) return body;
  const firstTwo=sentences.slice(0,2).join('. ')+'.';
  return firstTwo.length<body.length?firstTwo+' <button class="see-more-btn" onclick="this.parentElement.innerHTML=\'' + body.replace(/'/g,'\\\'').replace(/\n/g,'<br/>').substring(0,500) + '\'" type="button">See more</button>':body;
}

// ── FEATURE 39: RESOURCE TRACKER STATS ───────────────────────────
async function loadResourceStats(){
  const container=el('resourceStatsWrap'); if(!container) return;
  try {
    const snap=await db.ref('supplies').once('value');
    const stats={food:0,water:0,medicine:0,shelter:0,other:0};
    snap.forEach(c=>{ const s=c.val(); stats[s.type]=(stats[s.type]||0)+1; });
    container.innerHTML=`<div class="res-stats-grid">
      <div class="res-stat"><i class="fas fa-utensils" style="color:#16a34a"></i><strong>${stats.food}</strong><span>Food</span></div>
      <div class="res-stat"><i class="fas fa-tint" style="color:#2563eb"></i><strong>${stats.water}</strong><span>Water</span></div>
      <div class="res-stat"><i class="fas fa-pills" style="color:#dc2626"></i><strong>${stats.medicine}</strong><span>Medicine</span></div>
      <div class="res-stat"><i class="fas fa-home" style="color:#d97706"></i><strong>${stats.shelter}</strong><span>Shelter</span></div>
    </div>`;
  } catch(e){}
}

// ── FEATURE 40: REGIONAL IMPACT DASHBOARD ENHANCEMENT ────────────
async function loadRegionalImpact(){
  const container=el('regionalImpactWrap'); if(!container) return;
  try {
    const snap=await db.ref('posts').once('value');
    const areaCounts={};
    let totalResolved=0,totalActive=0,totalVols=0;
    snap.forEach(c=>{
      const p=c.val();
      const area=p.location||p.authorBrgy||'Unknown';
      areaCounts[area]=(areaCounts[area]||0)+1;
      if(p.status==='resolved') totalResolved++;
      else totalActive++;
      totalVols+=Object.keys(p.volunteers||{}).length;
    });
    const topAreas=Object.entries(areaCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const maxCount=topAreas[0]?.[1]||1;
    container.innerHTML=`
      <div class="regional-header"><h3><i class="fas fa-map-marked-alt"></i> Most Affected Areas</h3></div>
      <div class="regional-bars">
        ${topAreas.map(([area,count])=>`
          <div class="regional-bar-item">
            <span class="regional-area">${esc(area)}</span>
            <div class="regional-bar-track"><div class="regional-bar-fill" style="width:${Math.round(count/maxCount*100)}%"></div></div>
            <span class="regional-count">${count}</span>
          </div>`).join('')}
      </div>
      <div class="regional-summary">
        <div class="rs-item"><i class="fas fa-exclamation-circle" style="color:#dc2626"></i><strong>${totalActive}</strong><small>Active</small></div>
        <div class="rs-item"><i class="fas fa-check-circle" style="color:#16a34a"></i><strong>${totalResolved}</strong><small>Resolved</small></div>
        <div class="rs-item"><i class="fas fa-users" style="color:#2563eb"></i><strong>${totalVols}</strong><small>Volunteers</small></div>
      </div>`;
  } catch(e){}
}

// ── PATCH buildCard — enhanced with all new features ──────────────
const _origBuildCard=buildCard;
function buildCard(p){
  // Add data attributes for distance
  const html=_origBuildCard(p);
  if(!html) return html;
  // Inject location data attr and distance span
  const locStr=esc(p.location||p.authorBrgy||'');
  // Patch data-location into article tag
  const patched=html.replace('<article class="pcard','<article class="pcard" data-location="'+locStr+'"');
  return patched;
}

// ── PATCH goTab — add new feature inits ───────────────────────────
const _origGoTab=goTab;
function goTab(tab){
  _origGoTab(tab);
  if(tab==='home'){
    setTimeout(()=>{
      injectDistances();
      addChatButtons();
      checkWeatherAlerts();
    },600);
  }
  if(tab==='nearby') loadNearbyPosts();
  if(tab==='impact'){ loadResourceStats(); loadRegionalImpact(); }
}

// ── INIT ALL NEW FEATURES ─────────────────────────────────────────
window.addEventListener('DOMContentLoaded', ()=>{
  getUserLocation();
  initSwipeGestures();
  initOfflineMode();
  initActivityNavigation();

  // Auto-tag hint for post textarea
  const pmTxt=el('pmTxt');
  if(pmTxt){
    pmTxt.addEventListener('input',()=>{
      autoTagPost(pmTxt);
      autoSetUrgency(pmTxt.value);
    });
  }

  // Patch feed renders to add chat buttons + distances
  const origFeedList=el('feedList');
  if(origFeedList){
    const obs2=new MutationObserver(()=>{
      setTimeout(()=>{ injectDistances(); addChatButtons(); },200);
    });
    obs2.observe(origFeedList,{childList:true,subtree:false});
  }

  // Update hero stats on load
  setTimeout(updateHeroStats,1500);
});

// Patch auth success to start realtime features
const _origOnLogin=typeof onLoginSuccess==='function'?onLoginSuccess:null;
// Hook into the existing Firebase auth state change
const _origAuthChange=auth.onAuthStateChanged.bind(auth);

