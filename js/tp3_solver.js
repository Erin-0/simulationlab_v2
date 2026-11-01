/* =====================================================================
   js/tp3_solver.js  —  TP 3 : Vérification des théorèmes électrocinétiques
                        (fascicule p. 7 à 9, compte rendu p. 16)

   Circuit de base : trois branches en parallèle entre les points A et B
       branche 1 : E1 (12 V) + R1 (290 Ω)
       branche 2 : E2 (6 V)  + R2 (180 Ω)
       branche 3 : R  (150 Ω)      ← la « branche R » qu'on retire ou remet

   Ce module contient :
     1. un solveur continu GÉNÉRIQUE (analyse nodale modifiée, MNA) qui résout
        n'importe quel câblage réalisé par l'élève — y compris les fautes
        (court-circuit, branche ouverte, limitation de courant) ;
     2. la détection topologique du montage (branche R en place ? générateur
        remplacé par un court-circuit ? voltmètre entre A et B ? rhéostat en
        série ou en parallèle ?) ;
     3. les grandeurs lues par les appareils (voltmètre, ampèremètre, courants
        délivrés par les générateurs, courant dans le rhéostat) ;
     4. les valeurs théoriques de référence et leurs incertitudes, calculées
        par la méthode du fascicule (Δg = Σ |∂g/∂p|·Δp avec ΔE/E = 0,03 et
        ΔR/R = 0,05).  Elles ne servent qu'à valider les objectifs et à
        contrôler un calcul à la demande : jamais affichées d'office ;
     5. la mémorisation des mesures de l'élève (V₀, I₀, V_M, I_R…) : ce sont
        SES propres mesures qui servent de référence pour Thévenin et Norton,
        conformément au fascicule (« on compare ce courant avec le courant
        mesuré dans le circuit réel »).

   Liaisons internes au matériel (comme sur l'appareil réel) :
     • les barrettes de jonction A1…A4 forment un seul nœud A ; idem B1…B4 ;
     • le rhéostat est une piste de 230 Ω avec un curseur W :
       R(A–W) = valeur réglée, R(W–B) = 230 − valeur réglée.  Les deux
       demi-pistes sont estampillées, donc n'importe quel câblage (A–W, W–B
       ou A–B) donne la bonne résistance.
   ===================================================================== */

import { S, allTermIds, AMP_CALS } from './state.js';
import { unionFind, solveLinear } from './circuit.js';
import { sfx } from './audio.js';

/* ------------------------------------------------------------------ */
/*  Constantes du montage                                              */
/* ------------------------------------------------------------------ */
export const TP3_BONDS = [['A1', 'A2'], ['A2', 'A3'], ['A3', 'A4'],
                          ['B1', 'B2'], ['B2', 'B3'], ['B3', 'B4']];

export const TP3_TERMS = [
    'E1+', 'E1-', 'E2+', 'E2-',
    'RHA', 'RHB', 'RHW',
    'R1a', 'R1b', 'R2a', 'R2b', 'RLa', 'RLb',
    'A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'
];

const LEAK = 1e-9;            // conductance de fuite : régularise les nœuds flottants
const R_MIN = 0.05;           // résistance minimale d'une branche (Ω)
const COMPLIANCE = 18;        // tension de conformité des générateurs en mode CC (V)

/* ------------------------------------------------------------------ */
/*  1. Solveur continu générique (analyse nodale modifiée)             */
/* ------------------------------------------------------------------ */

/**
 * Résout un réseau linéaire en courant continu.
 * @param {string[]} nodeIds  nœuds (déjà réduits par union-find)
 * @param {Array} resistors   [{a,b,R}]
 * @param {Array} vsources    [{a,b,E}]  impose V(b) − V(a) = E
 * @param {Array} isources    [{a,b,I}]  pousse I de a vers b
 * @returns {{v:Object, i:number[], ok:boolean}} v = potentiels, i = courants
 *          des sources de tension (de a vers b, donc sortant par la borne +).
 */
