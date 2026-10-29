const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(`${__dirname}/../js/input.js`, 'utf8');

function setup(state = 'play') {
  const canvasEvents = {}, windowEvents = {};
  const hits = [], groups = [], captures = [];
  let now = 100;
  const context = vm.createContext({
    state, W: 800, H: 600, run: {}, ents: [],
    performance: { now: () => now },
    cvs: {
      getBoundingClientRect: () => ({ left: 10, top: 20 }),
      setPointerCapture: (id) => captures.push(id),
      addEventListener: (name, handler) => { canvasEvents[name] = handler; },
    },
    window: { addEventListener: (name, handler) => { windowEvents[name] = handler; } },
    Sfx: { unlock() {}, swoosh() {} },
    clamp: (n, min, max) => Math.max(min, Math.min(n, max)),
    mkCanvas() {}, rand: () => 0,
    radiusOf: () => 5,
    sliceBuddy: (buddy, angle, group) => {
      hits.push(buddy);
      if (group) group.n++;
    },
    finalizeGroup: (group) => groups.push(group),
  });
  vm.runInContext(source, context);
  function send(name, x, y = 100, pointerType = 'mouse', extra = {}) {
    now += 20;
    canvasEvents[name]({
      pointerId: 1, pointerType, clientX: x + 10, clientY: y + 20,
      timeStamp: now, ...extra,
    });
  }
  function target(x = 100) {
    const buddy = { type: 'buddy', entered: true, x, y: 100 };
    context.ents.push(buddy);
    return buddy;
  }
  return { context, send, target, hits, groups, captures, windowEvents,
    count: () => vm.runInContext('pointers.size', context) };
}

test('mouse movement slices without pressing a button, even at slow speeds', () => {
  const game = setup();
  const buddy = game.target();
  game.send('pointermove', 94);
  game.send('pointermove', 96);
  assert.deepEqual(game.hits, [buddy]);
  assert.equal(game.captures.length, 0);
});

test('first mouse movement only seeds the blade, without a phantom cut', () => {
  const game = setup();
  game.target();
  game.send('pointermove', 200);
  assert.equal(game.hits.length, 0);
});

test('mouse release keeps hover slicing active', () => {
  const game = setup();
  game.send('pointerdown', 80);
  game.send('pointerup', 80);
  game.target();
  game.send('pointermove', 120);
  assert.equal(game.hits.length, 1);
  assert.equal(game.count(), 1);
});

test('leaving the canvas ends the combo and prevents a cut across re-entry', () => {
  const game = setup();
  game.target();
  game.send('pointermove', 80);
  game.send('pointermove', 120);
  game.send('pointerleave', 120);
  assert.equal(game.groups.length, 1);
  assert.equal(game.count(), 0);
  game.target(160);
  game.send('pointermove', 200);
  assert.equal(game.hits.length, 1);
});

test('touch and pen still require contact and retain pointer capture', () => {
  for (const type of ['touch', 'pen']) {
    const game = setup();
    game.target();
    game.send('pointermove', 80, 100, type);
    game.send('pointermove', 120, 100, type);
    assert.equal(game.hits.length, 0);
    game.send('pointerdown', 80, 100, type);
    game.send('pointerleave', 80, 100, type);
    game.send('pointermove', 120, 100, type);
    assert.equal(game.hits.length, 1);
    assert.deepEqual(game.captures, [1]);
    game.send('pointerup', 120, 100, type);
    assert.equal(game.count(), 0);
  }
});

test('mouse hover selects menu targets and clicking still works', () => {
  for (const click of [false, true]) {
    const game = setup('menu');
    let chosen = 0;
    game.context.chooseRing = () => { chosen++; };
    vm.runInContext('menuRings[0].x = 100; menuRings[0].y = 100; menuRings[0].R = 20', game.context);
    if (click) {
      game.send('pointermove', 100);
      game.send('pointerdown', 100);
      game.send('pointerup', 100);
    } else {
      game.send('pointermove', 80);
      game.send('pointermove', 120);
    }
    assert.equal(chosen, 1);
  }
});

test('inactive states cannot slice or retain a blade', () => {
  for (const state of ['loading', 'paused', 'rack', 'dying', 'over']) {
    const game = setup();
    game.target();
    game.send('pointermove', 80);
    game.context.state = state;
    game.send('pointermove', 120);
    assert.equal(game.hits.length, 0);
    assert.equal(game.count(), 0);
  }
});

test('cancellation and window blur clear pointers without tapping a menu target', () => {
  for (const cancel of ['pointercancel', 'blur']) {
    const game = setup('menu');
    let taps = 0;
    game.context.tapAt = () => { taps++; };
    game.send('pointerdown', 100, 100, 'touch');
    if (cancel === 'blur') game.windowEvents.blur();
    else game.send(cancel, 100, 100, 'touch');
    assert.equal(game.count(), 0);
    assert.equal(taps, 0);
  }
});
