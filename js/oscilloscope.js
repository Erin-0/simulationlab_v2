/* =====================================================================
   js/oscilloscope.js  —  Écrans du TP 2 : oscilloscope bicanal + GBF

   Rendu Canvas 2D des textures :
     1. l'écran de l'oscilloscope (réticule, deux voies INDÉPENDANTES,
        déclenchement, repères de masse, OSD de mesure) ;
     2. l'afficheur LCD du générateur basses fréquences.

   Règle physique absolue : une voie n'affiche un signal que si sa sonde est
   réellement raccordée au circuit (pointe ET pince de masse).  Sinon on voit
   une ligne plate à zéro, exactement comme sur l'appareil réel — et le motif
   est écrit à l'écran (« NO SIG »).  Voir js/ac_solver.js pour la détection.
   ===================================================================== */

import { S, fr } from './state.js';

/* ------------------------------------------------------------------ */
/*  1. Gammes étalonnées                                               */
/* ------------------------------------------------------------------ */

export const TIME_DIVS = [
    1e-6, 2e-6, 5e-6, 10e-6, 20e-6, 50e-6, 100e-6, 200e-6, 500e-6,
    1e-3, 2e-3, 5e-3, 10e-3, 20e-3, 50e-3
];

export const VOLT_DIVS = [0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0];

/** Formate une base de temps (ex. « 100 µs », « 2 ms »). */
export function formatTimeDiv(t) {
    if (t < 1e-3) return `${Math.round(t * 1e6 * 1e3) / 1e3} µs`.replace('.', ',');
    if (t < 1) return `${Math.round(t * 1e3)} ms`;
    return `${t} s`;
}

/** Formate une sensibilité verticale (ex. « 500 mV », « 2 V »). */
export function formatVoltDiv(v) {
    if (v < 1) return `${Math.round(v * 1000)} mV`;
    return `${v} V`;
}

/** Formate une tension crête-à-crête avec l'unité adaptée. */
export function formatVpp(v) {
    if (!Number.isFinite(v) || v === 0) return '0,00 V';
    if (v < 1) return (v * 1000).toFixed(0).replace('.', ',') + ' mV';
    return fr(v, 2) + ' V';
}

/** Pas d'une gamme : renvoie la valeur voisine dans la liste (cyclique). */
export function stepRange(list, current, dir) {
    let i = list.indexOf(current);
    if (i < 0) {                                   // valeur hors gamme : on s'y ramène
        i = list.reduce((best, v, k) => Math.abs(v - current) < Math.abs(list[best] - current) ? k : best, 0);
    }
    return list[(i + dir + list.length) % list.length];
}

/* ------------------------------------------------------------------ */
/*  2. Écran de l'oscilloscope bicanal                                 */
/* ------------------------------------------------------------------ */

const CH1_COLOR = '#facc15', CH1_GLOW = '#eab308';
const CH2_COLOR = '#38bdf8', CH2_GLOW = '#0284c7';

/**
 * Rendu complet de l'écran.
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} c
 */
