/* =====================================================================
   js/player.js  —  contrôleur première personne : verrouillage du
                    pointeur, déplacement (ZQSD + WASD), collisions avec
                    la table ronde et le bureau, loupe (zoom), accroupi,
                    survol / clic des objets, aperçu du fil en cours de
                    pose, et COUPS portés aux autres élèves.
   ===================================================================== */
import * as THREE from 'three';
import {
    S, ctx, ROOM, TABLE_R, DESK, DESK_ROT, EYE_STAND, EYE_CROUCH, ME,
    terminals, allTermIds, wireColor, interactives,
    VOLT_CALS, AMP_CALS, METER_NDIV, METER_CLASS
} from './state.js';
import { updateMetersCal } from './displays.js';
import { sfx, hum } from './audio.js';
import {
    initPreview, setPreviewVisible, updatePreviewGeometry, previewMat,
    previewTube, previewTip, tipPos, axisVec
} from './wiring.js';
import {
    pressStart, pressEnd, cancelGrab, isDragging, isHolding, draggableFor,
    rotateHeld, setFastSpin, isFastSpin
} from './drag.js';
import { toast, openChat, isChatOpen, isPaperOpen, setTargetChip, hurtFlash } from './hud.js';
import { TIME_DIVS, VOLT_DIVS, stepRange, autoScaleOscilloscope } from './oscilloscope.js';
import { sendState, sendPunch, sendHit } from './net.js';
import { nearestPeer, hurtPeer, peers as PEERS } from './avatar.js';
import { isCalcOpen, openCalculator } from './calculator.js';

/* ------------------------------------------------------------------ */
/*  État du joueur                                                     */
/* ------------------------------------------------------------------ */
export const P = {
    locked: false, started: false,
    hovered: null, hoveredPeer: null,
    pendingTerm: null,
    zoomOn: false, zoomT: 0,
    crouching: false,
    punchAnim: 0, punchCd: 0, hurt: 0,
    bob: 0, speed: 0
};

const FOV_BASE = 60, FOV_ZOOM = 22;
const PUNCH_RANGE = 2.0, PUNCH_CD = .55;

const keys = new Set();
const vel = new THREE.Vector3();
const impulse = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
raycaster.far = 5.5;

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3(), _dir = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const aimPt = new THREE.Vector3();

let eyeTarget = EYE_STAND;
let hooks = {};

/* Touches consommées par le jeu (déplacement, zoom, accroupi, course,
   réinitialisation…) : elles ne doivent JAMAIS atteindre le navigateur. */
const GAME_KEYS = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyC', 'KeyT',
    'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'Tab', 'Escape',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
]);
/* Touches vitales du navigateur : on ne les bloque pas. */
const BROWSER_KEYS = (e) => e.code === 'F5' || e.code === 'F12'
    || (e.code === 'KeyR' && (e.ctrlKey || e.metaKey))
    || (e.code === 'KeyI' && (e.ctrlKey || e.metaKey));
/* Un champ de saisie de l'interface a-t-il le focus ? */
const inTextField = () => {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable === true);
};

/* collisions : table ronde + bureau (AABB approché, marge du corps incluse).
   Marge réduite au strict minimum : l'élève doit pouvoir se serrer contre la
   paillasse pour lire les faces avant des appareils, et se pencher au-dessus
   du bord quand il est accroupi.                                     */
export const BODY_R = TABLE_R + .06;            // 1,08 m debout (bord à 1,02 m)
export const BODY_R_CROUCH = TABLE_R;           // 1,02 m accroupi : au ras du bord

// Demi-dimensions du bureau avec marge corporelle fine (0.06 m au lieu de 0.30 m)
const DESK_MARGIN = 0.06;
const DESK_HW = DESK.w / 2 + DESK_MARGIN;
const DESK_HD = DESK.d / 2 + DESK_MARGIN;

