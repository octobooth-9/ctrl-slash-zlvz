'use strict';
/* ui.js — DOM HUD, toasts, hat rack, pause & terminal game-over */

const hatIco = (id, w = 28, cls = '') => `<span class="hat-ico ${cls}" style="--w:${w}px;background-image:url(assets/hats/${id}.png)"></span>`;
const el = (id) => document.getElementById(id);

const UI = {
  modeName: '',
  startRun(r) {
    el('hud').hidden = false; el('menu').hidden = true;
    el('timer').hidden = r.mode !== 'arcade'; el('strikes').hidden = r.mode === 'arcade';
    el('best').textContent = fmt(save.best[r.mode] || 0);
    this.score(0, true); this.strikes(0); this.timer(60); this.wardrobe([], null); this.mult(r);
    this.modeName = r.mode === 'arcade' ? 'ARCADE' : 'CLASSIC';
    this.setMode(null);
  },
  score(v, quiet) {
    const s = el('score'); s.textContent = fmt(v);
    if (!quiet) { s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); }
    if (run) el('sb-stats').textContent = `Ln ${run.stats.sliced}, Col ${run.stats.maxCombo}`;
  },
  strikes(n) {
    el('strikes').querySelectorAll('i').forEach((i, k) => { i.className = k < n ? 'fail' : 'ok'; });
    el('sb-problems').textContent = `⊗ ${n} ⚠ ${run ? run.stats.bombs : 0}`;
  },
  timer(sec) {
    const t = el('timer'); const s = Math.max(0, Math.ceil(sec));
    t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    t.classList.toggle('hot', sec <= 10);
  },
  wardrobe(list, newId) {
    el('w-count').textContent = list.length;
    const pips = el('w-pips');
    if (!pips.children.length) pips.innerHTML = HATS.map((_, i) => `<i class="${[3, 6, 10, 17].includes(i + 1) ? 'ms' : ''}"></i>`).join('');
    [...pips.children].forEach((p, i) => p.classList.toggle('on', i < list.length));
    const wh = el('w-hats');
    if (!newId) wh.innerHTML = '';
    else wh.insertAdjacentHTML('beforeend', hatIco(newId, 22, 'pop'));
  },
  mult(r) {
    const m = el('mult');
    if (!r || r.multT <= 0) { m.hidden = true; return; }
    m.hidden = false;
    m.querySelector('b').textContent = `×${r.mult}`; m.querySelector('span').textContent = r.multName;
    m.querySelector('i').style.setProperty('--p', `${(r.multT / r.multDur) * 100}%`);
  },
  setMode(m) {
    const sb = el('statusbar'); sb.classList.remove('debug', 'agent', 'danger');
    if (m) sb.classList.add(m);
    el('debugbar').hidden = m !== 'debug';
    el('sb-mode').textContent = m === 'debug' ? '⏸ Debugging buddy.slice.ts' : m === 'agent' ? '✦ Agent mode — autonomous' : m === 'danger' ? '⊗ FATAL' : this.modeName;
  },
  toast(html, cls = '') {
    const t = document.createElement('div'); t.className = `toast ${cls}`; t.innerHTML = html;
    const box = el('toasts'); box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2600);
  },
  showMenu() {
    el('hud').hidden = true; el('menu').hidden = false; el('over').hidden = true; el('pause').hidden = true;
    this.modeName = ''; this.setMode(null);
    el('m-best').textContent = fmt(Math.max(save.best.classic || 0, save.best.arcade || 0));
    el('m-hats').textContent = `${discoveredCount()}/17`;
    el('m-equip').innerHTML = save.equipped ? `${hatIco(save.equipped, 24)}<span>${HAT[save.equipped].name}</span>` : '';
    el('sb-problems').textContent = '⊗ 0 ⚠ 0'; el('sb-stats').textContent = 'Ln 1, Col 1';
  },
  hideMenu() { el('menu').hidden = true; },

  // ---------- Hat rack
  openRack() { this.renderRack(); el('rack').hidden = false; prevState = state; state = 'rack'; },
  closeRack() { el('rack').hidden = true; state = 'menu'; this.showMenu(); for (const r of menuRings) if (r.id === 'classic') r.hat = save.equipped; },
  renderRack() {
    el('rack-count').textContent = `${discoveredCount()}/17`;
    el('rack-grid').innerHTML = HATS.slice().sort((a, b) => a.tier - b.tier).map((h) => {
      const n = save.hats[h.id] || 0;
      return `<button class="hat-card ${n ? '' : 'locked'} ${save.equipped === h.id ? 'equipped' : ''}" data-id="${h.id}" ${n ? '' : 'disabled'}>
        ${n ? `<span class="hc-count">×${n}</span>` : ''}${hatIco(h.id, 64, n ? '' : 'locked')}
        <span class="hc-name">${n ? h.name : '???'}</span><span class="hc-tier tier-${h.tier}">${TIERS[h.tier].name}</span></button>`;
    }).join('');
    const eq = save.equipped;
    el('rack-equip').innerHTML = eq ? `Equipped <b>${HAT[eq].name}</b> · blade: ${BLADES[eq].label} · spawns 3× more often` : (discoveredCount() ? 'Tap a hat to equip it.' : 'Slice hatted buddies to discover hats.');
  },

  // ---------- Pause
  pause() {
    if (state !== 'play') return;
    prevState = state; state = 'paused'; el('pause').hidden = false; Sfx.breakpoint();
  },
  resume() { if (state !== 'paused') return; el('pause').hidden = true; state = prevState; Sfx.resume(); },

  // ---------- Game over terminal
  showOver(r, prevBest) {
    el('hud').hidden = true;
    const s = r.stats;
    const lines = {
      bomb: [['cmd', 'sudo rm -rf / --no-preserve-root'], ['dim', 'removing buddies… removing hats… removing will to live…'], ['err', 'fatal: you sliced the ONE thing labelled "rm -rf"'], ['com', '# it was in the README']],
      strikes: [['cmd', 'npm test'], ['err', `✗ 3 buddies escaped to production`], ['warn', `PagerDuty: ${randi(12, 99)} alerts · on-call is crying`], ['err', 'Build failed with exit code 1']],
      time: [['cmd', 'git push --force origin main'], ['ok', '✓ shipped in 60.00s'], ['dim', `${s.sliced} buddies refactored · ${s.hats} hats collected`], ['com', '# nobody reviewed this']],
    }[r.cause || 'time'].slice();
    if (r.newBest) lines.push(['ok', `★ new personal best (was ${fmt(prevBest)}) — tag a release`]);
    if (r.distinct.length === 17) lines.push(['warn', '👑 FULL WARDROBE. you absolute haberdasher.']);
    const log = el('over-log'); log.innerHTML = '';
    lines.forEach(([c, t], i) => setTimeout(() => { if (!el('over').hidden) log.insertAdjacentHTML('beforeend', `<div class="l-${c}"></div>`); typeLine(log.lastElementChild, t); }, 120 + i * 260));
    el('over-problems').textContent = r.cause === 'time' ? 0 : r.cause === 'bomb' ? 1 : 3;
    el('over-best').textContent = r.newBest ? '★ NEW BEST' : `BEST ${fmt(save.best[r.mode])}`;
    el('over-best').classList.toggle('new', !!r.newBest);
    const stat = (k, v) => `<div>${k}<b>${v}</b></div>`;
    el('over-stats').innerHTML = [stat('SLICED', s.sliced), stat('BEST COMBO', s.maxCombo), stat('HATS', s.hats), stat('WARDROBE', `${r.distinct.length}/17`),
      stat('SNIPES', s.snipes), stat('SETS · RUNWAYS', `${s.sets} · ${s.runways}`), s.legacy ? stat('LEGACY KILLS', s.legacy) : '', s.crits ? stat('STACK OVERFLOWS', s.crits) : ''].join('');
    el('over-hats').innerHTML = r.distinct.map((id) => hatIco(id, 36)).join('');
    el('over').hidden = false;
    // count-up
    const t0 = performance.now(), dur = Math.min(1400, 400 + r.score / 3);
    const tick = (now) => { const k = Math.min(1, (now - t0) / dur); el('over-score').textContent = fmt(r.score * (1 - Math.pow(1 - k, 3))); if (k < 1 && !el('over').hidden) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    overBuddy(r.newBest ? 'love' : 'speechless');
  },
  hideOver() { el('over').hidden = true; },
};

