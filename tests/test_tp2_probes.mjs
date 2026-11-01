/* =====================================================================
   tests/test_tp2_probes.mjs — TP 2 : réponse fréquentielle.

   Ce test verrouille la correction du défaut signalé :
   « aucun fil n'est connecté à l'entrée de mesure de l'oscilloscope (CH1)
     ni à la seconde (CH2). Malgré cela, le signal apparaît sur l'écran,
     ce qui est physiquement irréaliste. »

   On rejoue donc le TP 2 avec le VRAI main.js :
     • filtre alimenté mais SONDES EN L'AIR  -> rien sur l'écran ;
     • une seule sonde raccordée             -> une seule voie affiche ;
     • les deux sondes                       -> gain mesuré = gain théorique ;
     • GBF éteint / court-circuité / masse unique -> comportements sains.
   ===================================================================== */
import { install } from './domstub.mjs';
install();
import * as THREE from 'three';
await import('../js/main.js');

const state = await import('../js/state.js');
const circuit = await import('../js/circuit.js');
const player = await import('../js/player.js');
const osc = await import('../js/oscilloscope.js');
const hud = await import('../js/hud.js');

const { S, wires } = state;

let pass = 0, fail = 0;
const chk = (l, c, x = '') => { c ? (pass++, console.log('  ✓', l, x)) : (fail++, console.log('  ✗', l, x)); };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;

const toasts = [];
const say = (m, t) => toasts.push({ m: String(m), t: t || 'info' });
const ev = () => circuit.evaluate(say, () => { });
const clr = () => { wires.length = 0; ev(); };
const W = (...pairs) => {
    pairs.forEach(([a, b]) => wires.push({ a, b, color: 0x22d3ee, group: new THREE.Group() }));
    ev();
};

/* câblages types du banc TP 2 */
const DRIVE = [['GBF+', 'TP2_IN+'], ['GBF-', 'TP2_IN-']];       // le GBF attaque l'entrée
const PROBE_IN = [['OSC_CH1+', 'TP2_IN+'], ['OSC_CH1-', 'TP2_IN-']];
const PROBE_OUT = [['OSC_CH2+', 'TP2_OUT+'], ['OSC_CH2-', 'TP2_OUT-']];

/* écran factice : on vérifie que le rendu vectoriel ne casse pas */
const grad = { addColorStop: () => { } };
const screenCanvas = { width: 512, height: 400 };
const screenCtx = new Proxy({
    canvas: screenCanvas,
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    measureText: (t) => ({ width: String(t).length * 7 })
}, { get: (t, k) => (k in t ? t[k] : () => { }), set: (t, k, v) => (t[k] = v, true) });
const drawScreen = () => osc.renderOscilloscopeScreen(screenCanvas, screenCtx);

/* ================================================================== */
console.log('\n  --- 1. passage sur le banc TP 2 ---');
/* ================================================================== */
document.getElementById('btnTP2').onclick();
chk('TP 2 actif, maquette et oscilloscope affichés',
    S.activeTP === 2 && state.ctx.groupTP2.visible === true && state.ctx.groupTP3.visible === false);
chk('le générateur continu du TP 1 est rangé', state.ctx.genGroup.visible === false);
chk('GBF livré ÉTEINT', S.gbfOn === false);

/* ================================================================== */
console.log('\n  --- 2. le défaut signalé : sondes en l\'air ---');
/* ================================================================== */
player.toggleGBF();
player.adjustControl('knobGbfFreq', -1, 'shift');           // on descend sous 1 kHz
S.gbfFreq = 3288; ev();                                      // fréquence de coupure du RC
clr();
W(...DRIVE);
chk('filtre correctement alimenté par le GBF', S.loopOk === true && S.tp2Driven === true);
chk('la réponse théorique du filtre est calculée', near(S.gainDb, -3.01, 0.05), S.gainDb.toFixed(2) + ' dB');
chk('SONDES EN L\'AIR : CH1 n\'affiche rien', S.ch1.ok === false && S.ch1.vpp === 0, S.ch1.why);
chk('SONDES EN L\'AIR : CH2 n\'affiche rien', S.ch2.ok === false && S.ch2.vpp === 0, S.ch2.why);
chk('SONDES EN L\'AIR : aucun gain « mesuré » n\'est inventé', S.gainDbMeas === null);
chk('SONDES EN L\'AIR : l\'élève est prévenu par un toast',
    toasts.some(t => t.m.includes('sonde non raccordée')), toasts.filter(t => t.m.includes('CH')).length + ' rappel(s)');
drawScreen();
chk('l\'écran se dessine quand même (traces plates, pas de plantage)', true);

/* ================================================================== */
console.log('\n  --- 3. une seule sonde raccordée ---');
/* ================================================================== */
clr();
W(...DRIVE, ...PROBE_IN);
chk('CH1 raccordée : elle mesure bien Ve = 6 V crête-à-crête',
    S.ch1.ok === true && near(S.ch1.vpp, S.gbfAmp, 0.05), S.ch1.vpp.toFixed(2) + ' V');
chk('CH2 toujours en l\'air : rien sur la seconde voie', S.ch2.ok === false && S.ch2.vpp === 0, S.ch2.why);
chk('une seule voie : pas de gain mesuré', S.gainDbMeas === null);

