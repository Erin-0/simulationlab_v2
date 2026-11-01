import * as circuit from '../js/circuit.js';
import { S, allTermIds, wires, terminals } from '../js/state.js';

/* Enregistre les bornes sans construire la 3D (harnais headless).
   Dans le jeu, c'est instruments.js -> makeTerminal() qui le fait. */
[['G+','z'],['G-','z'],['A+','z'],['A-','z'],['V+','z'],['V-','z'],
 ['R1','y'],['R2','y'],['RB1','z'],['RB2','z'],['GA+','z'],['GA-','z'],
 ['P+','y'],['P-','y'],['M1','y'],['M2','y']].forEach(([id, axis]) => {
    terminals[id] = { id, axis, label: id, ringMat: { emissiveIntensity: 0 }, owner: null, group: null };
    allTermIds.push(id);
});

circuit.init(wires);
let pass = 0, fail = 0;
const toasts = [];
const refresh = () => {};
const toast = (m, t) => toasts.push([t, m]);

function wire(a, b) { wires.push({ a, b, color: 0, group: null }); }
function reset() { wires.length = 0; toasts.length = 0; }
function ev() { circuit.evaluate(() => {}, refresh); }
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${label} ${extra}`); }
  else { fail++; console.log(`  ✗ ${label} ${extra}`); }
}
console.log('Bornes déclarées :', allTermIds.join(', '));

/* ---------- 1. générateur éteint : rien ne se mesure ---------- */
S.level = 'A'; S.genOn = false; S.setV = 0;
reset(); wire('G+', 'A+'); wire('A-', 'R1'); wire('R2', 'G-'); wire('V+', 'R1'); wire('V-', 'R2');
ev();
check('générateur éteint -> I = 0', Math.abs(S.IA) < 1e-9, `IA=${S.IA}`);
check('générateur éteint -> boucle invalide', S.loopOk === false);
check('générateur éteint -> montage non détecté', S.montage === '—', `(rappel envoyé : ${toasts.length} toast)`);

/* ---------- 2. même câblage, générateur allumé à 5 V ---------- */
S.genOn = true; S.setV = 5;
ev();
const I = 5 / (100 + 1);
check('aval : I ≈ 49,5 mA', Math.abs(S.IA - I) < 1e-6, `IA=${(S.IA*1000).toFixed(3)} mA`);
check('aval : montage détecté', S.montage === 'aval', S.montage);
check('aval : U ≈ 4,95 V', Math.abs(S.UV - I * 100) < 1e-6, `UV=${S.UV.toFixed(4)} V`);
/* En montage AVAL le voltmètre (rV = 10 MΩ) shunte R : c'est exactement la
   sous-estimation étudiée dans le TP -> R mesurée légèrement < 100 Ω. */
const Rmes = S.UV / S.IA;
check('aval : R mesurée ≈ 100 Ω mais sous-estimée (rV en parallèle)',
      Rmes < 100 && Rmes > 99.99, `${Rmes.toFixed(4)} Ω`);
check('aval : erreur relative ≈ R/rV', Math.abs((100 - Rmes)/100 - 100/1e7) < 1e-7);

/* ---------- 3. montage amont ---------- */
reset(); wire('G+', 'A+'); wire('A-', 'R1'); wire('R2', 'G-'); wire('V+', 'A+'); wire('V-', 'R2');
ev();
check('amont : montage détecté', S.montage === 'amont', S.montage);
check('amont : U ≈ 5 V (voltmètre voit rA + R)', Math.abs(S.UV - 5) < 1e-6, `UV=${S.UV.toFixed(4)}`);

/* ---------- 4. court-circuit franc ---------- */
reset(); wire('G+', 'G-');
ev();
check('court-circuit détecté', S.faultShort === true);

/* ---------- 5. surcharge de l'ampèremètre (R court-circuitée) ---------- */
reset(); wire('G+', 'A+'); wire('A-', 'G-');
S.setV = 12; ev();
check('surcharge détectée (I > calibre choisi, 300 mA par défaut)', S.overload === true, `IA=${(S.IA*1000).toFixed(0)} mA`);
check('surcharge -> boucle invalide', S.loopOk === false);

/* ---------- 6a. ampèremètre branché en direct sur le générateur ---------- */
reset(); wire('G+', 'A+'); wire('A-', 'G-');      // quasi court-circuit via rA = 1 Ω
S.setV = 5; ev();
check('ampèremètre en direct -> surcharge', S.overload === true, `IA=${(S.IA*1000).toFixed(0)} mA`);

/* ---------- 6b. vraie boucle ouverte (résistance non refermée) ---------- */
reset(); wire('G+', 'A+'); wire('A-', 'R1');      // R2 jamais ramené à G−
S.setV = 5; ev();
check('boucle ouverte -> I = 0 (à la fuite numérique près)', Math.abs(S.IA) < 1e-7, `IA=${S.IA.toExponential(2)}`);
check('boucle ouverte -> U voltmètre = 0', Math.abs(S.UV) < 1e-9, `UV=${S.UV}`);
check('boucle ouverte -> pas de montage', S.montage === '—');
check('boucle ouverte -> loopOk = false', S.loopOk === false);

/* ---------- 7. Niveau B : pont de Wheatstone ---------- */
S.level = 'B'; S.genOn = true; S.setV = 6;
const Rx = S.Rx;
S.digits = [Math.floor(Rx/1000)%10, Math.floor(Rx/100)%10, Math.floor(Rx/10)%10, Rx%10];
S.Rv = Rx;
reset();
wire('G+', 'P+'); wire('G-', 'P-');            // alimentation du pont
wire('M1', 'RB1'); wire('RB2', 'P-');          // boîte à décades entre M1 et P−
wire('GA+', 'M1'); wire('GA-', 'M2');          // galvanomètre entre M1 et M2
ev();
check('pont alimenté', S.powered === true);
check('boîte à décades insérée', S.boxIn === true);
check('galvanomètre branché', S.galvoConn === true);
check('pont équilibré quand Rv = Rx', S.balanced === true, `Rv=${S.Rv} Rx=${Rx}`);
check('Vg ≈ 0 à l\'équilibre', Math.abs(S.Vg) < 1e-6, `Vg=${(S.Vg*1000).toFixed(4)} mV`);

/* déséquilibre */
S.Rv = Rx + 300; S.digits = [0,0,0,0];
ev();
check('pont déséquilibré -> non équilibré', S.balanced === false);
check('Vg ≠ 0 quand Rv ≠ Rx', Math.abs(S.Vg) > 1e-4, `Vg=${(S.Vg*1000).toFixed(2)} mV`);

/* générateur éteint au niveau B */
S.genOn = false; ev();
check('niveau B : générateur éteint -> pas d\'équilibre', S.balanced === false);
check('niveau B : Vg = 0 sans alimentation', Math.abs(S.Vg) < 1e-9);

/* ---------- 8. resetGeneratorState ---------- */
S.genOn = true; S.setV = 9;
circuit.resetGeneratorState();
check('resetGeneratorState : GEN OFF et 0 V', S.genOn === false && S.setV === 0);

/* ---------- 9. objectifs ---------- */
S.level = 'A'; S.genOn = false;
check('objectif A1 non validé générateur éteint', circuit.missionsDef.A[0].test() === false);
S.genOn = true;
check('objectif A1 validé générateur allumé', circuit.missionsDef.A[0].test() === true);

console.log(`\n${pass} réussi(s), ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
