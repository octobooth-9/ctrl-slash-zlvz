'use strict';
/* core.js — globals, constants, assets, sprite compositing, persistence */

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const fmt = (n) => Math.round(n).toLocaleString('en-US');

const cvs = $('#game');
const ctx = cvs.getContext('2d');
let W = 0, H = 0, DPR = 1, S = 96, K = 1, G = 1000, TOP = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isCoarse = matchMedia('(pointer: coarse)').matches;
const Q = isCoarse ? 0.7 : 1;             // particle quality
const PCAP = isCoarse ? 600 : 1000;       // particle cap

// ---------- Palette
const BUDDY_PAL = ['#23a8f2', '#23a8f2', '#0077b8', '#004e7c', '#5cc4ff'];
const SYNTAX = ['#569cd6', '#ce9178', '#dcdcaa', '#4ec9b0', '#b5cea8', '#c586c0', '#9cdcfe', '#d16969', '#ffd700'];
const CONFETTI = ['#ff4f81', '#ffd24a', '#4ec9b0', '#3794ff', '#c586c0', '#89d185', '#ff8c3b', '#ffffff'];
const GLYPHS = ['{', '}', ';', '()', '=>', '</>', '&&', '||', '!=', '[]', '0', '1', '#', '$', '@', '*', '::', '++', '??', '//', '%', '<T>', '...'];
const QUIPS = ['segfault', 'NaN', 'undefined', '404', 'null', 'OOM', 'SIGKILL', 'panic!()', 'core dumped', 'deprecated', 'git rm', 'exit 137',
  'E_BUDDY', 'yeet()', 'free()', 'unlinked', '0xDEAD', 'heap snapshot', 'GC\'d', 'dispose()', 'rm -f', '--force', 'LGTM', 'TODO: grieve'];
const RIP = ['// rip', '// here lies buddy', '// TODO: unsee', '/* gone */', '// works on my machine', '// @deprecated', '// FIXME', '// git blame me'];

// ---------- Hats (17, straight from the VS Code pet accessory atlases)
const TIERS = [
  { name: 'COMMON', pts: 25, color: '#9cdcfe', w: 60 },
  { name: 'RARE', pts: 60, color: '#4ec9b0', w: 28 },
  { name: 'EPIC', pts: 150, color: '#c586c0', w: 10 },
  { name: 'LEGENDARY', pts: 400, color: '#ffd24a', w: 2.5 },
];
const HATS = [
  ['baseball-cap', 'Baseball Cap', 0], ['straw-hat', 'Straw Hat', 0], ['bamboo-hat', 'Bamboo Hat', 0],
  ['construction-hard-hat', 'Hard Hat', 0], ['artist-beret', 'Artist Beret', 0], ['white-chef-hat', 'Chef Hat', 0],
  ['cowboy-hat', 'Cowboy Hat', 1], ['sailor-hat', 'Light Sailor Hat', 1], ['dark-sailor-hat', 'Dark Sailor Hat', 1],
  ['firefighter-helmet', 'Firefighter Helmet', 1], ['pink-party-hat', 'Pink Party Hat', 1], ['leaning-party-hat', 'Leaning Party Hat', 1],
  ['propeller-hat', 'Propeller Hat', 2], ['full-size-spinner-hat', 'Spinner Hat', 2], ['wizard-hat', 'Wizard Hat', 2],
  ['crown', 'Crown', 3], ['grand-top-hat-monocle', 'Grand Top Hat & Monocle', 3],
].map(([id, name, tier]) => ({ id, name, tier }));
const HAT = Object.fromEntries(HATS.map((h) => [h.id, h]));