export function solveDC(nodeIds, resistors, vsources, isources) {
    const idx = new Map();
    nodeIds.forEach((nd) => { if (!idx.has(nd)) idx.set(nd, idx.size); });
    const n = idx.size, m = vsources.length;
    const A = Array.from({ length: n + m }, () => new Array(n + m).fill(0));
    const b = new Array(n + m).fill(0);
    const at = (nd) => (nd === undefined ? -1 : (idx.has(nd) ? idx.get(nd) : -1));

    for (const r of resistors) {
        const ia = at(r.a), ib = at(r.b);
        if (ia < 0 || ib < 0 || ia === ib) continue;
        const g = 1 / Math.max(R_MIN, r.R);
        A[ia][ia] += g; A[ib][ib] += g;
        A[ia][ib] -= g; A[ib][ia] -= g;
    }
    for (let k = 0; k < n; k++) A[k][k] += LEAK;      // masse implicite

    vsources.forEach((vs, k) => {
        const ia = at(vs.a), ib = at(vs.b);
        if (ia >= 0) { A[ia][n + k] += 1; A[n + k][ia] -= 1; }
        if (ib >= 0) { A[ib][n + k] -= 1; A[n + k][ib] += 1; }
        b[n + k] = vs.E;
    });

    for (const is of isources) {
        const ia = at(is.a), ib = at(is.b);
        if (ia >= 0) b[ia] -= is.I;
        if (ib >= 0) b[ib] += is.I;
    }

    const x = solveLinear(A, b);
    if (!x) return { v: {}, i: [], ok: false };
    const v = {};
    for (const nd of nodeIds) {
        const k = idx.get(nd);
        if (k !== undefined && !(nd in v)) v[nd] = x[k];
    }
    return { v, i: x.slice(n), ok: true };
}

/* ------------------------------------------------------------------ */
/*  2. Valeurs théoriques de référence (formes closes)                 */
/* ------------------------------------------------------------------ */

/**
 * Grandeurs théoriques du circuit de base.
 * V₀ = (E₁G₁+E₂G₂)/(G₁+G₂) · I₀ = E₁G₁+E₂G₂ · R_Th = R₁//R₂
 * V_M = (E₁G₁+E₂G₂)/(G₁+G₂+G) · I_R = V_M/R · etc.
 */
export function theoryTP3(p = {}) {
    const t3 = S.tp3;
    const E1 = p.E1 !== undefined ? p.E1 : t3.E1;
    const E2 = p.E2 !== undefined ? p.E2 : t3.E2;
    const R1 = p.R1 !== undefined ? p.R1 : t3.R1;
    const R2 = p.R2 !== undefined ? p.R2 : t3.R2;
    const R = p.R !== undefined ? p.R : t3.RL;

    const G1 = 1 / R1, G2 = 1 / R2, G = 1 / R;
    const num = E1 * G1 + E2 * G2;
    const sum2 = G1 + G2, sum3 = G1 + G2 + G;

    const V0 = num / sum2;                 // tension à vide entre A et B
    const I0 = num;                        // courant de court-circuit A→B
    const RTh = 1 / sum2;                  // = V₀/I₀ = R₁//R₂
    const VM = num / sum3;                 // tension de Millman aux bornes de R
    const IR = VM / R;                     // courant dans la branche R
    const I1 = (E1 * G1) / sum3 / R;       // E₂ remplacé par un court-circuit
    const I2 = (E2 * G2) / sum3 / R;       // E₁ remplacé par un court-circuit
    const ITh = V0 / (RTh + R);            // Thévenin : courant dans R
    const INo = I0 * RTh / (RTh + R);      // Norton  : courant dans R

    return { V0, I0, RTh, RNo: RTh, VM, IR, I1, I2, Itot: I1 + I2, ITh, INo };
}

/**
 * Incertitudes absolues, méthode du fascicule (p. 3) :
 *     Δg = |A|·Δx + |B|·Δy + |C|·Δz
 * Les coefficients A, B, C sont les dérivées partielles de g, évaluées
 * numériquement (différences centrales) sur les formes closes ci-dessus.
 */
export function uncertaintiesTP3() {
    const t3 = S.tp3;
    const ref = { E1: t3.E1, E2: t3.E2, R1: t3.R1, R2: t3.R2, R: t3.RL };
    const deltas = {
        E1: t3.E1 * t3.relE, E2: t3.E2 * t3.relE,
        R1: t3.R1 * t3.relR, R2: t3.R2 * t3.relR, R: t3.RL * t3.relR
    };
    const base = theoryTP3();
    const out = {};
    for (const key of Object.keys(base)) {
        let dg = 0;
        for (const pname of Object.keys(deltas)) {
            const dp = deltas[pname];
            if (!(dp > 0)) continue;
            const up = theoryTP3({ [pname]: ref[pname] + dp })[key];
            const dn = theoryTP3({ [pname]: ref[pname] - dp })[key];
            dg += Math.abs((up - dn) / (2 * dp)) * dp;
        }
        out['d' + key] = dg;
    }
    return out;
}

