'use strict';
/* main.js — sizing, main loop, render order, keyboard, boot */

const topProbe = document.createElement('div');
topProbe.style.cssText = 'position:absolute;left:0;width:1px;height:1px;pointer-events:none;top:calc(env(safe-area-inset-top,0px) + var(--tab-h,0px))';
el('app').appendChild(topProbe);

function resize() {
  const app = el('app');
  W = app.clientWidth; H = app.clientHeight;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  cvs.width = Math.round(W * DPR); cvs.height = Math.round(H * DPR);
  K = Math.max(0.75, Math.round(clamp(Math.min(W, H) * 0.24, 78, 150) / 96 * 4) / 4);
  S = 96 * K; G = 1.5 * H;
  TOP = topProbe.offsetTop;
  ctx.imageSmoothingEnabled = false;
  renderBg(); layoutRings();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let rdt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'loading') return;
  const paused = state === 'paused';
  if (paused) rdt = 0;
  timeScale = lerp(timeScale, targetScale, 1 - Math.exp(-8 * rdt));
  let dt = rdt * timeScale;
  if (hitstop > 0) { hitstop -= rdt; dt = 0; }
  if (!paused) {
    updateEnts(dt); updateHalves(dt); updateParts(dt); updateDecals(dt); updateOverlays(dt, rdt);
    if (state === 'menu' || state === 'rack') updateMenu(rdt);
    updateGame(dt, rdt); tickGroups();
  }
  render(now);
}

function render(now) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bgCanvas, 0, 0, W, H);
  FX.sx = FX.shake ? rand(-1, 1) * FX.shake * DPR : 0; FX.sy = FX.shake ? rand(-1, 1) * FX.shake * DPR : 0;
  resetTf();
  drawDecals();
  if (state === 'menu' || state === 'rack') drawMenu(now);
  drawHalves();
  drawEnts();
  drawParts();
  drawFlashes();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawTrails();
  for (const f of flyers) { const s = lerp(1.2, 0.35, f.t) * K; ctx.globalAlpha = 1 - f.t * 0.4; ctx.drawImage(hatSprite(f.id), f.x - 48 * s, f.y - 28 * s, 96 * s, 56 * s); }
  ctx.globalAlpha = 1;
  drawPopups(); drawBanners();
  // mode vignettes
  if (run && (state === 'play' || state === 'paused')) {
    const tint = run.slowT > 0 ? 'rgba(204,102,0,' : run.frenzyT > 0 ? 'rgba(137,87,229,' : run.mode === 'arcade' && run.left <= 10 ? 'rgba(229,20,0,' : null;
    if (tint) {
      const a = run.slowT > 0 ? 0.35 : run.frenzyT > 0 ? 0.3 : 0.18 + 0.12 * Math.sin(now / 120);
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, tint + '0)'); vg.addColorStop(1, tint + a + ')'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    if (run.slowT > 0) { // scanline-y "paused in debugger" frame
      ctx.strokeStyle = 'rgba(255,140,59,.6)'; ctx.lineWidth = 3; ctx.setLineDash([12, 8]); ctx.strokeRect(4, TOP + 4, W - 8, H - TOP - 30); ctx.setLineDash([]);
    }
  }
  if (FX.flash > 0) { ctx.globalAlpha = Math.min(1, FX.flash); ctx.fillStyle = FX.flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}

document.addEventListener('visibilitychange', () => { if (document.hidden) UI.pause(); });
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'm') { Sfx.unlock(); Sfx.setMuted(!Sfx.muted); syncMute(); return; }
  if (state === 'menu') {
    const r = { 1: menuRings[0], 2: menuRings[1], 3: menuRings[2] }[k];
    if (r) { Sfx.unlock(); chooseRing(r, -0.4); }
  } else if (state === 'rack') { if (k === 'escape') UI.closeRack(); }
  else if (state === 'play') { if (k === 'p' || k === 'escape') UI.pause(); }
  else if (state === 'paused') { if (k === 'p' || k === 'escape' || k === 'f5') { e.preventDefault(); UI.resume(); } }
  else if (state === 'over') {
    if (k === 'r') { UI.hideOver(); startRun(run.mode); }
    if (k === 'escape') { UI.hideOver(); enterMenu(); }
  }
});

(async function boot() {
  resize();
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch { /* fonts optional */ }
  await loadAssets();
  resize();
  enterMenu();
  el('loading').classList.add('done');
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
