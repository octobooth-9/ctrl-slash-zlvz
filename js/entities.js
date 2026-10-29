'use strict';
/* entities.js — buddies, bombs, loose hats, sliced halves */

const ents = [];    // live sliceables: buddy | bomb | hat
const halves = [];

function pickHat(forceTier) {
  const eq = save.equipped;
  let pool = HATS;
  if (forceTier !== undefined) pool = HATS.filter((h) => h.tier === forceTier);
  let tot = 0;
  const w = pool.map((h) => { const x = TIERS[h.tier].w / HATS.filter((o) => o.tier === h.tier).length * (h.id === eq ? 3 : 1); tot += x; return x; });
  let r = Math.random() * tot;
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i].id; }
  return pool[0].id;
}

function makeBuddy(o = {}) {
  return Object.assign({
    type: 'buddy', x: 0, y: 0, vx: 0, vy: 0, rot: rand(-0.3, 0.3), vr: rand(-1.4, 1.4), scale: 1,
    hat: null, special: null, t: rand(0, 3000), scared: 0, c: mkCanvas(96, 96), frozen: 0, didFreeze: false, hits: 0, hitCd: 0,
    alive: true, entered: false, age: 0,
  }, o);
}
function makeBomb(o = {}) {
  return Object.assign({ type: 'bomb', x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: rand(-2.5, 2.5), scale: 1, t: 0, alive: true, entered: false, age: 0, fuseT: 0 }, o);
}
function makeLooseHat(id, x, y, vx, vy) {
  return { type: 'hat', id, x, y, vx, vy, rot: 0, vr: rand(-7, 7) || 4, scale: 1, alive: true, entered: true, age: 0, t: 0 };
}

// Launch from below the screen so the entity peaks at apexY and crosses to targetX.
function launch(e, x0, targetX, apexFrac, gmul = 1) {
  const g = G * gmul;
  const y0 = H + 0.5 * S * e.scale;
  const apexY = TOP + H * apexFrac;
  e.x = x0; e.y = y0;
  e.vy = -Math.sqrt(2 * g * (y0 - apexY));
  const ta = -e.vy / g;
  e.vx = (targetX - x0) / (ta * 2.1);
  e.g = g;
  ents.push(e);
  return e;
}

function animFor(b) {
  if (b.special === 'monolith') return 'dizzy';
  if (b.special === 'agent') return 'cool';
  if (b.special === 'breakpoint' || b.scared > 0) return 'worry';
  if (b.anim) return b.anim;
  return b.vy < 0 ? 'idle' : 'falling';
}

function radiusOf(e) {
  const touch = isCoarse ? 10 : 4;
  if (e.type === 'buddy') return (e.special === 'monolith' ? 44 : 34) * K * e.scale + touch;
  if (e.type === 'bomb') return 30 * K + touch * 0.5;
  return 26 * K + touch;
}

function updateEnts(dt) {
  for (const e of ents) {
    e.age += dt; e.t += dt * 1000;
    if (e.type === 'buddy') {
      if (e.scared > 0) e.scared -= dt;
      if (e.hitCd > 0) e.hitCd -= dt;
      if (e.special === 'monolith') {
        if (!e.didFreeze && e.vy >= 0) { e.didFreeze = true; e.frozen = 2.6; e.vy = 0; e.vx = 0; }
        if (e.frozen > 0) { e.frozen -= dt; e.rot = Math.sin(e.age * 30) * 0.03 * (e.hits + 1); if (e.frozen <= 0) monoTimeout(e); continue; }
      }
    }
    if (e.type === 'bomb') { e.fuseT += dt; if (e.fuseT > 0.06) { e.fuseT = 0; fuseSpark(e); } }
    e.vy += e.g * dt; e.x += e.vx * dt; e.y += e.vy * dt; e.rot += e.vr * dt;
    if (e.y < H) e.entered = true;
  }
}

