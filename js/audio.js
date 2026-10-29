'use strict';
/* audio.js — tiny synthesized chiptune SFX (no audio files) */

const Sfx = {
  ctx: null, master: null, noise: null, muted: save.muted, lastSwoosh: 0,
  unlock() {
    // iOS: without this, Web Audio is silenced by the ring/silent switch (Safari with navigator.audioSession)
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      this.kick();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.kick();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate; const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  },
  // Older iOS only unlocks after a sound starts inside the gesture, so play one silent sample.
  kick() {
    if (this.kicked && this.ctx.state === 'running') return;
    try {
      const s = this.ctx.createBufferSource(); s.buffer = this.ctx.createBuffer(1, 1, 22050);
      s.connect(this.ctx.destination); s.start(0); this.kicked = true;
    } catch { /* ignore */ }
  },
  setMuted(m) { this.muted = m; save.muted = m; persist(); if (this.master) this.master.gain.value = m ? 0 : 0.6; },
  ok() { return this.ctx && !this.muted && this.ctx.state === 'running'; },
  tone(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  hiss(dur, vol, type, f0, f1, q = 1, delay = 0) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = rand(0.8, 1.2);
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, rand(0, 0.5)); s.stop(t + dur + 0.02);
  },
  swoosh(speed) {
    const now = performance.now(); if (now - this.lastSwoosh < 170) return; this.lastSwoosh = now;
    const v = clamp(speed / 4, 0.05, 0.22);
    this.hiss(0.16, v, 'bandpass', rand(500, 800), rand(2600, 4200), 1.4);
  },
  slice(pitch = 1) {
    this.hiss(0.08, 0.32, 'highpass', 2500, 7000, 0.7);
    this.tone('sine', 280 * pitch, 60, 0.16, 0.5);
    this.tone('square', rand(520, 700) * pitch, 180, 0.06, 0.06);
    this.hiss(0.22, 0.2, 'lowpass', 1400, 200, 1, 0.02); // squelch
  },
  pop() { this.tone('triangle', rand(800, 1000), 1700, 0.07, 0.12); },
  crit() { this.tone('square', 1568, 3136, 0.12, 0.1); this.tone('square', 2093, 4186, 0.12, 0.07, 0.06); },
  combo(n) {
    const notes = [523, 659, 784, 1047, 1319, 1568, 2093, 2637];
    for (let i = 0; i < Math.min(n + 1, notes.length); i++) this.tone('square', notes[i], notes[i] * 1.01, 0.09, 0.09, i * 0.045);
  },
  hat(tier) {
    const base = [988, 1175, 1319, 1568][tier];
    this.tone('square', base, base, 0.07, 0.1); this.tone('square', base * 1.335, base * 1.335, 0.14, 0.1, 0.07);
    if (tier >= 2) this.tone('triangle', base * 2, base * 2.02, 0.25, 0.08, 0.14);
    if (tier >= 3) { this.hiss(0.5, 0.08, 'highpass', 6000, 9000, 1, 0.1); this.tone('square', base * 1.5, base * 1.5, 0.3, 0.07, 0.22); }
  },
  fanfare() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone('square', f, f, 0.12, 0.09, i * 0.08));
    this.hiss(0.8, 0.06, 'highpass', 5000, 9000, 1, 0.1);
  },
  strike() { this.tone('sawtooth', 160, 60, 0.4, 0.22); this.tone('square', 82, 70, 0.35, 0.12, 0.05); },
  boom(big = true) {
    this.hiss(big ? 1.4 : 0.6, big ? 1 : 0.6, 'lowpass', 3000, 60, 0.8);
    this.tone('sine', 140, 26, big ? 1.1 : 0.5, big ? 0.9 : 0.6);
    this.tone('sawtooth', 90, 30, 0.6, 0.2, 0.02);
  },
  fuse() { this.hiss(0.05, 0.03, 'highpass', 5000, 8000, 1); },
  breakpoint() { this.tone('sawtooth', 700, 70, 0.9, 0.14); this.tone('sine', 350, 40, 1.0, 0.25); },
  resume() { this.tone('sawtooth', 70, 700, 0.35, 0.1); },
  agent() { this.tone('square', 220, 1760, 0.5, 0.08); [880, 1109, 1319, 1760].forEach((f, i) => this.tone('triangle', f, f, 0.1, 0.1, 0.25 + i * 0.06)); },
  thunk(i) { this.tone('square', 110 + i * 22, 55, 0.09, 0.22); this.hiss(0.06, 0.2, 'bandpass', 900, 400, 2); },
  tick() { this.tone('square', 1320, 1320, 0.03, 0.05); },
  click() { this.tone('square', 660, 660, 0.03, 0.05); },
};

// Browsers only allow audio to start from "activation" events. A touch pointerdown doesn't count
// (touchend/pointerup/click do), and iOS can leave the context 'interrupted' after backgrounding,
// so retry on every gesture until it's running.
for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(ev, () => { if (!Sfx.ctx || Sfx.ctx.state !== 'running') Sfx.unlock(); }, { capture: true, passive: true });
}
