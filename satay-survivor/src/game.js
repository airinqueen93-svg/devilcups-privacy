// SATAY SURVIVOR — Pasar Malam Semarang.
// A one-page canvas survival game: you are the last satay seller at the
// night market. Skewers fly on their own; you steer, dash, gather chili
// and pick a new power every level while the ghosts get hungrier.
//
// Everything lives in this file and runs fully offline. All run state is
// kept in a single object built by freshState(), so retrying a run can
// never inherit leftovers from the previous one.
'use strict';

/* ============================== DOM ============================== */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const el = (id) => document.getElementById(id);
const hudEl = el('hud');
const hudScore = el('hudScore'), hudTime = el('hudTime'), hudLevel = el('hudLevel');
const hudChili = el('hudChili'), hudKills = el('hudKills');
const hpFill = el('hpFill'), xpFill = el('xpFill');
const dashFill = el('dashFill'), dashState = el('dashState');
const comboBox = el('comboBox'), comboText = el('comboText'), comboFill = el('comboFill');
const bossBox = el('bossBox'), bossFill = el('bossFill');
const bannerEl = el('banner'), bannerText = el('bannerText');
const hurtFlash = el('hurtFlash');
const menuScreen = el('menuScreen'), levelScreen = el('levelScreen'), overScreen = el('overScreen');
const upgradeCards = el('upgradeCards');
const stickEl = el('stick'), stickNub = el('stickNub'), dashBtn = el('dashBtn');
/* ==================== SUARA SERAM (sintesis Web Audio) ==================== */
let AC = null, masterGain = null, echoSend = null, sndOn = true;
let droneNodes = null, lastLaugh = 0, lastWail = 0, ambientT = 16, heartT = 0;
function initAudio(){
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = AC.createGain(); masterGain.gain.value = .9; masterGain.connect(AC.destination);
    const delay = AC.createDelay(1); delay.delayTime.value = .27;
    const fb = AC.createGain(); fb.gain.value = .34;
    const wet = AC.createGain(); wet.gain.value = .5;
    echoSend = AC.createGain(); echoSend.gain.value = 1;
    echoSend.connect(delay); delay.connect(fb); fb.connect(delay);
    delay.connect(wet); wet.connect(masterGain);
  } catch (e) { AC = null; }
}
function sEnv(g, t, a, peak, d){
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, .0002), t + a);
  g.gain.exponentialRampToValueAtTime(.0001, t + a + d);
}
function sKuntiLaugh(vol){
  if (!AC || !sndOn) return;
  vol = vol || .3;
  const now = performance.now();
  if (now - lastLaugh < 2500) return; lastLaugh = now;
  const t0 = AC.currentTime + .02;
  const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.1;
  const out = AC.createGain(); out.gain.value = vol;
  bp.connect(out); out.connect(masterGain); out.connect(echoSend);
  for (let i = 0; i < 6; i++){
    const t = t0 + i * .19;
    const o = AC.createOscillator(); o.type = 'triangle';
    const f0 = 1180 - i * 65;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * .68, t + .15);
    const vib = AC.createOscillator(); vib.frequency.value = 32;
    const vibG = AC.createGain(); vibG.gain.value = 26;
    vib.connect(vibG); vibG.connect(o.frequency);
    const g = AC.createGain(); sEnv(g, t, .02, .5, .13);
    o.connect(g); g.connect(bp);
    o.start(t); o.stop(t + .2); vib.start(t); vib.stop(t + .2);
  }
}
function sKuntiSpawn(){ sKuntiLaugh(.15 + Math.random() * .1); }
function sScream(vol){
  if (!AC || !sndOn) return;
  vol = vol || .4;
  const t = AC.currentTime;
  const o = AC.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(1480, t + .45);
  o.frequency.setValueAtTime(1480, t + .62);
  o.frequency.exponentialRampToValueAtTime(230, t + 1.35);
  const vib = AC.createOscillator(); vib.frequency.value = 26;
  const vibG = AC.createGain(); vibG.gain.value = 40;
  vib.connect(vibG); vibG.connect(o.frequency);
  const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = .8;
  const g = AC.createGain();
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + .12);
  g.gain.setValueAtTime(vol, t + .7);
  g.gain.exponentialRampToValueAtTime(.0001, t + 1.4);
  o.connect(f); f.connect(g); g.connect(masterGain); g.connect(echoSend);
  o.start(t); o.stop(t + 1.45); vib.start(t); vib.stop(t + 1.45);
}
function sWail(){
  if (!AC || !sndOn) return;
  const now = performance.now();
  if (now - lastWail < 1200) return; lastWail = now;
  const t = AC.currentTime;
  const o = AC.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(880, t);
  o.frequency.exponentialRampToValueAtTime(290, t + .65);
  const vib = AC.createOscillator(); vib.frequency.value = 20;
  const vibG = AC.createGain(); vibG.gain.value = 22;
  vib.connect(vibG); vibG.connect(o.frequency);
  const g = AC.createGain(); sEnv(g, t, .03, .16, .6);
  o.connect(g); g.connect(masterGain); g.connect(echoSend);
  o.start(t); o.stop(t + .75); vib.start(t); vib.stop(t + .75);
}
function sWhisper(){
  if (!AC || !sndOn) return;
  const t = AC.currentTime;
  const len = Math.floor(AC.sampleRate * 1.6);
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = AC.createBufferSource(); src.buffer = buf;
  const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.4;
  f.frequency.setValueAtTime(750, t);
  f.frequency.exponentialRampToValueAtTime(2500, t + .7);
  f.frequency.exponentialRampToValueAtTime(620, t + 1.55);
  const g = AC.createGain();
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(.07, t + .5);
  g.gain.exponentialRampToValueAtTime(.0001, t + 1.6);
  src.connect(f); f.connect(g); g.connect(masterGain);
  src.start(t); src.stop(t + 1.65);
}
function startDrone(){
  if (!AC || droneNodes) return;
  const g = AC.createGain(); g.gain.value = .045; g.connect(masterGain);
  const o1 = AC.createOscillator(); o1.type = 'sine'; o1.frequency.value = 54;
  const o2 = AC.createOscillator(); o2.type = 'sine'; o2.frequency.value = 54.8;
  const o3 = AC.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 108.5;
  const g3 = AC.createGain(); g3.gain.value = .3;
  o1.connect(g); o2.connect(g); o3.connect(g3); g3.connect(g);
  const lfo = AC.createOscillator(); lfo.frequency.value = .07;
  const lfoG = AC.createGain(); lfoG.gain.value = .018;
  lfo.connect(lfoG); lfoG.connect(g.gain);
  o1.start(); o2.start(); o3.start(); lfo.start();
  droneNodes = { o1, o2, o3, lfo };
}
function stopDrone(){
  if (!droneNodes) return;
  try { droneNodes.o1.stop(); droneNodes.o2.stop(); droneNodes.o3.stop(); droneNodes.lfo.stop(); } catch (e) {}
  droneNodes = null;
}
function sHeartbeat(){
  if (!AC || !sndOn) return;
  const t = AC.currentTime;
  for (const off of [0, .3]){
    const o = AC.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(64, t + off);
    o.frequency.exponentialRampToValueAtTime(38, t + off + .14);
    const g = AC.createGain(); sEnv(g, t + off, .012, .5, .13);
    o.connect(g); g.connect(masterGain);
    o.start(t + off); o.stop(t + off + .2);
  }
}
const sndBtn = el('sndBtn');
if (sndBtn) sndBtn.addEventListener('click', () => {
  sndOn = !sndOn;
  if (masterGain) masterGain.gain.value = sndOn ? .9 : 0;
  sndBtn.textContent = sndOn ? '🔊' : '🔇';
});


