const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

function game(mode = 'classic', width = 390, height = 844, coarse = false) {
  const calls = [];
  const record = (name) => (...args) => calls.push({ name, args });
  const context = vm.createContext({
    document: {
      querySelector: () => ({ getContext: () => ({}) }),
      createElement: () => ({ getContext: () => ({}) }),
    },
    matchMedia: (query) => ({ matches: coarse && query === '(pointer: coarse)' }),
    localStorage: { getItem: () => null },
    navigator: {},
    parts: [],
    UI: Object.fromEntries(['score', 'strikes', 'setMode', 'timer'].map((name) => [name, record(name)])),
    Sfx: { boom: record('boom') },
    ...Object.fromEntries(['banner', 'popup', 'flash', 'shake', 'sparks', 'shock', 'emit'].map((name) => [name, record(name)])),
  });
  for (const file of ['core', 'entities', 'game']) {
    vm.runInContext(readFileSync(join(__dirname, `../js/${file}.js`), 'utf8'), context);
  }
  const evaluate = (source) => vm.runInContext(source, context);
  evaluate(`
    W = ${width}; H = ${height}; TOP = 35;
    K = Math.max(0.75, Math.round(clamp(Math.min(W, H) * 0.24, 78, 150) / 96 * 4) / 4);
    S = 96 * K; G = 1.5 * H;
    run = newRun('${mode}'); state = 'play';
    run.time = 30; run.d = 0.3;
    let seed = 42;
    Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  `);
  return { evaluate, calls };
}

for (const mode of ['classic', 'arcade']) {
  test(`${mode}: grace period, live bomb cap, and Agent protection`, () => {
    const { evaluate } = game(mode);
    assert.equal(evaluate('run.time = 9.99; spawnBomb(100, 100, 0.24); ents.length'), 0);
    const cap = mode === 'arcade' ? 3 : 2;
    assert.equal(evaluate('run.time = 10; for (let i = 0; i < 10; i++) spawnBomb(100, 100, 0.24); ents.length'), cap);
    assert.equal(evaluate('ents.pop(); spawnBomb(100, 100, 0.24); ents.length'), cap);
    assert.equal(evaluate('ents.length = 0; run.frenzyT = 5; spawnBomb(100, 100, 0.24); ents.length'), 0);
    assert.equal(evaluate('run.frenzyT = 0; state = "menu"; for (let i = 0; i < 4; i++) spawnBomb(100, 100, 0.24); ents.length'), 4);
  });

  test(`${mode}: lane encounter is warned, delayed, and mode-scaled`, () => {
    const { evaluate, calls } = game(mode);
    // At 30s the lane encounter is the fifth weighted option.
    evaluate('Math.random = () => 0.8; spawnWave()');
    assert.ok(calls.some(({ name, args }) => name === 'banner' && args[0] === 'DANGER ZONE'));
    assert.equal(evaluate('ents.length'), 0);
    assert.equal(evaluate('timers[0].t'), 0.65);
    evaluate('timers.pop().fn()');
    assert.equal(evaluate('ents.filter((e) => e.type === "buddy").length'), 2);
    assert.equal(evaluate('ents.filter((e) => e.type === "bomb").length'), mode === 'arcade' ? 2 : 1);
    if (mode === 'classic') {
      evaluate('ents.length = 0; run.d = 0.6; spawnWave(); timers.pop().fn()');
      assert.equal(evaluate('ents.filter((e) => e.type === "bomb").length'), 2);
    }
  });

  test(`${mode}: delayed encounters cannot launch after play ends or Agent starts`, () => {
    for (const change of ['state = "over"', 'run.frenzyT = 5']) {
      const { evaluate } = game(mode);
      evaluate(`Math.random = () => 0.8; spawnWave(); ${change}; timers.pop().fn()`);
      assert.equal(evaluate('ents.length'), 0);
    }
  });
}

test('lane trajectories leave a safe middle swipe on mobile and desktop', () => {
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1440, 900]]) {
    const { evaluate } = game('arcade', width, height, true);
    evaluate('Math.random = () => 0.8; spawnWave(); timers.pop().fn()');
    const safe = evaluate(`
      let safe = true;
      for (let i = 0; i < 240; i++) {
        updateEnts(1 / 120);
        for (const bomb of ents.filter((e) => e.type === 'bomb')) {
          for (const buddy of ents.filter((e) => e.type === 'buddy')) {
            if (Math.abs(bomb.x - buddy.x) <= radiusOf(bomb) + radiusOf(buddy)) safe = false;
          }
          if (bomb.x < radiusOf(bomb) || bomb.x > W - radiusOf(bomb)) safe = false;
        }
      }
      safe;
    `);
    assert.equal(safe, true, `${width}x${height}`);
  }
});

test('bomb probability increases in both modes, with more pressure in Arcade', () => {
  function countBombs(mode, difficulty, time) {
    const { evaluate } = game(mode);
    return evaluate(`
      run.d = ${difficulty}; run.time = ${time};
      let count = 0;
      for (let i = 0; i < 2000; i++) {
        ents.length = 0; timers.length = 0;
        spawnWave();
        for (const timer of timers) timer.fn();
        count += ents.filter((e) => e.type === 'bomb').length;
      }
      count;
    `);
  }
  for (const mode of ['classic', 'arcade']) {
    assert.equal(countBombs(mode, 0, 9), 0);
    assert.ok(countBombs(mode, 0.9, 54) > countBombs(mode, 0.2, 12));
  }
  assert.ok(countBombs('arcade', 0.5, 30) > countBombs('classic', 0.5, 30));
});

test('Classic bombs still end the run; Arcade bombs still cost exactly 50', () => {
  const classic = game();
  classic.evaluate('spawnBomb(100, 100, 0.24); run.score = 123; hitBomb(ents[0])');
  assert.equal(classic.evaluate('state'), 'dying');
  assert.equal(classic.evaluate('run.cause'), 'bomb');
  assert.equal(classic.evaluate('run.score'), 123);
  assert.equal(classic.evaluate('run.stats.bombs'), 1);
  assert.equal(classic.evaluate('timers[0].t'), 1.6);
  const arcade = game('arcade');
  arcade.evaluate('spawnBomb(100, 100, 0.24); run.score = 123; run.mult = 3; hitBomb(ents[0])');
  assert.equal(arcade.evaluate('state'), 'play');
  assert.equal(arcade.evaluate('run.score'), 73);
  assert.equal(arcade.evaluate('run.stats.bombs'), 1);
  arcade.evaluate('spawnBomb(100, 100, 0.24); run.score = 20; hitBomb(ents[0])');
  assert.equal(arcade.evaluate('run.score'), 0);
});

test('letting bombs fall off screen does not cost Classic CI checks', () => {
  const { evaluate } = game();
  evaluate('spawnBomb(100, 100, 0.24); ents[0].y = H + S * 2; ents[0].vy = 100; run.waveT = 10; updateGame(0, 0)');
  assert.equal(evaluate('ents.length'), 0);
  assert.equal(evaluate('run.strikes'), 0);
  assert.equal(evaluate('run.score'), 0);
});