function typeLine(node, text) {
  if (!node) return; let i = 0;
  const step = () => { node.textContent = text.slice(0, i += 2); if (i < text.length) setTimeout(step, 12); };
  step();
}
function overBuddy(anim) {
  const c = el('over-buddy'); const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const tmp = mkCanvas(96, 96); const t0 = performance.now();
  const loop = (now) => {
    if (el('over').hidden) return;
    compose(tmp, anim, frameOf(ANIMS[anim], now - t0), save.equipped, null);
    g.clearRect(0, 0, 96, 96); g.drawImage(tmp, 0, 0);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ---------- DOM wiring
el('btn-pause').addEventListener('click', () => UI.pause());
el('btn-resume').addEventListener('click', () => UI.resume());
el('btn-quit').addEventListener('click', () => { el('pause').hidden = true; state = 'play'; run.cause = run.mode === 'arcade' ? 'time' : 'strikes'; gameOver(); });
el('btn-retry').addEventListener('click', () => { Sfx.unlock(); UI.hideOver(); startRun(run ? run.mode : 'classic'); });
el('btn-menu').addEventListener('click', () => { UI.hideOver(); enterMenu(); });
el('rack-close').addEventListener('click', () => UI.closeRack());
el('rack').addEventListener('click', (e) => { if (e.target.id === 'rack') UI.closeRack(); });
el('rack-grid').addEventListener('click', (e) => {
  const b = e.target.closest('.hat-card'); if (!b || b.disabled) return;
  const id = b.dataset.id; save.equipped = save.equipped === id ? null : id; persist();
  Sfx.hat(HAT[id].tier); UI.renderRack();
});
function syncMute() { el('btn-mute').textContent = Sfx.muted ? '♪ off' : '♪ on'; }
el('btn-mute').addEventListener('click', () => { Sfx.unlock(); Sfx.setMuted(!Sfx.muted); syncMute(); });
syncMute();