function fuseSpark(e) {
  const a = e.rot - Math.PI / 2 + 0.5;
  const fx = e.x + Math.cos(a) * 16 * K * 1.2, fy = e.y + Math.sin(a) * 16 * K * 1.2;
  if (parts.length < PCAP * 0.8) emit({ k: 4, x: fx, y: fy, vx: rand(-1, 1) * S, vy: rand(-1.5, 0) * S, color: pick(['#ffd24a', '#ff8c3b', '#fff']), max: rand(0.12, 0.3), g: 0, drag: 2 });
}

function drawBuddy(b) {
  const anim = animFor(b); const A = ANIMS[anim];
  const f = frameOf(A, b.t);
  const tint = b.special === 'agent' ? ['#a970ff', 0.28] : b.special === 'monolith' ? (b.hits && b.hitCd > 0.03 ? ['#ffffff', 0.7] : ['#6b3f1f', 0.25]) : null;
  compose(b.c, anim, f, b.hat, tint);
  const k = K * b.scale;
  ctx.save();
  ctx.translate(b.x, b.y); ctx.rotate(b.rot);
  const glowTier = b.hat ? HAT[b.hat].tier : -1;
  if (b.special || glowTier >= 1) {
    ctx.shadowColor = b.special === 'breakpoint' ? '#e51400' : b.special === 'agent' ? '#a970ff' : b.special === 'monolith' ? '#ff8c3b' : TIERS[glowTier].color;
    ctx.shadowBlur = (b.special ? 22 : 8 + glowTier * 6) * (0.75 + 0.25 * Math.sin(b.age * 8));
  }
  ctx.drawImage(b.c, -48 * k, -A.cy * k, A.fw * k, A.fh * k);
  ctx.shadowBlur = 0;
  if (b.special === 'breakpoint') {
    const r = 7 * k; ctx.fillStyle = '#e51400'; ctx.beginPath(); ctx.arc(-30 * k, -22 * k, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(-33 * k, -26 * k, 2 * k, 2 * k);
  } else if (b.special === 'agent') {
    ctx.fillStyle = '#e8d5ff'; ctx.font = `700 ${Math.round(16 * k)}px "JetBrains Mono"`; ctx.textAlign = 'center';
    ctx.fillText('✦', 30 * k * Math.cos(b.age * 5), -30 * k + 6 * k * Math.sin(b.age * 5));
  }
  ctx.restore();
  if (b.special === 'monolith' && b.frozen > 0) {
    ctx.fillStyle = '#ffd24a'; ctx.font = `700 ${Math.round(14 * K)}px Silkscreen`; ctx.textAlign = 'center';
    ctx.fillText(b.hits ? `${b.hits} HITS` : 'LEGACY CODE', b.x, b.y - 70 * k);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(b.x - 40 * k, b.y + 52 * k, 80 * k, 4 * K);
    ctx.fillStyle = '#ff8c3b'; ctx.fillRect(b.x - 40 * k, b.y + 52 * k, 80 * k * (b.frozen / 2.6), 4 * K);
  }
}

function drawBomb(e) {
  const k = K * 2.6; const pulse = 0.5 + 0.5 * Math.sin(e.age * 14);
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.rot);
  ctx.shadowColor = '#ff2020'; ctx.shadowBlur = 10 + pulse * 18;
  ctx.drawImage(bombSprite(), -16 * k, -18 * k, 32 * k, 32 * k);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.25 * pulse; ctx.fillStyle = '#ff3030'; ctx.beginPath(); ctx.arc(0, 0, 13 * k, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(9.5 * K)}px "JetBrains Mono"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('rm -rf', 0, 3 * k);
  ctx.restore();
}

