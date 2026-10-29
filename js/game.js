'use strict';
/* game.js — run state, scoring, hat bonuses, specials, wave spawner */

let state = 'loading';          // loading | menu | play | dying | over | paused
let prevState = 'menu';
let timeScale = 1, targetScale = 1, hitstop = 0;
const timers = [];              // { t, fn, real }
const flyers = [];              // hats flying into the wardrobe HUD
let run = null;

const COMBO_NAMES = { 3: 'TRIPLE COMMIT', 4: 'QUAD-CORE', 5: 'FORCE PUSH', 6: 'rm -rf node_modules' };
const comboName = (n) => COMBO_NAMES[n] || 'SHIPPED TO PROD ON FRIDAY';
const MILESTONES = [
  { n: 3, name: 'HAT TRICK', pts: 150, mult: 2, dur: 8 },
  { n: 6, name: 'FASHIONISTA', pts: 400 },
  { n: 10, name: 'HABERDASHER', pts: 1000, mult: 3, dur: 8 },
  { n: 17, name: 'FULL WARDROBE', pts: 5000, mult: 3, dur: 12 },
];

function after(t, fn, real = false) { timers.push({ t, fn, real }); }

function newRun(mode) {
  return {
    mode, score: 0, strikes: 0, time: 0, left: 60, d: 0, waveT: 0.9, nextLife: 1000,
    hats: {}, distinct: [], mult: 1, multT: 0, multDur: 1, multName: '',
    slowT: 0, frenzyT: 0, frenzySpawn: 0, cause: null, lastTick: 10,
    stats: { sliced: 0, maxCombo: 0, hats: 0, snipes: 0, sets: 0, runways: 0, crits: 0, bombs: 0, missed: 0, legacy: 0 },
  };
}

function startRun(mode) {
  ents.length = 0; halves.length = 0; timers.length = 0; flyers.length = 0; banners.length = 0;
  run = newRun(mode);
  timeScale = targetScale = 1; hitstop = 0;
  state = 'play';
  UI.startRun(run);
  banner(mode === 'arcade' ? 'ARCADE' : 'CLASSIC', mode === 'arcade' ? '60s · bombs cost 50 · go' : "3 CI checks · don't touch rm -rf", '#fff', 1.4);
  Sfx.combo(2);
}

function addScore(p, x, y, color = '#fff', size = 1, label = '', quiet = false) {
  const v = Math.round(p * run.mult);
  run.score += v;
  if (!quiet) popup(x, y, `${label}+${v}`, color, size);
  UI.score(run.score);
  if (run.mode === 'classic' && run.strikes > 0 && run.score >= run.nextLife) {
    run.strikes--; run.nextLife += 1000; UI.strikes(run.strikes);
    UI.toast('✓ CI check fixed — flaky test retried', 'ok');
  }
  while (run.score >= run.nextLife) run.nextLife += 1000;
  return v;
}

function setMult(m, name, dur) {
  if (m < run.mult && run.multT > 0) return;
  run.mult = m; run.multT = run.multDur = dur; run.multName = name;
  UI.mult(run);
}

// ---------- Hats & wardrobe
function collectHat(id, x, y) {
  run.hats[id] = (run.hats[id] || 0) + 1; run.stats.hats++;
  const first = !save.hats[id];
  save.hats[id] = (save.hats[id] || 0) + 1;
  if (first) { UI.toast(`<span class="hat-ico" style="--w:28px;background-image:url(assets/hats/${id}.png)"></span><div><b>New hat discovered</b><br>${HAT[id].name} · ${TIERS[HAT[id].tier].name}</div>`, 'leg'); persist(); }
  if (!run.distinct.includes(id)) {
    run.distinct.push(id);
    UI.wardrobe(run.distinct, id);
    const m = MILESTONES.find((q) => q.n === run.distinct.length);
    if (m) after(0.25, () => milestone(m), true);
  }
}
function milestone(m) {
  if (!run || state !== 'play') return;
  const v = addScore(m.pts, 0, 0, '', 1, '', true);
  banner(m.name, `${m.n} different hats · +${fmt(v)}${m.mult ? ` · ×${m.mult} for ${m.dur}s` : ''}`, '#ffd24a', 1.8);
  Sfx.fanfare(); vibrate([20, 40, 20]);
  confetti(W / 2, H * 0.45, m.n === 17 ? 400 : 120, m.n === 17 ? 1.6 : 1.1);
  if (m.n === 17) for (let i = 0; i < 6; i++) after(i * 0.25, () => confetti(rand(0, W), TOP, 60, 0.6, 1.2, Math.PI / 2), true);
  if (m.mult) setMult(m.mult, m.name, m.dur);
}

