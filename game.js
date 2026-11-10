'use strict';
/* =====================================================================
   BOOM BROTHERS: ATOMIC LIBERTY
   A run-and-gun, blow-everything-up side scroller starring Noah & Elijah.
   No build step: just open index.html in a browser.
   ===================================================================== */

// ====== EASY-TO-EDIT SETTINGS (put your real family names here!) ======
const FAMILY = ['MOM', 'GRANDPA', 'GRANDMA', 'AUNT ALLISON', 'UNCLE AARON', 'UNCLE ANTHONY', 'MOM', 'GRANDPA'];
const START_LIVES = 5;
// ======================================================================

(() => {
const TILE = 16, VW = 480, VH = 272, SCALE = 3;
const GRAV = 900, RUN = 115, JUMP = 330, CLIMB = 120, MAXFALL = 420;
const FONT = '"Press Start 2P", "Courier New", monospace';

const canvas = document.getElementById('game');
canvas.width = VW * SCALE; canvas.height = VH * SCALE;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
function fitCanvas() {
  const s = Math.min(innerWidth / VW, innerHeight / VH);
  canvas.style.width = Math.floor(VW * s) + 'px';
  canvas.style.height = Math.floor(VH * s) + 'px';
}
addEventListener('resize', fitCanvas); fitCanvas();

// ---------------------------------------------------------------- utils
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pick = a => a[Math.floor(Math.random() * a.length)];
const sign = v => v < 0 ? -1 : 1;
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const easeOut = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- input
const keys = Object.create(null);
const latched = new Set(); // keys pressed since the last update step (catches super-quick taps)
const typed = [];          // every key press in order (for typing room codes)
const down = c => keys[c] || latched.has(c);
addEventListener('keydown', e => {
  keys[e.code] = true; latched.add(e.code); if (!e.repeat) typed.push(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  initAudio();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

const BINDS = {
  solo: { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp', 'Space'], down: ['KeyS', 'ArrowDown'],
          fire: ['KeyQ', 'KeyF', 'KeyJ', 'KeyZ'], special: ['KeyE', 'KeyG', 'KeyK', 'KeyX'], swap: ['KeyR', 'KeyC'] },
  p1:   { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], fire: ['KeyQ', 'KeyF'], special: ['KeyE', 'KeyG'], swap: [] },
  p2:   { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], fire: ['KeyK', 'Numpad1'], special: ['KeyL', 'Numpad2'], swap: [] },
};
const ACTIONS = ['left', 'right', 'up', 'down', 'fire', 'special', 'swap'];

function gamepads() {
  const out = [];
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected) out.push(p);
  return out;
}
function padState(p) {
  const b = n => !!(p.buttons[n] && p.buttons[n].pressed);
  const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
  return { left: b(14) || ax < -0.4, right: b(15) || ax > 0.4, up: b(0) || b(12), down: b(13) || ay > 0.6,
           fire: b(2) || b(5) || b(7), special: b(1) || b(3) || b(4) || b(6), swap: b(8), start: b(9) };
}

// touch controls (shown automatically on phones / tablets)
const touch = { used: false, left: false, right: false, up: false, down: false, fire: false, special: false, swap: false };
let touchTap = null;
const TBTN = [
  { k: 'left', x: 36, y: 232, r: 24 }, { k: 'right', x: 92, y: 232, r: 24 },
  { k: 'up', x: 446, y: 228, r: 25 }, { k: 'fire', x: 392, y: 240, r: 22 },
  { k: 'special', x: 400, y: 188, r: 17 }, { k: 'swap', x: 452, y: 176, r: 13 },
];
function toLogical(t) {
  const r = canvas.getBoundingClientRect();
  return { x: (t.clientX - r.left) / r.width * VW, y: (t.clientY - r.top) / r.height * VH };
}
function handleTouches(e) {
  e.preventDefault();
  touch.used = true; initAudio();
  for (const b of TBTN) touch[b.k] = false;
  for (const t of e.touches) {
    const p = toLogical(t);
    for (const b of TBTN) if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 8) touch[b.k] = true;
  }
}
canvas.addEventListener('touchstart', e => {
  handleTouches(e);
  if (state !== 'play' || paused) touchTap = toLogical(e.changedTouches[0]);
}, { passive: false });
canvas.addEventListener('touchmove', handleTouches, { passive: false });
canvas.addEventListener('touchend', handleTouches, { passive: false });
canvas.addEventListener('touchcancel', handleTouches, { passive: false });
canvas.addEventListener('mousedown', e => { initAudio(); if (state !== 'play') touchTap = toLogical(e); });

// Up to 4 players. Each one is driven by a "device": the left half of the keyboard,
// the right half of the keyboard, a gamepad, or the touch screen.
const MAX_PLAYERS = 4;
const PCOL = ['#6fb6ff', '#f4d03f', '#5ee07a', '#ff6b6b'];
const JOIN_KEYS = { kbL: ['KeyQ', 'KeyF', 'KeyZ', 'KeyJ', 'Space'], kbR: ['KeyK', 'KeyL', 'Numpad1'] };
let party = []; // [{ dev, hero }] chosen on the join screen
function padById(i) { const ps = navigator.getGamepads ? navigator.getGamepads() : []; const p = ps[i]; return p && p.connected ? p : null; }
function devState(dev) {
  const st = {};
  if (dev === 'kbL' || dev === 'kbR') {
    const bind = dev === 'kbL' ? BINDS.p1 : BINDS.p2;
    for (const k of ACTIONS) st[k] = bind[k].some(down);
    st.join = JOIN_KEYS[dev].some(down); st.start = down('Enter');
  } else if (dev === 'touch') {
    for (const k of ACTIONS) st[k] = touch[k];
  } else if (dev.startsWith('pad:')) {
    const p = padById(+dev.slice(4));
    if (p) { Object.assign(st, padState(p)); st.join = st.fire || st.up || st.start; }
  } else if (dev.startsWith('net:')) { // a device on another screen (network game)
    const [, peer, ...rest] = dev.split(':'), d = rest.join(':');
    const now = NET.remoteIn[peer] || {}, lat = NET.remoteLatch[peer] || {};
    return fromMask((now[d] || 0) | (lat[d] || 0));
  }
  return st;
}
function getInput(pi) {
  if (players.length === 1 && party[0] && !party[0].dev.startsWith('net:')) { // a lone player can use any keys, any gamepad, or touch
    const st = {};
    for (const k of ACTIONS) st[k] = BINDS.solo[k].some(down);
    for (const p of gamepads()) { const ps = padState(p); for (const k of ACTIONS) st[k] = st[k] || ps[k]; }
    if (touch.used) for (const k of ACTIONS) st[k] = st[k] || touch[k];
    return st;
  }
  return party[pi] ? devState(party[pi].dev) : {};
}

let prevMenu = {};
function menuInput() {
  const any = codes => codes.some(down);
  const cur = {
    up: any(['ArrowUp', 'KeyW']), down: any(['ArrowDown', 'KeyS']), left: any(['ArrowLeft', 'KeyA']), right: any(['ArrowRight', 'KeyD']),
    confirm: any(['Enter', 'Space', 'KeyQ', 'KeyF', 'KeyJ', 'KeyZ', 'KeyK']), pause: any(['KeyP', 'Escape']), mute: any(['KeyM']),
  };
  for (const p of gamepads()) {
    const s = padState(p);
    cur.up = cur.up || s.up; cur.down = cur.down || s.down; cur.left = cur.left || s.left; cur.right = cur.right || s.right;
    cur.confirm = cur.confirm || (p.buttons[0] && p.buttons[0].pressed) || s.start;
    cur.pause = cur.pause || s.start;
  }
  const out = {};
  for (const k in cur) out[k] = cur[k] && !prevMenu[k];
  prevMenu = cur;
  out.tap = touchTap; touchTap = null;
  if (out.tap) out.confirm = true;
  return out;
}

// ---------------------------------------------------------------- audio
let actx = null, master = null, sfxGain = null, musicGain = null, noiseBuf = null, muted = false;
function initAudio() {
  if (musicEl && musicEl.paused) musicEl.play().catch(() => {});
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = actx.createGain(); master.gain.value = 0.6; master.connect(actx.destination);
  sfxGain = actx.createGain(); sfxGain.gain.value = 0.8; sfxGain.connect(master);
  musicGain = actx.createGain(); musicGain.gain.value = 0.5; musicGain.connect(master);
  const len = actx.sampleRate * 2;
  noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  if (pendingMusic) startMusic(pendingMusic === 'fast');
}
function noteAt(f, t, dur, type, vol, dest, slide) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
function noiseAt(t, dur, vol, freq, dest) {
  const s = actx.createBufferSource(); s.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.15), t + dur);
  const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(f, dur, o = {}) { if (!actx || muted) return; noteAt(f, actx.currentTime + (o.delay || 0), dur, o.type || 'square', o.vol || 0.1, sfxGain, o.slide); }
function noise(dur, o = {}) { if (!actx || muted) return; noiseAt(actx.currentTime + (o.delay || 0), dur, o.vol || 0.2, o.freq || 2000, sfxGain); }
let lastBoom = 0, lastShotSfx = 0;
const N = { C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B4: 493.9, C5: 523.3, G3: 196, A3: 220, B3: 246.9 };
const SFX = {
  rocket() { tone(500, 0.1, { vol: 0.05, slide: -300 }); noise(0.08, { vol: 0.08, freq: 3000 }); },
  laser() { const n = performance.now(); if (n - lastShotSfx < 60) return; lastShotSfx = n; tone(1400, 0.08, { type: 'sawtooth', vol: 0.035, slide: -1000 }); },
  enemyShot() { tone(320, 0.12, { vol: 0.04, slide: -160 }); },
  boom(size = 1) {
    const n = performance.now(); if (n - lastBoom < 45) return; lastBoom = n;
    noise(0.35 + 0.35 * size, { vol: Math.min(0.45, 0.22 * size + 0.12), freq: 900 + 400 * size });
    tone(110, 0.3 + 0.2 * size, { type: 'sine', vol: 0.25, slide: -70 });
  },
  nuke() { noise(2.6, { vol: 0.7, freq: 700 }); tone(70, 2.2, { type: 'sine', vol: 0.5, slide: -45 }); tone(140, 1.2, { type: 'triangle', vol: 0.2, slide: -100 }); },
  jump() { tone(280, 0.12, { vol: 0.04, slide: 280 }); },
  hurt() { tone(220, 0.25, { type: 'sawtooth', vol: 0.12, slide: -160 }); },
  hit() { tone(900, 0.04, { vol: 0.03 }); },
  clank() { tone(1800, 0.06, { type: 'triangle', vol: 0.06 }); },
  pickup() { [880, 1175, 1568].forEach((f, i) => tone(f, 0.1, { vol: 0.07, delay: i * 0.06 })); },
  rescue() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.12, { vol: 0.07, type: 'triangle', delay: i * 0.08 })); },
  holy() { [N.C4, N.E4, N.G4, N.C5].forEach((f, i) => { tone(f, 1.6, { type: 'sine', vol: 0.09, delay: i * 0.12 }); tone(f * 2, 1.4, { type: 'triangle', vol: 0.03, delay: i * 0.12 }); }); },
  throw() { tone(420, 0.12, { type: 'triangle', vol: 0.08, slide: -220 }); },
  beep() { tone(1600, 0.05, { type: 'square', vol: 0.04 }); },
  swap() { tone(600, 0.08, { vol: 0.05, slide: 600 }); tone(900, 0.1, { vol: 0.05, delay: 0.08, slide: 600 }); },
  pop() { noise(0.15, { vol: 0.12, freq: 5000 }); tone(1200 + Math.random() * 800, 0.2, { type: 'triangle', vol: 0.03, slide: -400 }); },
  whistle() { tone(500, 0.6, { type: 'sine', vol: 0.03, slide: 1200 }); },
  screech() { tone(2200, 0.6, { type: 'sawtooth', vol: 0.05, slide: -1300 }); },
  chord(t = 1) { // a crunchy power chord: root + fifth + octave
    const root = pick([110, 123.5, 146.8, 164.8]);
    for (const m of [1, 1.5, 2]) tone(root * m, 0.28 + t * 0.04, { type: 'sawtooth', vol: 0.045, slide: -6 });
    noise(0.12, { vol: 0.05, freq: 2500 });
  },
  note() { tone(pick([523, 587, 659, 784, 880, 1047]), 0.09, { type: 'square', vol: 0.03 }); },
  drum() { noise(0.18, { vol: 0.3, freq: 600 }); tone(70, 0.22, { type: 'sine', vol: 0.4, slide: -40 }); noise(0.05, { vol: 0.12, freq: 6000, delay: 0.15 }); },
  dash() { noise(0.25, { vol: 0.15, freq: 1500 }); tone(300, 0.2, { type: 'triangle', vol: 0.06, slide: 500 }); },
  slam() { noise(0.3, { vol: 0.35, freq: 400 }); tone(90, 0.3, { type: 'sine', vol: 0.4, slide: -50 }); },
  zap() { tone(1800, 0.12, { type: 'sawtooth', vol: 0.05, slide: -1500 }); noise(0.06, { vol: 0.08, freq: 8000 }); },
  powerup() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.12, { vol: 0.06, type: 'square', delay: i * 0.07 })); },
  fanfare() { // "Yankee Doodle" (public domain)
    const s = [N.C4, N.C4, N.D4, N.E4, N.C4, N.E4, N.D4, N.G3, N.C4, N.C4, N.D4, N.E4, N.C4, 0, N.B3, 0];
    s.forEach((f, i) => { if (f) { tone(f * 2, 0.16, { vol: 0.07, delay: i * 0.15 }); tone(f, 0.16, { type: 'triangle', vol: 0.08, delay: i * 0.15 }); } });
  },
};
// ---- recorded sounds and music (optional): audio/manifest.js lists files that replace the built-in
// synthesized sounds. Played with <audio> elements, which also work when the game is opened as a file
// and inside the Android app. Anything missing falls back to the built-in sound.
const AUDIO = window.BOOM_AUDIO || { sfx: {}, music: {} };
const sfxPools = {}, sfxLast = {};
for (const [name, def] of Object.entries(AUDIO.sfx || {})) {
  if (!SFX[name] || !def || !def.files || !def.files.length) continue;
  sfxPools[name] = def.files.map(f => Array.from({ length: 3 }, () => {
    const a = new Audio('audio/sfx/' + f); a.preload = 'auto';
    a.addEventListener('error', () => { a.broken = true; });
    return a;
  }));
  const synth = SFX[name];
  SFX[name] = (...args) => { if (!playSfxFile(name) || def.mix) synth(...args); };
}
function playSfxFile(name) {
  const pools = sfxPools[name];
  if (!pools) return false;
  if (muted) return true;
  const now = performance.now();
  if (now - (sfxLast[name] || 0) < 45) return true; // a big chain reaction shouldn't stack 30 copies
  const pool = pick(pools), a = pool.find(x => x.paused || x.ended) || pool[0];
  if (a.broken) return false;
  sfxLast[name] = now;
  try { a.currentTime = 0; a.volume = clamp(AUDIO.sfx[name].vol ?? 0.7, 0, 1); const pr = a.play(); if (pr) pr.catch(() => {}); } catch (e) { return false; }
  return true;
}
let musicEl = null, musicSlot = '';
const MENU_STATES = new Set(['title', 'lobby', 'online', 'code', 'story', 'netwait']);
function musicSlotFor(fast) {
  if (fast) return 'boss';
  if (MENU_STATES.has(state) || state === 'victory') return 'menu';
  return 'level' + (levelIndex + 1);
}
function playMusicFile(slot) {
  const m = AUDIO.music || {};
  const file = m[slot] || (slot.startsWith('level') ? m.level : null);
  if (!file) return false;
  if (musicEl && musicSlot === slot && !musicEl.broken) { if (musicEl.paused) musicEl.play().catch(() => {}); return true; }
  stopMusicFile();
  const el = new Audio('audio/music/' + file);
  el.loop = true; el.volume = muted ? 0 : clamp(m.volume ?? 0.45, 0, 1);
  el.addEventListener('error', () => { el.broken = true; if (musicEl === el) { musicEl = null; musicSlot = ''; startSynthMusic(slot === 'boss'); } });
  el.play().catch(() => {}); // browsers wait for the first key press or tap; initAudio retries
  musicEl = el; musicSlot = slot;
  return true;
}
function stopMusicFile() { if (musicEl) { musicEl.pause(); musicEl.src = ''; } musicEl = null; musicSlot = ''; }

// background march (original tune), used when there's no music file
const MELODY = [72, 76, 79, 76, 72, 0, 74, 76, 77, 76, 74, 72, 74, 0, 69, 0, 71, 74, 79, 77, 76, 74, 72, 74, 76, 0, 72, 0, 72, 0, 79, 0];
const BASS = [48, 55, 48, 55, 41, 48, 41, 48, 43, 50, 43, 50, 48, 55, 48, 43];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
let musicOn = false, musicStep = 0, nextNoteT = 0, musicTimer = null, musicTempo = 1, pendingMusic = null;
function startMusic(fast) {
  const slot = musicSlotFor(fast);
  if (musicEl && musicSlot === slot) { musicOn = true; musicTempo = fast ? 1.3 : 1; return; }
  stopMusic();
  musicTempo = fast ? 1.3 : 1;
  if (playMusicFile(slot)) { musicOn = true; return; }
  startSynthMusic(fast);
}
function startSynthMusic(fast) {
  if (!actx) { pendingMusic = fast ? 'fast' : 'normal'; return; }
  pendingMusic = null;
  musicTempo = fast ? 1.3 : 1; musicOn = true; musicStep = 0; nextNoteT = actx.currentTime + 0.1;
  musicTimer = setInterval(schedMusic, 40);
}
function stopMusic() { musicOn = false; pendingMusic = null; if (musicTimer) clearInterval(musicTimer); musicTimer = null; stopMusicFile(); }
function schedMusic() {
  if (!actx || !musicOn) return;
  const e8 = 0.2 / musicTempo;
  while (nextNoteT < actx.currentTime + 0.25) {
    const s = musicStep % 32;
    if (!muted) {
      const m = MELODY[s];
      if (m) noteAt(mtof(m), nextNoteT, e8 * 0.85, 'square', 0.035, musicGain);
      if (s % 2 === 0) noteAt(mtof(BASS[s >> 1]), nextNoteT, e8 * 1.8, 'triangle', 0.1, musicGain);
      if (s % 4 === 2) noiseAt(nextNoteT, 0.06, 0.05, 5000, musicGain);
      if (s % 8 === 0) noiseAt(nextNoteT, 0.1, 0.08, 400, musicGain);
    }
    nextNoteT += e8; musicStep++;
  }
}
function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.6; if (musicEl) musicEl.volume = muted ? 0 : clamp((AUDIO.music || {}).volume ?? 0.45, 0, 1); banner = { str: muted ? 'SOUND OFF' : 'SOUND ON', t: 1, color: '#fff' }; }

// ---------------------------------------------------------------- tiles
const T = { EMPTY: 0, DIRT: 1, BRICK: 2, STEEL: 3, PLAT: 4, URAN: 5, FIRE: 6 };
const TILE_HP = [0, 2, 5, Infinity, 2, 1, 1];
const SOLID = [false, true, true, true, false, true, true];

/* Level chunks: 17 rows each.
   .=air  #=dirt  B=brick  S=steel  ==one-way platform  U=uranium barrel  F=firework crate
   e=Grumbot  s=shield bot  j=jet bot  h=heavy bot  K=boss
   C=family cage  u=uranium  t=teddy  r=heart  D=peace dove  +=cross checkpoint  X=flag  P=player start */
const G3 = ['####################', '####################', 'SSSSSSSSSSSSSSSSSSSS'];
const E = '....................';
const CHUNKS = {
  start: [E, E, E, E, E, E, E, E, E, E, E, E,
    '.............t......',
    '..P.........###.....', ...G3],
  hills: [E, E, E, E, E, E, E, E,
    '..............u.....',
    '............=====...',
    E,
    '.....e..............',
    '....####.......e....',
    '...######....######.', ...G3],
  hills2: [E, E, E, E, E, E,
    '...........j........',
    E, E, E,
    '..t.................',
    '=====.......F.......',
    '...........###......',
    '..e.....s.#####...e.', ...G3],
  pit: [E, E, E, E, E, E, E, E, E, E,
    '..........t.........',
    '.........===........',
    E,
    '..e..............e..',
    '#######...##########',
    '#######...##########',
    'SSSSSSS...SSSSSSSSSS'],
  bunker: [E, E, E, E, E, E, E,
    '........BBBBBB......',
    '........B....B......',
    '........B..e.B......',
    '.....BBBBBBBBBBB....',
    '.....B.........B....',
    '.....B.........B....',
    '..e..B.eU...C..B..e.', ...G3],
  tower: [E, E, E,
    '...........j........',
    E,
    '........SSSSS.......',
    '........S...S.......',
    '..........h.........',
    '........SBBBS.......',
    '........#...#.......',
    '.......##...##......',
    '......###.e.###.....',
    '.....####BBB####....',
    '..e.#####.U.#####.u.', ...G3],
  checkpoint: [E, E, E, E, E, E, E, E, E, E, E,
    '..........+.........',
    '........#####.......',
    '.......#######...r..', ...G3],
  alley: [E, E, E, E, E, E, E, E, E,
    '......e........e....',
    '....=========.=====.',
    E, E,
    '..e.UU.e.F..e.U.FF..', ...G3],
  cliff: [E, E, E, E, E, E,
    '.............C..e.D.',
    '...........#########',
    '..........##########',
    '.........###########',
    '........############',
    '.......#############',
    '......##############',
    '..e..###############', ...G3],
  end: [E, E, E, E, E, E, E, E, E, E, E, E, E,
    '..........e.....X...', ...G3],
  mine1: [
    '####################',
    '##SS############SS##',
    '####....######......',
    E, E,
    '..........j.........',
    E, E,
    '......=====....u....',
    '..............====..',
    E,
    '..s.................',
    '..###..........e....',
    '.#####...UUU..####..', ...G3],
  mine2: [
    '####################',
    '####################',
    '##########BBBB######',
    E, E, E,
    '....BBBBBBBBBBBB....',
    '....B..........B....',
    '....B.h.....C..B....',
    '....BBBBBBBBBBBB....',
    E, E,
    '...e....U..U....e...',
    '..####.#######.###..', ...G3],
  mine3: [
    '####################',
    '####################',
    '####################',
    E, E, E, E,
    '...........u........',
    '..........===.......',
    '.........j..........',
    E, E,
    '.......==..==.......',
    '..e..............e..',
    '#####..........#####',
    '#####..........#####',
    'SSSSS..........SSSSS'],
  factory1: [E, E, E, E,
    '..........BB........',
    '..........BB........',
    '..........BB........',
    '......BBBBBBBBBBB...',
    '......B.........B...',
    '......B..e...e..B...',
    '......B=========B...',
    '......B.........B...',
    '......B.........B...',
    '..e...B.FF.C.FF.B.e.', ...G3],
  factory2: [E, E, E, E, E, E,
    '...............j....',
    E,
    '....t...............',
    '...===........=====.',
    '..........BB........',
    '.........BBBB...h...',
    '........BBBBBB.BBB..',
    '..s....BBBBBBBBBBBB.', ...G3],
  fort1: [E, E, E, E, E,
    '...SSSSSSSSSSSS.....',
    '...S..........S.....',
    '......h....h........',
    '...SBBBBBBBBBBS.....',
    '...B..........B.....',
    '...B..........B.....',
    '...B..........B.....',
    '...B..........B..u..',
    '...B.s..U..e..B..e..', ...G3],
  fort2: [E, E, E, E, E, E,
    '..........j.........',
    E, E,
    '...............u....',
    '..............SSS...',
    '....h...............',
    '...BBB......BB....r.',
    '..BBBBB..e.BBBB..e..', ...G3],
  boss: [
    '................................', '................................', '................................',
    '................................', '................................', '................................',
    '................................', '................................', '................................',
    '..........u.......t.............',
    '........======....======........',
    '................................',
    '................................',
    '..+..................K.....X....',
    'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS'],
};

const LEVELS = [
  { name: 'GRUMBOT VALLEY', tag: 'Bust the family out of the desert cages!', theme: 'valley',
    chunks: ['start', 'hills', 'bunker', 'pit', 'checkpoint', 'tower', 'alley', 'cliff', 'hills2', 'end'] },
  { name: 'URANIUM MINES', tag: 'Stop the drills powering the Fun-Cancelling Ray!', theme: 'mine',
    chunks: ['start', 'mine1', 'mine2', 'pit', 'checkpoint', 'mine3', 'alley', 'mine1', 'mine2', 'end'] },
  { name: 'PLUSHIE FACTORY', tag: 'Free the stolen plushies (and the turtle)!', theme: 'factory',
    chunks: ['start', 'factory2', 'factory1', 'pit', 'checkpoint', 'alley', 'factory1', 'tower', 'factory2', 'cliff', 'end'] },
  { name: 'LIBERTY FORTRESS', tag: 'Beat MEGA GRUMP before midnight!', theme: 'fortress',
    chunks: ['start', 'fort2', 'fort1', 'bunker', 'checkpoint', 'fort1', 'alley', 'fort2', 'boss'] },
];

const THEMES = {
  valley: { dirt: '#8b5a2b', dirt2: '#6e4420', grass: '#4caf50', grass2: '#2e7d32', brick: '#b5543c', brick2: '#7d3426', steel: '#8a98a6', steel2: '#56636f' },
  mine: { dirt: '#4a3b52', dirt2: '#352a3c', grass: null, brick: '#6a5a4a', brick2: '#3f342a', steel: '#6d7b88', steel2: '#3f4a55', ceiling: true },
  factory: { dirt: '#9c6b8e', dirt2: '#7a4f6e', grass: '#ff8ad8', grass2: '#d455a8', brick: '#c0607a', brick2: '#7e3049', steel: '#9aa5b5', steel2: '#5e6878' },
  fortress: { dirt: '#6d5d4b', dirt2: '#4e4234', grass: '#5d8a3a', grass2: '#3c5f23', brick: '#8f8f9a', brick2: '#5a5a66', steel: '#7f8c99', steel2: '#4a5562' },
};

const FAMILY_LOOKS = [
  { hair: '#5a3311', shirt: '#e75480', pants: '#4b3b8f', skin: '#f1c27d', long: true },
  { hair: '#3b2414', shirt: '#2e8b57', pants: '#2f3e5c', skin: '#e0ac69' },
  { hair: '#d8d8d8', shirt: '#9b59b6', pants: '#5b4a3a', skin: '#f1c27d', long: true },
  { hair: '#c0c0c0', shirt: '#e67e22', pants: '#2c3e50', skin: '#e0ac69' },
  { hair: '#1c1c1c', shirt: '#16a085', pants: '#34495e', skin: '#c68642' },
  { hair: '#b5651d', shirt: '#f1c40f', pants: '#8e44ad', skin: '#f1c27d', long: true },
  { hair: '#704214', shirt: '#e74c3c', pants: '#1f618d', skin: '#f1c27d' },
  { hair: '#f4d03f', shirt: '#85c1e9', pants: '#f5b7b1', skin: '#ffdbac' },
];

// ---------------------------------------------------------------- state
let state = 'title', levelIndex = 0, lives = START_LIVES, score = 0, levelStartScore = 0;
let level = null, players = [], enemies = [], projectiles = [], grenades = [], pickups = [], cages = [], crosses = [], followers = [];
let particles = [], explosions = [], nukes = [], texts = [], rockets = [], pending = [], corpses = [];
let boss = null, flag = null, camX = 0, camY = 0, shake = 0, flash = 0, flashColor = '#fff', banner = null;
let gtime = 0, stateT = 0, paused = false, cut = null, menuIdx = 0, startLevelSel = 0, unlocked = 1;
let checkpoint = { x: 0, y: 0 }, rescuedAll = [], rescuedAtLevelStart = 0, familyCounter = 0, titleFx = 0;
try { unlocked = clamp(parseInt(localStorage.getItem('boombros_unlocked') || '1', 10) || 1, 1, LEVELS.length); } catch (e) { /* storage blocked */ }

