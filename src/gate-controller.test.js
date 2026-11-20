import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateController } from './gate-controller.js';

function createHarness() {
  let now = 1000;
  let nextTimer = 1;
  const timers = new Map();
  const states = new Set();
  const text = {};
  const originalNow = Date.now;
  const originalWindow = globalThis.window;
  Date.now = () => now;
  globalThis.window = {
    setTimeout(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  const elements = {
    gateOpenText: { set textContent(value) { text.openText = value; } },
    gateOpenLabel: { classList: { toggle(name, active) { active ? states.add(name) : states.delete(name); } } },
    accessStatus: { set textContent(value) { text.access = value; } },
    sceneStatus: { set textContent(value) { text.scene = value; } },
    category: { set textContent(value) { text.category = value; } },
    accessIcon: {
      set className(value) { text.iconClass = value; },
      classList: { add(name) { states.add(name); } },
      set textContent(value) { text.icon = value; },
    },
    statusIndicator: {
      set className(value) { text.indicatorClass = value; },
      classList: { add(name) { states.add(name); } },
    },
    decisionBanner: { set className(value) { text.banner = value; } },
    decisionText: { set textContent(value) { text.decision = value; } },
  };
  const sceneState = { open: false };
  const busyChanges = [];
  const controller = createGateController(elements, {
    setGateOpen(value) { sceneState.open = value; },
  }, (busy) => busyChanges.push(busy));

  function advance(milliseconds) {
    now += milliseconds;
    let due = [...timers.entries()].filter(([, timer]) => timer.at <= now);
    while (due.length) {
      for (const [id, timer] of due) {
        timers.delete(id);
        timer.callback();
      }
      due = [...timers.entries()].filter(([, timer]) => timer.at <= now);
    }
  }

  function restore() {
    Date.now = originalNow;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  return { controller, sceneState, text, states, busyChanges, advance, restore };
}

test('holds the authorized gate for five seconds and ignores conflicting decisions while animating', () => {
  const harness = createHarness();
  try {
    const { controller, sceneState, text, states, busyChanges, advance } = harness;
    assert.equal(controller.applyDecision({
      outcome: 'authorized',
      category: 'Nederlandse politie',
      service: 'politie',
    }), true);
    assert.equal(sceneState.open, true);
    assert.equal(text.access, 'TOEGANG VERLEEND');
    assert.equal(text.decision, 'NEDERLANDS HULPDIENSTVOERTUIG HERKEND');
    assert.equal(states.has('is-authorized'), true);

    assert.equal(controller.applyDecision({ outcome: 'denied', category: 'Personenauto' }), false);
    assert.equal(sceneState.open, true);
    assert.equal(text.access, 'TOEGANG VERLEEND');
    assert.equal(controller.isBusy(), true);

    advance(6399);
    assert.equal(sceneState.open, true);
    advance(1);
    assert.equal(sceneState.open, false);
    assert.equal(text.access, 'SLAGBOOM SLUIT');
    assert.equal(controller.isBusy(), true);
    advance(1399);
    assert.equal(controller.isBusy(), true);
    advance(1);
    assert.equal(controller.isBusy(), false);
    assert.equal(text.access, 'KLAAR VOOR SCAN');
    assert.deepEqual(busyChanges, [true, false]);
  } finally {
    harness.restore();
  }
});
