/* =====================================================================
   tests/test_tp3_solver.mjs — TP 3 : vérification des théorèmes
   électrocinétiques (fascicule p. 7 à 9, compte rendu p. 16).

   On rejoue INTÉGRALEMENT les cinq manipulations avec le vrai main.js,
   le vrai solveur continu (MNA) et les vrais organes de réglage :

     1. V₀ (tension à vide) et I₀ (courant de court-circuit) ;
     2. Millman : V_M puis I_R mesuré, comparé à V_M / R ;
     3. Superposition : I₁, I₂ puis I_total = I₁ + I₂ ;
     4. Thévenin : E_Th = V₀, R_Th = V₀/I₀ réglé au rhéostat, I_Th ;
     5. Norton  : I_No = I₀ en mode CC, R_No en parallèle, I dans R.

   S'y ajoutent les garde-fous physiques (alimentation éteinte = circuit
   OUVERT, court-circuit, surcharge de l'ampèremètre, rhéostat qui chauffe,
   tension de conformité) et la feuille de relevés (table 9).

   Les valeurs attendues sont calculées à la main :
     V₀ = 8,2979 V · I₀ = 74,713 mA · R_Th = R_No = 111,06 Ω
     V_M = 4,7677 V · I_R = 31,785 mA · I₁ = 17,604 mA · I₂ = 14,181 mA
   (les valeurs LUES diffèrent légèrement : le voltmètre tire 10 MΩ et
   l'ampèremètre 1 Ω — c'est justement ce que vérifie l'élève.)
   ===================================================================== */
import { install } from './domstub.mjs';
install();
import * as THREE from 'three';
await import('../js/main.js');

const state = await import('../js/state.js');
const circuit = await import('../js/circuit.js');
const solver = await import('../js/tp3_solver.js');
const player = await import('../js/player.js');
const hud = await import('../js/hud.js');
const displays = await import('../js/displays.js');

const { S, ctx, wires, METER_NDIV } = state;

let pass = 0, fail = 0;
const chk = (l, c, x = '') => { c ? (pass++, console.log('  ✓', l, x)) : (fail++, console.log('  ✗', l, x)); };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
const mA = (i) => (i * 1000).toFixed(2) + ' mA';

/* ---- appareils à aiguille : en headless, rien n'anime les ressorts.
   syncNeedles() cale les aiguilles sur leur cible — l'élève attend la
   stabilisation avant de lire, le test fait pareil.                    ---- */
const syncNeedles = () => {
    displays.updateDisplays();
    ctx.voltPivot.userData.div = ctx.voltPivot.userData.divTarget;
    ctx.ammPivot.userData.div = ctx.ammPivot.userData.divTarget;
};

/* ---- câblage : on pousse directement dans le registre des fils ---- */
const toasts = [];
const say = (m, t) => toasts.push({ m: String(m), t: t || 'info' });
const ev = () => circuit.evaluate(say, () => { });
const clr = () => { wires.length = 0; };
/* chaque fil reçoit un vrai groupe (factice) : clearWires() doit pouvoir les
   retirer proprement, comme dans le jeu */
const W = (...pairs) => {
    pairs.forEach(([a, b]) => wires.push({ a, b, color: 0x22d3ee, group: new THREE.Group() }));
    ev();
};
/* allume/éteint les deux alimentations avec les VRAIS interrupteurs */
const setSup = (on1, on2) => {
    if (S.tp3.on1 !== on1) player.toggleSupply(1);
    if (S.tp3.on2 !== on2) player.toggleSupply(2);
};
const tab = (n) => document.getElementById('tabT3_' + n).onclick();
const knob = (kind, dir, mode) => player.adjustControl(kind, dir, mode || 'click');

/* les trois branches du circuit de base (fascicule p. 7) */
const BR1 = [['A1', 'R1a'], ['R1b', 'E1+'], ['E1-', 'B1']];   // E1 + R1 entre A et B
const BR2 = [['A2', 'R2a'], ['R2b', 'E2+'], ['E2-', 'B2']];   // E2 + R2 entre A et B
const BRR = [['A3', 'RLa'], ['RLb', 'B3']];                   // branche R entre A et B