/* ============================ Tuning ============================= */
const ENEMY_TYPES = {
  pocong:     { emoji: '🧟', hp: 30,  speed: 58,  radius: 20, font: 42, score: 100, dps: 11, unlock: 0 },
  kuntilanak: { emoji: '👻', hp: 46,  speed: 108, radius: 18, font: 38, score: 150, dps: 14, unlock: 40 },
  tuyul:      { emoji: '👶', hp: 18,  speed: 168, radius: 14, font: 30, score: 120, dps: 9,  unlock: 85 },
  boss:       { emoji: '👹', hp: 680, speed: 36,  radius: 46, font: 96, score: 500, dps: 22, unlock: Infinity },
};
const BOSS_EVERY = 60;          // seconds of survival between bosses
const DASH_CD = 2.4, DASH_TIME = 0.16, DASH_MULT = 3.4;
const COMBO_WINDOW = 2.5;

const UPGRADES = [
  { id: 'rapid', icon: '🔥', name: 'Sate Kilat',        desc: 'Tusuk sate beterbangan 45% lebih cepat.', apply: (s) => { s.fireInterval *= 0.62; } },
  { id: 'dmg',   icon: '🌶️', name: 'Super Pedas',       desc: 'Setiap tusukan +14 damage. Hati-hati, pedasnya nampol.', apply: (s) => { s.damage += 14; } },
  { id: 'speed', icon: '💨', name: 'Sandal Jepit Turbo', desc: 'Lari 22% lebih ngebut keliling pasar.', apply: (s) => { s.speed *= 1.22; } },
  { id: 'magnet',icon: '🧲', name: 'Kipas Magnet',       desc: 'Cabe ketarik dari jarak +85px lebih jauh.', apply: (s) => { s.magnetR += 85; } },
  { id: 'hp',    icon: '🍵', name: 'Teh Anget',          desc: '+40 HP maksimum dan langsung sembuh 40.', apply: (s) => { s.maxHp += 40; s.hp = Math.min(s.maxHp, s.hp + 40); } },
  { id: 'multi', icon: '🍢', name: 'Tusuk Ganda',        desc: '+1 tusuk sate setiap tembakan.', apply: (s) => { s.shots += 1; } },
];

