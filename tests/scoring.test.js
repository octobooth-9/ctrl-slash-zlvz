'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

function game() {
  const context = vm.createContext();
  vm.runInContext(`
    const W = 800, H = 600, S = 96, K = 1, G = 900, TOP = 0, TAU = Math.PI * 2;
    const isCoarse = false, BUDDY_PAL = [], ANIMS = {};
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const rand = (a, b) => (a + b) / 2;
    const fmt = String, mkCanvas = () => ({});
    const TIERS = [{ pts: 25, color: '#fff' }];
    const HATS = [{ id: 'cap', name: 'Cap', tier: 0 }];
    const HAT = { cap: HATS[0] };
    const save = { hats: { cap: 1 }, best: {}, plays: 0 };
    const messages = [], titles = [];
    const popup = (...args) => messages.push(args);
    const banner = (...args) => titles.push(args);
    const noop = () => {};
    const UI = new Proxy({}, { get: () => noop });
    const Sfx = new Proxy({}, { get: () => noop });
    const gore = noop, decal = noop, slashFx = noop, vibrate = noop,
      shake = noop, sparks = noop, shock = noop, flash = noop, word = noop, confetti = noop, persist = noop;
    const cvs = { addEventListener: noop };
    let now = 0;
    const performance = { now: () => now };
    Math.random = () => 0.5;
  `, context);
  for (const file of ['entities', 'game', 'input']) {
    vm.runInContext(readFileSync(join(__dirname, '..', 'js', `${file}.js`), 'utf8'), context, { filename: `${file}.js` });
  }
  vm.runInContext(`
    spawnHalves = noop;
    state = 'play'; run = newRun('arcade');
    function buddy(options = {}) {
      const b = makeBuddy({ x: 200, y: 300, vy: 200, entered: true, ...options });
      ents.push(b);
      return b;
    }
  `, context);
  return (code) => vm.runInContext(code, context);
}

test('ordinary slices and random critical scores stay unchanged without skill bonuses', () => {
  const run = game();
  assert.equal(run('sliceBuddy(buddy(), 0); run.score'), 10);
  assert.equal(run('Math.random = () => 0; sliceBuddy(buddy(), 0); run.score'), 70);
  assert.equal(run('run.stats.crits'), 1);
});

test('center cuts use the actual segment, not its infinite line, and only pay once', () => {
  const run = game();
  assert.equal(run(`
    const b = buddy();
    const p = { grp: newGroup() };
    cutAlong(p, 150, 300, 250, 300);
    cutAlong(p, 150, 300, 250, 300);
    run.score
  `), 25);
  assert.equal(run('run.stats.centers'), 1);
  assert.equal(run('p.grp.n'), 1);
  assert.equal(run('messages.at(-1)[2]'), 'CENTER +15');
  assert.equal(run(`
    buddy();
    cutAlong(p, 150, 300, 180, 300);
    run.score
  `), 35);
  assert.equal(run('run.stats.centers'), 1);
});

test('center scoring includes its exact boundary and scales with buddy size', () => {
  const run = game();
  assert.equal(run('sliceBuddy(buddy(), 0, null, 10); run.score'), 25);
  assert.equal(run('sliceBuddy(buddy(), 0, null, 10.01); run.score'), 35);
  assert.equal(run('sliceBuddy(buddy({ scale: 2 }), 0, null, 20); run.score'), 60);
});

test('apex scoring includes both rising and falling velocity boundaries', () => {
  const run = game();
  for (const vy of ['-S * 0.6', '0', 'S * 0.6']) {
    assert.equal(run(`var before = run.score; sliceBuddy(buddy({ vy: ${vy} }), 0); run.score - before`), 30);
  }
  assert.equal(run('sliceBuddy(buddy({ vy: 57.61 }), 0); run.stats.apexes'), 3);
  assert.equal(run('sliceBuddy(buddy({ vy: -57.61 }), 0); run.stats.apexes'), 3);
});