/* ================================================================== */
console.log('\n  --- 1. solveur continu générique (MNA) ---');
/* ================================================================== */
{
    /* E = 12 V aux bornes de R = 120 Ω : I = 100 mA */
    const s1 = solver.solveDC(['n1', 'n2'], [{ a: 'n1', b: 'n2', R: 120 }],
        [{ a: 'n2', b: 'n1', E: 12 }], []);
    /* la fuite numérique vers la masse (1 nS) explique l'écart de ~1e-7 */
    chk('loi d\'Ohm : 12 V / 120 Ω = 100 mA', s1.ok && near(Math.abs(s1.i[0]), 0.1, 1e-6),
        s1.ok ? mA(s1.i[0]) : 'échec du solveur');

    /* deux résistances en série : pont diviseur */
    const s2 = solver.solveDC(['a', 'b', 'c'],
        [{ a: 'a', b: 'b', R: 100 }, { a: 'b', b: 'c', R: 300 }],
        [{ a: 'c', b: 'a', E: 8 }], []);
    chk('pont diviseur : V(b) = 6 V sur 8 V (100 Ω / 400 Ω)',
        s2.ok && near(s2.v.b - s2.v.c, 6, 1e-6), s2.ok ? (s2.v.b - s2.v.c).toFixed(4) + ' V' : '');

    /* source de courant 50 mA dans 200 Ω : U = 10 V */
    const s3 = solver.solveDC(['p', 'q'], [{ a: 'p', b: 'q', R: 200 }], [],
        [{ a: 'q', b: 'p', I: 0.05 }]);
    chk('source de courant : 50 mA dans 200 Ω = 10 V', s3.ok && near(s3.v.p - s3.v.q, 10, 1e-6),
        s3.ok ? (s3.v.p - s3.v.q).toFixed(4) + ' V' : '');
}

/* ================================================================== */
console.log('\n  --- 2. valeurs théoriques du circuit de base ---');
/* ================================================================== */
const T = solver.theoryTP3();
chk('V₀ = (E₁G₁+E₂G₂)/(G₁+G₂) = 8,2979 V', near(T.V0, 8.297872, 1e-5), T.V0.toFixed(6) + ' V');
chk('I₀ = E₁G₁+E₂G₂ = 74,713 mA', near(T.I0, 0.07471264, 1e-8), mA(T.I0));
chk('R_Th = R₁//R₂ = 111,06 Ω', near(T.RTh, 111.0638, 1e-3), T.RTh.toFixed(3) + ' Ω');
chk('R_No = R_Th', T.RNo === T.RTh);
chk('V_M (Millman) = 4,7677 V', near(T.VM, 4.767726, 1e-5), T.VM.toFixed(6) + ' V');
chk('I_R = V_M / R = 31,785 mA', near(T.IR, 0.03178484, 1e-8), mA(T.IR));
chk('I₁ (E₂ court-circuité) = 17,604 mA', near(T.I1, 0.01760391, 1e-8), mA(T.I1));
chk('I₂ (E₁ court-circuité) = 14,181 mA', near(T.I2, 0.01418093, 1e-8), mA(T.I2));
chk('superposition : I₁ + I₂ = I_R', near(T.I1 + T.I2, T.IR, 1e-12), mA(T.I1 + T.I2));
chk('Thévenin et Norton redonnent I_R dans R',
    near(T.ITh, T.IR, 1e-12) && near(T.INo, T.IR, 1e-12),
    `I_Th = ${mA(T.ITh)} · I_No = ${mA(T.INo)}`);

const U = solver.uncertaintiesTP3();
chk('incertitudes propagées : toutes positives', Object.values(U).every(v => v > 0),
    `ΔV₀ = ${U.dV0.toFixed(3)} V · ΔI₀ = ${(U.dI0 * 1000).toFixed(3)} mA · ΔR_Th = ${U.dRTh.toFixed(2)} Ω`);
chk('ΔV₀ reste raisonnable (quelques % de V₀)',
    U.dV0 / T.V0 > 0.01 && U.dV0 / T.V0 < 0.15, ((U.dV0 / T.V0) * 100).toFixed(1) + ' %');

/* ================================================================== */
console.log('\n  --- 3. bascule sur le TP 3 ---');
/* ================================================================== */
document.getElementById('btnTP3').onclick();
chk('TP 3 actif, banc affiché', S.activeTP === 3 && ctx.groupTP3.visible === true);
chk('objectifs des cinq manipulations enregistrés',
    ['TP3_1', 'TP3_2', 'TP3_3', 'TP3_4', 'TP3_5'].every(k => Array.isArray(circuit.missionsDef[k])),
    circuit.missionsDef.TP3_1.length + ' objectifs en manip 1');
chk('les deux alimentations sont livrées ÉTEINTES', S.tp3.on1 === false && S.tp3.on2 === false);

/* ================================================================== */
console.log('\n  --- 4. manipulation 1 : V₀ puis I₀ (branche R retirée) ---');
/* ================================================================== */
player.toggleSupply(1); player.toggleSupply(2);
clr();
W(...BR1, ...BR2, ['V+', 'A4'], ['V-', 'B4']);
chk('manip 1 : topologie détectée (R retirée, voltmètre entre A et B)',
    S.tp3.topo.Rout === true && S.tp3.topo.vAB === true && S.tp3.topo.Rin === false);
chk('manip 1 : le voltmètre lit V₀ = 8,30 V', near(S.UV, T.V0, 0.002), S.UV.toFixed(4) + ' V');
chk('manip 1 : V₀ mémorisé', near(S.tp3.meas.V0, T.V0, 0.002), S.tp3.meas.V0.toFixed(4) + ' V');