/* ------------------------------------------------------------------ */
/*  Initialisation                                                     */
/* ------------------------------------------------------------------ */
export function init(h) {
    hooks = h;
    initPreview(ctx.scene);

    document.addEventListener('pointerlockchange', () => {
        P.locked = document.pointerLockElement === ctx.renderer.domElement;
        if (!P.locked) cancelGrab();
        hooks.updateHint && hooks.updateHint();
    });

    document.addEventListener('mousemove', e => {
        if (!P.locked) return;
        /* la sensibilité suit le champ de vision => visée précise en zoom */
        const sens = .0021 * (ctx.camera.fov / FOV_BASE);
        ctx.yawObj.rotation.y -= e.movementX * sens;
        ctx.pitchObj.rotation.x = Math.max(-1.4, Math.min(1.4, ctx.pitchObj.rotation.x - e.movementY * sens));
    });

    ctx.renderer.domElement.addEventListener('click', () => {
        if (P.started && !P.locked && !isPaperOpen() && !isChatOpen()) lockPointer();
    });
    document.addEventListener('contextmenu', e => e.preventDefault());

    document.addEventListener('mousedown', e => {
        if (!P.locked) return;
        if (e.button === 0) {
            /* un autre élève sous le viseur ? -> on prépare le coup */
            if (P.hoveredPeer) return;                 // géré au mouseup (clic court)
            pressStart(P.hovered, e);
        } else if (e.button === 2) {
            /* objet en main : le bouton droit MAINTENU passe en rotation rapide */
            if (isDragging()) { setFastSpin(true); return; }
            if (isHolding()) return;                   // appui long en cours : on ne touche à rien
            secondaryAction();
        }
    });

    document.addEventListener('mouseup', e => {
        if (!P.locked) return;
        if (e.button === 2) { if (isFastSpin()) setFastSpin(false); return; }
        if (e.button !== 0) return;
        if (P.hoveredPeer) { tryPunch(P.hoveredPeer); return; }
        const consumed = pressEnd();
        if (consumed) return;
        primaryAction(e.shiftKey);
    });

    document.addEventListener('wheel', e => {
        /* Ctrl+molette = zoom du navigateur : à proscrire absolument.  Tant
           que la molette tourne au-dessus de la vue 3D, elle n'appartient
           qu'au jeu (les panneaux de l'interface gardent leur défilement). */
        if (e.ctrlKey && (P.locked || e.target === ctx.renderer.domElement)) { e.preventDefault(); return; }
        if (!P.locked) return;
        const d = e.deltaY < 0 ? 1 : -1;
        /* objet saisi : la molette le fait TOURNER sur lui-même */
        if (isDragging()) { rotateHeld(d); e.preventDefault(); return; }
        const u = P.hovered ? P.hovered.userData : null;
        if (u && u.kind === 'knobV') { adjustVoltage(d * .5); e.preventDefault(); return; }
        if (u && u.kind === 'dial') { adjustDial(u.index, d); e.preventDefault(); return; }
        /* réglages TP 2 / TP 3 : la molette remplace le zoom (pas fin) */
        if (u && ADJUSTABLE.has(u.kind)) {
            adjustControl(u.kind, d, e.shiftKey ? 'shift' : 'wheel');
            e.preventDefault(); return;
        }
        toggleZoom(d > 0);
        e.preventDefault();
    }, { passive: false });

    addEventListener('keydown', e => {
        /* Entrée = chat (jamais de touche dédiée pour la feuille : on clique dessus) */
        if (e.code === 'Enter' && !isChatOpen() && !isPaperOpen()) {
            if (P.started) {
                e.preventDefault();
                if (ME.solo) toast('Mode solo : personne à qui parler — profitez du laboratoire.', 'info');
                else openChat(true);
            }
            return;
        }
        if (isChatOpen() || isPaperOpen()) {
            if (e.code === 'Escape') { e.preventDefault(); hooks.closeOverlays && hooks.closeOverlays(); }
            return;                                    // le clavier appartient au formulaire
        }
        /* Un champ du HUD a le focus : le clavier lui appartient entièrement
           (sinon preventDefault empêcherait de saisir 112 dans « Rth calculé »). */
        if (inTextField()) {
            if (e.code === 'Escape') { e.preventDefault(); document.activeElement.blur(); }
            return;
        }
        /* ---- garde-fou « raccourcis du navigateur » --------------------
           Maj = courir, Ctrl = s'accroupir, E = zoom, molette = réglages.
           Sans précaution, Ctrl+molette ou Ctrl/Maj+E partent au navigateur
           (zoom arrière : tout rétrécit à l'écran) et la partie devient
           illisible.  On avale donc TOUTES les touches du jeu, avec ou sans
           modificateur, dès que la partie a commencé — sauf les touches
           vitales (F5, F12, Ctrl+R, Ctrl+Maj+I) laissées au navigateur.  */
        if (e.code === 'Tab' || GAME_KEYS.has(e.code) || e.ctrlKey || e.metaKey || e.altKey) {
            if (!BROWSER_KEYS(e)) e.preventDefault();
        }
        if (keys.has(e.code)) return;                  // pas d'auto-répétition pour les bascules
        keys.add(e.code);
        if (!P.started) return;
        if (e.code === 'KeyE' && P.locked) toggleZoom();
        /* Pas de raccourci clavier pour changer de niveau : les touches 1 et 2
           faisaient apparaître le matériel du TP 1 sur la table des TP 2/3.
           On passe par les onglets de l'interface (TP 1 → onglets A / B).   */
        if (e.code === 'KeyR' && e.shiftKey) hooks.restoreHome && hooks.restoreHome();
        /* T : le dock d'OHMIE, le robot tuteur (js/tutor.js via hooks de main.js) */
        if (e.code === 'KeyT') hooks.toggleTutor && hooks.toggleTutor();
        if (e.code === 'Escape') {
            if (isFastSpin()) setFastSpin(false);
            else if (hooks.tutorModalOpen && hooks.tutorModalOpen()) hooks.toggleTutorModal && hooks.toggleTutorModal(false);
            else if (isDragging()) cancelGrab();
        }
    });
    addEventListener('keyup', e => keys.delete(e.code));
    addEventListener('blur', () => keys.clear());
}

