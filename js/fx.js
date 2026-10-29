'use strict';
/* fx.js — particles (pixel gibs, syntax shrapnel, confetti), decals, popups, banners, screen shake */

const parts = [];
const decals = [];
const popups = [];
const banners = [];
const flashes = [];     // slash streaks
const rings = [];       // shockwaves
const FX = { shake: 0, flash: 0, flashColor: '#fff', sx: 0, sy: 0 };

// kinds: 0 px square, 1 glyph, 2 confetti, 3 word, 4 spark
function emit(p) {
  if (parts.length >= PCAP) parts.splice(0, parts.length - PCAP + 1);
  p.life = p.max = p.max || 1; p.rot = p.rot || 0; p.vr = p.vr || 0; p.g = p.g === undefined ? G * 0.9 : p.g; p.drag = p.drag || 0;
  parts.push(p);
}

function gore(x, y, a, power = 1, pal = BUDDY_PAL) {
  const n = Math.round(26 * power * Q);
  const ca = Math.cos(a), sa = Math.sin(a);
  for (let i = 0; i < n; i++) {
    const side = Math.random() < 0.5 ? 1 : -1;
    const ang = a + side * Math.PI / 2 + rand(-1.1, 1.1);
    const sp = rand(0.6, 3.4) * S * Math.pow(power, 0.3);
    emit({ k: 0, x: x + rand(-8, 8) * K, y: y + rand(-8, 8) * K, vx: Math.cos(ang) * sp + ca * S * rand(0, 1.6), vy: Math.sin(ang) * sp + sa * S * rand(0, 1.6) - S * 0.8,
      size: pick([2, 2, 3, 3, 4, 5]) * K, color: pick(pal), max: rand(0.6, 1.5), drag: 0.6 });
  }
  // the eyes. always the eyes.
  for (let i = 0; i < 2; i++) emit({ k: 0, x, y, vx: rand(-1.5, 1.5) * S, vy: -rand(1.5, 3) * S, size: 4 * K, color: '#191a1b', max: 1.6, vr: rand(-8, 8) });
  for (let i = 0; i < Math.round(n * 0.45); i++) {
    const ang = rand(0, TAU); const sp = rand(0.8, 3) * S;
    emit({ k: 1, x, y, vx: Math.cos(ang) * sp + ca * S, vy: Math.sin(ang) * sp - S, text: pick(GLYPHS), color: pick(SYNTAX), size: rand(0.8, 1.7), max: rand(0.7, 1.3), vr: rand(-9, 9), drag: 0.8 });
  }
  confetti(x, y, Math.round(n * 0.7), 1);
  if (Math.random() < 0.4) word(x, y - S * 0.3, pick(QUIPS));
}
function confetti(x, y, n, power = 1, spread = TAU, dir = -Math.PI / 2) {
  for (let i = 0; i < n; i++) {
    const ang = dir + rand(-spread / 2, spread / 2); const sp = rand(1, 4.2) * S * power;
    emit({ k: 2, x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: rand(4, 9) * K, h: rand(2, 4.5) * K, color: pick(CONFETTI), max: rand(1.2, 2.4), g: G * 0.35, drag: 2.2, ph: rand(0, TAU), vr: rand(-10, 10) });
  }
}
function word(x, y, text, color = '#d16969') {
  emit({ k: 3, x, y, vx: rand(-0.4, 0.4) * S, vy: -rand(0.8, 1.4) * S, text, color, max: 1.1, g: -S * 0.3, drag: 2.5, rot: rand(-0.25, 0.25) });
}
function sparks(x, y, n, color = '#ffd24a', speed = 3) {
  for (let i = 0; i < n; i++) { const a = rand(0, TAU), sp = rand(0.5, speed) * S; emit({ k: 4, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color, max: rand(0.25, 0.6), g: G * 0.3, drag: 3 }); }
}