// ---------------------------------------------------------------- level building
function buildLevel(i) {
  const def = LEVELS[i];
  const theme = THEMES[def.theme];
  const rows = Array.from({ length: 17 }, () => '');
  for (const name of def.chunks) {
    const ch = CHUNKS[name];
    if (ch.length !== 17) console.warn('chunk', name, 'has', ch.length, 'rows');
    const w = Math.max(...ch.map(r => r.length));
    for (let r = 0; r < 17; r++) rows[r] += (ch[r] || '').padEnd(w, '.');
  }
  if (theme.ceiling) for (let r = 0; r < 2; r++) rows[r] = rows[r].replace(/\./g, '#');
  const w = rows[0].length, h = 17;
  level = { w, h, tiles: new Uint8Array(w * h), hp: new Float32Array(w * h), def, theme, kills: 0, rescues: 0, index: i };
  players = []; enemies = []; projectiles = []; grenades = []; pickups = []; cages = []; crosses = []; followers = [];
  particles = []; explosions = []; nukes = []; texts = []; rockets = []; pending = []; corpses = [];
  boss = null; flag = null; banner = null; shake = 0; flash = 0;
  let start = { x: 40, y: 200 };
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const ch = rows[r][c];
    const cx = c * TILE + TILE / 2, bottom = (r + 1) * TILE;
    let t = T.EMPTY;
    switch (ch) {
      case '#': t = T.DIRT; break;
      case 'B': t = T.BRICK; break;
      case 'S': t = T.STEEL; break;
      case '=': t = T.PLAT; break;
      case 'U': t = T.URAN; break;
      case 'F': t = T.FIRE; break;
      case 'e': enemies.push(new Enemy('grunt', cx, bottom)); break;
      case 's': enemies.push(new Enemy('shield', cx, bottom)); break;
      case 'j': enemies.push(new Enemy('jet', cx, bottom)); break;
      case 'h': enemies.push(new Enemy('heavy', cx, bottom)); break;
      case 'K': boss = new Boss(cx, bottom); break;
      case 'C': cages.push({ x: cx - 8, y: bottom - 20, w: 16, h: 20, vy: 0, freed: false, look: familyCounter % FAMILY_LOOKS.length, name: FAMILY[familyCounter % FAMILY.length] }); familyCounter++; break;
      case 'u': pickups.push(new Pickup('uranium', cx, bottom)); break;
      case 't': pickups.push(new Pickup('teddy', cx, bottom)); break;
      case 'r': pickups.push(new Pickup('heart', cx, bottom)); break;
      case 'D': pickups.push(new Pickup('dove', cx, bottom)); break;
      case '+': crosses.push({ x: cx - 6, y: bottom - 32, w: 12, h: 32, active: false, glow: 0 }); break;
      case 'X': flag = { x: cx - 8, y: bottom - 96, w: 16, h: 96, bottom, raised: 0, locked: false, drop: 0 }; break;
      case 'P': start = { x: cx - 5, y: bottom - 20 }; break;
    }
    level.tiles[r * w + c] = t; level.hp[r * w + c] = TILE_HP[t];
  }
  if (flag) flag.drop = boss ? 0 : 1;
  if (boss && flag) flag.locked = true;
  checkpoint = { ...start };
  return start;
}

function tileAt(tx, ty) {
  if (tx < 0 || tx >= level.w) return T.STEEL;
  if (ty < 0 || ty >= level.h) return T.EMPTY;
  return level.tiles[ty * level.w + tx];
}
const isSolid = (tx, ty) => SOLID[tileAt(tx, ty)];
const solidAtPx = (x, y) => isSolid(Math.floor(x / TILE), Math.floor(y / TILE));

function damageTile(tx, ty, d) {
  if (tx < 0 || tx >= level.w || ty < 0 || ty >= level.h) return;
  const i = ty * level.w + tx, t = level.tiles[i];
  if (t === T.EMPTY || t === T.STEEL) return;
  level.hp[i] -= d;
  if (NET.recording) NET.tileDiffs.push(i, level.hp[i] > 0 ? t : 0, Math.max(0, r1(level.hp[i])));
  if (level.hp[i] > 0) return;
  level.tiles[i] = T.EMPTY;
  const cx = tx * TILE + 8, cy = ty * TILE + 8;
  const th = level.theme;
  const col = { 1: [th.dirt, th.dirt2], 2: [th.brick, th.brick2], 4: ['#a1662f', '#6e4420'], 5: ['#2ecc40', '#1b5e20'], 6: ['#d62828', '#fff'] }[t];
  for (let k = 0; k < 5; k++) part(cx + rand(-6, 6), cy + rand(-6, 6), rand(-80, 80), rand(-160, -40), rand(0.5, 1), pick(col), rand(2, 4), 600);
  if (t === T.URAN) pending.push({ x: cx, y: cy, delay: rand(0.06, 0.16), kind: 'uran' });
  if (t === T.FIRE) pending.push({ x: cx, y: cy, delay: rand(0.06, 0.16), kind: 'fire' });
}

// Physics: move an AABB through the tile map, one axis at a time.
function moveX(b, dx) {
  b.x += dx;
  const top = Math.floor(b.y / TILE), bot = Math.floor((b.y + b.h - 0.01) / TILE);
  if (dx > 0) {
    const tx = Math.floor((b.x + b.w - 0.01) / TILE);
    for (let ty = top; ty <= bot; ty++) if (isSolid(tx, ty)) { b.x = tx * TILE - b.w; return 1; }
  } else if (dx < 0) {
    const tx = Math.floor(b.x / TILE);
    for (let ty = top; ty <= bot; ty++) if (isSolid(tx, ty)) { b.x = (tx + 1) * TILE; return -1; }
  }
  return 0;
}
function moveY(b, dy) {
  const prevBottom = b.y + b.h;
  b.y += dy;
  const l = Math.floor(b.x / TILE), r = Math.floor((b.x + b.w - 0.01) / TILE);
  if (dy > 0) {
    const ty = Math.floor((b.y + b.h - 0.01) / TILE);
    for (let tx = l; tx <= r; tx++) {
      const t = tileAt(tx, ty);
      if (SOLID[t] || (t === T.PLAT && prevBottom <= ty * TILE + 0.5 && !b.dropThrough)) { b.y = ty * TILE - b.h; return 1; }
    }
  } else if (dy < 0) {
    const ty = Math.floor(b.y / TILE);
    for (let tx = l; tx <= r; tx++) if (isSolid(tx, ty)) { b.y = (ty + 1) * TILE; return -1; }
  }
  return 0;
}
function touchingWall(b, dir) {
  const tx = dir > 0 ? Math.floor((b.x + b.w + 1) / TILE) : Math.floor((b.x - 1) / TILE);
  if (tx < 0 || tx >= level.w) return false;
  for (let ty = Math.floor((b.y + 3) / TILE); ty <= Math.floor((b.y + b.h - 3) / TILE); ty++) if (isSolid(tx, ty)) return true;
  return false;
}
function groundAhead(b, dir) {
  const x = dir > 0 ? b.x + b.w + 2 : b.x - 2, y = b.y + b.h + 2;
  const t = tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
  return SOLID[t] || t === T.PLAT;
}
function lineClear(x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
  for (let i = 1; i < n; i++) if (solidAtPx(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false;
  return true;
}

// ---------------------------------------------------------------- effects
function part(x, y, vx, vy, life, color, size = 2, grav = 0, type = 'sq', drag = 0) {
  if (NET.recording && !NET.fxLocal) NET.fx.push(['p', r1(x), r1(y), Math.round(vx), Math.round(vy), r2(life), color, r1(size), Math.round(grav), type, r1(drag)]);
  if (particles.length > 1800) return;
  particles.push({ x, y, vx, vy, life, max: life, color, size, grav, type, drag, rot: rand(0, 6) });
}
function addCorpse(c) {
  corpses.push(c);
  if (NET.recording) NET.fx.push(['c', c.type, r1(c.x), r1(c.y), c.w, c.h, r1(c.vx), r1(c.vy), r1(c.vr), r2(c.t), c.facing]);
}
function popText(x, y, str, color = '#fff', size = 6) { texts.push({ x, y, str, color, size, t: 1.1 }); }
function setBanner(str, color = '#ffd34d', t = 2.2, sub = '') { banner = { str, color, t, sub }; }
function launchFirework(x, y, colors) {
  const r = { x, y, vx: rand(-25, 25), vy: rand(-230, -170), fuse: rand(0.6, 0.95), colors: colors || pick([['#e63946', '#fff', '#1d5fd8'], ['#e63946'], ['#fff', '#1d5fd8'], ['#ffd34d'], ['#39ff14', '#fff']]) };
  rockets.push(r);
  if (NET.recording) NET.fx.push(['r', r1(r.x), r1(r.y), r1(r.vx), r1(r.vy), r2(r.fuse), r.colors]);
  if (Math.random() < 0.5) SFX.whistle();
}

function explode(x, y, r, o = {}) {
  const owner = o.owner || 'player', dmg = o.dmg ?? 3, tileDmg = o.tileDmg ?? 3;
  explosions.push({ x, y, r, t: 0, max: o.ring ? 0.45 : 0.3 + r / 220, color: o.ring ? 'ring' : o.color });
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE), y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const d = Math.hypot(tx * TILE + 8 - x, ty * TILE + 8 - y);
    if (d <= r + 4) damageTile(tx, ty, tileDmg);
  }
  if (owner === 'player') {
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x + e.w / 2 - x, e.y + e.h / 2 - y);
      if (d < r + Math.max(e.w, e.h) / 2) { e.vy = -rand(120, 200); e.damage(dmg, x, true); }
    }
    if (boss && boss.alive && boss.state !== 'dying') {
      const d = Math.hypot(boss.x + boss.w / 2 - x, boss.y + boss.h / 2 - y);
      if (d < r + 26) boss.damage(Math.ceil(dmg * 0.8));
    }
    for (const c of cages) if (!c.freed && Math.hypot(c.x + 8 - x, c.y + 10 - y) < r + 10) freeCage(c);
  } else {
    for (const p of players) if (p.alive && Math.hypot(p.x + p.w / 2 - x, p.y + p.h / 2 - y) < r + 8) p.hurt(1, x);
  }
  for (const c of corpses) { const d = Math.hypot(c.x - x, c.y - y); if (d < r + 20) { c.vx += sign(c.x - x) * 120; c.vy -= 150; } }
  if (o.ring) { // drum shockwave: music notes instead of fire
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; part(x, y, Math.cos(a) * 110, Math.sin(a) * 110, 0.5, pick(['#ff7b54', '#ffd34d', '#fff', '#6fb6ff']), 3, 0, 'note', 2); }
    for (const e of enemies) if (e.alive && e.state === 'patrol' && Math.abs(e.x - x) < 200) { e.state = 'alert'; e.alertT = 0.4; }
    return;
  }
  const n = Math.min(26, 6 + r / 2);
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(30, 90) * r / 30;
    part(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.2, 0.5), pick(['#fff3b0', '#ffd34d', '#ff8c1a', '#ff4d1a']), rand(2, 4), 0, 'sq', 3);
  }
  for (let i = 0; i < n * 0.6; i++) part(x + rand(-r / 2, r / 2), y + rand(-r / 2, r / 2), rand(-20, 20), rand(-50, -15), rand(0.6, 1.3), pick(['#555', '#777', '#999']), rand(3, 6), 0, 'smoke');
  shake = Math.max(shake, Math.min(10, r / 6));
  SFX.boom(r / 30);
  // nearby robots notice the noise
  for (const e of enemies) if (e.alive && e.state === 'patrol' && Math.abs(e.x - x) < 200) { e.state = 'alert'; e.alertT = 0.4; }
}

function nuke(x, y, T = 2) {
  const sc = [0.62, 1, 1, 1.55][T - 1];
  explode(x, y, 112 * sc, { dmg: [18, 30, 30, 40][T - 1], tileDmg: 7, color: 'nuke' });
  nukes.push({ x, y, t: 0, max: 3.4, s: sc });
  flash = T === 4 ? 1.4 : 1; flashColor = '#f4ffd0'; shake = 10 + 6 * sc;
  SFX.nuke();
  setBanner(['MINI NUKE!', 'ATOMIC BLAST!!', 'CHAIN REACTION!!', 'ATOMIC SUN!!!'][T - 1], '#39ff14', 2);
  if (T === 3) for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; pending.push({ kind: 'atom', x: x + Math.cos(a) * 90, y: y + Math.sin(a) * 50, delay: 0.35 + i * 0.12 }); }
  for (let i = 0; i < 60 * sc; i++) {
    const a = rand(0, Math.PI * 2), s = rand(60, 260);
    part(x, y, Math.cos(a) * s, Math.sin(a) * s * 0.6, rand(0.4, 1.2), pick(['#39ff14', '#b6ff6e', '#ffd34d', '#fff']), rand(2, 4), 100, 'sq', 2);
  }
}

function kidExplosion(p) { // pending chain explosions from barrels and crates
  if (p.kind === 'uran') {
    explode(p.x, p.y, 44, { dmg: 6, tileDmg: 3 });
    for (let i = 0; i < 12; i++) part(p.x, p.y, rand(-120, 120), rand(-200, -40), rand(0.6, 1.2), pick(['#39ff14', '#b6ff6e']), 3, 400);
  } else if (p.kind === 'fire') {
    explode(p.x, p.y, 36, { dmg: 5, tileDmg: 3 });
    for (let i = 0; i < 3; i++) launchFirework(p.x, p.y);
  } else if (p.kind === 'spark') { // Noah's firework rockets crackle into little blasts
    explode(p.x, p.y, 13, { dmg: 1, tileDmg: 1 });
    for (let i = 0; i < 10; i++) { const a = rand(0, Math.PI * 2); part(p.x, p.y, Math.cos(a) * 90, Math.sin(a) * 90, 0.6, pick(['#e63946', '#fff', '#1d5fd8']), 2, 60, 'star', 2); }
  } else if (p.kind === 'atom') {
    explode(p.x, p.y, 50, { dmg: 10, tileDmg: 4, color: 'nuke' });
    nukes.push({ x: p.x, y: p.y, t: 0, max: 2.2, s: 0.4 });
  } else if (p.kind === 'sudo') sudoZap(0);
  else if (p.kind === 'zap') { // a bolt of green code from the sky
    const e = p.target;
    if (!e || e.alive === false) return;
    const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
    for (let y = Math.max(camY, ey - 160); y < ey; y += 6) part(ex + rand(-3, 3), y, rand(-10, 10), 0, 0.3, pick(['#39ff14', '#b6ff6e', '#fff']), 2);
    explode(ex, ey, 14, { dmg: 0, tileDmg: 0, color: 'nuke' });
    popText(ex, e.y - 10, pick(SYSADMIN_LINES), '#39ff14', 5);
    SFX.zap();
    if (e === boss) boss.damage(20); else e.damage(8, ex, true);
  }
}

// ---------------------------------------------------------------- heroes
// Every hero's FIRE and SPECIAL get an upgrade each level: tier 1 in level 1 up to tier 4 in level 4.
const HERO_ORDER = ['noah', 'elijah', 'andrew'];
const HEROES = {
  noah: { name: 'NOAH', color: '#6fb6ff', bg: '#1d3557', noAmmo: 'NO PLUSHIES!',
    fire: ['POP ROCKET', 'TWIN ROCKETS', 'HOMING ROCKETS', 'FIREWORK ROCKETS'],
    special: ['TEDDY BOMB', 'TEDDY TRIPLETS', 'ROLLING MEGA TEDDY', 'TEDDY AIRSTRIKE'] },
  elijah: { name: 'ELIJAH', color: '#f4d03f', bg: '#3d3a10', noAmmo: 'NO URANIUM!',
    fire: ['URANIUM RAY', 'PIERCING RAY', 'DOUBLE RAY', 'GAMMA BEAM'],
    special: ['MINI NUKE', 'ATOMIC BLAST', 'CHAIN REACTION', 'ATOMIC SUN'] },
  andrew: { name: 'ANDREW', color: '#ff7b54', bg: '#2a1a3a', noAmmo: 'NO GUITAR PICKS!',
    fire: ['POWER CHORD', 'BIG RIFF', 'TRIPLE CHORD', 'SHRED SOLO'],
    special: ['BJJ TAKEDOWN', 'DRUM SOLO', 'SUDO KILL BOTS', 'ROCK CONCERT'] },
};
const tier = () => clamp(levelIndex + 1, 1, 4);
const nextHero = (h, step = 1) => HERO_ORDER[(HERO_ORDER.indexOf(h) + step + HERO_ORDER.length) % HERO_ORDER.length];
const BJJ_MOVES = ['TAKEDOWN!', 'ARMBAR!', 'TRIANGLE CHOKE!', 'KIMURA!', 'SWEEP!', 'MOUNT!'];
const SYSADMIN_LINES = ['ACCESS DENIED', 'rm -rf bot', 'PERMISSION DENIED', '404 BOT NOT FOUND', 'REBOOTING...', 'BLUE SCREEN!', 'kill -9'];
function homingTarget(b) {
  let best = null, bd = 200;
  const cands = boss && boss.alive && boss.state !== 'dying' ? [...enemies, boss] : enemies;
  for (const e of cands) {
    if (e.alive === false) continue;
    const dx = e.x + e.w / 2 - b.x, dy = e.y + e.h / 2 - b.y, d = Math.hypot(dx, dy);
    if (d < bd && dx * b.vx > 0) { bd = d; best = e; }
  }
  return best;
}
function sudoZap(delay) { // Andrew's sysadmin move: zap every robot on the screen, one by one
  setBanner('$ sudo kill -9 bots', '#39ff14', 2, 'ACCESS GRANTED');
  let i = 0;
  for (const e of enemies) if (e.alive && e.x + e.w > camX && e.x < camX + VW) pending.push({ kind: 'zap', target: e, delay: delay + 0.12 * i++ });
  if (boss && boss.alive && boss.state !== 'sleep' && boss.x < camX + VW) pending.push({ kind: 'zap', target: boss, delay: delay + 0.12 * i });
}

// ---------------------------------------------------------------- players
class Player {
  constructor(idx, hero, x, y) {
    Object.assign(this, { idx, hero, x, y, w: 10, h: 20, vx: 0, vy: 0, facing: 1, hp: 3, maxHp: 3, specials: 3, cool: 0, inv: 2,
      onGround: false, coyote: 0, jumpBuf: 0, airJumps: 1, dash: 0, drum: 0, drumN: 0, drumT: 0, alive: true, deadT: 0, anim: 0, shield: 0, prev: {}, climbing: false, muzzle: 0,
      waiting: false, ghostY: 0, carried: false, dropThrough: false, moving: false });
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  update(dt, inp) {
    const prev = this.prev; this.prev = { ...inp };
    const pressed = k => inp[k] && !prev[k];
    this.anim += dt;
    if (!this.alive) {
      this.ghostY -= 25 * dt;
      if (this.deadT > 0) {
        this.deadT -= dt;
        if (this.deadT <= 0) {
          if (lives > 0) { lives--; respawn(this); } else this.waiting = true;
        }
      }
      return;
    }
    if (this.carried) return;
    this.inv -= dt; this.shield -= dt; this.cool -= dt; this.muzzle -= dt;

    if (pressed('swap') && players.length === 1) {
      this.hero = nextHero(this.hero);
      for (let i = 0; i < 16; i++) part(this.cx, this.cy, rand(-80, 80), rand(-80, 80), 0.5, pick(['#fff', '#ffd34d', '#39ff14']), 3, 0, 'sq', 3);
      popText(this.cx, this.y - 8, HEROES[this.hero].name + '!', HEROES[this.hero].color, 7);
      SFX.swap();
    }

    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir) this.facing = dir;
    this.moving = dir !== 0;
    const run = this.hero === 'andrew' ? RUN * 1.15 : RUN; // Andrew is a runner
    this.vx += (dir * run - this.vx) * Math.min(1, dt * (this.onGround ? 18 : 9));
    if (this.dash > 0) this.updateDash(dt);
    if (this.drum > 0) this.updateDrum(dt);

    if (pressed('up')) this.jumpBuf = 0.12; else this.jumpBuf -= dt;
    this.coyote = this.onGround ? 0.1 : this.coyote - dt;
    // Wall climbing: push into any wall and hold jump to scale it.
    const wall = dir !== 0 && touchingWall(this, dir);
    if (this.onGround) this.airJumps = 1;
    if (this.jumpBuf > 0 && this.coyote > 0) {
      this.vy = -JUMP; this.jumpBuf = 0; this.coyote = 0; SFX.jump();
      for (let i = 0; i < 4; i++) part(this.cx, this.y + this.h, rand(-40, 40), rand(-20, 0), 0.3, '#ddd', 2, 0, 'smoke');
    } else if (pressed('up') && !wall && this.airJumps > 0 && this.coyote <= 0) {
      // Double jump: one extra hop in the air, so nothing is ever out of reach after a big blast.
      this.vy = -JUMP * 0.9; this.airJumps--; this.jumpBuf = 0;
      SFX.jump(); tone(560, 0.1, { vol: 0.04, slide: 400 });
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; part(this.cx, this.y + this.h, Math.cos(a) * 60, Math.sin(a) * 20 + 10, 0.35, '#fff', 2, 0, 'smoke'); }
    }
    this.climbing = false;
    if (wall && inp.up && this.vy > -CLIMB) { this.vy = -CLIMB; this.climbing = true; }
    else if (wall && this.vy > 50) this.vy = 50;
    if (!inp.up && this.vy < -100) this.vy += GRAV * dt * 1.2; // short hop when you let go
    this.vy = Math.min(this.vy + GRAV * dt, MAXFALL);
    this.dropThrough = !!inp.down;

    moveX(this, this.vx * dt);
    const ry = moveY(this, this.vy * dt);
    const wasGround = this.onGround;
    this.onGround = ry === 1;
    if (ry !== 0) this.vy = 0;
    if (this.onGround && !wasGround) for (let i = 0; i < 3; i++) part(this.cx, this.y + this.h, rand(-30, 30), rand(-15, 0), 0.25, '#ccc', 2, 0, 'smoke');

    if (players.length > 1) this.x = clamp(this.x, camX + 2, camX + VW - this.w - 2);
    if (this.onGround) {
      const ty = Math.floor((this.y + this.h + 2) / TILE), l = tileAt(Math.floor(this.x / TILE), ty), r = tileAt(Math.floor((this.x + this.w) / TILE), ty);
      if ((SOLID[l] || l === T.PLAT) && (SOLID[r] || r === T.PLAT)) this.safe = { x: this.x, y: this.y };
    }
    if (this.y > level.h * TILE + 30) {
      this.hp -= 1;
      if (this.hp <= 0 || !this.safe) { this.hp = 0; this.die(); return; }
      Object.assign(this, { x: this.safe.x, y: this.safe.y - 2, vx: 0, vy: 0, inv: 1.5 });
      popText(this.cx, this.y - 6, 'OOPS! -1 HEART', '#ff8a8a', 6); SFX.hurt();
      for (let i = 0; i < 12; i++) part(this.cx, this.cy, rand(-60, 60), rand(-90, 10), 0.6, '#fff', 2, 0, 'star', 2);
      return;
    }

    if (inp.fire && this.cool <= 0) this.shoot();
    if (pressed('special')) {
      if (this.specials > 0) this.throwSpecial();
      else popText(this.cx, this.y - 6, HEROES[this.hero].noAmmo, '#aaa', 5);
    }
    if (flag && !flag.locked && flag.drop >= 1 && state === 'play' && overlap(this, { x: flag.x, y: flag.y, w: flag.w, h: flag.h })) startCutscene();
  }
  shoot() {
    const T = tier(), f = this.facing, gy = this.y + 10, gx = this.cx + f * 8;
    this.muzzle = 0.06;
    const proj = o => projectiles.push(Object.assign({ owner: 'player', x: gx, y: gy, vy: 0, pierce: 0, hit: new Set() }, o));
    if (this.hero === 'noah') {
      this.cool = [0.26, 0.3, 0.32, 0.3][T - 1];
      const twin = T >= 2;
      for (let i = 0; i < (twin ? 2 : 1); i++) {
        proj({ kind: 'rocket', y: gy + (twin ? (i ? 2 : -2) : 0), vx: f * 270, vy: twin ? (i ? 25 : -25) : rand(-8, 8), life: 1.4, dmg: 2, homing: T >= 3, fw: T >= 4 });
      }
      SFX.rocket();
    } else if (this.hero === 'elijah') {
      this.cool = T === 1 ? 0.13 : 0.1;
      const rays = T <= 2 ? [[0, 0]] : T === 3 ? [[-3, 0], [3, 0]] : [[0, -60], [0, 0], [0, 60]];
      for (const [dy, vy] of rays) proj({ kind: 'laser', y: gy + dy + rand(-1, 1), vx: f * 480, vy, life: 0.6, dmg: 1, pierce: T });
      SFX.laser();
    } else if (T >= 4) { // Andrew's shred solo: a stream of notes with a chord every fifth note
      this.cool = 0.08; this.noteN = (this.noteN || 0) + 1;
      proj({ kind: 'note', vx: f * 340, vy: rand(-10, 10), life: 0.9, dmg: 1.5, pierce: 1 });
      if (this.noteN % 4 === 0) { proj({ kind: 'chord', vx: f * 230, life: 0.5, dmg: 3, pierce: 99, big: 1 }); SFX.chord(4); } else SFX.note();
    } else { // Andrew's power chords: a sound wave that goes through every robot it meets
      this.cool = [0.34, 0.36, 0.4][T - 1];
      for (const vy of T === 3 ? [-70, 0, 70] : [0]) proj({ kind: 'chord', vx: f * 230, vy, life: T === 1 ? 0.35 : 0.5, dmg: T === 1 ? 1 : 2, pierce: 99, big: T >= 2 ? 1 : 0 });
      SFX.chord(T);
    }
  }
  throwSpecial() {
    const T = tier();
    this.specials--;
    if (this.hero === 'andrew') return this.andrewSpecial(T);
    if (this.hero === 'noah' && T === 4) { // plushies rain from the sky ahead of Noah
      for (let i = 0; i < 7; i++) grenades.push({ x: this.cx + this.facing * (40 + i * 36) - 4, y: camY - 20 - i * 16, w: 8, h: 8, vx: 0, vy: 140, kind: 'teddy', fuse: 4, spin: 0, impact: true, r: 44, dmg: 10, quiet: true });
      setBanner('TEDDY AIRSTRIKE!', '#ffb36b', 1.6); SFX.whistle();
      return;
    }
    if (this.hero === 'noah' && T === 3) { // a giant teddy that rolls along, booming as it goes
      grenades.push({ x: this.cx - 6, y: this.y + 6, w: 12, h: 12, vx: this.facing * 170, vy: -80, kind: 'rollbear', fuse: 1.8, spin: 0, dir: this.facing, tick: 0.25 });
      SFX.throw(); popText(this.cx, this.y - 8, 'MEGA TEDDY!', '#ffb36b', 7);
      return;
    }
    const g = { x: this.cx - 4, y: this.y + 4, w: 8, h: 8, vx: this.facing * 190 + this.vx * 0.4, vy: -230, spin: 0, beep: 0, tier: T };
    if (this.hero === 'noah') Object.assign(g, { kind: 'teddy', fuse: 1.3, r: T === 1 ? 42 : 54, dmg: T === 1 ? 9 : 12, split: T === 2 });
    else Object.assign(g, { kind: 'core', fuse: 1.1 });
    grenades.push(g);
    SFX.throw();
  }
  andrewSpecial(T) {
    if (T === 1) { // BJJ takedown: a running dash that grabs the first robot and slams it
      this.dash = 0.42; this.inv = Math.max(this.inv, 0.5); SFX.dash();
    } else if (T === 2) { // drum solo: shockwave rings
      this.drum = 1.25; this.drumN = 4; this.drumT = 0; popText(this.cx, this.y - 10, 'DRUM SOLO!', HEROES.andrew.color, 7);
    } else if (T === 3) {
      sudoZap(0.2); SFX.zap();
    } else { // the rock concert: amps drop from the sky, drum rings, and the sysadmin zap
      setBanner('ROCK CONCERT!!!', '#ff7b54', 2.4, 'Andrew brought the whole band!');
      this.drum = 1.9; this.drumN = 6; this.drumT = 0.2;
      for (const d of [-1, 1]) grenades.push({ x: this.cx + d * 48 - 6, y: camY - 30, w: 12, h: 14, vx: 0, vy: 60, kind: 'amp', fuse: 4, spin: 0, impact: true });
      for (let i = 0; i < 4; i++) launchFirework(this.cx + rand(-120, 120), this.y + 20);
      pending.push({ kind: 'sudo', delay: 0.9 });
    }
  }
  updateDash(dt) {
    this.dash -= dt;
    this.vx = this.facing * 400; this.inv = Math.max(this.inv, 0.15);
    if (Math.random() < 0.8) part(this.cx - this.facing * 6, this.y + this.h - 2, -this.facing * rand(20, 60), rand(-20, 0), 0.3, '#ddd', 3, 0, 'smoke');
    const reach = { x: this.x - 3, y: this.y, w: this.w + 6, h: this.h };
    const hit = enemies.find(e => e.alive && overlap(reach, e));
    if (hit) {
      hit.damage(99, this.cx - this.facing * 10, true);
      explode(hit.cx, hit.y + hit.h - 4, 30, { dmg: 6, tileDmg: 1 });
      popText(hit.cx, hit.y - 12, pick(BJJ_MOVES), HEROES.andrew.color, 8); SFX.slam();
      this.dash = 0; this.vx = 0; this.vy = -200;
    } else if (boss && boss.alive && boss.state !== 'dying' && overlap(reach, boss)) {
      boss.damage(25); explode(this.cx + this.facing * 8, this.cy, 30, { dmg: 0, tileDmg: 0 });
      popText(this.cx, this.y - 12, 'TAKEDOWN!', HEROES.andrew.color, 8); SFX.slam();
      this.dash = 0; this.vx = -this.facing * 200; this.vy = -220;
    } else if (this.dash <= 0) {
      explode(this.cx + this.facing * 10, this.y + this.h - 4, 20, { dmg: 3, tileDmg: 1 });
    }
  }
  updateDrum(dt) {
    this.drum -= dt; this.vx = 0; this.inv = Math.max(this.inv, 0.15);
    this.drumT -= dt;
    if (this.drumT <= 0 && this.drumN > 0) {
      this.drumN--; this.drumT = 0.3;
      explode(this.cx, this.cy, 72, { dmg: 4, tileDmg: 1, ring: true });
      SFX.drum(); shake = Math.max(shake, 4);
    }
  }
  hurt(n, fromX) {
    if (!this.alive || this.inv > 0 || this.shield > 0 || state !== 'play') return;
    this.hp -= n; this.inv = 1.3;
    this.vx = sign(this.cx - fromX) * 160; this.vy = -160;
    SFX.hurt(); shake = Math.max(shake, 4);
    for (let i = 0; i < 6; i++) part(this.cx, this.cy, rand(-80, 80), rand(-120, -20), 0.6, pick(['#ff6b6b', '#fff', '#ffd34d']), 2, 400, 'star');
    if (this.hp <= 0) this.die();
  }
  die() {
    if (!this.alive) return;
    this.alive = false; this.deadT = 1.8; this.ghostY = 0;
    for (let i = 0; i < 20; i++) part(this.cx, this.cy, rand(-120, 120), rand(-160, 40), rand(0.5, 1), pick(['#fff', '#ffd34d', '#ff8ad8', '#6fb6ff']), 3, 200, 'star');
    popText(this.cx, this.y - 6, 'BE RIGHT BACK!', '#fff', 6);
    SFX.hurt();
  }
}