export function renderOscilloscopeScreen(canvas, c) {
    const W = canvas.width, H = canvas.height;

    /* ---- fond d'écran ---- */
    const grad = c.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.7);
    grad.addColorStop(0, '#06130e');
    grad.addColorStop(1, '#020705');
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);
    c.shadowBlur = 0;

    /* ---- géométrie de la grille (10 × 8 divisions) ---- */
    const mx = 34, my = 30;
    const gw = W - mx - 46;
    const gh = H - my - 34;
    const divX = gw / 10, divY = gh / 8;
    const cx = mx + 5 * divX, cy = my + 4 * divY;

    c.strokeStyle = 'rgba(40,160,110,0.20)';
    c.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
        const x = mx + i * divX;
        c.beginPath(); c.moveTo(x, my); c.lineTo(x, my + gh); c.stroke();
    }
    for (let j = 0; j <= 8; j++) {
        const y = my + j * divY;
        c.beginPath(); c.moveTo(mx, y); c.lineTo(mx + gw, y); c.stroke();
    }
    /* réticule central gradué */
    c.strokeStyle = 'rgba(70,220,140,0.40)';
    c.lineWidth = 1.2;
    for (let k = 0; k <= 50; k++) {
        const x = mx + (k / 50) * gw, tick = (k % 5 === 0) ? 6 : 3;
        c.beginPath(); c.moveTo(x, cy - tick); c.lineTo(x, cy + tick); c.stroke();
    }
    for (let l = 0; l <= 40; l++) {
        const y = my + (l / 40) * gh, tick = (l % 5 === 0) ? 6 : 3;
        c.beginPath(); c.moveTo(cx - tick, y); c.lineTo(cx + tick, y); c.stroke();
    }

    /* ---- puissance / absence de signal ---- */
    const powered = S.gbfOn && !S.gbfShort;

    /* ---- tracé des deux voies, chacune selon SA sonde ---- */
    drawTrace(c, S.ch1, { mx, my, gw, gh, divX, divY, cy, vdiv: S.osc.ch1VDiv, pos: S.osc.ch1Pos, color: CH1_COLOR, glow: CH1_GLOW, tag: '1', powered });
    drawTrace(c, S.ch2, { mx, my, gw, gh, divX, divY, cy, vdiv: S.osc.ch2VDiv, pos: S.osc.ch2Pos, color: CH2_COLOR, glow: CH2_GLOW, tag: '2', powered });

    /* ---- niveau de déclenchement (flèche à droite de la grille) ---- */
    const srcV = S.osc.triggerSrc === 'CH2' ? S.osc.ch2VDiv : S.osc.ch1VDiv;
    const srcPos = S.osc.triggerSrc === 'CH2' ? S.osc.ch2Pos : S.osc.ch1Pos;
    const trigY = cy - (S.osc.triggerLevel / srcV + srcPos) * divY;
    c.strokeStyle = S.trig.ok ? '#4ade80' : '#f87171';
    c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(mx + gw + 3, trigY); c.lineTo(mx + gw + 15, trigY); c.stroke();
    c.beginPath();
    c.moveTo(mx + gw + 3, trigY); c.lineTo(mx + gw + 11, trigY - 5); c.lineTo(mx + gw + 11, trigY + 5);
    c.closePath(); c.fillStyle = S.trig.ok ? '#4ade80' : '#f87171'; c.fill();
    c.font = '600 10px "JetBrains Mono",monospace';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('T', mx + gw + 17, trigY);

    /* ---- repères de masse des voies (flèches à gauche de la grille) ---- */
    groundMark(c, mx - 15, cy - S.osc.ch1Pos * divY, CH1_COLOR, '1', my, my + gh);
    groundMark(c, mx - 28, cy - S.osc.ch2Pos * divY, CH2_COLOR, '2', my, my + gh);

    /* ---- OSD : en-tête ---- */
    c.font = '600 12px "JetBrains Mono",monospace';
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.fillStyle = CH1_COLOR;
    c.fillText(`1  ${formatVoltDiv(S.osc.ch1VDiv)}/div  ${S.ch1.ok ? '' : 'NO SIG'}`, mx, my - 10);
    c.fillStyle = CH2_COLOR;
    c.fillText(`2  ${formatVoltDiv(S.osc.ch2VDiv)}/div  ${S.ch2.ok ? '' : 'NO SIG'}`, mx + 172, my - 10);
    c.textAlign = 'right';
    c.fillStyle = '#4ade80';
    c.fillText(`TB ${formatTimeDiv(S.osc.timeDiv)}/div`, mx + gw, my - 10);

    /* ---- OSD : pied d'écran ----
       AUCUNE mesure automatique : sur un vrai scope analogique de TP, on
       COMPTE les divisions.  U = N div × V/DIV · T = N div × TIME/DIV ·
       Δφ = Δx/T × 360°.  Seul l'état du déclenchement est affiché.       */
    c.textAlign = 'right';
    if (!powered) { c.fillStyle = '#94a3b8'; c.fillText('GBF OFF', mx + gw, H - 8); }
    else if (S.gbfShort) { c.fillStyle = '#f87171'; c.fillText('SHORT !', mx + gw, H - 8); }
    else if (S.trig.ok) { c.fillStyle = '#4ade80'; c.fillText("TRIG'D", mx + gw, H - 8); }
    else if (S.ch1.ok || S.ch2.ok) { c.fillStyle = '#fbbf24'; c.fillText('AUTO', mx + gw, H - 8); }
    else { c.fillStyle = '#f87171'; c.fillText('NO SIG', mx + gw, H - 8); }
    c.textAlign = 'left';
    c.fillStyle = 'rgba(148,163,184,.75)';
    c.fillText('mesures : compter les divisions', mx, H - 8);

    /* ---- motif d'absence de signal, écrit au centre de la grille ---- */
    if (powered && !S.ch1.ok && !S.ch2.ok) {
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = 'rgba(248,113,113,.85)';
        c.font = '700 15px "JetBrains Mono",monospace';
        c.fillText('AUCUNE SONDE RACCORDÉE', cx, cy - 12);
        c.fillStyle = 'rgba(203,213,225,.6)';
        c.font = '500 11px "JetBrains Mono",monospace';
        c.fillText('CH1 → IN+ / masse   ·   CH2 → OUT+ / masse', cx, cy + 10);
        c.textBaseline = 'alphabetic';
    } else if (!powered) {
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = 'rgba(148,163,184,.7)';
        c.font = '700 15px "JetBrains Mono",monospace';
        c.fillText(S.gbfShort ? 'COURT-CIRCUIT SORTIE GBF' : 'GBF HORS TENSION', cx, cy);
        c.textBaseline = 'alphabetic';
    }
}

