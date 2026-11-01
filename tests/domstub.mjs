/* DOM/canvas/WebGL factices : de quoi exécuter le vrai main.js hors navigateur. */
function ctx2d(canvas) {
  const grad = { addColorStop() {} };
  const noop = () => {};
  const target = {
    canvas,
    createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => null,
    measureText: (t) => ({ width: String(t).length * 8 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    createImageData: () => ({ data: new Uint8ClampedArray(4) })
  };
  /* Chaque méthode inconnue est enregistrée dans `canvas.__calls` : les tests
     peuvent ainsi vérifier le DESSIN (positions des cercles de douilles…). */
  return new Proxy(target, {
    get: (t, k) => {
      if (k in t) return t[k];
      return (...a) => { (canvas.__calls || (canvas.__calls = [])).push([k, ...a]); };
    },
    set: (t, k, v) => {
      t[k] = v;
      if (typeof v !== 'function') (canvas.__calls || (canvas.__calls = [])).push(['set', k, v]);
      return true;
    }
  });
}
export class El {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = []; this.childNodes = this.children; this.parentNode = null;
    this.style = new Proxy({}, { get: (t, k) => t[k] || '', set: (t, k, v) => (t[k] = v, true) });
    const cl = new Set();
    this.classList = {
      add: (...c) => c.forEach(x => cl.add(x)), remove: (...c) => c.forEach(x => cl.delete(x)),
      toggle: (c, f) => { const on = f === undefined ? !cl.has(c) : !!f; on ? cl.add(c) : cl.delete(c); return on; },
      contains: c => cl.has(c), _set: cl
    };
    this.dataset = {}; this.value = ''; this.textContent = ''; this._html = '';
    this.offsetWidth = 100; this.offsetHeight = 20;
    if (this.tagName === 'CANVAS') { this.width = 300; this.height = 150; }
  }
  get className() { return [...this.classList._set].join(' '); }
  set className(v) { this.classList._set.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => this.classList._set.add(c)); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children.length = 0; }
  getContext() { return ctx2d(this); }
  appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute() {} getAttribute() { return null; } removeAttribute() {}
  addEventListener() {} removeEventListener() {}
  querySelector() { return new El('div'); }
  querySelectorAll() { return []; }
  closest() { return null; }
  animate() { return { finished: Promise.resolve() }; }
  focus() {} blur() {} click() {}
  getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 20 }; }
  contains() { return false; }
}
export function install() {
  const reg = new Map();
  /* Les écouteurs de `window` et `document` sont CONSERVÉS : les tests peuvent
     ainsi déclencher de vrais événements clavier / molette et vérifier que le
     jeu les avale (preventDefault) au lieu de les laisser au navigateur.   */
  const winL = new Map(), docL = new Map();
  const on = (m) => (t, f) => { if (!m.has(t)) m.set(t, []); m.get(t).push(f); };
  const off = (m) => (t, f) => { const a = m.get(t); if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } };
  globalThis.document = {
    body: new El('body'),
    documentElement: new El('html'),
    getElementById(id) { if (!reg.has(id)) { const e = new El('div'); e.id = id; reg.set(id, e); } return reg.get(id); },
    createElement: t => new El(t),
    createElementNS: (ns, t) => new El(t),
    createTextNode: t => { const n = new El('#text'); n.textContent = String(t); return n; },
    querySelector: () => new El('div'),
    querySelectorAll: () => [],
    addEventListener: on(docL), removeEventListener: off(docL),
    exitPointerLock() {}, pointerLockElement: null,
    fonts: { ready: Promise.resolve() }
  };
  globalThis.window = globalThis;
  globalThis.innerWidth = 1440; globalThis.innerHeight = 900; globalThis.devicePixelRatio = 1;
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k), clear: () => store.clear()
  };
  globalThis.addEventListener = on(winL); globalThis.removeEventListener = off(winL);
  globalThis.__fire = (t, ev) => (winL.get(t) || []).slice().forEach(f => f(ev));
  globalThis.__fireDoc = (t, ev) => (docL.get(t) || []).slice().forEach(f => f(ev));
  globalThis.__listeners = { win: winL, doc: docL };
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  globalThis.fetch = () => Promise.reject(new Error('pas de réseau dans le harnais'));
  globalThis.URL = URL; globalThis.Blob = class { constructor() {} };
  globalThis.WebSocket = class { constructor() { setTimeout(() => this.onerror && this.onerror({}), 0); } close() {} };
  globalThis.lucide = { createIcons() {} };
  globalThis.location = { href: 'http://localhost:8123/?nom=Testeur', protocol: 'http:', host: 'localhost:8123', search: '?nom=Testeur' };
  return reg;
}