const BLADES = {
  none: { glow: '#3794ff', core: '#eaf6ff', label: 'Default blade' },
  'baseball-cap': { glow: '#e5484d', core: '#fff', label: 'Dugout red' },
  'straw-hat': { glow: '#f5c542', core: '#fff8dc', label: 'Sunburn' },
  'bamboo-hat': { glow: '#7bc96f', core: '#f0ffe8', label: 'Bamboo' },
  'construction-hard-hat': { glow: '#ffb000', core: '#fff', label: 'Hazard' },
  'artist-beret': { glow: '#d6336c', core: '#ffe3ec', label: 'Brushstroke' },
  'white-chef-hat': { glow: '#ffffff', core: '#ffffff', label: 'Chef\'s knife' },
  'cowboy-hat': { glow: '#d4843a', core: '#ffe6c7', label: 'High noon' },
  'sailor-hat': { glow: '#9cdcfe', core: '#fff', label: 'Sea breeze' },
  'dark-sailor-hat': { glow: '#2b6cb0', core: '#9cdcfe', label: 'Deep sea' },
  'firefighter-helmet': { glow: '#ff5a1f', core: '#ffd166', fire: true, label: 'Backdraft' },
  'pink-party-hat': { glow: '#ff6ec7', core: '#fff', label: 'Party pink' },
  'leaning-party-hat': { glow: '#ff4fa3', core: '#fff', rainbow: true, label: 'Afterparty' },
  'propeller-hat': { rainbow: true, core: '#fff', label: 'Rainbow rotor' },
  'full-size-spinner-hat': { rainbow: true, core: '#fff', label: 'Full spin' },
  'wizard-hat': { glow: '#a970ff', core: '#f3e8ff', label: 'Arcane' },
  crown: { glow: '#ffd700', core: '#fffbe6', label: 'Royal gold' },
  'grand-top-hat-monocle': { glow: '#c0c0c0', core: '#fff', label: 'Distinguished silver' },
};

// ---------- Sprite animations (frame durations mirror chatPetWidget.ts)
const ANIMS = {
  idle: { file: 'buddy-idle-stable-96', n: 50, d: [40] },
  falling: { file: 'buddy-falling-stable-96', n: 6, d: [120, 80, 80, 120, 80, 80] },
  jump: { file: 'buddy-jump-stable-96', n: 6, d: [70, 80, 90, 160, 100, 100] },
  cool: { file: 'buddy-cool-stable-96', n: 9, d: [600, 120, 120, 120, 160, 80, 80, 80, 1640] },
  worry: { file: 'buddy-worry-stable-96', n: 2, d: [260, 260] },
  dizzy: { file: 'buddy-dizzy-stable-128', n: 8, fh: 128, cy: 96, d: [120] },
  love: { file: 'buddy-love-stable-96', n: 6, d: [200, 200, 380, 100, 80, 1980] },
  clapping: { file: 'buddy-clapping-stable-tracking-96', n: 13, d: [80, 40, 40, 40, 80, 40, 40, 40, 40, 80, 40, 40, 80] },
  splat: { file: 'buddy-splat-stable-96', n: 4, d: [120, 100, 100, 200] },
  speechless: { file: 'buddy-speechless-stable-96', n: 5, d: [400, 120, 1000, 120, 1080] },
  respawn: { file: 'buddy-respawn-stable-96', n: 6, d: [120, 100, 120, 240, 100, 120] },
  search: { file: 'buddy-search-stable-96', n: 4, d: [500] },
};
for (const A of Object.values(ANIMS)) {
  A.fw = 96; A.fh = A.fh || 96; A.cy = A.cy || 64;
  const d = A.d.length === 1 ? Array(A.n).fill(A.d[0]) : A.d;
  let acc = 0; A.cum = d.map((x) => (acc += x)); A.total = acc;
}
function frameOf(A, ms, loop = true) {
  const t = loop ? ((ms % A.total) + A.total) % A.total : Math.min(ms, A.total - 1);
  for (let i = 0; i < A.n; i++) if (t < A.cum[i]) return i;
  return A.n - 1;
}

// Head/eye anchors per frame, ported from chatPetAccessoryRig.ts (head y already includes the +8 wear offset).
function rig(anim, f) {
  switch (anim) {
    case 'idle': return f < 20 ? { hy: 40, ex: 56, ey: 56 } : { hy: 44, ex: 56, ey: 60 };
    case 'falling': return { hy: 40, ex: 48, ey: 48 };
    case 'jump': return { hy: [40, 56, 40, 40, 64, 40][f], ex: 56, ey: [56, 64, 48, 40, 64, 56][f] };
    case 'cool': return { hy: f === 2 ? 44 : 40 };
    case 'worry': return { hy: 40 };
    case 'dizzy': return { hy: 72 };
    case 'splat': return f < 3 ? { hy: [80, 72, 56][f], col: 3, py: 80 } : { hy: 40, ex: 56, ey: 56 };
    default: return { hy: 40, ex: 56, ey: 56 };
  }
}