function respawn(p, x, y) {
  const other = pick(players.filter(o => o !== p && o.alive));
  if (x === undefined) {
    if (other) { x = other.x; y = other.y - 4; } else { x = checkpoint.x; y = checkpoint.y; }
  }
  Object.assign(p, { x, y, safe: null, vx: 0, vy: 0, hp: p.maxHp, alive: true, inv: 2.5, waiting: false, deadT: 0, specials: Math.max(p.specials, 2) });
  for (let i = 0; i < 18; i++) part(p.cx, p.cy, rand(-60, 60), rand(-90, 10), 0.6, pick(['#fff', '#ffd34d']), 2, 0, 'star', 2);
  SFX.swap();
}

// ---------------------------------------------------------------- enemies
const ENEMY_STATS = { grunt: { w: 12, h: 18, hp: 3 }, shield: { w: 12, h: 18, hp: 5 }, jet: { w: 12, h: 14, hp: 2 }, heavy: { w: 14, h: 20, hp: 6 } };
function nearestPlayer(e) {
  let best = null, bd = 1e9;
  for (const p of players) if (p.alive && !p.carried) { const d = Math.abs(p.cx - (e.x + e.w / 2)) + Math.abs(p.cy - (e.y + e.h / 2)); if (d < bd) { bd = d; best = p; } }
  return best;
}
class Enemy {
  constructor(type, cx, bottom) {
    const s = ENEMY_STATS[type];
    Object.assign(this, { type, w: s.w, h: s.h, hp: s.hp, x: cx - s.w / 2, y: bottom - s.h, vx: 0, vy: 0, facing: Math.random() < 0.5 ? -1 : 1,
      state: 'patrol', alertT: 0, cool: rand(0.3, 1), lostT: 0, alive: true, flash: 0, anim: rand(0, 5), baseY: bottom - s.h - (type === 'jet' ? 0 : 0) });
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  canSee(p) {
    const dx = p.cx - this.cx, dy = p.cy - this.cy;
    if (Math.abs(dx) > 230) return false;
    if (this.type !== 'jet' && Math.abs(dy) > 26) return false;
    if (this.state === 'patrol' && dx * this.facing < 0 && Math.abs(dx) > 40) return false;
    return lineClear(this.cx, this.y + 8, p.cx, p.y + 8);
  }
  update(dt) {
    this.anim += dt; this.flash -= dt;
    if (this.x + this.w < camX - 80 || this.x > camX + VW + 80) return; // asleep off-screen
    const tgt = nearestPlayer(this);
    const sees = tgt ? this.canSee(tgt) : false;
    if (this.type === 'jet') return this.updateJet(dt, tgt, sees);
    switch (this.state) {
      case 'patrol':
        this.vx = this.facing * 28;
        if (this.onGround && (touchingWall(this, this.facing) || !groundAhead(this, this.facing))) this.facing *= -1;
        if (sees) { this.state = 'alert'; this.alertT = 0.6; }
        break;
      case 'alert':
        this.vx = 0; this.alertT -= dt;
        if (tgt) this.facing = sign(tgt.cx - this.cx);
        if (this.alertT <= 0) { this.state = 'attack'; this.cool = 0.1; }
        break;
      case 'attack':
        this.vx = 0;
        if (sees) { this.facing = sign(tgt.cx - this.cx); this.lostT = 0; } else { this.lostT += dt; if (this.lostT > 2) this.state = 'patrol'; }
        this.cool -= dt;
        if (this.cool <= 0 && sees) this.fire(tgt);
        break;
    }
    this.vy = Math.min(this.vy + GRAV * dt, MAXFALL);
    moveX(this, this.vx * dt);
    const ry = moveY(this, this.vy * dt);
    this.onGround = ry === 1; if (ry) this.vy = 0;
    if (this.y > level.h * TILE + 40) { this.alive = false; }
  }
  updateJet(dt, tgt, sees) {
    if (tgt) {
      const want = tgt.cx - sign(tgt.cx - this.cx) * 90;
      this.vx += (clamp(want - this.cx, -45, 45) - this.vx) * dt * 2;
      this.facing = sign(tgt.cx - this.cx);
    }
    this.vy = (this.baseY + Math.sin(this.anim * 2) * 10 - this.y) * 3;
    moveX(this, this.vx * dt); moveY(this, this.vy * dt);
    if (this.state === 'patrol' && sees) { this.state = 'alert'; this.alertT = 0.7; }
    if (this.state === 'alert') { this.alertT -= dt; if (this.alertT <= 0) this.state = 'attack'; }
    if (this.state === 'attack') {
      this.cool -= dt;
      if (this.cool <= 0 && tgt && sees && Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) < 230) {
        const a = Math.atan2(tgt.cy - this.cy, tgt.cx - this.cx);
        projectiles.push({ kind: 'bolt', owner: 'enemy', x: this.cx, y: this.cy, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, life: 3, dmg: 1 });
        this.cool = rand(1.6, 2.4); SFX.enemyShot();
      }
    }
    for (let i = 0; i < 1; i++) part(this.cx - this.facing * 3, this.y + this.h, rand(-10, 10), rand(30, 60), 0.2, pick(['#ffd34d', '#ff8c1a']), 2);
  }
  fire() {
    const gx = this.cx + this.facing * 9, gy = this.y + 9;
    if (this.type === 'heavy') {
      projectiles.push({ kind: 'missile', owner: 'enemy', x: gx, y: this.y + 5, vx: this.facing * 120, vy: 0, life: 3, dmg: 1 });
      this.cool = rand(2.2, 2.8);
    } else {
      projectiles.push({ kind: 'bolt', owner: 'enemy', x: gx, y: gy, vx: this.facing * 140, vy: 0, life: 2.5, dmg: 1 });
      this.cool = rand(1.2, 1.8);
    }
    SFX.enemyShot();
  }
  damage(d, fromX, explosive) {
    if (!this.alive) return;
    this.hp -= d; this.flash = 0.1;
    if (this.state === 'patrol') { this.state = 'alert'; this.alertT = 0.3; this.facing = sign(fromX - this.cx); }
    if (!explosive) SFX.hit();
    if (this.hp <= 0) this.die(fromX);
  }
  die(fromX) {
    this.alive = false; level.kills++;
    const pts = { grunt: 100, shield: 150, jet: 150, heavy: 200 }[this.type];
    score += pts; popText(this.cx, this.y - 4, '+' + pts, '#ffd34d');
    addCorpse({ type: this.type, x: this.cx, y: this.cy, w: this.w, h: this.h, vx: sign(this.cx - fromX) * rand(90, 170), vy: -rand(180, 260), rot: 0, vr: rand(-12, 12), t: rand(0.7, 1.1), facing: this.facing });
  }
}

// ---------------------------------------------------------------- boss
class Boss {
  constructor(cx, bottom) {
    Object.assign(this, { w: 44, h: 56, x: cx - 22, y: bottom - 56, vx: 0, vy: 0, hp: 300, maxHp: 300, state: 'sleep', t: 0, facing: -1,
      flash: 0, alive: true, step: 0, shots: 0, shotT: 0, onGround: false, anim: 0, minX: cx - 380 });
  }
  get cx() { return this.x + this.w / 2; }
  update(dt) {
    if (!this.alive) return;
    this.flash -= dt; this.anim += dt;
    const tgt = nearestPlayer(this) || players[0];
    if (this.state === 'sleep') {
      if (tgt && Math.abs(tgt.cx - this.cx) < 250) {
        this.state = 'intro'; this.t = 2;
        setBanner('MEGA GRUMP 9000!', '#ff3b3b', 2.2, 'The biggest, grumpiest Grumbot!');
        startMusic(true); shake = 6;
      }
    } else if (this.state === 'intro') {
      this.t -= dt; if (this.t <= 0) { this.state = 'walk'; this.t = 1.5; }
    } else if (this.state === 'walk') {
      this.facing = sign(tgt.cx - this.cx);
      this.vx = this.facing * 32; this.t -= dt;
      if (this.t <= 0) {
        const seq = ['missiles', 'stomp', 'summon', 'missiles', 'stomp'];
        this.state = seq[this.step++ % seq.length];
        this.t = 0; this.shots = 0; this.shotT = 0;
        if (this.state === 'stomp') { this.vy = -400; this.vx = clamp((tgt.cx - this.cx) * 1.1, -150, 150); this.t = 0.3; }
      }
    } else if (this.state === 'missiles') {
      this.vx = 0; this.shotT -= dt;
      if (this.shotT <= 0 && this.shots < 5) {
        this.shotT = 0.3; this.shots++;
        const dx = tgt.cx - this.cx + rand(-50, 50);
        projectiles.push({ kind: 'bomb', owner: 'enemy', x: this.cx, y: this.y + 6, vx: clamp(dx * 0.9, -220, 220), vy: -280, grav: 500, life: 4, dmg: 1 });
        SFX.throw();
      }
      if (this.shots >= 5) { this.t += dt; if (this.t > 1.2) { this.state = 'walk'; this.t = rand(1.2, 2); } }
    } else if (this.state === 'stomp') {
      this.t -= dt;
      if (this.onGround && this.t <= 0) {
        shake = 10; SFX.boom(1.5);
        for (const d of [-1, 1]) projectiles.push({ kind: 'wave', owner: 'enemy', x: this.cx + d * 24, y: this.y + this.h - 6, vx: d * 170, vy: 0, life: 1.8, dmg: 1 });
        for (let i = 0; i < 16; i++) part(this.cx + rand(-24, 24), this.y + this.h, rand(-80, 80), rand(-100, -20), 0.6, '#aaa', 4, 0, 'smoke');
        this.state = 'walk'; this.t = rand(1.2, 2);
      }
    } else if (this.state === 'summon') {
      this.vx = 0; this.t += dt;
      if (this.shots === 0 && this.t > 0.4) {
        this.shots = 1;
        if (enemies.filter(e => e.alive && Math.abs(e.cx - this.cx) < 320).length < 4) {
          for (const d of [-1, 1]) {
            const e = new Enemy(Math.random() < 0.3 ? 'jet' : 'grunt', this.cx + d * 10, this.y + 20);
            e.vy = -200; e.vx = d * 60; e.state = 'alert'; e.alertT = 0.8; e.baseY = this.y - 30;
            enemies.push(e);
          }
          popText(this.cx, this.y - 6, 'GET THEM, BOTS!', '#ff3b3b', 6);
        }
      }
      if (this.t > 1.2) { this.state = 'walk'; this.t = rand(1.5, 2.2); }
    } else if (this.state === 'dying') {
      this.t -= dt; this.vx = 0;
      if (Math.random() < dt * 14) explode(this.x + rand(0, this.w), this.y + rand(0, this.h), rand(14, 26), { dmg: 0, tileDmg: 0 });
      if (this.t <= 0) {
        this.alive = false;
        explode(this.cx, this.y + this.h / 2, 70, { dmg: 0, tileDmg: 0 });
        flash = 0.8; flashColor = '#fff'; shake = 14;
        for (let i = 0; i < 40; i++) part(this.cx, this.y + 30, rand(-200, 200), rand(-350, -50), rand(1, 2), pick(['#8d99ae', '#5c677d', '#ffcc00', '#333']), 4, 600, 'gear');
        for (let i = 0; i < 6; i++) launchFirework(this.cx + rand(-60, 60), this.y + this.h);
        setBanner('MEGA GRUMP DEFEATED!', '#ffd34d', 3, 'Now go raise the flag!');
        score += 5000;
        if (flag) flag.locked = false;
        startMusic(false);
      }
    }
    if (this.state !== 'sleep') {
      this.vy = Math.min(this.vy + GRAV * dt, MAXFALL);
      moveX(this, this.vx * dt);
      const ry = moveY(this, this.vy * dt);
      this.onGround = ry === 1; if (ry) this.vy = 0;
      this.x = clamp(this.x, this.minX, level.w * TILE - this.w - 2);
      for (const p of players) if (p.alive && this.state !== 'dying' && overlap(p, this)) p.hurt(1, this.cx);
    }
  }
  damage(d) {
    if (!this.alive || this.state === 'dying') return;
    if (this.state === 'sleep') { this.state = 'intro'; this.t = 1; startMusic(true); }
    this.hp -= d; this.flash = 0.08;
    if (this.hp <= 0) { this.hp = 0; this.state = 'dying'; this.t = 2.4; projectiles = projectiles.filter(b => b.owner !== 'enemy'); }
  }
}

// ---------------------------------------------------------------- pickups / props
class Pickup {
  constructor(kind, cx, bottom) { Object.assign(this, { kind, x: cx - 5, y: bottom - 10, w: 10, h: 10, vy: 0, t: rand(0, 6), taken: false }); }
  update(dt) {
    this.t += dt;
    if (this.kind !== 'dove') { this.vy = Math.min(this.vy + GRAV * dt, MAXFALL); if (moveY(this, this.vy * dt)) this.vy = 0; }
    for (const p of players) if (p.alive && !this.taken && overlap(p, this)) {
      this.taken = true; SFX.pickup();
      const cx = this.x + 5;
      if (this.kind === 'uranium') { p.specials = Math.min(5, p.specials + 1); popText(cx, this.y - 4, 'URANIUM! +1 BOMB', '#39ff14'); }
      if (this.kind === 'teddy') { p.specials = Math.min(5, p.specials + 1); popText(cx, this.y - 4, 'PLUSHIE! +1 BOMB', '#ffb36b'); }
      if (this.kind === 'heart') { p.hp = p.maxHp; popText(cx, this.y - 4, 'FULL HEALTH!', '#ff6b6b'); }
      if (this.kind === 'dove') { p.shield = 10; setBanner('PEACE DOVE SHIELD!', '#fff', 2, 'Nothing can hurt you for a while!'); }
      score += 50;
      for (let i = 0; i < 10; i++) part(cx, this.y + 5, rand(-60, 60), rand(-90, -10), 0.5, '#fff', 2, 100, 'star');
    }
  }
}

function freeCage(c) {
  if (c.freed) return;
  c.freed = true; level.rescues++; lives = Math.min(9, lives + 1); score += 500;
  rescuedAll.push(c.look);
  SFX.rescue();
  setBanner(c.name + ' RESCUED!', '#7dffa0', 2.2, '+1 LIFE - Family sticks together!');
  for (let i = 0; i < 16; i++) part(c.x + 8, c.y + 8, rand(-100, 100), rand(-150, -30), 0.8, pick(['#8d99ae', '#555']), 2, 500);
  for (let i = 0; i < 12; i++) part(c.x + 8, c.y, rand(-40, 40), rand(-100, -40), 1, '#ff6b9b', 3, -20, 'heart');
  followers.push({ x: c.x + 3, y: c.y + 2, w: 10, h: 18, vx: 0, vy: -200, look: c.look, name: c.name, facing: 1, anim: 0, onGround: false, idx: followers.length, dance: 0 });
}
function updateFollowers(dt) {
  for (const f of followers) {
    f.anim += dt;
    const lead = players.find(p => p.alive) || players[0];
    if (state === 'play' && lead) {
      const tx = lead.cx - lead.facing * (18 + f.idx * 14);
      const dx = tx - (f.x + 5);
      f.vx = Math.abs(dx) > 6 ? sign(dx) * Math.min(RUN * 1.1, Math.abs(dx) * 3) : 0;
      if (f.vx) f.facing = sign(f.vx);
      if (f.onGround && (touchingWall(f, sign(dx)) && Math.abs(dx) > 6 || lead.y < f.y - 30)) f.vy = -JUMP;
      if (Math.abs(dx) > 260 || f.y > level.h * TILE) { f.x = clamp(lead.x - lead.facing * 20, camX, camX + VW - 10); f.y = lead.y - 40; f.vy = 0; }
    }
    if (f.carried) continue;
    f.vy = Math.min(f.vy + GRAV * dt, MAXFALL);
    moveX(f, f.vx * dt);
    const ry = moveY(f, f.vy * dt);
    f.onGround = ry === 1; if (ry) f.vy = 0;
  }
}

function updateProps(dt) {
  for (const c of cages) {
    if (c.freed) continue;
    c.vy = Math.min(c.vy + GRAV * dt, MAXFALL); if (moveY(c, c.vy * dt)) c.vy = 0;
    for (const p of players) if (p.alive && overlap(p, c)) freeCage(c);
  }
  for (const c of crosses) {
    c.glow += dt;
    if (c.active) continue;
    for (const p of players) if (p.alive && overlap(p, { x: c.x - 6, y: c.y, w: c.w + 12, h: c.h })) {
      c.active = true; c.glow = 0;
      checkpoint = { x: c.x + 1, y: c.y + c.h - 20 };
      for (const q of players) { if (q.alive) q.hp = q.maxHp; else if (q.waiting || q.deadT > 0) respawn(q, c.x + 1, c.y + c.h - 20); }
      setBanner('JESUS LOVES YOU!', '#ffd34d', 2.6, 'Checkpoint! Health restored!');
      SFX.holy();
      part(c.x + 6, c.y + 4, 30, -40, 2.5, '#fff', 8, -5, 'dove');
      for (let i = 0; i < 30; i++) { const a = rand(0, Math.PI * 2); part(c.x + 6, c.y + 10, Math.cos(a) * 80, Math.sin(a) * 80, 1, pick(['#fff', '#ffd34d', '#fff3b0']), 2, 0, 'star', 2); }
      break;
    }
  }
  if (flag && !flag.locked && flag.drop < 1) flag.drop = Math.min(1, flag.drop + dt * 1.2);
}

// ---------------------------------------------------------------- projectiles & grenades
function updateProjectiles(dt) {
  for (const b of projectiles) {
    b.life -= dt;
    if (b.grav) b.vy += b.grav * dt;
    if (b.homing && b.life < 1.3) { // steer toward the nearest robot ahead
      const t = homingTarget(b);
      if (t) {
        const sp = Math.hypot(b.vx, b.vy) || 270, cur = Math.atan2(b.vy, b.vx);
        let d = Math.atan2(t.y + t.h / 2 - b.y, t.x + t.w / 2 - b.x) - cur;
        while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        const na = cur + clamp(d, -5 * dt, 5 * dt);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.kind === 'rocket' && Math.random() < 0.7) part(b.x - sign(b.vx) * 4, b.y, rand(-10, 10), rand(-10, 10), 0.3, '#ccc', 2, 0, 'smoke');
    if (b.kind === 'missile' && Math.random() < 0.7) part(b.x - sign(b.vx) * 5, b.y, 0, rand(-10, 10), 0.4, '#aaa', 2, 0, 'smoke');
    if (b.kind === 'bomb' && Math.random() < 0.5) part(b.x, b.y, 0, 0, 0.3, '#ffd34d', 2);
    if (b.life <= 0 || b.x < camX - 100 || b.x > camX + VW + 100 || b.y > level.h * TILE + 20) { b.dead = true; continue; }
    const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE);
    if (isSolid(tx, ty)) {
      b.dead = true;
      if (b.kind === 'rocket') { explode(b.x, b.y, 18, { dmg: 2, tileDmg: 2 }); if (b.fw) fireworkSparks(b); }
      else if (b.kind === 'chord') damageTile(tx, ty, 1);
      else if (b.kind === 'laser') { damageTile(tx, ty, 0.5); for (let i = 0; i < 3; i++) part(b.x, b.y, rand(-60, 60), rand(-60, 20), 0.2, '#39ff14', 2); }
      else if (b.kind === 'missile' || b.kind === 'bomb') explode(b.x, b.y, 22, { owner: 'enemy', tileDmg: 2 });
      else for (let i = 0; i < 3; i++) part(b.x, b.y, rand(-50, 50), rand(-50, 10), 0.2, '#ff6b3b', 2);
      continue;
    }
    if (b.owner === 'player') {
      const targets = boss && boss.alive && boss.state !== 'dying' ? [...enemies, boss] : enemies;
      for (const e of targets) {
        if (e.alive === false || b.hit.has(e)) continue;
        if (b.x < e.x - 2 || b.x > e.x + e.w + 2 || b.y < e.y || b.y > e.y + e.h) continue;
        b.hit.add(e);
        if (e.type === 'shield' && b.kind !== 'rocket' && b.kind !== 'chord' && sign(b.vx) === -e.facing) { // sound goes around shields
          b.dead = true; SFX.clank(); for (let i = 0; i < 4; i++) part(b.x, b.y, -b.vx * rand(0.1, 0.3), rand(-80, 20), 0.25, '#fff', 2, 300);
          break;
        }
        if (b.kind === 'rocket') { b.dead = true; e.damage(b.dmg, b.x - b.vx); explode(b.x, b.y, 18, { dmg: 1, tileDmg: 2 }); if (b.fw) fireworkSparks(b); break; }
        e.damage(b.dmg, b.x - b.vx);
        if (--b.pierce < 0) { b.dead = true; break; }
      }
    } else {
      for (const p of players) {
        if (!p.alive || b.x < p.x - 1 || b.x > p.x + p.w + 1 || b.y < p.y || b.y > p.y + p.h) continue;
        if (b.kind === 'wave' && p.inv > 0) continue;
        b.dead = true;
        if (b.kind === 'missile' || b.kind === 'bomb') explode(b.x, b.y, 22, { owner: 'enemy', tileDmg: 2 });
        else p.hurt(1, b.x - b.vx);
        if (p.shield > 0) for (let i = 0; i < 4; i++) part(b.x, b.y, rand(-60, 60), rand(-60, 0), 0.3, '#fff', 2);
        break;
      }
    }
  }
  projectiles = projectiles.filter(b => !b.dead);
}

function fireworkSparks(b) {
  for (let k = 0; k < 3; k++) pending.push({ kind: 'spark', x: b.x + rand(-20, 20), y: b.y + rand(-16, 8), delay: 0.08 + k * 0.08 });
}
function updateGrenades(dt) {
  for (const g of grenades) {
    g.fuse -= dt; g.spin += g.vx * dt * 0.15;
    g.vy = Math.min(g.vy + 700 * dt, MAXFALL);
    if (moveX(g, g.vx * dt)) g.vx *= -0.5;
    const ry = moveY(g, g.vy * dt);
    if (ry === 1) { g.vy = Math.abs(g.vy) > 60 ? -Math.abs(g.vy) * 0.35 : 0; g.vx *= 0.75; }
    else if (ry === -1) g.vy = 0;
    if (g.kind === 'core') {
      g.beep -= dt;
      if (g.beep <= 0) { g.beep = Math.max(0.08, g.fuse * 0.3); SFX.beep(); }
      if (Math.random() < 0.6) part(g.x + 4, g.y + 4, rand(-15, 15), rand(-25, -5), 0.4, '#39ff14', 2);
    }
    if (g.kind === 'rollbear') { // keeps rolling, hops over walls, booms as it goes
      g.vx = g.dir * 170;
      if (touchingWall(g, g.dir) && ry === 1) g.vy = -260;
      g.tick -= dt;
      if (g.tick <= 0) { g.tick = 0.25; explode(g.x + 6, g.y + 10, 24, { dmg: 4, tileDmg: 2 }); }
    }
    let boom = g.fuse <= 0 || g.y > level.h * TILE || (g.impact && ry === 1);
    if (g.kind !== 'rollbear') {
      for (const e of enemies) if (e.alive && overlap(g, e)) boom = true;
      if (boss && boss.alive && boss.state !== 'dying' && overlap(g, boss)) boom = true;
    }
    if (boom) {
      g.dead = true;
      const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
      if (g.kind === 'teddy') {
        explode(cx, cy, g.r || 54, { dmg: g.dmg || 12, tileDmg: g.mini ? 3 : 5 });
        for (let i = 0; i < (g.mini ? 10 : 24); i++) part(cx, cy, rand(-160, 160), rand(-220, -20), rand(0.8, 1.6), pick(['#fff', '#f5f5f5', '#ffd6e7']), rand(3, 5), 250, 'smoke');
        for (let i = 0; i < (g.mini ? 4 : 10); i++) part(cx, cy, rand(-100, 100), rand(-160, -40), 1.2, '#ff6b9b', 3, 120, 'heart');
        if (!g.mini && !g.quiet) popText(cx, cy - 20, 'KA-BEAR!!', '#ffb36b', 9);
        if (g.split) for (let i = 0; i < 3; i++) grenades.push({ x: cx - 3, y: cy - 6, w: 6, h: 6, vx: (i - 1) * 140, vy: -240, kind: 'teddy', mini: true, fuse: 0.6 + i * 0.15, spin: 0, r: 30, dmg: 5 });
      } else if (g.kind === 'rollbear') {
        explode(cx, cy, 60, { dmg: 14, tileDmg: 5 });
        popText(cx, cy - 20, 'MEGA KA-BEAR!!', '#ffb36b', 9);
      } else if (g.kind === 'amp') {
        explode(cx, cy, 34, { dmg: 8, tileDmg: 3 });
        popText(cx, cy - 16, 'AMP DROP!', '#ff7b54', 7);
      } else nuke(cx, cy, g.tier || 2);
    }
  }
  grenades = grenades.filter(g => !g.dead);
}