/* ------------------------------------------------------------------ */
/*  3. Évaluation du montage câblé                                     */
/* ------------------------------------------------------------------ */

let prev = { fault: false, overload: false, sat: false, rheoHot: false, abShort: false, open1: false, open2: false };

export function evaluateTP3(toast, refresh) {
    const t3 = S.tp3;
    const { find } = unionFind(TP3_BONDS);
    const n = (id) => find(id);

    /* ---- nœuds remarquables ---- */
    const nA = n('A1'), nB = n('B1');
    const e1p = n('E1+'), e1m = n('E1-');
    const e2p = n('E2+'), e2m = n('E2-');
    const rLa = n('RLa'), rLb = n('RLb');
    const r1a = n('R1a'), r1b = n('R1b');
    const r2a = n('R2a'), r2b = n('R2b');
    const vp = n('V+'), vm = n('V-'), ap = n('A+'), am = n('A-');
    const rhA = n('RHA'), rhB = n('RHB'), rhW = n('RHW');

    /* ---- défauts ---- */
    const short1 = (e1p === e1m);
    const short2 = (e2p === e2m);
    S.faultShort = (t3.on1 && short1) || (t3.on2 && short2);
    S.abShort = (nA === nB);

    /* ---- branches du réseau (composants internes du matériel) ---- */
    const resistors = [
        { a: r1a, b: r1b, R: t3.R1 },
        { a: r2a, b: r2b, R: t3.R2 },
        { a: rLa, b: rLb, R: t3.RL },
        { a: rhA, b: rhW, R: Math.max(R_MIN, t3.rheo) },
        { a: rhW, b: rhB, R: Math.max(R_MIN, t3.rheoMax - t3.rheo) },
        { a: vp, b: vm, R: S.rV },          // voltmètre : 10 MΩ
        { a: ap, b: am, R: S.rA }           // ampèremètre : 1 Ω
    ];

    const nodeIds = [];
    [nA, nB, e1p, e1m, e2p, e2m, rLa, rLb, r1a, r1b, r2a, r2b, vp, vm, ap, am, rhA, rhB, rhW]
        .forEach(x => { if (x !== undefined && !nodeIds.includes(x)) nodeIds.push(x); });

    /** Construit les sources d'après l'état courant des générateurs, puis résout. */
    function buildAndSolve() {
        const vsources = [], isources = [], gen = [];
        const add = (id, on, cc, p, m, E, I) => {
            if (!on || S.faultShort) return;
            if (cc) { isources.push({ a: m, b: p, I }); gen.push({ id, cc: true, I }); }
            else { vsources.push({ a: m, b: p, E }); gen.push({ id, cc: false, k: vsources.length - 1 }); }
        };
        add(1, t3.on1, t3.cc1, e1p, e1m, t3.E1, t3.i1);
        add(2, t3.on2, t3.cc2, e2p, e2m, t3.E2, t3.i2);
        const sol = solveDC(nodeIds, resistors, vsources, isources);
        return { sol, gen };
    }

    let { sol, gen } = buildAndSolve();

    /* ---- limitation de courant : une alimentation réelle bascule en CC ---- */
    let limitedId = 0;
    if (sol.ok) {
        for (const g of gen) {
            if (g.cc) continue;
            const lim = g.id === 1 ? t3.i1 : t3.i2;
            if (lim > 0 && Math.abs(sol.i[g.k] || 0) > lim * 1.001) { limitedId = g.id; break; }
        }
    }
    if (limitedId) {
        const wasCC = limitedId === 1 ? t3.cc1 : t3.cc2;
        if (limitedId === 1) t3.cc1 = true; else t3.cc2 = true;
        t3.autoCC = limitedId;
        const again = buildAndSolve();
        sol = again.sol; gen = again.gen;
        if (!wasCC) {
            sfx.err && sfx.err();
            toast(`E${limitedId} : la limitation de courant est atteinte — l'alimentation bascule `
                + `d'elle-même en mode CC (${((limitedId === 1 ? t3.i1 : t3.i2) * 1000).toFixed(0)} mA).`, 'warn');
        }
    } else if (t3.autoCC && !(limitedId)) {
        t3.autoCC = null;
    }

    const V = sol.ok ? sol.v : {};
    const P = (nd) => (nd === undefined ? 0 : (V[nd] || 0));

    /* ---- courants de branche ---- */
    const I_R1 = (P(r1a) - P(r1b)) / t3.R1;
    const I_R2 = (P(r2a) - P(r2b)) / t3.R2;
    const I_R = (P(rLa) - P(rLb)) / t3.RL;
    const I_rheo = (P(rhA) - P(rhW)) / Math.max(R_MIN, t3.rheo);
    const I_volt = (P(vp) - P(vm)) / S.rV;
    const I_amp = (P(ap) - P(am)) / S.rA;

    /* ---- topologie ---- */
    /* La branche R est « en place » dès que ses deux extrémités sont câblées sur
       deux nœuds distincts : l'ampèremètre peut être intercalé en série, cela ne
       change rien à la détection (on ne teste pas l'identité des nœuds A/B).   */
    const Rwired = connected(rLa, find) && connected(rLb, find) && rLa !== rLb;
    const topo = {
        Rwired,
        Rin: Rwired,
        Rout: !Rwired,
        Iflow: Math.abs(I_R) > 1e-9,
        e1Short: short1, e2Short: short2,
        e1Open: !t3.on1 && !short1 && !connected(e1p, find) && !connected(e1m, find),
        e2Open: !t3.on2 && !short2 && !connected(e2p, find) && !connected(e2m, find),
        vAB: pairIs(vp, vm, nA, nB),
        vR: pairIs(vp, vm, rLa, rLb),
        aAB: pairIs(ap, am, nA, nB),
        rheoParallel: pairIs(rhA, rhW, nA, nB) || pairIs(rhW, rhB, nA, nB) || pairIs(rhA, rhB, nA, nB),
        rheoSeries: false,
        r12Idle: Math.abs(I_R1) < 1e-9 && Math.abs(I_R2) < 1e-9
    };
    topo.rheoSeries = Math.abs(I_R) > 1e-7
        && Math.abs(Math.abs(I_rheo) - Math.abs(I_R)) < 0.01 * Math.abs(I_R);

    /* ---- ce que lisent les appareils ---- */
    S.UV = Math.abs(I_volt) < 1e-12 ? 0 : (P(vp) - P(vm));
    S.IA = I_amp;
    S.overload = Math.abs(S.IA) * 1000 > AMP_CALS[S.ammCal];   // calibre choisi au sélecteur
    if (S.overload) S.UV = S.UV;                       // la tension reste lue

    t3.IE1 = 0; t3.IE2 = 0;
    for (const g of gen) {
        const I = g.cc ? g.I : (sol.i[g.k] || 0);
        if (g.id === 1) t3.IE1 = I; else t3.IE2 = I;
    }
    t3.VE1 = P(e1p) - P(e1m);
    t3.VE2 = P(e2p) - P(e2m);

    S.tp3Saturated = (t3.cc1 && t3.on1 && Math.abs(t3.VE1) > COMPLIANCE)
        || (t3.cc2 && t3.on2 && Math.abs(t3.VE2) > COMPLIANCE);
    /* le rhéostat chauffe dès qu'on approche son courant maximal (1,5 A) :
       l'alarme se déclenche à 90 % pour laisser le temps de réagir          */
    S.rheoOver = Math.abs(I_rheo) > t3.rheoCur * 0.9;

    S.loopOk = sol.ok && !S.faultShort && !S.abShort && (t3.on1 || t3.on2);
    S.tp3.topo = topo;
    S.tp3.IR = I_R;
    S.tp3.Irheo = I_rheo;
    S.tp3.VAB = P(nA) - P(nB);
    S.tp3.theory = theoryTP3();

    /* ---- avertissements (une fois par transition) ---- */
    warn(toast, 'fault', S.faultShort,
        'Court-circuit aux bornes d\'un générateur ! Protection déclenchée : coupez-le et retirez le fil fautif.', 'error');
    warn(toast, 'overload', S.overload,
        `Ampèremètre en surcharge : le courant dépasse le calibre ${AMP_CALS[S.ammCal]} mA — coupez vite et montez de calibre.`, 'error');
    warn(toast, 'sat', S.tp3Saturated,
        'Mode CC : la tension de conformité est dépassée, le générateur ne peut plus imposer ce courant.', 'warn');
    warn(toast, 'rheoHot', S.rheoOver,
        `Rhéostat proche de son courant maximal (${t3.rheoCur} A) : il chauffe, augmentez sa résistance.`, 'warn');
    warn(toast, 'abShort', S.abShort && !S.faultShort,
        'Les points A et B sont reliés par un fil : le circuit est court-circuité, retirez ce fil.', 'error');
    /* Rappel utile en superposition : un générateur ÉTEINT laisse sa branche
       OUVERTE, il faut le remplacer par un fil.  On ne le dit que si l'autre
       générateur tourne (sinon l'élève n'a encore rien commencé).          */
    const open1Warn = topo.e1Open && t3.on2;
    const open2Warn = topo.e2Open && t3.on1;
    if (open2Warn && !prev.open2) {
        toast('E2 est éteint et débranché : sa branche est OUVERTE. Pour le « remplacer par un '
            + 'court-circuit » (superposition), reliez E2+ à E2− avec un fil.', 'warn');
    }
    if (open1Warn && !prev.open1) {
        toast('E1 est éteint et débranché : sa branche est OUVERTE. Pour le « remplacer par un '
            + 'court-circuit » (superposition), reliez E1+ à E1− avec un fil.', 'warn');
    }
    prev.open1 = open1Warn; prev.open2 = open2Warn;

    capture(toast, topo);
    refresh && refresh();
    return { topo, I_R, I_rheo };
}