/* la feuille de relevés : « Recopier mesure » écrit la ligne V₀.
   L'élève a d'abord choisi le plus grand calibre compatible : 10 V
   (la valeur attendue ≈ 8,3 V ne passe pas sur le calibre 3 V).       */
S.voltCal = 3; S.ammCal = 3;
displays.updateMetersCal();
chk('sélecteur de calibre : la position suit le calibre choisi',
    near(ctx.voltSel.rotation.z, (2 - S.voltCal) * Math.PI / 3, 1e-12),
    ctx.voltSel.rotation.z.toFixed(3) + ' rad');
syncNeedles();
hud.openPaper(true);
hud.renderTable();
hud.addReadingFromInstruments();
chk('manip 1 : « Recopier mesure » écrit V₀ sur la table 9',
    hud.measurementsTP3.V0.valeur === '8,30', hud.measurementsTP3.V0.valeur);
chk('manip 1 : l\'incertitude reste à écrire à la main',
    hud.measurementsTP3.V0.incert === '');
chk('manip 1 : aucune valeur théorique n\'est affichée sur la feuille',
    !document.getElementById('cahierBody').innerHTML.includes(T.V0.toFixed(4)));
hud.openPaper(false);

/* I₀ : l'ampèremètre entre A et B (R toujours retirée) */
clr();
W(...BR1, ...BR2, ['A+', 'A4'], ['A-', 'B4']);
chk('manip 1 : ampèremètre détecté entre A et B', S.tp3.topo.aAB === true);
chk('manip 1 : I₀ lu ≈ 74,05 mA (l\'ampèremètre ajoute 1 Ω)',
    near(S.IA * 1000, 74.046, 0.05), mA(S.IA));
chk('manip 1 : I₀ mémorisé', near(S.tp3.meas.I0, S.IA, 1e-9));
chk('manip 1 : pas de surcharge (calibre 100 mA)', S.overload === false);
/* l'élève reporte V₀ et I₀ sur sa feuille, avec les incertitudes */
hud.openPaper(true); hud.renderTable();
syncNeedles();
hud.addReadingFromInstruments();                       // I₀ recopié depuis l'ampèremètre
hud.measurementsTP3.V0.incert = '0,28';
hud.measurementsTP3.I0.incert = '0,0004';
hud.updateTP3ReportFlags();
const m1 = hud.missionStates('TP3_1').states;
chk('manip 1 : « Recopier mesure » écrit I₀ (et jamais une ligne de calcul)',
    hud.measurementsTP3.I0.valeur === '0,0740' && hud.measurementsTP3.V0.valeur === '8,30',
    `V₀ = ${hud.measurementsTP3.V0.valeur} · I₀ = ${hud.measurementsTP3.I0.valeur}`);
chk('manip 1 : les cinq objectifs sont remplis', m1.every(Boolean),
    m1.map((b, i) => `${i + 1}:${b ? 'ok' : 'KO'}`).join(' '));
hud.openPaper(false);

/* ================================================================== */
console.log('\n  --- 5. manipulation 2 : théorème de Millman ---');
/* ================================================================== */
tab(2);
chk('manip 2 : le banc repart éteint et décâblé', S.tp3.on1 === false && wires.length === 0);
chk('manip 2 : les mesures précédentes sont CONSERVÉES',
    S.tp3.meas.V0 !== null && S.tp3.meas.I0 !== null);
setSup(true, true);
clr();
W(...BR1, ...BR2, ...BRR, ['V+', 'RLa'], ['V-', 'RLb']);
chk('manip 2 : branche R en place, voltmètre à ses bornes',
    S.tp3.topo.Rin === true && S.tp3.topo.vR === true);
chk('manip 2 : V_M lu = 4,768 V', near(S.UV, T.VM, 0.002), S.UV.toFixed(4) + ' V');
chk('manip 2 : V_M mémorisé', near(S.tp3.meas.VM, T.VM, 0.002));

/* ampèremètre en SÉRIE dans la branche R (il ajoute son 1 Ω : 31,66 mA) */
clr();
W(...BR1, ...BR2, ['A3', 'A+'], ['A-', 'RLa'], ['RLb', 'B3'], ['V+', 'RLa'], ['V-', 'RLb']);
chk('manip 2 : I_R mesuré = 31,66 mA', near(S.IA * 1000, 31.659, 0.05), mA(S.IA));
chk('manip 2 : I_R mémorisé', near(S.tp3.meas.IR, S.IA, 1e-9));
chk('manip 2 : I_R mesuré ≈ V_M / R (à 2 % près)',
    Math.abs(S.tp3.meas.IR - S.tp3.meas.VM / S.tp3.RL) <= 0.02 * (S.tp3.meas.VM / S.tp3.RL),
    `${mA(S.tp3.meas.IR)} contre ${(S.tp3.meas.VM / S.tp3.RL * 1000).toFixed(2)} mA calculés`);