// ---------------------------------------------------------------- fx update
function updateFx(dt) { // purely visual: every screen runs this for itself
  NET.fxLocal = true;
  try { updateFxInner(dt); } finally { NET.fxLocal = false; }
}
function updateFxInner(dt) {
  for (const p of particles) {
    p.life -= dt; p.vy += p.grav * dt;
    if (p.drag) { p.vx *= Math.max(0, 1 - p.drag * dt); p.vy *= Math.max(0, 1 - p.drag * dt); }
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 8;
  }
  particles = particles.filter(p => p.life > 0);
  for (const e of explosions) e.t += dt;
  explosions = explosions.filter(e => e.t < e.max);
  for (const n of nukes) n.t += dt;
  nukes = nukes.filter(n => n.t < n.max);
  for (const t of texts) { t.t -= dt; t.y -= 22 * dt; }
  texts = texts.filter(t => t.t > 0);
  for (const r of rockets) {
    r.fuse -= dt; r.x += r.vx * dt; r.y += r.vy * dt; r.vy += 60 * dt;
    part(r.x, r.y, rand(-10, 10), rand(10, 30), 0.3, '#ffd34d', 1.5);
    if (r.fuse <= 0) {
      r.dead = true; SFX.pop();
      const n = 36, s0 = rand(70, 110);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, s = s0 * rand(0.7, 1);
        part(r.x, r.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.9, 1.5), pick(r.colors), 2, 50, 'star', 1.6);
      }
    }
  }
  rockets = rockets.filter(r => !r.dead);
  for (const c of corpses) {
    c.t -= dt; c.vy += GRAV * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
    if (c.t <= 0) {
      c.dead = true;
      for (let i = 0; i < 8; i++) part(c.x, c.y, rand(-90, 90), rand(-140, -20), rand(0.6, 1.1), pick(['#8d99ae', '#5c677d', '#ffcc00']), 3, 500, 'gear');
      for (let i = 0; i < 5; i++) part(c.x + rand(-5, 5), c.y + rand(-5, 5), rand(-15, 15), rand(-30, -5), 0.8, '#888', 4, 0, 'smoke');
      SFX.pop();
    }
  }
  corpses = corpses.filter(c => !c.dead);
  shake = Math.max(0, shake - dt * 25);
  flash = Math.max(0, flash - dt * 1.2);
  if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
}

function updateCamera(dt, instant) {
  const alive = players.filter(p => p.alive && !p.carried);
  if (!alive.length) return;
  let tx = alive.reduce((s, p) => s + p.cx, 0) / alive.length - VW / 2;
  if (alive.length === 1) tx += alive[0].facing * 40;
  tx = clamp(tx, 0, level.w * TILE - VW);
  camX = instant ? tx : camX + (tx - camX) * Math.min(1, dt * 5);
  camY = 0;
}

// ---------------------------------------------------------------- game flow
const startLives = () => START_LIVES + (party.length - 1) * 2;
const heroVariant = i => party.slice(0, i).filter(q => q.hero === party[i].hero).length;
function startGame() {
  lives = startLives(); score = 0; rescuedAll = []; familyCounter = 0;
  levelIndex = startLevelSel;
  state = 'story'; stateT = 0; // every level starts with its chapter of the story
}
function startLevel(i) {
  levelIndex = i;
  NET.levelSeq++; NET.tileDiffs = []; NET.fullT = 0;
  const s = buildLevel(i);
  players = party.map((slot, i) => {
    const p = new Player(i, slot.hero, s.x + i * 14, s.y);
    p.v = heroVariant(i); // same brother picked twice? give them a different outfit
    return p;
  });
  levelStartScore = score; rescuedAtLevelStart = rescuedAll.length;
  updateCamera(0, true);
  state = 'intro'; stateT = 0; paused = false; cut = null;
  stopMusic();
}
function restartLevel() {
  lives = startLives(); score = levelStartScore; rescuedAll = rescuedAll.slice(0, rescuedAtLevelStart);
  familyCounter = rescuedAll.length;
  startLevel(levelIndex);
}
function checkGameOver() {
  if (lives > 0) return;
  if (players.every(p => !p.alive && p.deadT <= 0)) { state = 'gameover'; stateT = 0; stopMusic(); }
}

function updateWorld(dt) {
  for (const p of players) p.update(dt, getInput(p.idx));
  for (const e of enemies) e.update(dt);
  enemies = enemies.filter(e => e.alive);
  if (boss) boss.update(dt);
  updateProjectiles(dt);
  updateGrenades(dt);
  for (const p of pickups) p.update(dt);
  pickups = pickups.filter(p => !p.taken);
  updateProps(dt);
  updateFollowers(dt);
  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i]; p.delay -= dt;
    if (p.delay <= 0) { pending.splice(i, 1); kidExplosion(p); }
  }
  updateFx(dt);
  updateCamera(dt);
  checkDropIn();
  checkGameOver();
}

// ---------------------------------------------------------------- level-complete cutscenes
const ENDINGS = ['eagle', 'bear', 'dance', 'final'];
function startCutscene() {
  state = 'cutscene'; stateT = 0;
  cut = { t: 0, ending: ENDINGS[levelIndex] || 'eagle', eagle: null, bear: null, fw: 0, summary: false, beat: 0 };
  stopMusic(); SFX.fanfare();
  projectiles = []; grenades = [];
  for (const e of enemies) { e.alive = false; addCorpse({ type: e.type, x: e.cx, y: e.cy, w: e.w, h: e.h, vx: rand(-80, 80), vy: -200, rot: 0, vr: 8, t: 0.6, facing: e.facing }); }
  enemies = [];
  for (const p of players) {
    if (!p.alive) respawn(p, flag.x - 20 - p.idx * 14, flag.bottom - 20);
    p.inv = 999; p.vx = 0;
  }
  unlocked = Math.max(unlocked, Math.min(LEVELS.length, levelIndex + 2));
  try { localStorage.setItem('boombros_unlocked', String(unlocked)); } catch (e) { /* ignore */ }
}
function updateCutscene(dt, m) {
  cut.t += dt; const t = cut.t;
  flag.raised = clamp(t / 1.6, 0, 1);
  cut.fw -= dt;
  if (t > 0.8 && cut.fw <= 0) { cut.fw = cut.ending === 'final' ? 0.25 : 0.5; launchFirework(camX + rand(60, VW - 60), VH - 30); }
  const heroes = players.filter(p => p.alive);
  const gx = heroes.reduce((s, p) => s + p.cx, 0) / Math.max(1, heroes.length);

  if (cut.ending === 'eagle' || cut.ending === 'final') {
    if (t > 1.6 && !cut.eagle) { cut.eagle = { x: camX + VW + 40, y: 10, phase: 'swoop', flap: 0 }; SFX.screech(); }
    const e = cut.eagle;
    if (e) {
      e.flap += dt;
      if (e.phase === 'swoop') {
        const tx = gx, ty = heroes[0] ? heroes[0].y - 22 : 150;
        e.x += (tx - e.x) * Math.min(1, dt * 3); e.y += (ty - e.y) * Math.min(1, dt * 3);
        if (Math.abs(tx - e.x) < 6 && Math.abs(ty - e.y) < 6) { e.phase = 'carry'; heroes.forEach(p => { p.carried = true; }); followers.forEach(f => { f.carried = true; }); setBanner('FREEDOOOOM!', '#ffd34d', 3); SFX.screech(); }
      } else {
        e.x += 90 * dt; e.y -= 70 * dt;
        heroes.forEach((p, i) => { p.x = e.x - 5 + (i - (heroes.length - 1) / 2) * 12; p.y = e.y + 14; p.facing = 1; });
        followers.forEach((f, i) => { f.x = e.x - 5 + ((i % 4) - 1.5) * 12; f.y = e.y + 34 + Math.floor(i / 4) * 20; });
      }
    }
  } else if (cut.ending === 'bear') {
    if (t > 1.6 && !cut.bear) { cut.bear = { x: gx - 16, y: -80, vy: 0, phase: 'drop' }; }
    const b = cut.bear;
    if (b) {
      if (b.phase === 'drop') {
        b.vy += GRAV * dt; b.y += b.vy * dt;
        const ground = flag.bottom - 52;
        if (b.y >= ground) {
          b.y = ground; b.phase = 'land'; b.vy = 0; shake = 8; SFX.boom(1);
          heroes.forEach(p => { p.carried = true; }); followers.forEach(f => { f.carried = true; });
          setBanner('TEDDY ROCKET!', '#ffb36b', 3, 'Everybody hop on!');
        }
      } else {
        if (t > 3.4) {
          if (b.phase !== 'fly') { b.phase = 'fly'; SFX.nuke(); }
          b.vy -= 300 * dt; b.y += b.vy * dt;
          for (let i = 0; i < 3; i++) part(b.x + 16 + rand(-6, 6), b.y + 44, rand(-30, 30), rand(60, 140), 0.6, pick(['#ffd34d', '#ff8c1a', '#fff']), 4, 0, 'sq', 1);
          part(b.x + 16, b.y + 50, rand(-20, 20), rand(20, 60), 1.5, '#ccc', 5, 0, 'smoke');
        }
        heroes.forEach((p, i) => { p.x = b.x + 11 + (i - (heroes.length - 1) / 2) * 9; p.y = b.y - 18; p.facing = 1; });
        followers.forEach((f, i) => { f.x = b.x - 6 + (i % 4) * 12; f.y = b.y - 34 - Math.floor(i / 4) * 18; });
      }
    }
  } else if (cut.ending === 'dance') {
    if (t > 1.6) {
      if (!cut.danced) { cut.danced = true; setBanner('FAMILY DANCE PARTY!', '#ff8ad8', 3.5); }
      cut.beat -= dt;
      const all = [...heroes, ...followers];
      if (cut.beat <= 0) {
        cut.beat = 0.45;
        all.forEach((a, i) => { if ((i + Math.floor(t / 0.45)) % 2 === 0 && a.onGround) { a.vy = -200; } a.facing *= -1; });
        for (let i = 0; i < 8; i++) part(camX + rand(0, VW), -4, rand(-20, 20), rand(30, 60), 3, pick(['#e63946', '#fff', '#1d5fd8', '#ffd34d', '#39ff14', '#ff8ad8']), 3, 20, 'sq');
      }
    }
  }
  for (const p of heroes) if (!p.carried) {
    p.vy = Math.min(p.vy + GRAV * dt, MAXFALL);
    const ry = moveY(p, p.vy * dt); p.onGround = ry === 1; if (ry) p.vy = 0;
  }
  for (const f of followers) if (!f.carried) {
    f.vy = Math.min(f.vy + GRAV * dt, MAXFALL);
    const ry = moveY(f, f.vy * dt); f.onGround = ry === 1; if (ry) f.vy = 0;
  }
  updateFx(dt);
  if (t > 5.5) cut.summary = true;
  if (cut.summary && (m.confirm || t > 14)) {
    if (cut.ending === 'final') { state = 'victory'; stateT = 0; startMusic(false); }
    else { levelIndex++; state = 'story'; stateT = 0; }
  }
}

// ---------------------------------------------------------------- main update
function update(dt) {
  gtime += dt; stateT += dt;
  try {
    if (NET.role === 'client' || state === 'netwait') clientUpdate(dt);
    else { updateState(dt); netHostTick(dt); }
  } finally { latched.clear(); typed.length = 0; NET.remoteLatch = {}; }
}
function updateState(dt) {
  if (actx && MENU_STATES.has(state) && !musicOn && (AUDIO.music || {}).menu) startMusic(false);
  const m = menuInput();
  if (m.mute) toggleMute();
  switch (state) {
    case 'title': updateTitle(dt, m); break;
    case 'lobby': updateLobby(dt, m); break;
    case 'online': updateOnlineMenu(dt, m); break;
    case 'code': updateCodeEntry(dt, m); break;
    case 'story': titleFx += dt; if (m.confirm && stateT > 0.4) startLevel(levelIndex); break;
    case 'intro':
      if ((m.confirm && stateT > 0.5) || stateT > 3.5) { state = 'play'; stateT = 0; startMusic(false); }
      break;
    case 'play':
      if (m.pause) paused = !paused;
      if (paused) { if (m.tap) paused = false; break; }
      updateWorld(dt);
      break;
    case 'cutscene': updateCutscene(dt, m); break;
    case 'gameover': updateFx(dt); if (m.confirm && stateT > 1) restartLevel(); break;
    case 'victory':
      updateFx(dt);
      if (Math.random() < dt * 4) launchFirework(rand(40, VW - 40) + camX, VH);
      if (m.confirm && stateT > 2) {
        stopMusic();
        if (NET.role === 'host') { state = 'lobby'; stateT = 0; lobbyPrev = { esc: true }; } else { state = 'title'; stateT = 0; }
      }
      break;
  }
}

const MENU_Y = 88;
const MENU = () => ['PLAY!  (1-4 PLAYERS)', 'PLAY ONLINE', 'START AT LEVEL ' + (startLevelSel + 1) + (unlocked > 1 ? '  < >' : '')];
const LEVEL_ITEM = 2;
function updateTitle(dt, m) {
  titleFx += dt;
  if (Math.random() < dt * 1.5) launchFirework(rand(40, VW - 40), VH);
  updateFx(dt);
  const n = MENU().length;
  if (m.up) { menuIdx = (menuIdx + n - 1) % n; SFX.hit(); }
  if (m.down) { menuIdx = (menuIdx + 1) % n; SFX.hit(); }
  if (menuIdx === LEVEL_ITEM && (m.left || m.right)) { startLevelSel = (startLevelSel + (m.right ? 1 : unlocked - 1)) % unlocked; SFX.hit(); }
  if (m.tap) {
    for (let i = 0; i < n; i++) if (Math.abs(m.tap.y - (MENU_Y + 4 + i * 16)) < 8) {
      if (i === LEVEL_ITEM) { startLevelSel = (startLevelSel + 1) % unlocked; menuIdx = LEVEL_ITEM; return; }
      menuIdx = i;
    }
    if (m.tap.y < MENU_Y - 6 || m.tap.y > MENU_Y + n * 16) return; // ignore taps outside the menu
  }
  if (m.confirm && stateT > 0.3) {
    if (menuIdx === LEVEL_ITEM) { startLevelSel = (startLevelSel + 1) % unlocked; return; }
    if (menuIdx === 1) { state = 'online'; stateT = 0; onlineIdx = 0; NET.msg = ''; netCheckHomeServer(); return; }
    openLobby(m.tap);
  }
}

// ---------------------------------------------------------------- join screen ("lobby")
let lobbyPrev = {};
function localDevices() {
  const d = ['kbL', 'kbR'];
  for (const p of gamepads()) d.push('pad:' + p.index);
  if (touch.used) d.push('touch');
  return d;
}
function lobbyDevices() {
  const d = localDevices();
  for (const peer in NET.remoteIn) if (NET.peers.get(+peer)?.ok) for (const k in NET.remoteIn[peer]) d.push('net:' + peer + ':' + k);
  return d;
}
// Players can also jump in mid-level by pressing FIRE on a gamepad or another screen.
let dropPrev = {};
function checkDropIn() {
  for (const dev of lobbyDevices()) {
    const st = devState(dev), was = dropPrev[dev]; dropPrev[dev] = st;
    if (dev === 'kbL' || dev === 'kbR' || dev === 'touch' || !was) continue;
    if (!st.join || was.join || party.length >= MAX_PLAYERS || party.some(q => q.dev === dev)) continue;
    joinParty(dev);
    const i = party.length - 1, buddy = players.find(p => p.alive) || players[0];
    const p = new Player(i, party[i].hero, buddy ? buddy.x : checkpoint.x, buddy ? buddy.y - 10 : checkpoint.y);
    p.v = heroVariant(i); p.inv = 2.5;
    players.push(p); lives += 2;
    popText(p.cx, p.y - 10, 'P' + (i + 1) + ' JOINED!', PCOL[i], 7);
  }
}
function joinParty(dev) {
  if (party.length >= MAX_PLAYERS || party.some(q => q.dev === dev)) return;
  // start each new player on whichever hero is picked least so far
  const hero = HERO_ORDER.reduce((best, h) => (party.filter(q => q.hero === h).length < party.filter(q => q.hero === best).length ? h : best), HERO_ORDER[0]);
  party.push({ dev, hero });
  SFX.pickup();
}
function openLobby(tap) {
  party = []; lobbyPrev = { esc: true };
  // whoever pressed the button on the title screen is Player 1
  const devs = lobbyDevices();
  let first = tap && touch.used ? 'touch' : devs.find(d => { const st = devState(d); return st.join || st.start; });
  if (!first && !tap) first = 'kbL';
  if (first) joinParty(first);
  for (const d of devs) lobbyPrev[d] = devState(d); // so the same press doesn't count twice
  state = 'lobby'; stateT = 0;
}
function updateLobby(dt, m) {
  titleFx += dt;
  updateFx(dt);
  let go = false;
  for (const dev of lobbyDevices()) {
    const st = devState(dev), pv = lobbyPrev[dev] || {}; lobbyPrev[dev] = st;
    const e = k => st[k] && !pv[k];
    const slot = party.find(q => q.dev === dev);
    if (!slot) {
      if (e('join')) joinParty(dev);
      else if (e('start') && !party.length) { joinParty(dev); go = true; }
      continue;
    }
    if (e('left') || e('right')) { slot.hero = nextHero(slot.hero, e('left') ? -1 : 1); SFX.swap(); }
    if (e('special')) { party.splice(party.indexOf(slot), 1); SFX.hurt(); continue; }
    if (e('start') && stateT > 0.3) go = true;
  }
  if (m.tap) {
    const touchSlot = party.find(q => q.dev === 'touch');
    if (m.tap.y > 200 && party.length) go = true;
    else if (touch.used && !touchSlot) joinParty('touch');
    else if (touchSlot) { touchSlot.hero = nextHero(touchSlot.hero); SFX.swap(); }
  }
  const esc = down('Escape');
  if (esc && !lobbyPrev.esc) { netClose(); state = 'title'; stateT = 0; return; }
  lobbyPrev.esc = esc;
  if (go && party.length) startGame();
}

// =====================================================================
// RENDERING
// =====================================================================
let SIL = null; // while set, R/px/circle paint in this one colour (used for character outlines)
function R(x, y, w, h, c) { ctx.fillStyle = SIL || c; ctx.fillRect(x, y, w, h); }
function px(ox, oy, W, f) { return (x, y, w, h, c) => { ctx.fillStyle = SIL || c; ctx.fillRect(f > 0 ? ox + x : ox + W - x - w, oy + y, w, h); }; }
function circle(x, y, r, c) { ctx.fillStyle = SIL || c; ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); ctx.fill(); }
function text(str, x, y, o = {}) {
  const size = o.size || 8;
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'top';
  if (o.shadow !== false) { ctx.fillStyle = o.shadowColor || '#000'; ctx.fillText(str, x + Math.max(1, size / 8), y + Math.max(1, size / 8)); }
  ctx.fillStyle = o.color || '#fff'; ctx.fillText(str, x, y);
}
function heart(x, y, c, s = 1) {
  ctx.fillStyle = c;
  ctx.fillRect(x + s, y, 2 * s, s); ctx.fillRect(x + 4 * s, y, 2 * s, s);
  ctx.fillRect(x, y + s, 7 * s, 2 * s); ctx.fillRect(x + s, y + 3 * s, 5 * s, s);
  ctx.fillRect(x + 2 * s, y + 4 * s, 3 * s, s); ctx.fillRect(x + 3 * s, y + 5 * s, s, s);
}