function snipeHat(h, a) {
  const i = ents.indexOf(h); if (i < 0) return;
  ents.splice(i, 1);
  const t = HAT[h.id].tier;
  addScore(TIERS[t].pts * 2, h.x, h.y, TIERS[t].color, 1.2, 'SNIPE ');
  run && run.stats.snipes++;
  sparks(h.x, h.y, 26, TIERS[t].color, 3.5); slashFx(h.x, h.y, a, 1.2); shock(h.x, h.y, TIERS[t].color, 1.4);
  Sfx.hat(t); Sfx.slice(1.6); vibrate(15);
  flyers.push({ id: h.id, x: h.x, y: h.y, sx: h.x, sy: h.y, t: 0 });
}

// ---------- Slicing
function sliceBuddy(b, a, grp) {
  if (b.special === 'monolith') return monoHit(b, a);
  const i = ents.indexOf(b); if (i < 0) return;
  ents.splice(i, 1);
  spawnHalves(b, a);
  gore(b.x, b.y, a, b.special ? 1.6 : 1, b.special === 'agent' ? ['#a970ff', '#6f42c1', '#e8d5ff', '#23a8f2'] : BUDDY_PAL);
  decal(b.x, b.y, a, 1, b.special === 'agent' ? ['#a970ff', '#6f42c1'] : BUDDY_PAL);
  slashFx(b.x, b.y, a); hitstop = Math.max(hitstop, 0.035);
  Sfx.slice(rand(0.9, 1.15)); vibrate(10); shake(3);
  for (const o of ents) if (o.type === 'buddy' && Math.hypot(o.x - b.x, o.y - b.y) < S * 2.2) o.scared = 0.7;
  if (!run || state !== 'play') return;
  run.stats.sliced++;
  if (Math.random() < 0.05) { run.stats.crits++; addScore(60, b.x, b.y - 20, '#ff4f81', 1.3, 'STACK OVERFLOW '); Sfx.crit(); }
  else addScore(10, b.x, b.y, '#fff');
  if (b.hat) {
    const t = HAT[b.hat].tier;
    addScore(TIERS[t].pts, b.x, b.y - 36 * K, TIERS[t].color, 1.1 + t * 0.12);
    word(b.x, b.y - 60 * K, HAT[b.hat].name.toLowerCase(), TIERS[t].color);
    Sfx.hat(t); collectHat(b.hat, b.x, b.y);
    ents.push(makeLooseHat(b.hat, b.x, b.y - 30 * K, b.vx * 0.3 + rand(-0.6, 0.6) * S, -rand(2.4, 3.4) * S));
    ents[ents.length - 1].g = G * 0.8;
    if (t >= 2) { shock(b.x, b.y, TIERS[t].color, 2); confetti(b.x, b.y, 40, 1.2); }
  }
  if (grp) { grp.n++; if (b.hat) grp.hats.push(b.hat); grp.x = b.x; grp.y = b.y; }
  if (b.special === 'breakpoint') startBreakpoint(b);
  if (b.special === 'agent') startFrenzy(b);
}