export function lockPointer() {
    try {
        const p = ctx.renderer.domElement.requestPointerLock();
        if (p && p.catch) p.catch(() => { });
    } catch (e) { }
}
export const unlockPointer = () => document.exitPointerLock && document.exitPointerLock();

/* ------------------------------------------------------------------ */
/*  Actions                                                            */
/* ------------------------------------------------------------------ */
function primaryAction(shift) {
    if (isDragging()) return;
    if (!P.hovered) { cancelPending(); return; }
    const u = P.hovered.userData;
    switch (u.kind) {
        case 'terminal': clickTerminal(u.id); break;
        case 'switch': toggleGen(); break;
        case 'knobV': adjustVoltage(shift ? -.5 : .5); break;
        case 'dial': adjustDial(u.index, shift ? -1 : 1); break;
        case 'wire': hooks.removeWire && hooks.removeWire(u.wire); break;
        case 'paper':
        case 'pen':
            sfx.scribble();
            hooks.openNewSheet
                ? hooks.openNewSheet()
                : (hooks.openPaper && hooks.openPaper(true));
            break;
        case 'calc':
            openCalculator(true);
            break;
        case 'wall_console':
            import('./wall_draw.js').then(m => m.openWallModal(true));
            break;
        /* ---- TP 2 : GBF + oscilloscope ---- */
        case 'switchGBF': toggleGBF(); break;
        case 'btnOscAuto':
            autoScaleOscilloscope(); sfx.ok();
            toast('Oscilloscope : calibres automatiques appliqués (2,5 périodes, voies recentrées).', 'info');
            afterControl();
            break;
        case 'knobGbfFreq': case 'knobGbfAmp':
        case 'knobTimeDiv': case 'knobCH1': case 'knobCH2':
        /* ---- TP 3 : générateurs, rhéostat ---- */
        case 'knobE1V': case 'knobE2V': case 'knobE1I': case 'knobE2I': case 'knobRheo':
        /* ---- sélecteurs de calibre des multimètres analogiques ---- */
        case 'calV': case 'calA':
            adjustControl(u.kind, +1, shift ? 'shift' : 'click');
            break;
        case 'switchE1': toggleSupply(1); break;
        case 'switchE2': toggleSupply(2); break;
        case 'btnE1Mode': toggleSupplyMode(1); break;
        case 'btnE2Mode': toggleSupplyMode(2); break;
    }
}

const ADJUSTABLE = new Set([
    'knobGbfFreq', 'knobGbfAmp', 'knobTimeDiv', 'knobCH1', 'knobCH2',
    'knobE1V', 'knobE2V', 'knobE1I', 'knobE2I', 'knobRheo',
    'calV', 'calA'
]);

function secondaryAction() {
    if (P.pendingTerm) { cancelPending(); return; }
    if (!P.hovered) return;
    const u = P.hovered.userData;
    if (u.kind === 'knobV') adjustVoltage(-.5);
    if (u.kind === 'dial') adjustDial(u.index, -1);
    if (ADJUSTABLE.has(u.kind)) adjustControl(u.kind, -1, 'click');
}

export function clickTerminal(id) {
    if (!P.pendingTerm) {
        P.pendingTerm = id; sfx.click();
        previewMat.color.setHex(wireColor.current);
        setPreviewVisible(true);
        toast(`Borne source : ${terminals[id].label} — cliquez une borne de destination`, 'info');
    } else if (P.pendingTerm === id) {
        cancelPending();
    } else {
        const a = P.pendingTerm;
        P.pendingTerm = null;
        setPreviewVisible(false);
        hooks.addWire && hooks.addWire(a, id);
    }
}
export function cancelPending() {
    if (P.pendingTerm) { P.pendingTerm = null; setPreviewVisible(false); sfx.click(); }
}

