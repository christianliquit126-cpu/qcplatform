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
  uploadPreset: 'qcplatform_uploads',  // unsigned upload preset name
  avatarFolder: 'qcplatform/avatars',
  postFolder:   'qcplatform/posts',
};

// ╔══════════════════════════════════════════════╗
// ║  PASTE YOUR UID HERE after first login       ║
// ║  Firebase Console → Auth → Users → your UID ║
// ╚══════════════════════════════════════════════╝
const ADMIN_UIDS = ["PASTE_YOUR_UID_HERE"];

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

  // Bell click
  const bell = document.getElementById('tnBell');
  if (bell) bell.addEventListener('click', toggleNotifPanel);

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
      joined:Date.now(), badges:[], isAdmin:false, reputation:0
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
      joined:Date.now(), badges:[], isAdmin:false, reputation:0
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

  const sName = el('setName'); if(sName) sName.value = ME.name;
  const sBrgy = el('setBrgy'); if(sBrgy) sBrgy.value = ME.brgy;
  const sRole = el('setRole'); if(sRole) sRole.value = ME.role;
  setText('setEmail',   ME.email);
  setText('setVerified',auth.currentUser?.emailVerified?'Verified':'Not verified');
  setText('setJoined',  fmtDate(ME.joined));
  setHTML('setBadgeList', badgeHTML||'<span style="color:var(--soft);font-size:.8rem">No badges yet</span>');

  if (ME.isAdmin) el('adminNavBtn')?.classList.remove('hidden');
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
  formData.append('upload_preset', 'qcplatform');
  formData.append('folder', folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `https://api.cloudinary.com/v1_1/YOUR_CLOUD_NAME/image/upload`;
  
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
  // Single interval — updateStats already calls updateOnline inside
  setInterval(updateStats, 60000);
  listenNotifications();
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
  document.querySelectorAll('.tp').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.bb').forEach(b=>b.classList.remove('active'));
  activeTab = tab;
  el('tab-'+tab)?.classList.add('active');
  el('bb-'+tab)?.classList.add('active');

  if (tab==='activity')  { unread=0; updateBadge(); }
  if (tab==='account')   loadMyPosts();
  if (tab==='home')      { feedPage=0; allFeedPosts=[]; feedExhausted=false; attachFeedListener(); }
  if (tab==='lostfound') attachLFListener();
  if (tab==='report')    attachRPListener();
  if (tab==='mapview')   initMapView();
  if (tab==='admin')     loadAdminDashboard();
  if (tab==='saved')     loadSavedPosts();
  if (tab==='settings')  refreshUI();

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

  // ONE-TIME load — no continuous listener, no UI rebuilds on remote changes
  db.ref('posts')
    .orderByChild('feed').equalTo('feed')
    .once('value')
    .then(snap => {
      el('skeletons')?.classList.add('hidden');
      el('feedError')?.classList.add('hidden');
      allFeedPosts = [];
      snap.forEach(c => {
        const p = c.val();
        if (!p || !p.body) return;
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
      renderFeedPage();

      // After loading, attach a SILENT watcher that only shows a banner
      // when a genuinely new post arrives — never rebuilds the feed
      startFeedChangeWatcher();
    })
    .catch(() => {
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
      if (!p || !p.body || p.feed !== 'feed') return;
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
  db.ref('posts').orderByChild('feed').equalTo('lostfound').once('value')
    .then(snap=>{
      if(!list) return;
      list.innerHTML='';
      let posts=[]; snap.forEach(c=>posts.push({key:c.key,...c.val()}));
      posts.sort((a,b)=>b.t-a.t);
      if(empty) empty.classList.toggle('hidden', posts.length>0);
      if(posts.length===0) return;
      const frag=document.createDocumentFragment();
      posts.forEach(p=>{ const d=document.createElement('div'); d.innerHTML=buildCard(p); if(d.firstElementChild) frag.appendChild(d.firstElementChild); });
      list.appendChild(frag);
    })
    .catch(()=>toast('Failed to load Lost & Found posts','err'));
}

function attachRPListener(){
  if (rpListener){ db.ref('posts').off('value',rpListener); rpListener=null; }
  const list=el('reportList'), empty=el('reportEmpty');
  if(list) list.innerHTML='<div style="padding:18px;text-align:center;color:var(--muted);font-size:.85rem">Loading…</div>';
  db.ref('posts').orderByChild('feed').equalTo('report').once('value')
    .then(snap=>{
      if(!list) return;
      list.innerHTML='';
      let posts=[]; snap.forEach(c=>posts.push({key:c.key,...c.val()}));
      posts.sort((a,b)=>b.t-a.t);
      if(empty) empty.classList.toggle('hidden', posts.length>0);
      if(posts.length===0) return;
      const frag=document.createDocumentFragment();
      posts.forEach(p=>{ const d=document.createElement('div'); d.innerHTML=buildCard(p); if(d.firstElementChild) frag.appendChild(d.firstElementChild); });
      list.appendChild(frag);
    })
    .catch(()=>toast('Failed to load reports','err'));
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

  const safeKey  = esc(p.key||'');
  const safeUID  = esc(p.authorUID||'');
  const safeStatus=esc(p.status||'pending');
  const safeUrg  = esc(p.urgency||'medium');
  const safeBody = esc((p.body||'').replace(/'/g,'&#39;').substring(0,120));
  const safeLoc  = esc((p.location||'').replace(/'/g,'&#39;'));

  return `<article class="pcard" id="pc-${safeKey}" aria-label="Post by ${esc(p.authorName)}">
  <div class="pcard-top ${tc.a}" aria-hidden="true"></div>
  <div class="phead">
    <div class="pav" style="background:${p.authorAvatar?'#eee':col}" onclick="viewUser('${safeUID}')" role="button" tabindex="0" aria-label="View ${esc(p.authorName)}'s profile">${av}</div>
    <div class="pmeta">
      <div class="pauth-row">
        <span class="pauth" onclick="viewUser('${safeUID}')" role="button" tabindex="0">${esc(p.authorName)}</span>
        ${authorBadge}
        <span class="role-chip">${esc(ROLES[p.authorRole]||'Resident')}</span>
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
  postImgFile=null; postUrgency='medium';
  const pmTxt=el('pmTxt'), pmLoc=el('pmLoc');
  if(pmTxt) pmTxt.value='';
  if(pmLoc) pmLoc.value='';
  setText('pmCC','0');
  const prev=el('postImgPreview');
  if(prev){ prev.classList.add('hidden'); prev.innerHTML=''; }
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
    await db.ref('posts').push({
      body, tag:postTag, feed:postFeed,
      location: loc||ME.brgy,
      t:Date.now(),
      authorUID:ME.uid, authorName:sanitize(ME.name,60),
      authorBrgy:sanitize(ME.brgy,80), authorRole:ME.role,
      authorAvatar:ME.avatar||'',
      authorBadges:ME.badges||[], authorIsAdmin:ME.isAdmin||false,
      likes:{}, helpedBy:{}, commentCount:0, isSOS:false,
      status:'pending', urgency:postUrgency, imageUrl, volunteers:{}
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
  el('offerMO')?.classList.remove('hidden');
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
      name:sanitize(ME.name,60), offer:offerChoice, note, t:Date.now()
    });
    await db.ref('posts/'+offerPostKey+'/helpedBy/'+ME.uid).set(true);
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
  try {
    await db.ref('posts/'+commentKey+'/status').set(newStatus);
    const card=el('pc-'+commentKey);
    if(card){
      const statusMap={pending:{cls:'sb-pending',lbl:'⏳ Pending'},inprogress:{cls:'sb-inprogress',lbl:'In Progress'},resolved:{cls:'sb-resolved',lbl:'✅ Resolved'}};
      const st=statusMap[newStatus]; const sb=card.querySelector('.status-badge');
      if(sb){ sb.className='status-badge '+st.cls; sb.textContent=st.lbl; }
    }
    CACHE.invalidate('posts', commentKey);
    toast('Status updated!','ok');
    if(newStatus==='resolved') addActivityItem('resolve','Post resolved!',commentKey,Date.now());
  } catch(e){ toast('Failed to update status','err'); }
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
    panel.className='notif-panel notif-panel-enter';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label','Notifications');
    document.body.appendChild(panel);
  }
  renderNotifPanel();
  panel.classList.remove('hidden');
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
  const icons={comment:'<i class="fas fa-comment"></i>',offer:'<i class="fas fa-hands-helping"></i>',help:'<i class="fas fa-hand-holding-heart"></i>',resolve:'<i class="fas fa-check-circle"></i>',post:'<i class="fas fa-bullhorn"></i>'};
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
    }
  } catch(e){ content.innerHTML='<div class="error-state"><div class="es-icon">⚠️</div><h3>Failed to load</h3><button class="es-btn" onclick="adminTab(\''+section+'\')"><i class="fas fa-redo"></i> Retry</button></div>'; }
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
