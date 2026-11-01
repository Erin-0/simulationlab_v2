/* =====================================================================
   tests/test_ac_solver.mjs  —  Validation des calculs harmoniques TP 2
   ===================================================================== */
import assert from 'node:assert';
import { S } from '../js/state.js';
import { cutoffFreq, computeFilterResponse, generateBodeCurve } from '../js/ac_solver.js';

console.log('--- Test : Solveur harmonique AC (TP 2) ---');

// 1. Fréquence de coupure théorique RC
const fcRC = cutoffFreq(S.tp2_R1, S.tp2_C1);
console.log(`fc(RC théorique) = ${fcRC.toFixed(1)} Hz (attendu ≈ 3288.4 Hz)`);
assert(Math.abs(fcRC - 3288.4) < 1.0, "La fréquence de coupure du passe-bas RC doit être ~3288 Hz");

// 2. Passe-bas à la fréquence de coupure fc : gain doit valoir -3.01 dB, déphasage -45°
const respRC_fc = computeFilterResponse('RC', fcRC, 6.0);
console.log(`Passe-bas à fc : Gain = ${respRC_fc.gainDb.toFixed(2)} dB, Phase = ${respRC_fc.phaseDeg.toFixed(1)}°`);
assert(Math.abs(respRC_fc.gainDb - (-3.01)) < 0.05, "Le gain à fc doit être de -3.01 dB");
assert(Math.abs(respRC_fc.phaseDeg - (-45.0)) < 0.1, "Le déphasage à fc doit être de -45°");
assert(Math.abs(respRC_fc.Vs - (6.0 / Math.SQRT2)) < 0.05, "Vs à fc doit valoir Ve / sqrt(2)");

// 3. Passe-haut CR à fc : gain doit valoir -3.01 dB, déphasage +45°
const respCR_fc = computeFilterResponse('CR', fcRC, 6.0);
console.log(`Passe-haut à fc : Gain = ${respCR_fc.gainDb.toFixed(2)} dB, Phase = ${respCR_fc.phaseDeg.toFixed(1)}°`);
assert(Math.abs(respCR_fc.gainDb - (-3.01)) < 0.05, "Le gain du CR à fc doit être de -3.01 dB");
assert(Math.abs(respCR_fc.phaseDeg - 45.0) < 0.1, "Le déphasage du CR à fc doit être de +45°");

// 4. Passe-bande : coupure basse fc1 (≈ 329 Hz) et coupure haute fc2 (≈ 3288 Hz)
const fc1 = cutoffFreq(S.tp2_R2, S.tp2_C2);
const fc2 = cutoffFreq(S.tp2_R1, S.tp2_C1);
console.log(`Passe-bande : fc1 = ${fc1.toFixed(1)} Hz, fc2 = ${fc2.toFixed(1)} Hz`);
assert(Math.abs(fc1 - 328.8) < 1.0, "fc1 doit être ~329 Hz");
assert(Math.abs(fc2 - 3288.4) < 1.0, "fc2 doit être ~3288 Hz");

// 5. Génération de courbe de Bode
const curve = generateBodeCurve('RC', 10, 100000, 50);
assert.strictEqual(curve.length, 50, "La courbe de Bode doit contenir 50 points");
assert(curve[0].gainDb > -0.1, "À basse fréquence (10 Hz), le gain passe-bas doit être ~0 dB");
assert(curve[curve.length - 1].gainDb < -25, "À haute fréquence (100 kHz), le gain passe-bas doit chuter (> 25 dB d'atténuation)");

console.log('✓ Tous les calculs harmoniques TP 2 sont validés avec succès !');