export function toggleGen() {
    S.genOn = !S.genOn;
    sfx.clack(); hum(S.genOn);
    toast(S.genOn
        ? (S.setV === 0 ? 'Générateur sous tension — réglez maintenant la tension U.' : 'Générateur sous tension.')
        : 'Générateur hors tension.', 'info');
    hooks.evaluate && hooks.evaluate();
}

export function adjustVoltage(d) {
    if (!S.genOn) {
        sfx.err();
        toast("Le générateur est éteint : basculez d'abord l'interrupteur M/A.", 'warn');
        return;
    }
    const nv = Math.max(0, Math.min(15, Math.round((S.setV + d) * 2) / 2));
    if (nv === S.setV) { sfx.err(); return; }
    S.setV = nv; sfx.ratchet(); hooks.evaluate && hooks.evaluate();
}

/* ------------------------------------------------------------------ */
/*  Organes de réglage des appareils (TP 2 et TP 3)                     */
/*                                                                      */
/*  Une seule fonction pour tous les boutons, afin que le comportement  */
/*  soit identique partout :                                            */
/*    clic gauche  = un pas vers le haut                               */
/*    clic droit   = un pas vers le bas                                */
/*    molette      = pas fin                                           */
/*    Maj + clic   = pas grossier                                      */
/* ------------------------------------------------------------------ */
const clampTo = (v, a, b) => Math.max(a, Math.min(b, v));

/** Relance le solveur + l'affichage après chaque réglage. */
function afterControl() { hooks.evaluate && hooks.evaluate(); }