function finalizeGroup(g) {
  if (!run || state !== 'play') return;
  const x = clamp(g.x, 80, W - 80), y = g.y;
  if (g.n >= 3) {
    run.stats.maxCombo = Math.max(run.stats.maxCombo, g.n);
    const v = addScore(g.n * g.n * 10, 0, 0, '', 1, '', true);
    banner(comboName(g.n), `${g.n}-buddy combo · +${fmt(v)}`, g.n >= 5 ? '#ff4f81' : '#4ec9b0');
    Sfx.combo(g.n); shake(4 + g.n);
  } else if (g.n > 0) run.stats.maxCombo = Math.max(run.stats.maxCombo, g.n);
  if (!g.hats.length) return;
  const counts = {}; g.hats.forEach((h) => (counts[h] = (counts[h] || 0) + 1));
  for (const [id, n] of Object.entries(counts)) {
    if (n < 2) continue;
    run.stats.sets++;
    const v = addScore(TIERS[HAT[id].tier].pts * n * n, 0, 0, '', 1, '', true);
    banner(`MATCHING SET ×${n}`, `${n} × ${HAT[id].name} · +${fmt(v)}`, '#ffd24a', 1.6);
    Sfx.fanfare(); confetti(x, y, 90, 1.2);
  }
  const distinct = Object.keys(counts).length;
  if (distinct >= 3) {
    run.stats.runways++;
    const v = addScore(50 * distinct * distinct, 0, 0, '', 1, '', true);
    banner('RUNWAY', `${distinct} different hats, one swipe · +${fmt(v)}`, '#c586c0', 1.6);
    Sfx.fanfare(); confetti(x, y, 90, 1.2);
  }
}

// ---------- Specials
function startBreakpoint(b) {
  run.slowT = 5; targetScale = 0.38;
  banner('BREAKPOINT HIT', 'time is paused-ish · slice everything', '#ff8c3b', 1.5);
  Sfx.breakpoint(); flash(0.35, '#ff8c3b'); UI.setMode('debug');
}
function startFrenzy(b) {
  run.frenzyT = 5; run.frenzySpawn = 0;
  banner('AGENT MODE', 'autonomous buddies incoming', '#c586c0', 1.5);
  Sfx.agent(); flash(0.3, '#a970ff'); UI.setMode('agent');
}
function monoHit(b, a) {
  if (b.hitCd > 0) return;
  b.hitCd = 0.07; b.hits++;
  b.vr = 0; b.rot = rand(-0.2, 0.2);
  sparks(b.x, b.y, 8, '#ffd24a', 2.4); gore(b.x, b.y, a, 0.25, ['#0077b8', '#23a8f2', '#ff8c3b']); slashFx(b.x, b.y, a, 1.2);
  Sfx.thunk(b.hits); shake(2); vibrate(6);
  if (run && state === 'play') addScore(8, b.x + rand(-40, 40), b.y - 50 * K, '#ffd24a', 0.9);
  if (b.hits >= 16) monoExplode(b, a);
}
function monoTimeout(b) { if (b.hits > 0) monoExplode(b, -0.6); }
function monoExplode(b, a) {
  const i = ents.indexOf(b); if (i < 0) return;
  ents.splice(i, 1);
  spawnHalves(b, a, 1.8); gore(b.x, b.y, a, 3, ['#23a8f2', '#0077b8', '#004e7c', '#ff8c3b', '#ffd24a']); decal(b.x, b.y, a, 1.8);
  shock(b.x, b.y, '#ffd24a', 3.5); flash(0.4, '#ffd24a'); shake(12); hitstop = 0.12; Sfx.boom(false); vibrate([30, 30, 60]);
  if (b.hat) { collectHat(b.hat, b.x, b.y); ents.push(Object.assign(makeLooseHat(b.hat, b.x, b.y - 40, rand(-1, 1) * S, -3 * S), { g: G * 0.8 })); }
  if (run && state === 'play') {
    run.stats.legacy++;
    const v = addScore(b.hits * 15, 0, 0, '', 1, '', true);
    banner('LEGACY REFACTORED', `${b.hits} hits · 0 tests · +${fmt(v)}`, '#ff8c3b', 1.6);
  }
}