// ---- characters
// Every character is drawn twice: first as a dark silhouette nudged 1 pixel each way (the outline),
// then in colour on top. While SIL is set, R/px/circle paint everything in that one colour.
const OUTLINE = '#1a1424';
function outlined(fn) {
  const prev = SIL;
  SIL = OUTLINE;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.save(); ctx.translate(dx, dy); fn(); ctx.restore(); }
  SIL = prev;
  fn();
}
const shadeCache = new Map();
function shade(hex, amt) { // amt < 0 darkens, > 0 lightens (towards white)
  const key = hex + amt;
  let out = shadeCache.get(key);
  if (out) return out;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16), ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  out = '#' + ch.map(c => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt).toString(16).padStart(2, '0')).join('');
  shadeCache.set(key, out);
  return out;
}
function glow(x, y, r, color, alpha = 0.35) { // soft light that fades out to nothing; skipped while drawing outlines
  if (SIL || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(0.35, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= alpha;
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
function groundShadow(cx, bottom, w) {
  ctx.save(); ctx.globalAlpha *= 0.28; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(cx, bottom, w / 2 + 2, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
// Legs: the far leg is darker, feet lift as they step, the near shoe has a shine.
function legs(p, fr, air, pants, shoes, x1 = 3, x2 = 8) {
  const pantsD = shade(pants, -0.35);
  let a = 0, b1 = 0, b2 = 0;
  if (air) b2 = -1;
  else { a = [0, 1, 0, -1][fr]; b1 = fr === 1 ? -1 : 0; b2 = fr === 3 ? -1 : 0; }
  p(x1 + a, 15 + b1, 3, 3, pantsD); p(x1 + a, 18 + b1, 3, 2, shoes);
  p(x2 - a, 15 + b2, 3, 3, pants); p(x2 - a, 15 + b2, 1, 3, pantsD);
  p(x2 - a, 18 + b2, 4, 2, shoes); p(x2 - a + 1, 18 + b2, 2, 1, '#5a5a66');
}
const NOAH_PAL = [
  { band: '#d62828', shirt: '#2a6fdb', hair: '#6b3e1f', pants: '#1d3557' },
  { band: '#2e9e44', shirt: '#e67e22', hair: '#2b1a0e', pants: '#3b2a1a' },
  { band: '#8e44ad', shirt: '#ecf0f1', hair: '#c08a3e', pants: '#2c3e50' },
  { band: '#111111', shirt: '#c0392b', hair: '#3b2414', pants: '#222222' },
];
const ELIJAH_PAL = [
  { suit: '#f4d03f', suit2: '#c9a227', hand: '#d4ac0d' },
  { suit: '#ff8c42', suit2: '#cc6a2a', hand: '#b85a1f' },
  { suit: '#e8eef2', suit2: '#aab4bc', hand: '#9aa4ac' },
  { suit: '#b388ff', suit2: '#7e57c2', hand: '#6a48a8' },
];
const SKIN = '#f1c27d', SKIN_D = '#d9a066';
function drawNoah(x, y, f, anim, moving, air, muzzle, v = 0) {
  const p = px(x, y, 14, f), fr = moving ? Math.floor(anim * 12) % 4 : 0, C = NOAH_PAL[v % 4];
  const shirtD = shade(C.shirt, -0.3), shirtL = shade(C.shirt, 0.25), bandD = shade(C.band, -0.35), hairL = shade(C.hair, 0.3);
  const flap = Math.floor(anim * 8) % 2;
  // plushie bear backpack
  p(0, 7, 4, 7, '#a0662f'); p(0, 7, 1, 7, '#7a4a1f'); p(0, 6, 1, 1, '#7a4a1f'); p(3, 6, 1, 1, '#7a4a1f');
  p(1, 9, 2, 2, '#e8c39e'); p(1, 8, 1, 1, '#2a1a0a'); p(2, 10, 1, 1, '#2a1a0a'); p(3, 12, 1, 1, '#ff8fb0');
  legs(p, fr, air, C.pants, '#1a1a1a');
  // shirt with a star, belt and buckle
  p(3, 8, 8, 6, C.shirt); p(3, 8, 1, 6, shirtD); p(4, 8, 6, 1, shirtL);
  const star = v === 2 ? '#d62828' : '#fff';
  p(7, 10, 1, 1, star); p(6, 11, 3, 1, star); p(7, 12, 1, 1, star);
  p(3, 14, 8, 1, '#5a3a1a'); p(7, 14, 2, 1, '#ffd34d');
  // head: hair, ear, face
  p(4, 1, 7, 7, SKIN); p(5, 7, 5, 1, SKIN_D); p(4, 4, 1, 3, SKIN_D);
  p(4, 0, 7, 2, C.hair); p(6, 0, 3, 1, hairL); p(3, 1, 1, 4, C.hair); p(4, 4, 1, 2, C.hair);
  p(8, 4, 2, 2, '#fff'); p(9, 4, 1, 2, '#1a1a1a'); p(10, 5, 1, 1, SKIN_D);
  p(7, 6, 1, 1, '#f3a58e'); p(8, 6, 2, 1, '#7a3a1a');
  // bandana with flapping tails
  p(3, 2, 9, 2, C.band); p(3, 3, 9, 1, bandD); p(2, 2, 1, 2, bandD);
  p(0, 3 + flap, 2, 1, C.band); p(0, 4 + flap, 1, 1, bandD);
  // pop-rocket launcher
  p(5, 9, 2, 3, shirtD);
  p(6, 9, 8, 3, '#5d7a2f'); p(6, 9, 8, 1, '#7d9a45'); p(6, 11, 8, 1, '#3d5220');
  p(5, 9, 1, 3, '#2b2b2b'); p(13, 8, 1, 5, '#2b2b2b'); p(9, 8, 2, 1, '#2b2b2b'); p(11, 9, 1, 2, '#d62828');
  p(6, 11, 2, 2, SKIN);
  if (muzzle) { glow(f > 0 ? x + 16 : x - 2, y + 10, 6, '#ffb000'); p(14, 8, 3, 5, '#ffd34d'); p(14, 9, 4, 3, '#fff3b0'); p(18, 10, 1, 1, '#fff'); }
}
function drawElijah(x, y, f, anim, moving, air, muzzle, v = 0) {
  const p = px(x, y, 14, f), fr = moving ? Math.floor(anim * 12) % 4 : 0, C = ELIJAH_PAL[v % 4];
  const g = (Math.sin(gtime * 8) + 1) / 2 > 0.5 ? '#39ff14' : '#7dff5a';
  const suitD = shade(C.suit, -0.25), suitL = shade(C.suit, 0.35);
  // uranium tank backpack
  p(0, 6, 3, 9, '#1b5e20'); p(0, 6, 3, 1, '#9aa'); p(0, 14, 3, 1, '#9aa'); p(1, 7, 1, 7, g); p(0, 7, 1, 7, '#0e3a12');
  glow(f > 0 ? x + 1.5 : x + 12.5, y + 10, 5, '#39ff14', 0.25);
  legs(p, fr, air, C.suit2, '#262630');
  // suit, radiation badge, belt with pouch
  p(3, 7, 9, 8, C.suit); p(3, 7, 1, 8, suitD); p(4, 7, 7, 1, suitL);
  p(5, 9, 3, 3, '#1a1a1a'); p(6, 10, 1, 1, C.suit); p(5, 9, 1, 1, C.suit); p(7, 9, 1, 1, C.suit); p(6, 11, 1, 1, '#1a1a1a');
  p(3, 13, 9, 1, '#4a4a55'); p(9, 13, 2, 2, '#4a4a55');
  // hazmat hood with a glass visor
  p(4, 0, 7, 1, C.suit); p(3, 1, 9, 6, C.suit); p(3, 1, 1, 6, suitD); p(5, 0, 4, 1, suitL);
  p(5, 2, 6, 4, '#9fffbf'); p(5, 5, 6, 1, '#7ed9a0'); p(6, 2, 2, 1, '#fff');
  p(8, 3, 1, 2, '#0a3d1a'); p(10, 3, 1, 2, '#0a3d1a'); p(8, 5, 2, 1, '#0a3d1a');
  p(6, -2, 1, 2, '#888'); p(5, -3, 3, 1, g);
  // uranium ray gun with glowing coils
  p(5, 11, 2, 2, '#333');
  p(6, 10, 6, 2, '#c0c0c0'); p(6, 10, 6, 1, '#e8e8e8'); p(6, 11, 6, 1, '#888');
  p(8, 9, 1, 1, g); p(10, 9, 1, 1, g); p(12, 9, 2, 4, g); p(13, 10, 1, 2, '#fff');
  if (muzzle) { glow(f > 0 ? x + 16 : x - 2, y + 10, 7, '#39ff14'); p(14, 8, 3, 5, '#b6ff6e'); p(14, 9, 4, 3, '#fff'); }
}
const ANDREW_PAL = [
  { shirt: '#23232b', logo: '#39ff14', pants: '#2f4b7c', shoe: '#e63946', band: '#e63946' },
  { shirt: '#5c2a86', logo: '#ffd34d', pants: '#3b3b46', shoe: '#2e9e44', band: '#ffd34d' },
  { shirt: '#1d5fd8', logo: '#fff', pants: '#5a3a1a', shoe: '#ff8c1a', band: '#fff' },
  { shirt: '#7a1f1f', logo: '#7dd3ff', pants: '#222', shoe: '#f4d03f', band: '#7dd3ff' },
];
// Andrew: runner's sweatband, glasses, beard, terminal-logo tee, and a red electric guitar he plays like a blaster.
function drawAndrew(x, y, f, anim, moving, air, muzzle, v = 0) {
  const p = px(x, y, 14, f), fr = moving ? Math.floor(anim * 14) % 4 : 0, C = ANDREW_PAL[v % 4];
  const hair = '#5a3820', beard = '#4a2c16', shirtL = shade(C.shirt, 0.25), shirtD = shade(C.shirt, -0.4);
  // guitar neck sticking up behind his back
  p(0, 4, 2, 2, '#2b1a0a'); p(1, 6, 1, 4, '#8b5a2b');
  legs(p, fr, air, C.pants, C.shoe);
  // tee with a green terminal prompt
  p(3, 8, 8, 7, C.shirt); p(3, 8, 1, 7, shirtD); p(4, 8, 6, 1, shirtL);
  p(5, 10, 1, 1, C.logo); p(6, 11, 1, 1, C.logo); p(5, 12, 1, 1, C.logo); p(7, 12, 2, 1, C.logo);
  // head: hair, sweatband, glasses, beard
  p(4, 1, 7, 7, SKIN); p(4, 4, 1, 3, SKIN_D);
  p(4, 0, 7, 2, hair); p(3, 1, 1, 3, hair); p(5, 0, 3, 1, shade(hair, 0.3));
  p(3, 2, 8, 1, C.band); p(3, 2, 1, 2, C.band);
  p(7, 4, 4, 1, '#1a1a1a'); p(8, 4, 1, 2, '#1a1a1a'); p(10, 4, 1, 2, '#1a1a1a'); p(9, 5, 1, 1, '#fff'); p(6, 4, 1, 1, '#1a1a1a');
  p(5, 6, 6, 2, beard); p(4, 5, 2, 2, beard); p(8, 6, 2, 1, '#c0392b');
  // red electric guitar held like a blaster
  p(4, 10, 5, 4, '#d62828'); p(4, 10, 5, 1, '#ff6b6b'); p(5, 13, 3, 1, '#8b1a1a'); p(6, 11, 2, 1, '#ddd');
  p(9, 10, 5, 1, '#8b5a2b'); p(9, 11, 5, 1, '#5a3618'); p(13, 9, 2, 3, '#2b1a0a'); p(11, 10, 1, 1, '#ffd34d');
  p(6, 9, 2, 2, SKIN); p(10, 11, 2, 2, SKIN);
  if (muzzle) { glow(f > 0 ? x + 16 : x - 2, y + 10, 6, '#ff7b54'); p(15, 9, 1, 1, '#ffd34d'); p(16, 7, 1, 2, '#fff'); p(16, 12, 1, 2, '#fff'); }
}
function drawDrumKit(x, y, anim) { // in front of Andrew while he plays a drum solo
  const hit = Math.floor(anim * 10) % 2;
  outlined(() => {
    R(x - 9, y + 9, 18, 11, '#c0392b'); R(x - 7, y + 11, 14, 7, '#f5e6d0'); R(x - 2, y + 13, 4, 3, '#c0392b');
    R(x + 9, y + 10, 8, 4, '#c0392b'); R(x + 9, y + 9, 8, 1, '#ddd'); R(x + 12, y + 14, 1, 6, '#888');
    R(x - 17, y + 3 + hit, 9, 1, '#ffd34d'); R(x - 13, y + 4, 1, 16, '#888');
    R(x - 5 + hit * 6, y + 3 - hit * 2, 1, 6, '#e8d0a0'); R(x + 4 - hit * 6, y + 3 - (1 - hit) * 2, 1, 6, '#e8d0a0');
  });
}
function drawPick(x, y, s = 1) { // a tortoiseshell guitar pick: Andrew's special-move ammo
  const c = '#c9762c', d = '#6e3510';
  R(x, y, 10 * s, 2 * s, d); R(x + s, y, 8 * s, 2 * s, c); R(x + s, y + 2 * s, 8 * s, 2 * s, c); R(x + 2 * s, y + 4 * s, 6 * s, 2 * s, c);
  R(x + 3 * s, y + 6 * s, 4 * s, 2 * s, c); R(x + 4 * s, y + 8 * s, 2 * s, s, d);
  R(x + 2 * s, y + s, 2 * s, s, d); R(x + 6 * s, y + 3 * s, 2 * s, s, d); R(x + 4 * s, y + 5 * s, s, s, d); R(x + 2 * s, y + 2 * s, s, s, '#f0b070');
}
function drawAmmoIcon(hero, x, y, s) {
  if (hero === 'noah') drawTeddy(x, y, s); else if (hero === 'elijah') drawCrystal(x, y, s); else drawPick(x, y + 1, s);
}
function drawHero(hero, x, y, f, anim, moving, air, muzzle, v = 0) {
  if (hero === 'andrew') { outlined(() => drawAndrew(x, y, f, anim, moving, air, muzzle, v)); return; }
  outlined(() => (hero === 'noah' ? drawNoah : drawElijah)(x, y, f, anim, moving, air, muzzle, v));
}
function drawPerson(x, y, f, look, anim, moving, air) {
  outlined(() => {
    const L = FAMILY_LOOKS[look % FAMILY_LOOKS.length];
    const p = px(x, y, 12, f), fr = moving ? Math.floor(anim * 12) % 4 : 0;
    if (L.long) { p(2, 1, 8, 9, L.hair); p(2, 1, 1, 9, shade(L.hair, -0.3)); }
    legs(p, fr, air, L.pants, '#222', 2, 7);
    p(2, 8, 8, 7, L.shirt); p(2, 8, 1, 7, shade(L.shirt, -0.3)); p(3, 8, 6, 1, shade(L.shirt, 0.3));
    p(3, 1, 7, 7, L.skin); p(4, 7, 5, 1, shade(L.skin, -0.15));
    p(3, 0, 7, 2, L.hair); p(5, 0, 3, 1, shade(L.hair, 0.3)); p(2, 1, 1, 3, L.hair);
    p(7, 3, 2, 2, '#fff'); p(8, 3, 1, 2, '#222'); p(6, 5, 1, 1, '#f3a58e'); p(6, 6, 3, 1, '#c0392b');
    p(9, 9, 2, 3, shade(L.shirt, -0.15)); p(10, 11, 2, 2, L.skin); // waving arm
  });
}
const BOT_COLORS = {
  grunt: { body: '#8d99ae', dark: '#5c677d', eye: '#ff3b3b' }, shield: { body: '#7f9cc0', dark: '#4f6584', eye: '#ff3b3b' },
  jet: { body: '#a493c0', dark: '#6c5c8a', eye: '#ffcc00' }, heavy: { body: '#c0504d', dark: '#7d2b2b', eye: '#ffeb3b' },
};
function drawBot(type, x, y, f, anim, flashing, moving, state) {
  outlined(() => drawBotParts(type, x, y, f, anim, flashing, moving, state));
}
function drawBotParts(type, x, y, f, anim, flashing, moving, state) {
  const C = flashing ? { body: '#fff', dark: '#ddd', eye: '#fff' } : BOT_COLORS[type];
  const hi = flashing ? '#fff' : shade(C.body, 0.35), lo = flashing ? '#ddd' : shade(C.dark, -0.35);
  const W = type === 'heavy' ? 18 : 16, p = px(x - 2, y, W, f);
  const fr = moving ? Math.floor(anim * 10) % 4 : 0, o = [0, 1, 0, -1][fr];
  const blink = Math.floor(anim * 3 + x) % 4 === 0, led = flashing ? '#fff' : blink ? '#39ff14' : '#1d6b33';
  const eyeX = f > 0 ? x - 2 + 10 : x - 2 + W - 10;
  if (type === 'jet') {
    p(0, 3, 4, 9, '#4a4a55'); p(0, 3, 1, 9, '#2e2e36'); p(1, 4, 2, 1, '#8a8a99');
    const fl = Math.floor(anim * 20) % 3;
    p(1, 12, 2, 3 + fl, '#ff8c1a'); p(1, 12, 2, 1 + fl, '#ffd34d');
    glow(f > 0 ? x - 1 : x + 13, y + 14, 5, '#ff8c1a', 0.4);
    p(3, 0, 10, 6, C.body); p(3, 0, 10, 1, hi); p(3, 5, 10, 1, C.dark);
    p(7, 1, 6, 4, '#1a1a1a'); p(8, 2, 5, 2, C.eye); p(11, 2, 1, 1, '#fff');
    p(2, 6, 11, 7, C.dark); p(2, 6, 11, 1, C.body); p(4, 8, 3, 2, '#2b2d42'); p(5, 8, 1, 1, led);
    p(9, 8, 7, 2, '#222'); p(9, 8, 7, 1, '#444');
    glow(eyeX, y + 3, 4, C.eye, 0.3);
    return;
  }
  if (type === 'heavy') {
    p(3, 0, 11, 7, C.body); p(3, 0, 11, 1, hi); p(3, 6, 11, 1, lo);
    p(8, 1, 6, 4, '#1a1a1a'); p(9, 2, 5, 2, C.eye); p(12, 2, 1, 1, '#fff');
    p(2, 7, 13, 8, C.dark); p(2, 7, 13, 1, C.body); p(4, 9, 6, 4, '#2b2d42'); p(5, 10, 1, 1, led); p(7, 10, 1, 1, '#ff3b3b');
    p(3, 8, 1, 1, hi); p(13, 8, 1, 1, hi); p(3, 13, 1, 1, hi); p(13, 13, 1, 1, hi);
    p(0, 3, 17, 4, '#4b5320'); p(0, 3, 17, 1, '#6b7340'); p(0, 6, 17, 1, '#2b3310');
    p(5, 3, 1, 4, '#ffd34d'); p(7, 3, 1, 4, '#ffd34d'); p(16, 2, 2, 6, '#2b2b2b'); p(0, 4, 2, 2, '#ff8c1a');
    p(3 + o, 15, 4, 5, '#2b2d42'); p(3 + o, 15, 4, 1, lo); p(2 + o, 19, 6, 1, '#111');
    p(10 - o, 15, 4, 5, '#3b3d52'); p(10 - o, 19, 5, 1, '#111');
    glow(eyeX + (f > 0 ? 1 : -1), y + 3, 4, C.eye, 0.3);
    return;
  }
  // grunt & shield bot
  p(5, -3, 1, 3, C.dark); p(4, -4, 3, 1, blink ? '#fff' : C.eye);
  p(3, 0, 10, 6, C.body); p(3, 0, 10, 1, hi); p(3, 0, 1, 6, C.dark); p(3, 5, 10, 1, C.dark);
  p(7, 1, 6, 4, '#1a1a1a'); p(8, 2, 4, 2, C.eye); p(10, 2, 1, 1, '#fff');
  if (state === 'alert' && !flashing) p(8, 2, 4, 2, '#fff');
  p(2, 6, 11, 7, C.dark); p(2, 6, 11, 1, C.body); p(2, 6, 2, 3, C.body);
  p(4, 8, 4, 3, '#2b2d42'); p(5, 9, 1, 1, led); p(6, 9, 1, 1, '#ff3b3b');
  p(8, 9, 8, 2, '#222'); p(8, 9, 8, 1, '#444'); p(15, 8, 1, 4, '#111'); p(8, 9, 2, 2, C.body);
  p(3 + o, 13, 3, 4, lo); p(2 + o, 17, 5, 1, '#111');
  p(9 - o, 13, 3, 4, '#2b2d42'); p(9 - o, 15, 3, 1, C.dark); p(8 - o, 17, 5, 1, '#111');
  if (type === 'shield') {
    p(14, 1, 3, 16, '#4a90e2'); p(14, 1, 1, 16, '#2a60a8'); p(15, 3, 1, 12, '#a8d0ff');
    p(14, 8, 3, 1, '#ffd34d'); p(15, 2, 1, 1, '#fff'); p(15, 15, 1, 1, '#fff');
  }
  glow(eyeX, y + 3, 4, C.eye, state === 'alert' ? 0.5 : 0.28);
}

function drawEagle(x, y, flap) {
  const up = Math.floor(flap * 8) % 2 === 0;
  R(x - 10, y + 4, 22, 8, '#5b3a1a');
  if (up) { R(x - 22, y - 6, 16, 6, '#5b3a1a'); R(x + 6, y - 6, 16, 6, '#5b3a1a'); R(x - 26, y - 10, 8, 4, '#4a2e12'); R(x + 18, y - 10, 8, 4, '#4a2e12'); }
  else { R(x - 24, y + 8, 16, 5, '#5b3a1a'); R(x + 8, y + 8, 16, 5, '#5b3a1a'); }
  R(x + 10, y, 10, 8, '#fff'); R(x + 19, y + 3, 5, 3, '#ffcc00'); R(x + 15, y + 2, 2, 2, '#222');
  R(x - 16, y + 6, 7, 5, '#fff');
  R(x - 2, y + 12, 2, 4, '#ffcc00'); R(x + 4, y + 12, 2, 4, '#ffcc00');
}
function drawTeddy(x, y, s = 1) { // a little plushie bear head
  R(x, y, 3 * s, 3 * s, '#8b5a2b'); R(x + 7 * s, y, 3 * s, 3 * s, '#8b5a2b');
  R(x + s, y + s, 8 * s, 8 * s, '#a0662f'); R(x + 3 * s, y + 5 * s, 4 * s, 3 * s, '#e8c39e');
  R(x + 3 * s, y + 3 * s, s, s, '#222'); R(x + 6 * s, y + 3 * s, s, s, '#222'); R(x + 4 * s, y + 5 * s, 2 * s, s, '#222');
}
function drawCrystal(x, y, s = 1) {
  const g = (Math.sin(gtime * 6) + 1) / 2;
  if (!SIL) { ctx.globalAlpha = 0.3 + g * 0.3; circle(x + 5 * s, y + 5 * s, 7 * s, '#39ff14'); ctx.globalAlpha = 1; }
  R(x + 3 * s, y, 4 * s, 10 * s, '#39ff14'); R(x + 1 * s, y + 2 * s, 8 * s, 6 * s, '#39ff14'); R(x + 4 * s, y + 1 * s, 2 * s, 7 * s, '#d8ffc8');
}
function drawDove(x, y, flap) {
  const up = Math.floor(flap * 8) % 2 === 0;
  R(x, y + 3, 9, 4, '#fff'); R(x + 8, y + 1, 4, 4, '#fff'); R(x + 11, y + 3, 2, 1, '#ffb36b'); R(x + 9, y + 2, 1, 1, '#222');
  R(x - 2, y + 4, 3, 2, '#eee');
  if (up) R(x + 2, y - 2, 5, 5, '#f4f4f4'); else R(x + 2, y + 6, 5, 4, '#f4f4f4');
}
function drawFlagCloth(x, y, w, h, wave) {
  for (let c = 0; c < w; c++) {
    const yo = wave ? Math.round(Math.sin(gtime * 7 - c * 0.45) * 1.2) : 0;
    for (let s = 0; s < 7; s++) R(x + c, y + yo + Math.floor(s * h / 6.5), 1, Math.max(1, Math.floor(h / 13)), '#d62828');
    for (let s = 0; s < 6; s++) R(x + c, y + yo + Math.floor((s + 0.5) * h / 6.5), 1, Math.max(1, Math.floor(h / 13)), '#fff');
    if (c < w * 0.42) {
      R(x + c, y + yo, 1, Math.ceil(h * 0.54), '#1d3fa8');
      for (let r = 1; r < h * 0.54 - 1; r += 2) if ((c + r) % 3 === 0) R(x + c, y + yo + r, 1, 1, '#fff');
    }
  }
}

// ---- background
const wrap = (v, span) => ((v % span) + span) % span;
function ridgeY(x, off, base, amp, fq) { const w = x + off; return base - Math.sin(w * fq) * amp - Math.sin(w * fq * 2.7 + 1) * amp * 0.4; }
function ridge(off, base, amp, color, fq) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, VH);
  for (let x = 0; x <= VW; x += 4) ctx.lineTo(x, ridgeY(x, off, base, amp, fq));
  ctx.lineTo(VW, VH); ctx.fill();
}
function skyGradient(stops) {
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  stops.forEach(([at, c]) => g.addColorStop(at, c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
}
function cloud(x, y, s) {
  circle(x + 2, y + 4, 10 * s, '#c9dff0'); circle(x + 14 * s, y + 1, 12 * s, '#c9dff0'); circle(x + 28 * s, y + 4, 9 * s, '#c9dff0');
  circle(x, y, 10 * s, '#fff'); circle(x + 12 * s, y - 4, 12 * s, '#fff'); circle(x + 26 * s, y, 9 * s, '#fff');
  R(x - 8 * s, y + 2, 42 * s, 6 * s, '#fff');
}
function saguaro(x, y, s) { // the big Arizona cactus
  const c = '#3a7a3a', d = '#2c5e2c', h = 26 * s;
  R(x - 2 * s, y - h, 4 * s, h, c); R(x - 2 * s, y - h, 1 * s, h, '#4f9a4f'); R(x + 1 * s, y - h, 1 * s, h, d);
  R(x - 8 * s, y - h * 0.62, 6 * s, 3 * s, c); R(x - 8 * s, y - h * 0.9, 3 * s, h * 0.3, c);
  R(x + 2 * s, y - h * 0.48, 5 * s, 3 * s, c); R(x + 5 * s, y - h * 0.75, 3 * s, h * 0.3, c);
  R(x - 1 * s, y - h - 1, 2 * s, 1, '#ffd34d');
}
function tree(x, y, s, c, c2) {
  R(x - 1, y - 6 * s, 2, 6 * s + 2, '#4a3220');
  circle(x, y - 9 * s, 6 * s, c); circle(x - 3 * s, y - 6 * s, 4 * s, c); circle(x + 3 * s, y - 6 * s, 4 * s, c);
  circle(x - 2 * s, y - 11 * s, 2.5 * s, c2);
}
function drawBackground() {
  const th = LEVELS[level ? level.index : 0].theme;
  const ox = camX;
  if (th === 'valley' || state === 'title' || state === 'story' || state === 'lobby' || state === 'online' || state === 'code' || state === 'netwait') {
    skyGradient([[0, '#3f9fe8'], [0.6, '#9fdcff'], [1, '#d8f4ff']]);
    glow(400, 46, 40, '#fff2a0', 0.5);
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#fff6c0';
    for (let i = 0; i < 10; i++) { const a = gtime * 0.1 + i * Math.PI / 5; ctx.beginPath(); ctx.moveTo(400, 46); ctx.lineTo(400 + Math.cos(a) * 90, 46 + Math.sin(a) * 90); ctx.lineTo(400 + Math.cos(a + 0.12) * 90, 46 + Math.sin(a + 0.12) * 90); ctx.fill(); }
    ctx.restore();
    circle(400, 46, 19, '#fff6b0'); circle(400, 46, 15, '#ffe066'); circle(396, 42, 5, '#fff8d0');
    // far mountains with snow caps
    ridge(ox * 0.06, 158, 44, '#93b8d8', 0.006);
    for (let x = 0; x <= VW; x += 2) { // snow on the peaks, following their shape
      const top = ridgeY(x, ox * 0.06, 158, 44, 0.006);
      if (top < 124) { const d = (124 - top) * 0.8; R(x, top, 2, d, '#eef6ff'); R(x, top + d, 2, 1, '#cfe0f0'); }
    }
    ridge(ox * 0.06 + 140, 170, 30, '#7fa6c8', 0.009);
    for (let i = 0; i < 6; i++) { const span = VW + 140; cloud(wrap(i * 137 - ox * 0.1 + gtime * 4, span) - 60, 24 + (i * 37) % 60, 0.8 + (i % 3) * 0.15); }
    // birds
    for (let i = 0; i < 3; i++) {
      const bx = wrap(i * 170 + gtime * 18 - ox * 0.15, VW + 40) - 20, by = 60 + i * 14 + Math.sin(gtime * 2 + i) * 4, up = Math.floor(gtime * 6 + i) % 2;
      R(bx - 3, by - up, 3, 1, '#2a3a4a'); R(bx + 1, by - up, 3, 1, '#2a3a4a'); R(bx, by, 1, 1, '#2a3a4a');
    }
    // hills with trees, then near bushes
    const off1 = ox * 0.3;
    ridge(off1, 192, 22, '#6aa85a', 0.013);
    for (let i = 0; i < 16; i++) {
      const tx = wrap(i * 41 - off1, VW + 60) - 30, ty = ridgeY(tx, off1, 192, 22, 0.013) + 2;
      if (i % 3 === 1) saguaro(tx, ty, 1 + (i % 2) * 0.3); else tree(tx, ty, 1 + (i % 3) * 0.2, '#3f7d3a', '#5aa04f');
    }
    const off2 = ox * 0.5;
    ridge(off2, 214, 12, '#4b944a', 0.021);
    for (let i = 0; i < 14; i++) { const bx = wrap(i * 53 - off2, VW + 40) - 20, by = ridgeY(bx, off2, 214, 12, 0.021); circle(bx, by + 2, 7, '#3c7f3c'); circle(bx + 6, by + 3, 5, '#3c7f3c'); circle(bx - 2, by, 3, '#5aa04f'); }
    return;
  }
  if (th === 'mine') {
    skyGradient([[0, '#0d0716'], [1, '#2d1b3d']]);
    ridge(ox * 0.15, 150, 50, '#1d1328', 0.01);
    ridge(ox * 0.25, 200, 30, '#251a33', 0.016);
    for (let i = 0; i < 18; i++) { // glowing crystal clusters
      const cx = wrap(i * 97 - ox * 0.3, VW + 40) - 20, cy = 70 + (i * 53) % 140, pulse = 0.5 + 0.5 * Math.sin(gtime * 2 + i);
      glow(cx, cy, 12, '#39ff14', 0.3 + 0.2 * pulse);
      R(cx - 1, cy - 4, 2, 7, '#7dff5a'); R(cx + 2, cy - 1, 2, 4, '#4fd13a'); R(cx - 3, cy, 2, 3, '#4fd13a'); R(cx - 1, cy - 4, 1, 2, '#e0ffd0');
    }
    for (let i = 0; i < 6; i++) { // timber supports with hanging lanterns
      const bx = wrap(i * 150 - ox * 0.55, VW + 150) - 75;
      R(bx, 34, 7, VH, '#4a3020'); R(bx, 34, 2, VH, '#5f4029'); R(bx + 6, 34, 1, VH, '#2e1d12');
      R(bx + 70, 34, 7, VH, '#4a3020'); R(bx + 70, 34, 2, VH, '#5f4029');
      R(bx - 4, 30, 85, 6, '#5f4029'); R(bx - 4, 35, 85, 1, '#2e1d12');
      const lx = bx + 38, flick = 0.85 + 0.15 * Math.sin(gtime * 13 + i * 3);
      R(lx, 36, 1, 8, '#222'); R(lx - 3, 44, 7, 8, '#333'); R(lx - 2, 45, 5, 6, '#ffcc55');
      glow(lx, 48, 34 * flick, '#ffb040', 0.6);
    }
    return;
  }
  if (th === 'factory') {
    skyGradient([[0, '#ff8ccf'], [0.6, '#ffc0a8'], [1, '#ffe2b0']]);
    glow(90, 70, 50, '#fff0c0', 0.4); circle(90, 70, 22, '#fff4d8');
    for (let i = 0; i < 8; i++) { // far factories with lit windows and smoking chimneys
      const cx = wrap(i * 90 - ox * 0.25, VW + 90) - 45, top = 110 + (i % 3) * 12;
      R(cx, top, 56, VH, '#c77aa8'); R(cx, top, 56, 3, '#d993bb'); R(cx + 54, top, 2, VH, '#a5618a');
      R(cx + 34, top - 46, 10, 46, '#b56a96'); R(cx + 33, top - 48, 12, 3, '#9e5683');
      for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) R(cx + 5 + c * 12, top + 10 + r * 16, 6, 8, hash(i * 7 + c, r) > 0.35 ? '#ffe8a0' : '#8e4f78');
      for (let k = 0; k < 3; k++) { const t = (gtime * 0.6 + k / 3 + i * 0.2) % 1; ctx.save(); ctx.globalAlpha = 0.55 * (1 - t); circle(cx + 39 + Math.sin(t * 6 + i) * 4, top - 50 - t * 40, 5 + t * 8, '#fff'); ctx.restore(); }
      if (i % 3 === 0) { ctx.save(); ctx.globalAlpha = 0.45; drawTeddy(cx + 8, top - 34, 2.4); ctx.restore(); }
    }
    const off = ox * 0.5; // pipes in front
    for (let i = 0; i < 6; i++) { const pxx = wrap(i * 110 - off, VW + 110) - 55; R(pxx, 200, 90, 8, '#9e6b8e'); R(pxx, 200, 90, 2, '#c08ab0'); R(pxx + 40, 196, 10, 16, '#7a4f6e'); circle(pxx + 45, 194, 4, '#d62828'); }
    return;
  }
  // fortress at dusk: stars, searchlights, a castle wall and a giant flag
  skyGradient([[0, '#0f1438'], [0.55, '#6b2a58'], [1, '#ff7a3d']]);
  for (let i = 0; i < 50; i++) { const tw = Math.sin(gtime * 3 + i * 1.7) > 0.6 ? 2 : 1; R((i * 71) % VW, (i * 37) % 120, tw, tw, i % 3 ? '#fff' : '#ffd34d'); }
  circle(70, 50, 14, '#fff6d8'); circle(76, 46, 12, '#1b1f4a'); // crescent moon
  ctx.save(); ctx.globalAlpha = 0.35; drawFlagCloth(wrap(60 - ox * 0.1, 600) - 60, 30, 120, 66, true); ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.08; ctx.fillStyle = '#fff8d0';
  for (let i = 0; i < 2; i++) {
    const bx = wrap(160 + i * 240 - ox * 0.2, VW + 100) - 50, a = -Math.PI / 2 + Math.sin(gtime * 0.6 + i * 2) * 0.6;
    ctx.beginPath(); ctx.moveTo(bx, 190); ctx.lineTo(bx + Math.cos(a - 0.1) * 300, 190 + Math.sin(a - 0.1) * 300); ctx.lineTo(bx + Math.cos(a + 0.1) * 300, 190 + Math.sin(a + 0.1) * 300); ctx.fill();
  }
  ctx.restore();
  const off = ox * 0.25; // castle wall with towers and lit windows
  R(0, 186, VW, VH, '#2a1630');
  for (let x = -wrap(off, 16); x < VW; x += 16) R(x, 180, 9, 7, '#2a1630');
  for (let i = 0; i < 5; i++) {
    const tx = wrap(i * 130 - off, VW + 130) - 65;
    R(tx, 150, 30, 40, '#2a1630'); for (let k = 0; k < 4; k++) R(tx + k * 8, 144, 6, 7, '#2a1630');
    R(tx + 12, 160, 6, 9, Math.floor(gtime * 2 + i) % 7 ? '#ffcf6a' : '#5a3a4a');
  }
  ridge(ox * 0.4, 214, 10, '#3b1f3f', 0.02);
}

// ---- tiles
function drawTiles() {
  const th = level.theme;
  const x0 = Math.max(0, Math.floor(camX / TILE)), x1 = Math.min(level.w - 1, Math.floor((camX + VW) / TILE));
  const dirtL = shade(th.dirt, 0.12), dirtD = shade(th.dirt, -0.3), stone = shade(th.dirt, 0.28), stoneD = shade(th.dirt, -0.1);
  const brickL = shade(th.brick, 0.25), brickD = shade(th.brick, -0.25);
  for (let ty = 0; ty < level.h; ty++) for (let tx = x0; tx <= x1; tx++) {
    const i = ty * level.w + tx, t = level.tiles[i];
    if (!t) continue;
    const x = tx * TILE, y = ty * TILE, hv = hash(tx, ty);
    const openUp = !SOLID[tileAt(tx, ty - 1)], openDown = !SOLID[tileAt(tx, ty + 1)];
    const openL = !SOLID[tileAt(tx - 1, ty)], openR = !SOLID[tileAt(tx + 1, ty)];
    switch (t) {
      case T.DIRT: {
        R(x, y, 16, 16, th.dirt);
        R(x, y + 10, 16, 6, shade(th.dirt, -0.06));
        const sx = x + Math.floor(hv * 10) + 1, sy = y + Math.floor(hash(ty, tx) * 9) + 3; // a pebble
        R(sx, sy, 4, 3, stoneD); R(sx, sy, 3, 2, stone); R(sx, sy, 1, 1, shade(th.dirt, 0.5));
        R(x + Math.floor(hash(tx + 7, ty) * 13), y + Math.floor(hash(tx, ty + 9) * 13), 2, 1, dirtD);
        R(x + Math.floor(hash(tx + 3, ty + 5) * 13), y + Math.floor(hash(tx + 11, ty) * 13), 1, 2, dirtL);
        if (hash(tx + 21, ty + 4) < 0.25) { const rx = x + Math.floor(hash(tx, ty + 30) * 10) + 2; R(rx, y + 6, 1, 4, dirtD); R(rx + 1, y + 9, 2, 1, dirtD); } // a root
        if (openL) R(x, y, 1, 16, dirtD);
        if (openR) R(x + 15, y, 1, 16, dirtD);
        if (openDown) R(x, y + 15, 16, 1, dirtD);
        if (th.grass && openUp) {
          R(x, y, 16, 4, th.grass); R(x, y + 4, 16, 1, th.grass2); R(x, y + 5, 16, 1, dirtD);
          R(x, y, 16, 1, shade(th.grass, 0.3));
          for (let k = 0; k < 4; k++) { const gx = x + k * 4 + Math.floor(hash(tx * 4 + k, ty) * 3); R(gx, y - 1 - Math.floor(hash(tx, ty * 4 + k) * 2), 1, 2, th.grass); }
          if (hash(tx + 99, ty) < 0.12) { const fx = x + 3 + Math.floor(hash(tx, 99) * 10); R(fx, y - 3, 1, 3, th.grass2); R(fx - 1, y - 4, 3, 1, pick2(tx, ['#fff', '#ffd34d', '#ff6b9b', '#e63946'])); R(fx, y - 4, 1, 1, '#ffd34d'); }
        } else if (openUp) R(x, y, 16, 1, dirtL);
        break;
      }
      case T.BRICK: {
        R(x, y, 16, 16, brickD);
        for (let r = 0; r < 4; r++) {
          const o = r % 2 ? 4 : 0;
          for (let c = -1; c < 2; c++) {
            const bx = x + o + c * 8 + 1, by = y + r * 4 + 1, bw = 7;
            const cx0 = Math.max(bx, x), cx1 = Math.min(bx + bw, x + 16);
            if (cx1 <= cx0) continue;
            const v = hash(tx * 3 + c, ty * 4 + r);
            R(cx0, by, cx1 - cx0, 3, v > 0.7 ? shade(th.brick, 0.08) : v < 0.2 ? shade(th.brick, -0.08) : th.brick);
            R(cx0, by, cx1 - cx0, 1, brickL);
          }
        }
        if (openDown) R(x, y + 15, 16, 1, shade(th.brick2, -0.3));
        break;
      }
      case T.STEEL:
        R(x, y, 16, 16, th.steel2); R(x + 1, y + 1, 14, 14, th.steel);
        R(x + 1, y + 1, 14, 1, '#d8e0e8'); R(x + 1, y + 1, 1, 14, shade(th.steel, 0.2));
        R(x + 1, y + 14, 14, 1, shade(th.steel2, -0.2)); R(x + 14, y + 1, 1, 14, shade(th.steel2, -0.1));
        for (const [rx, ry] of [[3, 3], [11, 3], [3, 11], [11, 11]]) { R(x + rx, y + ry, 2, 2, th.steel2); R(x + rx, y + ry, 1, 1, '#eef2f6'); }
        if (hv < 0.3) { R(x + 5, y + 7, 4, 1, shade(th.steel, -0.12)); R(x + 8, y + 8, 3, 1, shade(th.steel, -0.12)); }
        break;
      case T.PLAT:
        R(x, y, 16, 4, '#a1662f'); R(x, y, 16, 1, '#c88a4a'); R(x, y + 4, 16, 1, '#5a3618');
        R(x + 3 + Math.floor(hv * 6), y + 2, 5, 1, '#8a5626'); R(x + 1, y + 1, 1, 1, '#555'); R(x + 14, y + 1, 1, 1, '#555');
        R(x + 2, y + 5, 2, 5, '#6e4420'); R(x + 12, y + 5, 2, 5, '#6e4420'); R(x + 2, y + 5, 1, 5, '#8a5626');
        break;
      case T.URAN: {
        const g = (Math.sin(gtime * 5 + tx) + 1) / 2;
        glow(x + 8, y + 8, 12, '#39ff14', 0.15 + g * 0.15);
        R(x + 2, y + 1, 12, 15, '#1e8f2b'); R(x + 3, y + 1, 10, 15, '#2ecc40'); R(x + 2, y + 3, 12, 1, '#145c1c'); R(x + 2, y + 12, 12, 1, '#145c1c');
        R(x + 2, y + 1, 12, 1, '#7dff8a'); R(x + 11, y + 1, 2, 15, '#249a33');
        R(x + 5, y + 5, 6, 6, '#ffeb3b'); R(x + 7, y + 7, 2, 2, '#222'); R(x + 6, y + 5, 1, 2, '#222'); R(x + 9, y + 5, 1, 2, '#222'); R(x + 7, y + 10, 2, 1, '#222');
        R(x + 4, y + 2, 1, 13, '#a8ffb0');
        break;
      }
      case T.FIRE:
        R(x + 1, y + 2, 14, 14, '#6e3a12'); R(x + 2, y + 3, 12, 12, '#d62828'); R(x + 2, y + 7, 12, 2, '#fff'); R(x + 2, y + 11, 12, 2, '#fff');
        R(x + 3, y + 3, 5, 4, '#1d3fa8'); R(x + 5, y + 4, 1, 1, '#fff'); R(x + 4, y + 5, 3, 1, '#fff');
        R(x + 2, y + 3, 12, 1, '#ff6b6b'); R(x + 1, y + 2, 1, 14, '#8b4513'); R(x + 14, y + 2, 1, 14, '#4a2408');
        R(x + 7, y - 1, 1, 3, '#555'); if (Math.floor(gtime * 6 + tx) % 2) { R(x + 7, y - 2, 1, 1, '#ffd34d'); glow(x + 7.5, y - 2, 3, '#ffb000', 0.5); }
        break;
    }
    const hp = level.hp[i], max = TILE_HP[t];
    if (hp < max && max < Infinity && t !== T.URAN && t !== T.FIRE) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x + 4, y + 3, 1, 6); ctx.fillRect(x + 5, y + 8, 4, 1); ctx.fillRect(x + 9, y + 8, 1, 5);
      if (hp < max / 2) { ctx.fillRect(x + 11, y + 2, 1, 4); ctx.fillRect(x + 2, y + 11, 4, 1); ctx.fillRect(x + 12, y + 6, 2, 1); }
    }
  }
}
const pick2 = (n, arr) => arr[Math.abs(n) % arr.length];

// ---- world
function drawWorld() {
  const sx = shake ? rand(-shake, shake) * 0.5 : 0, sy = shake ? rand(-shake, shake) * 0.5 : 0;
  ctx.save();
  ctx.translate(-Math.round(camX) + Math.round(sx), -Math.round(camY) + Math.round(sy));

  for (const c of crosses) {
    if (c.active) {
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(gtime * 3);
      circle(c.x + 6, c.y + 9, 22, '#ffd34d');
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + gtime * 0.5; R(c.x + 6 + Math.cos(a) * 26 - 1, c.y + 9 + Math.sin(a) * 26 - 1, 3, 3, '#fff3b0'); }
      ctx.globalAlpha = 1;
    } else if (Math.floor(gtime * 3) % 3 === 0) R(c.x + 5 + Math.sin(gtime * 2) * 8, c.y - 4, 2, 2, '#fff');
    const wood = c.active ? '#e0b04a' : '#8b5a2b', wood2 = c.active ? '#fff3b0' : '#a8743c';
    R(c.x + 4, c.y, 4, 32, wood); R(c.x, c.y + 7, 12, 4, wood); R(c.x + 4, c.y, 1, 32, wood2); R(c.x, c.y + 7, 12, 1, wood2);
  }
  if (flag && !flag.locked) {
    const dy = -(1 - easeOut(flag.drop)) * 260;
    const px0 = flag.x + 7, top = flag.y + dy;
    R(px0, top, 2, 96, '#ddd'); R(px0 + 2, top, 1, 96, '#999'); circle(px0 + 1, top - 1, 3, '#ffd34d');
    R(px0 - 4, flag.bottom - 3 + dy, 10, 3, '#666');
    const fy = top + 80 - flag.raised * 76;
    drawFlagCloth(px0 + 3, fy, 24, 14, true);
  }
  drawTiles();
  for (const p of pickups) {
    const b = Math.round(Math.sin(p.t * 4) * 1.5), x = Math.round(p.x), y = Math.round(p.y) + b;
    if (p.kind === 'uranium') drawCrystal(x, y);
    else if (p.kind === 'teddy') drawTeddy(x, y);
    else if (p.kind === 'heart') heart(x + 1, y + 2, '#ff3b5c', 1.2);
    else if (p.kind === 'dove') { ctx.globalAlpha = 0.3; circle(x + 5, y + 4, 9, '#fff'); ctx.globalAlpha = 1; drawDove(x - 1, y, p.t); }
  }
  for (const c of cages) {
    if (c.freed) continue;
    const x = Math.round(c.x), y = Math.round(c.y);
    drawPerson(x + 2, y + 2, Math.sin(gtime * 2 + x) > 0 ? 1 : -1, c.look, 0, false, false);
    R(x, y, 16, 2, '#444'); R(x, y + 18, 16, 2, '#444');
    for (let i = 0; i < 5; i++) R(x + i * 3.75, y, 1, 20, '#666');
    if (Math.floor(gtime * 2) % 2) { R(x - 2, y - 12, 22, 9, '#fff'); R(x + 6, y - 3, 3, 2, '#fff'); text('HELP!', x + 9, y - 10, { size: 4, color: '#d62828', shadow: false, align: 'center' }); }
  }
  for (const f of followers) { if (f.onGround) groundShadow(f.x + 5, f.y + 18, 10); drawPerson(Math.round(f.x), Math.round(f.y), f.facing, f.look, f.anim, Math.abs(f.vx) > 5, !f.onGround); }
  for (const c of corpses) {
    ctx.save(); ctx.translate(Math.round(c.x), Math.round(c.y)); ctx.rotate(c.rot);
    drawBot(c.type, -c.w / 2, -c.h / 2, c.facing, 0, Math.floor(c.t * 20) % 2 === 0, false, '');
    ctx.restore();
  }
  for (const e of enemies) {
    if (e.type !== 'jet') groundShadow(e.x + e.w / 2, e.y + e.h, e.w);
    drawBot(e.type, Math.round(e.x), Math.round(e.y), e.facing, e.anim, e.flash > 0, Math.abs(e.vx) > 1, e.state);
    if (e.state === 'alert') { R(Math.round(e.cx) - 1, Math.round(e.y) - 14, 3, 7, '#ffeb3b'); R(Math.round(e.cx) - 1, Math.round(e.y) - 6, 3, 2, '#ffeb3b'); }
  }
  if (boss && boss.alive) drawBoss(boss);
  for (const p of players) {
    if (!p.alive) {
      if (p.deadT > 0) {
        ctx.globalAlpha = 0.5;
        drawHero(p.hero, Math.round(p.x) - 2, Math.round(p.y + p.ghostY), p.facing, 0, false, false, false, p.v);
        ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(Math.round(p.cx), Math.round(p.y + p.ghostY) - 4, 6, 2, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      continue;
    }
    if (state === 'play' && p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0) continue;
    if (p.shield > 0) {
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(gtime * 10); circle(p.cx, p.cy, 15, '#fff'); ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(p.cx, p.y - 4, 6, 2, 0, 0, Math.PI * 2); ctx.stroke();
      if (Math.random() < 0.3) part(p.cx + rand(-10, 10), p.cy + rand(-10, 10), 0, -20, 0.4, '#fff', 1.5, 0, 'star');
    }
    if (p.onGround) groundShadow(p.cx, p.y + p.h, 10);
    drawHero(p.hero, Math.round(p.x) - 2, Math.round(p.y), p.facing, p.anim, p.moving && p.onGround, !p.onGround && !p.carried, p.muzzle > 0, p.v);
    if (p.drum > 0) drawDrumKit(Math.round(p.cx), Math.round(p.y), gtime);
    if (players.length > 1) text('P' + (p.idx + 1), Math.round(p.cx), Math.round(p.y) - 9, { size: 4, color: PCOL[p.idx], align: 'center' });
  }
  for (const g of grenades) {
    ctx.save(); ctx.translate(Math.round(g.x + 4), Math.round(g.y + 4)); ctx.rotate(g.spin);
    if (g.kind === 'teddy') { if (g.mini) drawTeddy(-3, -3, 0.6); else drawTeddy(-5, -5); }
    else if (g.kind === 'rollbear') outlined(() => drawTeddy(-10, -10, 2));
    else if (g.kind === 'amp') { ctx.rotate(-g.spin); outlined(() => { R(-6, -7, 12, 14, '#222'); R(-5, -6, 10, 9, '#444'); R(-4, -5, 8, 7, '#333'); circle(0, -1, 3, '#555'); R(-5, 4, 10, 2, '#ffd34d'); R(-4, 4, 3, 1, '#111'); }); }
    else drawCrystal(-5, -5);
    ctx.restore();
  }
  for (const b of projectiles) {
    const x = Math.round(b.x), y = Math.round(b.y), d = sign(b.vx);
    if (b.kind === 'rocket') { R(x - 4, y - 1, 7, 3, '#ddd'); R(d > 0 ? x + 2 : x - 5, y - 1, 3, 3, '#d62828'); R(d > 0 ? x - 6 : x + 3, y - 1, 2, 3, '#ffd34d'); }
    else if (b.kind === 'laser') { glow(x, y, 7, '#39ff14', 0.4); ctx.globalAlpha = 0.5; R(x - 7, y - 2, 14, 4, '#39ff14'); ctx.globalAlpha = 1; R(x - 6, y - 1, 12, 2, '#d8ffc8'); }
    else if (b.kind === 'bolt') { glow(x, y, 7, '#ff3b3b', 0.45); ctx.globalAlpha = 0.4; circle(x, y, 4, '#ff3b3b'); ctx.globalAlpha = 1; R(x - 2, y - 2, 4, 4, '#ffb36b'); }
    else if (b.kind === 'missile') { R(x - 5, y - 2, 10, 4, '#eee'); R(d > 0 ? x + 3 : x - 6, y - 2, 3, 4, '#d62828'); }
    else if (b.kind === 'bomb') { circle(x, y, 4, '#222'); R(x - 1, y - 6, 2, 2, Math.floor(gtime * 20) % 2 ? '#ffd34d' : '#ff3b3b'); }
    else if (b.kind === 'chord') { // a sound wave: three curved lines spreading out
      const k = b.big ? 1.4 : 1; glow(x, y, 9 * k, '#ff7b54', 0.35);
      ctx.save(); ctx.lineWidth = 1.5; const a0 = d > 0 ? 0 : Math.PI;
      for (let i = 0; i < 3; i++) { ctx.strokeStyle = ['#fff', '#ffd34d', '#ff7b54'][i]; ctx.globalAlpha = 1 - i * 0.25; ctx.beginPath(); ctx.arc(x - d * (6 + i * 3), y, (5 + i * 3) * k, a0 - 0.9, a0 + 0.9); ctx.stroke(); }
      ctx.restore();
    }
    else if (b.kind === 'note') {
      const c = ['#ff7b54', '#ffd34d', '#6fb6ff', '#ff8ad8', '#7dffa0'][Math.abs(Math.floor(b.x / 9)) % 5], wy = y + Math.round(Math.sin(b.x * 0.15) * 2);
      glow(x, wy, 5, c, 0.3); R(x - 2, wy, 3, 2, c); R(x, wy - 5, 1, 6, c); R(x, wy - 5, 3, 1, c);
    }
    else if (b.kind === 'wave') { ctx.globalAlpha = 0.8; for (let i = 0; i < 3; i++) R(x - 3 + i * 2 * d, y - 4 - i * 2, 3, 10 - i, i === 0 ? '#a8d0ff' : '#4a90e2'); ctx.globalAlpha = 1; }
  }
  for (const n of nukes) drawNuke(n);
  for (const e of explosions) { // a bright glow under each fireball lights up everything around it
    if (e.color === 'ring') { // drum-solo shockwave: an expanding ring
      const k = e.t / e.max, rr = e.r * (0.2 + 0.9 * easeOut(k));
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.lineWidth = 3; ctx.strokeStyle = '#ffd34d';
      ctx.beginPath(); ctx.arc(e.x, e.y, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(e.x, e.y, rr * 0.8, 0, Math.PI * 2); ctx.stroke();
      ctx.restore(); glow(e.x, e.y, rr, '#ff7b54', 0.25 * (1 - k));
      continue;
    }
    const kg = e.t / e.max; glow(e.x, e.y, e.r * (1.4 + kg), e.color === 'nuke' ? '#b6ff6e' : '#ff9a30', 0.5 * (1 - kg));
    const k = e.t / e.max, rr = e.r * (0.35 + 0.75 * Math.min(1, k * 3));
    ctx.globalAlpha = 1 - k;
    circle(e.x, e.y, rr, e.color === 'nuke' ? '#b6ff6e' : '#ff8c1a');
    circle(e.x, e.y, rr * 0.7, '#ffd34d');
    if (k < 0.5) circle(e.x, e.y, rr * 0.4, '#fff');
    ctx.globalAlpha = 1;
  }
  for (const p of particles) {
    const a = Math.min(1, p.life / p.max * 1.5);
    ctx.globalAlpha = a;
    switch (p.type) {
      case 'smoke': { const k = 1 - p.life / p.max; ctx.globalAlpha = 0.55 * (1 - k); circle(p.x, p.y, p.size * (1 + k * 1.5), p.color); break; }
      case 'star': ctx.globalAlpha = Math.random() < 0.2 ? 0.3 : a; R(p.x - 1, p.y - 1, p.size, p.size, p.color); break;
      case 'gear': ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); R(-2, -2, 4, 4, p.color); R(-1, -3, 2, 6, p.color); R(-3, -1, 6, 2, p.color); R(-0.5, -0.5, 1, 1, '#222'); ctx.restore(); break;
      case 'heart': heart(p.x - 3, p.y - 3, p.color, 1); break;
      case 'note': R(p.x - 2, p.y, 3, 2, p.color); R(p.x, p.y - 4, 1, 5, p.color); R(p.x, p.y - 4, 2, 1, p.color); break;
      case 'dove': ctx.globalAlpha = 1; drawDove(p.x, p.y, gtime); break;
      default: R(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, p.color);
    }
  }
  ctx.globalAlpha = 1;
  for (const r of rockets) R(r.x - 1, r.y - 2, 2, 4, '#fff');
  for (const t of texts) { ctx.globalAlpha = Math.min(1, t.t * 2); text(t.str, Math.round(t.x), Math.round(t.y), { size: t.size, color: t.color, align: 'center' }); }
  ctx.globalAlpha = 1;
  if (cut && cut.eagle) drawEagle(Math.round(cut.eagle.x), Math.round(cut.eagle.y), cut.eagle.flap);
  if (cut && cut.bear) drawBigBear(Math.round(cut.bear.x), Math.round(cut.bear.y), cut.bear.phase === 'fly');
  ctx.restore();
}
function drawBigBear(x, y, flying) {
  R(x, y + 44, 32, 6, '#555'); R(x + 4, y + 48, 24, 4, '#333');
  if (flying) { R(x + 8, y + 52, 16, 8, '#ff8c1a'); R(x + 11, y + 58, 10, 8, '#ffd34d'); }
  R(x + 2, y + 18, 28, 26, '#a0662f'); R(x + 9, y + 24, 14, 16, '#e8c39e');
  R(x + 4, y, 24, 20, '#a0662f'); R(x + 1, y - 3, 8, 8, '#8b5a2b'); R(x + 23, y - 3, 8, 8, '#8b5a2b');
  R(x + 10, y + 6, 3, 3, '#222'); R(x + 19, y + 6, 3, 3, '#222'); R(x + 12, y + 11, 8, 6, '#e8c39e'); R(x + 14, y + 11, 4, 3, '#222');
  R(x + 6, y + 24, 3, 3, '#ff6b9b'); heart(x + 12, y + 28, '#ff3b5c', 1);
}
function drawBoss(b) {
  const x = Math.round(b.x), y = Math.round(b.y), fl = b.flash > 0;
  const step = b.state === 'walk' ? Math.round(Math.sin(b.anim * 8) * 2) : 0;
  groundShadow(x + 22, y + 56, 40);
  outlined(() => {
    const body = fl ? '#fff' : '#6d7a91', dark = fl ? '#ddd' : '#434c5e', hi = fl ? '#fff' : '#9aa7bd', lo = fl ? '#ccc' : '#2c3342';
    const p = px(x, y, 44, b.facing);
    // legs with knee joints and big feet
    p(6, 40 + step, 10, 16 - step, dark); p(6, 40 + step, 2, 16 - step, hi); p(6, 46, 10, 2, lo);
    p(28, 40 - step, 10, 16 + step, dark); p(28, 40 - step, 2, 16 + step, hi); p(28, 46, 10, 2, lo);
    p(2, 52, 16, 4, '#222'); p(2, 52, 16, 1, '#444'); p(26, 52, 16, 4, '#222'); p(26, 52, 16, 1, '#444');
    // body: panels, rivets, hazard stripe
    p(2, 14, 40, 28, body); p(2, 14, 40, 2, hi); p(2, 40, 40, 2, lo); p(2, 14, 2, 28, hi);
    p(21, 16, 1, 14, lo); p(4, 22, 16, 1, lo); p(24, 22, 16, 1, lo);
    for (const rx of [5, 17, 26, 38]) { p(rx, 18, 1, 1, hi); p(rx, 26, 1, 1, hi); }
    p(2, 30, 40, 3, '#ffcc00'); for (let i = 0; i < 5; i++) p(4 + i * 8, 30, 4, 3, '#222');
    // cockpit with an angry face
    p(10, 0, 24, 16, '#2b2d42'); p(12, 2, 20, 12, '#3d4058'); p(12, 2, 20, 1, '#555a78');
    if (b.happy) { // the ending: no more grumpy
      p(14, 7, 6, 2, '#7dd3ff'); p(25, 7, 6, 2, '#7dd3ff'); p(14, 6, 6, 1, '#7dd3ff'); p(25, 6, 6, 1, '#7dd3ff');
      p(17, 12, 10, 1, '#ffd34d'); p(16, 11, 2, 1, '#ffd34d'); p(26, 11, 2, 1, '#ffd34d'); p(13, 10, 2, 1, '#ff8ad8'); p(29, 10, 2, 1, '#ff8ad8');
    } else {
      p(14, 7, 6, 3, '#ff3b3b'); p(25, 7, 6, 3, '#ff3b3b'); p(15, 8, 1, 1, '#fff'); p(26, 8, 1, 1, '#fff');
      p(13, 5, 7, 2, '#000'); p(25, 5, 7, 2, '#000'); p(15, 4, 3, 1, '#000'); p(27, 4, 3, 1, '#000');
      p(17, 12, 10, 2, '#ff3b3b'); p(16, 13, 2, 1, '#ff3b3b'); p(26, 13, 2, 1, '#ff3b3b');
    }
    // missile pod and arm cannon
    p(0, 8, 10, 8, '#888'); p(0, 8, 10, 1, '#aaa'); p(1, 6, 2, 2, '#d62828'); p(4, 6, 2, 2, '#d62828'); p(7, 6, 2, 2, '#d62828');
    p(36, 20, 18, 7, '#333'); p(36, 20, 18, 1, '#555'); p(40, 21, 1, 5, '#ffcc00'); p(52, 21, 3, 5, '#111');
    p(16, 20, 12, 8, dark); p(16, 20, 12, 1, hi);
  });
  text('MG', x + 22, y + 21, { size: 5, color: '#ffcc00', shadow: false, align: 'center' });
  const ex = b.facing > 0 ? 0 : 1;
  const eyeGlow = b.happy ? '#7dd3ff' : '#ff3b3b';
  if (!fl) { glow(x + (ex ? 44 - 17 : 17), y + 8, 7, eyeGlow, 0.3); glow(x + (ex ? 44 - 28 : 28), y + 8, 7, eyeGlow, 0.3); }
}
function drawNuke(n) {
  if (n.s && n.s !== 1) { ctx.save(); ctx.translate(n.x, n.y); ctx.scale(n.s, n.s); drawNuke({ ...n, x: 0, y: 0, s: 1 }); ctx.restore(); return; }
  const k = n.t / n.max, rise = easeOut(n.t / 1.1);
  const fade = k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1;
  const capY = n.y - 18 - 78 * rise, capR = 10 + 28 * rise;
  const col = n.t < 0.25 ? '#ffffff' : n.t < 0.9 ? '#ffd34d' : n.t < 1.6 ? '#ff8c1a' : '#9a8a7a';
  const col2 = n.t < 0.9 ? '#fff3b0' : n.t < 1.6 ? '#ffb36b' : '#b8ab9b';
  ctx.globalAlpha = fade * 0.5;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(n.x, n.y + 6, 20 + 180 * rise, 6 + 4 * rise, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = fade;
  R(n.x - 7, capY, 14, n.y - capY + 6, col);
  R(n.x - 3, capY, 6, n.y - capY + 6, col2);
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + n.t; circle(n.x + Math.cos(a) * capR * 0.75, capY + Math.sin(a) * capR * 0.32, capR * 0.5, col); }
  circle(n.x, capY - capR * 0.2, capR * 0.7, col2);
  ctx.globalAlpha = fade * 0.35; circle(n.x, capY, capR * 1.2, '#39ff14');
  ctx.globalAlpha = 1;
}

// ---- HUD
function drawHUD() {
  players.forEach((p, i) => {
    // P1 top-left, P2 top-right, P3 under P1, P4 under P2
    const x = i % 2 ? VW - 118 : 4, y = 4 + Math.floor(i / 2) * 30, multi = players.length > 1;
    ctx.globalAlpha = 0.55; R(x, y, 114, 28, '#000'); ctx.globalAlpha = 1;
    if (multi) { R(x, y, 114, 1, PCOL[i]); R(x, y + 27, 114, 1, PCOL[i]); }
    ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y + 2, 18, 24); ctx.clip();
    R(x + 2, y + 2, 18, 24, HEROES[p.hero].bg);
    drawHero(p.hero, x + 4, y + 6, 1, 0, false, false, false, p.v);
    ctx.restore();
    const name = HEROES[p.hero].name;
    text('LV' + tier(), x + 111, y + 3, { size: 4, color: '#ffd34d', align: 'right' });
    text(multi ? 'P' + (i + 1) + ' ' + name : name, x + 24, y + 3, { size: 6, color: multi ? PCOL[i] : HEROES[p.hero].color });
    for (let h = 0; h < p.maxHp; h++) heart(x + 24 + h * 10, y + 12, h < p.hp && p.alive ? '#ff3b5c' : '#444', 1);
    for (let s = 0; s < p.specials; s++) drawAmmoIcon(p.hero, x + 60 + s * 10, y + 11, 0.8);
    if (!p.alive && p.waiting) text('WAITING', x + 24, y + 21, { size: 4, color: '#aaa' });
    if (p.shield > 0) text('SHIELD ' + Math.ceil(p.shield), x + 60, y + 21, { size: 4, color: '#fff' });
  });
  const cx = VW / 2;
  text('LIVES ' + lives, cx, 5, { size: 6, color: '#fff', align: 'center' });
  text(String(score).padStart(7, '0'), cx, 14, { size: 6, color: '#ffd34d', align: 'center' });
  if (NET.code) text('ONLINE: ' + NET.code, cx, 24, { size: 4, color: '#7dffa0', align: 'center' });
  else if (players.length === 1) text('R: SWAP BROTHER', cx, 24, { size: 4, color: '#bbb', align: 'center' });
  if (boss && boss.alive && boss.state !== 'sleep') {
    R(VW / 2 - 101, 38, 202, 8, '#000'); R(VW / 2 - 100, 39, 200 * boss.hp / boss.maxHp, 6, '#e63946');
    text('MEGA GRUMP 9000', VW / 2, 48, { size: 5, color: '#ff8a8a', align: 'center' });
  }
}
function drawBanner() {
  if (!banner) return;
  const a = Math.min(1, banner.t * 2);
  ctx.globalAlpha = a;
  text(banner.str, VW / 2, 70, { size: 14, color: banner.color, align: 'center', shadowColor: '#000' });
  if (banner.sub) text(banner.sub, VW / 2, 90, { size: 6, color: '#fff', align: 'center' });
  ctx.globalAlpha = 1;
}
function drawTouch() {
  if (!touch.used || state !== 'play') return;
  const labels = { left: '<', right: '>', up: 'JUMP', fire: 'FIRE', special: 'BOMB', swap: 'SWAP' };
  for (const b of TBTN) {
    if (b.k === 'swap' && players.length !== 1) continue;
    ctx.globalAlpha = touch[b.k] ? 0.55 : 0.28; circle(b.x, b.y, b.r, '#fff'); ctx.globalAlpha = 0.9;
    text(labels[b.k], b.x, b.y - (b.r > 20 ? 4 : 3), { size: b.r > 20 ? 7 : 5, color: '#000', shadow: false, align: 'center' });
  }
  ctx.globalAlpha = 1;
}

// ---- screens
function drawTitle() {
  drawBackground();
  ctx.save(); ctx.translate(0, 0);
  for (const p of particles) { ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5); R(p.x - 1, p.y - 1, p.size, p.size, p.color); }
  for (const r of rockets) R(r.x - 1, r.y - 2, 2, 4, '#fff');
  ctx.globalAlpha = 1; ctx.restore();
  R(0, 222, VW, 50, '#4caf50'); R(0, 226, VW, 46, '#8b5a2b');
  R(232, 168, 2, 54, '#ddd'); circle(233, 167, 2, '#ffd34d'); drawFlagCloth(234, 170, 30, 18, true);
  ctx.save(); ctx.translate(178, 182); ctx.scale(2, 2); drawHero("noah", 0, 0, 1, titleFx, false, false, false); ctx.restore();
  ctx.save(); ctx.translate(274, 182); ctx.scale(2, 2); drawHero("elijah", 0, 0, -1, titleFx, false, false, false); ctx.restore();
  const bob = Math.sin(titleFx * 3) * 2;
  text('BOOM', VW / 2 - 4, 14 + bob, { size: 24, color: '#e63946', align: 'right', shadowColor: '#1d1d3a' });
  text('BROTHERS', VW / 2 + 4, 14 + bob, { size: 24, color: '#1d5fd8', align: 'left', shadowColor: '#fff' });
  text('ATOMIC LIBERTY', VW / 2, 52, { size: 12, color: '#39ff14', align: 'center', shadowColor: '#0a3d1a' });
  text('starring NOAH & ELIJAH', VW / 2, 70, { size: 6, color: '#fff', align: 'center' });
  const items = MENU();
  ctx.globalAlpha = 0.6; R(VW / 2 - 110, MENU_Y - 4, 220, items.length * 16 + 4, '#000'); ctx.globalAlpha = 1;
  items.forEach((s, i) => {
    const sel = i === menuIdx;
    text((sel ? '> ' : '  ') + s, VW / 2 - 100, MENU_Y + i * 16, { size: 7, color: sel ? '#ffd34d' : '#ddd' });
  });
  const help = 'MOVE: WASD/ARROWS   JUMP: W/SPACE (x2!)   FIRE: Q   BOMB: E';
  ctx.globalAlpha = 0.6; R(0, 238, VW, 34, '#000'); ctx.globalAlpha = 1;
  text(help, VW / 2, 242, { size: 5, color: '#fff', align: 'center' });
  text('Hold JUMP on a wall to climb!  Up to 4 players with gamepads.  M = mute', VW / 2, 254, { size: 4, color: '#bbb', align: 'center' });
  text('ENTER to start', VW / 2, 262, { size: 4, color: '#ffd34d', align: 'center' });
}
// The story: one chapter before each level (white = story, colours = who's talking).
const STORY = [
  { title: 'THE FOURTH OF JULY', color: '#ff3b3b', cast: ['noah', 'elijah', 'andrew'], grump: true, lines: [
    ['It\'s the Fourth of July in Sahuarita, Arizona.', '#fff'],
    ['Grandpa is grilling, Dad has his guitar, and the boys', '#fff'],
    ['are ready for the BIGGEST fireworks show ever...', '#fff'],
    ['', ''],
    ['...until the grumpy GRUMBOTS crash the cookout!', '#ff8a8a'],
    ['MEGA GRUMP 9000 hates fun. He caged the family,', '#fff'],
    ['stole the plushies and took every firework to power', '#fff'],
    ['his FUN-CANCELLING RAY!', '#ffd34d'],
    ['Only the BOOM BROTHERS can save the Fourth!', '#7dffa0'],
  ] },
  { title: 'CHAPTER 2: DOWN THE MINE', color: '#39ff14', cast: ['elijah'], item: 'crystal', lines: [
    ['Part of the family is free! But deep under the desert,', '#fff'],
    ['the Grumbots are drilling for uranium', '#fff'],
    ['to power the Fun-Cancelling Ray.', '#fff'],
    ['', ''],
    ['ELIJAH: "Uranium? That\'s MY thing!"', '#f4d03f'],
    ['', ''],
    ['Smash the drills, grab the glowing crystals,', '#fff'],
    ['and get everyone out of the mine!', '#fff'],
  ] },
  { title: 'CHAPTER 3: THE PLUSHIE FACTORY', color: '#ff8ad8', cast: ['noah'], item: 'turtle', lines: [
    ['The Grumbots are stuffing their robots', '#fff'],
    ['with stolen plushies... even the turtle', '#fff'],
    ['from the science center!', '#fff'],
    ['', ''],
    ['NOAH: "NOBODY takes my plushies!"', '#6fb6ff'],
    ['', ''],
    ['Free the plushies and the rest of the family!', '#fff'],
  ] },
  { title: 'CHAPTER 4: LIBERTY FORTRESS', color: '#ffd34d', cast: ['andrew'], grump: true, lines: [
    ['Every firework in America is locked inside', '#fff'],
    ['MEGA GRUMP\'s fortress. At midnight his ray will', '#fff'],
    ['cancel the Fourth of July FOREVER!', '#ff8a8a'],
    ['', ''],
    ['DAD cracks his knuckles at the gate keypad:', '#fff'],
    ['$ sudo open fortress', '#39ff14'],
    ['ACCESS GRANTED.', '#39ff14'],
    ['Storm the fortress and raise the flag!', '#7dffa0'],
  ] },
];
function drawTurtle(x, y, s = 1) { // the science-center turtle plushie
  R(x + 2 * s, y + 2 * s, 10 * s, 6 * s, '#3a9a5a'); R(x + 3 * s, y + s, 8 * s, 2 * s, '#4fc070');
  R(x + 4 * s, y + 3 * s, 2 * s, 2 * s, '#2a7a44'); R(x + 8 * s, y + 3 * s, 2 * s, 2 * s, '#2a7a44');
  R(x + 12 * s, y + 3 * s, 4 * s, 3 * s, '#8fd6a0'); R(x + 14 * s, y + 3 * s, s, s, '#222');
  R(x + 2 * s, y + 8 * s, 2 * s, 2 * s, '#8fd6a0'); R(x + 9 * s, y + 8 * s, 2 * s, 2 * s, '#8fd6a0');
}
function drawGrumpProp(x, y, sc, withTeddy) { // MEGA GRUMP as a prop for the story screens
  ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
  drawBoss({ x: 0, y: 0, w: 44, h: 56, facing: -1, flash: 0, anim: 0, state: withTeddy ? 'idle' : 'walk', alive: true, happy: withTeddy });
  if (withTeddy) { drawTeddy(-6, 20, 1.6); heart(14, -10 - Math.abs(Math.sin(gtime * 3)) * 4, '#ff3b5c', 2); }
  ctx.restore();
}
function drawStory() {
  R(0, 0, VW, VH, '#0b0b18');
  for (let i = 0; i < 60; i++) R((i * 97) % VW, (i * 61) % VH, 1, 1, Math.sin(gtime * 2 + i) > 0.7 ? '#aaa' : '#555');
  const ch = STORY[clamp(levelIndex, 0, STORY.length - 1)];
  text(ch.title, VW / 2, 14, { size: ch.title.length > 24 ? 10 : 13, color: ch.color, align: 'center' });
  ch.lines.forEach(([s, c], i) => { if (s && stateT > 0.3 + i * 0.3) text(s, VW / 2, 42 + i * 15, { size: 6, color: c, align: 'center' }); });
  const n = ch.cast.length, x0 = (ch.grump ? 196 : 240) - (n - 1) * 27;
  ch.cast.forEach((h, i) => { ctx.save(); ctx.translate(x0 + i * 54 - 14, 194); ctx.scale(2, 2); drawHero(h, 0, 0, 1, titleFx, true, false, false); ctx.restore(); });
  if (ch.item === 'crystal') for (let i = 0; i < 3; i++) drawCrystal(290 + i * 22, 214 - (i % 2) * 8, 1.5);
  if (ch.item === 'turtle') { drawTurtle(286, 214, 2); drawTeddy(330, 210, 2); }
  if (ch.grump) drawGrumpProp(330, 178, 1, false);
  if (stateT > 1.5 && Math.floor(stateT * 2) % 2) text('PRESS ENTER / FIRE', VW / 2, 252, { size: 6, color: '#fff', align: 'center' });
}
function drawLevelCard() {
  ctx.globalAlpha = 0.75; R(0, 0, VW, VH, '#000'); ctx.globalAlpha = 1;
  const d = LEVELS[levelIndex];
  text('LEVEL ' + (levelIndex + 1), VW / 2, 80, { size: 10, color: '#fff', align: 'center' });
  text(d.name, VW / 2, 100, { size: 16, color: '#ffd34d', align: 'center' });
  text(d.tag, VW / 2, 124, { size: 6, color: '#7dffa0', align: 'center' });
  const T = tier(), heroes = [...new Set(players.map(p => p.hero))];
  text(T > 1 ? 'POWER UP! LEVEL ' + T + ' MOVES:' : 'YOUR MOVES:', VW / 2, 146, { size: 7, color: T > 1 ? '#ffd34d' : '#fff', align: 'center' });
  heroes.forEach((h, i) => text(HEROES[h].name + ':  ' + HEROES[h].fire[T - 1] + '  +  ' + HEROES[h].special[T - 1], VW / 2, 162 + i * 12, { size: 5, color: HEROES[h].color, align: 'center' }));
  drawFlagCloth(VW / 2 - 15, 50, 30, 18, true);
}
function drawSummary() {
  ctx.globalAlpha = 0.7; R(VW / 2 - 130, 108, 260, 100, '#000'); ctx.globalAlpha = 1;
  const last = cut.ending === 'final';
  text(last ? 'YOU WON!' : 'LEVEL COMPLETE!', VW / 2, 116, { size: 12, color: '#ffd34d', align: 'center' });
  text('Grumbots smashed: ' + level.kills, VW / 2, 140, { size: 6, align: 'center' });
  text('Family rescued: ' + level.rescues, VW / 2, 152, { size: 6, align: 'center', color: '#7dffa0' });
  text('Score: ' + score, VW / 2, 164, { size: 6, align: 'center', color: '#ffd34d' });
  if (Math.floor(gtime * 2) % 2) text('PRESS ENTER / FIRE TO CONTINUE', VW / 2, 186, { size: 5, align: 'center' });
}
function drawVictory() {
  const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, '#0b1240'); g.addColorStop(1, '#3a1a5a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  ctx.save(); ctx.translate(-camX, 0);
  for (const p of particles) { ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5); R(p.x - 1, p.y - 1, p.size, p.size, p.color); }
  for (const r of rockets) R(r.x - 1, r.y - 2, 2, 4, '#fff');
  ctx.restore(); ctx.globalAlpha = 1;
  drawFlagCloth(VW / 2 - 45, 20, 90, 50, true);
  text('YOU SAVED THE FOURTH OF JULY!', VW / 2, 76, { size: 12, color: '#ffd34d', align: 'center' });
  text('MEGA GRUMP\'s ray backfired into the biggest fireworks show ever!', VW / 2, 96, { size: 5, align: 'center' });
  text('Noah gave him a teddy bear, and he smiled for the very first time.', VW / 2, 106, { size: 5, align: 'center' });
  text('Turns out he was just lonely. Everyone\'s invited to the cookout!', VW / 2, 116, { size: 5, color: '#7dffa0', align: 'center' });
  R(0, 210, VW, 62, '#2e7d32');
  const heroes = players.length ? players.map(p => ({ hero: p.hero, v: p.v || 0 })) : [{ hero: 'noah', v: 0 }, { hero: 'elijah', v: 0 }];
  const all = [...heroes, ...rescuedAll.map(l => ({ look: l }))];
  const spacing = Math.min(30, (VW - 120) / all.length), x0 = VW / 2 - 30 - (all.length - 1) * spacing / 2;
  all.forEach((a, i) => {
    const hop = Math.max(0, Math.sin(stateT * 6 + i * 1.3)) * 8;
    const f = Math.sin(stateT * 3 + i) > 0 ? 1 : -1;
    if (a.hero) drawHero(a.hero, x0 + i * spacing - 7, 190 - hop, f, stateT, false, hop > 1, false, a.v);
    else drawPerson(x0 + i * spacing - 6, 192 - hop, f, a.look, stateT, false, hop > 1);
  });
  drawGrumpProp(VW - 64, 176, 0.62, true);
  text('JESUS LOVES YOU!', VW / 2, 140, { size: 10, color: '#fff3b0', align: 'center' });
  text('GOD BLESS AMERICA!', VW / 2, 158, { size: 10, color: '#e63946', align: 'center', shadowColor: '#fff' });
  text('FINAL SCORE: ' + score, VW / 2, 226, { size: 8, color: '#fff', align: 'center' });
  if (stateT > 2 && Math.floor(gtime * 2) % 2) text('PRESS ENTER TO PLAY AGAIN', VW / 2, 246, { size: 6, color: '#ffd34d', align: 'center' });
}