function warn(toast, key, cond, msg, type) {
    if (cond && !prev[key]) { sfx.err && sfx.err(); toast(msg, type || 'warn'); }
    prev[key] = cond;
}

/** Nombre de bornes qui partagent ce nœud (≥ 2 ⇒ quelque chose est câblé). */
function nodeSize(node, find) {
    let c = 0;
    for (const id of allTermIds) if (find(id) === node) c++;
    return c;
}

/** Une borne est « connectée » si au moins une autre borne partage son nœud. */
function connected(node, find) {
    return node !== undefined && nodeSize(node, find) > 1;
}

/** {a,b} == {x,y} (paires non ordonnées, éléments distincts) */
function pairIs(a, b, x, y) {
    if (a === b || x === y) return false;
    return (a === x && b === y) || (a === y && b === x);
}

/* ------------------------------------------------------------------ */
/*  4. Mémorisation des mesures de l'élève                             */
/* ------------------------------------------------------------------ */
const EPS_I = 2e-5;

function capture(toast, topo) {
    const t3 = S.tp3, m = t3.meas, lvl = t3.level;
    const seriesWithR = () => topo.Rin && Math.abs(S.IA) > EPS_I && Math.abs(t3.IR) > EPS_I
        && Math.abs(Math.abs(S.IA) - Math.abs(t3.IR)) < 0.01 * Math.abs(t3.IR);

    /* --- Manipulation 1 : V₀ puis I₀, branche R retirée --- */
    if (topo.Rout && topo.vAB && !S.faultShort && Math.abs(S.UV) > 0.05) {
        setMeas(m, 'V0', S.UV, 'V₀ — tension à vide entre A et B (tension de Thévenin)', fmtV(S.UV), toast);
    }
    if (topo.Rout && topo.aAB && !S.faultShort && !S.overload && Math.abs(S.IA) > EPS_I) {
        setMeas(m, 'I0', S.IA, 'I₀ — courant de court-circuit entre A et B (courant de Norton)', fmtI(S.IA), toast);
    }

    /* --- Manipulation 2 : V_M et I_R --- */
    if (topo.Rin && (topo.vR || topo.vAB) && !S.faultShort && Math.abs(S.UV) > 0.05) {
        setMeas(m, 'VM', S.UV, 'V_M — tension de Millman aux bornes de R', fmtV(S.UV), toast);
    }
    /* I_R n'a de sens que sur le CIRCUIT RÉEL complet : les deux générateurs
       en service, aucun des deux remplacé par un fil.  C'est cette valeur-là
       qui sert de référence aux manipulations 4 (Thévenin) et 5 (Norton) —
       un état intermédiaire de câblage ne doit jamais l'écraser.          */
    const realCircuit = t3.on1 && t3.on2 && !topo.e1Short && !topo.e2Short;
    if (seriesWithR() && !S.overload && realCircuit && lvl <= 3) {
        setMeas(m, 'IR', S.IA, 'I_R — courant dans la branche R', fmtI(S.IA), toast);
        t3.IRref = m.IR;                  // référence commune à Thévenin et Norton
    }

    /* --- Manipulation 3 : superposition --- */
    if (lvl === 3 && seriesWithR() && !S.overload && Math.abs(S.IA) > EPS_I) {
        if (t3.on1 && !t3.on2 && topo.e2Short)
            setMeas(m, 'I1', S.IA, 'I₁ — courant dans R, E₂ remplacé par un court-circuit', fmtI(S.IA), toast);
        else if (t3.on2 && !t3.on1 && topo.e1Short)
            setMeas(m, 'I2', S.IA, 'I₂ — courant dans R, E₁ remplacé par un court-circuit', fmtI(S.IA), toast);
        else if (t3.on1 && t3.on2 && !topo.e1Short && !topo.e2Short)
            setMeas(m, 'Itot', S.IA, 'I_total — les deux générateurs en place', fmtI(S.IA), toast);
    }

    /* --- Manipulation 4 : Thévenin --- */
    if (lvl === 4) {
        const c = theoChecks();
        if (c.built && seriesWithR() && !S.overload) {
            if (m.V0 !== null && m.I0 !== null && m.RTh === null) {
                m.RTh = m.V0 / m.I0;
                toast(`R_Th = V₀ / I₀ = ${m.RTh.toFixed(1).replace('.', ',')} Ω (d'après vos mesures).`, 'success');
            }
            setMeas(m, 'ITh', S.IA, 'I_Th — courant dans R du montage équivalent de Thévenin', fmtI(S.IA), toast);
        }
    }

    /* --- Manipulation 5 : Norton --- */
    if (lvl === 5) {
        const c = nortonChecks();
        if (c.built && seriesWithR() && !S.overload) {
            if (m.V0 !== null && m.I0 !== null && m.RNo === null) {
                m.RNo = m.V0 / m.I0;
                toast(`R_No = R_Th = ${m.RNo.toFixed(1).replace('.', ',')} Ω (d'après vos mesures).`, 'success');
            }
            setMeas(m, 'INo', S.IA, 'I_No — courant dans R du montage équivalent de Norton', fmtI(S.IA), toast);
        }
    }
}

