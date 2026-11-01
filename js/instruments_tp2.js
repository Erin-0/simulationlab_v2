/* =====================================================================
   js/instruments_tp2.js  —  Matériel 3D pour le TP 2 :
     1. Générateur Basses Fréquences (GBF)
     2. Oscilloscope numérique double trace
     3. Maquette de filtres passifs dynamique
   ===================================================================== */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
    TABLE_H, INSTR_SCALE, terminals, allTermIds, interactives, draggables, ctx, S
} from './state.js';
import {
    panelPlane, makeLCD, rr, laminateMat, boardMapper, SILK,
    silkPanel, silkSocket, silkText, silkWire, silkDipole
} from './textures.js';
import { makeTerminal, makeShell, addFeet, addHandle, addTicks, makeKnob, MAT, placeDevice, placeFlat } from './instruments.js';
import { TIME_DIVS, VOLT_DIVS, autoScaleOscilloscope } from './oscilloscope.js';

const K = INSTR_SCALE;
const addAt = (obj, x, y, z) => { obj.position.set(x, y, z); return obj; };

/* ------------------------------------------------------------------ */
/*  1. GÉNÉRATEUR BASSES FRÉQUENCES (GBF)                              */
/* ------------------------------------------------------------------ */
export function buildGBF() {
    const g = new THREE.Group();
    const w = 0.44, h = 0.18, d = 0.28;
    g.add(makeShell(w, h, d));
    addFeet(g, w, d, 0.015, -h / 2, 0.012);
    addHandle(g, w, h / 2, -d / 2 + 0.04);

    const panel = panelPlane(0.42, 0.165, 512, 200, (ctx2, W, H) => {
        ctx2.fillStyle = '#161d27'; ctx2.fillRect(0, 0, W, H);
        const gr = ctx2.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)');
        ctx2.fillStyle = gr; ctx2.fillRect(0, 0, W, H);

        ctx2.fillStyle = '#38bdf8'; ctx2.font = '700 20px "Space Grotesk",sans-serif'; ctx2.textAlign = 'center';
        ctx2.fillText('GÉNÉRATEUR BASSES FRÉQUENCES (GBF)', W / 2, 24);
        ctx2.fillStyle = '#94a3b8'; ctx2.font = '500 12px "Space Grotesk",sans-serif';
        ctx2.fillText('0.1 Hz – 2 MHz  ·  50 Ω  ·  TYPE GF-200', W / 2, 40);

        ctx2.fillStyle = '#03080d'; rr(ctx2, W / 2 - 110, 50, 220, 68, 8); ctx2.fill();
        ctx2.strokeStyle = 'rgba(56,189,248,0.3)'; ctx2.lineWidth = 2;
        rr(ctx2, W / 2 - 110, 50, 220, 68, 8); ctx2.stroke();

        ctx2.fillStyle = '#e2e8f0'; ctx2.font = '700 13px "Space Grotesk",sans-serif';
        ctx2.fillText('FRÉQUENCE', W / 2 - 146, 185);
        ctx2.fillText('AMPLITUDE', W / 2 + 146, 185);
        ctx2.fillText('SORTIE 50Ω', W / 2, 185);
    });
    panel.mesh.position.z = d / 2 + 0.001; g.add(panel.mesh);

    const gbfLCD = makeLCD(256, 88);
    const bezel = new THREE.Mesh(new RoundedBoxGeometry(0.20, 0.07, 0.006, 3, 0.003), MAT.dark());
    bezel.position.set(0, 0.035, d / 2 + 0.003); g.add(bezel);
    const lcdMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.188, 0.058), new THREE.MeshBasicMaterial({ map: gbfLCD.tex }));
    lcdMesh.position.set(0, 0.035, d / 2 + 0.007); g.add(lcdMesh);
    ctx.gbfLCD = gbfLCD;

    const knobFreq = makeKnob(0.028, 0.018, 0x38bdf8);
    knobFreq.position.set(-0.13, -0.042, d / 2 + 0.004);
    knobFreq.userData = {
        interact: true, kind: 'knobGbfFreq',
        tip: 'Fréquence GBF — clic : +100 Hz · clic droit : −100 Hz · molette : pas fin (±1 %) · Maj+clic : ×2 / ÷2'
    };
    addTicks(g, -0.13, -0.042, d / 2 + 0.003, 0.035, 0.042, 11, 280, 0x38bdf8);
    g.add(knobFreq); interactives.push(knobFreq);

    const knobAmp = makeKnob(0.024, 0.016, 0xfacc15);
    knobAmp.position.set(0.13, -0.042, d / 2 + 0.004);
    knobAmp.userData = {
        interact: true, kind: 'knobGbfAmp',
        tip: 'Amplitude Ue (crête-à-crête) — clic : +0,5 V · clic droit : −0,5 V · molette : ±0,1 V · Maj+clic : ±2 V'
    };
    addTicks(g, 0.13, -0.042, d / 2 + 0.003, 0.03, 0.037, 9, 240, 0xfacc15);
    g.add(knobAmp); interactives.push(knobAmp);

    const pwrBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.012, 18),
        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 }));
    pwrBtn.rotation.x = Math.PI / 2;
    pwrBtn.position.set(-0.17, 0.045, d / 2 + 0.006);
    pwrBtn.userData = { interact: true, kind: 'switchGBF', tip: 'Marche / Arrêt du GBF — la sortie 50 Ω ne délivre rien tant qu\'il est éteint' };
    g.add(pwrBtn); interactives.push(pwrBtn);

    g.add(addAt(makeTerminal('GBF+', 'Sortie GBF (+)', 0xd93a3a, 'z', g), 0.035, -0.045, d / 2));
    g.add(addAt(makeTerminal('GBF-', 'Masse GBF (GND)', 0x1c1f27, 'z', g), -0.035, -0.045, d / 2));

    return { group: g, w, h, d };
}