function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0 || p.y > H + 80) { parts.splice(i, 1); continue; }
    const dr = Math.max(0, 1 - p.drag * dt);
    p.vx *= dr; p.vy = p.vy * dr + p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.k === 2) p.ph += dt * 9;
  }
}
function drawParts() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of parts) {
    const a = Math.min(1, (p.life / p.max) * 2.2);
    ctx.globalAlpha = a;
    if (p.k === 0) { ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    else if (p.k === 2) {
      ctx.setTransform(DPR, 0, 0, DPR, (p.x + Math.sin(p.ph) * 6 * K) * DPR + FX.sx, p.y * DPR + FX.sy);
      ctx.rotate(p.rot); ctx.fillStyle = p.color; const w = p.w * Math.abs(Math.cos(p.ph)) + K; ctx.fillRect(-w / 2, -p.h / 2, w, p.h);
      resetTf();
    } else if (p.k === 4) {
      ctx.strokeStyle = p.color; ctx.lineWidth = 2 * K; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
    }
  }
  ctx.font = `800 ${Math.round(15 * K)}px "JetBrains Mono", monospace`;
  for (const p of parts) {
    if (p.k !== 1) continue;
    ctx.globalAlpha = Math.min(1, (p.life / p.max) * 2.2);
    ctx.setTransform(DPR * p.size, 0, 0, DPR * p.size, p.x * DPR + FX.sx, p.y * DPR + FX.sy); ctx.rotate(p.rot);
    ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
  }
  resetTf();
  ctx.font = `800 ${Math.round(13 * K)}px "JetBrains Mono", monospace`;
  for (const p of parts) {
    if (p.k !== 3) continue;
    ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
    ctx.setTransform(DPR, 0, 0, DPR, p.x * DPR + FX.sx, p.y * DPR + FX.sy); ctx.rotate(p.rot);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
  }
  resetTf(); ctx.globalAlpha = 1;
}
function resetTf() { ctx.setTransform(DPR, 0, 0, DPR, FX.sx, FX.sy); }

// ---------- Decals: pixel splatter stains on the "editor", with the occasional epitaph comment
const decalPool = [];
function decal(x, y, a, scale = 1, pal = BUDDY_PAL) {
  const size = Math.round(64 * scale);
  const c = decalPool.pop() || mkCanvas(size, size);
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2, n = Math.round(46 * scale);
  for (let i = 0; i < n; i++) {
    const along = (Math.random() - 0.5) * size * 0.8 * Math.random();
    const across = (Math.random() - 0.5) * size * 0.35 * Math.random();
    const ang = a + Math.PI / 2;
    const px = cx + Math.cos(ang) * along + Math.cos(a) * across, py = cx + Math.sin(ang) * along + Math.sin(a) * across;
    const s = randi(1, 4 - Math.min(2, Math.abs(along) / 12 | 0));
    g.globalAlpha = rand(0.5, 0.95); g.fillStyle = pick(pal); g.fillRect(px | 0, py | 0, s, s);
  }
  for (let i = 0; i < 5; i++) {
    const dx = cx + rand(-size * 0.25, size * 0.25) | 0, dy = cx + rand(-4, 6) | 0, len = randi(4, size * 0.3);
    g.globalAlpha = 0.8; g.fillStyle = pal[2] || pal[0]; g.fillRect(dx, dy, 1, len); g.fillRect(dx, dy + len, 2, 2);
  }
  g.globalAlpha = 1;
  decals.push({ c, x, y, life: 7, max: 7, s: K * 1.6, txt: Math.random() < 0.3 ? pick(RIP) : null });
  if (decals.length > 16) decalPool.push(decals.shift().c);
}
function updateDecals(dt) {
  for (let i = decals.length - 1; i >= 0; i--) {
    const d = decals[i]; d.life -= dt; d.y += 5 * dt;
    if (d.life <= 0) { decalPool.push(d.c); decals.splice(i, 1); }
  }
}
function drawDecals() {
  ctx.font = `${Math.round(11 * K)}px "JetBrains Mono", monospace`; ctx.textAlign = 'center';
  for (const d of decals) {
    const a = Math.min(1, d.life / 2.5) * 0.6; ctx.globalAlpha = a;
    const w = d.c.width * d.s; ctx.drawImage(d.c, d.x - w / 2, d.y - w / 2, w, w);
    if (d.txt) { ctx.fillStyle = '#6a9955'; ctx.fillText(d.txt, d.x, d.y + w * 0.42); }
  }
  ctx.globalAlpha = 1;
}

