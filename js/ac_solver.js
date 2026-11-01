/* =====================================================================
   js/ac_solver.js  —  Moteur harmonique & réponse fréquentielle (TP 2)

   Modélise les filtres passifs du 1er ordre du fascicule (p. 10, 11, 14) :
     1. Passe-bas   (RC)    : H = 1 / (1 + jωR₁C₁)              fc ≈ 3288 Hz
     2. Passe-haut  (CR)    : H = jωR₁C₁ / (1 + jωR₁C₁)         fc ≈ 3288 Hz
     3. Passe-bande (RC-CR) : H = jωR₂C₂ / ((1+jωR₁C₁)(1+jωR₂C₂))
                              fc1 ≈ 329 Hz (coupure basse, R₂C₂)
                              fc2 ≈ 3288 Hz (coupure haute, R₁C₁)

   Deux parties distinctes :
     A) la réponse THÉORIQUE du filtre (module, gain dB, phase, asymptotes) ;
     B) ce que MESURE réellement l'oscilloscope : chaque voie n'affiche un
        signal que si sa sonde est raccordée (pointe ET masse) à un nœud du
        circuit effectivement alimenté.  Aucune sonde ⇒ écran plat.

   Liaisons internes au matériel (non négociables, comme sur l'appareil réel) :
     • la maquette partage un rail de masse commun : TP2_IN− ≡ TP2_OUT− ;
     • les deux masses de l'oscilloscope sont communes entre elles (et à la
       terre) : OSC_CH1− ≡ OSC_CH2−.  Relier ces deux masses à deux points
       différents court-circuite donc le montage — comportement réel, signalé.
   ===================================================================== */

import { S } from './state.js';
import { unionFind } from './circuit.js';
import { sfx } from './audio.js';

const TWO_PI = 2 * Math.PI;

