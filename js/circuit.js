/* =====================================================================
   js/circuit.js  —  solveur de circuit : union-find des nœuds +
                     analyse nodale modifiée (MNA) sur un petit système
                     linéaire.  Détecte le montage amont/aval, les
                     courts-circuits, les surcharges et l'équilibre du
                     pont de Wheatstone.

   Rappel pédagogique conservé : le générateur est ÉTEINT au départ, donc
   aucune mesure n'est possible tant que l'élève ne l'a pas allumé.
   ===================================================================== */
import { S, allTermIds, AMP_CALS } from './state.js';
import { sfx } from './audio.js';
// DANS js/circuit.js (au début avec les imports)
import { evaluateAC } from './ac_solver.js';
import { evaluateTP3, missionsTP3 } from './tp3_solver.js';

let WIRES = null;
/** À appeler une fois au démarrage avec le tableau de fils partagé. */
export function init(wiresArray) { WIRES = wiresArray; }

/* ------------------------------------------------------------------ */
/*  Union-find sur les bornes reliées par un fil                       */
/* ------------------------------------------------------------------ */
/**
 * Union-find des bornes reliées électriquement.
 * @param {Array<[string,string]>} [extra] liaisons INTERNES au matériel
 *        (rail de masse d'une maquette, masses communes d'un oscilloscope…) :
 *        elles ne sont pas des fils, mais elles existent dans l'appareil réel.
 */
export function unionFind(extra) {
    const p = {};
    allTermIds.forEach(id => { p[id] = id; });
    const find = x => (p[x] === x ? x : (p[x] = find(p[x])));
    const union = (a, b) => { if (p[a] !== undefined && p[b] !== undefined) p[find(a)] = find(b); };
    (WIRES || []).forEach(w => union(w.a, w.b));
    (extra || []).forEach(([a, b]) => union(a, b));
    return { find, union };
}

/* ------------------------------------------------------------------ */
/*  Résolution d'un système linéaire (pivot partiel)                   */
/* ------------------------------------------------------------------ */
export function solveLinear(A, b) {
    const n = b.length;
    for (let c = 0; c < n; c++) {
        let piv = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
        if (Math.abs(A[piv][c]) < 1e-14) return null;
        [A[c], A[piv]] = [A[piv], A[c]];
        [b[c], b[piv]] = [b[piv], b[c]];
        for (let r = c + 1; r < n; r++) {
            const f = A[r][c] / A[c][c];
            for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
            b[r] -= f * b[c];
        }
    }
    const x = new Array(n);
    for (let r = n - 1; r >= 0; r--) {
        let s = b[r];
        for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c];
        x[r] = s / A[r][r];
    }
    return x;
}

/* ------------------------------------------------------------------ */
/*  Évaluation complète du montage                                     */
/* ------------------------------------------------------------------ */
let prevMontage = '—', prevFault = false, prevOverload = false, prevBal = false;
let warnGenOff = 0;

