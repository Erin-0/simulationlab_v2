/* =====================================================================
   js/main.js  —  orchestrateur : construit la scène, câble les modules
                  entre eux, gère les niveaux A/B, la boucle de rendu et
                  la liaison avec le serveur multijoueur.
   ===================================================================== */
import * as THREE from 'three';
// DANS js/main.js (imports)
import { buildTP2Group, updateFilterBoardSilkscreen } from './instruments_tp2.js';
import { buildTP3Group } from './instruments_tp3.js';
import { autoScaleOscilloscope, TIME_DIVS, VOLT_DIVS } from './oscilloscope.js';
import { S, ctx, $, PALETTE, wireColor, ME, Q, draggables, wires, interactives } from './state.js';
import { initAudio, sfx, hum, tone } from './audio.js';
import {
    initRenderer, buildRoom, buildRoundTable, buildDesk, buildDust, animateDust,
    flipPaper, animatePaper
} from './environment.js';
import { buildInstruments } from './instruments.js';

import { setScene, addWire, removeWire, clearWires, previewMat } from './wiring.js';
import * as circuit from './circuit.js';
import { updateDisplays, animateGalvo, animateTP3, animateMeters, updateMetersCal } from './displays.js';
import { resetTP3 } from './tp3_solver.js';
import * as drag from './drag.js';
import * as avatar from './avatar.js';
import * as net from './net.js';
import * as player from './player.js';
ctx.player = player;
import * as tutor from './tutor.js';
import { buildRobot, updateRobot } from './robot.js';
import {
    toast, refreshStatus, refreshMissions, refreshLiveLine, renderTable, rows,
    openPaper, openChat, sendChat, exportCSV, addBlankRow, addReadingFromInstruments,
    setPaperHooks, setChatHooks, setHintUpdater, refreshNetChip, isPaperOpen, isChatOpen,
    newSheet, prevSheet, refreshPrevSheetButton, applySoloUI,
    savePaperState, loadPaperState, clearTP3Table,
    missionStates, measurementsTP3
} from './hud.js';
import { drawLCD } from './textures.js';
import { applyQuality, savedQuality, bindQualityButtons } from './quality.js';
import { applyLighting, savedLighting, bindLighting } from './lighting.js';
import { initCalculator, openCalculator, isCalcOpen } from './calculator.js';
import { initDrawWall, pointerOnDrawWall } from './wall_draw.js';


/* ================================================================== */
/*  1. Scène, décor, appareils                                         */
/* ================================================================== */
initRenderer();
setScene(ctx.scene);
avatar.init(ctx.scene);
buildRoom();
buildRoundTable();
buildDesk((obj, label, termIds, yOff) => {
    obj.userData.interact = true;
    obj.userData.kind = obj.userData.kind || 'device';
    obj.userData.draggable = true;
    draggables.push({
        obj, label, termIds, yOff,
        faceCenter: false,            // la feuille et le stylo gardent l'orientation choisie
        halfW: .12, halfD: .12,       // affinés par environment.js
        lastGood: null                // dernière pose stable (aucune chute possible)
    });
    /* IMPORTANT : ajouter aussi dans interactives pour que le raycast les détecte */
    interactives.push(obj);
    return draggables[draggables.length - 1];
});
initDrawWall();


// DANS js/main.js : après la construction des deux TP
buildInstruments();
buildTP2Group();
buildTP3Group();
updateMetersCal();           // sélecteurs de calibre sur la position par défaut (la plus grande)
buildDust();                 // une seule fois : trois appels créaient trois systèmes de poussière
buildRobot();                // OHMIE, le robot tuteur volant (js/robot.js)
drag.captureHome();          // positions initiales des appareils des TROIS TP
circuit.init(wires);

/* ================================================================== */
/*  2. Évaluation du circuit (point d'entrée unique)                   */
/* ================================================================== */
function evaluate(suppress = false) {
    const refresh = suppress
        ? () => { updateDisplays(); refreshStatus(); refreshLiveLine(); }
        : () => { updateDisplays(); refreshStatus(); refreshMissions(); refreshLiveLine(); };
    circuit.evaluate(suppress ? () => { } : toast, refresh);
}
ctx.evaluate = () => evaluate(false);
ctx.toast = toast;
ctx.openPaper = openPaper;
ctx.sfx = sfx;

