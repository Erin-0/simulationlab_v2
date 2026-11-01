/* =====================================================================
   tests/test_oscilloscope.mjs  —  Validation de l'écran Oscilloscope & GBF
   ===================================================================== */
import assert from 'node:assert';
import { S } from '../js/state.js';
import {
    TIME_DIVS, VOLT_DIVS, formatTimeDiv, formatVoltDiv,
    autoScaleOscilloscope, renderOscilloscopeScreen, renderGBFDisplay
} from '../js/oscilloscope.js';

console.log('--- Test : Moteur Oscilloscope & GBF (TP 2) ---');

// 1. Formatage des calibres
assert.strictEqual(formatTimeDiv(100e-6), '100 µs');
assert.strictEqual(formatTimeDiv(2e-3), '2 ms');
assert.strictEqual(formatVoltDiv(0.5), '500 mV');
assert.strictEqual(formatVoltDiv(2.0), '2 V');
console.log('✓ Formatage des unités s/div et V/div validé.');

// 2. Échelle automatique (Auto-Scale)
S.gbfFreq = 1000; // 1 kHz -> période = 1 ms
autoScaleOscilloscope();
console.log(`Auto-scale pour 1 kHz : Time/Div = ${formatTimeDiv(S.osc.timeDiv)}`);
assert(S.osc.timeDiv >= 100e-6 && S.osc.timeDiv <= 500e-6, "À 1 kHz, Time/div doit afficher environ 2 périodes (200 µs/div)");

S.gbfFreq = 50000; // 50 kHz -> période = 20 µs
autoScaleOscilloscope();
console.log(`Auto-scale pour 50 kHz : Time/Div = ${formatTimeDiv(S.osc.timeDiv)}`);
assert(S.osc.timeDiv <= 10e-6, "À 50 kHz, Time/div doit descendre dans l'ordre de grandeur de la microseconde");

// 3. Test de rendu sur Canvas factice (Mock 2D)
/* Canvas factice : on enregistre les ordres de tracé, et TOUTE autre méthode
   du contexte 2D (setLineDash, setTransform, arc, quadraticCurveTo…) renvoie
   une fonction vide — le moteur de rendu peut donc évoluer sans casser le test. */