/* un ampèremètre branché en PARALLÈLE sur R ne doit pas être pris pour I_R */
const IRavant = S.tp3.meas.IR;
clr();
W(...BR1, ...BR2, ...BRR, ['A+', 'RLa'], ['A-', 'RLb']);
chk('ampèremètre en PARALLÈLE sur R : lecture très différente, I_R non écrasé',
    near(S.tp3.meas.IR, IRavant, 1e-9) && Math.abs(S.IA - IRavant) > 0.02,
    `l'ampèremètre lit ${mA(S.IA)} alors que I_R = ${mA(S.tp3.meas.IR)}`);

/* report sur la feuille : V_M, I_R calculé, I_R mesuré */
hud.openPaper(true); hud.renderTable();
hud.measurementsTP3.VM.valeur = '4,77'; hud.measurementsTP3.VM.incert = '0,15';
hud.measurementsTP3.IRcalc.valeur = '0,0318'; hud.measurementsTP3.IRcalc.incert = '0,0010';
hud.measurementsTP3.IR.valeur = '0,0317'; hud.measurementsTP3.IR.incert = '0,0010';
hud.updateTP3ReportFlags();
const m2 = hud.missionStates('TP3_2').states;
chk('manip 2 : les six objectifs sont remplis', m2.every(Boolean),
    m2.map((b, i) => `${i + 1}:${b ? 'ok' : 'KO'}`).join(' '));
hud.openPaper(false);

/* ================================================================== */
console.log('\n  --- 6. manipulation 3 : théorème de superposition ---');
/* ================================================================== */
tab(3);
/* les rappels ne doivent pas tomber avant que l'élève ait commencé */
const affiches = () => [...document.getElementById('toasts').children].map(c => c.innerHTML);
chk('banc au repos (tout éteint, rien de câblé) : aucun rappel « branche ouverte »',
    !affiches().some(t => t.includes('OUVERTE')), affiches().length + ' message(s) affiché(s)');
setSup(true, false);
chk('E₁ seul en service : rappel « E₂ éteint = branche OUVERTE, mettez un fil »',
    affiches().some(t => t.includes('E2 est éteint')));

/* E₁ seul : E₂ éteint et remplacé par un fil entre ses bornes */
clr();
W(...BR1, ['A2', 'R2a'], ['R2b', 'E2+'], ['E2+', 'E2-'], ['E2-', 'B2'],
    ['A3', 'A+'], ['A-', 'RLa'], ['RLb', 'B3']);
chk('manip 3 : E₂ « remplacé par un fil » détecté', S.tp3.topo.e2Short === true && S.faultShort === false);
chk('manip 3 : I₁ = 17,54 mA', near(S.IA * 1000, 17.545, 0.05), mA(S.IA));
chk('manip 3 : I₁ mémorisé', near(S.tp3.meas.I1, S.IA, 1e-9));
const m3a = hud.missionStates('TP3_3').states;
chk('manip 3 : objectifs « E₁ seul » et « mesurer I₁ » acquis', m3a[0] && m3a[1],
    m3a.slice(0, 2).map((b, i) => `${i + 1}:${b ? 'ok' : 'KO'}`).join(' '));

/* E₂ seul : E₁ éteint et remplacé par un fil */
setSup(false, true);
clr();
W(['A1', 'R1a'], ['R1b', 'E1+'], ['E1+', 'E1-'], ['E1-', 'B1'], ...BR2,
    ['A3', 'A+'], ['A-', 'RLa'], ['RLb', 'B3']);
chk('manip 3 : E₁ « remplacé par un fil » détecté', S.tp3.topo.e1Short === true);
chk('manip 3 : I₂ = 14,13 mA', near(S.IA * 1000, 14.128, 0.05), mA(S.IA));
chk('manip 3 : I₂ mémorisé', near(S.tp3.meas.I2, S.IA, 1e-9));
const m3b = hud.missionStates('TP3_3').states;
chk('manip 3 : objectifs « E₂ seul » et « mesurer I₂ » acquis', m3b[2] && m3b[3],
    m3b.slice(2, 4).map((b, i) => `${i + 3}:${b ? 'ok' : 'KO'}`).join(' '));

/* les deux générateurs ensemble */
setSup(true, true);
clr();
W(...BR1, ...BR2, ['A3', 'A+'], ['A-', 'RLa'], ['RLb', 'B3']);
chk('manip 3 : I_total = 31,66 mA', near(S.IA * 1000, 31.659, 0.05), mA(S.IA));
chk('manip 3 : I_total mémorisé', near(S.tp3.meas.Itot, S.IA, 1e-9));
chk('manip 3 : I_total = I₁ + I₂ (à 3 % près)',
    Math.abs(S.tp3.meas.Itot - (S.tp3.meas.I1 + S.tp3.meas.I2))
    <= 0.03 * Math.abs(S.tp3.meas.I1 + S.tp3.meas.I2),
    `${mA(S.tp3.meas.Itot)} contre ${mA(S.tp3.meas.I1 + S.tp3.meas.I2)}`);