// ---------- Bombs
function hitBomb(e) {
  const i = ents.indexOf(e); if (i < 0) return;
  ents.splice(i, 1);
  if (!run || state !== 'play') { Sfx.boom(false); sparks(e.x, e.y, 40, '#ff3030', 4); shock(e.x, e.y, '#ff3030', 3); flash(0.4, '#ff3030'); shake(10); return; }
  run.stats.bombs++;
  if (run.mode === 'arcade') {
    run.score = Math.max(0, run.score - 50); UI.score(run.score);
    popup(e.x, e.y, '-50', '#f14c4c', 1.6);
    banner('rm -rf', 'recovered from trash · -50', '#f14c4c', 1);
    Sfx.boom(false); flash(0.5, '#ff3030'); shake(10); sparks(e.x, e.y, 60, '#ff5050', 4); shock(e.x, e.y, '#ff3030', 3); vibrate(60);
    return;
  }
  state = 'dying'; run.cause = 'bomb';
  hitstop = 0.3; flash(1, '#ffffff'); shake(22); Sfx.boom(true); vibrate([80, 40, 160]); UI.setMode('danger');
  shock(e.x, e.y, '#ff3030', 6); sparks(e.x, e.y, 120, '#ff5050', 6);
  banner('rm -rf /', 'permission granted', '#f14c4c', 2);
  for (const o of ents.slice()) {
    if (o.type === 'buddy') { spawnHalves(o, Math.atan2(o.y - e.y, o.x - e.x) + Math.PI / 2, 2); gore(o.x, o.y, Math.atan2(o.y - e.y, o.x - e.x), 1.5); }
    else confetti(o.x, o.y, 30, 1);
  }
  ents.length = 0;
  after(1.6, () => gameOver('bomb'), true);
}

function strike(e) {
  run.strikes++; run.stats.missed++;
  UI.strikes(run.strikes);
  popup(e.x, H - S * 0.9, '✗ escaped to prod', '#f14c4c', 0.9);
  Sfx.strike(); flash(0.25, '#f14c4c'); shake(6); vibrate(40);
  if (run.strikes >= 3) { state = 'dying'; run.cause = 'strikes'; UI.setMode('danger'); banner('BUILD FAILED', '3 buddies escaped to production', '#f14c4c', 1.8); after(1.4, () => gameOver('strikes'), true); }
}

function gameOver(cause) {
  if (!run) return;
  run.cause = run.cause || cause;
  state = 'over'; targetScale = 1; UI.setMode(null);
  const best = save.best[run.mode] || 0;
  run.newBest = run.score > best;
  if (run.newBest) save.best[run.mode] = run.score;
  save.plays++; persist();
  UI.showOver(run, best);
}

// ---------- Spawner
function spawnBuddy(x0, tx, apex, o = {}) {
  const d = run ? run.d : 0.3;
  const b = makeBuddy(o);
  if (b.hat === undefined || b.hat === null) b.hat = Math.random() < 0.14 + 0.1 * d ? pickHat() : null;
  if (o.hat === false) b.hat = null;
  if (b.special === 'monolith') b.scale = 1.7;
  return launch(b, x0, tx, apex, 1 + 0.25 * d);
}
function spawnBomb(x0, tx, apex) { return launch(makeBomb(), x0, tx, apex, 1 + 0.25 * (run ? run.d : 0)); }
function slot(bombP) {
  const x0 = rand(W * 0.15, W * 0.85);
  const tx = clamp(x0 + rand(-W * 0.35, W * 0.35), W * 0.1, W * 0.9);
  const ap = rand(0.12, 0.42);
  if (Math.random() < bombP) spawnBomb(x0, tx, ap); else spawnBuddy(x0, tx, ap);
}