function devLabel(dev) {
  if (dev.startsWith('net:')) dev = dev.split(':').slice(2).join(':');
  if (dev === 'kbL') return party.length === 1 ? 'KEYBOARD' : 'WASD  Q=FIRE E=BOMB';
  if (dev === 'kbR') return 'ARROWS  K=FIRE L=BOMB';
  if (dev === 'touch') return 'TOUCH SCREEN';
  return 'GAMEPAD';
}
function drawLobby() {
  drawBackground();
  ctx.globalAlpha = 0.45; R(0, 0, VW, VH, '#000'); ctx.globalAlpha = 1;
  for (const p of particles) { ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5); R(p.x - 1, p.y - 1, p.size, p.size, p.color); }
  ctx.globalAlpha = 1;
  text('WHO IS PLAYING?', VW / 2, 10, { size: 14, color: '#ffd34d', align: 'center' });
  if (NET.code) text('ROOM CODE: ' + NET.code + '   (others pick JOIN A GAME and type it)', VW / 2, 30, { size: 6, color: '#7dffa0', align: 'center' });
  else text('Press FIRE to join - up to 4 players!', VW / 2, 30, { size: 6, align: 'center' });
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const x = 12 + i * 116, y = 44, w = 108, h = 150, cx = x + w / 2, slot = party[i];
    ctx.globalAlpha = slot ? 0.75 : 0.4; R(x, y, w, h, '#0b0b18'); ctx.globalAlpha = 1;
    R(x, y, w, 2, PCOL[i]); R(x, y + h - 2, w, 2, PCOL[i]); R(x, y, 2, h, PCOL[i]); R(x + w - 2, y, 2, h, PCOL[i]);
    text('P' + (i + 1), cx, y + 8, { size: 8, color: PCOL[i], align: 'center' });
    if (slot && NET.role !== 'local') text(isLocalDev(slot.dev) ? 'HERE' : 'ONLINE', x + w - 6, y + 6, { size: 4, color: isLocalDev(slot.dev) ? '#7dffa0' : '#ffd34d', align: 'right' });
    if (slot) {
      const v = heroVariant(i), hop = Math.max(0, Math.sin(titleFx * 5 + i)) * 4;
      ctx.save(); ctx.translate(cx - 21, y + 26 - hop); ctx.scale(3, 3); drawHero(slot.hero, 0, 0, 1, titleFx, false, false, false, v); ctx.restore();
      text('< ' + HEROES[slot.hero].name + ' >', cx, y + 96, { size: 7, color: HEROES[slot.hero].color, align: 'center' });
      text(devLabel(slot.dev), cx, y + 114, { size: 4, color: '#ccc', align: 'center' });
      text('LEFT/RIGHT: pick', cx, y + 126, { size: 4, color: '#888', align: 'center' });
      text('BOMB: leave', cx, y + 135, { size: 4, color: '#888', align: 'center' });
    } else {
      if (Math.floor(gtime * 2 + i) % 2) text('PRESS FIRE', cx, y + 56, { size: 6, align: 'center' });
      text('TO JOIN', cx, y + 68, { size: 6, align: 'center' });
      text('Left keys: Q', cx, y + 96, { size: 4, color: '#aaa', align: 'center' });
      text('Right keys: K', cx, y + 106, { size: 4, color: '#aaa', align: 'center' });
      text('Gamepad: A or X', cx, y + 116, { size: 4, color: '#aaa', align: 'center' });
      if (touch.used) text('Touch: tap here', cx, y + 126, { size: 4, color: '#aaa', align: 'center' });
    }
  }
  if (party.length) {
    ctx.globalAlpha = 0.7; R(VW / 2 - 110, 204, 220, 22, '#1d5fd8'); ctx.globalAlpha = 1;
    text(party.length === 1 ? 'GO!  (ENTER / START)' : party.length + ' PLAYERS - GO!  (ENTER / START)', VW / 2, 211, { size: 6, color: '#fff', align: 'center' });
  }
  text(NET.role === 'local' ? 'ESC = back     Players 3 & 4 need gamepads' : 'ESC = leave the online game', VW / 2, 238, { size: 5, color: '#ccc', align: 'center' });
  text('All players share the lives. Rescue family for more!', VW / 2, 252, { size: 4, color: '#aaa', align: 'center' });
}