export function adjustControl(kind, dir, mode = 'click') {
    const t3 = S.tp3;
    switch (kind) {

        /* ---------- sélecteurs de CALIBRE (multimètres analogiques) ----------
           clic / molette : un cran.  Pas de mode grossier : les 5 positions
           sont gravées sur le cadran, comme sur un vrai appareil.            */
        case 'calV': case 'calA': {
            const isV = kind === 'calV';
            const key = isV ? 'voltCal' : 'ammCal';
            const cals = isV ? VOLT_CALS : AMP_CALS;
            const unit = isV ? 'V' : 'mA';
            const n = clampTo(S[key] + (dir > 0 ? 1 : -1), 0, cals.length - 1);
            if (n === S[key]) {
                sfx.err();
                toast(`Calibre ${isV ? 'voltmètre' : 'ampèremètre'} déjà au ${dir > 0 ? 'maximum' : 'minimum'} (${cals[S[key]]} ${unit}).`, 'warn');
                return false;
            }
            S[key] = n;
            updateMetersCal();
            sfx.ratchet();
            const c = cals[n];
            const dg = METER_CLASS * c / METER_NDIV;          // Δg = classe × C / N div
            toast(`${isV ? 'Voltmètre' : 'Ampèremètre'} — calibre <b>${String(c).replace('.', ',')} ${unit}</b> · `
                + `1 div = ${String(Math.round(c / METER_NDIV * 1e6) / 1e6).replace('.', ',')} ${unit} · `
                + `Δg = ${String(Math.round(dg * 1e4) / 1e4).replace('.', ',')} ${unit}`, 'info');
            afterControl();
            return true;
        }

        /* ---------- GBF (TP 2) ---------- */
        case 'knobGbfFreq': {
            if (!S.gbfOn) { sfx.err(); toast("Le GBF est éteint : appuyez d'abord sur son interrupteur rouge.", 'warn'); return false; }
            const f = S.gbfFreq;
            let nf;
            if (mode === 'shift') nf = dir > 0 ? f * 2 : f / 2;                    // saut d'octave
            else if (mode === 'wheel') nf = f + dir * Math.max(1, f * 0.01);       // pas fin : ±1 %
            else nf = f + dir * 100;                                               // pas normal : ±100 Hz
            nf = clampTo(Math.round(nf), 10, 100000);
            if (nf === f) { sfx.err(); return false; }
            S.gbfFreq = nf; sfx.ratchet(); afterControl();
            return true;
        }
        case 'knobGbfAmp': {
            if (!S.gbfOn) { sfx.err(); toast("Le GBF est éteint : aucune amplitude n'est délivrée.", 'warn'); return false; }
            const step = mode === 'shift' ? 2 : (mode === 'wheel' ? 0.1 : 0.5);
            const nv = clampTo(Math.round((S.gbfAmp + dir * step) * 10) / 10, 0.5, 10);
            if (nv === S.gbfAmp) { sfx.err(); return false; }
            S.gbfAmp = nv; sfx.ratchet(); afterControl();
            return true;
        }

        /* ---------- oscilloscope (TP 2) ---------- */
        case 'knobTimeDiv': {
            const nSteps = mode === 'shift' ? 3 : 1;
            let td = S.osc.timeDiv;
            for (let k = 0; k < nSteps; k++) td = stepRange(TIME_DIVS, td, dir);
            if (td === S.osc.timeDiv) { sfx.err(); return false; }
            S.osc.timeDiv = td; S.osc.autoScale = false;
            sfx.click(); afterControl();
            return true;
        }
        case 'knobCH1': case 'knobCH2': {
            const ch = kind === 'knobCH1' ? 'ch1' : 'ch2';
            const keyV = kind === 'knobCH1' ? 'ch1VDiv' : 'ch2VDiv';
            const keyP = kind === 'knobCH1' ? 'ch1Pos' : 'ch2Pos';
            if (mode === 'shift') {                       // Maj : position verticale de la voie
                const np = clampTo(Math.round((S.osc[keyP] + dir * 0.5) * 2) / 2, -3, 3);
                if (np === S.osc[keyP]) { sfx.err(); return false; }
                S.osc[keyP] = np;
            } else {                                      // sensibilité V/div
                const nv = stepRange(VOLT_DIVS, S.osc[keyV], dir);
                if (nv === S.osc[keyV]) { sfx.err(); return false; }
                S.osc[keyV] = nv;
            }
            S.osc.autoScale = false;
            if (!S[ch].ok) toast(`Voie ${kind === 'knobCH1' ? '1' : '2'} : réglage enregistré, mais aucune sonde raccordée.`, 'warn');
            sfx.click(); afterControl();
            return true;
        }

        /* ---------- générateurs continus (TP 3) ---------- */
        case 'knobE1V': case 'knobE2V': {
            const i = kind === 'knobE1V' ? 1 : 2;
            if (!(i === 1 ? t3.on1 : t3.on2)) { sfx.err(); toast(`Générateur E${i} éteint : basculez d'abord son interrupteur.`, 'warn'); return false; }
            if (i === 1 ? t3.cc1 : t3.cc2) { sfx.err(); toast(`E${i} est en mode COURANT (CC) : la tension n'est plus réglable.`, 'warn'); return false; }
            const step = mode === 'shift' ? 2 : (mode === 'wheel' ? 0.1 : 0.5);
            const key = i === 1 ? 'E1' : 'E2';
            const nv = clampTo(Math.round((t3[key] + dir * step) * 10) / 10, 0, 15);
            if (nv === t3[key]) { sfx.err(); return false; }
            t3[key] = nv; sfx.ratchet(); afterControl();
            return true;
        }
        case 'knobE1I': case 'knobE2I': {
            const i = kind === 'knobE1I' ? 1 : 2;
            const step = mode === 'shift' ? 0.02 : (mode === 'wheel' ? 0.001 : 0.005);
            const key = i === 1 ? 'i1' : 'i2';
            const nv = clampTo(Math.round((t3[key] + dir * step) * 1000) / 1000, 0, 1.5);
            if (nv === t3[key]) { sfx.err(); return false; }
            t3[key] = nv; sfx.ratchet();
            if (!(i === 1 ? t3.cc1 : t3.cc2)) toast(`Limiteur réglé à ${(nv * 1000).toFixed(0)} mA — passez E${i} en mode CC pour l'utiliser comme générateur de courant.`, 'info');
            afterControl();
            return true;
        }

        /* ---------- rhéostat (TP 3) ---------- */
        case 'knobRheo': {
            const step = mode === 'shift' ? 10 : (mode === 'wheel' ? 0.5 : 1);
            const nv = clampTo(Math.round((t3.rheo + dir * step) * 2) / 2, 0, t3.rheoMax);
            if (nv === t3.rheo) { sfx.err(); return false; }
            t3.rheo = nv; sfx.ratchet(); afterControl();
            return true;
        }
    }
    return false;
}

/** Interrupteur marche/arrêt du GBF. */
export function toggleGBF() {
    S.gbfOn = !S.gbfOn;
    sfx.clack();
    toast(S.gbfOn
        ? `GBF sous tension : sortie 50 Ω active, ${S.gbfAmp.toFixed(1).replace('.', ',')} V crête-à-crête.`
        : 'GBF hors tension : plus aucun signal n\'est délivré.', 'info');
    afterControl();
}

/** Interrupteur marche/arrêt d'un générateur continu du TP 3. */
export function toggleSupply(i) {
    const t3 = S.tp3;
    const on = i === 1 ? (t3.on1 = !t3.on1) : (t3.on2 = !t3.on2);
    sfx.clack();
    toast(on
        ? `Générateur E${i} sous tension (${i === 1 ? t3.E1 : t3.E2} V, mode ${i === 1 ? (t3.cc1 ? 'COURANT' : 'TENSION') : (t3.cc2 ? 'COURANT' : 'TENSION')}).`
        : `Générateur E${i} hors tension : sa sortie est OUVERTE (ce n'est pas un court-circuit).`
            + (t3.level === 3
                ? ` Superposition : remplacez-le par un FIL entre E${i}+ et E${i}−.`
                : ''), 'info');
    afterControl();
}

