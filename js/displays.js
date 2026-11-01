/* =====================================================================
   js/displays.js  —  mise à jour des afficheurs et des organes mobiles.

   Chaque TP ne dessine que SES appareils (les autres sont masqués) :
     TP 1 : LCD du générateur, voltmètre, ampèremètre, tambours chiffrés,
            voyant, bouton de tension, aiguille du galvanomètre ;
     TP 2 : écran de l'oscilloscope bicanal + LCD du GBF ;
     TP 3 : les deux alimentations (tension/courant + voyants CV/CC),
            le rhéostat (curseur et bouton) et les multimètres partagés.
   ===================================================================== */
import { S, ctx, VOLT_CALS, AMP_CALS, METER_NDIV } from './state.js';
import { drawLCD } from './textures.js';
import { renderOscilloscopeScreen, renderGBFDisplay } from './oscilloscope.js';

export function updateDisplays() {
    if (S.activeTP === 2) { updateTP2(); return; }
    if (S.activeTP === 3) { updateTP3(); return; }
    updateTP1();
}

/* ------------------------------------------------------------------ */
/*  TP 1 — mesure de résistances                                       */
/* ------------------------------------------------------------------ */
function updateTP1() {
    const { genLCD, dialKnobs, genLEDmat, voltKnob } = ctx;
    if (!genLCD) return;

    if (S.faultShort) drawLCD(genLCD, 'SC !!', 'PROTECTION', '#ff8a7a');
    else if (S.genOn) drawLCD(genLCD, S.setV.toFixed(1), 'VOLTS ⎓ (consigne)', '#ffd98a');
    else drawLCD(genLCD, '−−.−', 'OFF', 'rgba(125,150,140,.5)');

    drawMeters();
    drawDrums(S.digits);

    if (genLEDmat) genLEDmat.emissiveIntensity = S.genOn ? 2.2 : 0;
    if (voltKnob) voltKnob.rotation.z = -((S.setV / 15) * 1.5 * Math.PI - .75 * Math.PI);

    (dialKnobs || []).forEach((d, i) => {
        d.rotation.z = -S.digits[i] * (Math.PI * 2 / 10);
        d.userData.tip = `Décade ${['×1000', '×100', '×10', '×1'][i]} — clic : +1 · Maj+clic / molette : −1 (Rv = ${S.Rv} Ω)`;
    });
}

/* ------------------------------------------------------------------ */
/*  TP 2 — oscilloscope + GBF                                          */
/* ------------------------------------------------------------------ */
function updateTP2() {
    if (ctx.oscCanvas && ctx.oscCtx) {
        renderOscilloscopeScreen(ctx.oscCanvas, ctx.oscCtx);
        if (ctx.oscTexture) ctx.oscTexture.needsUpdate = true;
    }
    if (ctx.gbfLCD) renderGBFDisplay(ctx.gbfLCD);
}

/* ------------------------------------------------------------------ */
/*  TP 3 — deux alimentations, rhéostat, multimètres partagés          */
/* ------------------------------------------------------------------ */
function updateTP3() {
    const t3 = S.tp3;
    if (ctx.e1LCD) renderSupplyLCD(ctx.e1LCD, t3, 1);
    if (ctx.e2LCD) renderSupplyLCD(ctx.e2LCD, t3, 2);

    /* voyants CV (vert) / CC (rouge) */
    const cv = (on, cc) => (on ? (cc ? 0 : 2.4) : 0);
    const cc = (on, ccm) => (on && ccm ? 2.4 : 0);
    if (ctx.e1CV) ctx.e1CV.emissiveIntensity = cv(t3.on1, t3.cc1);
    if (ctx.e1CC) ctx.e1CC.emissiveIntensity = cc(t3.on1, t3.cc1);
    if (ctx.e2CV) ctx.e2CV.emissiveIntensity = cv(t3.on2, t3.cc2);
    if (ctx.e2CC) ctx.e2CC.emissiveIntensity = cc(t3.on2, t3.cc2);

    /* boutons de tension : l'index suit la consigne (0…15 V sur 270°) */
    if (ctx.e1Knob) ctx.e1Knob.rotation.z = -((t3.E1 / 15) * 1.5 * Math.PI - .75 * Math.PI);
    if (ctx.e2Knob) ctx.e2Knob.rotation.z = -((t3.E2 / 15) * 1.5 * Math.PI - .75 * Math.PI);

    /* curseur du rhéostat : position proportionnelle à la valeur réglée */
    if (ctx.rheoSlider) {
        const f = Math.max(0, Math.min(1, t3.rheo / t3.rheoMax));
        ctx.rheoSlider.position.x = -0.13 + f * 0.26;
    }
    if (ctx.rheoKnob) ctx.rheoKnob.rotation.z = -(t3.rheo / t3.rheoMax) * Math.PI * 6;

    drawMeters();
}

/**
 * Afficheur d'une alimentation de paillasse : tension à gauche, courant à
 * droite (ce que délivre réellement l'appareil, mesuré par le solveur), et
 * le mode CV/CC.  Éteint : « --- » comme sur l'appareil réel.
 */