/* ============================= State ============================= */
let W = 0, H = 0, DPR = 1, bgCanvas = null;
function freshState() {
  return {
    mode: 'menu',               // menu | playing | levelup | over
    t: 0,                       // survival time (s), only while playing
    wall: 0,                    // always-advancing clock for ambience
    player: { x: W / 2, y: H / 2, r: 20, face: 1 },
    hp: 100, maxHp: 100,
    speed: 205, damage: 18, fireInterval: 0.42, shots: 1, magnetR: 95,
    fireT: 0, spawnT: 0.8,
    enemies: [], bullets: [], pickups: [], parts: [], texts: [], ghosts: [],
    score: 0, kills: 0, chili: 0,
    xp: 0, level: 1, xpNext: 80,
    combo: 0, comboT: 0,
    dashCd: 0, dashT: 0, dashX: 1, dashY: 0,
    nextBossAt: BOSS_EVERY, boss: null, bossCount: 0, bossSummonT: 0,
    shake: 0, hurtT: 0, bannerT: 0,
    choices: [],
  };
}
let S = freshState();

/* ============================ Canvas ============================= */
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  if (S && S.mode === 'menu') { S.player.x = W / 2; S.player.y = H / 2; }
  paintBackground();
}
window.addEventListener('resize', resize);

/* ====================== Background painting ====================== */
function paintBackground() {
  bgCanvas = document.createElement('canvas');
  bgCanvas.width = Math.round(W * DPR);
  bgCanvas.height = Math.round(H * DPR);
  const b = bgCanvas.getContext('2d');
  b.setTransform(DPR, 0, 0, DPR, 0, 0);

  const sky = b.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#241145');
  sky.addColorStop(0.45, '#1a0d38');
  sky.addColorStop(1, '#100722');
  b.fillStyle = sky;
  b.fillRect(0, 0, W, H);

  // Ground speckle and plank seams.
  b.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 420; i++) {
    b.fillRect(Math.random() * W, 90 + Math.random() * (H - 90), 2.2, 2.2);
  }
  b.strokeStyle = 'rgba(0,0,0,0.16)';
  b.lineWidth = 2;
  for (let y = 120; y < H; y += 92) {
    b.beginPath(); b.moveTo(0, y); b.lineTo(W, y); b.stroke();
  }

  // Central market rug — concentric rings under the stall.
  b.save();
  b.translate(W / 2, H / 2 + 30);
  const rings = [['rgba(255,204,0,0.10)', 250], ['rgba(255,45,85,0.08)', 205], ['rgba(255,204,0,0.07)', 160]];
  for (const [color, r] of rings) {
    b.beginPath(); b.ellipse(0, 0, r * 1.35, r * 0.62, 0, 0, Math.PI * 2);
    b.strokeStyle = color; b.lineWidth = 10; b.stroke();
  }
  b.restore();

  // Stall row along the top of the market.
  const stallW = 168, gap = 26;
  const count = Math.max(3, Math.floor((W + gap) / (stallW + gap)));
  const startX = (W - (count * stallW + (count - 1) * gap)) / 2;
  for (let i = 0; i < count; i++) {
    const x = startX + i * (stallW + gap);
    drawStall(b, x, stallW, i);
  }

  // String lights sagging between the stalls.
  b.lineWidth = 1.6;
  for (let row = 0; row < 3; row++) {
    const yBase = 96 + row * 34;
    b.strokeStyle = 'rgba(0,0,0,0.45)';
    b.beginPath();
    b.moveTo(0, yBase);
    b.quadraticCurveTo(W / 2, yBase + 26, W, yBase);
    b.stroke();
    const bulbs = Math.floor(W / 46);
    const colors = ['#ffcc00', '#ff2d55', '#7ee0ff', '#00e676'];
    for (let i = 1; i < bulbs; i++) {
      const t = i / bulbs;
      const bx = t * W;
      const by = (1 - t) * (1 - t) * yBase + 2 * (1 - t) * t * (yBase + 26) + t * t * yBase + 4;
      b.save();
      b.shadowColor = colors[i % 4];
      b.shadowBlur = 9;
      b.fillStyle = colors[i % 4];
      b.beginPath(); b.arc(bx, by, 3.4, 0, Math.PI * 2); b.fill();
      b.restore();
    }
  }
}

