/* ==========================================================================
   tests/dom-mock.mjs — общая заглушка DOM/Canvas для headless-тестов.

   Подменяет document, window, CanvasRenderingContext2D и localStorage,
   записывает все addEventListener, чтобы тест мог «нажимать» на canvas
   синтетическими pointer-событиями и проверять настоящий путь ввода.
   ========================================================================== */

const KNOWN_CTX = new Set([
  'save', 'restore', 'translate', 'rotate', 'scale', 'transform', 'setTransform',
  'resetTransform', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
  'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'rect', 'roundRect', 'fill',
  'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'drawImage',
  'fillText', 'strokeText', 'measureText', 'setLineDash', 'getLineDash',
  'createLinearGradient', 'createRadialGradient', 'createPattern', 'putImageData',
  'getImageData', 'createImageData', 'isPointInPath'
]);

export const stats = {
  ctxCalls: 0,
  unknownCtx: new Map(),
  canvasesCreated: 0,
  eventsDispatched: 0
};

function makeGradient() {
  return { addColorStop(offset, color) { void offset; void color; } };
}

export function makeContext2D(canvas) {
  const target = {
    canvas,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt',
    lineJoin: 'miter', miterLimit: 10, lineDashOffset: 0,
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
    direction: 'ltr', filter: 'none', imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
    shadowBlur: 0, shadowColor: 'transparent', shadowOffsetX: 0, shadowOffsetY: 0
  };

  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop !== 'string') return undefined;
      if (prop === 'measureText') {
        return (t) => ({ width: String(t).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      }
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return makeGradient;
      if (prop === 'getLineDash') return () => [];
      return (...args) => {
        stats.ctxCalls++;
        if (!KNOWN_CTX.has(prop)) stats.unknownCtx.set(prop, (stats.unknownCtx.get(prop) || 0) + 1);
        void args;
        return undefined;
      };
    },
    set(obj, prop, value) { obj[prop] = value; return true; }
  });
}

export function makeCanvas(w = 300, h = 150) {
  const listeners = new Map();
  const c = {
    width: w, height: h, style: {}, nodeName: 'CANVAS',
    clientWidth: w, clientHeight: h,
    getContext: (type) => (type === '2d' ? makeContext2D(c) : null),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: c.clientWidth, height: c.clientHeight, right: c.clientWidth, bottom: c.clientHeight }),
    addEventListener(t, f) { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(f); },
    removeEventListener(t, f) {
      const a = listeners.get(t);
      if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); }
    },
    setPointerCapture() {}, releasePointerCapture() {},
    toDataURL: () => 'data:image/png;base64,',
    __listeners: listeners
  };
  stats.canvasesCreated++;
  return c;
}

/** Отправить синтетическое событие на элемент */
export function dispatch(el, type, props = {}) {
  stats.eventsDispatched++;
  const arr = el.__listeners?.get(type);
  if (!arr) return false;
  const ev = Object.assign({
    type,
    preventDefault() {}, stopPropagation() {},
    clientX: 0, clientY: 0, pointerId: 1, pointerType: 'touch', button: 0
  }, props);
  for (const f of arr.slice()) f(ev);
  return true;
}

const registry = { window: new Map(), document: new Map() };

export function dispatchGlobal(target, type, props = {}) {
  return dispatch({ __listeners: registry[target] }, type, props);
}

/** Установить глобальное окружение (вызывать ДО импорта игровых модулей) */
export function setupDom(opts = {}) {
  const w = opts.width ?? 900;
  const h = opts.height ?? 420;
  const dpr = opts.dpr ?? 2;

  const docListeners = registry.document;
  const winListeners = registry.window;

  const gameCanvas = makeCanvas(w, h);
  gameCanvas.clientWidth = w;
  gameCanvas.clientHeight = h;

  const elements = {
    game: gameCanvas,
    debug: { classList: { toggle() {}, add() {}, remove() {} }, style: {}, textContent: '' },
    rotate: { classList: { toggle() {}, add() {}, remove() {} }, style: {}, textContent: '' },
    boot: { classList: { toggle() {}, add() {}, remove() {} }, style: {}, textContent: '' }
  };

  globalThis.document = {
    readyState: 'complete',
    hidden: false,
    documentElement: { style: {}, requestFullscreen: null },
    body: { appendChild() {}, removeChild() {}, style: {} },
    createElement: (tag) => (tag === 'canvas'
      ? makeCanvas(1, 1)
      : {
        style: { cssText: '' },
        classList: { toggle() {}, add() {}, remove() {} },
        textContent: '',
        appendChild() {}
      }),
    getElementById: (id) => elements[id] || null,
    addEventListener: (t, f) => { if (!docListeners.has(t)) docListeners.set(t, []); docListeners.get(t).push(f); },
    removeEventListener() {},
    fullscreenElement: null
  };

  globalThis.getComputedStyle = () => ({
    paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px'
  });

  const rafQueue = [];
  globalThis.window = {
    innerWidth: w, innerHeight: h, devicePixelRatio: dpr,
    matchMedia: () => ({ matches: opts.coarsePointer !== false }),
    addEventListener: (t, f) => { if (!winListeners.has(t)) winListeners.set(t, []); winListeners.get(t).push(f); },
    removeEventListener() {},
    requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length; },
    cancelAnimationFrame() {},
    AudioContext: undefined,
    location: { search: '', protocol: 'http:', href: 'http://localhost/' },
    localStorage: null
  };

  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { serviceWorker: undefined, userAgent: 'node' },
      configurable: true, writable: true
    });
  } catch (e) { /* в Node navigator read-only — не критично */ }

  globalThis.location = globalThis.window.location;
  globalThis.screen = { orientation: { lock: () => Promise.reject(new Error('n/a')) } };
  globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = globalThis.window.cancelAnimationFrame;
  globalThis.matchMedia = globalThis.window.matchMedia;

  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
  globalThis.window.localStorage = globalThis.localStorage;
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
  globalThis.URLSearchParams = URLSearchParams;

  /** Прогнать кадры requestAnimationFrame (как это делает браузер) */
  let ts = 0;
  function runFrames(n, dtMs = 16.7) {
    for (let i = 0; i < n; i++) {
      const q = rafQueue.splice(0, rafQueue.length);
      ts += dtMs;
      for (const cb of q) cb(ts);
    }
  }

  return { gameCanvas, runFrames, elements, registry };
}

export default { setupDom, makeCanvas, makeContext2D, dispatch, dispatchGlobal, stats };