export function renderSupplyLCD(lcd, t3, which) {
    const { ctx: c2, tex } = lcd;
    const W = c2.canvas.width, H = c2.canvas.height;
    const on = which === 1 ? t3.on1 : t3.on2;
    const ccMode = which === 1 ? t3.cc1 : t3.cc2;
    const uSet = which === 1 ? t3.E1 : t3.E2;
    const iSet = which === 1 ? t3.i1 : t3.i2;
    const uOut = which === 1 ? (t3.VE1 || 0) : (t3.VE2 || 0);
    const iOut = which === 1 ? (t3.IE1 || 0) : (t3.IE2 || 0);

    c2.fillStyle = '#04080b';
    c2.fillRect(0, 0, W, H);
    c2.strokeStyle = 'rgba(125,255,216,.10)';
    c2.lineWidth = 1;
    for (let y = 4; y < H; y += 5) { c2.beginPath(); c2.moveTo(0, y); c2.lineTo(W, y); c2.stroke(); }

    c2.textAlign = 'center';
    c2.textBaseline = 'middle';

    if (!on) {
        c2.fillStyle = 'rgba(125,255,216,.22)';
        c2.font = '700 40px "JetBrains Mono",monospace';
        c2.fillText('---.--', W * 0.196, H / 2);
        c2.fillText('-.---', W * 0.804, H / 2);
        c2.fillStyle = 'rgba(148,163,184,.5)';
        c2.font = '600 18px "JetBrains Mono",monospace';
        c2.fillText('OFF', W / 2, H / 2);
        tex.needsUpdate = true;
        return;
    }

    /* tension affichée : la consigne en CV, la tension réelle en CC */
    const uTxt = ccMode ? Math.abs(uOut).toFixed(2) : uSet.toFixed(2);
    const iTxt = ccMode ? Math.abs(iSet).toFixed(3) : Math.abs(iOut).toFixed(3);

    c2.fillStyle = '#7dffd8';
    c2.shadowColor = '#0d9488'; c2.shadowBlur = 8;
    c2.font = '700 44px "JetBrains Mono",monospace';
    c2.fillText(uTxt, W * 0.196, H * 0.52);
    c2.fillStyle = ccMode ? '#ffb4a2' : '#9be8ff';
    c2.fillText(iTxt, W * 0.804, H * 0.52);
    c2.shadowBlur = 0;

    c2.font = '600 16px "JetBrains Mono",monospace';
    c2.fillStyle = 'rgba(125,255,216,.6)';
    c2.fillText('V', W * 0.196 + 74, H * 0.52);
    c2.fillStyle = 'rgba(155,232,255,.6)';
    c2.fillText('A', W * 0.804 + 74, H * 0.52);

    /* bandeau de mode */
    c2.font = '700 17px "JetBrains Mono",monospace';
    c2.fillStyle = ccMode ? '#ff6b6b' : '#4ade80';
    c2.fillText(ccMode ? 'CC' : 'CV', W / 2, H * 0.3);
    if (S.faultShort) { c2.fillStyle = '#ff8a7a'; c2.fillText('PROT', W / 2, H * 0.74); }
    else if (S.tp3Saturated) { c2.fillStyle = '#fbbf24'; c2.fillText('SAT', W / 2, H * 0.74); }

    tex.needsUpdate = true;
}

/** Voltmètre et ampèremètre (partagés par le TP 1 et le TP 3) : AIGUILLES.
 *  On fixe ici la division CIBLE de chaque aiguille ; animateMeters() anime
 *  le ressort.  Rien de numérique n'est affiché : la lecture se fait à la
 *  division près sur le cadran, comme avec un vrai appareil analogique.
 *      déviation (div) = valeur / calibre × 100
 *  Au-delà du calibre, l'aiguille BUTE (106 div) et le voyant OL s'allume :
 *  il faut monter de calibre — exactement le geste du fascicule.          */
function drawMeters() {
    const { voltPivot, ammPivot, voltOL, ammOL } = ctx;
    if (!voltPivot || !ammPivot) return;
    const cV = VOLT_CALS[S.voltCal], cA = AMP_CALS[S.ammCal];
    const k = S.faultShort ? 0 : 1;          // court-circuit : protection, tout à zéro
    const divV = k * (S.UV / cV) * METER_NDIV;
    const divA = k * (S.IA * 1000 / cA) * METER_NDIV;
    /* pince entre la butée mécanique (0) et la fin de course (106 div) ;
       une valeur négative laisse l'aiguille collée à zéro (bornes inversées) */
    voltPivot.userData.divTarget = Math.max(0, Math.min(divV, METER_NDIV * 1.06));
    ammPivot.userData.divTarget = Math.max(0, Math.min(divA, METER_NDIV * 1.06));
    if (voltOL) voltOL.emissiveIntensity = (!S.faultShort && S.UV > cV) ? 2.2 : 0;
    if (ammOL) ammOL.emissiveIntensity = S.overload ? 2.2 : 0;
}