export function evaluate(toast, refresh) {
    /* un seul point d'entrée : chaque TP a son propre solveur */
    if (S.activeTP === 2) { evaluateAC(toast, refresh); return; }
    if (S.activeTP === 3) { evaluateTP3(toast, refresh); return; }
    const { find } = unionFind();
    const nGp = find('G+'), nGm = find('G-');
    S.faultShort = (nGp === nGm);
    S.overload = false; S.loopOk = false; S.montage = '—'; S.IA = 0; S.UV = 0;
    S.powered = false; S.boxIn = false; S.galvoConn = false; S.Vg = 0; S.balanced = false;
    
    if (!S.faultShort) {
        /* générateur éteint => U = 0 : rien ne se mesure */
        const U = S.genOn ? S.setV : 0;
        const branches = S.level === 'A'
            ? [['A+', 'A-', S.rA], ['R1', 'R2', S.R], ['V+', 'V-', S.rV]]
            : [['P+', 'M1', S.R1], ['P+', 'M2', S.R2], ['M2', 'P-', S.Rx],
               ['RB1', 'RB2', Math.max(S.Rv, 1e-3)], ['GA+', 'GA-', S.Rg]];

        /* indexation des nœuds : tous les potentiels libres sauf G− (masse)
           et G+ (imposé à U) */
        const idx = new Map(); const roots = [];
        allTermIds.forEach(id => {
            const r = find(id);
            if (r !== nGm && r !== nGp && !idx.has(r)) { idx.set(r, roots.length); roots.push(r); }
        });
        const n = roots.length;
        const A = Array.from({ length: n }, () => new Array(n).fill(0));
        const b = new Array(n).fill(0);
        const LEAK = 1e-9;

        const stamp = (ra, rb, R) => {
            const g = 1 / R;
            const ia = (ra === nGm || ra === nGp) ? null : idx.get(ra);
            const ib = (rb === nGm || rb === nGp) ? null : idx.get(rb);
            if (ia != null) { A[ia][ia] += g; if (ra === nGp) b[ia] += g * U; }
            if (ib != null) { A[ib][ib] += g; if (rb === nGp) b[ib] += g * U; }
            if (ia != null && ib != null) { A[ia][ib] -= g; A[ib][ia] -= g; }
            else if (ia != null && rb === nGp) b[ia] += g * U;
            else if (ib != null && ra === nGp) b[ib] += g * U;
        };
        branches.forEach(([x, y, R]) => stamp(find(x), find(y), R));
        for (let i = 0; i < n; i++) A[i][i] += LEAK;
        const x = solveLinear(A, b);

        const pot = id => {
            const r = find(id);
            if (r === nGp) return U;
            if (r === nGm) return 0;
            const i = idx.get(r);
            return (i == null || !x) ? 0 : x[i];
        };

        if (S.level === 'A') {
            S.IA = (pot('A+') - pot('A-')) / S.rA;
            S.UV = pot('V+') - pot('V-');
            if (Math.abs(S.UV) < 2e-4) S.UV = 0;
            S.loopOk = Math.abs(S.IA) > 2e-5;
            S.overload = Math.abs(S.IA) * 1000 > AMP_CALS[S.ammCal];   // calibre choisi au sélecteur
            if (S.overload) S.loopOk = false;      // calibre grillé : boucle invalide

            /* ---- détection amont / aval ---- */
            if (S.loopOk) {
                const r1 = find('R1'), r2 = find('R2'), ap = find('A+'), am = find('A-');
                const shared = (ap === r1 || ap === r2) ? ap : (am === r1 || am === r2) ? am : null;
                if (shared) {
                    const rFar = (r1 !== shared) ? r1 : r2;
                    const aFar = (ap !== shared) ? ap : am;
                    const vp = find('V+'), vm = find('V-');
                    const both = (u, v) => ((vp === u && vm === v) || (vp === v && vm === u)) && u !== v;
                    if (both(shared, rFar)) S.montage = 'aval';
                    else if (both(aFar, rFar)) S.montage = 'amont';
                }
            }
        } else {
            const nPp = find('P+'), nPm = find('P-');
            S.powered = (nPp === nGp && nPm === nGm);
            const rb1 = find('RB1'), rb2 = find('RB2'), m1 = find('M1');
            S.boxIn = (rb1 !== rb2) && ((m1 === rb1 && nPm === rb2) || (m1 === rb2 && nPm === rb1));
            const ga = find('GA+'), gb = find('GA-'), m2 = find('M2');
            S.galvoConn = (ga !== gb) && ((ga === m1 && gb === m2) || (ga === m2 && gb === m1));
            S.Vg = pot('GA+') - pot('GA-');
            const relErr = Math.abs(S.Rv - S.Rx) / S.Rx;
            S.balanced = S.powered && S.boxIn && S.galvoConn && S.genOn && U > 0.05
                && relErr < .004 && Math.abs(S.Vg) < U * .002 + 3e-4;
        }

        /* petit rappel si le circuit est câblé mais le générateur éteint */
        const wired = S.level === 'A'
            ? (find('A+') !== find('A-') || find('R1') !== find('R2'))
            : S.powered;
        if (wired && !S.genOn && Date.now() - warnGenOff > 12000) {
            warnGenOff = Date.now();
            toast("Le générateur est éteint : aucune mesure n'est possible. Allumez-le d'abord.", 'warn');
        }
    }

    /* ---- transitions : sons & messages ---- */
    if (S.faultShort && !prevFault) {
        sfx.err(); toast('Court-circuit franc sur le générateur ! Protection déclenchée.', 'error');
    }
    if (S.overload && !prevOverload) {
        sfx.err(); toast(`Ampèremètre en surcharge : le courant dépasse le calibre ${AMP_CALS[S.ammCal]} mA — coupez et montez de calibre !`, 'error');
    }
    if (S.montage !== prevMontage && S.montage !== '—') {
        toast(`Montage détecté : ${S.montage === 'amont' ? 'AMONT (voltmètre en amont)' : 'AVAL (voltmètre en aval)'}`, 'success');
    }
    if (S.balanced && !prevBal) {
        sfx.ok();
        toast(`Pont équilibré (aiguille au zéro) ! Relevez Rv = ${S.Rv} Ω, puis calculez vous-même Rx = (R2/R1)·Rv sur le papier.`, 'success');
    }
    prevMontage = S.montage; prevFault = S.faultShort;
    prevOverload = S.overload; prevBal = S.balanced;

    refresh && refresh();
}

/** Remet le poste « brut » : générateur éteint, 0 V (à chaque changement de niveau). */
export function resetGeneratorState() {
    S.genOn = false;
    S.setV = 0;
}

