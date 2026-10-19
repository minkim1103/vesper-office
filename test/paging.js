import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
// Run the page controller with a deterministic clock and minimal layout adapter.
// This verifies interrupted gestures without depending on a physical touch screen.
const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('const MINP ='), source.indexOf("$('#spAdd').addEventListener"));
const events = {}, frames = new Map(), timers = new Map();
let sequence = 0, width = 390;
const element = (hidden = false) => ({ hidden, style: {}, scrollTop: 0, getBoundingClientRect: () => ({ width }) });
const els = Object.fromEntries(['app', 'dayPanel', 'workstream', 'spaces', 'sheet'].map(id => [id, element(id !== 'app')]));
const state = { page: 0 };
const on = (name, fn) => (events[name] ||= []).push(fn);
const context = vm.createContext({
  state, $: key => els[key.slice(1)], vw: () => width, view: { rot: null },
  window: { addEventListener: on, matchMedia: () => ({ matches: false }) },
  document: { addEventListener: on, body: { style: {} }, hidden: false },
  requestAnimationFrame: fn => { frames.set(++sequence, fn); return sequence; },
  cancelAnimationFrame: id => frames.delete(id),
  setTimeout: fn => { timers.set(++sequence, fn); return sequence; },
  clearTimeout: id => timers.delete(id),
  renderWorkstream() {}, renderSpaces() {}, updateMonthsOnScroll() {}, loadTasks() {}, loadWorkstream: async () => {},
  getComputedStyle: el => ({ transform: el.style.transform || 'none' }),
  DOMMatrixReadOnly: class { constructor(value) { this.m41 = Number(value?.match(/translate3d\(([-.\d]+)/)?.[1] || 0); } },
});
vm.runInContext(block, context);
const emit = (name, event = {}) => events[name]?.forEach(fn => fn(event));
const finish = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); };
const frame = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
const target = { closest: () => null };
const touch = x => ({ target, touches: [{ clientX: x, clientY: 200 }], preventDefault() {} });
context.pt = t => ({ x: t.clientX, y: t.clientY });
assert.equal(els.workstream.hidden, true);
// Cancelled partial swipe must restore Calendar and remove the neighboring page.
emit('touchstart', touch(300)); emit('touchmove', touch(230)); emit('touchmove', touch(200));
assert.equal(frames.size, 1, 'touch moves are coalesced to one render per frame');
frame(); assert.equal(els.workstream.hidden, false);
emit('touchcancel'); finish();
assert.equal(state.page, 0); assert.equal(els.workstream.hidden, true); assert.equal(els.app.style.transform, '');
// A completed swipe reveals Workstream; rotation/resize must align it to x=0.
emit('touchstart', touch(350)); emit('touchmove', touch(80)); frame(); emit('touchend'); finish();
assert.equal(state.page, 1); assert.equal(els.workstream.hidden, false);
width = 430; emit('resize'); finish();
assert.equal(els.workstream.style.transform, '');
assert.match(els.app.style.transform, /-430px/);
// Inertial wheel events are one gesture, not repeated page changes.
const wheel = deltaX => ({ target, deltaX, deltaY: 0, preventDefault() {} });
emit('wheel', wheel(-120)); emit('wheel', wheel(-120)); emit('wheel', wheel(-120)); finish();
assert.equal(state.page, 0); assert.equal(els.workstream.hidden, true);
// Leaving the browser during a drag cannot preserve a partially visible page.
emit('touchstart', touch(300)); emit('touchmove', touch(240)); frame();
context.document.hidden = true; emit('visibilitychange'); finish();
assert.equal(els.workstream.hidden, true); assert.equal(els.app.style.transform, '');
emit('pageshow'); finish();
assert.equal(els.workstream.hidden, true);
console.log('✓ Paging: cancelled gestures, frame batching, completed swipe, resize, momentum, background and restore');