hud.openPaper(true);
hud.measurementsTP3.I1.valeur = '0,0175'; hud.measurementsTP3.I1.incert = '0,0005';
hud.measurementsTP3.I2.valeur = '0,0141'; hud.measurementsTP3.I2.incert = '0,0005';
hud.measurementsTP3.Itot.valeur = '0,0317'; hud.measurementsTP3.Itot.incert = '0,0010';
hud.updateTP3ReportFlags();
const m3 = hud.missionStates('TP3_3').states;
chk('manip 3 : les sept objectifs restent acquis (états transitoires conservés)',
    m3.every(Boolean),
    m3.map((b, i) => `${i + 1}:${b ? 'ok' : 'KO'}`).join(' '));
hud.openPaper(false);

/* un générateur ÉTEINT sans fil de remplacement = branche ouverte */
setSup(true, false);
clr();
W(...BR1, ...BRR, ['V+', 'A4'], ['V-', 'B4']);
chk('générateur éteint et débranché : sa branche est OUVERTE (pas un court-circuit)',
    S.tp3.topo.e2Open === true && S.tp3.topo.e2Short === false,
    `e2Open=${S.tp3.topo.e2Open} · e2Short=${S.tp3.topo.e2Short}`);
chk('branche E₂ ouverte : V_AB = E₁ · R/(R₁+R) = 4,09 V',
    near(S.UV, 12 * 150 / (290 + 150), 0.02), S.UV.toFixed(3) + ' V');


/* ================================================================== */
console.log('\n  --- 7. manipulation 4 : théorème de Thévenin ---');
/* ================================================================== */
tab(4);
player.toggleSupply(1);
/* on règle E_Th = V₀ avec les vrais boutons (pas grossier puis fin) */
knob('knobE1V', -1, 'shift'); knob('knobE1V', -1, 'shift');
knob('knobE1V', +1, 'wheel'); knob('knobE1V', +1, 'wheel'); knob('knobE1V', +1, 'wheel');
chk('manip 4 : E_Th réglé sur 8,3 V', near(S.tp3.E1, 8.3, 1e-9), S.tp3.E1.toFixed(1) + ' V');
/* rhéostat sur R_Th = V₀ / I₀ = 112,06 Ω (d'après les mesures de l'élève) */
for (let i = 0; i < 11; i++) knob('knobRheo', +1, 'shift');
knob('knobRheo', +1); knob('knobRheo', +1);
chk('manip 4 : rhéostat réglé sur 112 Ω', near(S.tp3.rheo, 112, 1e-9), S.tp3.rheo + ' Ω');

clr();
W(['E1+', 'RHA'], ['RHW', 'A1'], ['A2', 'A+'], ['A-', 'RLa'], ['RLb', 'B1'], ['B2', 'E1-']);
const th = solver.theoChecks();
chk('manip 4 : montage équivalent reconnu (E_Th → R_Th → R en série)', th.built === true,
    `prêt=${th.ready} 1gen=${th.oneGen} U=${th.voltageOk} Rh=${th.rheoOk} série=${th.seriesOk} propre=${th.cleanOk}`);
chk('manip 4 : rhéostat bien en SÉRIE dans la boucle', S.tp3.topo.rheoSeries === true);
chk('manip 4 : R₁ et R₂ ne sont plus parcourus', S.tp3.topo.r12Idle === true);
chk('manip 4 : I_Th = 31,56 mA', near(S.IA * 1000, 31.559, 0.1), mA(S.IA));
chk('manip 4 : R_Th = V₀ / I₀ mémorisé d\'après les MESURES de l\'élève',
    near(S.tp3.meas.RTh, S.tp3.meas.V0 / S.tp3.meas.I0, 1e-6), S.tp3.meas.RTh.toFixed(2) + ' Ω');
chk('manip 4 : I_Th mémorisé', near(S.tp3.meas.ITh, S.IA, 1e-9));
chk('manip 4 : I_Th retrouvé à 5 % près du I_R du circuit réel', th.verified === true,
    `${mA(S.tp3.IR)} contre ${mA(S.tp3.IRref)} mesurés en manip 2`);
/* report sur la feuille : R_Th calculé et I_Th mesuré */
hud.openPaper(true);
hud.measurementsTP3.RTh.valeur = '112,1'; hud.measurementsTP3.RTh.incert = '5,6';
hud.measurementsTP3.ITh.valeur = '0,0316'; hud.measurementsTP3.ITh.incert = '0,0010';
hud.updateTP3ReportFlags();
hud.openPaper(false);
const m4 = hud.missionStates('TP3_4').states;
chk('manip 4 : les six objectifs sont remplis', m4.every(Boolean),
    m4.map((b, i) => `${i + 1}:${b ? 'ok' : 'KO'}`).join(' '));