function drawStall(b, x, w, i) {
  const top = 8, bodyH = 62;
  // Posts and counter.
  b.fillStyle = '#2c1a55';
  b.fillRect(x, top + 26, w, bodyH);
  b.fillStyle = '#3a2370';
  b.fillRect(x, top + 26 + bodyH - 14, w, 14);
  b.fillStyle = '#170b33';
  b.fillRect(x + 6, top + 26, 7, bodyH);
  b.fillRect(x + w - 13, top + 26, 7, bodyH);
  // Striped awning.
  const stripeW = w / 8;
  for (let sIdx = 0; sIdx < 8; sIdx++) {
    b.fillStyle = (sIdx + i) % 2 === 0 ? '#ff2d55' : '#fff3d6';
    b.beginPath();
    b.moveTo(x + sIdx * stripeW, top + 26);
    b.lineTo(x + (sIdx + 1) * stripeW, top + 26);
    b.lineTo(x + (sIdx + 1) * stripeW - 5, top + 4);
    b.lineTo(x + sIdx * stripeW - 5, top + 4);
    b.closePath(); b.fill();
  }
  // Hanging sign.
  b.fillStyle = '#170b33';
  b.fillRect(x + w / 2 - 34, top + 40, 68, 20);
  b.strokeStyle = '#ffcc00'; b.lineWidth = 1.6;
  b.strokeRect(x + w / 2 - 34, top + 40, 68, 20);
  b.fillStyle = '#ffcc00';
  b.font = '900 11px "Segoe UI", sans-serif';
  b.textAlign = 'center'; b.textBaseline = 'middle';
  b.fillText(['SATE', 'ES TEH', 'BAKSO', 'JAJANAN', 'KOPI', 'MIE AYAM'][i % 6], x + w / 2, top + 51);
  // Goods on the counter.
  b.font = '15px serif';
  const goods = ['🍢', '🍜', '🧆', '🍗', '🥟'];
  for (let gIdx = 0; gIdx < 4; gIdx++) {
    b.fillText(goods[(i + gIdx) % goods.length], x + 24 + gIdx * (w - 48) / 3, top + 26 + bodyH - 24);
  }
}

/* ============================= Input ============================= */
const keysDown = new Set();
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keysDown.add(e.code);
  if (e.code === 'Space') tryDash();
  if (e.code === 'Enter') {
    if (S.mode === 'menu') startGame();
    else if (S.mode === 'over') startGame();
  }
  if (S.mode === 'levelup' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
    chooseUpgrade(Number(e.code.slice(-1)) - 1);
  }
});
window.addEventListener('keyup', (e) => keysDown.delete(e.code));
window.addEventListener('blur', () => keysDown.clear());

// Virtual joystick for touch: drag anywhere (except buttons) to steer.
const stick = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || S.mode !== 'playing') return;
  if (e.target.closest('button') || e.target.closest('.card')) return;
  stick.active = true; stick.id = e.pointerId;
  stick.ox = e.clientX; stick.oy = e.clientY; stick.dx = 0; stick.dy = 0;
  stickEl.classList.remove('hidden');
  stickEl.style.left = e.clientX + 'px';
  stickEl.style.top = e.clientY + 'px';
  stickNub.style.transform = 'translate(-50%,-50%)';
});
window.addEventListener('pointermove', (e) => {
  if (!stick.active || e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
  const len = Math.hypot(dx, dy);
  const max = 46;
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  stick.dx = dx / max; stick.dy = dy / max;
  stickNub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
});
function endStick(e) {
  if (e.pointerId === stick.id) {
    stick.active = false; stick.dx = 0; stick.dy = 0;
    stickEl.classList.add('hidden');
  }
}
window.addEventListener('pointerup', endStick);
window.addEventListener('pointercancel', endStick);
dashBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); tryDash(); });
if (window.matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

function inputVector() {
  let x = 0, y = 0;
  if (keysDown.has('KeyA') || keysDown.has('ArrowLeft')) x -= 1;
  if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) x += 1;
  if (keysDown.has('KeyW') || keysDown.has('ArrowUp')) y -= 1;
  if (keysDown.has('KeyS') || keysDown.has('ArrowDown')) y += 1;
  if (x === 0 && y === 0 && stick.active) { x = stick.dx; y = stick.dy; }
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return { x, y, moving: len > 0.12 };
}

/* =========================== Game flow =========================== */
function startGame() {
  S = freshState();
  S.mode = 'playing';
  menuScreen.classList.add('hidden');
  overScreen.classList.add('hidden');
  levelScreen.classList.add('hidden');
  hudEl.classList.remove('hidden');
  if (document.body.classList.contains('touch')) dashBtn.classList.remove('hidden');
  showBanner('BERTAHANLAH! 🍢', 1.6);
  initAudio(); startDrone(); ambientT = 14;
}

function doGameOver() {
  S.mode = 'over';
  stopDrone(); sScream(.5); setTimeout(() => { lastLaugh = 0; sKuntiLaugh(.5); }, 650);
  S.hp = 0;
  shake(14);
  burst(S.player.x, S.player.y, '#ff2d55', 26, 260);
  el('overText').textContent =
    `Kamu bertahan ${fmtTime(S.t)}, membunuh ${S.kills} hantu, dan mengumpulkan ${S.chili} cabe. ` +
    `Lapakmu memang tutup malam ini — tapi legenda sate tidak pernah mati!`;
  el('finalScore').textContent = `SKOR AKHIR: ${S.score}`;
  hudEl.classList.add('hidden');
  bossBox.classList.add('hidden');
  dashBtn.classList.add('hidden');
  overScreen.classList.remove('hidden');
  if (window.SatayAds) window.SatayAds.onGameOver();
}