/** Bascule TENSION (CV) / COURANT (CC) d'un générateur du TP 3. */
export function toggleSupplyMode(i) {
    const t3 = S.tp3;
    if (!(i === 1 ? t3.on1 : t3.on2)) { sfx.err(); toast(`Allumez d'abord le générateur E${i}.`, 'warn'); return; }
    const cc = i === 1 ? (t3.cc1 = !t3.cc1) : (t3.cc2 = !t3.cc2);
    sfx.clack();
    toast(cc
        ? `E${i} en mode COURANT (CC) : délivre ${((i === 1 ? t3.i1 : t3.i2) * 1000).toFixed(0)} mA — utile pour le théorème de Norton.`
        : `E${i} en mode TENSION (CV) : délivre ${(i === 1 ? t3.E1 : t3.E2).toFixed(1).replace('.', ',')} V.`, 'info');
    afterControl();
}

export function adjustDial(i, d) {
    S.digits[i] = (S.digits[i] + d + 10) % 10;
    S.Rv = S.digits[0] * 1000 + S.digits[1] * 100 + S.digits[2] * 10 + S.digits[3];
    sfx.ratchet(); hooks.evaluate && hooks.evaluate();
}

export function toggleZoom(force) {
    P.zoomOn = (force === undefined) ? !P.zoomOn : !!force;
    document.body.classList.toggle('zoomed', P.zoomOn);
    /* la pastille « Loupe » est optionnelle : son absence ne doit pas
       empêcher le zoom (bug : .classList d'un getElementById null). */
    const chip = document.getElementById('chipZoom');
    if (chip) chip.classList.toggle('hidden', !P.zoomOn);
    sfx.click();
}

/* ---- coups entre élèves ---- */
function tryPunch(target) {
    if (P.punchCd > 0) return;
    const me = ctx.yawObj.position;
    const d = Math.hypot(target.group.position.x - me.x, target.group.position.z - me.z);
    if (d > PUNCH_RANGE) {
        toast(`${target.name} est trop loin — rapprochez-vous (2 m maximum).`, 'warn');
        return;
    }
    P.punchCd = PUNCH_CD;
    P.punchAnim = 1;
    sfx.punch();
    const dx = (target.group.position.x - me.x) / (d || 1);
    const dz = (target.group.position.z - me.z) / (d || 1);
    sendPunch();
    sendHit(target.id, 3.6, dx, dz);
    toast(`Vous avez tapé ${target.name} !`, 'info');
}

export function applyHit(force, dx, dz, fromName) {
    impulse.x += dx * force;
    impulse.z += dz * force;
    P.hurt = 1;
    hurtPeer(ME.id, 1);
    hurtFlash();
    toast(`${fromName} vous a frappé !`, 'error');
}

/* ------------------------------------------------------------------ */
/*  Survol (raycast) : objets + autres élèves                          */
/* ------------------------------------------------------------------ */
const tipEl = () => document.getElementById('tooltip');
const avatarGroups = [];

function updateHover() {
    if (!P.locked) { setHovered(null); setHoveredPeer(null); return; }
    raycaster.setFromCamera({ x: 0, y: 0 }, ctx.camera);
    raycaster.far = 5.5 + 3.0 * P.zoomT;

    /* ---- appareils, bornes, fils, papier, stylo ---- */
    const pool = interactives.filter(o => o.visible !== false && visibleInTree(o));
    const hits = raycaster.intersectObjects(pool, true);
    let first = null, firstDist = 0, firstNonWire = null, nwDist = 0;
    for (const h of hits) {
        if (h.object.userData && (h.object.userData.ignore || h.object.userData.ignorePick)) continue;
        let o = h.object;
        while (o && !(o.userData && o.userData.interact)) o = o.parent;
        if (!o) continue;
        if (!first) { first = o; firstDist = h.distance; }
        if (o.userData.kind !== 'wire') { firstNonWire = o; nwDist = h.distance; break; }
    }
    /* un appareil juste derrière un fil reste accessible (le fil se retire par son milieu) */
    const target = (first && first.userData.kind === 'wire' && firstNonWire && nwDist < firstDist + .5)
        ? firstNonWire : first;
    setHovered(target);

    /* ---- autres élèves (pour les coups) ---- */
    avatarGroups.length = 0;
    for (const a of PEERS.values()) if (a.id !== ME.id && a.group.visible) avatarGroups.push(a.group);
    let peerHit = null;
    if (avatarGroups.length) {
        const ph = raycaster.intersectObjects(avatarGroups, true);
        if (ph.length && ph[0].distance < PUNCH_RANGE + .6) {
            let o = ph[0].object;
            while (o && !o.userData.__peerId) o = o.parent;
            peerHit = o ? PEERS.get(o.userData.__peerId) : null;
        }
    }
    setHoveredPeer(peerHit);
}