/* ================================================================== */
console.log('\n  --- 8. manipulation 5 : théorème de Norton ---');
/* ================================================================== */
tab(5);
player.toggleSupply(1);
knob('knobE1I', -1, 'wheel');            // 75 mA -> 74 mA ≈ I₀ mesuré
player.toggleSupplyMode(1);               // passage en mode COURANT (CC)
chk('manip 5 : E₁ en mode CC, consigne 74 mA', S.tp3.cc1 === true && near(S.tp3.i1, 0.074, 1e-9),
    (S.tp3.i1 * 1000).toFixed(0) + ' mA');
clr();
W(['E1+', 'A1'], ['E1-', 'B1'], ['RHA', 'A2'], ['RHW', 'B2'],
    ['A3', 'A+'], ['A-', 'RLa'], ['RLb', 'B3']);
const no = solver.nortonChecks();
chk('manip 5 : montage de Norton reconnu (I_No // R_No // R)', no.built === true,
    `prêt=${no.ready} 1CC=${no.oneCC} I=${no.currentOk} Rh=${no.rheoOk} parallèle=${no.parallelOk} propre=${no.cleanOk}`);
chk('manip 5 : rhéostat détecté en PARALLÈLE entre A et B', S.tp3.topo.rheoParallel === true);
chk('manip 5 : I_No = 31,51 mA dans R', near(S.IA * 1000, 31.513, 0.15), mA(S.IA));
chk('manip 5 : R_No = R_Th mémorisé', near(S.tp3.meas.RNo, S.tp3.meas.RTh, 1e-9),
    S.tp3.meas.RNo.toFixed(2) + ' Ω');
chk('manip 5 : I_No mémorisé', near(S.tp3.meas.INo, S.IA, 1e-9));
chk('manip 5 : courant retrouvé à 5 % près du I_R du circuit réel', no.verified === true,
    `${mA(S.tp3.IR)} contre ${mA(S.tp3.IRref)}`);
/* report sur la feuille : R_No et I_No */
hud.openPaper(true);
hud.measurementsTP3.RNo.valeur = '112,1'; hud.measurementsTP3.RNo.incert = '5,6';
hud.measurementsTP3.INo.valeur = '0,0315'; hud.measurementsTP3.INo.incert = '0,0010';
hud.updateTP3ReportFlags();
hud.openPaper(false);
const m5 = hud.missionStates('TP3_5').states;
chk('manip 5 : les six objectifs sont remplis', m5.every(Boolean),
    m5.map((b, i) => `${i + 1}:${b ? 'ok' : 'KO'}`).join(' '));

/* ================================================================== */
console.log('\n  --- 9. garde-fous physiques ---');
/* ================================================================== */
/* alimentation ÉTEINTE = circuit ouvert (relais), jamais un court-circuit */
player.toggleSupply(1);                    // E1 OFF
clr();
W(...BR1, ...BR2, ...BRR, ['A+', 'A4'], ['A-', 'B4']);
chk('alimentations éteintes : aucun courant ne circule',
    Math.abs(S.IA) < 1e-12 && S.loopOk === false && S.faultShort === false, mA(S.IA));

/* court-circuit aux bornes d'un générateur allumé : protection */
player.toggleSupply(1);
clr();
W(['E1+', 'E1-'], ...BR1, ...BRR);
chk('court-circuit aux bornes de E₁ : protection déclenchée', S.faultShort === true);
chk('court-circuit : les générateurs sont coupés (rien ne chauffe)', Math.abs(S.tp3.IE1) < 1e-12);

/* A et B reliés par un fil : court-circuit du réseau */
clr();
W(...BR1, ...BR2, ...BRR, ['A4', 'B4']);
chk('A et B reliés par un fil : court-circuit signalé', S.abShort === true);

/* surcharge de l'ampèremètre : le SEUIL SUIT LE CALIBRE choisi */
S.tp3.i1 = 0.3; S.tp3.cc1 = true;
S.ammCal = 3;                                   // calibre 100 mA
clr();
W(['E1+', 'A+'], ['A-', 'E1-']);
chk('300 mA sur calibre 100 mA : surcharge détectée', S.overload === true && near(S.IA, 0.3, 1e-9), mA(S.IA));
displays.updateDisplays();
chk('surcharge : l\'aiguille bute en fin de course et le voyant OL s\'allume',
    near(ctx.ammPivot.userData.divTarget, METER_NDIV * 1.06, 1e-6) && ctx.ammOL.emissiveIntensity > 0,
    'div cible = ' + ctx.ammPivot.userData.divTarget.toFixed(1));
S.ammCal = 4;                                   // calibre 300 mA : plein échelle exact
clr();
W(['E1+', 'A+'], ['A-', 'E1-']);
chk('mêmes 300 mA sur calibre 300 mA : plein échelle, PAS de surcharge', S.overload === false);
S.tp3.i1 = 0.075; S.tp3.cc1 = false;