/* ------------------------------------------------------------------ */
/*  2. OSCILLOSCOPE NUMÉRIQUE DOUBLE TRACE                             */
/* ------------------------------------------------------------------ */
export function buildOscilloscope() {
    const g = new THREE.Group();
    const w = 0.52, h = 0.28, d = 0.30;
    g.add(makeShell(w, h, d, 0.015));
    addFeet(g, w, d, 0.016, -h / 2, 0.014);

    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 400;
    const oscCtx = canvas.getContext('2d');
    const oscTexture = new THREE.CanvasTexture(canvas);
    oscTexture.colorSpace = THREE.SRGBColorSpace;
    ctx.oscCanvas = canvas;
    ctx.oscCtx = oscCtx;
    ctx.oscTexture = oscTexture;

    const screenBezel = new THREE.Mesh(new RoundedBoxGeometry(0.29, 0.22, 0.01, 3, 0.008), MAT.dark());
    screenBezel.position.set(-0.09, 0.015, d / 2 + 0.003); g.add(screenBezel);

    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.20),
        new THREE.MeshBasicMaterial({ map: oscTexture }));
    screenMesh.position.set(-0.09, 0.015, d / 2 + 0.009); g.add(screenMesh);

    const cPanel = panelPlane(0.18, 0.24, 256, 340, (ctx2, W, H) => {
        ctx2.fillStyle = '#1c2430'; ctx2.fillRect(0, 0, W, H);
        ctx2.strokeStyle = 'rgba(255,255,255,0.08)'; ctx2.lineWidth = 2;
        ctx2.strokeRect(4, 4, W - 8, H - 8);

        ctx2.fillStyle = '#94a3b8'; ctx2.font = '700 15px "Space Grotesk",sans-serif'; ctx2.textAlign = 'center';
        ctx2.fillText('OSCILLOSCOPE', W / 2, 26);

        ctx2.font = '600 12px "Space Grotesk",sans-serif';
        ctx2.fillStyle = '#facc15'; ctx2.fillText('CH 1 (X)', 64, 70);
        ctx2.fillStyle = '#38bdf8'; ctx2.fillText('CH 2 (Y)', 192, 70);
        ctx2.fillStyle = '#4ade80'; ctx2.fillText('TIME / DIV', W / 2, 172);
        ctx2.fillStyle = '#e2e8f0'; ctx2.fillText('AUTO-SET', W / 2, 276);
    });
    cPanel.mesh.position.set(0.15, 0.015, d / 2 + 0.002); g.add(cPanel.mesh);

    const knobTB = makeKnob(0.024, 0.016, 0x4ade80);
    knobTB.position.set(0.15, -0.01, d / 2 + 0.006);
    knobTB.userData = {
        interact: true, kind: 'knobTimeDiv',
        tip: 'Base de temps — clic / molette : gamme suivante · clic droit : gamme précédente · Maj+clic : ±3 gammes'
    };
    g.add(knobTB); interactives.push(knobTB);

    const knobCH1 = makeKnob(0.018, 0.014, 0xfacc15);
    knobCH1.position.set(0.10, 0.065, d / 2 + 0.006);
    knobCH1.userData = {
        interact: true, kind: 'knobCH1',
        tip: 'Voie 1 (jaune) — clic / molette : sensibilité V/div · Maj+clic : position verticale de la trace'
    };
    g.add(knobCH1); interactives.push(knobCH1);

    const knobCH2 = makeKnob(0.018, 0.014, 0x38bdf8);
    knobCH2.position.set(0.20, 0.065, d / 2 + 0.006);
    knobCH2.userData = {
        interact: true, kind: 'knobCH2',
        tip: 'Voie 2 (bleue) — clic / molette : sensibilité V/div · Maj+clic : position verticale de la trace'
    };
    g.add(knobCH2); interactives.push(knobCH2);

    const btnAuto = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.018, 0.01),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 }));
    btnAuto.position.set(0.15, -0.08, d / 2 + 0.006);
    btnAuto.userData = {
        interact: true, kind: 'btnOscAuto',
        tip: 'AUTO-SET : cale la base de temps sur 2,5 périodes et adapte les V/div aux signaux mesurés'
    };
    g.add(btnAuto); interactives.push(btnAuto);

    g.add(addAt(makeTerminal('OSC_CH1+', 'CH1 : pointe de sonde (à relier au point mesuré)', 0xfacc15, 'z', g), -0.06, -0.105, d / 2));
    g.add(addAt(makeTerminal('OSC_CH1-', 'CH1 : pince de masse (commune à CH2 !)', 0x1c1f27, 'z', g), -0.12, -0.105, d / 2));
    g.add(addAt(makeTerminal('OSC_CH2+', 'CH2 : pointe de sonde (à relier au point mesuré)', 0x38bdf8, 'z', g), 0.06, -0.105, d / 2));
    g.add(addAt(makeTerminal('OSC_CH2-', 'CH2 : pince de masse (commune à CH1 !)', 0x1c1f27, 'z', g), 0.00, -0.105, d / 2));

    return { group: g, w, h, d };
}