// ---------- Popups (+score), banners (combo titles), slash streaks, rings
function popup(x, y, text, color = '#fff', size = 1) {
  popups.push({ x: clamp(x, 40, W - 40), y: clamp(y, TOP + 90, H - 60), text, color, size, t: 0, dur: 0.95 });
}
function banner(title, sub = '', color = '#fff', dur = 1.3) {
  banners.push({ title, sub, color, t: 0, dur });
  if (banners.length > 3) banners.shift();
}
function slashFx(x, y, a, len = 1.8) { flashes.push({ x, y, a, len: S * len, t: 0 }); }
function shock(x, y, color = '#fff', max = 2.2) { rings.push({ x, y, color, t: 0, max: S * max }); }
function shake(v) { if (!reduceMotion) FX.shake = Math.max(FX.shake, v); }
function flash(v, color = '#fff') { FX.flash = Math.max(FX.flash, reduceMotion ? v * 0.3 : v); FX.flashColor = color; }

function updateOverlays(dt, rdt) {
  for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.t += rdt; p.y -= 30 * rdt; if (p.t > p.dur) popups.splice(i, 1); }
  for (let i = banners.length - 1; i >= 0; i--) { const b = banners[i]; b.t += rdt; if (b.t > b.dur) banners.splice(i, 1); }
  for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].t += rdt; if (flashes[i].t > 0.16) flashes.splice(i, 1); }
  for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += rdt; if (rings[i].t > 0.45) rings.splice(i, 1); }
  FX.shake *= Math.exp(-9 * rdt); if (FX.shake < 0.01) FX.shake = 0;
  FX.flash *= Math.exp(-6 * rdt); if (FX.flash < 0.01) FX.flash = 0;
}

function drawFlashes() {
  ctx.globalCompositeOperation = 'lighter';
  for (const f of flashes) {
    const k = 1 - f.t / 0.16; const ca = Math.cos(f.a), sa = Math.sin(f.a);
    ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = 5 * K * k + 1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(f.x - ca * f.len, f.y - sa * f.len); ctx.lineTo(f.x + ca * f.len, f.y + sa * f.len); ctx.stroke();
  }
  for (const r of rings) {
    const k = r.t / 0.45; ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 6 * K * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.max * (0.2 + k * 0.8), 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

function drawPopups() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of popups) {
    const k = p.t / p.dur; const s = p.t < 0.1 ? lerp(1.8, 1, p.t / 0.1) : 1;
    ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    const fs = Math.round(18 * K * p.size * s);
    ctx.font = `700 ${fs}px Silkscreen, monospace`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function drawBanners() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const baseY = H * 0.36;
  banners.forEach((b, i) => {
    const y = baseY + (i - (banners.length - 1) / 2) * S * 0.95;
    const inT = clamp(b.t / 0.14, 0, 1); const s = lerp(2.4, 1, 1 - Math.pow(1 - inT, 3));
    const out = clamp((b.dur - b.t) / 0.3, 0, 1);
    ctx.globalAlpha = out * inT;
    let fs = clamp(S * 0.46, 22, 72);
    ctx.font = `700 ${fs}px Silkscreen, monospace`;
    const tw = ctx.measureText(b.title).width; if (tw > W * 0.9) fs *= (W * 0.9) / tw;
    fs = Math.round(fs * s);
    ctx.font = `700 ${fs}px Silkscreen, monospace`;
    const jx = b.t < 0.3 ? rand(-3, 3) : 0;
    ctx.fillStyle = 'rgba(241,76,76,.6)'; ctx.fillText(b.title, W / 2 - 3 + jx, y);
    ctx.fillStyle = 'rgba(78,201,176,.6)'; ctx.fillText(b.title, W / 2 + 3 + jx, y);
    ctx.lineWidth = 6; ctx.strokeStyle = '#0b0b0d'; ctx.strokeText(b.title, W / 2, y);
    ctx.fillStyle = b.color; ctx.fillText(b.title, W / 2, y);
    if (b.sub) {
      ctx.font = `700 ${Math.round(clamp(S * 0.14, 11, 16))}px "JetBrains Mono", monospace`;
      ctx.lineWidth = 4; ctx.strokeText(b.sub, W / 2, y + fs * 0.62); ctx.fillStyle = '#d4d4d4'; ctx.fillText(b.sub, W / 2, y + fs * 0.62);
    }
  });
  ctx.globalAlpha = 1;
}