/* ================================================================== */
/*  3. Câblage (hooks du joueur)                                       */
/* ================================================================== */
const H = {
    evaluate: () => evaluate(false),
    addWire: (a, b) => addWire(a, b, () => evaluate(false), toast),
    removeWire: (w) => removeWire(w, false, () => evaluate(false)),
    clearWires: () => { clearWires(false, () => evaluate(false), toast); player.cancelPending(); },
    openPaper: (o) => openPaper(o),
    /* clic sur le papier ou le stylo : on prend une NOUVELLE feuille vierge */
    openNewSheet: () => { flipPaper(); openPaper(true); },   // open, don't wipe
    setLevel: (l) => setLevel(l),
    updateHint: () => updateHint(),
    closeOverlays: () => { if (isChatOpen()) openChat(false); else if (isPaperOpen()) openPaper(false); else tutor.tutorModal(false); },
    /* ---- OHMIE (robot tuteur) : T ouvre/ferme le dock, Échap ferme la grande fenêtre ---- */
    toggleTutor: () => {
        const opening = document.getElementById('tutorDock').classList.contains('hiddenx');
        tutor.tutorToggle();
        if (opening) { player.unlockPointer(); }
        else if (player.isStarted() && !isPaperOpen() && !isChatOpen()) player.lockPointer();
        updateHint();
    },
    tutorModalOpen: () => !document.getElementById('tutorModal').classList.contains('hiddenx'),
    toggleTutorModal: (o) => {
        tutor.tutorModal(o);
        if (!o && player.isStarted() && !isPaperOpen() && !isChatOpen()) player.lockPointer();
        updateHint();
    },
    restoreHome: () => {
        drag.restoreHome();
        toast('Tous les appareils ont été remis à leur place.', 'success');
    }
};
player.init(H);
/* OHMIE : le tuteur reçoit ce dont il a besoin pour décrire le banc au modèle */
tutor.initTutor({ missionStates, rows, measurementsTP3 }, wires);
/* ------------------------------------------------------------------ */
/*  Bascule entre les trois TP                                         */
/* ------------------------------------------------------------------ */
const BRAND = {
    1: 'TP 1 · MESURE DE RÉSISTANCES',
    2: 'TP 2 · RÉPONSE FRÉQUENTIELLE',
    3: 'TP 3 · THÉORÈMES ÉLECTROCINÉTIQUES'
};
const TP_WELCOME = {
    1: 'TP 1 — mesure de résistances. U et I se LISENT sur les appareils à aiguille : choisissez d\'abord le calibre (on commence au plus grand), puis g = N div × C/100.',
    2: 'TP 2 — filtres RC, CR et RC-CR. Aucune mesure automatique : Ue et Us se comptent en DIVISIONS à l\'oscilloscope (U = N div × V/DIV), puis G = 20·log(Us/Ue).',
    3: 'TP 3 — Millman, superposition, Thévenin et Norton. Les grandeurs se lisent sur les aiguilles des multimètres : choisissez le calibre avant chaque mesure.'
};

/**
 * Affiche le matériel du TP demandé et masque le reste.
 * Le voltmètre et l'ampèremètre sont COMMUNS : présents au TP 1 (niveau A)
 * et au TP 3, absents ailleurs.
 */
function applyTPVisibility(tpNum) {
    const tp1 = tpNum === 1;
    if (ctx.genGroup) ctx.genGroup.visible = tp1;              // alimentation 0-15 V du TP 1
    if (ctx.levelA) ctx.levelA.visible = tp1 && S.level === 'A';
    if (ctx.levelB) ctx.levelB.visible = tp1 && S.level === 'B';
    if (ctx.groupTP2) ctx.groupTP2.visible = tpNum === 2;
    if (ctx.groupTP3) ctx.groupTP3.visible = tpNum === 3;
    if (ctx.metersGroup) ctx.metersGroup.visible = (tp1 && S.level === 'A') || tpNum === 3;
}

function setTP(tpNum) {
    if (S.activeTP === tpNum) return;
    S.activeTP = tpNum;

    clearWires(true, null, null);
    player.cancelPending();
    drag.cancelGrab();

    $('btnTP1').classList.toggle('active', tpNum === 1);
    $('btnTP2').classList.toggle('active', tpNum === 2);
    $('btnTP3').classList.toggle('active', tpNum === 3);
    $('tabsTP1').classList.toggle('hidden', tpNum !== 1);
    $('tabsTP2').classList.toggle('hidden', tpNum !== 2);
    $('tabsTP3').classList.toggle('hidden', tpNum !== 3);

    applyTPVisibility(tpNum);
    $('brandSub').textContent = BRAND[tpNum];

    /* le banc est toujours livré « éteint » : rien n'est déjà prêt */
    if (tpNum === 1) { circuit.resetGeneratorState(); hum(false); }
    if (tpNum === 3) resetTP3(true);

    /* la feuille de relevés change de formulaire */
    renderTable();
    refreshPrevSheetButton();
    toast(TP_WELCOME[tpNum], 'info');
    if (tpNum === 3) setTimeout(() => toast(TP3_INTRO[S.tp3.level], 'info'), 900);

    sfx.clack();
    evaluate();
}
$('btnTP1').onclick = () => { sfx.click(); setTP(1); };
$('btnTP2').onclick = () => { sfx.click(); setTP(2); };
$('btnTP3').onclick = () => { sfx.click(); setTP(3); };