/* ------------------------------------------------------------------ */
/*  3. MAQUETTE DE FILTRES PASSIFS (RC / CR / RC-CR)                    */
/*                                                                      */
/*  Comme une vraie maquette de TP : un PANNEAU PLAT, quatre points de   */
/*  connexion et le schéma SÉRIGRAPHIÉ à leur place exacte.  Aucun        */
/*  composant en relief (R et C sont DESSINÉS avec leurs symboles        */
/*  normalisés).  La sérigraphie est recalculée à chaque changement de   */
/*  filtre (onglets RC / CR / RC-CR de l'interface).                     */
/* ------------------------------------------------------------------ */
let filterBoardCanvas = null, filterBoardCtx = null, filterBoardTex = null;

/* cotes UNIQUES : douilles 3D et dessin en découlent (aucun décalage) */
const FB = { W: 0.42, D: 0.30, H: 0.024, PW: 0.42 * 0.94, PD: 0.30 * 0.94 };
const FB_XIN = -0.16, FB_XOUT = 0.16;        // douilles entrée / sortie
const FB_ZSIG = -0.055, FB_ZRAIL = 0.055;    // ligne de signal (haut) / rail de masse (bas)
const FB_NODES = { RC: [0.02], CR: [0.02], 'RC-CR': [-0.06] };
const FB_SOCKETS = [
    { id: 'TP2_IN+',  x: FB_XIN,  z: FB_ZSIG,  css: '#d93a3a', hex: 0xd93a3a, lab: 'IN+',  dl: -0.030,
      label: 'IN+ : entrée du filtre (à relier à GBF+)' },
    { id: 'TP2_OUT+', x: FB_XOUT, z: FB_ZSIG,  css: '#38bdf8', hex: 0x38bdf8, lab: 'OUT+', dl: -0.030,
      label: 'OUT+ : sortie du filtre (à mesurer sur CH2)' },
    { id: 'TP2_IN-',  x: FB_XIN,  z: FB_ZRAIL, css: '#1c1f27', hex: 0x1c1f27, lab: 'IN−',  dl: +0.032,
      label: 'MASSE : rail commun de la maquette (IN− et OUT−)' },
    { id: 'TP2_OUT-', x: FB_XOUT, z: FB_ZRAIL, css: '#1c1f27', hex: 0x1c1f27, lab: 'OUT−', dl: +0.032,
      label: 'MASSE sortie : même rail que IN−' }
];
const FB_TITRE = {
    RC: 'MAQUETTE FILTRES — PASSE-BAS RC',
    CR: 'MAQUETTE FILTRES — PASSE-HAUT CR',
    'RC-CR': 'MAQUETTE FILTRES — PASSE-BANDE RC-CR'
};
const FB_VALEURS = {
    RC: ['R₁ = 2,2 kΩ en série   ·   C₁ = 22 nF en dérivation', 'fc : à CALCULER (théorie) puis à MESURER (−3 dB)'],
    CR: ['C₁ = 22 nF en série   ·   R₁ = 2,2 kΩ en dérivation', 'fc : à CALCULER (théorie) puis à MESURER (−3 dB)'],
    'RC-CR': ['C₂ = 220 nF en série   ·   R₂ = R₁ = 2,2 kΩ   ·   C₁ = 22 nF', 'fc₁, fc₂, f₀ : à CALCULER (théorie) puis à MESURER']
};