function showBanner(text, seconds) {
  bannerText.textContent = text;
  bannerEl.classList.remove('hidden');
  S.bannerT = seconds;
}

function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

el('playBtn').addEventListener('click', startGame);
el('retryBtn').addEventListener('click', startGame);

/* ============================= Dash ============================== */
function tryDash() {
  if (S.mode !== 'playing' || S.dashCd > 0) return;
  const v = inputVector();
  let dx = v.x, dy = v.y;
  if (!v.moving) { dx = S.player.face; dy = 0; }
  const len = Math.hypot(dx, dy) || 1;
  S.dashX = dx / len; S.dashY = dy / len;
  S.dashT = DASH_TIME;
  S.dashCd = DASH_CD;
}

/* =========================== Spawning ============================ */
function spawnPoint() {
  // Just outside a random edge of the arena.
  const side = Math.floor(Math.random() * 4);
  if (side === 0) return { x: -36, y: Math.random() * H };
  if (side === 1) return { x: W + 36, y: Math.random() * H };
  if (side === 2) return { x: Math.random() * W, y: -36 };
  return { x: Math.random() * W, y: H + 36 };
}

function spawnEnemy(type) {
  const base = ENEMY_TYPES[type];
  const hpScale = 1 + Math.min(1.1, S.t / 300);
  const p = spawnPoint();
  const e = {
    type, x: p.x, y: p.y,
    hp: Math.round(base.hp * hpScale), maxHp: Math.round(base.hp * hpScale),
    speed: base.speed * (0.92 + Math.random() * 0.16),
    r: base.radius, phase: Math.random() * Math.PI * 2,
    hopT: Math.random() * 0.4, flash: 0,
  };
  S.enemies.push(e);
  if (type === 'kuntilanak') sKuntiSpawn();
  return e;
}

function pickSpawnType() {
  const r = Math.random();
  if (S.t >= ENEMY_TYPES.tuyul.unlock && r < 0.16) return 'tuyul';
  if (S.t >= ENEMY_TYPES.kuntilanak.unlock && r < 0.44) return 'kuntilanak';
  return 'pocong';
}

function spawnBoss() {
  S.bossCount += 1;
  const boss = spawnEnemy('boss');
  boss.hp = boss.maxHp = Math.round(ENEMY_TYPES.boss.hp * (1 + (S.bossCount - 1) * 0.4));
  boss.x = W / 2; boss.y = -50;
  S.boss = boss;
  S.bossSummonT = 5;
  bossBox.classList.remove('hidden');
  showBanner('👹 BOSS DATANG! 👹', 2.2);
  sScream(.38); setTimeout(() => { lastLaugh = 0; sKuntiLaugh(.5); }, 550);
  shake(7);
}

/* =========================== Particles =========================== */
function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (0.3 + Math.random() * 0.7) * speed;
    S.parts.push({
      kind: 'spark', x, y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: 0, ttl: 0.35 + Math.random() * 0.3,
      size: 2 + Math.random() * 3.5, color,
    });
  }
}
function floatText(x, y, text, color) {
  S.texts.push({ x, y, text, color: color || '#ffcc00', life: 0, ttl: 0.9 });
}
function shake(n) { S.shake = Math.max(S.shake, n); }

/* ============================ Combat ============================= */
function nearestEnemy() {
  let best = null, bestD = Infinity;
  for (const e of S.enemies) {
    const d = (e.x - S.player.x) ** 2 + (e.y - S.player.y) ** 2;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function fireSkewers() {
  const target = nearestEnemy();
  if (!target) return;
  const baseAng = Math.atan2(target.y - S.player.y, target.x - S.player.x);
  for (let i = 0; i < S.shots; i++) {
    const ang = baseAng + (i - (S.shots - 1) / 2) * 0.17;
    S.bullets.push({
      x: S.player.x, y: S.player.y,
      vx: Math.cos(ang) * 470, vy: Math.sin(ang) * 470,
      ang, life: 1.5,
    });
  }
}

function killEnemy(e) {
  S.kills += 1;
  if (e.type === 'kuntilanak') sWail();
  else if (e.type === 'boss') sScream(.3);
  S.combo += 1;
  S.comboT = COMBO_WINDOW;
  const base = ENEMY_TYPES[e.type].score;
  const bonus = S.combo >= 3 ? Math.min(S.combo, 24) * 5 : 0;
  S.score += base + bonus;
  floatText(e.x, e.y - e.r, `+${base + bonus}`, e.type === 'boss' ? '#ff2d55' : '#ffcc00');
  burst(e.x, e.y, e.type === 'boss' ? '#ff2d55' : '#ffd54d', e.type === 'boss' ? 34 : 10, e.type === 'boss' ? 300 : 190);
  if (S.combo >= 3) {
    comboBox.classList.remove('pulse');
    void comboBox.offsetWidth; // restart the pulse animation
    comboBox.classList.add('pulse');
  }
  const drops = e.type === 'boss' ? 12 : 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < drops; i++) {
    const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 90;
    S.pickups.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, bob: Math.random() * 6 });
  }
  if (e.type === 'boss') {
    S.boss = null;
    bossBox.classList.add('hidden');
    S.chili += 10;
    shake(13);
    showBanner('BOSS TUMBANG! 🎉', 1.8);
  }
}