function spawnWave() {
  const d = run.d, t = run.time;
  const bombP = t < 10 ? 0 : lerp(0.08, 0.3, d);
  const hasSpecial = ents.some((e) => e.special) || run.slowT > 0 || run.frenzyT > 0;
  const opts = [['single', 3], ['spread', 3 + d * 3], ['stagger', 2 + d * 2], ['cluster', 1.5 + d * 2]];
  if (t > 18) opts.push(['hatParade', 0.7]);
  if (t > 28) opts.push(['runway', 0.6]);
  if (t > 40 && d > 0.2) opts.push(['royal', 0.25]);
  if (t > 12 && !hasSpecial) opts.push(['special', 0.9]);
  if (t > 25 && !hasSpecial) opts.push(['monolith', 0.35]);
  let tot = opts.reduce((a, o) => a + o[1], 0), r = Math.random() * tot, kind = 'single';
  for (const [k, w] of opts) { r -= w; if (r <= 0) { kind = k; break; } }

  const cx = rand(W * 0.25, W * 0.75);
  switch (kind) {
    case 'single': slot(bombP * 0.6); if (Math.random() < 0.4) slot(bombP); break;
    case 'spread': { const n = randi(2, 3 + Math.round(d * 3)); for (let i = 0; i < n; i++) slot(bombP); break; }
    case 'stagger': { const n = randi(3, 5 + Math.round(d * 2)); const l2r = Math.random() < 0.5;
      for (let i = 0; i < n; i++) after(i * lerp(0.28, 0.16, d), () => { if (state !== 'play') return; const x = lerp(W * 0.12, W * 0.88, l2r ? i / (n - 1) : 1 - i / (n - 1)); Math.random() < bombP * 0.8 ? spawnBomb(x, x + rand(-40, 40), rand(0.15, 0.35)) : spawnBuddy(x, x + rand(-60, 60), rand(0.15, 0.35)); });
      break; }
    case 'cluster': { const n = randi(3, 5); for (let i = 0; i < n; i++) spawnBuddy(cx + rand(-S * 0.5, S * 0.5), cx + rand(-S, S), rand(0.2, 0.3)); if (Math.random() < bombP * 2) spawnBomb(cx, cx + rand(-S, S), 0.25); break; }
    case 'hatParade': { const id = Math.random() < 0.5 && save.equipped ? save.equipped : pickHat(Math.random() < 0.7 ? 0 : 1); const n = randi(3, 4);
      for (let i = 0; i < n; i++) spawnBuddy(cx + (i - (n - 1) / 2) * S * 0.7, cx + (i - (n - 1) / 2) * S * 0.9, 0.24 + rand(-0.02, 0.02), { hat: id });
      popup(cx, H * 0.7, 'HAT PARADE', '#ffd24a', 1); break; }
    case 'runway': { const n = randi(3, 5); const ids = HATS.map((h) => h.id).sort(() => Math.random() - 0.5).slice(0, n); const tier = (id) => HAT[id].tier;
      ids.sort((a, b) => tier(a) - tier(b));
      for (let i = 0; i < n; i++) { const x = lerp(W * 0.18, W * 0.82, i / (n - 1)); spawnBuddy(x, x, 0.26, { hat: ids[i] }); }
      popup(W / 2, H * 0.7, 'RUNWAY WALK', '#c586c0', 1); break; }
    case 'royal': spawnBuddy(W / 2, W / 2, 0.2, { hat: 'crown' }); spawnBomb(W / 2 - S * 0.9, W / 2 - S * 1.2, 0.24); spawnBomb(W / 2 + S * 0.9, W / 2 + S * 1.2, 0.24); break;
    case 'special': spawnBuddy(cx, cx + rand(-W * 0.2, W * 0.2), rand(0.15, 0.3), { special: Math.random() < 0.5 ? 'breakpoint' : 'agent', hat: false }); slot(bombP); break;
    case 'monolith': spawnBuddy(W / 2, W / 2, 0.3, { special: 'monolith', vr: 0 }); banner('LEGACY MONOLITH', 'mash it before it ships', '#ff8c3b', 1.3); break;
  }
}