/* ---------- petit calcul complexe (évite les erreurs d'algèbre) ---------- */
const C = (re, im = 0) => ({ re, im });
const cAdd = (a, b) => C(a.re + b.re, a.im + b.im);
const cSub = (a, b) => C(a.re - b.re, a.im - b.im);
const cMul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cDiv = (a, b) => {
    const d = b.re * b.re + b.im * b.im;
    return d === 0 ? C(0, 0) : C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const cAbs = (a) => Math.hypot(a.re, a.im);
const cArg = (a) => Math.atan2(a.im, a.re);
const ZERO = C(0, 0);

/* ------------------------------------------------------------------ */
/*  A. Formules théoriques des filtres passifs                         */
/* ------------------------------------------------------------------ */

/** Fréquence de coupure théorique fc = 1 / (2π·R·C) */
export function cutoffFreq(R, C_) {
    if (!(R > 0) || !(C_ > 0)) return 0;
    return 1 / (TWO_PI * R * C_);
}

/**
 * Fonction de transfert COMPLEXE H(jω) du filtre choisi.
 * @returns {{re:number, im:number}}
 */
export function transferComplex(filterType, f) {
    const t1 = S.tp2_R1 * S.tp2_C1;      // τ₁ = R₁C₁ (48,4 µs) → 3288 Hz
    const t2 = S.tp2_R2 * S.tp2_C2;      // τ₂ = R₂C₂ (484 µs)  → 329 Hz
    const w = TWO_PI * Math.max(1e-6, f);
    const jw1 = C(0, w * t1), jw2 = C(0, w * t2);
    const d1 = cAdd(C(1), jw1), d2 = cAdd(C(1), jw2);

    switch (filterType) {
        case 'RC':    return cDiv(C(1), d1);            // passe-bas
        case 'CR':    return cDiv(jw1, d1);             // passe-haut
        /* Cascade RC puis CR : l'étage passe-haut est R₂C₂ (coupure BASSE
           329 Hz) et l'étage passe-bas R₁C₁ (coupure HAUTE 3288 Hz).  Le
           numérateur porte donc τ₂ : c'est lui qui bloque le continu.     */
        case 'RC-CR': return cDiv(jw2, cMul(d1, d2));   // passe-bande
        default:      return ZERO;
    }
}

/**
 * Réponse fréquentielle complète à la fréquence f.
 * @returns {{mag,gainDb,phaseRad,phaseDeg,Vs,fc,x,asympDb,H}}
 */
export function computeFilterResponse(filterType, f, Ve = 6.0) {
    const R1 = S.tp2_R1, C1 = S.tp2_C1, R2 = S.tp2_R2, C2 = S.tp2_C2;
    const H = transferComplex(filterType, f);
    const mag = cAbs(H);
    const phaseRad = cArg(H);

    const fcHP = cutoffFreq(R1, C1);     // 3288,4 Hz
    const fcLP = cutoffFreq(R2, C2);     //  328,8 Hz
    let fc = fcHP, x = 0, asympDb = 0;

    if (filterType === 'RC') {
        x = f / fcHP;
        asympDb = (f <= fcHP) ? 0 : -20 * Math.log10(x);
    } else if (filterType === 'CR') {
        x = f / fcHP;
        asympDb = (f >= fcHP) ? 0 : 20 * Math.log10(x);
    } else if (filterType === 'RC-CR') {
        fc = [fcLP, fcHP];
        x = f / Math.sqrt(fcLP * fcHP);
        if (f < fcLP) asympDb = 20 * Math.log10(f / fcLP);
        else if (f > fcHP) asympDb = -20 * Math.log10(f / fcHP);
        else asympDb = 0;
    }

    const gainDb = (mag > 1e-9) ? 20 * Math.log10(mag) : -120;
    return {
        mag, gainDb, phaseRad, phaseDeg: phaseRad * 180 / Math.PI,
        Vs: Ve * mag, fc, x, asympDb, H
    };
}

/** Fréquence centrale du passe-bande f0 = √(fc1·fc2) ≈ 1040 Hz */
export function bandCenterFreq() {
    return Math.sqrt(cutoffFreq(S.tp2_R2, S.tp2_C2) * cutoffFreq(S.tp2_R1, S.tp2_C1));
}

/* ------------------------------------------------------------------ */
/*  B. Échantillonnage pour l'affichage temps réel                     */
/* ------------------------------------------------------------------ */

/**
 * Échantillonne ve(t) et vs(t) sur la fenêtre balayée.
 * @param {number} f        fréquence (Hz)
 * @param {number} Ve       amplitude crête-à-crête d'entrée
 * @param {number} Vs       amplitude crête-à-crête de sortie
 * @param {number} phaseRad déphasage de vs par rapport à ve
 * @param {number} tSpan    durée totale de la fenêtre (s)
 * @param {number} t0       instant de départ (déclenchement)
 */
export function sampleWaveforms(f, Ve, Vs, phaseRad, tSpan, samples = 200, t0 = 0) {
    const t = new Float32Array(samples);
    const ve = new Float32Array(samples);
    const vs = new Float32Array(samples);
    const w = TWO_PI * f, ampE = Ve / 2, ampS = Vs / 2;
    for (let i = 0; i < samples; i++) {
        const time = t0 + (i / (samples - 1)) * tSpan;
        t[i] = time;
        ve[i] = ampE * Math.sin(w * time);
        vs[i] = ampS * Math.sin(w * time + phaseRad);
    }
    return { t, ve, vs };
}

/* ------------------------------------------------------------------ */
/*  C. Évaluation du montage câblé : ce que voit l'oscilloscope        */
/* ------------------------------------------------------------------ */

/* Liaisons internes du matériel (voir en-tête). */
const INTERNAL_BONDS = [['TP2_IN-', 'TP2_OUT-'], ['OSC_CH1-', 'OSC_CH2-']];

let prevFcHit = false, prevShortWarn = false, prevProbeWarn = { ch1: false, ch2: false };

/**
 * Analyse le câblage du TP 2, calcule la réponse du filtre et — surtout —
 * détermine ce que chaque voie de l'oscilloscope mesure VRAIMENT.
 */
export function evaluateAC(toast, refresh) {
    const withBonds = unionFind(INTERNAL_BONDS);
    const bare = unionFind();                 // sans les masses internes de l'appareil
    const n = (id) => withBonds.find(id);

    const gP = n('GBF+'), gM = n('GBF-');
    const inP = n('TP2_IN+'), rail = n('TP2_IN-'), outP = n('TP2_OUT+');
    const c1P = n('OSC_CH1+'), c1M = n('OSC_CH1-');
    const c2P = n('OSC_CH2+'), c2M = n('OSC_CH2-');

    /* ---- 1. défauts ---- */
    S.gbfShort = (gP === gM);
    S.faultShort = S.gbfShort && S.gbfOn;
    /* les deux masses de l'oscilloscope sont communes : si l'élève les relie à
       deux points différents du montage, il crée un court-circuit réel.       */
    S.scopeGndShort = (bare.find('OSC_CH1-') !== bare.find('OSC_CH2-')) && outP === rail;
    S.outShorted = (outP === rail) || (outP === inP);

    /* ---- 2. le GBF alimente-t-il l'entrée du filtre ? ---- */
    const driveOk = S.gbfOn && !S.gbfShort && inP !== rail &&
        ((gP === inP && gM === rail) || (gP === rail && gM === inP));
    S.loopOk = driveOk;
    S.tp2Driven = driveOk;

    /* ---- 3. potentiels complexes (amplitudes crête) des nœuds connus ---- */
    const Ae = S.gbfOn ? S.gbfAmp / 2 : 0;
    const pot = new Map();
    const put = (node, v) => { if (!pot.has(node)) pot.set(node, v); };
    if (S.gbfOn && !S.gbfShort) { put(gP, C(Ae)); put(gM, ZERO); }

    const resp = computeFilterResponse(S.tp2Filter, S.gbfFreq, S.gbfAmp);
    if (driveOk) {
        const vIn = cSub(pot.get(inP) || ZERO, pot.get(rail) || ZERO);
        const vOut = cAdd(pot.get(rail) || ZERO, cMul(resp.H, vIn));
        /* une sortie court-circuitée par un fil garde le potentiel du nœud commun */
        if (!S.outShorted) pot.set(outP, vOut);
    }

    /* ---- 4. mesure de chaque voie (pointe − masse) ---- */
    function probe(tipNode, gndNode, name) {
        const a = pot.get(tipNode), b = pot.get(gndNode);
        if (!S.gbfOn) return { vpp: 0, phase: 0, ok: false, why: `${name} : GBF hors tension` };
        if (!a || !b) return {
            vpp: 0, phase: 0, ok: false,
            why: `${name} : sonde non raccordée (pointe ou masse en l'air)`
        };
        if (tipNode === gndNode) return {
            vpp: 0, phase: 0, ok: false,
            why: `${name} : pointe et masse sur le même point (0 V)`
        };
        const d = cSub(a, b);
        const amp = cAbs(d);
        if (amp < 1e-6) return { vpp: 0, phase: 0, ok: true, why: '' };   // 0 V réel
        return { vpp: 2 * amp, phase: cArg(d), ok: true, why: '' };
    }

    const m1 = probe(c1P, c1M, 'CH1');
    const m2 = probe(c2P, c2M, 'CH2');
    S.ch1 = m1; S.ch2 = m2;

    /* ---- 5. grandeurs du filtre ---- */
    if (driveOk && !S.outShorted) {
        const vIn = cSub(pot.get(inP) || ZERO, pot.get(rail) || ZERO);
        S.Ve = 2 * cAbs(vIn);
        S.Vs = S.Ve * resp.mag;
        S.gainLin = resp.mag;
        S.gainDb = resp.gainDb;
        S.phaseRad = resp.phaseRad;
    } else {
        S.Ve = driveOk ? S.gbfAmp : 0;
        S.Vs = 0; S.gainLin = 0; S.gainDb = -99; S.phaseRad = 0;
    }

    /* gain MESURÉ à l'oscilloscope (le seul qui compte pour l'élève) */
    S.gainDbMeas = (m1.ok && m2.ok && m1.vpp > 1e-6)
        ? 20 * Math.log10(m2.vpp / m1.vpp) : null;
    S.phaseMeas = (m1.ok && m2.ok && m1.vpp > 1e-6)
        ? normPi(m2.phase - m1.phase) : null;

    /* ---- 6. déclenchement (trigger) sur la voie source ---- */
    updateTrigger();

    /* ---- 7. détection de la fréquence de coupure, sur la MESURE ---- */
    const gMeas = S.gainDbMeas;
    const isAtCutoff = gMeas !== null && Math.abs(gMeas - (-3.01)) < 0.5;
    if (isAtCutoff && !prevFcHit) {
        sfx.ok && sfx.ok();
        toast(`Fréquence de coupure atteinte : le gain vaut −3 dB à f = ${fmtFreq(S.gbfFreq)} — relevez cette fréquence, puis vérifiez G en comptant les divisions à l'oscilloscope (G = 20·log(Vs/Ve)).`, 'success');
    }
    prevFcHit = isAtCutoff;
    S.atCutoff = isAtCutoff;

    if (S.tp2Filter === 'RC-CR') {
        const f0 = bandCenterFreq();
        S.balanced = Math.abs(S.gbfFreq - f0) / f0 < 0.08;
    } else {
        S.balanced = isAtCutoff;
    }

    /* ---- 8. avertissements (une seule fois par transition) ---- */
    if (S.scopeGndShort && !prevShortWarn) {
        sfx.err && sfx.err();
        toast('Les masses CH1 et CH2 de l\'oscilloscope sont COMMUNES : ce câblage '
            + 'court-circuite la sortie du filtre. Reliez les deux pinces de masse au même point.', 'error');
    }
    prevShortWarn = S.scopeGndShort;

    warnProbe('ch1', m1, toast);
    warnProbe('ch2', m2, toast);

    refresh && refresh();
}

function warnProbe(key, m, toast) {
    const bad = !m.ok && S.gbfOn && S.loopOk;
    if (bad && !prevProbeWarn[key]) {
        toast(`Oscilloscope — ${m.why}. Aucun signal ne peut s'afficher sur cette voie.`, 'warn');
    }
    prevProbeWarn[key] = bad;
}

/** Remet dans [−π ; π[ */
function normPi(a) {
    while (a > Math.PI) a -= TWO_PI;
    while (a < -Math.PI) a += TWO_PI;
    return a;
}

/** Formate une fréquence pour l'affichage. */
export function fmtFreq(f) {
    return f >= 1000 ? (f / 1000).toFixed(2) + ' kHz' : (Math.round(f * 10) / 10) + ' Hz';
}

/**
 * Déclenchement réel : on cale le début du balayage sur le premier front
 * montant de la voie source qui traverse le niveau de trigger.  À défaut
 * (niveau hors d'amplitude), l'appareil passe en balayage libre « AUTO ».
 */
function updateTrigger() {
    const src = S.osc.triggerSrc === 'CH2' ? S.ch2 : S.ch1;
    const st = { ok: false, offset: 0, src: S.osc.triggerSrc };
    if (src.ok && src.vpp > 1e-9) {
        const A = src.vpp / 2, vtr = S.osc.triggerLevel;
        if (Math.abs(vtr) < A) {
            const w = TWO_PI * S.gbfFreq;
            /* A·sin(ωt + φ) = vtr avec cos(ωt + φ) > 0 (front montant) */
            const base = Math.asin(vtr / A) - src.phase;
            let t0 = base / w;
            const T = 1 / Math.max(1e-9, S.gbfFreq);
            t0 = ((t0 % T) + T) % T;
            st.ok = true; st.offset = t0;
        }
    }
    S.trig = st;
    return st;
}

/* ------------------------------------------------------------------ */
/*  D. Courbe de Bode théorique (papier semi-logarithmique)            */
/* ------------------------------------------------------------------ */

/**
 * Points théoriques répartis en échelle logarithmique, pour tracer la
 * courbe de référence sur la feuille de relevés.
 */
export function generateBodeCurve(filterType, fMin = 10, fMax = 100000, points = 60) {
    const data = [];
    const logMin = Math.log10(fMin), logMax = Math.log10(fMax);
    const step = (logMax - logMin) / (points - 1);
    for (let i = 0; i < points; i++) {
        const f = Math.pow(10, logMin + i * step);
        const r = computeFilterResponse(filterType, f, 6.0);
        data.push({ f, gainDb: r.gainDb, phaseDeg: r.phaseDeg, asympDb: r.asympDb });
    }
    return data;
}
