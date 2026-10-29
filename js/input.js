'use strict';
/* input.js — pointer blades, hit testing, swipe combo groups, menu rings */

const pointers = new Map();     // id -> { pts, lx, ly, lt, sx, sy, st, grp }
const deadTrails = [];          // trails fading after pointerup
const TRAIL_MS = 110;
const MIN_SPEED = 0.25;         // px/ms

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
function newGroup() { return { n: 0, hats: [], x: W / 2, y: H / 2, last: 0 }; }
function localPt(e) { const r = cvs.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

function onDown(e) {
  Sfx.unlock();
  if (state === 'paused') return;
  cvs.setPointerCapture?.(e.pointerId);
  const [x, y] = localPt(e); const t = performance.now();
  pointers.set(e.pointerId, { pts: [{ x, y, t }], lx: x, ly: y, lt: e.timeStamp || t, sx: x, sy: y, st: t, grp: newGroup(), dist: 0 });
}
function onMove(e) {
  const p = pointers.get(e.pointerId); if (!p) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (evs.length ? evs : [e])) {
    const [x, y] = localPt(ev);
    const ts = ev.timeStamp || performance.now();
    const d = Math.hypot(x - p.lx, y - p.ly);
    const speed = d / Math.max(ts - p.lt, 4);
    p.dist += d;
    if (speed > MIN_SPEED && d > 2) { cutAlong(p, p.lx, p.ly, x, y); if (speed > 1.2) Sfx.swoosh(speed); }
    p.pts.push({ x, y, t: performance.now() }); p.lx = x; p.ly = y; p.lt = ts;
  }
}
function onUp(e) {
  const p = pointers.get(e.pointerId); if (!p) return;
  pointers.delete(e.pointerId);
  if (p.grp.n) finalizeGroup(p.grp);
  deadTrails.push(p);
  const [x, y] = localPt(e);
  if (p.dist < 12 && performance.now() - p.st < 350) tapAt(x, y);
}

function cutAlong(p, ax, ay, bx, by) {
  const a = Math.atan2(by - ay, bx - ax);
  if (state === 'menu') menuCut(ax, ay, bx, by, a);
  if (state === 'paused' || state === 'loading') return;
  for (const o of ents.slice()) {
    if (!o.entered || !ents.includes(o)) continue;
    if (segDist(o.x, o.y, ax, ay, bx, by) > radiusOf(o)) continue;
    if (o.type === 'buddy') { sliceBuddy(o, a, state === 'play' ? p.grp : null); p.grp.last = performance.now(); }
    else if (o.type === 'bomb') { if (state === 'play' || state === 'menu') hitBomb(o); }
    else if (o.type === 'hat') snipeHat(o, a);
  }
}

// finalize groups whose last slice was > 250ms ago
function tickGroups() {
  const now = performance.now();
  for (const p of pointers.values()) if (p.grp.n && now - p.grp.last > 250) { finalizeGroup(p.grp); p.grp = newGroup(); }
}