/** Repère de masse d'une voie (petite flèche à gauche de la grille). */
function groundMark(c, x, y, color, tag, yMin = -Infinity, yMax = Infinity) {
    if (!Number.isFinite(y)) return;
    y = Math.max(yMin, Math.min(yMax, y));
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x + 11, y); c.lineTo(x + 2, y - 5); c.lineTo(x + 2, y + 5);
    c.closePath(); c.fill();
    c.font = '700 9px "JetBrains Mono",monospace';
    c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillText(tag, x, y);
    c.textBaseline = 'alphabetic';
}

/** Trace (ou ligne plate) d'une seule voie. */
function drawTrace(c, meas, o) {
    const { mx, my, gw, gh, divY, cy, vdiv, pos, color, glow, powered } = o;
    const zeroY = cy - pos * divY;

    c.save();
    c.beginPath(); c.rect(mx, my, gw, gh); c.clip();

    /* ligne de référence (masse de la voie) */
    c.strokeStyle = 'rgba(148,163,184,.28)';
    c.lineWidth = 1;
    c.setLineDash([3, 4]);
    c.beginPath(); c.moveTo(mx, zeroY); c.lineTo(mx + gw, zeroY); c.stroke();
    c.setLineDash([]);

    if (!powered || !meas.ok || !(meas.vpp > 1e-9)) {
        /* aucun signal : ligne plate sur le zéro de la voie, comme en vrai */
        c.strokeStyle = color;
        c.globalAlpha = (powered && meas.ok) ? 0.95 : 0.45;
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(mx, zeroY); c.lineTo(mx + gw, zeroY); c.stroke();
        c.globalAlpha = 1;
        c.restore();
        return;
    }

    /* ---- signal : on cale le balayage sur le déclenchement ---- */
    const w = 2 * Math.PI * S.gbfFreq;
    const tSpan = 10 * S.osc.timeDiv;
    const t0 = S.trig.ok ? S.trig.offset : 0;
    const amp = meas.vpp / 2;
    const pts = 260;

    c.strokeStyle = color;
    c.shadowColor = glow;
    c.shadowBlur = 8;
    c.lineWidth = 2.2;
    c.beginPath();
    for (let i = 0; i < pts; i++) {
        const frac = i / (pts - 1);
        const t = t0 + frac * tSpan;
        const v = amp * Math.sin(w * t + meas.phase);
        const px = mx + frac * gw;
        const py = cy - (v / vdiv + pos) * divY;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.stroke();
    c.shadowBlur = 0;
    c.restore();
}

/* ------------------------------------------------------------------ */
/*  3. Afficheur LCD du générateur basses fréquences                   */
/* ------------------------------------------------------------------ */

/**
 * Dessine l'écran du GBF.  Un générateur affiche SES propres consignes
 * (fréquence, amplitude, forme d'onde, impédance de sortie) : il ne peut pas
 * connaître le gain du filtre qu'on y branche — ce gain se lit sur
 * l'oscilloscope, pas ici.
 */
export function renderGBFDisplay(lcd) {
    const { ctx: c2, tex } = lcd;
    const W = c2.canvas.width, H = c2.canvas.height;

    const bg = c2.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0c2238');
    bg.addColorStop(1, '#040d17');
    c2.fillStyle = bg;
    c2.fillRect(0, 0, W, H);

    c2.strokeStyle = 'rgba(56,189,248,0.08)';
    c2.lineWidth = 1;
    for (let y = 6; y < H; y += 6) { c2.beginPath(); c2.moveTo(4, y); c2.lineTo(W - 4, y); c2.stroke(); }

    c2.textAlign = 'center'; c2.textBaseline = 'middle';

    if (!S.gbfOn) {
        c2.fillStyle = 'rgba(56,189,248,0.28)';
        c2.font = '700 22px "JetBrains Mono",monospace';
        c2.fillText('--- OFF ---', W / 2, H / 2);
        tex.needsUpdate = true;
        return;
    }

    /* en-tête : état de la sortie + forme d'onde */
    c2.textBaseline = 'top';
    c2.textAlign = 'left';
    c2.fillStyle = S.gbfShort ? '#f87171' : '#38bdf8';
    c2.font = '600 11px "JetBrains Mono",monospace';
    c2.fillText(S.gbfShort ? 'OUTPUT 50Ω [C.C.]' : 'OUTPUT 50Ω [ON]', 12, 9);
    c2.textAlign = 'right';
    c2.font = '700 14px "JetBrains Mono",monospace';
    c2.fillText('SINE ∿', W - 12, 8);

    /* valeur principale : fréquence */
    const f = S.gbfFreq;
    const isK = f >= 1000;
    c2.fillStyle = '#e0f2fe';
    c2.shadowColor = '#38bdf8'; c2.shadowBlur = 10;
    c2.font = '700 30px "JetBrains Mono",monospace';
    c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.fillText((isK ? (f / 1000).toFixed(3) : f.toFixed(1)) + ' ' + (isK ? 'kHz' : 'Hz'), W / 2, H * 0.5);
    c2.shadowBlur = 0;

    /* pied : PAS d'amplitude affichée — comme sur un vrai GBF de TP, le
       bouton d'amplitude est aveugle et Ue se MESURE à l'oscilloscope
       (CH1 : N div × V/DIV, fascicule tables 6/7/8).                      */
    c2.font = '600 11px "JetBrains Mono",monospace';
    c2.textAlign = 'left'; c2.textBaseline = 'bottom';
    c2.fillStyle = '#94a3b8';
    c2.fillText('AMPL : bouton analogique', 12, H - 7);
    c2.textAlign = 'right';
    c2.fillStyle = '#7dd3fc';
    c2.fillText('mesurez Ue au scope (N div × V/DIV)', W - 12, H - 7);

    tex.needsUpdate = true;
}

/* ------------------------------------------------------------------ */
/*  4. Réglages : auto-échelle et choix des calibres                   */
/* ------------------------------------------------------------------ */

/** Choisit le calibre V/div qui fait occuper ~6 divisions au signal. */
export function pickVoltDiv(vpp) {
    const peak = Math.max(1e-3, (vpp || 0) / 2);
    for (const v of VOLT_DIVS) if (peak / v <= 3.4) return v;
    return VOLT_DIVS[VOLT_DIVS.length - 1];
}

/**
 * Auto-Scale : cale la base de temps sur ~2,5 périodes, choisit les
 * sensibilités verticales d'après les amplitudes MESURÉES par les sondes,
 * recentre les voies et remet le niveau de déclenchement à 0 V.
 */
export function autoScaleOscilloscope() {
    const f = Math.max(1, S.gbfFreq);
    const target = 0.25 / f;                       // 2,5 périodes sur 10 divisions

    /* distance logarithmique : les gammes d'appareil sont décadiques */
    let best = TIME_DIVS[0], minDiff = Infinity;
    for (const td of TIME_DIVS) {
        const d = Math.abs(Math.log(td / target));
        if (d < minDiff) { minDiff = d; best = td; }
    }
    S.osc.timeDiv = best;

    S.osc.ch1VDiv = pickVoltDiv(S.ch1.ok ? S.ch1.vpp : S.Ve);
    S.osc.ch2VDiv = pickVoltDiv(S.ch2.ok ? S.ch2.vpp : S.Vs);
    S.osc.ch1Pos = 0;
    S.osc.ch2Pos = 0;
    S.osc.triggerLevel = 0;
    S.osc.autoScale = true;
    return S.osc;
}