/** Dessine la sérigraphie du filtre choisi (appelée à chaque changement). */
function drawFilterSilk(c2, Wp, Hp, filterType) {
    const M = boardMapper(FB.PW, FB.PD, Wp, Hp);
    const R = M.sx(0.0135);
    const ySig = M.py(FB_ZSIG), yRail = M.py(FB_ZRAIL);
    silkPanel(c2, Wp, Hp);

    /* bandeau du haut : titre + valeurs du filtre actif */
    silkText(c2, FB_TITRE[filterType] || FB_TITRE.RC, Wp / 2, M.py(-0.128),
        { font: '700 26px "Space Grotesk",sans-serif' });
    const val = FB_VALEURS[filterType] || FB_VALEURS.RC;
    silkText(c2, val[0], Wp / 2, M.py(-0.104), { font: '600 18px "JetBrains Mono",monospace', color: '#8c3a12' });
    silkText(c2, val[1], Wp / 2, M.py(-0.084), { font: '500 16px "Space Grotesk",sans-serif', color: SILK.soft });

    /* rail de masse (trait plein : il est interne à la maquette) */
    silkWire(c2, M.px(FB_XIN), yRail, M.px(FB_XOUT), yRail, { color: SILK.ink, lw: 7 });
    silkText(c2, 'rail commun (masse)', Wp / 2, M.py(FB_ZRAIL + 0.017),
        { font: '500 15px "Space Grotesk",sans-serif', color: SILK.soft });

    /* ligne de signal + composants du filtre */
    const node = (x) => ({ px: M.px(x), py: ySig });
    const serie = (x1, x2, kind, nom, valTxt) => {
        silkDipole(c2, M.px(x1), ySig, M.px(x2), ySig, kind,
            { ink: kind === 'C' ? '#1f5f8b' : '#8c3a12', width: M.sx(0.017), body: M.sx(0.048) });
        /* étiquette SOUS la ligne de signal : le bandeau du haut reste lisible */
        silkText(c2, `${nom} ${valTxt}`, (M.px(x1) + M.px(x2)) / 2, ySig + 33,
            { font: '700 18px "JetBrains Mono",monospace', color: kind === 'C' ? '#1f5f8b' : '#8c3a12' });
    };
    const shunt = (x, kind, nom, valTxt) => {
        silkDipole(c2, M.px(x), ySig, M.px(x), yRail, kind,
            { ink: kind === 'C' ? '#1f5f8b' : '#8c3a12', width: M.sx(0.017), body: M.sy(0.052) });
        silkText(c2, `${nom} ${valTxt}`, M.px(x) + 30, (ySig + yRail) / 2,
            { align: 'left', font: '700 18px "JetBrains Mono",monospace', color: kind === 'C' ? '#1f5f8b' : '#8c3a12' });
    };
    const dot = (x) => { c2.beginPath(); c2.arc(M.px(x), ySig, 6, 0, 7); c2.fillStyle = SILK.ink; c2.fill(); };

    if (filterType === 'CR') {
        /* passe-haut : C₁ en série, R₁ en dérivation */
        silkWire(c2, M.px(FB_XIN), ySig, M.px(0.02), ySig, { color: SILK.ink, lw: 6 });
        serie(FB_XIN, 0.02, 'C', 'C₁', '22 nF');
        shunt(0.02, 'R', 'R₁', '2,2 kΩ');
        silkWire(c2, M.px(0.02), ySig, M.px(FB_XOUT), ySig, { color: SILK.ink, lw: 6 });
        dot(0.02);
        silkText(c2, 'Us', M.px(0.095), ySig - 22, { font: '600 17px "Space Grotesk",sans-serif', color: SILK.soft });
    } else if (filterType === 'RC-CR') {
        /* passe-bande : C₂ série → nœud S (R₂ en dérivation) → R₁ série →
           sortie (C₁ en dérivation)                                        */
        silkWire(c2, M.px(FB_XIN), ySig, M.px(-0.06), ySig, { color: SILK.ink, lw: 6 });
        serie(FB_XIN, -0.06, 'C', 'C₂', '220 nF');
        shunt(-0.06, 'R', 'R₂', '2,2 kΩ');
        serie(-0.06, FB_XOUT - 0.055, 'R', 'R₁', '2,2 kΩ');
        /* C₁ est en dérivation sur le NŒUD DE SORTIE (prolongé jusqu'à OUT+) */
        shunt(FB_XOUT - 0.055, 'C', 'C₁', '22 nF');
        silkWire(c2, M.px(FB_XOUT - 0.055), ySig, M.px(FB_XOUT), ySig, { color: SILK.ink, lw: 6 });
        dot(-0.06); dot(FB_XOUT - 0.055);
        silkText(c2, 'S', M.px(-0.06) - 24, ySig - 22, { font: '600 17px "Space Grotesk",sans-serif', color: SILK.soft });
    } else {
        /* passe-bas : R₁ en série, C₁ en dérivation */
        silkWire(c2, M.px(FB_XIN), ySig, M.px(0.02), ySig, { color: SILK.ink, lw: 6 });
        serie(FB_XIN, 0.02, 'R', 'R₁', '2,2 kΩ');
        shunt(0.02, 'C', 'C₁', '22 nF');
        silkWire(c2, M.px(0.02), ySig, M.px(FB_XOUT), ySig, { color: SILK.ink, lw: 6 });
        dot(0.02);
        silkText(c2, 'Us', M.px(0.095), ySig - 22, { font: '600 17px "Space Grotesk",sans-serif', color: SILK.soft });
    }
    silkText(c2, 'Ue', M.px(FB_XIN + 0.028), ySig - 22, { font: '600 17px "Space Grotesk",sans-serif', color: SILK.soft });

    /* douilles + repères (par-dessus les pistes) */
    FB_SOCKETS.forEach(so => {
        silkSocket(c2, M.px(so.x), M.py(so.z), so.css, R);
        silkText(c2, so.lab, M.px(so.x), M.py(so.z + so.dl),
            { font: '700 20px "JetBrains Mono",monospace' });
    });

    /* légende côté élève */
    silkText(c2, 'GBF+ → IN+   ·   GBF− → IN−   ·   CH1 sur Ue (IN+)   ·   CH2 sur Us (OUT+)   ·   masses communes',
        Wp / 2, M.py(0.117), { font: '600 16px "Space Grotesk",sans-serif', color: SILK.soft });
}