// Câblage des sous-onglets du TP 2
// DANS la fonction setTP2Filter(filterType) de js/main.js :
function setTP2Filter(filterType) {
    S.tp2Filter = filterType;
    clearWires(true, null, null);
    player.cancelPending();

    $('tabRC').className = 'tab grow tc' + (filterType === 'RC' ? ' active-tp2' : '');
    $('tabCR').className = 'tab grow tc' + (filterType === 'CR' ? ' active-tp2' : '');
    $('tabBand').className = 'tab grow tc' + (filterType === 'RC-CR' ? ' active-tp2' : '');

    // Mise à jour visuelle 3D de la sérigraphie de la maquette
    updateFilterBoardSilkscreen(filterType);

    sfx.click();
    toast(`Filtre ${filterType === 'RC' ? 'Passe-bas (RC)' : filterType === 'CR' ? 'Passe-haut (CR)' : 'Passe-bande (Cascade)'} configuré.`, 'info');
    evaluate();
}

$('tabRC').onclick = () => setTP2Filter('RC');
$('tabCR').onclick = () => setTP2Filter('CR');
$('tabBand').onclick = () => setTP2Filter('RC-CR');

/* ------------------------------------------------------------------ */
/*  TP 3 : les cinq manipulations du fascicule (p. 7 à 9)              */
/* ------------------------------------------------------------------ */
const TP3_INTRO = {
    1: 'Manipulation 1 — Retirez la branche R, allumez E₁ (12 V) et E₂ (6 V), puis mesurez V₀ entre A et B '
        + 'au voltmètre et I₀ en plaçant l\'ampèremètre entre A et B.',
    2: 'Manipulation 2 — Remettez R entre A et B : mesurez V_M à ses bornes, puis I_R avec l\'ampèremètre '
        + 'en SÉRIE dans la branche. Vérifiez I_R = V_M / R.',
    3: 'Manipulation 3 — Superposition : E₁ seul (E₂ éteint et remplacé par un fil E₂+ → E₂−), mesurez I₁ ; '
        + 'puis E₂ seul, mesurez I₂ ; enfin les deux ensemble, mesurez I_total.',
    4: 'Manipulation 4 — Thévenin : calculez R_Th = V₀ / I₀, réglez le rhéostat à cette valeur, réglez un '
        + 'générateur sur E_Th = V₀, puis montez E_Th → R_Th → R en série (R₁ et R₂ débranchés).',
    5: 'Manipulation 5 — Norton : réglez le rhéostat sur R_No = R_Th, passez un générateur en mode CC réglé sur '
        + 'I_No = I₀, puis mettez I_No, R_No et R en PARALLÈLE entre A et B.'
};