function drawLooseHat(h) {
  const k = K; const tier = HAT[h.id].tier;
  ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.rot);
  ctx.shadowColor = TIERS[tier].color; ctx.shadowBlur = 10 + tier * 5;
  ctx.drawImage(hatSprite(h.id), -48 * k, -40 * k, 96 * k, 56 * k);
  ctx.restore();
  if (h.age < 0.9) {
    ctx.globalAlpha = 1 - h.age / 0.9; ctx.fillStyle = TIERS[tier].color; ctx.font = `700 ${Math.round(10 * K)}px Silkscreen`; ctx.textAlign = 'center';
    ctx.fillText('SNIPE IT', h.x, h.y - 34 * K); ctx.globalAlpha = 1;
  }
}

function drawEnts() {
  for (const e of ents) {
    if (e.type === 'buddy') drawBuddy(e);
    else if (e.type === 'bomb') drawBomb(e);
    else drawLooseHat(e);
  }
}

// ---------- Sliced halves: frame snapshot, clipped to a half-plane, with a goo-coloured cut face
function spawnHalves(b, sliceA, power = 1) {
  const anim = animFor(b); const A = ANIMS[anim];
  const snap = compose(mkCanvas(A.fw, A.fh), anim === 'idle' || anim === 'falling' ? 'worry' : anim, 0, null, b.special === 'agent' ? ['#a970ff', 0.28] : null);
  const la = sliceA - b.rot;
  const dx = Math.cos(la), dy = Math.sin(la), nx = -dy, ny = dx;
  const cx = 48, cy = A.cy;
  for (const side of [1, -1]) {
    const c = mkCanvas(A.fw, A.fh); const g = c.getContext('2d');
    g.drawImage(snap, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.beginPath();
    g.moveTo(cx - dx * 300, cy - dy * 300); g.lineTo(cx + dx * 300, cy + dy * 300);
    g.lineTo(cx + dx * 300 + nx * side * 300, cy + dy * 300 + ny * side * 300); g.lineTo(cx - dx * 300 + nx * side * 300, cy - dy * 300 + ny * side * 300);
    g.closePath(); g.fill();
    // cut face: a stripe of "internals" along the edge
    g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = ['#004e7c', '#ff4f81', '#5cc4ff'][i]; g.lineWidth = [7, 3.5, 1.5][i];
      g.beginPath(); g.moveTo(cx - dx * 300 + nx * side * i * 1.2, cy - dy * 300 + ny * side * i * 1.2); g.lineTo(cx + dx * 300 + nx * side * i * 1.2, cy + dy * 300 + ny * side * i * 1.2); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    const wnx = -Math.sin(sliceA) * side, wny = Math.cos(sliceA) * side;
    const sp = S * rand(0.7, 1.2) * power;
    halves.push({ c, x: b.x, y: b.y, vx: b.vx * 0.5 + wnx * sp + Math.cos(sliceA) * S * 0.4, vy: Math.min(b.vy * 0.3, 0) + wny * sp - S * 0.6,
      rot: b.rot, vr: side * rand(3, 7), k: K * b.scale, cy: A.cy, fw: A.fw, fh: A.fh, life: 2.2, drip: 0, g: G });
  }
}
function updateHalves(dt) {
  for (let i = halves.length - 1; i >= 0; i--) {
    const h = halves[i];
    h.life -= dt; h.vy += h.g * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt;
    h.drip -= dt;
    if (h.drip <= 0 && parts.length < PCAP * 0.7) {
      h.drip = rand(0.03, 0.08);
      emit({ k: 0, x: h.x + rand(-6, 6) * h.k, y: h.y + rand(-6, 6) * h.k, vx: rand(-0.2, 0.2) * S, vy: 0, size: pick([2, 3, 3]) * K, color: pick(['#004e7c', '#0077b8', '#ff4f81', '#5cc4ff']), max: 0.8 });
    }
    if (h.life <= 0 || h.y > H + S * 2) halves.splice(i, 1);
  }
}
function drawHalves() {
  for (const h of halves) {
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.rot);
    ctx.globalAlpha = Math.min(1, h.life * 2);
    ctx.drawImage(h.c, -48 * h.k, -h.cy * h.k, h.fw * h.k, h.fh * h.k);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
