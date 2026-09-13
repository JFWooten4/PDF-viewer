import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/viewer/navigation/minimap.js', import.meta.url), 'utf8')
  .replace(/^import \{[\s\S]*?\} from "\.\.\/\.\.\/\.\.\/node_modules\/pdfjs-dist\/build\/pdf\.mjs";\n/, '')
  .replace(/^import \{ resolvePdfSource \} from "\.\.\/pdf-source\.js";\n/, '');
const styles = readFileSync(new URL('../src/viewer/navigation/minimap.css', import.meta.url), 'utf8');
const viewerStyles = readFileSync(new URL('../src/viewer/viewer.css', import.meta.url), 'utf8');
const viewerSource = readFileSync(new URL('../src/viewer/viewer.js', import.meta.url), 'utf8');
function fixture(count, height = 900) {
  const windowEvents = [];
  const window = { innerHeight: height, scrollY: 0, location: { pathname: '/src/viewer.html', search: '' }, addEventListener() {},
    dispatchEvent(event) { windowEvents.push(event.type); },
    scrollTo({ top }) { this.scrollY = top; } };
  const tiles = Array.from({ length: count }, () => ({ clientWidth: 80, style: {} }));
  const pages = tiles.map((_, index) => ({ querySelector() { return null; },
    getBoundingClientRect() { return { width: 1000, height: 1400, top: index * 1420 - window.scrollY }; } }));
  const listeners = {};
  const track = { clientHeight: height - 52, addEventListener(type, callback) { listeners[type] = callback; }, setAttribute() {} };
  const viewport = { style: {} };
  const toggle = { checked: true, addEventListener(type, callback) { listeners[`toggle-${type}`] = callback; } };
  const elements = { '#viewer': { querySelectorAll: () => pages }, '#minimap': track,
    '#minimap-pages': { children: tiles }, '#minimap-viewport': viewport, '#show-minimap': toggle };
  const classes = new Set();
  const document = { querySelector: selector => elements[selector],
    documentElement: { scrollHeight: count * 1420, classList: {
      contains: value => classes.has(value),
      add(value) { classes.add(value); },
      toggle(value, force) { force ? classes.add(value) : classes.delete(value); },
    } } };
  const storedValues = new Map();
  const localStorage = {
    getItem: key => storedValues.get(key) ?? null,
    setItem: (key, value) => storedValues.set(key, value),
  };
  const observer = class { observe() {} };
  const chrome = { runtime: { getURL: value => value } };
  const context = vm.createContext({ document, window, localStorage, chrome,
    resolvePdfSource: async () => { throw new Error('No PDF source in geometry fixture'); },
    GlobalWorkerOptions: {}, VerbosityLevel: { ERRORS: 0 }, URLSearchParams, Event, MutationObserver: observer,
    ResizeObserver: observer, WheelEvent: { DOM_DELTA_LINE: 1, DOM_DELTA_PAGE: 2 }, requestAnimationFrame() { return 1; } });
  vm.runInContext(source, context);
  const sync = () => vm.runInContext('syncMinimap()', context);
  sync();
  return { window, windowEvents, tiles, track, viewport, toggle, classes, storedValues, context, sync, listeners };
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

test('minimap packs page thumbnails without viewer gaps', () => {
  const f = fixture(3);
  assert.equal(parseFloat(f.tiles[0].style.top), 0);
  assert.equal(parseFloat(f.tiles[1].style.top), 112);
  assert.equal(parseFloat(f.tiles[2].style.top), 224);
});

test('long documents compress every page into the visible minimap track', () => {
  const f = fixture(100);
  const first = f.tiles[0];
  const last = f.tiles.at(-1);
  const lastBottom = parseFloat(last.style.top) + parseFloat(last.style.height);
  assert.equal(parseFloat(first.style.top), 0);
  assert.ok(parseFloat(first.style.height) < 112);
  assert.ok(Math.abs(lastBottom - f.track.clientHeight) < 0.00001);

  f.window.scrollY = 142000 - f.window.innerHeight;
  f.sync();
  assert.equal(parseFloat(first.style.top), 0);
  assert.ok(Math.abs(parseFloat(last.style.top) + parseFloat(last.style.height) - f.track.clientHeight) < 0.00001);
});

test('very long documents allow subpixel page bands instead of overflowing the track', () => {
  const f = fixture(2000);
  const last = f.tiles.at(-1);
  assert.ok(parseFloat(f.tiles[0].style.height) < 1);
  assert.ok(parseFloat(last.style.top) + parseFloat(last.style.height) <= f.track.clientHeight + 0.00001);
  assert.match(styles, /\.minimap-page\s*\{[\s\S]*?min-height:\s*0;/);
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

test('minimap toggle persists visibility and updates accessibility state', () => {
  const f = fixture(3);
  f.toggle.checked = false;
  f.listeners['toggle-change']();
  assert.ok(f.classes.has('minimap-disabled'));
  assert.equal(f.track.tabIndex, -1);
  assert.equal(f.storedValues.get('pdf-viewer-show-minimap'), 'false');

  f.toggle.checked = true;
  f.listeners['toggle-change']();
  assert.ok(!f.classes.has('minimap-disabled'));
  assert.equal(f.track.tabIndex, 0);
  assert.equal(f.storedValues.get('pdf-viewer-show-minimap'), 'true');
  assert.deepEqual(f.windowEvents, ['resize', 'resize', 'resize']);
});

test('the loading screen remains until concurrent thumbnails and the first two pages are ready', () => {
  assert.match(source, /MINIMAP_RENDER_CONCURRENCY\s*=\s*4/);
  assert.match(source, /await Promise\.all\(/);
  assert.match(source, /loadThumbnailDocument\(\)\.catch\(\(\) => \{\}\)\.finally\(finishMinimapPreparation\)/);
  assert.match(source, /classList\.add\("minimap-ready"\)/);
  assert.match(viewerSource, /requiredPageCount\s*=\s*Math\.min\(2, pdfDocument\.numPages\)/);
  assert.match(viewerSource, /classList\.add\("document-ready"\)/);
  assert.match(viewerSource, /goToPage\(currentPage, "auto"\);\s*keepRenderWindow\(currentPage\);/);
  assert.doesNotMatch(viewerSource, /status\.remove\(\)/);
  assert.match(viewerStyles, /\.minimap-preparing \.minimap\s*\{[\s\S]*?visibility:\s*hidden/);
  assert.match(viewerStyles, /html:not\(\.minimap-preparing\) \.status:not\(\.error\)\s*\{[\s\S]*?display:\s*none/);
  assert.doesNotMatch(viewerStyles, /\.page,\s*\.minimap\s*\{[\s\S]*?transition:\s*opacity/);
});

test('thumbnail edges fade softly into the minimap background', () => {
  assert.doesNotMatch(styles, /\.minimap\s*\{[\s\S]*?border-left:/);
  assert.match(styles, /\.minimap-page\s*\{[\s\S]*?-webkit-mask-image:\s*linear-gradient\(/);
  assert.match(styles, /\.minimap-page\s*\{[\s\S]*?mask-image:\s*linear-gradient\(/);
  assert.match(styles, /transparent[\s\S]*?#000 10%[\s\S]*?#000 90%[\s\S]*?transparent/);
});

test('thumbnail canvases render below their displayed width', () => {
  assert.match(source, /MINIMAP_THUMBNAIL_WIDTH\s*=\s*80/);
  assert.match(source, /MINIMAP_THUMBNAIL_RENDER_WIDTH\s*=\s*24/);
  assert.match(source, /scale:\s*MINIMAP_THUMBNAIL_RENDER_WIDTH\s*\/\s*Math\.max\(baseViewport\.width, 1\)/);
});