function setMeas(m, key, val, label, txt, toast) {
    const old = m[key];
    if (old !== null && old !== undefined && Math.abs(old - val) < Math.max(1e-9, Math.abs(val) * 0.002)) return;
    m[key] = val;
    sfx.ok && sfx.ok();
    toast(`${label} : ${txt} — mesure mémorisée.`, 'success');
}

export const fmtV = (v) => (Math.abs(v) < 1
    ? (v * 1000).toFixed(1).replace('.', ',') + ' mV'
    : v.toFixed(2).replace('.', ',') + ' V');
export const fmtI = (i) => (i * 1000).toFixed(2).replace('.', ',') + ' mA';

/* ------------------------------------------------------------------ */
/*  5. Vérification des montages équivalents (Thévenin / Norton)       */
/* ------------------------------------------------------------------ */

/* Tolérances : on compare les MESURES de l'élève entre elles, jamais à la
   théorie — c'est le sens même de la « vérification » demandée.          */
const TOL_U = 0.20;      // V       réglage de la tension du générateur équivalent
const TOL_R = 0.05;      // fraction réglage du rhéostat
const TOL_I = 0.05;      // fraction courants comparés

/** Montage de Thévenin : E_Th = V₀ en série avec R_Th = V₀/I₀ puis R. */
export function theoChecks() {
    const t3 = S.tp3, topo = t3.topo || {}, m = t3.meas;
    const ready = m.V0 !== null && m.I0 !== null && t3.IRref !== null;
    const RTh = (ready && m.I0 !== 0) ? m.V0 / m.I0 : null;
    const gen = (t3.on1 && !t3.cc1) ? 1 : 2;
    const oneGen = (t3.on1 && !t3.cc1 && !t3.on2) || (t3.on2 && !t3.cc2 && !t3.on1);
    const vSet = gen === 1 ? t3.E1 : t3.E2;
    const res = {
        ready, RTh, gen, oneGen,
        voltageOk: ready && Math.abs(vSet - m.V0) <= TOL_U,
        rheoOk: ready && RTh > 0 && Math.abs(t3.rheo - RTh) <= Math.max(2, TOL_R * RTh),
        seriesOk: !!topo.rheoSeries && !!topo.Rin,
        cleanOk: !!topo.r12Idle,
        currentOk: ready && Math.abs(t3.IR - t3.IRref) <= TOL_I * Math.abs(t3.IRref)
    };
    res.built = !!(res.ready && res.oneGen && res.voltageOk && res.rheoOk && res.seriesOk && res.cleanOk);
    res.verified = res.built && res.currentOk;
    return res;
}