function visibleInTree(o) { while (o) { if (o.visible === false) return false; o = o.parent; } return true; }

function setHovered(t) {
    if (t === P.hovered) return;
    P.hovered = t;
    const ch = document.getElementById('crosshair');
    ch.classList.remove('on', 'ctrl', 'grab');
    if (!t) { tipEl().classList.remove('show'); setTargetChip('—'); return; }
    const u = t.userData;
    ch.classList.add(u.kind === 'terminal' || u.kind === 'wire' ? 'on' : 'ctrl');
    if (u.kind === 'device' || u.kind === 'paper' || u.kind === 'pen') ch.classList.add('grab');
    if (isDragging()) ch.classList.add('grab');
    tipEl().querySelector('span').textContent = u.tip || '';
    tipEl().classList.remove('show'); void tipEl().offsetWidth; tipEl().classList.add('show');
    setTargetChip(u.deviceLabel || (u.label ? 'Borne ' + u.label : u.kind === 'wire' ? 'Fil' : u.kind === 'paper' ? 'Feuille de relevés' : u.kind === 'pen' ? 'Stylo' : '—'));
}

function setHoveredPeer(a) {
    if (a === P.hoveredPeer) return;
    P.hoveredPeer = a;
    const el = tipEl();
    if (a) {
        document.getElementById('crosshair').classList.add('on');
        el.querySelector('span').textContent = `${a.name} — clic gauche : lui donner un coup (portée 2 m)`;
        el.classList.add('show');
        setTargetChip(a.name);
    } else if (!P.hovered) {
        el.classList.remove('show');
        setTargetChip('—');
    }
}

/* ------------------------------------------------------------------ */
/*  Déplacement + collisions                                           */
/* ------------------------------------------------------------------ */
function movePlayer(dt) {
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    P.crouching = keys.has('ControlLeft') || keys.has('ControlRight');
    eyeTarget = P.crouching ? EYE_CROUCH : EYE_STAND;
    const speed = (sprint ? 3.4 : 2.0) * (P.zoomOn ? .4 : 1) * (P.crouching ? .6 : 1) * (isDragging() ? .45 : 1);

    const fwd = ((keys.has('KeyW') || keys.has('KeyZ') || keys.has('ArrowUp')) ? 1 : 0)
        - ((keys.has('KeyS') || keys.has('ArrowDown')) ? 1 : 0);
    const str = ((keys.has('KeyD') || keys.has('ArrowRight')) ? 1 : 0)
        - ((keys.has('KeyA') || keys.has('KeyQ') || keys.has('ArrowLeft')) ? 1 : 0);

    ctx.camera.getWorldDirection(_v1); _v1.y = 0; _v1.normalize();
    _v2.crossVectors(_v1, UP).normalize();
    _v3.set(0, 0, 0).addScaledVector(_v1, fwd).addScaledVector(_v2, str);
    if (_v3.lengthSq() > 0) _v3.normalize().multiplyScalar(speed);
    vel.lerp(_v3, 1 - Math.pow(.0001, dt));

    /* recul des coups (impulsion amortie) */
    impulse.multiplyScalar(Math.pow(.02, dt));
    if (impulse.lengthSq() < 1e-5) impulse.set(0, 0, 0);

    const p = ctx.yawObj.position;
    p.x += (vel.x + impulse.x) * dt;
    p.z += (vel.z + impulse.z) * dt;
    P.speed = Math.hypot(vel.x + impulse.x, vel.z + impulse.z);
    P.bob += P.speed * dt * 2.4;

    /* ---- collision : paillasse circulaire ---- */
    const bodyR = P.crouching ? BODY_R_CROUCH : BODY_R;
    const r = Math.hypot(p.x, p.z);
    if (r < bodyR && r > 1e-5) {
        const k = bodyR / r;
        p.x *= k; p.z *= k;
    } else if (r <= 1e-5) {
        p.z = bodyR;
    }
    /* ---- collision exacte : bureau des relevés (boîte orientée sans mur invisible) ---- */
    const dLx = p.x - DESK.x;
    const dLz = p.z - DESK.z;
    const cosR = Math.cos(DESK_ROT);
    const sinR = Math.sin(DESK_ROT);

    // Repère local orienté du bureau
    let localX = dLx * cosR + dLz * sinR;
    let localZ = -dLx * sinR + dLz * cosR;

    if (Math.abs(localX) < DESK_HW && Math.abs(localZ) < DESK_HD) {
        const overlapX = DESK_HW - Math.abs(localX);
        const overlapZ = DESK_HD - Math.abs(localZ);

        if (overlapX < overlapZ) {
            localX = Math.sign(localX) * DESK_HW;
        } else {
            localZ = Math.sign(localZ) * DESK_HD;
        }

        // Repasser en coordonnées monde réelles
        p.x = DESK.x + localX * cosR - localZ * sinR;
        p.z = DESK.z + localX * sinR + localZ * cosR;
    }
    /* ---- murs ---- */
    const lim = ROOM - .38;
    p.x = Math.max(-lim, Math.min(lim, p.x));
    p.z = Math.max(-lim, Math.min(lim, p.z));
    /* ---- hauteur d'yeux (accroupi debout en douceur) ---- */
    p.y += (eyeTarget - p.y) * Math.min(1, dt * 9);
}