/** Redessine la maquette quand l'élève change de filtre (onglets RC/CR/RC-CR). */
export function updateFilterBoardSilkscreen(filterType) {
    if (!filterBoardCtx || !filterBoardCanvas) return;
    drawFilterSilk(filterBoardCtx, filterBoardCanvas.width, filterBoardCanvas.height, filterType);
    filterBoardTex.needsUpdate = true;
}

export function buildFilterBoard() {
    const g = new THREE.Group();
    const w = FB.W, d = FB.D, h = FB.H;

    /* panneau stratifié clair, mat */
    const base = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.005), laminateMat());
    base.castShadow = true; base.receiveShadow = true; g.add(base);
    addFeet(g, w * 0.9, d * 0.88, 0.012, -h / 2, 0.01);

    /* sérigraphie dynamique (canvas conservé pour les changements de filtre) */
    const print = panelPlane(FB.PW, FB.PD, 760, 542, (c2, Wp, Hp) => drawFilterSilk(c2, Wp, Hp, S.tp2Filter || 'RC'));
    filterBoardCanvas = print.canvas; filterBoardCtx = print.ctx; filterBoardTex = print.tex;
    print.mesh.rotation.x = -Math.PI / 2;
    print.mesh.position.y = h / 2 + 0.001;
    g.add(print.mesh);

    /* les douilles : SEULS éléments en relief de la carte */
    FB_SOCKETS.forEach(so => {
        g.add(addAt(makeTerminal(so.id, so.label, so.hex, 'y', g), so.x, h / 2, so.z));
    });

    return { group: g, w, h, d };
}