/** Montage de Norton : I_No = I₀ (mode CC) en parallèle avec R_No = R_Th et R. */
export function nortonChecks() {
    const t3 = S.tp3, topo = t3.topo || {}, m = t3.meas;
    const ready = m.V0 !== null && m.I0 !== null && t3.IRref !== null;
    const RNo = (ready && m.I0 !== 0) ? m.V0 / m.I0 : null;
    const oneCC = (t3.on1 && t3.cc1 && !t3.on2) || (t3.on2 && t3.cc2 && !t3.on1);
    const iSet = (t3.on1 && t3.cc1) ? t3.i1 : t3.i2;
    const res = {
        ready, RNo, oneCC,
        currentOk: ready && Math.abs(iSet - m.I0) <= Math.max(0.001, 0.03 * Math.abs(m.I0)),
        rheoOk: ready && RNo > 0 && Math.abs(t3.rheo - RNo) <= Math.max(2, TOL_R * RNo),
        parallelOk: !!topo.rheoParallel && !!topo.Rin,
        cleanOk: !!topo.r12Idle,
        matchOk: ready && Math.abs(t3.IR - t3.IRref) <= TOL_I * Math.abs(t3.IRref)
    };
    res.built = !!(res.ready && res.oneCC && res.currentOk && res.rheoOk && res.parallelOk && res.cleanOk);
    res.verified = res.built && res.matchOk;
    return res;
}