function gainXp(n) {
  S.xp += n;
  if (S.xp >= S.xpNext && S.mode === 'playing') {
    S.xp -= S.xpNext;
    S.level += 1;
    S.xpNext = S.level * 80;
    openLevelUp();
  }
}

function openLevelUp() {
  S.mode = 'levelup';
  const pool = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
  S.choices = pool;
  upgradeCards.innerHTML = '';
  pool.forEach((u, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      `<div class="cardIcon">${u.icon}</div><b>${u.name}</b><small>${u.desc}</small>` +
      `<span class="pickTag">PILIH → ${i + 1}</span>`;
    card.addEventListener('click', () => chooseUpgrade(i));
    upgradeCards.appendChild(card);
  });
  levelScreen.classList.remove('hidden');
}

function chooseUpgrade(i) {
  if (S.mode !== 'levelup' || !S.choices[i]) return;
  S.choices[i].apply(S);
  S.choices = [];
  levelScreen.classList.add('hidden');
  S.mode = 'playing';
  floatText(S.player.x, S.player.y - 44, 'LEVEL ' + S.level + '!', '#00e676');
}

/* ============================ Update ============================= */
function update(dt) {
  S.t += dt;
  // suara seram: tawa kunti & bisikan acak; detak jantung saat HP kritis
  if (S.mode === 'playing' && AC && sndOn) {
    ambientT -= dt;
    if (ambientT <= 0) {
      ambientT = 16 + Math.random() * 22;
      if (Math.random() < 0.55) { lastLaugh = 0; sKuntiLaugh(.1 + Math.random() * .08); }
      else sWhisper();
    }
    if (S.hp < S.maxHp * 0.3) { heartT -= dt; if (heartT <= 0) { heartT = .95; sHeartbeat(); } }
  }
  const p = S.player;
  const v = inputVector();

  // --- movement & dash ---
  if (S.dashT > 0) {
    S.dashT -= dt;
    p.x += S.dashX * S.speed * DASH_MULT * dt;
    p.y += S.dashY * S.speed * DASH_MULT * dt;
    S.ghosts.push({ x: p.x, y: p.y, face: p.face, life: 0, ttl: 0.28 });
  } else if (v.moving) {
    p.x += v.x * S.speed * dt;
    p.y += v.y * S.speed * dt;
    if (Math.abs(v.x) > 0.1) p.face = v.x > 0 ? 1 : -1;
  }
  if (S.dashCd > 0) S.dashCd -= dt;
  p.x = Math.max(p.r, Math.min(W - p.r, p.x));
  p.y = Math.max(p.r, Math.min(H - p.r, p.y));

  // --- spawning & boss timer ---
  S.spawnT -= dt;
  const interval = Math.max(0.34, 1.12 - S.t * 0.0075);
  if (S.spawnT <= 0 && S.enemies.length < 70) {
    S.spawnT = interval;
    spawnEnemy(pickSpawnType());
  }
  if (S.t >= S.nextBossAt) {
    S.nextBossAt += BOSS_EVERY;
    if (!S.boss) spawnBoss();
  }
  if (S.boss) {
    S.bossSummonT -= dt;
    if (S.bossSummonT <= 0) {
      S.bossSummonT = 6;
      if (S.enemies.length < 70) { spawnEnemy('pocong'); spawnEnemy('pocong'); }
    }
  }

  // --- auto-fire ---
  S.fireT -= dt;
  if (S.fireT <= 0) {
    S.fireT = S.fireInterval;
    fireSkewers();
  }
  for (const b of S.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
  S.bullets = S.bullets.filter((b) => b.life > 0 && b.x > -60 && b.x < W + 60 && b.y > -60 && b.y < H + 60);

  // --- enemies ---
  let touching = false;
  for (const e of S.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    if (e.type === 'pocong') {
      // Pocong advance in hops: a pause, then a bound toward the player.
      e.hopT += dt;
      const phase = e.hopT % 0.72;
      if (phase < 0.3) { e.x += ux * e.speed * 2.05 * dt; e.y += uy * e.speed * 2.05 * dt; }
    } else if (e.type === 'kuntilanak') {
      const sway = Math.sin(S.wall * 3.1 + e.phase) * 52;
      e.x += (ux * e.speed - uy * sway) * dt;
      e.y += (uy * e.speed + ux * sway) * dt;
    } else if (e.type === 'tuyul') {
      const zig = Math.sin(S.wall * 9 + e.phase) * 74;
      e.x += (ux * e.speed - uy * zig) * dt;
      e.y += (uy * e.speed + ux * zig) * dt;
    } else { // boss walks straight and heavy
      e.x += ux * e.speed * dt;
      e.y += uy * e.speed * dt;
    }
    if (e.flash > 0) e.flash -= dt;
    if (d < e.r + p.r) {
      touching = true;
      S.hp -= ENEMY_TYPES[e.type].dps * dt;   // per-second, frame-rate independent
    }
  }
  if (touching) {
    if (S.hurtT <= 0) { shake(4); S.hurtT = 0.35; }
    hurtFlash.classList.add('on');
  } else {
    hurtFlash.classList.remove('on');
  }
  if (S.hurtT > 0) S.hurtT -= dt;
  if (S.hp <= 0) { doGameOver(); return; }

  // --- bullet hits ---
  for (const b of S.bullets) {
    for (const e of S.enemies) {
      if (e.hp <= 0) continue;
      if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + 7) {
        e.hp -= S.damage;
        e.flash = 0.09;
        b.life = 0;
        burst(b.x, b.y, '#ffe082', 3, 130);
        break;
      }
    }
  }
  S.enemies = S.enemies.filter((e) => {
    if (e.hp <= 0) { killEnemy(e); return false; }
    return true;
  });

  // --- pickups (chili = XP) ---
  for (const pk of S.pickups) {
    pk.x += pk.vx * dt; pk.y += pk.vy * dt;
    pk.vx *= 0.86; pk.vy *= 0.86;
    const dx = p.x - pk.x, dy = p.y - pk.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < S.magnetR) { pk.x += (dx / d) * 330 * dt; pk.y += (dy / d) * 330 * dt; }
    if (d < p.r + 12) {
      pk.dead = true;
      S.chili += 1;
      S.score += 15;
      gainXp(12);
      if (S.mode !== 'playing') return; // level-up opened mid-pickup
    }
  }
  S.pickups = S.pickups.filter((pk) => !pk.dead);

  // --- combo decay ---
  if (S.comboT > 0) { S.comboT -= dt; if (S.comboT <= 0) S.combo = 0; }

  // --- banner ---
  if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) bannerEl.classList.add('hidden'); }

  updateFx(dt);
}

