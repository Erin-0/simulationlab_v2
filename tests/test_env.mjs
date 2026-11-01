/* Harnais headless minimal : on simule juste assez de DOM/canvas pour
   charger environment.js et tester la géométrie des surfaces d'appui. */
function ctx2d() {
  const grad = { addColorStop() {} };
  const noop = () => {};
  return new Proxy({
    canvas: { width: 8, height: 8 },
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    createPattern: () => null, measureText: () => ({ width: 10 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    shadowColor: '', shadowBlur: 0, shadowOffsetY: 0, globalAlpha: 1, lineJoin: '', lineCap: ''
  }, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => (t[k] = v, true) });
}
globalThis.document = {
  createElement: (tag) => tag === 'canvas'
    ? { width: 8, height: 8, getContext: () => ctx2d(), style: {} }
    : { style: {}, appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } },
  getElementById: () => null,
  fonts: { ready: Promise.resolve() }
};
globalThis.devicePixelRatio = 1;
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;

const { supportAt } = await import('../js/environment.js');
const { DESK, DESK_ROT, TABLE_R, TABLE_H } = await import('../js/state.js');

let pass = 0, fail = 0;
const chk = (l, c, x = '') => { c ? (pass++, console.log('  ✓', l, x)) : (fail++, console.log('  ✗', l, x)); };

chk('centre de la table ronde -> hauteur du plateau', supportAt(0, 0)?.y === TABLE_H);
chk('bord intérieur de la table -> support', !!supportAt(TABLE_R - .1, 0), JSON.stringify(supportAt(TABLE_R - .1, 0)));
chk('juste hors de la table -> aucun support', supportAt(TABLE_R + .3, 0) === null);
chk('loin de tout -> null', supportAt(4.2, -4.2) === null);
chk('centre du bureau -> hauteur bureau', Math.abs(supportAt(DESK.x, DESK.z).y - DESK.h) < 1e-9, JSON.stringify(supportAt(DESK.x, DESK.z)));
/* le bureau est tourné : ses 4 coins doivent quand même porter */
const a = DESK_ROT, hw = DESK.w / 2 - .05, hd = DESK.d / 2 - .05;
let corners = 0;
for (const [sx, sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
  const lx = sx * hw, lz = sz * hd;
  const wx = DESK.x + lx * Math.cos(a) - lz * Math.sin(a);
  const wz = DESK.z + lx * Math.sin(a) + lz * Math.cos(a);
  if (supportAt(wx, wz)?.y === DESK.h) corners++;
}
chk('les 4 coins du bureau (tourné) sont détectés', corners === 4, corners + '/4');
chk('au pied du bureau (sol) -> null', supportAt(DESK.x, DESK.z + 1.6) === null);
console.log(`\n${pass} réussi(s), ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