/** État « livré » : générateurs éteints, rien de mémorisé. */
export function resetTP3(keepMeasures = false) {
    const t3 = S.tp3;
    t3.on1 = false; t3.on2 = false;
    t3.cc1 = false; t3.cc2 = false;
    t3.autoCC = null;
    t3.E1 = 12; t3.E2 = 6;
    t3.IE1 = 0; t3.IE2 = 0; t3.VE1 = 0; t3.VE2 = 0;
    t3.IR = 0; t3.Irheo = 0; t3.VAB = 0;
    if (!keepMeasures) {
        for (const k of Object.keys(t3.meas)) t3.meas[k] = null;
        t3.IRref = null;
    }
    S.faultShort = false; S.overload = false; S.loopOk = false;
    S.abShort = false; S.tp3Saturated = false; S.rheoOver = false;
    S.UV = 0; S.IA = 0;
}

/* ------------------------------------------------------------------ */
/*  6. Objectifs des cinq manipulations (fascicule p. 7 à 9)           */
/* ------------------------------------------------------------------ */

const T = () => S.tp3.topo || {};
const M = () => S.tp3.meas;
const bothGenOk = () => {
    const t = S.tp3;
    return t.on1 && t.on2 && !t.cc1 && !t.cc2 && !S.faultShort;
};
const sameValues = () => {
    const t = S.tp3;
    return Math.abs(t.E1 - 12) < 0.01 && Math.abs(t.E2 - 6) < 0.01;
};
/** I_R mesuré cohérent avec V_M / R (à 2 % près) */
const millmanOk = () => {
    const m = M();
    if (m.VM === null || m.IR === null) return false;
    const attendu = m.VM / S.tp3.RL;
    return Math.abs(m.IR - attendu) <= 0.02 * Math.abs(attendu) + 1e-6;
};
/** I_total mesuré cohérent avec I₁ + I₂ (à 3 % près) */
const superpositionOk = () => {
    const m = M();
    if (m.I1 === null || m.I2 === null || m.Itot === null) return false;
    const somme = m.I1 + m.I2;
    return Math.abs(m.Itot - somme) <= 0.03 * Math.abs(somme) + 1e-7;
};

