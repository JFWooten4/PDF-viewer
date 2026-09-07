import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/minimap.js', import.meta.url), 'utf8');
function fixture(count, height = 900) {
  const window = { innerHeight: height, scrollY: 0, addEventListener() {},
    scrollTo({ top }) { this.scrollY = top; } };
  const tiles = Array.from({ length: count }, () => ({ clientWidth: 80, style: {} }));
  const pages = tiles.map((_, index) => ({ querySelector() { return null; },
    getBoundingClientRect() { return { width: 1000, height: 1400, top: index * 1420 - window.scrollY }; } }));
  const listeners = {};
  const track = { clientHeight: height - 52, addEventListener(type, callback) { listeners[type] = callback; }, setAttribute() {} };
  const viewport = { style: {} };
  const elements = { '#viewer': { querySelectorAll: () => pages }, '#minimap': track,
    '#minimap-pages': { children: tiles }, '#minimap-viewport': viewport };
  const document = { querySelector: selector => elements[selector],
    documentElement: { scrollHeight: count * 1420 } };
  const observer = class { observe() {} };
  const context = vm.createContext({ document, window, MutationObserver: observer,
    ResizeObserver: observer, WheelEvent: { DOM_DELTA_LINE: 1, DOM_DELTA_PAGE: 2 }, requestAnimationFrame() { return 1; } });
  vm.runInContext(source, context);
  const sync = () => vm.runInContext('syncMinimap()', context);
  sync();
  return { window, tiles, track, viewport, context, sync, listeners };
}

test('short documents keep fixed thumbnail heights at the top after resize', () => {
  const f = fixture(2);
  assert.equal(parseFloat(f.tiles[0].style.top), 0);
  assert.equal(parseFloat(f.tiles[0].style.height), 112);
  assert.ok(parseFloat(f.tiles[1].style.top) + 112 < f.track.clientHeight);
  f.window.innerHeight = 1600;
  f.track.clientHeight = 1548;
  f.sync();
  assert.equal(parseFloat(f.tiles[0].style.height), 112);
});

test('long documents retain page scale and expose the final page at the bottom', () => {
  const f = fixture(100);
  f.window.scrollY = 142000 - f.window.innerHeight;
  f.sync();
  const last = f.tiles.at(-1);
  assert.equal(parseFloat(last.style.height), 112);
  assert.ok(parseFloat(last.style.top) >= 0);
  assert.ok(parseFloat(last.style.top) + 112 <= f.track.clientHeight);
});

test('dragging to the end reaches the document end for short and long maps', () => {
  for (const count of [2, 100]) {
    const f = fixture(count);
    vm.runInContext('scrollFromViewportTop(mapHeight - viewportHeight)', f.context);
    assert.equal(f.window.scrollY, count * 1420 - f.window.innerHeight);
    vm.runInContext('scrollFromViewportTop(0)', f.context);
    assert.equal(f.window.scrollY, 0);
  }
});


test('wheel navigation uses compact map travel and current scroll position in every delta mode', () => {
  for (const count of [2, 100]) {
    for (const deltaMode of [0, 1, 2]) {
      const f = fixture(count);
      const maximum = count * 1420 - f.window.innerHeight;
      f.window.scrollY = maximum / 2;
      f.sync();
      let prevented = false;
      const deltaY = 0.1;
      const normalized = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? f.track.clientHeight : 1);
      const travel = vm.runInContext('mapHeight - viewportHeight', f.context);
      const expected = Math.min(maximum, maximum / 2 + normalized * 0.55 / travel * maximum);
      f.listeners.wheel({ deltaY, deltaMode, preventDefault() { prevented = true; } });
      assert.ok(Math.abs(f.window.scrollY - expected) < 0.00001);
      assert.ok(prevented);
      f.listeners.wheel({ deltaY: -1000000, deltaMode, preventDefault() {} });
      assert.equal(f.window.scrollY, 0);
    }
  }
});