/* ------------------------------------------------------------------ */
/*  Objectifs du TP                                                    */
/* ------------------------------------------------------------------ */
export const missionsDef = {
    A: [
        { id: 'a1', t: "Allumer le générateur (il est livré éteint)", test: () => S.genOn },
        { id: 'a2', t: "Câbler la boucle série : Générateur → Ampèremètre → R → retour", test: () => S.level === 'A' && S.loopOk && !S.faultShort },
        { id: 'a3', t: "Brancher le voltmètre (montage amont ou aval)", test: () => S.level === 'A' && S.montage !== '—' },
        { id: 'a4', t: "Régler la tension de sortie sur U = 5,00 V", test: () => S.genOn && Math.abs(S.setV - 5) < .001 },
        { id: 'a5', t: "Reporter U et I sur la feuille de relevés (bureau de droite)", test: () => S.recordedA }
    ],
    B: [
        { id: 'b1', t: "Allumer le générateur (il est livré éteint)", test: () => S.genOn },
        { id: 'b2', t: "Alimenter le pont : G+ → P+  et  G− → P−", test: () => S.level === 'B' && S.powered },
        { id: 'b3', t: "Insérer la boîte à décades entre M1 et P− (S1, S2)", test: () => S.level === 'B' && S.boxIn },
        { id: 'b4', t: "Relier le galvanomètre entre M1 et M2", test: () => S.level === 'B' && S.galvoConn },
        { id: 'b5', t: "Équilibrer le pont : aiguille du galvanomètre au zéro", test: () => S.balanced },
        { id: 'b6', t: "Reporter Rv (et en déduire Rx) sur la feuille de relevés", test: () => S.recordedB }
    ],
    /* --- TP 2 : filtres (fascicule p. 10, 11, 14, 15) ---
       Chaque objectif exige une MESURE à l'oscilloscope : tant qu'aucune sonde
       n'est raccordée, rien ne peut être validé (écran plat).               */
    TP2_RC: [
        { id: 'rc1', t: "Allumer le GBF et régler Ue = 6,0 V sinusoïdal", test: () => S.gbfOn && Math.abs(S.gbfAmp - 6) < 0.1 },
        { id: 'rc2', t: "Alimenter la maquette : GBF+ → IN+ et GBF− → IN−", test: () => S.activeTP === 2 && S.tp2Filter === 'RC' && S.loopOk },
        { id: 'rc3', t: "Raccorder les sondes : CH1 sur l'entrée, CH2 sur la sortie (pointe + masse)", test: () => S.activeTP === 2 && S.ch1.ok && S.ch2.ok && S.ch2.vpp > 1e-6 },
        { id: 'rc4', t: "Trouver la fréquence de coupure à −3 dB (fc ≈ 3,29 kHz)", test: () => S.activeTP === 2 && S.tp2Filter === 'RC' && S.gainDbMeas !== null && Math.abs(S.gainDbMeas - (-3.01)) < 0.5 },
        { id: 'rc5', t: "Compléter le tableau de mesures (f1 à f8)", test: () => S.recordedTP2_RC }
    ],
    TP2_CR: [
        { id: 'cr1', t: "Allumer le GBF et régler Ue = 6,0 V", test: () => S.gbfOn && Math.abs(S.gbfAmp - 6) < 0.1 },
        { id: 'cr2', t: "Alimenter la maquette : GBF+ → IN+ et GBF− → IN−", test: () => S.activeTP === 2 && S.tp2Filter === 'CR' && S.loopOk },
        { id: 'cr3', t: "Raccorder les sondes CH1 (entrée) et CH2 (sortie)", test: () => S.activeTP === 2 && S.ch1.ok && S.ch2.ok && S.ch2.vpp > 1e-6 },
        { id: 'cr4', t: "Vérifier la fréquence de coupure fc ≈ 3,29 kHz (−3 dB)", test: () => S.activeTP === 2 && S.tp2Filter === 'CR' && S.gainDbMeas !== null && Math.abs(S.gainDbMeas - (-3.01)) < 0.5 },
        { id: 'cr5', t: "Compléter le tableau de mesures CR", test: () => S.recordedTP2_CR }
    ],
    'TP2_RC-CR': [
        { id: 'bp1', t: "Allumer le GBF (Ue = 6,0 V sinusoïdal)", test: () => S.gbfOn && Math.abs(S.gbfAmp - 6) < 0.1 },
        { id: 'bp2', t: "Alimenter la cascade RC-CR : GBF+ → IN+ et GBF− → IN−", test: () => S.activeTP === 2 && S.tp2Filter === 'RC-CR' && S.loopOk },
        { id: 'bp3', t: "Raccorder les sondes CH1 (entrée) et CH2 (sortie)", test: () => S.activeTP === 2 && S.ch1.ok && S.ch2.ok && S.ch2.vpp > 1e-6 },
        { id: 'bp4', t: "Repérer les deux coupures fc1 ≈ 329 Hz et fc2 ≈ 3,29 kHz", test: () => S.activeTP === 2 && S.tp2Filter === 'RC-CR' && S.balanced && S.ch1.ok && S.ch2.ok },
        { id: 'bp5', t: "Reporter les mesures cascade sur la feuille", test: () => S.recordedTP2_Band }
    ],

    /* --- TP 3 : théorèmes électrocinétiques (fascicule p. 7 à 9) ---
       Les cinq manipulations sont définies avec le solveur, près des
       grandeurs qu'elles vérifient (voir js/tp3_solver.js).          */
    ...missionsTP3
};