export const missionsTP3 = {
    TP3_1: [
        { id: 't1a', t: "Allumer les deux générateurs : E₁ = 12 V et E₂ = 6 V", test: () => bothGenOk() && sameValues() },
        { id: 't1b', t: "Retirer la branche R (débrancher ses deux fils)", test: () => !!T().Rout },
        { id: 't1c', t: "Mesurer la tension à vide V₀ entre A et B au voltmètre", test: () => M().V0 !== null },
        { id: 't1d', t: "Mesurer le courant de court-circuit I₀ (ampèremètre entre A et B)", test: () => M().I0 !== null },
        { id: 't1e', t: "Reporter V₀ et I₀ sur la feuille, avec leurs incertitudes", test: () => S.tp3.recV0 && S.tp3.recI0 }
    ],
    TP3_2: [
        { id: 't2a', t: "Remettre la branche R entre A et B", test: () => !!T().Rin },
        { id: 't2b', t: "Les deux générateurs en service (E₁ = 12 V, E₂ = 6 V)", test: () => bothGenOk() && sameValues() },
        { id: 't2c', t: "Mesurer la tension de Millman V_M aux bornes de R", test: () => M().VM !== null },
        { id: 't2d', t: "Mesurer I_R : ampèremètre en SÉRIE dans la branche R", test: () => M().IR !== null },
        { id: 't2e', t: "Vérifier que I_R = V_M / R", test: () => millmanOk() },
        { id: 't2f', t: "Reporter V_M, I_R calculé et I_R mesuré sur la feuille", test: () => S.tp3.recVM }
    ],
    TP3_3: [
        { id: 't3a', t: "E₁ seul : éteindre E₂ et le remplacer par un fil (E₂+ → E₂−)", test: () => S.tp3.on1 && !S.tp3.on2 && !!T().e2Short },
        { id: 't3b', t: "Mesurer I₁ dans la branche R", test: () => M().I1 !== null },
        { id: 't3c', t: "E₂ seul : éteindre E₁ et le remplacer par un fil (E₁+ → E₁−)", test: () => S.tp3.on2 && !S.tp3.on1 && !!T().e1Short },
        { id: 't3d', t: "Mesurer I₂ dans la branche R", test: () => M().I2 !== null },
        { id: 't3e', t: "Rétablir les deux générateurs et mesurer I_total", test: () => M().Itot !== null },
        { id: 't3f', t: "Vérifier le théorème : I_total = I₁ + I₂", test: () => superpositionOk() },
        { id: 't3g', t: "Reporter I₁, I₂ et I_total sur la feuille", test: () => S.tp3.recSup }
    ],
    TP3_4: [
        { id: 't4a', t: "Disposer de V₀ et I₀ (mesurés à la manipulation 1)", test: () => M().V0 !== null && M().I0 !== null },
        { id: 't4b', t: "Calculer R_Th = V₀ / I₀ et régler le rhéostat à cette valeur", test: () => theoChecks().rheoOk },
        { id: 't4c', t: "Régler le générateur sur E_Th = V₀", test: () => theoChecks().voltageOk && theoChecks().oneGen },
        { id: 't4d', t: "Monter le circuit équivalent : E_Th → R_Th → R (R₁ et R₂ débranchés)", test: () => theoChecks().built },
        { id: 't4e', t: "Mesurer I_Th et le comparer à I_R du circuit réel", test: () => theoChecks().verified },
        { id: 't4f', t: "Reporter R_Th et I_Th sur la feuille", test: () => S.tp3.recTh }
    ],
    TP3_5: [
        { id: 't5a', t: "Disposer de V₀ et I₀ (mesurés à la manipulation 1)", test: () => M().V0 !== null && M().I0 !== null },
        { id: 't5b', t: "Régler le rhéostat sur R_No = R_Th = V₀ / I₀", test: () => nortonChecks().rheoOk },
        { id: 't5c', t: "Passer un générateur en mode CC et régler I_No = I₀", test: () => nortonChecks().oneCC && nortonChecks().currentOk },
        { id: 't5d', t: "Monter le montage : I_No, R_No et R en PARALLÈLE entre A et B", test: () => nortonChecks().built },
        { id: 't5e', t: "Mesurer le courant dans R et le comparer à I_R du circuit réel", test: () => nortonChecks().verified },
        { id: 't5f', t: "Reporter R_No et I_No sur la feuille", test: () => S.tp3.recNo }
    ]
};