const HAT_IMG = {};
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
async function loadAssets() {
  const jobs = [];
  for (const A of Object.values(ANIMS)) jobs.push(loadImg(`assets/${A.file}.spritesheet.png`).then((i) => { A.img = i; }));
  for (const h of HATS) jobs.push(loadImg(`assets/hats/${h.id}.png`).then((i) => { HAT_IMG[h.id] = i; }));
  await Promise.all(jobs);
}

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Composite one frame of Buddy (+ optional hat and tint) into canvas `c`, matching the VS Code accessory renderer.
function compose(c, anim, f, hat, tint) {
  const A = ANIMS[anim];
  if (c.width !== A.fw || c.height !== A.fh) { c.width = A.fw; c.height = A.fh; c._g = null; }
  const g = c._g || (c._g = c.getContext('2d'));
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.clearRect(0, 0, A.fw, A.fh);
  g.drawImage(A.img, f * A.fw, 0, A.fw, A.fh, 0, 0, A.fw, A.fh);
  if (hat && HAT_IMG[hat]) {
    const r = rig(anim, f); const img = HAT_IMG[hat];
    const sx = (r.col || 0) * 96; const dy = r.hy - (r.py || 40);
    g.clearRect(16, r.hy - 48, 64, 40); // hats cover the antennae
    g.globalCompositeOperation = 'destination-over';
    g.drawImage(img, sx, 0, 96, 96, 0, dy, 96, 96);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(img, sx, 96, 96, 96, 0, dy, 96, 96);
    if (r.ex !== undefined) g.drawImage(img, sx, 192, 96, 96, r.ex, r.ey, 96, 96);
  }
  if (tint) {
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = tint[1]; g.fillStyle = tint[0];
    g.fillRect(0, 0, A.fw, A.fh);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  return c;
}

// Loose hat sprite (front + back layers only)
const hatCache = {};
function hatSprite(id) {
  if (hatCache[id]) return hatCache[id];
  const c = mkCanvas(96, 56); const g = c.getContext('2d');
  g.drawImage(HAT_IMG[id], 0, 0, 96, 56, 0, 0, 96, 56);
  g.drawImage(HAT_IMG[id], 0, 96, 96, 56, 0, 0, 96, 56);
  return (hatCache[id] = c);
}

// Procedural pixel bomb: round black casing with a red error band
let BOMB_SPRITE = null;
function bombSprite() {
  if (BOMB_SPRITE) return BOMB_SPRITE;
  const c = mkCanvas(32, 32); const g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const cx = 16, cy = 18, r = 11;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d < r - 1) {
      const lit = Math.hypot(x - (cx - 4), y - (cy - 4));
      px(x, y, lit < 3 ? '#6b6b7a' : lit < 6 ? '#3a3a46' : '#222229');
    } else if (d < r) px(x, y, '#0c0c10');
  }
  for (let x = 12; x < 20; x++) for (let y = 5; y < 8; y++) px(x, y, y === 5 ? '#b8b8c8' : '#7c7c8c');
  [[16, 4], [17, 3], [18, 2], [19, 2], [20, 1]].forEach(([x, y]) => px(x, y, '#d8b27a'));
  for (let x = 6; x < 27; x++) for (let y = 19; y < 23; y++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r - 1) px(x, y, y === 19 ? '#ff6b6b' : '#e51400');
  return (BOMB_SPRITE = c);
}

// ---------- Persistence
const SAVE_KEY = 'ctrlslash.v1';
const save = (() => {
  const d = { best: { classic: 0, arcade: 0 }, hats: {}, equipped: null, muted: false, plays: 0 };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); return Object.assign(d, s, { best: Object.assign(d.best, s.best || {}) }); } catch { return d; }
})();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ } }
const discoveredCount = () => HATS.filter((h) => save.hats[h.id]).length;

function vibrate(p) { try { if (!reduceMotion && navigator.vibrate) navigator.vibrate(p); } catch { /* unsupported */ } }