test('rescue requires a descending regular buddy in the visible bottom zone', () => {
  const run = game();
  for (const options of [
    { y: 503.99 }, { y: 600 }, { y: 550, vy: -200 },
    { y: 550, special: 'agent' }, { y: 550, special: 'breakpoint' }, { y: 550, frenzy: true },
  ]) {
    run(`sliceBuddy(buddy(${JSON.stringify(options)}), 0)`);
  }
  assert.equal(run('run.stats.rescues'), 0);
  assert.equal(run('sliceBuddy(buddy({ y: 504 }), 0); run.stats.rescues'), 1);
  assert.equal(run('sliceBuddy(buddy({ y: 599.99 }), 0); run.stats.rescues'), 2);
  assert.equal(run('run.stats.skillPoints'), 60);
});

test('center stacks with apex or rescue and uses the active multiplier', () => {
  const run = game();
  assert.equal(run('run.mult = 3; sliceBuddy(buddy({ vy: 0 }), 0, null, 0); run.score'), 135);
  assert.equal(run('run.stats.skillPoints'), 105);
  assert.equal(run('messages.at(-1)[2]'), 'CENTER + APEX +105');
  assert.equal(run('sliceBuddy(buddy({ y: 550 }), 0, null, 0); run.score'), 300);
  assert.equal(run('messages.at(-1)[2]'), 'CENTER + RESCUE +135');
  assert.equal(run('run.stats.skillPoints'), 240);
  assert.equal(run('run.stats.apexes'), 1);
  assert.equal(run('run.stats.rescues'), 1);
});

test('hat, combo, matching set, and runway rewards retain their values', () => {
  const run = game();
  assert.equal(run('sliceBuddy(buddy({ hat: "cap" }), 0); run.score'), 35);
  assert.equal(run('finalizeGroup({ n: 3, hats: ["cap", "cap"], x: 200, y: 300 }); run.score'), 225);
  assert.equal(run('run.stats.maxCombo'), 3);
  assert.equal(run('run.stats.sets'), 1);
  assert.equal(run('snipeHat(ents.find(e => e.type === "hat"), 0); run.score'), 275);
  assert.equal(run('run.stats.snipes'), 1);
  assert.equal(run(`
    HAT.cap2 = HAT.cap3 = HAT.cap;
    finalizeGroup({ n: 3, hats: ['cap', 'cap2', 'cap3'], x: 200, y: 300 });
    run.score
  `), 815);
  assert.equal(run('run.stats.runways'), 1);
});

test('skill scores can restore a Classic CI check through the existing score path', () => {
  const run = game();
  assert.equal(run(`
    run = newRun('classic'); run.score = 980; run.strikes = 1;
    sliceBuddy(buddy(), 0, null, 0);
    run.score
  `), 1005);
  assert.equal(run('run.strikes'), 0);
  assert.equal(run('run.nextLife'), 2000);
});

test('legacy monoliths retain hit-based scoring without skill bonuses', () => {
  const run = game();
  assert.equal(run(`
    const mono = buddy({ special: 'monolith', vy: 0, y: 550 });
    sliceBuddy(mono, 0, null, 0);
    run.score
  `), 8);
  assert.equal(run('run.stats.skillPoints'), 0);
  assert.equal(run('run.stats.sliced'), 0);
});

test('bomb penalties and Classic game-ending behavior are unchanged', () => {
  const run = game();
  assert.equal(run(`
    run.score = 100; run.mult = 3;
    const bomb = makeBomb({ x: 200, y: 300 }); ents.push(bomb);
    hitBomb(bomb);
    run.score
  `), 50);
  assert.equal(run('state'), 'play');
  assert.equal(run('hitBomb(bomb); run.score'), 50);
  assert.equal(run(`
    run.score = 20; ents.push(bomb); hitBomb(bomb); run.score
  `), 0);
  assert.equal(run(`
    run = newRun('classic'); ents.push(bomb); hitBomb(bomb); state
  `), 'dying');
  assert.equal(run('run.cause'), 'bomb');
});

test('skill bonuses are not awarded outside play and reset with a new run', () => {
  const run = game();
  assert.equal(run('state = "menu"; sliceBuddy(buddy({ vy: 0 }), 0, null, 0); run.score'), 0);
  assert.equal(run('state = "play"; sliceBuddy(buddy({ vy: 0 }), 0, null, 0); run.stats.skillPoints'), 35);
  assert.equal(run('run = newRun("classic"); run.stats.skillPoints'), 0);
  assert.equal(run('run.stats.centers + run.stats.apexes + run.stats.rescues'), 0);
});