/* ------------------------------------------------------------------ */
/*  4. Assemblage complet du groupe TP 2                               */
/* ------------------------------------------------------------------ */
export function buildTP2Group() {
    const groupTP2 = new THREE.Group();
    groupTP2.visible = false;
    ctx.scene.add(groupTP2);
    ctx.groupTP2 = groupTP2;

    /* Chaque appareil est posé par placeDevice()/placeFlat() : aplomb MESURÉ
       (dessous des pieds affleurant le plateau), même facteur d'agrandissement
       que le TP 1, face avant tournée vers le centre de la paillasse.        */

    /* l'oscilloscope est l'appareil le plus consulté : on le place au fond de
       la table, écran tourné vers l'élève (qui démarre côté sud).            */
    const osc = buildOscilloscope();
    groupTP2.add(osc.group);
    placeDevice(osc.group, {
        angDeg: 0, w: osc.w, h: osc.h, d: osc.d,
        label: 'Oscilloscope numérique', termIds: ['OSC_CH1+', 'OSC_CH1-', 'OSC_CH2+', 'OSC_CH2-']
    });

    const gbf = buildGBF();
    groupTP2.add(gbf.group);
    placeDevice(gbf.group, {
        angDeg: 62, w: gbf.w, h: gbf.h, d: gbf.d,
        label: 'Générateur basses fréquences', termIds: ['GBF+', 'GBF-']
    });

    /* la maquette de filtres reste à plat au centre, comme la carte du pont */
    const flt = buildFilterBoard();
    groupTP2.add(flt.group);
    placeFlat(flt.group, {
        x: 0, z: 0.02, w: flt.w, h: flt.h, d: flt.d,
        label: 'Maquette de filtres passifs', termIds: ['TP2_IN+', 'TP2_IN-', 'TP2_OUT+', 'TP2_OUT-']
    });

    return groupTP2;
}