function setTP3Level(n) {
    if (S.tp3.level === n) return;
    S.tp3.level = n;
    clearWires(true, null, null);
    player.cancelPending();
    drag.cancelGrab();

    /* le banc repart éteint et décâblé, MAIS les mesures déjà faites sont
       conservées : les manipulations 4 et 5 s'appuient sur V₀ et I₀.        */
    resetTP3(true);

    for (let i = 1; i <= 5; i++) {
        const tab = $('tabT3_' + i);
        if (tab) tab.className = 'tab grow tc' + (i === n ? ' active-t3' : '');
    }

    sfx.clack();
    toast(TP3_INTRO[n], 'info');
    if (n >= 4 && S.tp3.meas.V0 === null) {
        setTimeout(() => toast('Cette manipulation utilise V₀ et I₀ : retournez à la manipulation 1 si vous '
            + 'ne les avez pas encore mesurés.', 'warn'), 1400);
    }
    renderTable();
    evaluate();
}
for (let i = 1; i <= 5; i++) {
    const tab = $('tabT3_' + i);
    if (tab) tab.onclick = () => { sfx.click(); setTP3Level(i); };
}
/* ================================================================== */
/*  4. Niveaux A / B                                                   */
/* ================================================================== */
function setLevel(lvl) {
    /* Les niveaux A / B n'existent QUE dans le TP 1.  Basculer de niveau
       depuis un autre TP affichait les bancs du TP 1 par-dessus le matériel
       du TP 2 ou du TP 3 (chevauchement incompréhensible) : on refuse.   */
    if (S.activeTP !== 1) {
        toast('Les niveaux A / B ne concernent que le TP 1. Utilisez les boutons TP 1 / TP 2 / TP 3.', 'info');
        return;
    }
    if (S.level === lvl) return;
    S.level = lvl;
    clearWires(true, null, null);
    player.cancelPending();
    drag.cancelGrab();
    applyTPVisibility(1);                            // gère levelA / levelB / appareils partagés
    $('tabA').className = 'tab grow tc' + (lvl === 'A' ? ' active' : '');
    $('tabB').className = 'tab grow tc' + (lvl === 'B' ? ' active-b' : '');

    /* rien n'est jamais « déjà prêt » : le générateur repart éteint, à 0 V */
    circuit.resetGeneratorState();
    hum(false);
    sfx.clack();
    toast(lvl === 'A'
        ? "Niveau A — Loi d'Ohm. Le générateur est éteint : allumez-le, puis câblez G → ampèremètre → R."
        : 'Niveau B — Pont de Wheatstone. Générateur éteint : allumez-le, alimentez P+/P−, insérez la boîte à décades.', 'info');
    evaluate();
}
$('tabA').onclick = () => { sfx.click(); setLevel('A'); };
$('tabB').onclick = () => { sfx.click(); setLevel('B'); };

/* ================================================================== */
/*  5. HUD : palette, boutons, feuille de relevés, chat                */
/* ================================================================== */
PALETTE.forEach(([name, hex], i) => {
    const b = document.createElement('div');
    b.className = 'swatch' + (i === 0 ? ' sel' : '');
    b.title = 'Fil ' + name;
    b.style.background = '#' + hex.toString(16).padStart(6, '0');
    b.onclick = () => {
        wireColor.current = hex; sfx.click();
        document.querySelectorAll('#palette .swatch').forEach(s => s.classList.remove('sel'));
        b.classList.add('sel');
        previewColor(hex);
    };
    $('palette').appendChild(b);
});
const previewColor = (hex) => previewMat.color.setHex(hex);

if ($('btnClear')) $('btnClear').onclick = () => H.clearWires();
if ($('btnChat')) $('btnChat').onclick = () => openChat(!isChatOpen());
$('btnRow').onclick = () => addBlankRow(true);
$('btnAdd').onclick = addReadingFromInstruments;
$('btnCSV').onclick = exportCSV;
$('btnClearTable').onclick = () => {
    if (S.activeTP === 3) {
        clearTP3Table();
        toast('Table 9 effacée : les cases sont de nouveau vierges.', 'info');
    } else {
        rows.length = 0;
    }
    sfx.click(); renderTable(); refreshMissions(); savePaperState();
};
if ($('btnNewSheet')) $('btnNewSheet').onclick = () => { sfx.click(); newSheet(); };
if ($('btnPrevSheet')) $('btnPrevSheet').onclick = () => { sfx.click(); prevSheet(); };
refreshPrevSheetButton();
$('btnCloseCahier').onclick = () => openPaper(false);
$('btnResume').onclick = () => { openPaper(false); player.lockPointer(); };

/* hooks de focus : la souris doit être libérée pour écrire sur la feuille */
setPaperHooks(
    () => player.unlockPointer(),
    () => { if (player.isStarted() && !isChatOpen()) player.lockPointer(); }
);
setChatHooks(
    () => player.unlockPointer(),
    () => { if (player.isStarted() && !isPaperOpen()) player.lockPointer(); },
    (txt) => { sendChat(txt); avatar.say(ME.id, txt); }
);
if ($('btnSendChat')) $('btnSendChat').onclick = () => sendChat();
if ($('chatInput')) $('chatInput').addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.code === 'Enter') { e.preventDefault(); sendChat(); }
    if (e.code === 'Escape') { e.preventDefault(); openChat(false); }
});
setHintUpdater(updateHint);

function updateHint() {
    $('hint').style.opacity = (player.isStarted() && !player.isLocked() && !isPaperOpen() && !isChatOpen()) ? '1' : '0';
    $('crosshair').classList.toggle('off', !player.isLocked());
}

/* ================================================================== */
/*  6. Mode de jeu : FORCE SOLO (Web-Ready)                           */
/* ================================================================== */
net.initIdentity();

/* On force le mode solo définitivement (pas de serveur, pas de personnages) */
ME.solo = true;
avatar.setSolo(true);
applySoloUI(true);
refreshNetChip();