// ---------- Blade trails
function trailColor(i, n, blade, now) {
  if (blade.rainbow) return `hsl(${(now / 3 + i * 14) % 360} 100% 60%)`;
  if (blade.fire) return i / n > 0.6 ? '#ffd166' : i / n > 0.3 ? '#ff8c3b' : '#ff3b1f';
  return blade.glow;
}
function drawTrail(p, now, fade = 1) {
  const pts = p.pts.filter((q) => now - q.t < TRAIL_MS);
  p.pts = pts;
  if (pts.length < 2) return;
  const blade = BLADES[save.equipped || 'none'] || BLADES.none;
  const n = pts.length; const wMax = clamp(S * 0.1, 7, 14);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'lighter';
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < n; i++) {
      const k = i / n; const age = 1 - (now - pts[i].t) / TRAIL_MS;
      ctx.globalAlpha = fade * age * (pass ? 1 : 0.55);
      ctx.strokeStyle = pass ? blade.core : trailColor(i, n, blade, now);
      ctx.lineWidth = (pass ? 0.35 : 1) * wMax * k * age + (pass ? 0.5 : 1.5);
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function drawTrails() {
  const now = performance.now();
  for (const p of pointers.values()) drawTrail(p, now);
  for (let i = deadTrails.length - 1; i >= 0; i--) { drawTrail(deadTrails[i], now); if (deadTrails[i].pts.length < 2) deadTrails.splice(i, 1); }
}

// ---------- Menu rings (slice the buddy inside to choose)
const menuRings = [
  { id: 'classic', label: 'CLASSIC', sub: '3 strikes · bombs end it', hat: null, color: '#3794ff' },
  { id: 'arcade', label: 'ARCADE', sub: '60 seconds · pure greed', hat: 'propeller-hat', color: '#ffd24a' },
  { id: 'rack', label: 'HAT RACK', sub: 'equip · blades', hat: 'grand-top-hat-monocle', color: '#c586c0' },
];
for (const r of menuRings) Object.assign(r, { x: 0, y: 0, c: mkCanvas(96, 96), t: rand(0, 2000), cut: 0, pop: 0 });
let menuAmbient = 1.2, menuBusy = false;

function layoutRings() {
  const portrait = H > W * 1.1;
  const R = 0.78 * S;
  const pos = portrait ? [[0.5, 0.52], [0.27, 0.76], [0.73, 0.76]] : [[0.5, 0.62], [0.24, 0.62], [0.76, 0.62]];
  menuRings.forEach((r, i) => { r.x = W * pos[i][0]; r.y = H * pos[i][1]; r.R = R; });
  if (portrait && W < 360) { menuRings[1].x = W * 0.25; menuRings[2].x = W * 0.75; }
}
function enterMenu() {
  state = 'menu'; menuBusy = false; run = null; targetScale = 1;
  for (const r of menuRings) { r.cut = 0; r.pop = 0.001; r.hat = r.id === 'classic' ? save.equipped : r.hat; }
  UI.showMenu();
}
function chooseRing(r, a) {
  if (menuBusy || r.cut) return;
  menuBusy = true; r.cut = 1;
  const fake = { x: r.x, y: r.y, vx: 0, vy: -S, rot: 0, scale: 1, special: null, hat: null, t: 0, scared: 0 };
  spawnHalves(fake, a); gore(r.x, r.y, a, 1.1); decal(r.x, r.y, a); slashFx(r.x, r.y, a, 1.4); shock(r.x, r.y, r.color, 2.4);
  Sfx.slice(); vibrate(15);
  after(0.45, () => {
    if (r.id === 'rack') { UI.openRack(); menuBusy = false; r.cut = 0; r.pop = 0.001; return; }
    UI.hideMenu(); startRun(r.id);
  }, true);
}
function menuCut(ax, ay, bx, by, a) {
  for (const r of menuRings) if (segDist(r.x, r.y, ax, ay, bx, by) < r.R * 0.7) chooseRing(r, a);
}
function tapAt(x, y) {
  if (state !== 'menu') return;
  for (const r of menuRings) if (Math.hypot(x - r.x, y - r.y) < r.R) chooseRing(r, -0.5);
}
function updateMenu(dt) {
  for (const r of menuRings) { r.t += dt * 1000; if (r.pop > 0) r.pop = Math.min(1, r.pop + dt * 3); }
  menuAmbient -= dt;
  if (menuAmbient <= 0 && ents.length < 4) {
    menuAmbient = rand(1.2, 2.4);
    const x = rand(W * 0.1, W * 0.9);
    Math.random() < 0.12 ? spawnBomb(x, W - x, rand(0.2, 0.4)) : spawnBuddy(x, W - x + rand(-60, 60), rand(0.08, 0.3), { hat: Math.random() < 0.35 ? pickHat() : false });
  }
}
function drawMenu(now) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const r of menuRings) {
    const R = r.R;
    ctx.save(); ctx.translate(r.x, r.y);
    ctx.strokeStyle = r.color; ctx.globalAlpha = 0.9; ctx.lineWidth = 3;
    ctx.setLineDash([R * 0.34, R * 0.18]); ctx.lineDashOffset = -now / 30;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 0.14; ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    if (!r.cut) {
      const s = r.pop > 0 && r.pop < 1 ? 1 - Math.pow(1 - r.pop, 3) + Math.sin(r.pop * Math.PI) * 0.2 : 1;
      const k = K * 0.95 * s; const bob = Math.sin(now / 400 + r.x) * 4;
      compose(r.c, 'idle', frameOf(ANIMS.idle, r.t), r.hat, null);
      ctx.drawImage(r.c, -48 * k, -64 * k + bob, 96 * k, 96 * k);
    }
    ctx.font = `700 ${Math.round(clamp(S * 0.17, 13, 22))}px Silkscreen, monospace`;
    ctx.lineWidth = 4; ctx.strokeStyle = '#111'; ctx.strokeText(r.label, 0, R + 16);
    ctx.fillStyle = '#fff'; ctx.fillText(r.label, 0, R + 16);
    ctx.font = `${Math.round(clamp(S * 0.1, 10, 12))}px "JetBrains Mono", monospace`; ctx.fillStyle = '#8b949e';
    ctx.fillText(r.sub, 0, R + 16 + clamp(S * 0.17, 13, 22));
    ctx.restore();
  }
}

cvs.addEventListener('pointerdown', onDown);
cvs.addEventListener('pointermove', onMove);
cvs.addEventListener('pointerup', onUp);
cvs.addEventListener('pointercancel', onUp);
cvs.addEventListener('contextmenu', (e) => e.preventDefault());