function updateFx(dt) {
  for (const pt of S.parts) {
    pt.life += dt;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= 0.9; pt.vy *= 0.9;
  }
  S.parts = S.parts.filter((pt) => pt.life < pt.ttl);
  for (const t of S.texts) { t.life += dt; t.y -= 44 * dt; }
  S.texts = S.texts.filter((t) => t.life < t.ttl);
  for (const g of S.ghosts) g.life += dt;
  S.ghosts = S.ghosts.filter((g) => g.life < g.ttl);
  S.shake *= Math.pow(0.001, dt); // fast decay
  if (S.shake < 0.1) S.shake = 0;
}

/* ============================ Render ============================= */
const LANTERNS = [0.12, 0.3, 0.5, 0.7, 0.88];
function drawLanterns() {
  for (let i = 0; i < LANTERNS.length; i++) {
    const x = LANTERNS[i] * W + Math.sin(S.wall * 1.25 + i * 1.7) * 7;
    const len = 44 + (i % 3) * 16;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(LANTERNS[i] * W, 0); ctx.lineTo(x, len); ctx.stroke();
    const glow = ctx.createRadialGradient(x, len + 16, 2, x, len + 16, 44);
    glow.addColorStop(0, 'rgba(255,170,60,0.5)');
    glow.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 44, len - 28, 88, 88);
    ctx.fillStyle = '#d81b3a';
    roundRect(x - 11, len, 22, 32, 8); ctx.fill();
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(x - 11, len + 4, 22, 4);
    ctx.fillRect(x - 11, len + 24, 22, 4);
    ctx.fillRect(x - 3, len - 4, 6, 4);
    ctx.fillRect(x - 3, len + 32, 6, 4);
  }
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (S.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
  }
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
  drawLanterns();

  if (S.mode === 'menu') {
    // A few ghosts drift through the empty market behind the title.
    ctx.font = '44px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const drifters = ['👻', '🧟', '👻', '👶', '🧟'];
    for (let i = 0; i < drifters.length; i++) {
      const gx = ((S.wall * (14 + i * 5) + i * 290) % (W + 120)) - 60;
      const gy = H * 0.68 + Math.sin(S.wall * 1.4 + i * 2.1) * 22 + i * 12;
      ctx.globalAlpha = 0.5;
      ctx.fillText(drifters[i], gx, gy);
    }
    ctx.globalAlpha = 1;
    return;
  }

  // Pickups.
  ctx.font = '20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const pk of S.pickups) {
    ctx.fillText('🌶️', pk.x, pk.y + Math.sin(S.wall * 5 + pk.bob) * 3);
  }

  // Dash ghosts.
  for (const g of S.ghosts) {
    ctx.save();
    ctx.globalAlpha = 0.35 * (1 - g.life / g.ttl);
    ctx.translate(g.x, g.y);
    ctx.scale(g.face, 1);
    ctx.font = '44px serif';
    ctx.fillText('🧑‍🍳', 0, 2);
    ctx.restore();
  }

  // Enemies.
  for (const e of S.enemies) {
    const def = ENEMY_TYPES[e.type];
    let bob = 0;
    if (e.type === 'pocong') bob = -Math.abs(Math.sin(e.hopT * (Math.PI / 0.72))) * 7;
    if (e.type === 'kuntilanak') bob = Math.sin(S.wall * 4 + e.phase) * 4;
    if (e.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.font = `${def.font}px serif`;
    ctx.fillText(def.emoji, e.x, e.y + bob);
    if (e.hp < e.maxHp && e.type !== 'boss') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - 19, e.y - e.r - 13, 38, 5.5);
      ctx.fillStyle = '#ff2d55';
      ctx.fillRect(e.x - 19, e.y - e.r - 13, 38 * Math.max(0, e.hp / e.maxHp), 5.5);
    }
  }

  // Bullets.
  for (const b of S.bullets) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.ang);
    ctx.font = '18px serif';
    ctx.fillText('🍢', 0, 0);
    ctx.restore();
  }

  // Player.
  const p = S.player;
  if (S.hurtT > 0.12) {
    ctx.fillStyle = 'rgba(255,45,85,0.3)';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 10, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.face, 1);
  ctx.font = '44px serif';
  ctx.fillText('🧑‍🍳', 0, 2);
  ctx.restore();

  // Particles & floating texts.
  for (const pt of S.parts) {
    ctx.globalAlpha = 1 - pt.life / pt.ttl;
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  ctx.font = '800 15px "Segoe UI", sans-serif';
  for (const t of S.texts) {
    ctx.globalAlpha = 1 - t.life / t.ttl;
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

/* ============================== HUD ============================== */
function renderHud() {
  hudScore.textContent = S.score;
  hudTime.textContent = fmtTime(S.t);
  hudLevel.textContent = S.level;
  hudChili.textContent = S.chili;
  hudKills.textContent = S.kills;
  hpFill.style.width = Math.max(0, (S.hp / S.maxHp) * 100) + '%';
  xpFill.style.width = Math.min(100, (S.xp / S.xpNext) * 100) + '%';
  const dashReady = S.dashCd <= 0;
  dashFill.style.width = (dashReady ? 100 : (1 - S.dashCd / DASH_CD) * 100) + '%';
  dashState.textContent = dashReady ? 'SIAP' : '...';
  if (S.combo >= 2) {
    comboBox.classList.remove('hidden');
    comboText.textContent = `🔥 COMBO ×${S.combo}`;
    comboFill.style.width = (S.comboT / COMBO_WINDOW) * 100 + '%';
  } else {
    comboBox.classList.add('hidden');
  }
  if (S.boss) bossFill.style.width = Math.max(0, (S.boss.hp / S.boss.maxHp) * 100) + '%';
  hurtFlash.classList.toggle('lowhp', S.mode === 'playing' && S.hp / S.maxHp < 0.3);
}

/* =========================== Main loop =========================== */
let lastNow = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastNow) / 1000;
  lastNow = now;
  if (dt > 0.05) dt = 0.05; // tab-switch guard
  S.wall += dt;
  if (S.mode === 'playing') update(dt);
  else updateFx(dt);
  render();
  if (S.mode === 'playing' || S.mode === 'levelup') renderHud();
}
resize();
requestAnimationFrame(frame);

/* ====================== Test / debug hook ======================== */
// Used by the scripted Chromium play-test (tools/playtest.mjs) to stage
// scenes deterministically; harmless in normal play.
window.__satay = {
  start: () => startGame(),
  snapshot: () => ({
    mode: S.mode, score: S.score, kills: S.kills, chili: S.chili,
    level: S.level, hp: Math.round(S.hp), maxHp: S.maxHp,
    enemies: S.enemies.length, bossActive: !!S.boss,
    player: { x: Math.round(S.player.x), y: Math.round(S.player.y) },
    damage: S.damage, shots: S.shots, fireInterval: S.fireInterval,
    speed: Math.round(S.speed), magnetR: S.magnetR,
  }),
  nearest: () => {
    const e = nearestEnemy();
    return e ? { x: Math.round(e.x), y: Math.round(e.y), type: e.type } : null;
  },
  addXp: (n) => gainXp(n),
  spawnBoss: () => { if (!S.boss) spawnBoss(); },
  setHp: (n) => { S.hp = n; if (n <= 0 && S.mode === 'playing') doGameOver(); },
};