/* Le seul et unique bouton pour entrer dans le laboratoire */
$('btnStart').onclick = () => {
    initAudio();
    player.setStarted(true);
    $('start').classList.add('gone');
    player.lockPointer();
    updateHint();
    setTimeout(() => toast('Générateur éteint : allumez-le, puis câblez G → A → R.', 'info'), 800);
    setTimeout(() => toast('Clic droit maintenu = rotation rapide · clic sur le papier = ouvrir la feuille.', 'info'), 3500);
    evaluate();
};
/* ================================================================== */
/*  7. Qualité graphique                                               */
/* ================================================================== */
bindQualityButtons(sfx.click);
applyQuality(savedQuality(), true);
bindLighting(sfx.click);
savedLighting();
applyLighting(true);

/* ================================================================== */
/*  8. Boucle principale                                               */
/* ================================================================== */
addEventListener('resize', () => {
    ctx.camera.aspect = innerWidth / innerHeight;
    ctx.camera.updateProjectionMatrix();
    ctx.renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
let fpsAcc = 0, fpsFrames = 0, lcdTick = 0, scPhase = -1, beepAt = 0;
const _pos = new THREE.Vector3();

function animate() {
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;

    player.update(dt, t);
    drag.update(dt, ctx.yawObj.rotation.y, ctx.yawObj.position);
    animatePaper(dt);
    animateDust(dt, t);
    updateRobot(dt, t);      // vol, humeur, laser et bulle d'OHMIE
    animateGalvo(dt);
    animateTP3(dt);
    animateMeters(dt);       // aiguilles des multimètres analogiques (ressort amorti)

    /* ---- réseau : avatar local + interpolation des autres (jamais en solo) ---- */
    if (!ME.solo && (ME.online || avatar.peers.size)) {
        ctx.yawObj.getWorldPosition(_pos);
        avatar.setLocalAvatarTransform(ME.id || 'me', _pos, ctx.yawObj.rotation.y,
            player.P.crouching, player.P.punchAnim, player.P.hurt, player.P.bob);
        avatar.update(dt, t, ME.id || 'me');
    }

    /* ---- écran LCD : cadence limitée selon la qualité ---- */
    lcdTick++;
    const lcdEvery = Math.max(1, Math.round(60 / (Q.lcdFps || 30)));
    if (lcdTick % lcdEvery === 0) updateDisplays();

    /* ---- respiration du luminaire (autour de l'intensité choisie) ---- */
    if (ctx.spot) {
        const base = (ctx.lights && ctx.lights.spotBase) || 96;
        ctx.spot.intensity = base + (Math.sin(t * 4.7) * 1.2 + Math.sin(t * 3.1) * 2) * (base / 96);
    }

    /* ---- levier de l'interrupteur ---- */
    if (ctx.switchPivot) {
        ctx.switchPivot.rotation.x += ((S.genOn ? .45 : -.45) - ctx.switchPivot.rotation.x) * Math.min(1, dt * 14);
    }

    /* ---- viseur : état « fil en attente » ---- */
    $('crosshair').classList.toggle('pending', !!player.P.pendingTerm && player.isLocked());

    /* ---- court-circuit : LCD qui clignote ---- */
    if (S.faultShort) {
        const ph = ((t * 2) | 0) % 2;
        if (ph !== scPhase) {
            scPhase = ph;
            if (ctx.genLCD) drawLCD(ctx.genLCD, ph ? ' ' : 'SC !!', 'PROTECTION', '#ff8a7a');
        }
    } else scPhase = -1;

    /* ---- alerte sonore de surcharge (supprimée pour éliminer le bruit de tic-tac de montre) ---- */
    // La surcharge est déjà signalée visuellement par la LED rouge OL sur l'appareil et les toasts HUD.

    /* ---- compteur d'images ---- */
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= .5) {
        $('fps').textContent = Math.round(fpsFrames / fpsAcc) + ' fps';
        fpsAcc = 0; fpsFrames = 0;
    }

    ctx.renderer.render(ctx.scene, ctx.camera);
}
ctx.renderer.setAnimationLoop(animate);

loadPaperState();

/* ================================================================== */
/*  9. Initialisation                                                  */
/* ================================================================== */
initCalculator();
if (window.lucide) lucide.createIcons();
updateDisplays();
refreshStatus();
refreshMissions();
refreshLiveLine();
renderTable();
refreshNetChip();
updateHint();
evaluate();
document.fonts && document.fonts.ready.then(() => updateDisplays());

/* Le panneau « raccourcis clavier » a été supprimé : les aides arrivent
   sous forme de toasts au démarrage, et les info-bulles au survol. */