/* ------------------------------------------------------------------ */
/*  Boucle joueur                                                      */
/* ------------------------------------------------------------------ */
export function update(dt, t) {
    if (P.locked && !isPaperOpen()) movePlayer(dt);

    /* ---- loupe : FOV + léger dolly ---- */
    const zTarget = P.zoomOn ? 1 : 0;
    if (Math.abs(P.zoomT - zTarget) > 1e-4) {
        P.zoomT += (zTarget - P.zoomT) * Math.min(1, dt * 7);
        const e = P.zoomT * P.zoomT * (3 - 2 * P.zoomT);
        ctx.camera.fov = FOV_BASE + (FOV_ZOOM - FOV_BASE) * e;
        ctx.camera.position.z = -.22 * e;
        ctx.camera.updateProjectionMatrix();
    }

    updateHover();

    /* ---- aperçu du fil en cours de pose ---- */
    if (P.pendingTerm) {
        if (P.hovered && P.hovered.userData.kind === 'terminal' && P.hovered.userData.id !== P.pendingTerm) {
            tipPos(P.hovered.userData.id, aimPt);
            axisVec(P.hovered.userData.id, _v4);
            previewMat.opacity = .85;
        } else {
            raycaster.setFromCamera({ x: 0, y: 0 }, ctx.camera);
            raycaster.far = 8;
            const hits = raycaster.intersectObjects(ctx.scene.children, true);
            let pt = null;
            for (const h of hits) {
                if (h.object === previewTube || h.object === previewTip) continue;
                if (h.object.userData && h.object.userData.ignorePick) continue;
                if (h.object.isPoints) continue;
                if (h.distance < .12) continue;
                pt = h.point; break;
            }
            if (pt) aimPt.copy(pt);
            else { raycaster.ray.at(1.1, aimPt); }
            _v4.set(0, 1, 0);
            previewMat.opacity = .5;
        }
        updatePreviewGeometry(P.pendingTerm, aimPt, _v4);
    }

    /* ---- halo des bornes ---- */
    for (const id of allTermIds) {
        const m = terminals[id].ringMat;
        const isHover = P.hovered && P.hovered.userData.id === id;
        m.emissiveIntensity = id === P.pendingTerm ? .55 + .45 * Math.sin(t * 7) : (isHover ? .85 : .18);
    }

    /* ---- animations de combat ---- */
    P.punchCd = Math.max(0, P.punchCd - dt);
    P.punchAnim = Math.max(0, P.punchAnim - dt * 3.2);
    P.hurt = Math.max(0, P.hurt - dt * 2);
    /* petit recul de caméra quand on frappe / qu'on est frappé */
    const kick = P.punchAnim * .05 - P.hurt * .04;
    ctx.pitchObj.position.z = kick;
    ctx.pitchObj.rotation.z = P.hurt * .05 * Math.sin(t * 30);

    /* ---- publication réseau ---- */
    if (ME.online) {
        sendState({
            x: ctx.yawObj.position.x, y: ctx.yawObj.position.y, z: ctx.yawObj.position.z,
            yaw: ctx.yawObj.rotation.y, pitch: ctx.pitchObj.rotation.x,
            crouch: P.crouching, zoom: P.zoomOn, punch: P.punchAnim, bob: P.bob
        });
    }
}

export const isLocked = () => P.locked;
export const isStarted = () => P.started;
export function setStarted(v) { P.started = v; }
export const anyKeyDown = () => keys.size;
export { draggableFor };