// ---------- Editor background (pre-rendered)
const bgCanvas = mkCanvas(1, 1);
const CODE = [
  "import { Buddy, Hat, Blade } from './pets';",
  "import { confetti } from '@vscode/party';",
  '',
  '// TODO(team): stop slicing the pets',
  'export async function ship(buddies: Buddy[]) {',
  '  for (const b of buddies) {',
  "    if (b.hat?.rarity === 'legendary') flex(b);",
  "    await b.slice({ gore: 'confetti', mercy: false });",
  '  }',
  "  return 'LGTM';",
  '}',
  '',
  'class Blade implements Disposable {',
  '  private readonly _trail: Point[] = [];',
  '  constructor(private sharpness = 9001) {}',
  '  swipe(p: Point): void {',
  '    this._trail.push(p); // no undo',
  '  }',
  '  dispose(): void { /* never */ }',
  '}',
  '',
  'const RM_RF = /^rm -rf \\/$/; // do NOT slice',
  'let combo = 0, hats = new Set<Hat>();',
  '',
  'function onSlice(b: Buddy) {',
  '  combo++;',
  '  if (hats.has(b.hat)) matchingSet(b.hat);',
  '  hats.add(b.hat); // wardrobe++',
  '  emit(`${b.name} was deprecated`);',
  '}',
  '',
  '/* eslint-disable no-mercy */',
  'while (true) throwBuddies(Math.random() * 6);',
];
function highlight(g, line, x, y) {
  const re = /(\/\/.*$|\/\*.*?\*\/)|('[^']*'|`[^`]*`)|\b(import|from|export|async|function|for|const|let|if|await|return|class|implements|private|readonly|constructor|new|while|true|false|void)\b|\b(\d+)\b|([A-Za-z_]\w*)(?=\()|\b([A-Z]\w*)\b|([{}()[\];.,:?<>=+*/!|&-]+)/g;
  let last = 0, m;
  const put = (t, c) => { g.fillStyle = c; g.fillText(t, x, y); x += g.measureText(t).width; };
  while ((m = re.exec(line))) {
    if (m.index > last) put(line.slice(last, m.index), '#9cdcfe');
    const col = m[1] ? '#6a9955' : m[2] ? '#ce9178' : m[3] ? (/^(import|from|export|for|if|await|return|while)$/.test(m[3]) ? '#c586c0' : '#569cd6')
      : m[4] ? '#b5cea8' : m[5] ? '#dcdcaa' : m[6] ? '#4ec9b0' : '#d4d4d4';
    put(m[0], col); last = m.index + m[0].length;
  }
  if (last < line.length) put(line.slice(last), '#9cdcfe');
}
function renderBg() {
  bgCanvas.width = Math.ceil(W * DPR); bgCanvas.height = Math.ceil(H * DPR);
  const g = bgCanvas.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.fillStyle = '#1e1e1e'; g.fillRect(0, 0, W, H);
  const fs = W < 520 ? 11 : 13, lh = Math.round(fs * 1.6), gutter = W < 520 ? 34 : 54;
  g.font = `${fs}px "JetBrains Mono", monospace`; g.textBaseline = 'middle';
  g.globalAlpha = 0.34;
  let n = 1;
  for (let y = TOP + lh * 0.8; y < H; y += lh, n++) {
    const line = CODE[(n - 1) % CODE.length];
    g.fillStyle = '#6e7681'; g.textAlign = 'right'; g.fillText(String(n), gutter - 12, y); g.textAlign = 'left';
    const indent = line.match(/^ */)[0].length;
    for (let i = 2; i <= indent; i += 2) { g.fillStyle = '#404040'; g.fillRect(gutter + g.measureText(' '.repeat(i - 2)).width, y - lh / 2, 1, lh); }
    highlight(g, line, gutter, y);
  }
  g.globalAlpha = 1;
  if (W >= 760) {
    const mx = W - 70; g.fillStyle = 'rgba(255,255,255,.02)'; g.fillRect(mx, TOP, 60, H);
    g.globalAlpha = 0.28;
    for (let i = 0, y = TOP + 4; y < H; i++, y += 3) {
      const line = CODE[i % CODE.length]; const ind = line.match(/^ */)[0].length;
      g.fillStyle = pick(['#569cd6', '#9cdcfe', '#ce9178', '#dcdcaa', '#6a9955']);
      if (line.trim()) g.fillRect(mx + 4 + ind * 1.5, y, Math.min(50, line.trim().length * 1.2), 2);
    }
    g.globalAlpha = 1;
  }
  const vg = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.25, W / 2, H * 0.55, Math.max(W, H) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
}