function frenzyTick(dt) {
  run.frenzySpawn -= dt;
  if (run.frenzySpawn > 0) return;
  run.frenzySpawn = 0.13;
  const left = Math.random() < 0.5;
  const b = makeBuddy({ frenzy: true });
  b.hat = Math.random() < 0.2 ? pickHat() : null;
  b.x = left ? -S * 0.5 : W + S * 0.5; b.y = rand(H * 0.55, H * 0.85);
  b.vx = (left ? 1 : -1) * rand(0.35, 0.6) * W; b.vy = -rand(0.5, 0.9) * H; b.g = G; b.entered = true;
  ents.push(b);
}

function updateGame(dt, rdt) {
  for (let i = timers.length - 1; i >= 0; i--) { const tm = timers[i]; tm.t -= tm.real ? rdt : dt; if (tm.t <= 0) { timers.splice(i, 1); tm.fn(); } }
  for (let i = flyers.length - 1; i >= 0; i--) { const f = flyers[i]; f.t += rdt * 1.6; const e = 1 - Math.pow(1 - Math.min(1, f.t), 3); f.x = lerp(f.sx, 34, e); f.y = lerp(f.sy, TOP + 110, e) - Math.sin(e * Math.PI) * 80; if (f.t >= 1) flyers.splice(i, 1); }

  // cull off-screen entities; in classic, a missed buddy is a failed CI check
  for (let i = ents.length - 1; i >= 0; i--) {
    const e = ents[i];
    const out = (e.y > H + S * e.scale && e.vy > 0) || (e.frenzy && (e.x < -S * 2 || e.x > W + S * 2));
    if (!out) continue;
    ents.splice(i, 1);
    if (state === 'play' && run.mode === 'classic' && e.type === 'buddy' && !e.special && !e.frenzy && run.frenzyT <= 0) strike(e);
  }
  if (state !== 'play') return;

  run.time += dt;
  run.d = run.mode === 'arcade' ? clamp(run.time / 60, 0, 0.9) : clamp(run.time / 160, 0, 1);
  if (run.mode === 'arcade') {
    run.left -= dt; UI.timer(run.left);
    if (run.left <= 10 && Math.ceil(run.left) < run.lastTick) { run.lastTick = Math.ceil(run.left); Sfx.tick(); if (run.lastTick === 10) banner('CRUNCH TIME', '10 seconds to ship', '#f14c4c', 1.2); }
    if (run.left <= 0) { run.left = 0; run.cause = 'time'; state = 'dying'; banner("TIME'S UP", 'shipping whatever this is', '#fff', 1.4); after(1.3, () => gameOver('time'), true); return; }
  }
  if (run.multT > 0) { run.multT -= rdt; if (run.multT <= 0) { run.mult = 1; run.multT = 0; } UI.mult(run); }
  if (run.slowT > 0) { run.slowT -= rdt; if (run.slowT <= 0) { targetScale = 1; Sfx.resume(); UI.setMode(run.frenzyT > 0 ? 'agent' : null); } }
  if (run.frenzyT > 0) { run.frenzyT -= rdt; frenzyTick(rdt); if (run.frenzyT <= 0) UI.setMode(run.slowT > 0 ? 'debug' : null); }

  run.waveT -= dt;
  const busy = ents.filter((e) => e.type !== 'hat').length;
  if (run.waveT <= 0 && run.frenzyT <= 0 && busy < 3 + run.d * 5) {
    spawnWave();
    run.waveT = lerp(1.7, 0.75, run.d) + rand(-0.15, 0.25);
  }
}