/* le rhéostat chauffe au-delà de 90 % de son courant maximal (1,5 A) */
S.tp3.i1 = 1.5; S.tp3.cc1 = true; S.tp3.rheo = 0;
clr();
W(['E1+', 'RHA'], ['RHW', 'E1-']);
chk('rhéostat à 1,5 A : alarme de surintensité', S.rheoOver === true && near(S.tp3.Irheo, 1.5, 0.02),
    S.tp3.Irheo.toFixed(2) + ' A');

/* mode CC à vide : la tension de conformité est dépassée */
clr(); ev();                               // rien de branché : le générateur CC débite à vide
chk('générateur CC à vide : tension de conformité dépassée', S.tp3Saturated === true,
    'V = ' + S.tp3.VE1.toExponential(1) + ' V');
S.tp3.i1 = 0.075; S.tp3.cc1 = false;

/* limitation de courant : l'alimentation bascule toute seule en mode CC */
S.tp3.rheo = 0;
clr();
W(['E1+', 'RHA'], ['RHW', 'E1-']);         // 12 V sur 0,05 Ω : la demande dépasse 75 mA
chk("dépassement de la consigne : l'alimentation bascule d'elle-même en CC",
    S.tp3.cc1 === true && S.tp3.autoCC === 1 && near(S.tp3.IE1, S.tp3.i1, 1e-6),
    `E₁ en CC à ${(S.tp3.IE1 * 1000).toFixed(1)} mA`);

/* ================================================================== */
console.log('\n  --- 10. feuille de relevés du TP 3 (table 9) ---');
/* ================================================================== */
tab(1);
hud.openPaper(true);
hud.renderTable();
chk('table 9 : 12 grandeurs imprimées, 24 cases à remplir',
    hud.TP3_ROWS.length === 12
    && (document.getElementById('cahierBody').innerHTML.match(/data-k=/g) || []).length === 24);
const t9html = document.getElementById('cahierBody').innerHTML;
chk('table 9 : les cinq manipulations sont titrées',
    (t9html.match(/manip-head/g) || []).length === 5 && hud.TP3_TITLES[5].includes('Norton'));
chk('table 9 : le formulaire n\'accepte pas de ligne supplémentaire',
    (hud.addBlankRow(false), document.getElementById('cahierBody').innerHTML.includes('data-k="V0"')));

/* contrôles de calcul : uniquement avec les mesures de l'élève */
hud.measurementsTP3.V0.valeur = '8,30'; hud.measurementsTP3.V0.incert = '0,28';
hud.measurementsTP3.I0.valeur = '0,0740'; hud.measurementsTP3.I0.incert = '0,0004';
document.getElementById('inpRthCalc').value = '112,2';
hud.checkRthCalc();
chk('contrôle R_Th : 8,30 / 0,0740 accepté',
    document.getElementById('rthVerdict').className.includes('ok'),
    document.getElementById('rthVerdict').textContent);
document.getElementById('inpRthCalc').value = '112162';
hud.checkRthCalc();
chk('contrôle R_Th : erreur d\'unité (mA au lieu de A) signalée',
    document.getElementById('rthVerdict').className.includes('ko')
    && document.getElementById('rthVerdict').textContent.includes('AMPÈRES'),
    document.getElementById('rthVerdict').textContent);
document.getElementById('inpRthCalc').value = '55';
hud.checkRthCalc();
chk('contrôle R_Th : résultat faux refusé sans donner la théorie',
    document.getElementById('rthVerdict').className.includes('ko')
    && !document.getElementById('rthVerdict').textContent.includes(T.RTh.toFixed(1)));
document.getElementById('inpIncCalc').value = U.dV0.toFixed(3).replace('.', ',');
hud.checkIncCalc();
chk('contrôle ΔV₀ : incertitude propagée acceptée',
    document.getElementById('incVerdict').className.includes('ok'),
    document.getElementById('incVerdict').textContent);
document.getElementById('inpIncCalc').value = '0,001';
hud.checkIncCalc();
chk('contrôle ΔV₀ : incertitude trop petite refusée',
    document.getElementById('incVerdict').className.includes('ko')
    && document.getElementById('incVerdict').textContent.includes('Trop petite'));

/* objectifs de report sur la feuille */
hud.updateTP3ReportFlags();
chk('report sur la feuille : V₀ et I₀ avec incertitudes -> objectifs validés',
    S.tp3.recV0 === true && S.tp3.recI0 === true);
hud.measurementsTP3.I0.incert = '';
hud.updateTP3ReportFlags();
chk('report sur la feuille : sans incertitude, I₀ n\'est pas validé', S.tp3.recI0 === false);

/* nouvelle feuille : pile séparée du TP 3 */
hud.measurementsTP3.I0.incert = '0,0004';
hud.updateTP3ReportFlags();
hud.newSheet();
chk('nouvelle feuille : table 9 remise à blanc', hud.measurementsTP3.V0.valeur === '' && S.tp3.recV0 === false);
chk('nouvelle feuille : l\'ancienne est conservée', hud.sheetsTP3.length === 1);
hud.prevSheet();
chk('feuille précédente : la table 9 est restaurée',
    hud.measurementsTP3.V0.valeur === '8,30' && hud.sheetsTP3.length === 0);