// The store icon (store/icon.png): the brothers in front of a big KA-BOOM and the flag.
// Drawn in the 272x272 square in the middle of the screen. tools/make-icon.js snaps it.
function drawIcon() {
  ctx.save(); ctx.translate((VW - VH) / 2, 0);
  const S = VH;
  const g = ctx.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#2f7fe0'); g.addColorStop(1, '#8fd6ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 16; i++) { // sunburst
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.0)';
    ctx.beginPath(); ctx.moveTo(S / 2, 150);
    const a0 = i / 16 * Math.PI * 2, a1 = (i + 1) / 16 * Math.PI * 2;
    ctx.lineTo(S / 2 + Math.cos(a0) * 400, 150 + Math.sin(a0) * 400); ctx.lineTo(S / 2 + Math.cos(a1) * 400, 150 + Math.sin(a1) * 400); ctx.fill();
  }
  circle(S / 2, 132, 104, '#ff8c1a'); circle(S / 2, 132, 80, '#ffd34d'); circle(S / 2, 132, 50, '#fff3b0');
  drawFlagCloth(S / 2 - 54, 18, 108, 60, true);
  R(0, S - 40, S, 40, '#4caf50'); R(0, S - 34, S, 34, '#8b5a2b');
  ctx.save(); ctx.translate(22, S - 40 - 120); ctx.scale(6, 6); drawHero("noah", 0, 0, 1, 0, false, false, true, 0); ctx.restore();
  ctx.save(); ctx.translate(S - 22 - 84, S - 40 - 120); ctx.scale(6, 6); drawHero("elijah", 0, 0, -1, 0, false, false, true, 0); ctx.restore();
  ctx.restore();
}

function render() {
  NET.fxLocal = true; // anything drawn here is local decoration, not a game event
  try { renderInner(); } finally { NET.fxLocal = false; }
}
function renderInner() {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (state === 'icon') { drawIcon(); return; }
  if (state === 'title') { drawTitle(); return; }
  if (state === 'lobby') { drawLobby(); return; }
  if (state === 'online') { drawOnlineMenu(); return; }
  if (state === 'code') { drawCodeEntry(); return; }
  if (state === 'netwait') { drawNetWait(); return; }
  if (state === 'story') { drawStory(); return; }
  if (state === 'victory') { drawVictory(); return; }
  drawBackground();
  drawWorld();
  if (flash > 0) { ctx.globalAlpha = Math.min(1, flash); R(0, 0, VW, VH, flashColor); ctx.globalAlpha = 1; }
  if (state !== 'cutscene') drawHUD();
  drawBanner();
  drawTouch();
  if (state === 'intro') drawLevelCard();
  if (state === 'cutscene' && cut.summary) drawSummary();
  if (state === 'play' && paused) {
    ctx.globalAlpha = 0.6; R(0, 0, VW, VH, '#000'); ctx.globalAlpha = 1;
    text('PAUSED', VW / 2, 110, { size: 16, align: 'center' });
    text('P / ESC to keep smashing', VW / 2, 136, { size: 6, align: 'center' });
  }
  if (state === 'gameover') {
    ctx.globalAlpha = 0.65; R(0, 0, VW, VH, '#000'); ctx.globalAlpha = 1;
    text('OH NO!', VW / 2, 90, { size: 18, color: '#ff3b3b', align: 'center' });
    text('The Grumbots got you this time...', VW / 2, 120, { size: 6, align: 'center' });
    text('but heroes never give up!', VW / 2, 132, { size: 6, align: 'center' });
    if (stateT > 1) text('PRESS ENTER / FIRE TO TRY AGAIN', VW / 2, 160, { size: 6, color: '#ffd34d', align: 'center' });
  }
}