const mockOps = [];
const grad = { addColorStop: () => {} };
const base = {
    canvas: { width: 512, height: 400 },
    createRadialGradient: () => grad, createLinearGradient: () => grad, createPattern: () => null,
    measureText: (t) => ({ width: String(t).length * 7 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    fillRect: () => mockOps.push('fillRect'),
    beginPath: () => mockOps.push('beginPath'),
    stroke: () => mockOps.push('stroke'),
    fill: () => mockOps.push('fill'),
    fillText: (txt) => mockOps.push(`fillText:${txt}`)
};
const mockCtx = new Proxy(base, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (t, k, v) => (t[k] = v, true)
});

S.gbfOn = true;
S.gbfShort = false;
S.loopOk = true;
S.gbfFreq = 3288;
S.Ve = 6.0;
S.Vs = 4.24;
S.phaseRad = -Math.PI / 4;
S.trig = { ok: true, offset: 0, src: 'CH1' };
const txt = () => mockOps.filter(op => op.startsWith('fillText:')).map(op => op.slice(9));

/* 3.a — SONDES EN L'AIR : le filtre est alimenté, mais rien ne peut s'afficher.
   C'est le défaut qui avait été signalé (« le signal apparaît sur l'écran alors
   qu'aucun fil n'est connecté à CH1 ni à CH2 ») : il doit rester corrigé.     */
S.ch1 = { vpp: 0, phase: 0, ok: false, why: 'CH1 : sonde non raccordée' };
S.ch2 = { vpp: 0, phase: 0, ok: false, why: 'CH2 : sonde non raccordée' };
S.phaseMeas = null;
mockOps.length = 0;
renderOscilloscopeScreen(mockCtx.canvas, mockCtx);
assert(mockOps.includes('fillRect'), "Le fond d'écran doit être tracé");
assert(txt().some(t => t.includes('AUCUNE SONDE RACCORDÉE')),
    "Sondes en l'air : l'écran doit annoncer « AUCUNE SONDE RACCORDÉE »");
assert(txt().some(t => t.includes('CH1 → IN+')),
    "Sondes en l'air : l'écran doit rappeler où brancher les sondes");
assert(txt().filter(t => t.includes('NO SIG')).length >= 2,
    "Sondes en l'air : les deux voies doivent afficher NO SIG");
assert(!txt().some(t => /^(1:|2:|Δφ|f=)/.test(t)),
    "AUCUNE mesure automatique ne doit apparaître (Vpp, f, Δφ supprimés de l'OSD)");
console.log("✓ Sondes en l'air : l'écran n'invente aucun signal — et ne mesure rien à la place de l'élève.");

/* 3.b — les deux sondes raccordées : les TRACES s'affichent, mais AUCUNE
   mesure automatique : c'est à l'élève de compter les divisions
   (U = N div × V/DIV, T = N div × TIME/DIV, Δφ via Δx — fascicule p. 2).  */
S.ch1 = { vpp: 6.0, phase: 0, ok: true, why: '' };
S.ch2 = { vpp: 4.243, phase: -Math.PI / 4, ok: true, why: '' };
S.phaseMeas = -Math.PI / 4;
mockOps.length = 0;
renderOscilloscopeScreen(mockCtx.canvas, mockCtx);
assert(txt().some(t => t.startsWith('1  ') && t.includes('/div') && !t.includes('NO SIG')),
    "L'OSD doit afficher la sensibilité de la voie 1");
assert(txt().some(t => t.startsWith('2  ') && t.includes('/div') && !t.includes('NO SIG')),
    "L'OSD doit afficher la sensibilité de la voie 2");
assert(txt().some(t => t.startsWith('TB ') && t.includes('/div')), "L'OSD doit afficher la base de temps");
assert(!txt().some(t => /^1:/.test(t)), "L'OSD ne doit PLUS afficher le Vpp de la voie 1");
assert(!txt().some(t => /^2:/.test(t)), "L'OSD ne doit PLUS afficher le Vpp de la voie 2");
assert(!txt().some(t => t.startsWith('Δφ')), "L'OSD ne doit PLUS afficher le déphasage mesuré");
assert(!txt().some(t => t.startsWith('f=')), "L'OSD ne doit PLUS afficher la fréquence mesurée");
assert(txt().some(t => t.includes('compter les divisions')),
    "L'OSD doit rappeler la méthode : compter les divisions");
assert(!txt().some(t => t.includes('AUCUNE SONDE')), "Le bandeau d'alerte doit disparaître");
assert(txt().some(t => t === "TRIG'D"), "Le déclenchement doit être signalé");
assert(mockOps.filter(op => op === 'stroke').length > 20, 'Grille + traces : beaucoup de traits');
console.log('✓ Rendu double trace validé : calibres + trigger seulement, zéro mesure automatique.');

/* 3.c — GBF hors tension : écran éteint, pas de trace */
S.gbfOn = false;
mockOps.length = 0;
renderOscilloscopeScreen(mockCtx.canvas, mockCtx);
assert(txt().some(t => t === 'GBF HORS TENSION'), 'GBF éteint : message dédié');
assert(!txt().some(t => t.startsWith('f=')), 'GBF éteint : aucune fréquence affichée');
S.gbfOn = true;

/* 3.d — écran du GBF : la FRÉQUENCE seule.  Comme sur un vrai GBF de TP,
   l'amplitude est un bouton aveugle : ni Ue (Vcc) ni Veff ne s'affichent ;
   Ue se mesure à l'oscilloscope (CH1, en divisions).                     */
const gbfLcd = { ctx: mockCtx, tex: { needsUpdate: false } };
mockOps.length = 0;
renderGBFDisplay(gbfLcd);
const gtxt = txt();
assert(gtxt.some(t => t.includes('kHz') || t.includes('Hz')), "L'écran du GBF affiche la fréquence");
assert(!gtxt.some(t => t.includes('Ue =')), "L'écran du GBF ne doit PLUS afficher Ue");
assert(!gtxt.some(t => t.includes('Veff')), "L'écran du GBF ne doit PLUS afficher Veff");
assert(gtxt.some(t => t.includes('AMPL')), "L'écran du GBF signale un bouton d'amplitude analogique");
assert(gtxt.some(t => t.includes('mesurez Ue au scope')),
    "L'écran du GBF renvoie la mesure de Ue à l'oscilloscope");
assert(gbfLcd.tex.needsUpdate === true, "La texture du GBF doit être rafraîchie");
console.log("✓ Écran GBF : fréquence seule, amplitude aveugle (Ue à mesurer au scope).");

console.log('✓ Tous les tests de l\'oscilloscope sont validés !');