/* ================================================================== */
console.log('\n  --- 4. les deux sondes : la mesure devient réelle ---');
/* ================================================================== */
clr();
W(...DRIVE, ...PROBE_IN, ...PROBE_OUT);
chk('les deux voies mesurent', S.ch1.ok === true && S.ch2.ok === true,
    `CH1 ${S.ch1.vpp.toFixed(2)} V · CH2 ${S.ch2.vpp.toFixed(2)} V`);
chk('à fc, CH2 lit Ve/√2 (passe-bas RC)', near(S.ch2.vpp, S.gbfAmp / Math.SQRT2, 0.05),
    S.ch2.vpp.toFixed(3) + ' V');
chk('le gain MESURÉ rejoint le gain théorique (−3,01 dB)',
    S.gainDbMeas !== null && near(S.gainDbMeas, -3.01, 0.05), S.gainDbMeas.toFixed(2) + ' dB');
chk('le déphasage mesuré vaut −45° à fc',
    S.phaseMeas !== null && near(S.phaseMeas * 180 / Math.PI, -45, 1),
    (S.phaseMeas * 180 / Math.PI).toFixed(1) + '°');
chk('le déclenchement est accroché', S.trig.ok === true, 'source ' + S.trig.src);

/* feuille de relevés : la ligne recopiée vient des sondes, pas de la théorie */
hud.openPaper(true);
hud.measurementsTP2[S.tp2Filter].length = 0;
hud.addReadingFromInstruments();
const line = hud.measurementsTP2[S.tp2Filter][0];
/* La ligne recopiée provient des SONDES, quantifiée comme une lecture
   d'écran (0,1 div) : Ve ≈ 6 V, Vs ≈ Ve/√2, G ≈ −3 dB.                */
chk('« Recopier mesure » écrit f, Ve, Vs et le gain (lecture en divisions)',
    !!line && line.f === S.gbfFreq
    && near(parseFloat(line.Ve.replace(',', '.')), 6.0, 0.06)
    && near(parseFloat(line.Vs.replace(',', '.')), S.gbfAmp / Math.SQRT2, 0.06)
    && near(parseFloat(line.gainDb.replace(',', '.')), -3.01, 0.15),
    line ? `f=${line.f} Ve=${line.Ve} Vs=${line.Vs} G=${line.gainDb} dB φ=${line.phi}` : 'aucune ligne');
chk('le point à −3 dB est repéré comme fréquence de coupure', line && line.isFc === true);
hud.measurementsTP2[S.tp2Filter].length = 0;
hud.openPaper(false);

/* ================================================================== */
console.log('\n  --- 5. comportements physiques sanity ---');
/* ================================================================== */
/* GBF éteint : plus rien, même sondes raccordées */
player.toggleGBF();
chk('GBF éteint : les deux voies sont mortes', S.ch1.ok === false && S.ch2.ok === false && S.Vs === 0, S.ch1.why);
player.toggleGBF();

/* pointe et masse sur le même point : 0 V, pas de trace inventée */
clr();
W(...DRIVE, ['OSC_CH1+', 'TP2_IN-'], ['OSC_CH1-', 'TP2_IN-'], ...PROBE_OUT);
chk('pointe et masse au même point : la voie est muette', S.ch1.ok === false && S.ch1.vpp === 0, S.ch1.why);

/* sortie court-circuitée par un fil : le filtre ne délivre plus rien */
clr();
W(...DRIVE, ...PROBE_IN, ...PROBE_OUT, ['TP2_OUT+', 'TP2_IN-']);
chk('sortie court-circuitée : Vs = 0', S.outShorted === true && S.Vs === 0, `Vs = ${S.Vs}`);

/* les deux masses de l'oscilloscope reliées à deux points différents */
clr();
W(...DRIVE, ['OSC_CH1+', 'TP2_IN+'], ['OSC_CH1-', 'TP2_IN-'],
    ['OSC_CH2+', 'TP2_OUT+'], ['OSC_CH2-', 'TP2_OUT+']);
chk('masse de sonde sur un potentiel différent : défaut signalé',
    S.scopeGndShort === true || S.ch2.ok === false,
    `scopeGndShort=${S.scopeGndShort} · CH2 ${S.ch2.why || 'ok'}`);

/* court-circuit franc à la sortie du GBF : protection */
clr();
W(['GBF+', 'GBF-']);
chk('court-circuit du GBF : protection déclenchée', S.gbfShort === true && S.faultShort === true);
clr();

/* ================================================================== */
console.log('\n  --- 6. les trois filtres du fascicule ---');
/* ================================================================== */
const CASES = [
    ['RC', 3288, -3.01, 6 / Math.SQRT2],
    ['CR', 3288, -3.01, 6 / Math.SQRT2],
    ['RC-CR', 1040, -0.83, 5.45]
];
for (const [filter, f, gDb, vOut] of CASES) {
    document.getElementById(filter === 'RC' ? 'tabRC' : filter === 'CR' ? 'tabCR' : 'tabBand').onclick();
    S.gbfFreq = f;
    clr();
    W(...DRIVE, ...PROBE_IN, ...PROBE_OUT);
    chk(`filtre ${filter} à ${f} Hz : gain mesuré = ${gDb} dB`,
        S.gainDbMeas !== null && near(S.gainDbMeas, gDb, 0.08),
        `${S.gainDbMeas === null ? '—' : S.gainDbMeas.toFixed(2) + ' dB'} · CH2 = ${S.ch2.vpp.toFixed(2)} V (attendu ${vOut.toFixed(2)})`);
}

console.log(`\n${pass} réussi(s), ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