// =====================================================================
// NETWORK PLAY
// Works like Race Track Mayhem's online races (same relay rules and message
// format as its server/relay): one screen HOSTS and runs the real game, gets a
// 4-letter room code, and the others JOIN with it. Joined screens send their
// button presses to the host; the host sends back a picture of the game about
// 20 times a second, plus "effects" (sparks, sounds, debris) so every screen
// can draw them itself. Two places to meet:
//   HOME NETWORK: `node server.js` on one computer (serves the game + relay)
//   INTERNET:     the Cloudflare relay below, for players in different houses
// =====================================================================
const RELAY_PROTOCOL = 1;
// Internet game servers, tried in order. The first is Boom Brothers' own relay
// (server/relay, deployed by the "Relay server" GitHub workflow). If it can't be
// reached at all (e.g. not deployed yet), Race Track Mayhem's relay is used: same rules.
// Add ?relay=wss://... to the page address to use a different one.
const RELAY_OVERRIDE = new URLSearchParams(location.search).get('relay');
const INTERNET_RELAYS = RELAY_OVERRIDE ? [RELAY_OVERRIDE] : [
  'wss://boom-brothers-relay.andrewsaulls.workers.dev',
  'wss://race-track-mayhem-relay.andrewsaulls.workers.dev',
];
const GAME_TAG = 'BoomBrothers', NET_VERSION = 2; // bump when screens on different versions can't play together
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O (same as the relay's codes)
const SNAP_RATE = 1 / 20;
const NET = {
  role: 'local', ws: null, myId: 0, code: '', server: 'internet', homeOk: false, homeRooms: [],
  peers: new Map(), remoteIn: {}, remoteLatch: {}, fx: [], tileDiffs: [], fxLocal: false,
  levelSeq: 0, fullT: 0, snapT: 0, seq: -1, camTarget: 0, music: 0, msg: '', waitMsg: '', joinT: 0, gotSnap: false,
  sentIn: {}, sentT: 0, escPrev: true, codeBuf: '', lastError: '',
  get recording() { return this.role === 'host' && this.peers.size > 0; },
};
function r1(v) { return Math.round(v * 10) / 10; }
function r2(v) { return Math.round(v * 100) / 100; }
const IN_KEYS = [...ACTIONS, 'join', 'start'];
function toMask(st) { let m = 0; IN_KEYS.forEach((k, i) => { if (st[k]) m |= 1 << i; }); return m; }
function fromMask(m) { const st = {}; IN_KEYS.forEach((k, i) => { st[k] = !!(m & (1 << i)); }); return st; }
function isLocalDev(dev) { return NET.role === 'client' ? dev.startsWith('net:' + NET.myId + ':') : !dev.startsWith('net:'); }

// Sounds played on the host are played on every screen.
const SFX_RAW = { ...SFX };
for (const k of Object.keys(SFX)) SFX[k] = (...a) => { if (NET.recording && !NET.fxLocal) NET.fx.push(['s', k, ...a]); SFX_RAW[k](...a); };

// ---- connecting
function netCheckHomeServer() {
  if (!location.protocol.startsWith('http')) return;
  fetch('/rooms', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => {
    if (!j || j.server !== 'boombros') return;
    if (!NET.homeOk) NET.server = 'home';
    NET.homeOk = true; NET.homeRooms = j.rooms || [];
  }).catch(() => {});
}
netCheckHomeServer();
function relayBase(i = 0) {
  return NET.server === 'home' ? (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host : INTERNET_RELAYS[i];
}
const textEnc = new TextEncoder(), textDec = new TextDecoder();
function sendBin(target, obj) {
  const ws = NET.ws;
  if (!ws || ws.readyState !== 1) return;
  const body = textEnc.encode(JSON.stringify(obj)), buf = new Uint8Array(5 + body.length);
  new DataView(buf.buffer).setInt32(0, target, true); buf[4] = 0; buf.set(body, 5);
  ws.send(buf);
}
function netConnect(asHost, code, relayIdx = 0) {
  netClose();
  NET.lastError = ''; NET.msg = '';
  let ws;
  try { ws = new WebSocket(relayBase(relayIdx) + (asHost ? '/host' : '/join/' + code) + '?v=' + RELAY_PROTOCOL); }
  catch (e) { NET.msg = 'COULD NOT CONNECT'; return; }
  let opened = false;
  ws.onopen = () => { opened = true; };
  ws.binaryType = 'arraybuffer';
  Object.assign(NET, { ws, joinT: 10, gotSnap: false, code: '', escPrev: true,
    waitMsg: asHost ? 'STARTING AN ONLINE GAME...' : 'JOINING GAME ' + code + '...' });
  state = 'netwait'; stateT = 0;
  ws.onmessage = e => { if (NET.ws === ws) netOnMessage(e.data); };
  ws.onclose = e => {
    if (NET.ws !== ws) return;
    NET.ws = null;
    // Never reached this server at all? Quietly try the next one.
    if (!opened && NET.server === 'internet' && relayIdx + 1 < INTERNET_RELAYS.length) { netConnect(asHost, code, relayIdx + 1); return; }
    netLost(CLOSE_MSG[e.code] || NET.lastError || e.reason || '');
  };
}
// The relay may be shared with Race Track Mayhem, so we use our own words for its close codes.
const CLOSE_MSG = { 4001: 'THE HOST REMOVED YOU', 4002: 'THE HOST LEFT THE GAME', 4003: 'THAT GAME IS FULL', 4004: 'NO GAME WITH THAT CODE - CHECK THE LETTERS!', 4005: 'THE SERVER IS A DIFFERENT VERSION' };
function netClose() {
  const ws = NET.ws;
  NET.ws = null;
  if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch (e) { /* ignore */ } }
  NET.role = 'local'; NET.code = ''; NET.myId = 0; NET.peers.clear(); NET.remoteIn = {}; NET.fx = []; NET.tileDiffs = [];
}
function netEnd(msg) { // back to the online menu with a message
  const wasClient = NET.role === 'client' || state === 'netwait';
  netClose();
  stopMusic();
  if (wasClient) { party = []; players = []; }
  state = 'online'; stateT = 0; NET.msg = String(msg || '').toUpperCase();
}
function netLost(reason) {
  if (NET.role === 'host' && state !== 'lobby') { // keep playing on this screen
    netClose();
    party = party.filter(q => !q.dev.startsWith('net:'));
    setBanner('ONLINE GAME ENDED', '#ff8a8a', 2.5, 'You can keep playing here.');
    return;
  }
  netEnd(reason || 'LOST THE CONNECTION');
}
function netOnMessage(data) {
  if (typeof data === 'string') { // a message from the relay itself
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (m.t === 'welcome') {
      NET.myId = m.id; NET.code = m.code;
      if (m.id === 1) { NET.role = 'host'; NET.peers.clear(); NET.remoteIn = {}; openLobby(touch.used ? {} : null); }
      else { NET.role = 'client'; NET.waitMsg = 'WAITING FOR THE HOST...'; sendBin(1, { t: 'hello', game: GAME_TAG, v: NET_VERSION }); }
    } else if (m.t === 'join' && NET.role === 'host') NET.peers.set(m.id, { ok: false });
    else if (m.t === 'leave' && NET.role === 'host') netPeerLeft(m.id);
    else if (m.t === 'error') NET.lastError = m.msg;
    return;
  }
  const bytes = new Uint8Array(data);
  if (bytes.length < 5) return;
  const from = new DataView(data).getInt32(0, true);
  let m; try { m = JSON.parse(textDec.decode(bytes.subarray(5))); } catch (e) { return; } // not ours: ignore
  if (!m || typeof m !== 'object') return;
  if (NET.role === 'host') netHostMessage(from, m);
  else if (NET.role === 'client' && from === 1) {
    if (m.t === 'snap') { applySnap(m); NET.gotSnap = true; }
    else if (m.t === 'bye') netEnd(m.msg);
  }
}

// ---- host side
function netHostMessage(from, m) {
  if (!NET.peers.has(from)) NET.peers.set(from, { ok: false });
  const peer = NET.peers.get(from);
  if (m.t === 'hello') {
    if (m.game !== GAME_TAG || m.v !== NET_VERSION) {
      sendBin(from, { t: 'bye', msg: m.game === GAME_TAG ? 'THAT GAME IS ON A DIFFERENT VERSION - UPDATE BOTH!' : 'THAT CODE IS FOR A DIFFERENT GAME' });
      if (NET.ws) NET.ws.send(JSON.stringify({ t: 'kick', id: from }));
      return;
    }
    peer.ok = true; NET.fullT = 0; NET.snapT = 0;
    SFX.swap();
  } else if (m.t === 'in' && peer.ok && m.d && typeof m.d === 'object') {
    NET.remoteIn[from] = m.d;
    const lat = NET.remoteLatch[from] || (NET.remoteLatch[from] = {});
    for (const k in m.d) lat[k] = (lat[k] || 0) | m.d[k]; // a quick tap is never missed
  }
}
function netPeerLeft(id) {
  NET.peers.delete(id); delete NET.remoteIn[id];
  if (state === 'lobby') party = party.filter(q => !q.dev.startsWith('net:' + id + ':'));
}
function netHostTick(dt) {
  if (NET.role !== 'host') return;
  NET.snapT -= dt; NET.fullT -= dt;
  if (NET.snapT > 0) return;
  NET.snapT = SNAP_RATE;
  const anyone = [...NET.peers.values()].some(p => p.ok);
  if (!anyone || !NET.ws || NET.ws.bufferedAmount > 512 * 1024) { if (!anyone) { NET.fx = []; NET.tileDiffs = []; } return; }
  sendBin(0, makeSnap());
}
function makeSnap() {
  const vis = o => o.x > camX - 140 && o.x < camX + VW + 140;
  const s = {
    t: 'snap', st: state, stT: r1(stateT), lv: level ? level.index : -1, seq: NET.levelSeq, pz: paused, cam: r1(camX),
    li: lives, sc: score, sh: r1(shake), fl: r2(flash), fc: flashColor, bn: banner, mu: musicOn ? (musicTempo > 1 ? 2 : 1) : pendingMusic ? (pendingMusic === 'fast' ? 2 : 1) : 0,
    pt: party.map(q => [q.dev, q.hero]), res: rescuedAll, code: NET.code, sl: levelIndex,
  };
  let fx = NET.fx; NET.fx = [];
  if (fx.length > 900) { let n = 0; fx = fx.filter(e => e[0] !== 'p' || ++n < 600); } // keep it light
  s.fx = fx;
  if (!level) return s;
  s.pl = players.map(p => [p.idx, p.hero, p.v || 0, r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), p.facing, p.hp, p.maxHp, p.specials, p.alive ? 1 : 0,
    r1(p.deadT), r1(p.ghostY), r1(p.anim), p.moving ? 1 : 0, p.onGround ? 1 : 0, p.carried ? 1 : 0, r1(p.inv), r1(p.shield), p.muzzle > 0 ? 1 : 0, p.waiting ? 1 : 0, p.drum > 0 ? 1 : 0]);
  s.en = enemies.filter(vis).map(e => [e.type, r1(e.x), r1(e.y), r1(e.vx), e.facing, e.state, e.flash > 0 ? 1 : 0, r1(e.anim)]);
  s.bo = boss ? [r1(boss.x), r1(boss.y), boss.hp, boss.maxHp, boss.state, boss.facing, boss.flash > 0 ? 1 : 0, r1(boss.anim), boss.alive ? 1 : 0] : null;
  s.pr = projectiles.filter(vis).map(b => [b.kind, r1(b.x), r1(b.y), r1(b.vx), r1(b.vy)]);
  s.gr = grenades.map(g => [g.kind, r1(g.x), r1(g.y), r1(g.spin)]);
  s.pk = pickups.filter(vis).map(p => [p.kind, r1(p.x), r1(p.y), r1(p.t)]);
  s.cg = cages.map(c => [r1(c.x), r1(c.y), c.freed ? 1 : 0, c.look]);
  s.cr = crosses.map(c => (c.active ? 1 : 0));
  s.fg = flag ? [r2(flag.raised), flag.locked ? 1 : 0, r2(flag.drop)] : null;
  s.fo = followers.map(f => [r1(f.x), r1(f.y), f.facing, f.look, r1(f.vx), f.onGround ? 1 : 0, r1(f.anim)]);
  s.ex = explosions.map(e => [r1(e.x), r1(e.y), e.r, r2(e.t), r2(e.max), e.color || 0]);
  s.nk = nukes.map(n => [r1(n.x), r1(n.y), r2(n.t), n.max, n.s || 1]);
  s.tx = texts.map(t => [r1(t.x), r1(t.y), t.str, t.color, t.size, r2(t.t)]);
  s.cut = cut ? { e: cut.ending, s: cut.summary, eg: cut.eagle && [r1(cut.eagle.x), r1(cut.eagle.y), r2(cut.eagle.flap)], br: cut.bear && [r1(cut.bear.x), r1(cut.bear.y), cut.bear.phase] } : null;
  s.k = level.kills; s.r = level.rescues;
  s.td = NET.tileDiffs; NET.tileDiffs = [];
  if (NET.fullT <= 0) { NET.fullT = 3; let t = ''; for (let i = 0; i < level.tiles.length; i++) t += String.fromCharCode(48 + level.tiles[i]); s.tf = t; }
  return s;
}

// ---- joined-screen side
const CENTERED = { get cx() { return this.x + this.w / 2; }, get cy() { return this.y + this.h / 2; } };
const centered = o => Object.assign(Object.create(CENTERED), o);
function applySnap(s) {
  if (s.lv >= 0 && (s.seq !== NET.seq || !level || level.index !== s.lv)) { buildLevel(s.lv); NET.seq = s.seq; }
  const first = state === 'netwait';
  if (s.st !== state || Math.abs(stateT - s.stT) > 0.5) stateT = s.stT;
  state = s.st; paused = s.pz; lives = s.li; score = s.sc; shake = s.sh; flash = s.fl; flashColor = s.fc; banner = s.bn;
  party = s.pt.map(([dev, hero]) => ({ dev, hero })); rescuedAll = s.res; NET.code = s.code;
  NET.camTarget = s.cam; if (first || Math.abs(camX - s.cam) > 200) camX = s.cam;
  if (s.mu !== NET.music) { NET.music = s.mu; if (s.mu) startMusic(s.mu === 2); else stopMusic(); }
  if (s.lv >= 0) levelIndex = s.lv;
  if (s.sl !== undefined && (state === 'story' || s.lv < 0)) levelIndex = s.sl;
  for (const e of s.fx || []) {
    if (e[0] === 'p') part(...e.slice(1));
    else if (e[0] === 's') { if (SFX_RAW[e[1]]) SFX_RAW[e[1]](...e.slice(2)); }
    else if (e[0] === 'r') rockets.push({ x: e[1], y: e[2], vx: e[3], vy: e[4], fuse: e[5], colors: e[6] });
    else if (e[0] === 'c') corpses.push({ type: e[1], x: e[2], y: e[3], w: e[4], h: e[5], vx: e[6], vy: e[7], rot: 0, vr: e[8], t: e[9], facing: e[10] });
  }
  if (!level || !s.pl) return;
  if (s.tf) for (let i = 0; i < s.tf.length && i < level.tiles.length; i++) { const t = s.tf.charCodeAt(i) - 48; if (level.tiles[i] !== t) { level.tiles[i] = t; level.hp[i] = TILE_HP[t]; } }
  for (let i = 0; i + 2 < (s.td || []).length; i += 3) { level.tiles[s.td[i]] = s.td[i + 1]; level.hp[s.td[i]] = s.td[i + 1] ? s.td[i + 2] : 0; }
  players = s.pl.map(a => centered({ idx: a[0], hero: a[1], v: a[2], x: a[3], y: a[4], vx: a[5], vy: a[6], facing: a[7], hp: a[8], maxHp: a[9], specials: a[10],
    alive: !!a[11], deadT: a[12], ghostY: a[13], anim: a[14], moving: !!a[15], onGround: !!a[16], carried: !!a[17], inv: a[18], shield: a[19], muzzle: a[20] ? 1 : 0, waiting: !!a[21], drum: a[22] ? 1 : 0, w: 10, h: 20 }));
  enemies = s.en.map(a => centered({ type: a[0], x: a[1], y: a[2], vx: a[3], facing: a[4], state: a[5], flash: a[6] ? 1 : 0, anim: a[7], w: ENEMY_STATS[a[0]].w, h: ENEMY_STATS[a[0]].h, alive: true }));
  boss = s.bo ? centered({ x: s.bo[0], y: s.bo[1], hp: s.bo[2], maxHp: s.bo[3], state: s.bo[4], facing: s.bo[5], flash: s.bo[6] ? 1 : 0, anim: s.bo[7], alive: !!s.bo[8], w: 44, h: 56 }) : null;
  projectiles = s.pr.map(a => ({ kind: a[0], x: a[1], y: a[2], vx: a[3], vy: a[4] }));
  grenades = s.gr.map(a => ({ kind: a[0], x: a[1], y: a[2], spin: a[3] }));
  pickups = s.pk.map(a => ({ kind: a[0], x: a[1], y: a[2], t: a[3] }));
  cages = s.cg.map(a => ({ x: a[0], y: a[1], w: 16, h: 20, freed: !!a[2], look: a[3] }));
  s.cr.forEach((a, i) => { if (crosses[i]) crosses[i].active = !!a; });
  if (flag && s.fg) { flag.raised = s.fg[0]; flag.locked = !!s.fg[1]; flag.drop = s.fg[2]; }
  followers = s.fo.map(a => ({ x: a[0], y: a[1], facing: a[2], look: a[3], vx: a[4], onGround: !!a[5], anim: a[6], w: 10, h: 18 }));
  explosions = s.ex.map(a => ({ x: a[0], y: a[1], r: a[2], t: a[3], max: a[4], color: a[5] || undefined }));
  nukes = s.nk.map(a => ({ x: a[0], y: a[1], t: a[2], max: a[3], s: a[4] }));
  texts = s.tx.map(a => ({ x: a[0], y: a[1], str: a[2], color: a[3], size: a[4], t: a[5] }));
  cut = s.cut ? { ending: s.cut.e, summary: s.cut.s, eagle: s.cut.eg && { x: s.cut.eg[0], y: s.cut.eg[1], flap: s.cut.eg[2] }, bear: s.cut.br && { x: s.cut.br[0], y: s.cut.br[1], phase: s.cut.br[2] } } : null;
  level.kills = s.k; level.rescues = s.r;
}
function netSendInputs(dt) {
  const d = {};
  for (const dev of localDevices()) d[dev] = toMask(devState(dev));
  NET.sentT -= dt;
  const keysNow = Object.keys(d);
  const changed = keysNow.length !== Object.keys(NET.sentIn).length || keysNow.some(k => d[k] !== NET.sentIn[k]);
  if (changed || NET.sentT <= 0) { sendBin(1, { t: 'in', d }); NET.sentIn = d; NET.sentT = 1; }
}
function clientUpdate(dt) {
  const m = menuInput();
  if (m.mute) toggleMute();
  const esc = down('Escape');
  if (esc && !NET.escPrev) { netEnd(NET.role === 'client' ? 'YOU LEFT THE GAME' : ''); return; }
  NET.escPrev = esc;
  if (state === 'netwait') {
    NET.joinT -= dt;
    if (NET.joinT <= 0) {
      const where = NET.server === 'home' ? 'THE HOME SERVER' : 'THE INTERNET SERVER';
      netEnd(NET.role === 'client' ? 'THE HOST DID NOT ANSWER' : "COULDN'T REACH " + where);
      return;
    }
    if (NET.role !== 'client') return;
  }
  netSendInputs(dt);
  titleFx += dt;
  updateFx(dt);
  for (const p of players) if (p.alive && !p.carried) { p.x += p.vx * dt; p.y += p.vy * dt; }
  for (const e of enemies) e.x += e.vx * dt;
  for (const b of projectiles) { b.x += b.vx * dt; b.y += b.vy * dt; }
  camX += (NET.camTarget - camX) * Math.min(1, dt * 15);
}

// ---- online menu, code entry, waiting screens
let onlineIdx = 0, codeCursor = 0, codePrev = {}, homePollT = 0;
const ONLINE_Y = 92;
const ONLINE_ITEMS = () => ['HOST A GAME', 'JOIN A GAME', 'MEET ON: ' + (NET.server === 'home' ? 'HOME NETWORK' : 'INTERNET') + (NET.homeOk ? '  < >' : ''), 'BACK'];
function toggleServer() {
  if (!NET.homeOk) { NET.msg = 'HOME NETWORK NEEDS server.js (SEE README)'; return; }
  NET.server = NET.server === 'home' ? 'internet' : 'home'; SFX.hit();
}
function updateOnlineMenu(dt, m) {
  titleFx += dt; updateFx(dt);
  const n = 4;
  if (m.up) { onlineIdx = (onlineIdx + n - 1) % n; SFX.hit(); }
  if (m.down) { onlineIdx = (onlineIdx + 1) % n; SFX.hit(); }
  if (onlineIdx === 2 && (m.left || m.right)) toggleServer();
  if (m.pause) { state = 'title'; stateT = 0; return; }
  if (m.tap) {
    let hit = false;
    for (let i = 0; i < n; i++) if (Math.abs(m.tap.y - (ONLINE_Y + 4 + i * 16)) < 8) { onlineIdx = i; hit = true; }
    if (!hit) return;
  }
  if (m.confirm && stateT > 0.3) {
    if (onlineIdx === 0) netConnect(true);
    else if (onlineIdx === 1) { state = 'code'; stateT = 0; NET.codeBuf = ''; codeCursor = 0; codePrev = { esc: true }; NET.msg = ''; netCheckHomeServer(); }
    else if (onlineIdx === 2) toggleServer();
    else { state = 'title'; stateT = 0; }
  }
}
// Code entry: type letters on a keyboard, or pick them on screen with a gamepad / finger.
const GRID = { x: 96, y: 78, w: 36, h: 22, cols: 8 };
function codeCells() {
  const cells = [];
  for (let i = 0; i < CODE_LETTERS.length; i++) cells.push({ kind: 'letter', v: CODE_LETTERS[i], x: GRID.x + (i % GRID.cols) * GRID.w, y: GRID.y + Math.floor(i / GRID.cols) * GRID.h, w: GRID.w - 4, h: GRID.h - 4 });
  const ry = GRID.y + 3 * GRID.h;
  cells.push({ kind: 'del', x: GRID.x, y: ry, w: 140, h: 18 }, { kind: 'go', x: GRID.x + 148, y: ry, w: 136, h: 18 });
  if (NET.server === 'home') NET.homeRooms.slice(0, 4).forEach((r, i) => cells.push({ kind: 'room', v: r.code, x: GRID.x + i * 72, y: ry + 44, w: 66, h: 18 }));
  return cells;
}
function pressCell(c) {
  if (!c) return;
  if (c.kind === 'letter' && NET.codeBuf.length < 4) { NET.codeBuf += c.v; SFX.hit(); }
  else if (c.kind === 'del') { NET.codeBuf = NET.codeBuf.slice(0, -1); SFX.hit(); }
  else if (c.kind === 'go') { if (NET.codeBuf.length === 4) netConnect(false, NET.codeBuf); else NET.msg = 'TYPE ALL 4 LETTERS'; }
  else if (c.kind === 'room') netConnect(false, c.v);
}
function updateCodeEntry(dt, m) {
  titleFx += dt; updateFx(dt);
  homePollT -= dt;
  if (NET.server === 'home' && homePollT <= 0) { homePollT = 2; netCheckHomeServer(); }
  const cells = codeCells();
  // keyboard typing
  for (const c of typed) {
    if (c.startsWith('Key') && CODE_LETTERS.includes(c.slice(3)) && NET.codeBuf.length < 4) { NET.codeBuf += c.slice(3); SFX.hit(); }
    if (c === 'Backspace') NET.codeBuf = NET.codeBuf.slice(0, -1);
    if (c === 'Enter') {
      if (NET.codeBuf.length === 4) { netConnect(false, NET.codeBuf); return; }
      if (!NET.codeBuf && NET.homeRooms.length === 1 && NET.server === 'home') { netConnect(false, NET.homeRooms[0].code); return; }
    }
    if (c === 'Escape') { state = 'online'; stateT = 0; return; }
  }
  // gamepad / arrow keys move a cursor over the on-screen letters
  const pads = gamepads().map(padState);
  const cur = {
    l: !!keys.ArrowLeft || pads.some(p => p.left), r: !!keys.ArrowRight || pads.some(p => p.right),
    u: !!keys.ArrowUp || pads.some(p => p.up && !p.fire), d: !!keys.ArrowDown || pads.some(p => p.down),
    a: gamepads().some(p => p.buttons[0] && p.buttons[0].pressed) || pads.some(p => p.fire),
    b: gamepads().some(p => p.buttons[1] && p.buttons[1].pressed), go: pads.some(p => p.start),
  };
  const e = k => cur[k] && !codePrev[k]; codePrev = cur;
  const c0 = cells[codeCursor] || cells[0];
  const near = (dx, dy) => {
    let best = codeCursor, bd = 1e9;
    cells.forEach((c, i) => {
      const ddx = (c.x + c.w / 2) - (c0.x + c0.w / 2), ddy = (c.y + c.h / 2) - (c0.y + c0.h / 2);
      if ((dx && Math.sign(ddx) === dx && Math.abs(ddy) < 12) || (dy && Math.sign(ddy) === dy)) {
        const d = dx ? Math.abs(ddx) : Math.abs(ddy) * 4 + Math.abs(ddx);
        if (d < bd) { bd = d; best = i; }
      }
    });
    return best;
  };
  if (e('l')) codeCursor = near(-1, 0);
  if (e('r')) codeCursor = near(1, 0);
  if (e('u')) codeCursor = near(0, -1);
  if (e('d')) codeCursor = near(0, 1);
  codeCursor = clamp(codeCursor, 0, cells.length - 1);
  if (e('a')) pressCell(cells[codeCursor]);
  if (e('b')) NET.codeBuf = NET.codeBuf.slice(0, -1);
  if (e('go') && NET.codeBuf.length === 4) netConnect(false, NET.codeBuf);
  if (m.tap) { const c = cells.find(c => m.tap.x >= c.x && m.tap.x <= c.x + c.w && m.tap.y >= c.y && m.tap.y <= c.y + c.h); if (c) { codeCursor = cells.indexOf(c); pressCell(c); } }
}
function drawMenuBackdrop(title) {
  drawBackground();
  ctx.globalAlpha = 0.5; R(0, 0, VW, VH, '#000'); ctx.globalAlpha = 1;
  for (const p of particles) { ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5); R(p.x - 1, p.y - 1, p.size, p.size, p.color); }
  ctx.globalAlpha = 1;
  text(title, VW / 2, 14, { size: 16, color: '#ffd34d', align: 'center' });
}
function drawNetMsg(y) { if (NET.msg) text(NET.msg, VW / 2, y, { size: 6, color: '#ff8a8a', align: 'center' }); }
function drawOnlineMenu() {
  drawMenuBackdrop('PLAY ONLINE');
  text('Everyone plays on their own computer or tablet!', VW / 2, 40, { size: 6, align: 'center' });
  const items = ONLINE_ITEMS();
  ctx.globalAlpha = 0.6; R(VW / 2 - 120, ONLINE_Y - 4, 240, items.length * 16 + 4, '#000'); ctx.globalAlpha = 1;
  items.forEach((s, i) => text((i === onlineIdx ? '> ' : '  ') + s, VW / 2 - 110, ONLINE_Y + i * 16, { size: 7, color: i === onlineIdx ? '#ffd34d' : '#ddd' }));
  const tip = NET.server === 'home'
    ? ['HOME NETWORK: everyone in the house opens', 'this computer\'s server address (shown by server.js).']
    : ['INTERNET: works between houses. The host gets a', '4-letter code; the others type it in to join.'];
  text(tip[0], VW / 2, 172, { size: 5, color: '#bbb', align: 'center' });
  text(tip[1], VW / 2, 182, { size: 5, color: '#bbb', align: 'center' });
  drawNetMsg(204);
  text('ESC = back', VW / 2, 250, { size: 5, color: '#888', align: 'center' });
}
function drawCodeEntry() {
  drawMenuBackdrop('TYPE THE ROOM CODE');
  for (let i = 0; i < 4; i++) {
    const x = VW / 2 - 66 + i * 34, ch = NET.codeBuf[i];
    R(x, 38, 30, 30, ch ? '#1d5fd8' : '#222'); R(x, 66, 30, 2, '#ffd34d');
    if (ch) text(ch, x + 15, 45, { size: 16, align: 'center' });
    else if (i === NET.codeBuf.length && Math.floor(gtime * 3) % 2) R(x + 10, 60, 10, 3, '#fff');
  }
  const cells = codeCells();
  cells.forEach((c, i) => {
    const sel = i === codeCursor;
    ctx.globalAlpha = 0.8; R(c.x, c.y, c.w, c.h, sel ? '#ffd34d' : c.kind === 'go' ? '#2e9e44' : c.kind === 'room' ? '#1d5fd8' : '#333'); ctx.globalAlpha = 1;
    const label = c.kind === 'letter' ? c.v : c.kind === 'del' ? 'DELETE' : c.kind === 'go' ? 'JOIN!' : c.v;
    text(label, c.x + c.w / 2, c.y + c.h / 2 - 4, { size: 7, color: sel ? '#000' : '#fff', shadow: !sel, align: 'center' });
  });
  if (NET.server === 'home') {
    const ry = GRID.y + 3 * GRID.h + 32;
    text(NET.homeRooms.length ? 'GAMES ON THIS SERVER (tap one):' : 'NO GAMES ON THIS SERVER YET - SOMEONE PICKS HOST', VW / 2, ry, { size: 5, color: '#7dffa0', align: 'center' });
  }
  drawNetMsg(236);
  text('Type the letters, or pick them with a gamepad / finger.  ESC = back', VW / 2, 252, { size: 4, color: '#888', align: 'center' });
}
function drawNetWait() {
  drawMenuBackdrop('ONLINE');
  const dots = '.'.repeat(1 + Math.floor(gtime * 3) % 3);
  text(NET.waitMsg.replace(/\.+$/, '') + dots, VW / 2, 110, { size: 8, align: 'center' });
  text(NET.server === 'home' ? 'Using the home network server' : 'Using the internet server', VW / 2, 132, { size: 5, color: '#bbb', align: 'center' });
  text('ESC = cancel', VW / 2, 240, { size: 5, color: '#888', align: 'center' });
}

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0;
const STEP = 1 / 60;
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Small debug/test hook (handy for trying out levels from the browser console).
window.BOOM = {
  get state() { return state; }, get players() { return players; }, get enemies() { return enemies; }, get boss() { return boss; },
  get level() { return level; }, get net() { return NET; },
  get audio() {
    const files = Object.values(sfxPools).flat(2);
    return { music: musicSlot, musicPlaying: !!(musicEl && !musicEl.paused), musicTime: musicEl ? +musicEl.currentTime.toFixed(1) : 0,
      sfxFiles: files.length, sfxReady: files.filter(a => a.readyState >= 2).length, sfxBroken: files.filter(a => a.broken).length };
  }, get lives() { return lives; }, get score() { return score; }, get camX() { return camX; },
  get party() { return party; },
  start(levelNum = 1, n = 1, hero = 'noah') {
    party = Array.from({ length: n }, (_, i) => ({ dev: ['kbL', 'kbR', 'none', 'none'][i], hero: n === 1 ? hero : HERO_ORDER[i % HERO_ORDER.length] }));
    startLevelSel = levelNum - 1; lives = startLives(); score = 0; rescuedAll = []; startLevel(levelNum - 1); state = 'play'; },
  teleport(x) { for (const p of players) { p.x = x; p.y = 40; } updateCamera(0, true); },
  setState(s) { state = s; stateT = 0; },
  showIcon() { gtime = 0.3; state = 'icon'; },
};
})();