/** Ce que l'aiguille MONTRE à l'instant (en divisions, animées) — sert à la
 *  recopie papier : on recopie la lecture de l'aiguille, pas la vérité du
 *  solveur.  La valeur lue = round(div) × calibre / 100 (demi-division). */
export function readMeterDiv(kind) {
    const p = kind === 'V' ? ctx.voltPivot : ctx.ammPivot;
    return (p && p.userData.div != null) ? p.userData.div : null;
}

/** Oriente les sélecteurs de calibre sur la position courante (120°→−120°). */
export function updateMetersCal() {
    if (ctx.voltSel) ctx.voltSel.rotation.z = (2 - S.voltCal) * Math.PI / 3;
    if (ctx.ammSel) ctx.ammSel.rotation.z = (2 - S.ammCal) * Math.PI / 3;
}

/* ------------------------------------------------------------------ */
/*  Animations mécaniques (appelées à chaque image par main.js)        */
/* ------------------------------------------------------------------ */

/** Aiguille du galvanomètre : ressort amorti vers la position d'équilibre. */
export const galvo = { angle: 0, vel: 0 };

export function animateGalvo(dt) {
    const pivot = ctx.galvoPivot;
    if (!pivot || S.activeTP !== 1) return;
    const target = Math.max(-.62, Math.min(.62, Math.tanh(S.Vg / .02) * .62));
    galvo.vel += ((target - galvo.angle) * 26 - galvo.vel * 7) * dt;
    galvo.angle += galvo.vel * dt;
    pivot.rotation.z = -galvo.angle;
}

/** Aiguilles des multimètres : ressort amorti vers la division cible
 *  (léger dépassement comme un vrai équipage mobile). */
export function animateMeters(dt) {
    const step = (p) => {
        if (!p) return;
        const u = p.userData;
        const tgt = u.divTarget || 0;
        u.vel += ((tgt - u.div) * 140 - u.vel * 13) * dt;
        u.div += u.vel * dt;
        if (Math.abs(tgt - u.div) < .002 && Math.abs(u.vel) < .002) { u.div = tgt; u.vel = 0; }
        p.rotation.z = 1.24 * (.5 - u.div / METER_NDIV);
    };
    step(ctx.voltPivot);
    step(ctx.ammPivot);
}

/** Leviers des deux alimentations du TP 3 (mouvement amorti). */
export function animateTP3(dt) {
    if (S.activeTP !== 3) return;
    const t3 = S.tp3;
    const lerp = (o, target) => { if (o) o.rotation.x += (target - o.rotation.x) * Math.min(1, dt * 12); };
    lerp(ctx.e1Pivot, t3.on1 ? .45 : -.45);
    lerp(ctx.e2Pivot, t3.on2 ? .45 : -.45);
}

/* ------------------------------------------------------------------ */
/*  Tambours chiffrés de la boîte à décades (TP 1, niveau B)           */
/*                                                                     */
/*  Comme sur une vraie boîte : un cylindre ivoire tourne derrière une  */
/*  fenêtre, on voit le chiffre du milieu et un bout des deux voisins.  */
/* ------------------------------------------------------------------ */
export function drawDrums(digits) {
    const wins = ctx.digitWins || [];
    wins.forEach((d, i) => {
        const { ctx: c2, tex } = d;
        if (!c2 || !c2.canvas) return;
        const W = c2.canvas.width, H = c2.canvas.height;
        const cur = ((digits && digits[i]) || 0) % 10;
        const prevD = (cur + 9) % 10, next = (cur + 1) % 10;

        const g = c2.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#8d8468'); g.addColorStop(.18, '#ded5b6');
        g.addColorStop(.5, '#f6f0da'); g.addColorStop(.82, '#ded5b6');
        g.addColorStop(1, '#8d8468');
        c2.fillStyle = g; c2.fillRect(0, 0, W, H);

        c2.textAlign = 'center'; c2.textBaseline = 'middle';
        c2.fillStyle = 'rgba(40,36,26,.45)';
        c2.font = '700 ' + (H * .34 | 0) + 'px "JetBrains Mono",monospace';
        c2.fillText(String(prevD), W / 2, H * .12);
        c2.fillText(String(next), W / 2, H * .88);
        c2.fillStyle = '#1d1a12';
        c2.font = '700 ' + (H * .52 | 0) + 'px "JetBrains Mono",monospace';
        c2.fillText(String(cur), W / 2, H / 2 + 1);

        c2.strokeStyle = '#c0392b'; c2.lineWidth = 2;
        c2.beginPath(); c2.moveTo(2, H / 2); c2.lineTo(10, H / 2); c2.stroke();
        c2.beginPath(); c2.moveTo(W - 10, H / 2); c2.lineTo(W - 2, H / 2); c2.stroke();
        c2.fillStyle = 'rgba(0,0,0,.32)'; c2.fillRect(0, 0, W, 5); c2.fillRect(0, H - 5, W, 5);
        c2.strokeStyle = 'rgba(0,0,0,.55)'; c2.lineWidth = 4; c2.strokeRect(2, 2, W - 4, H - 4);
        tex.needsUpdate = true;
    });
}