/* export CSV */
globalThis.URL.createObjectURL = () => 'blob:harness';
globalThis.URL.revokeObjectURL = () => { };
let csvOk = true;
try { hud.exportCSV(); } catch (e) { csvOk = false; console.log('      (' + e.message + ')'); }
chk('export CSV du TP 3 possible', csvOk && typeof hud.exportCSV === 'function');

hud.clearTP3Table();
chk('« Tout effacer » vide la table 9',
    hud.TP3_ROWS.every(r => !hud.measurementsTP3[r.key].valeur) && S.tp3.recV0 === false);
hud.openPaper(false);

/* ================================================================== */
console.log('\n  --- 11. afficheurs et organes mobiles du TP 3 ---');
/* ================================================================== */
setSup(true, false);
S.tp3.cc1 = false; S.tp3.E1 = 12; S.tp3.rheo = 0;
displays.updateDisplays();
chk('E₁ allumé en CV : voyant CV allumé, voyant CC éteint',
    ctx.e1CV.emissiveIntensity > 0 && ctx.e1CC.emissiveIntensity === 0);
chk('E₂ éteint : ses deux voyants sont éteints',
    ctx.e2CV.emissiveIntensity === 0 && ctx.e2CC.emissiveIntensity === 0);
const z12 = ctx.e1Knob.rotation.z;
S.tp3.E1 = 8.3; displays.updateDisplays();
chk('le bouton de tension suit la consigne', ctx.e1Knob.rotation.z !== z12,
    `${(z12 * 180 / Math.PI).toFixed(0)}° -> ${(ctx.e1Knob.rotation.z * 180 / Math.PI).toFixed(0)}°`);
S.tp3.cc1 = true; displays.updateDisplays();
chk('passage en CC : le voyant rouge prend le relais',
    ctx.e1CC.emissiveIntensity > 0 && ctx.e1CV.emissiveIntensity === 0);
S.tp3.cc1 = false;

/* curseur du rhéostat : course −13 cm … +13 cm */
S.tp3.rheo = 0; displays.updateDisplays();
const x0 = ctx.rheoSlider.position.x, k0 = ctx.rheoKnob.rotation.z;
S.tp3.rheo = 115; displays.updateDisplays();
const xm = ctx.rheoSlider.position.x;
S.tp3.rheo = 230; displays.updateDisplays();
const x1 = ctx.rheoSlider.position.x;
chk('curseur du rhéostat : course complète de gauche à droite',
    near(x0, -0.13, 1e-6) && near(xm, 0, 1e-6) && near(x1, 0.13, 1e-6),
    `${x0.toFixed(3)} · ${xm.toFixed(3)} · ${x1.toFixed(3)} m`);
chk('le bouton du rhéostat tourne avec la valeur', ctx.rheoKnob.rotation.z !== k0);
S.tp3.rheo = 0; displays.updateDisplays();

/* leviers d'alimentation : animés vers leur position */
const lev0 = ctx.e1Pivot.rotation.x;
for (let i = 0; i < 60; i++) displays.animateTP3(1 / 60);
chk('levier E₁ : animé vers la position MARCHE', ctx.e1Pivot.rotation.x > lev0 + 0.3,
    ctx.e1Pivot.rotation.x.toFixed(2) + ' rad');
chk('levier E₂ : animé vers la position ARRÊT', ctx.e2Pivot.rotation.x < -0.3,
    ctx.e2Pivot.rotation.x.toFixed(2) + ' rad');
setSup(false, false);
for (let i = 0; i < 60; i++) displays.animateTP3(1 / 60);
chk('tout éteint : les deux leviers reviennent en bas',
    ctx.e1Pivot.rotation.x < -0.3 && ctx.e2Pivot.rotation.x < -0.3);
displays.updateDisplays();
chk('afficheurs éteints : mise à jour sans erreur', true);

/* ================================================================== */
console.log('\n  --- 12. retour au TP 1 ---');
/* ================================================================== */
document.getElementById('btnTP1').onclick();
chk('retour au TP 1 : banc A + générateur 0-15 V, TP 3 masqué',
    S.activeTP === 1 && ctx.levelA.visible === true && ctx.groupTP3.visible === false
    && ctx.genGroup.visible === true && ctx.metersGroup.visible === true);
S.genOn = true; S.setV = 5;
clr();
W(['G+', 'A+'], ['A-', 'R1'], ['R2', 'G-'], ['V+', 'R1'], ['V-', 'R2']);
chk('retour au TP 1 : le solveur du TP 1 reprend la main',
    S.loopOk === true && S.montage === 'aval' && near(S.IA, 0.0495, 1e-3),
    `montage ${S.montage} · I = ${mA(S.IA)}`);

console.log(`\n${pass} réussi(s), ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
